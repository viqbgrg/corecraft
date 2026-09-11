import type {
  BranchComparison,
  BranchTrial,
  EngineFactory,
  ExperimentAction,
  ExperimentView,
  Observation,
} from '../../types/experiment'
import { addLog, createSession } from '../core/session'

export type PredictionStrategy = 'always-not-taken' | 'one-bit' | 'two-bit'
export interface BranchPredictionState {
  strategy: PredictionStrategy
  draft: string
  sequence: boolean[]
  penalty: number
  counter: number
  cursor: number
  pending: { index: number; predicted: boolean } | null
  trials: BranchTrial[]
  comparison: BranchComparison[]
  error: string | null
  log: Observation[]
}

const strategies: { value: PredictionStrategy; label: string }[] = [
  { value: 'always-not-taken', label: '静态 · 总是不跳转' },
  { value: 'one-bit', label: '1 位 · 记住上一次' },
  { value: 'two-bit', label: '2 位 · 饱和计数器' },
]
const loopSequence = 'TTTTNTTTTNTTTTN'
const twoBitLabels = ['00 · 强不跳转', '01 · 弱不跳转', '10 · 弱跳转', '11 · 强跳转']

export function parseBranchSequence(value: string): boolean[] | null {
  const normalized = value.toUpperCase().replace(/[\s,]+/g, '')
  return /^[TN]{1,64}$/.test(normalized) ? [...normalized].map((outcome) => outcome === 'T') : null
}

export function initialBranchPrediction(
  strategy: PredictionStrategy = 'two-bit',
  sequence = loopSequence,
  penalty = 2,
): BranchPredictionState {
  const parsed = parseBranchSequence(sequence)
  if (!parsed || !Number.isInteger(penalty) || penalty < 1 || penalty > 10)
    throw new Error('Branch prediction requires 1–64 T/N outcomes and a penalty of 1–10 cycles')
  return {
    strategy,
    draft: parsed.map((taken) => (taken ? 'T' : 'N')).join(''),
    sequence: parsed,
    penalty,
    counter: strategy === 'two-bit' ? 1 : 0,
    cursor: 0,
    pending: null,
    trials: [],
    comparison: [],
    error: null,
    log: [],
  }
}

function direction(taken: boolean): string {
  return taken ? 'T · 跳转' : 'N · 不跳转'
}

function counterLabel(strategy: PredictionStrategy, counter: number): string {
  if (strategy === 'always-not-taken') return '固定 N'
  if (strategy === 'one-bit') return `${counter} · ${counter ? '跳转' : '不跳转'}`
  return twoBitLabels[counter]!
}

/** Prediction and resolution are separate transitions; only resolution can train the predictor. */
export function branchPredictionStep(state: BranchPredictionState): BranchPredictionState {
  if (state.error || state.cursor === state.sequence.length) return state
  if (!state.pending) {
    const predicted =
      state.strategy === 'one-bit' ? state.counter === 1 : state.strategy === 'two-bit' && state.counter >= 2
    return {
      ...state,
      pending: { index: state.cursor, predicted },
      log: addLog(
        state.log,
        `第 ${state.cursor + 1} 次 · 先预测`,
        `${counterLabel(state.strategy, state.counter)} → 预测 ${direction(predicted)}。此时没有读取本次实际结果，也没有更新预测器。`,
      ),
    }
  }
  const actual = state.sequence[state.cursor]!
  const predicted = state.pending.predicted
  const correct = predicted === actual
  const counter =
    state.strategy === 'one-bit'
      ? Number(actual)
      : state.strategy === 'two-bit'
        ? Math.max(0, Math.min(3, state.counter + (actual ? 1 : -1)))
        : state.counter
  const trial: BranchTrial = {
    index: state.cursor,
    predicted,
    actual,
    before: state.counter,
    after: counter,
    correct,
    penalty: correct ? 0 : state.penalty,
  }
  return {
    ...state,
    counter,
    cursor: state.cursor + 1,
    pending: null,
    trials: [...state.trials, trial],
    log: addLog(
      state.log,
      `第 ${state.cursor + 1} 次 · ${correct ? '预测正确' : '预测失败'}`,
      `实际 ${direction(actual)}；${counterLabel(state.strategy, state.counter)} → ${counterLabel(state.strategy, counter)}。` +
        (correct ? '沿预测方向继续。' : `丢弃错误路径，本模型额外等待 ${state.penalty} 个周期。`),
      correct ? 'success' : 'warning',
    ),
  }
}

export function runBranchPrediction(state: BranchPredictionState): BranchPredictionState {
  let s = state
  while (!s.error && s.cursor < s.sequence.length) s = branchPredictionStep(s)
  return s
}

function normalizedSequence(state: BranchPredictionState): string {
  return state.sequence.map((taken) => (taken ? 'T' : 'N')).join('')
}

export function branchPredictionTransition(
  state: BranchPredictionState,
  action: ExperimentAction,
): BranchPredictionState {
  if (action.type === 'step') return branchPredictionStep(state)
  if (action.type === 'run') return runBranchPrediction(state)
  if (action.type === 'compare') {
    if (state.error) return state
    const comparison = strategies.map((strategy) => {
      const result = runBranchPrediction(
        initialBranchPrediction(strategy.value, normalizedSequence(state), state.penalty),
      )
      const misses = result.trials.filter((trial) => !trial.correct).length
      return {
        label: strategy.label,
        correct: result.cursor - misses,
        misses,
        extraCycles: misses * state.penalty,
      }
    })
    return {
      ...state,
      comparison,
      log: addLog(
        state.log,
        '相同分支序列对照',
        comparison
          .map((row) => `${row.label}：${row.misses} 次失败，额外 ${row.extraCycles} 周期`)
          .join('；') + '。每组独立从初始状态开始，训练过程也计入统计。',
        'success',
      ),
    }
  }
  if (action.type === 'sequence') {
    const draft = String(action.value ?? '')
    if (!parseBranchSequence(draft))
      return {
        ...state,
        draft,
        error: '请输入 1–64 个 T 或 N；可用空格、换行或逗号分隔。T 表示跳转，N 表示不跳转。',
      }
    return initialBranchPrediction(state.strategy, draft, state.penalty)
  }
  if (action.type === 'strategy' && strategies.some((strategy) => strategy.value === action.value))
    return initialBranchPrediction(
      action.value as PredictionStrategy,
      normalizedSequence(state),
      state.penalty,
    )
  if (action.type === 'penalty') {
    const penalty = Number(action.value)
    if (Number.isInteger(penalty) && penalty >= 1 && penalty <= 10)
      return initialBranchPrediction(state.strategy, normalizedSequence(state), penalty)
    return state
  }
  if (action.type === 'loop') return initialBranchPrediction(state.strategy, loopSequence, state.penalty)
  if (action.type === 'alternating')
    return initialBranchPrediction(state.strategy, 'TNTNTNTNTNTN', state.penalty)
  return state
}

export function presentBranchPrediction(s: BranchPredictionState): ExperimentView {
  const last = s.log.at(-1)
  const finished = s.cursor === s.sequence.length
  const misses = s.trials.filter((trial) => !trial.correct).length
  return {
    scene: {
      kind: 'branch-prediction',
      strategy: strategies.find((strategy) => strategy.value === s.strategy)!.label,
      states:
        s.strategy === 'two-bit'
          ? twoBitLabels.map((label, value) => ({ value, label, predicts: value >= 2 }))
          : s.strategy === 'one-bit'
            ? [0, 1].map((value) => ({
                value,
                label: counterLabel(s.strategy, value),
                predicts: value === 1,
              }))
            : [],
      counter: s.counter,
      sequence: s.sequence,
      cursor: s.cursor,
      pending: s.pending,
      trials: s.trials,
      comparison: s.comparison,
      caption: '同一个条件分支的连续执行：先预测，再揭晓并训练。修改输入会重新开始；罚时是教学参数。',
    },
    controls: [
      { id: 'strategy', kind: 'select', label: '预测策略', value: s.strategy, options: strategies },
      { id: 'sequence', kind: 'text', label: '实际分支序列 / T 或 N', value: s.draft },
      { id: 'penalty', kind: 'number', label: '每次失败的额外周期', value: s.penalty, min: 1, max: 10 },
      {
        id: 'step',
        kind: 'button',
        label: finished ? '预测结束' : s.pending ? '揭晓结果并更新预测器' : '先预测下一次分支',
        primary: !finished,
        disabled: finished || !!s.error,
      },
      { id: 'run', kind: 'button', label: '运行剩余分支', disabled: finished || !!s.error },
      { id: 'compare', kind: 'button', label: '对比三种预测策略', disabled: !!s.error },
      { id: 'loop', kind: 'button', label: '循环分支示例' },
      { id: 'alternating', kind: 'button', label: '交替分支示例' },
    ],
    metrics: [
      { label: '已揭晓分支', value: `${s.cursor} / ${s.sequence.length}` },
      {
        label: '预测正确率',
        value: s.cursor ? (((s.cursor - misses) / s.cursor) * 100).toFixed(1) : '—',
        unit: s.cursor ? '%' : undefined,
      },
      { label: '预测失败', value: misses, unit: '次', tone: misses ? 'warning' : 'neutral' },
      { label: '额外周期', value: misses * s.penalty },
    ],
    status: {
      title: s.error ? '分支序列无效' : (last?.label ?? '一次偶然的不跳转，应该改变下一次预测吗？'),
      detail:
        s.error ??
        last?.detail ??
        `从 ${counterLabel(s.strategy, s.counter)} 开始。先预测，再揭晓结果；观察一次 N 是否改变下一次预测方向。`,
      tone: s.error ? 'danger' : (last?.tone ?? 'neutral'),
    },
    log: s.log,
    goal: {
      label: '完成一组分支预测，并用相同序列对比三种策略的误判次数和额外周期。',
      reached: !s.error && finished && s.comparison.length === 3,
    },
  }
}

export const branchPredictionEngine: EngineFactory = (config) => {
  const strategy = config.strategy ?? 'two-bit'
  const sequence = config.sequence ?? loopSequence
  const penalty = config.penalty ?? 2
  if (
    !strategies.some((item) => item.value === strategy) ||
    typeof sequence !== 'string' ||
    typeof penalty !== 'number'
  )
    throw new Error('Unsupported branch prediction configuration')
  return createSession(
    () => initialBranchPrediction(strategy as PredictionStrategy, sequence, penalty),
    branchPredictionTransition,
    presentBranchPrediction,
  )
}
