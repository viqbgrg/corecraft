import type {
  Control,
  EngineFactory,
  ExperimentAction,
  ExperimentView,
  Observation,
} from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type ModelingRule = 'add' | 'double' | 'add-double' | 'double-add'
type Operation = 'read' | 'add' | 'double' | 'show'
const ruleOperations: Record<ModelingRule, Operation[]> = {
  add: ['add'],
  double: ['double'],
  'add-double': ['add', 'double'],
  'double-add': ['double', 'add'],
}

export interface ModelingState {
  input: number
  amount: number
  rule: ModelingRule
  current: number | null
  step: number
  output: number | null
  guess: number | null
  predictions: number
  correct: number
  error: string | null
  log: Observation[]
}

function isModelingRule(value: unknown): value is ModelingRule {
  return typeof value === 'string' && Object.hasOwn(ruleOperations, value)
}

function operations(s: ModelingState): Operation[] {
  return ['read', ...ruleOperations[s.rule], 'show']
}

function operationLabel(operation: Operation, amount: number): string {
  switch (operation) {
    case 'read':
      return '读入输入的数字'
    case 'add':
      return `把记住的数加上 ${amount}`
    case 'double':
      return '把记住的数乘以 2'
    case 'show':
      return '把记住的数显示出来'
  }
}

export function initialModeling(input = 3, amount = 2, rule: ModelingRule = 'add'): ModelingState {
  if (
    boundedInteger(input, 0, 20) === null ||
    boundedInteger(amount, 0, 10) === null ||
    !isModelingRule(rule)
  )
    throw new Error('Modeling requires input 0–20, amount 0–10 and a supported rule')
  return {
    input,
    amount,
    rule,
    current: null,
    step: 0,
    output: null,
    guess: null,
    predictions: 0,
    correct: 0,
    error: null,
    log: [],
  }
}

export function modelingStep(s: ModelingState, predict = false): ModelingState {
  const operation = operations(s)[s.step]
  if (!operation || s.error || (predict && s.guess === null)) return s
  let current = s.current
  let output = s.output
  let detail: string
  if (operation === 'read') {
    current = s.input
    detail = `把输入 ${s.input} 记下来，供后面的步骤使用。读取本身没有做加法或乘法。`
  } else {
    if (current === null) return s
    if (operation === 'show') {
      output = current
      detail = `把记住的 ${current} 显示为输出。显示结果时，记住的数仍是 ${current}。`
    } else {
      current = operation === 'add' ? current + s.amount : current * 2
      detail = `${s.current} ${operation === 'add' ? `+ ${s.amount}` : '× 2'} = ${current}。现在记住 ${current}，供下一步使用；输出还没有显示。`
    }
  }
  const correct = predict && s.guess === current
  if (predict)
    detail += ` 你预测的是 ${s.guess}，${correct ? '与观察一致' : `这一步实际记住的是 ${current}，可以对照规则再想一想`}。`
  return {
    ...s,
    current,
    output,
    step: s.step + 1,
    guess: null,
    predictions: s.predictions + Number(predict),
    correct: s.correct + Number(correct),
    log: addLog(
      s.log,
      `第 ${s.step + 1} 步：${operationLabel(operation, s.amount)}`,
      detail,
      predict && !correct ? 'warning' : output !== null ? 'success' : 'neutral',
    ),
  }
}

export function modelingTransition(s: ModelingState, a: ExperimentAction): ModelingState {
  if (a.type === 'input' || a.type === 'amount') {
    const max = a.type === 'input' ? 20 : 10
    const value = boundedInteger(a.value, 0, max)
    if (value === null)
      return { ...s, error: `${a.type === 'input' ? '输入的数字' : '加多少'}需要是 0–${max} 的整数。` }
    return initialModeling(
      a.type === 'input' ? value : s.input,
      a.type === 'amount' ? value : s.amount,
      s.rule,
    )
  }
  if (a.type === 'rule') {
    return isModelingRule(a.value)
      ? initialModeling(s.input, s.amount, a.value)
      : { ...s, error: '请选择列表中的处理规则。' }
  }
  if (a.type === 'guess') {
    if (String(a.value ?? '').trim() === '') return { ...s, guess: null, error: null }
    const guess = boundedInteger(a.value, 0, 99)
    return guess === null ? { ...s, error: '请用 0–99 的整数填写预测。' } : { ...s, guess, error: null }
  }
  if (a.type === 'step') return modelingStep(s)
  if (a.type === 'predict') return modelingStep(s, true)
  if (a.type === 'run') {
    let result = s
    for (let i = s.step; i < operations(s).length; i++) result = modelingStep(result)
    return result
  }
  if (a.type === 'restart') return initialModeling(s.input, s.amount, s.rule)
  return s
}

export function presentModeling(s: ModelingState): ExperimentView {
  const steps = operations(s)
  const finished = s.step === steps.length
  const disabled = finished || !!s.error
  const controls: Control[] = [
    { id: 'input', kind: 'number', label: '输入的数字', value: s.input, min: 0, max: 20 },
    {
      id: 'rule',
      kind: 'select',
      label: '处理规则',
      value: s.rule,
      options: [
        { value: 'add', label: '加一个数' },
        { value: 'double', label: '乘以 2' },
        { value: 'add-double', label: '先加，再乘以 2（进阶）' },
        { value: 'double-add', label: '先乘以 2，再加（进阶）' },
      ],
    },
  ]
  if (ruleOperations[s.rule].includes('add'))
    controls.push({ id: 'amount', kind: 'number', label: '加多少', value: s.amount, min: 0, max: 10 })
  controls.push(
    {
      id: 'guess',
      kind: 'number',
      label: '预测下一步记住的数',
      value: s.guess ?? '',
      min: 0,
      max: 99,
      disabled: finished,
    },
    { id: 'step', kind: 'button', label: '执行下一步', primary: s.guess === null, disabled },
    {
      id: 'predict',
      kind: 'button',
      label: '验证预测并执行下一步',
      primary: s.guess !== null,
      disabled: disabled || s.guess === null,
    },
    { id: 'run', kind: 'button', label: '完成剩余步骤', disabled },
  )
  if (finished) controls.push({ id: 'restart', kind: 'button', label: '用相同设置再试一次' })
  return {
    scene: {
      kind: 'data',
      title: '输入一个数 → 按规则处理 → 显示结果',
      cards: [
        { id: 'input', label: '输入', value: s.input, detail: '交给小机器的数字' },
        {
          id: 'current',
          label: '当前记住的数',
          value: s.current ?? '还没读取',
          detail: '暂时记下来，供下一步使用',
        },
        {
          id: 'output',
          label: '输出',
          value: s.output ?? '还没显示',
          detail: '完成处理后展示的结果',
          tone: finished ? 'success' : 'neutral',
        },
      ],
      tables: [
        {
          id: 'modeling-steps',
          title: '小机器会按这个顺序做事',
          columns: ['步骤', '要做什么', '进度'],
          rows: steps.map((operation, i) => ({
            id: String(i),
            values: [
              i + 1,
              operationLabel(operation, s.amount),
              i < s.step ? '已完成' : i === s.step ? '下一步' : '等待',
            ],
            tone: i === s.step ? 'warning' : 'neutral',
          })),
        },
      ],
      caption:
        '先看一条规则怎样处理一个数字。“当前记住的数”让我们看到计算的中间过程。修改输入或规则会从头开始；两条规则的顺序对比可以稍后再试。',
    },
    metrics: [
      { label: '已完成步骤', value: `${s.step} / ${steps.length}` },
      { label: '正确预测 / 总预测', value: `${s.correct} / ${s.predictions}` },
      { label: '实验进度', value: s.error ? '检查输入' : finished ? '已完成' : s.step ? '进行中' : '未开始' },
    ],
    controls,
    status: {
      title: s.error
        ? '检查一下填写的数字或规则'
        : finished
          ? s.correct > 0
            ? '你已经解释了一次计算'
            : '结果已显示，再试一次预测'
          : `接下来：${operationLabel(steps[s.step]!, s.amount)}`,
      detail:
        s.error ??
        (finished
          ? s.correct > 0
            ? `输入 ${s.input} 按规则得到输出 ${s.output}。可以换一个输入，先预测再观察。`
            : `输出是 ${s.output}。点击“用相同设置再试一次”，在执行某一步前填写预测，再验证它。`
          : (s.log.at(-1)?.detail ??
            '先点“执行下一步”，把输入读进来；再猜一猜，按处理规则做完下一步后，会记住多少。')),
      tone: s.error ? 'danger' : finished ? 'success' : (s.log.at(-1)?.tone ?? 'neutral'),
    },
    goal: {
      label: '正确预测至少一次变化，并完成从输入到输出的过程。',
      reached: !s.error && s.correct > 0 && finished && s.output !== null,
    },
    log: s.log,
  }
}

export const modelingEngine: EngineFactory = (config) => {
  const input = boundedInteger(config.input ?? 3, 0, 20)
  const amount = boundedInteger(config.amount ?? 2, 0, 10)
  const rule = config.rule ?? 'add'
  if (input === null || amount === null || !isModelingRule(rule))
    throw new Error('Modeling requires input 0–20, amount 0–10 and a supported rule')
  return createSession(() => initialModeling(input, amount, rule), modelingTransition, presentModeling)
}
