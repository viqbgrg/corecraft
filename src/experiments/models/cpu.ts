import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession, hex, integer } from '../core/session'

type Register = 'R1' | 'R2' | 'R3'
type Instruction = { op: 'MOV'; target: Register; value: number } | { op: 'ADD'; target: Register; source: Register } | { op: 'STORE'; address: number; source: Register } | { op: 'LOAD'; target: Register; address: number } | { op: 'HALT' }
type WriteBack = { kind: 'register'; register: Register; value: number } | { kind: 'memory'; address: number; value: number } | { kind: 'halt' } | null
export interface CpuState {
  phase: 'Fetch' | 'Decode' | 'Execute' | 'Write Back' | 'Halted'
  pc: number
  ir: Instruction | null
  active: number | null
  registers: Record<Register, number>
  memory: Record<number, number>
  pending: WriteBack
  alu: string
  retired: number
  cycles: number
  program: Instruction[]
  example: string
  a: number
  b: number
  log: Observation[]
}
function program(a: number, b: number, example: string): Instruction[] {
  const code: Instruction[] = [{ op: 'MOV', target: 'R1', value: a }, { op: 'MOV', target: 'R2', value: b }, { op: 'ADD', target: 'R1', source: 'R2' }]
  if (example === 'memory') code.push({ op: 'STORE', address: 16, source: 'R1' }, { op: 'LOAD', target: 'R3', address: 16 })
  return [...code, { op: 'HALT' }]
}
export function initialCpu(a = 10, b = 20, example = 'memory'): CpuState {
  return { phase: 'Fetch', pc: 0, ir: null, active: null, registers: { R1: 0, R2: 0, R3: 0 }, memory: { 16: 0, 17: 0 }, pending: null, alu: '等待操作数', retired: 0, cycles: 0, program: program(a, b, example), example, a, b, log: [] }
}
function format(i: Instruction): string {
  if (i.op === 'MOV') return 'MOV ' + i.target + ', ' + i.value
  if (i.op === 'ADD') return 'ADD ' + i.target + ', ' + i.source
  if (i.op === 'LOAD') return 'LOAD ' + i.target + ', [' + hex(i.address, 2) + ']'
  if (i.op === 'STORE') return 'STORE [' + hex(i.address, 2) + '], ' + i.source
  return 'HALT'
}
export function cpuStep(state: CpuState): CpuState {
  if (state.phase === 'Halted') return state
  const s = structuredClone(state)
  const stage = s.phase
  let detail = ''
  if (stage === 'Fetch') {
    s.ir = s.program[s.pc] ?? { op: 'HALT' }
    s.active = s.pc
    s.pc += 1
    s.phase = 'Decode'
    detail = '从指令内存取出 ' + format(s.ir) + '；PC 先指向下一条指令 ' + s.pc + '。'
  } else if (stage === 'Decode') {
    s.phase = 'Execute'
    detail = '识别操作码和操作数：' + (s.ir ? format(s.ir) : '') + '。寄存器还没有变化。'
  } else if (stage === 'Execute' && s.ir) {
    const i = s.ir
    if (i.op === 'MOV') { s.pending = { kind: 'register', register: i.target, value: i.value }; s.alu = '直通 ' + i.value }
    if (i.op === 'ADD') {
      const result = (s.registers[i.target] + s.registers[i.source]) & 0xffff
      s.alu = s.registers[i.target] + ' + ' + s.registers[i.source] + ' = ' + result
      s.pending = { kind: 'register', register: i.target, value: result }
    }
    if (i.op === 'STORE') { s.pending = { kind: 'memory', address: i.address, value: s.registers[i.source] }; s.alu = '地址 ' + hex(i.address, 2) }
    if (i.op === 'LOAD') { s.pending = { kind: 'register', register: i.target, value: s.memory[i.address] ?? 0 }; s.alu = '读取 ' + hex(i.address, 2) }
    if (i.op === 'HALT') { s.pending = { kind: 'halt' }; s.alu = '停止信号' }
    s.phase = 'Write Back'
    detail = '执行 ' + i.op + '，暂存结果。ALU：' + s.alu + '。等待写回。'
  } else if (stage === 'Write Back') {
    const p = s.pending
    if (p?.kind === 'register') s.registers[p.register] = p.value
    if (p?.kind === 'memory') s.memory[p.address] = p.value
    s.phase = p?.kind === 'halt' ? 'Halted' : 'Fetch'
    s.retired += 1
    s.pending = null
    detail = p?.kind === 'register' ? p.register + ' ← ' + p.value : p?.kind === 'memory' ? 'Memory[' + hex(p.address, 2) + '] ← ' + p.value : '程序结束。'
  }
  s.cycles += 1
  s.log = addLog(s.log, stage, detail, stage === 'Write Back' ? 'success' : 'neutral')
  return s
}
export function transitionCpu(s: CpuState, action: ExperimentAction): CpuState {
  if (action.type === 'step') return cpuStep(s)
  if (action.type === 'instruction') {
    let next = cpuStep(s)
    while (next.phase !== 'Fetch' && next.phase !== 'Halted') next = cpuStep(next)
    return next
  }
  if (s.cycles > 0) return s
  if (action.type === 'a') return initialCpu(integer(action.value, 0, 255, s.a), s.b, s.example)
  if (action.type === 'b') return initialCpu(s.a, integer(action.value, 0, 255, s.b), s.example)
  if (action.type === 'example' && ['arithmetic', 'memory'].includes(String(action.value))) return initialCpu(s.a, s.b, String(action.value))
  return s
}
export function presentCpu(s: CpuState): ExperimentView {
  return {
    scene: { kind: 'cpu', phase: s.phase, pc: s.pc, activeInstruction: s.active, registers: s.registers, instruction: s.ir ? format(s.ir) : '尚未取指', alu: s.alu, program: s.program.map(format), memory: Object.entries(s.memory).map(([a, value]) => ({ address: Number(a), value })), halted: s.phase === 'Halted' },
    controls: [
      { id: 'a', kind: 'number', label: 'MOV R1 的值', value: s.a, min: 0, max: 255, disabled: s.cycles > 0 },
      { id: 'b', kind: 'number', label: 'MOV R2 的值', value: s.b, min: 0, max: 255, disabled: s.cycles > 0 },
      { id: 'example', kind: 'select', label: '示例程序', value: s.example, options: [{ value: 'arithmetic', label: '寄存器加法' }, { value: 'memory', label: '加法 → 存储 → 读取' }], disabled: s.cycles > 0 },
      { id: 'step', kind: 'button', label: s.phase === 'Halted' ? '执行结束' : '单步 · ' + s.phase, primary: true, disabled: s.phase === 'Halted' },
      { id: 'instruction', kind: 'button', label: '执行完当前指令', disabled: s.phase === 'Halted' },
    ],
    metrics: [{ label: 'Program Counter', value: s.pc }, { label: '已完成指令', value: s.retired }, { label: '教学微步骤', value: s.cycles }, { label: 'R1', value: s.registers.R1 }],
    status: { title: s.phase === 'Halted' ? '指令变成了状态变化。' : '下一步：' + s.phase, detail: s.log.at(-1)?.detail ?? '先取指，再译码、执行、写回。点击单步，观察寄存器究竟在哪一步改变。', tone: s.phase === 'Halted' ? 'success' : 'neutral' },
    log: s.log,
    goal: { label: '逐步运行整个程序，观察 ADD 的执行与写回。', reached: s.phase === 'Halted' },
  }
}
export const cpuEngine: EngineFactory = (config) => createSession(() => initialCpu(integer(typeof config.a === 'number' ? config.a : 10, 0, 255, 10)), transitionCpu, presentCpu)
