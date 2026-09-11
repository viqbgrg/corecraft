import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type MachineInstruction =
  { op: 'IN' | 'OUT' | 'HALT' } | { op: 'SET' | 'ADD' | 'SUB' | 'JNZ'; operand: number }
export interface ModelingState {
  draft: string
  program: MachineInstruction[]
  input: number
  accumulator: number
  pc: number
  steps: number
  output: number[]
  outputCount: number
  halted: boolean
  guess: number
  predictions: number
  correct: number
  error: string | null
  paused: boolean
  log: Observation[]
}
const example = 'IN; OUT; SUB 1; JNZ 1; HALT'
export function parseMachineProgram(draft: string): MachineInstruction[] | null {
  const lines = draft
    .toUpperCase()
    .split(/[;\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length || lines.length > 16) return null
  const program: MachineInstruction[] = []
  for (const line of lines) {
    if (/^(IN|OUT|HALT)$/.test(line)) {
      program.push({ op: line as 'IN' | 'OUT' | 'HALT' })
      continue
    }
    const match = /^(SET|ADD|SUB|JNZ)\s+(-?\d+)$/.exec(line)
    if (!match) return null
    const operand = Number(match[2])
    if (
      match[1] === 'JNZ'
        ? boundedInteger(operand, 0, lines.length - 1) === null
        : boundedInteger(operand, -99, 99) === null
    )
      return null
    program.push({ op: match[1] as 'SET' | 'ADD' | 'SUB' | 'JNZ', operand })
  }
  return program
}
export function initialModeling(draft = example, input = 3): ModelingState {
  const program = parseMachineProgram(draft)
  if (!program || boundedInteger(input, -99, 99) === null)
    throw new Error('Machine requires 1–16 IN/OUT/SET/ADD/SUB/JNZ/HALT instructions and input -99–99')
  return {
    draft,
    program,
    input,
    accumulator: 0,
    pc: 0,
    steps: 0,
    output: [],
    outputCount: 0,
    halted: false,
    guess: input,
    predictions: 0,
    correct: 0,
    error: null,
    paused: false,
    log: [],
  }
}
export function machineStep(state: ModelingState, predict = false): ModelingState {
  if (state.halted || state.error) return state
  const instruction = state.program[state.pc]
  if (!instruction)
    return { ...state, error: 'PC 已越过程序末尾；请加入 HALT 或修正跳转。程序修改后重新开始。' }
  const s = { ...state, pc: state.pc + 1, steps: state.steps + 1, paused: false }
  switch (instruction.op) {
    case 'IN':
      s.accumulator = s.input
      break
    case 'SET':
      s.accumulator = instruction.operand
      break
    case 'ADD':
      s.accumulator += instruction.operand
      break
    case 'SUB':
      s.accumulator -= instruction.operand
      break
    case 'JNZ':
      if (s.accumulator !== 0) s.pc = instruction.operand
      break
    case 'OUT':
      s.output = [...s.output, s.accumulator].slice(-32)
      s.outputCount++
      break
    case 'HALT':
      s.halted = true
      s.pc = state.pc
      break
  }
  if (!Number.isSafeInteger(s.accumulator))
    return { ...state, error: '累加器超出 JavaScript 安全整数范围；请缩小计算规模。' }
  if (predict) {
    s.predictions++
    if (s.guess === s.accumulator) s.correct++
  }
  const operation = instruction.op + ('operand' in instruction ? ` ${instruction.operand}` : '')
  s.log = addLog(
    s.log,
    `${state.pc}: ${operation}`,
    `ACC ${state.accumulator} → ${s.accumulator}，PC ${state.pc} → ${s.pc}。${predict ? `预测 ${s.guess}，${s.guess === s.accumulator ? '与观察一致' : '被本次观察否定'}。` : ''}${instruction.op === 'OUT' ? `输出 ${s.accumulator}。` : ''}`,
    predict && s.guess !== s.accumulator ? 'warning' : s.halted ? 'success' : 'neutral',
  )
  return s
}
export function modelingTransition(s: ModelingState, a: ExperimentAction): ModelingState {
  if (a.type === 'program') {
    const draft = String(a.value ?? '')
    return parseMachineProgram(draft)
      ? initialModeling(draft, s.input)
      : {
          ...s,
          draft,
          error:
            '程序由 1–16 条指令组成，用分号分隔。支持 IN、OUT、HALT、SET/ADD/SUB -99..99、JNZ 有效行号。',
        }
  }
  if (a.type === 'input') {
    const input = boundedInteger(a.value, -99, 99)
    if (input !== null && parseMachineProgram(s.draft)) return initialModeling(s.draft, input)
  }
  if (a.type === 'guess') {
    const guess = boundedInteger(a.value, -99999, 99999)
    return guess === null ? s : { ...s, guess }
  }
  if (a.type === 'step') return machineStep(s)
  if (a.type === 'predict') return machineStep(s, true)
  if (a.type === 'run' && !s.error && !s.halted) {
    let result = s
    for (let i = 0; i < 200 && !result.error && !result.halted; i++) result = machineStep(result)
    if (!result.error && !result.halted)
      result = {
        ...result,
        paused: true,
        log: addLog(
          result.log,
          '本轮运行已暂停',
          '推进了 200 步，尚未执行 HALT。暂停是界面的运行预算，不代表已经证明程序会终止。可单步、继续运行或修改程序。',
          'warning',
        ),
      }
    return result
  }
  return s
}
export function presentModeling(s: ModelingState): ExperimentView {
  return {
    scene: {
      kind: 'data',
      title: '输入 → 状态 → 指令 → 输出',
      cards: [
        { id: 'input', label: '输入数据', value: s.input },
        { id: 'acc', label: '累加器 ACC', value: s.accumulator },
        { id: 'pc', label: '程序计数器 PC', value: s.pc },
        { id: 'out', label: '输出流（最近 32 项）', value: s.output.join(', ') || '空' },
      ],
      tables: [
        {
          id: 'machine-program',
          title: '程序是状态转换规则',
          columns: ['行号', '指令', '执行位置'],
          rows: s.program.map((instruction, i) => ({
            id: String(i),
            values: [
              i,
              instruction.op + ('operand' in instruction ? ` ${instruction.operand}` : ''),
              i === s.pc ? (s.halted ? '停机位置' : '下一条') : '—',
            ],
            tone: i === s.pc ? 'warning' : 'neutral',
          })),
        },
      ],
      caption:
        'IN 读取固定输入，OUT 追加输出，JNZ 在 ACC 非零时跳到指定行。程序和数据在本模型中分开表示；状态快照决定下一步，不由动画决定。',
    },
    metrics: [
      { label: '已执行指令', value: s.steps },
      { label: '输出项数', value: s.outputCount },
      { label: '正确预测 / 总预测', value: `${s.correct} / ${s.predictions}` },
      {
        label: '机器状态',
        value: s.error ? '输入或执行错误' : s.halted ? 'HALT' : s.paused ? '预算暂停' : '可继续',
      },
    ],
    controls: [
      { id: 'program', kind: 'text', label: '程序 / 分号分隔指令', value: s.draft },
      { id: 'input', kind: 'number', label: '输入数据', value: s.input, min: -99, max: 99 },
      { id: 'guess', kind: 'number', label: '预测下一步 ACC', value: s.guess, min: -99999, max: 99999 },
      {
        id: 'predict',
        kind: 'button',
        label: '验证预测并单步',
        primary: true,
        disabled: s.halted || !!s.error,
      },
      { id: 'step', kind: 'button', label: '只执行下一条指令', disabled: s.halted || !!s.error },
      { id: 'run', kind: 'button', label: '运行至 HALT / 最多 200 步', disabled: s.halted || !!s.error },
    ],
    status: {
      title: s.error
        ? '检查程序'
        : s.halted
          ? '程序已停机'
          : s.paused
            ? '观察运行边界'
            : '先提出一个可验证的预测',
      detail:
        s.error ?? s.log.at(-1)?.detail ?? '默认输入 3。先预测 IN 执行后的 ACC，再观察输出是否为 3、2、1。',
      tone: s.error ? 'danger' : s.paused ? 'warning' : s.halted ? 'success' : 'neutral',
    },
    goal: {
      label: '正确预测至少一次状态变化，让程序产生输出并执行到 HALT。',
      reached: !s.error && s.correct > 0 && s.outputCount > 0 && s.halted,
    },
    log: s.log,
  }
}
export const modelingEngine: EngineFactory = (config) =>
  createSession(
    () => initialModeling(String(config.program ?? example), Number(config.input ?? 3)),
    modelingTransition,
    presentModeling,
  )
