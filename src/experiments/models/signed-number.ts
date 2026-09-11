import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type SignedOperation = 'add' | 'sub'
export interface BitAddition {
  bit: number
  a: number
  b: number
  carryIn: number
  result: number
  carryOut: number
}
export interface SignedResult {
  rawA: number
  rawB: number
  raw: number
  signed: number
  mathematical: number
  carry: number
  overflow: boolean
  steps: BitAddition[]
}
export interface SignedState {
  width: 4 | 8
  a: number
  b: number
  operation: SignedOperation
  cursor: number
  result: SignedResult
  comparison: { label: string; result: SignedResult }[]
  log: Observation[]
}
export function signedCalculation(
  a: number,
  b: number,
  operation: SignedOperation,
  width: 4 | 8 = 8,
): SignedResult {
  const half = 2 ** (width - 1),
    modulus = half * 2,
    mask = modulus - 1
  if (
    ![4, 8].includes(width) ||
    boundedInteger(a, -half, half - 1) === null ||
    boundedInteger(b, -half, half - 1) === null ||
    !['add', 'sub'].includes(operation)
  )
    throw new Error('Signed arithmetic requires 4/8 bits, representable operands and add/sub')
  const rawA = a & mask,
    rawB = b & mask,
    effectiveB = operation === 'sub' ? ~rawB & mask : rawB
  const steps: BitAddition[] = []
  let carry = operation === 'sub' ? 1 : 0,
    raw = 0
  for (let bit = 0; bit < width; bit++) {
    const av = (rawA >> bit) & 1,
      bv = (effectiveB >> bit) & 1,
      total = av + bv + carry,
      result = total & 1
    steps.push({ bit, a: av, b: bv, carryIn: carry, result, carryOut: total >> 1 })
    carry = total >> 1
    raw |= result << bit
  }
  const mathematical = operation === 'add' ? a + b : a - b
  return {
    rawA,
    rawB,
    raw,
    signed: raw >= half ? raw - modulus : raw,
    mathematical,
    carry,
    overflow: steps[width - 1]!.carryIn !== carry,
    steps,
  }
}
export function initialSigned(
  width: 4 | 8 = 8,
  a = 2 ** (width - 1) - 1,
  b = 1,
  operation: SignedOperation = 'add',
): SignedState {
  return {
    width,
    a,
    b,
    operation,
    cursor: 0,
    result: signedCalculation(a, b, operation, width),
    comparison: [],
    log: [],
  }
}
export function signedTransition(s: SignedState, a: ExperimentAction): SignedState {
  const half = 2 ** (s.width - 1)
  if (a.type === 'width' && [4, 8].includes(Number(a.value))) return initialSigned(Number(a.value) as 4 | 8)
  if (a.type === 'a' || a.type === 'b') {
    const value = boundedInteger(a.value, -half, half - 1)
    if (value !== null)
      return initialSigned(s.width, a.type === 'a' ? value : s.a, a.type === 'b' ? value : s.b, s.operation)
  }
  if (a.type === 'operation' && ['add', 'sub'].includes(String(a.value)))
    return initialSigned(s.width, s.a, s.b, a.value as SignedOperation)
  if (a.type === 'compare')
    return {
      ...s,
      comparison: [
        { label: `${half - 1} + 1`, result: signedCalculation(half - 1, 1, 'add', s.width) },
        { label: '-1 + 1', result: signedCalculation(-1, 1, 'add', s.width) },
        { label: `${-half} - 1`, result: signedCalculation(-half, 1, 'sub', s.width) },
      ],
      log: addLog(
        s.log,
        '区分两种越界',
        'Carry 描述无符号进位；Overflow 描述有符号结果是否超出当前位宽。它们分别回答不同的问题。',
        'success',
      ),
    }
  if (['step', 'run'].includes(a.type) && s.cursor < s.width) {
    let result = s
    const end = a.type === 'run' ? s.width : s.cursor + 1
    while (result.cursor < end) {
      const step = result.result.steps[result.cursor]!
      result = {
        ...result,
        cursor: result.cursor + 1,
        log: addLog(
          result.log,
          `第 ${step.bit} 位`,
          `${step.a}+${step.b}+Carry(${step.carryIn}) → 结果位 ${step.result}，向高位进位 ${step.carryOut}。`,
          'neutral',
        ),
      }
    }
    return result
  }
  return s
}
export function presentSigned(s: SignedState): ExperimentView {
  const done = s.cursor === s.width,
    half = 2 ** (s.width - 1),
    bits = (n: number) => n.toString(2).padStart(s.width, '0')
  return {
    scene: {
      kind: 'data',
      title: '同一串比特，两种数值解释',
      cards: [
        {
          id: 'a',
          label: `A=${s.a} 的补码`,
          value: bits(s.result.rawA),
          detail: `无符号解释 ${s.result.rawA}`,
        },
        {
          id: 'b',
          label: `B=${s.b} 的补码`,
          value: bits(s.result.rawB),
          detail: `无符号解释 ${s.result.rawB}`,
        },
        { id: 'result', label: '结果比特', value: done ? bits(s.result.raw) : '等待逐位计算' },
      ],
      tables: [
        {
          id: 'signed-bits',
          title: s.operation === 'sub' ? 'A + NOT B + 1（最低位初始进位为 1）' : '从低位向高位相加',
          columns: ['位', 'A', s.operation === 'sub' ? 'NOT B' : 'B', '进位输入', '结果位', '进位输出'],
          rows: s.result.steps.slice(0, s.cursor).map((step) => ({
            id: String(step.bit),
            values: [step.bit, step.a, step.b, step.carryIn, step.result, step.carryOut],
          })),
        },
        {
          id: 'signed-comparison',
          title: '边界反例（分别计算）',
          columns: ['运算', '数学结果', '有符号结果', 'Carry / 无借位', 'Overflow'],
          rows: s.comparison.map((row) => ({
            id: row.label,
            values: [
              row.label,
              row.result.mathematical,
              row.result.signed,
              row.result.carry,
              Number(row.result.overflow),
            ],
          })),
        },
      ],
      caption: `${s.width} 位补码范围 ${-half}..${half - 1}；最高位权重为 −${half}。减法的 Carry=1 表示无无符号借位，不能直接称为有符号溢出。`,
    },
    metrics: [
      { label: '无符号结果', value: done ? s.result.raw : '—' },
      { label: '有符号结果', value: done ? s.result.signed : '—' },
      { label: s.operation === 'sub' ? 'Carry / 无借位' : 'Carry', value: done ? s.result.carry : '—' },
      {
        label: 'Overflow',
        value: done ? Number(s.result.overflow) : '—',
        tone: done && s.result.overflow ? 'warning' : 'neutral',
      },
    ],
    controls: [
      {
        id: 'width',
        kind: 'select',
        label: '整数位宽',
        value: s.width,
        options: [
          { value: '4', label: '4 位' },
          { value: '8', label: '8 位' },
        ],
      },
      { id: 'a', kind: 'number', label: '有符号 A', value: s.a, min: -half, max: half - 1 },
      { id: 'b', kind: 'number', label: '有符号 B', value: s.b, min: -half, max: half - 1 },
      {
        id: 'operation',
        kind: 'select',
        label: '有符号运算',
        value: s.operation,
        options: [
          { value: 'add', label: 'A + B' },
          { value: 'sub', label: 'A - B' },
        ],
      },
      { id: 'step', kind: 'button', label: '计算下一位', primary: true, disabled: done },
      { id: 'run', kind: 'button', label: '完成全部位计算', disabled: done },
      { id: 'compare', kind: 'button', label: '对比进位与溢出反例' },
    ],
    status: {
      title: done ? (s.result.overflow ? '有符号溢出' : '有符号结果在范围内') : '比特没有自带正负含义',
      detail: done
        ? `数学结果 ${s.result.mathematical}，保留 ${s.width} 位后按补码解释为 ${s.result.signed}。`
        : '先观察位计算，再分别判断无符号进位和有符号范围。',
      tone: done && s.result.overflow ? 'warning' : 'neutral',
    },
    goal: {
      label: '完成一次逐位运算，并用边界反例区分 Carry 与 Overflow。',
      reached: done && s.comparison.length === 3,
    },
    log: s.log,
  }
}
export const signedEngine: EngineFactory = (config) =>
  createSession(
    () =>
      initialSigned(
        Number(config.width ?? 8) as 4 | 8,
        config.a === undefined ? undefined : Number(config.a),
        config.b === undefined ? 1 : Number(config.b),
        (config.operation ?? 'add') as SignedOperation,
      ),
    signedTransition,
    presentSigned,
  )
