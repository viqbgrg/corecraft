import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'

export type Bit = 0 | 1
export type LogicInputs = Record<'A' | 'B' | 'C', Bit>
export type BooleanNode =
  | { kind: 'input'; name: keyof LogicInputs }
  | { kind: 'constant'; value: Bit }
  | { kind: 'not'; child: BooleanNode }
  | { kind: 'and' | 'or' | 'xor'; left: BooleanNode; right: BooleanNode }
export function parseBooleanExpression(draft: string): BooleanNode {
  if (!draft.trim() || draft.length > 120 || /[^ABC01!&^|()\s]/i.test(draft))
    throw new Error('只支持 A、B、C、0、1、!、&、^、| 与括号，表达式最多 120 个字符。')
  const tokens = draft.toUpperCase().replace(/\s/g, '')
  let position = 0,
    nodes = 0
  const count = (node: BooleanNode) => {
    if (++nodes > 64) throw new Error('表达式最多包含 64 个节点。')
    return node
  }
  const unary = (): BooleanNode => {
    const token = tokens[position++]
    if (token === '!') return count({ kind: 'not', child: unary() })
    if (token === '(') {
      const result = or()
      if (tokens[position++] !== ')') throw new Error('括号不匹配。')
      return result
    }
    if (token && 'ABC'.includes(token)) return count({ kind: 'input', name: token as keyof LogicInputs })
    if (token === '0' || token === '1') return count({ kind: 'constant', value: Number(token) as Bit })
    throw new Error('此处需要输入变量、常量、NOT 或括号。')
  }
  const and = (): BooleanNode => {
    let result = unary()
    while (tokens[position] === '&') {
      position++
      result = count({ kind: 'and', left: result, right: unary() })
    }
    return result
  }
  const xor = (): BooleanNode => {
    let result = and()
    while (tokens[position] === '^') {
      position++
      result = count({ kind: 'xor', left: result, right: and() })
    }
    return result
  }
  const or = (): BooleanNode => {
    let result = xor()
    while (tokens[position] === '|') {
      position++
      result = count({ kind: 'or', left: result, right: xor() })
    }
    return result
  }
  const result = or()
  if (position !== tokens.length) throw new Error('运算符或括号的位置不正确；两个输入之间需要一个运算符。')
  return result
}
export interface GateTrace {
  id: number
  gate: string
  inputs: string
  output: Bit
}
export function evaluateBoolean(root: BooleanNode, inputs: LogicInputs): { value: Bit; gates: GateTrace[] } {
  const gates: GateTrace[] = []
  const evaluate = (node: BooleanNode): { id: number; value: Bit } => {
    let value: Bit, description: string, gate: string
    if (node.kind === 'input') {
      value = inputs[node.name]
      description = node.name
      gate = 'INPUT'
    } else if (node.kind === 'constant') {
      value = node.value
      description = String(value)
      gate = 'CONSTANT'
    } else if (node.kind === 'not') {
      const child = evaluate(node.child)
      value = (1 - child.value) as Bit
      description = `#${child.id}=${child.value}`
      gate = 'NOT'
    } else {
      const left = evaluate(node.left),
        right = evaluate(node.right)
      value = (
        node.kind === 'and'
          ? left.value & right.value
          : node.kind === 'or'
            ? left.value | right.value
            : left.value ^ right.value
      ) as Bit
      description = `#${left.id}=${left.value}, #${right.id}=${right.value}`
      gate = node.kind.toUpperCase()
    }
    const id = gates.length
    gates.push({ id, gate, inputs: description, output: value })
    return { id, value }
  }
  const result = evaluate(root)
  return { value: result.value, gates }
}
export interface TruthRow {
  inputs: LogicInputs
  left: Bit
  right: Bit
}
export function truthTable(left: BooleanNode, right: BooleanNode): TruthRow[] {
  return Array.from({ length: 8 }, (_, i) => {
    const inputs: LogicInputs = { A: ((i >> 2) & 1) as Bit, B: ((i >> 1) & 1) as Bit, C: (i & 1) as Bit }
    return { inputs, left: evaluateBoolean(left, inputs).value, right: evaluateBoolean(right, inputs).value }
  })
}
export interface LogicState {
  left: string
  right: string
  inputs: LogicInputs
  evaluated: { left: ReturnType<typeof evaluateBoolean>; right: ReturnType<typeof evaluateBoolean> } | null
  table: TruthRow[]
  error: string | null
  log: Observation[]
}
export function initialLogic(left = '!(A & B)', right = '!A | !B'): LogicState {
  parseBooleanExpression(left)
  parseBooleanExpression(right)
  return { left, right, inputs: { A: 0, B: 1, C: 0 }, evaluated: null, table: [], error: null, log: [] }
}
export function logicTransition(s: LogicState, a: ExperimentAction): LogicState {
  if (a.type === 'left' || a.type === 'right')
    return { ...s, [a.type]: String(a.value ?? ''), evaluated: null, table: [], error: null }
  if (['A', 'B', 'C'].includes(a.type) && ['0', '1'].includes(String(a.value)))
    return { ...s, inputs: { ...s.inputs, [a.type]: Number(a.value) as Bit }, evaluated: null }
  if (!['evaluate', 'compare', 'counterexample'].includes(a.type)) return s
  try {
    const left = parseBooleanExpression(s.left),
      right = parseBooleanExpression(s.right)
    if (a.type === 'compare') {
      const table = truthTable(left, right),
        equal = table.every((row) => row.left === row.right)
      return {
        ...s,
        table,
        error: null,
        log: addLog(
          s.log,
          equal ? '八组输入全部一致' : '找到了不等价的反例',
          equal
            ? '这两个三变量布尔函数在所有输入上等价。穷举覆盖了全部 2³ 种情况。'
            : '至少一组输入的输出不同；一次反例就足以否定等价猜想。',
          equal ? 'success' : 'warning',
        ),
      }
    }
    const witness = a.type === 'counterexample' ? s.table.find((row) => row.left !== row.right) : null
    if (a.type === 'counterexample' && !witness) return s
    const inputs = witness?.inputs ?? s.inputs,
      evaluated = { left: evaluateBoolean(left, inputs), right: evaluateBoolean(right, inputs) }
    return {
      ...s,
      inputs: { ...inputs },
      evaluated,
      error: null,
      log: addLog(
        s.log,
        witness ? '代入反例' : '逐门求值',
        `A=${inputs.A}，B=${inputs.B}，C=${inputs.C}；左输出 ${evaluated.left.value}，右输出 ${evaluated.right.value}。`,
        evaluated.left.value === evaluated.right.value ? 'success' : 'warning',
      ),
    }
  } catch (error) {
    return {
      ...s,
      evaluated: null,
      table: [],
      error: error instanceof Error ? error.message : '表达式无法解析。',
    }
  }
}
export function presentLogic(s: LogicState): ExperimentView {
  const equivalent = s.table.length === 8 && s.table.every((row) => row.left === row.right)
  return {
    scene: {
      kind: 'data',
      title: '逻辑门的输入与输出',
      tables: [
        ...(['left', 'right'] as const).map((side) => ({
          id: `logic-${side}`,
          title: `${side === 'left' ? '左' : '右'}表达式 · ${s[side]}`,
          columns: ['节点', '逻辑门', '输入来源', '输出'],
          rows:
            s.evaluated?.[side].gates.map((gate) => ({
              id: String(gate.id),
              values: [`#${gate.id}`, gate.gate, gate.inputs, gate.output],
            })) ?? [],
        })),
        {
          id: 'logic-truth',
          title: '全部三变量输入的真值表',
          columns: ['A B C', '左输出', '右输出', '是否相同'],
          rows: s.table.map((row, i) => ({
            id: String(i),
            values: [
              `${row.inputs.A} ${row.inputs.B} ${row.inputs.C}`,
              row.left,
              row.right,
              row.left === row.right ? '相同' : '反例',
            ],
            tone: row.left === row.right ? 'neutral' : 'warning',
          })),
        },
      ],
      caption:
        '运算优先级：! 高于 &，& 高于 ^，^ 高于 |；括号可改变组合。本模型是理想组合逻辑，不模拟传播延迟、电压、时钟或触发器。',
    },
    metrics: [
      { label: '左表达式输出', value: s.evaluated?.left.value ?? '—' },
      { label: '右表达式输出', value: s.evaluated?.right.value ?? '—' },
      { label: '已穷举输入', value: s.table.length },
      { label: '函数等价', value: s.table.length ? (equivalent ? '是' : '否') : '待验证' },
    ],
    controls: [
      { id: 'left', kind: 'text', label: '左布尔表达式', value: s.left },
      { id: 'right', kind: 'text', label: '右布尔表达式', value: s.right },
      ...(['A', 'B', 'C'] as const).map((variable) => ({
        id: variable,
        kind: 'select' as const,
        label: `逻辑输入 ${variable}`,
        value: s.inputs[variable],
        options: [
          { value: '0', label: '0 · 假' },
          { value: '1', label: '1 · 真' },
        ],
      })),
      { id: 'evaluate', kind: 'button', label: '计算当前输入的逻辑门', primary: true },
      { id: 'compare', kind: 'button', label: '穷举真值表验证等价' },
      {
        id: 'counterexample',
        kind: 'button',
        label: '代入第一个反例',
        disabled: !s.table.some((row) => row.left !== row.right),
      },
    ],
    status: {
      title: s.error
        ? '检查布尔表达式'
        : s.table.length
          ? equivalent
            ? '在所有输入上等价'
            : '存在输出不同的输入'
          : '逻辑规则也可以用实验验证',
      detail:
        s.error ?? s.log.at(-1)?.detail ?? '先计算默认的德摩根定律，再把右表达式的 OR 改成 AND，寻找反例。',
      tone: s.error ? 'danger' : s.table.length && !equivalent ? 'warning' : 'neutral',
    },
    goal: {
      label: '逐门计算一次表达式，并穷举八种输入验证两个函数是否等价。',
      reached: !s.error && !!s.evaluated && s.table.length === 8,
    },
    log: s.log,
  }
}
export const logicEngine: EngineFactory = (config) =>
  createSession(
    () => initialLogic(String(config.left ?? '!(A & B)'), String(config.right ?? '!A | !B')),
    logicTransition,
    presentLogic,
  )
