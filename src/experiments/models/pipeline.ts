import type {
  EngineFactory,
  ExperimentAction,
  ExperimentView,
  Observation,
  PipelineComparison,
  PipelineCycle,
  PipelineStage,
} from '../../types/experiment'
import { addLog, createSession, hex } from '../core/session'

type Register = 'R1' | 'R2' | 'R3' | 'R4'
export type PipelineInstruction =
  | { op: 'MOV'; target: Register; value: number }
  | { op: 'ADD'; target: Register; left: Register; right: Register }
  | { op: 'LOAD'; target: Register; address: number }
  | { op: 'STORE'; source: Register; address: number }
type Example = 'independent' | 'dependency' | 'load-use'
type Mode = 'pipeline' | 'serial'
interface Flight {
  index: number
  result: number | null
  storeValue: number | null
}
type Stages = [Flight | null, Flight | null, Flight | null, Flight | null, Flight | null]
export interface PipelineState {
  example: Example
  mode: Mode
  forwarding: boolean
  program: PipelineInstruction[]
  stages: Stages
  pc: number
  cycles: number
  retired: number
  stalls: number
  registers: Record<Register, number>
  memory: Record<number, number>
  history: PipelineCycle[]
  comparison: PipelineComparison[]
  log: Observation[]
}

const stageNames: PipelineStage[] = ['IF', 'ID', 'EX', 'MEM', 'WB']
const examples: { value: Example; label: string }[] = [
  { value: 'independent', label: '互不依赖的指令' },
  { value: 'dependency', label: '连续的数据依赖' },
  { value: 'load-use', label: 'LOAD 后立即使用' },
]

function program(example: Example): PipelineInstruction[] {
  if (example === 'independent')
    return [
      { op: 'MOV', target: 'R1', value: 5 },
      { op: 'MOV', target: 'R2', value: 7 },
      { op: 'MOV', target: 'R3', value: 11 },
      { op: 'MOV', target: 'R4', value: 13 },
    ]
  if (example === 'dependency')
    return [
      { op: 'MOV', target: 'R1', value: 5 },
      { op: 'ADD', target: 'R2', left: 'R1', right: 'R1' },
      { op: 'ADD', target: 'R3', left: 'R2', right: 'R1' },
      { op: 'ADD', target: 'R4', left: 'R3', right: 'R2' },
    ]
  return [
    { op: 'LOAD', target: 'R1', address: 16 },
    { op: 'ADD', target: 'R2', left: 'R1', right: 'R1' },
    { op: 'ADD', target: 'R3', left: 'R2', right: 'R1' },
    { op: 'STORE', source: 'R3', address: 17 },
  ]
}

export function initialPipeline(
  example: Example = 'load-use',
  mode: Mode = 'pipeline',
  forwarding = true,
): PipelineState {
  return {
    example,
    mode,
    forwarding,
    program: program(example),
    stages: [null, null, null, null, null],
    pc: 0,
    cycles: 0,
    retired: 0,
    stalls: 0,
    registers: { R1: 0, R2: 0, R3: 0, R4: 0 },
    memory: { 16: 21, 17: 0 },
    history: [],
    comparison: [],
    log: [],
  }
}

function format(instruction: PipelineInstruction): string {
  if (instruction.op === 'MOV') return `MOV ${instruction.target}, ${instruction.value}`
  if (instruction.op === 'ADD') return `ADD ${instruction.target}, ${instruction.left}, ${instruction.right}`
  if (instruction.op === 'LOAD') return `LOAD ${instruction.target}, [${hex(instruction.address, 2)}]`
  return `STORE [${hex(instruction.address, 2)}], ${instruction.source}`
}

function sources(instruction: PipelineInstruction): Register[] {
  if (instruction.op === 'ADD') return [...new Set([instruction.left, instruction.right])]
  return instruction.op === 'STORE' ? [instruction.source] : []
}

function writes(state: PipelineState, flight: Flight | null, register: Register): boolean {
  if (!flight) return false
  const instruction = state.program[flight.index]!
  return instruction.op !== 'STORE' && instruction.target === register
}

function hazard(state: PipelineState): string | null {
  const decoding = state.stages[1]
  if (!decoding) return null
  for (const register of sources(state.program[decoding.index]!)) {
    // The nearest older writer wins, even if another instruction writes the same register.
    const producer = [state.stages[2], state.stages[3]].find((flight) => writes(state, flight, register))
    if (!producer) continue
    if (!state.forwarding) return `I${decoding.index + 1} 等待 ${register} 写回；IF / ID 保持，EX 插入气泡。`
    if (producer === state.stages[2] && state.program[producer.index]!.op === 'LOAD')
      return `I${decoding.index + 1} 需要 ${register}，但 LOAD 的数据在 MEM 结束后才可转发；暂停 1 个周期。`
  }
  return null
}

function operand(state: PipelineState, register: Register): number {
  if (state.forwarding) {
    for (const flight of [state.stages[2], state.stages[3]])
      if (writes(state, flight, register) && flight?.result !== null && flight?.result !== undefined)
        return flight.result
  }
  return state.registers[register]
}

/** A snapshot shows the stages that executed in that cycle; WB has already committed. */
export function pipelineStep(state: PipelineState): PipelineState {
  if (state.retired === state.program.length) return state
  const s = structuredClone(state)
  const next: Stages = [null, null, null, null, null]
  const waiting = state.mode === 'pipeline' ? hazard(state) : null
  const events: string[] = []

  const writeBack = s.stages[3]
  if (writeBack) {
    const instruction = s.program[writeBack.index]!
    if (instruction.op !== 'STORE') s.registers[instruction.target] = writeBack.result!
    s.retired += 1
    next[4] = writeBack
    events.push(
      `I${writeBack.index + 1} 完成 WB${instruction.op === 'STORE' ? '' : `，${instruction.target} ← ${writeBack.result}`}。`,
    )
  }

  const memory = s.stages[2]
  if (memory) {
    const instruction = s.program[memory.index]!
    if (instruction.op === 'LOAD') {
      memory.result = s.memory[instruction.address] ?? 0
      events.push(`I${memory.index + 1} 在 MEM 读到 ${memory.result}，下一周期可以转发。`)
    }
    if (instruction.op === 'STORE') {
      s.memory[instruction.address] = memory.storeValue!
      events.push(`Memory[${hex(instruction.address, 2)}] ← ${memory.storeValue}。`)
    }
    next[3] = memory
  }

  if (waiting) {
    next[0] = s.stages[0]
    next[1] = s.stages[1]
    s.stalls += 1
    events.push(waiting)
  } else {
    const executing = s.stages[1]
    if (executing) {
      const instruction = s.program[executing.index]!
      if (instruction.op === 'MOV') executing.result = instruction.value & 0xffff
      if (instruction.op === 'ADD')
        executing.result = (operand(state, instruction.left) + operand(state, instruction.right)) & 0xffff
      if (instruction.op === 'STORE') executing.storeValue = operand(state, instruction.source)
      if (s.forwarding) {
        const forwarded = sources(instruction).filter((register) =>
          [state.stages[2], state.stages[3]].some((flight) => writes(state, flight, register)),
        )
        if (forwarded.length)
          events.push(`I${executing.index + 1} 的 EX 通过转发读取 ${forwarded.join('、')}。`)
      }
      next[2] = executing
    }
    next[1] = s.stages[0]
    const canFetch = s.mode === 'pipeline' || next.every((flight) => flight === null)
    if (canFetch && s.pc < s.program.length) {
      next[0] = { index: s.pc, result: null, storeValue: null }
      s.pc += 1
    }
  }

  s.cycles += 1
  s.stages = next
  s.history.push({ cycle: s.cycles, stages: next.map((flight) => flight?.index ?? null), stalled: !!waiting })
  s.log = addLog(
    s.log,
    `周期 ${s.cycles}${waiting ? ' · 数据冒险' : ''}`,
    events.join(' ') || '各指令推进一个阶段；本周期尚无结果写回。',
    waiting ? 'warning' : s.retired === s.program.length ? 'success' : 'neutral',
  )
  return s
}

export function runPipeline(state: PipelineState): PipelineState {
  let s = state
  while (s.retired < s.program.length) s = pipelineStep(s)
  return s
}

export function pipelineTransition(state: PipelineState, action: ExperimentAction): PipelineState {
  if (action.type === 'step') return pipelineStep(state)
  if (action.type === 'run') return runPipeline(state)
  if (action.type === 'compare') {
    const variants = [
      { label: '顺序执行', mode: 'serial', forwarding: false },
      { label: '流水线 · 无转发', mode: 'pipeline', forwarding: false },
      { label: '流水线 · 有转发', mode: 'pipeline', forwarding: true },
    ] as const
    const comparison = variants.map((variant) => {
      const result = runPipeline(initialPipeline(state.example, variant.mode, variant.forwarding))
      return { label: variant.label, cycles: result.cycles, stalls: result.stalls }
    })
    return {
      ...state,
      comparison,
      log: addLog(
        state.log,
        '相同程序对照',
        comparison.map((row) => `${row.label}：${row.cycles} 周期，${row.stalls} 次停顿`).join('；') +
          '。每组从相同寄存器与内存开始。',
        'success',
      ),
    }
  }
  let next: PipelineState | null = null
  if (action.type === 'example' && examples.some((example) => example.value === action.value))
    next = initialPipeline(action.value as Example, state.mode, state.forwarding)
  if (action.type === 'mode' && (action.value === 'pipeline' || action.value === 'serial'))
    next = initialPipeline(state.example, action.value, state.forwarding)
  if (action.type === 'forwarding' && (action.value === 'on' || action.value === 'off'))
    next = initialPipeline(state.example, state.mode, action.value === 'on')
  return next ?? state
}

export function presentPipeline(s: PipelineState): ExperimentView {
  const last = s.log.at(-1)
  const finished = s.retired === s.program.length
  const stalled = s.history.at(-1)?.stalled ?? false
  return {
    scene: {
      kind: 'instruction-pipeline',
      cycle: s.cycles,
      program: s.program.map(format),
      stages: stageNames.map((name, index) => ({
        name,
        instruction: s.stages[index]?.index ?? null,
        note: stalled && index < 2 ? '保持' : stalled && index === 2 ? '气泡' : '',
      })),
      history: s.history,
      registers: { ...s.registers },
      memory: Object.entries(s.memory).map(([address, value]) => ({ address: Number(address), value })),
      comparison: s.comparison,
      caption:
        'IF 取指 → ID 译码 → EX 执行 → MEM 访存 → WB 写回。图中为本周期完成的阶段；切换输入会重新开始。',
    },
    controls: [
      { id: 'example', kind: 'select', label: '指令程序', value: s.example, options: examples },
      {
        id: 'mode',
        kind: 'select',
        label: '执行方式',
        value: s.mode,
        options: [
          { value: 'pipeline', label: '五级流水线' },
          { value: 'serial', label: '顺序执行' },
        ],
      },
      {
        id: 'forwarding',
        kind: 'select',
        label: '数据转发',
        value: s.forwarding ? 'on' : 'off',
        disabled: s.mode === 'serial',
        options: [
          { value: 'on', label: '开启转发' },
          { value: 'off', label: '关闭转发' },
        ],
      },
      {
        id: 'step',
        kind: 'button',
        label: finished ? '执行结束' : '推进 1 个周期',
        primary: !finished,
        disabled: finished,
      },
      { id: 'run', kind: 'button', label: '运行至结束', disabled: finished },
      { id: 'compare', kind: 'button', label: '对比三种执行方式' },
    ],
    metrics: [
      { label: '时钟周期', value: s.cycles },
      { label: '已完成指令', value: `${s.retired} / ${s.program.length}` },
      { label: '数据停顿', value: s.stalls, unit: '周期', tone: s.stalls ? 'warning' : 'neutral' },
      { label: 'IPC · 已完成 / 周期', value: s.cycles ? (s.retired / s.cycles).toFixed(2) : '—' },
    ],
    status: {
      title: last?.label ?? '多条指令，可以同时处于不同阶段吗？',
      detail: last?.detail ?? '先逐周期观察 LOAD 后的停顿，再关闭转发，比较相同程序需要等待多久。',
      tone: last?.tone ?? 'neutral',
    },
    log: s.log,
    goal: {
      label: '执行完一组指令，并对比顺序执行、无转发和有转发流水线的周期数。',
      reached: finished && s.comparison.length === 3,
    },
  }
}

export const pipelineEngine: EngineFactory = (config) => {
  const example = config.example ?? 'load-use'
  const mode = config.mode ?? 'pipeline'
  const forwarding = config.forwarding ?? true
  if (
    !examples.some((item) => item.value === example) ||
    (mode !== 'pipeline' && mode !== 'serial') ||
    typeof forwarding !== 'boolean'
  )
    throw new Error('Unsupported pipeline configuration')
  return createSession(
    () => initialPipeline(example as Example, mode, forwarding),
    pipelineTransition,
    presentPipeline,
  )
}
