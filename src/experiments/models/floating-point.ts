import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'

export interface Rational {
  n: bigint
  d: bigint
}
export function rational(n: bigint, d: bigint): Rational {
  let a = n < 0n ? -n : n,
    b = d
  while (b) {
    const rest = a % b
    a = b
    b = rest
  }
  return { n: n / (a || 1n), d: d / (a || 1n) }
}
export function parseFloatInput(input: string): { value: number; exact: Rational | null } | null {
  const text = input.trim()
  if (/^[+-]?nan$/i.test(text)) return { value: NaN, exact: null }
  if (/^[+-]?infinity$/i.test(text))
    return { value: text.startsWith('-') ? -Infinity : Infinity, exact: null }
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d{1,2}))?$/i.exec(text)
  if (!match || text.length > 48) return null
  const fraction = match[3] ?? match[4] ?? '',
    digits = (match[2] ?? '0') + fraction,
    exponent = Number(match[5] ?? 0)
  if (digits.length > 24 || Math.abs(exponent) > 60) return null
  const power = exponent - fraction.length,
    sign = match[1] === '-' ? -1n : 1n
  const n = sign * BigInt(digits) * (power >= 0 ? 10n ** BigInt(power) : 1n),
    d = power < 0 ? 10n ** BigInt(-power) : 1n
  return { value: Number(text), exact: rational(n, d) }
}
export interface FloatParts {
  bits: number
  sign: number
  exponent: number
  fraction: number
  category: string
  value: number
  exact: Rational | null
}
export function decodeFloat32Bits(bits: number): FloatParts {
  const data = new DataView(new ArrayBuffer(4))
  data.setUint32(0, bits)
  const sign = bits >>> 31,
    exponent = (bits >>> 23) & 255,
    fraction = bits & 0x7fffff
  let exact: Rational | null = null
  if (exponent < 255) {
    const power = exponent === 0 ? -149 : exponent - 127 - 23
    const significand = BigInt(fraction + (exponent === 0 ? 0 : 0x800000)) * (sign ? -1n : 1n)
    exact = rational(
      power >= 0 ? significand * 2n ** BigInt(power) : significand,
      power < 0 ? 2n ** BigInt(-power) : 1n,
    )
  }
  return {
    bits,
    sign,
    exponent,
    fraction,
    value: data.getFloat32(0),
    exact,
    category:
      exponent === 255
        ? fraction
          ? 'NaN'
          : '无穷大'
        : exponent === 0
          ? fraction
            ? '次正规数'
            : sign
              ? '负零'
              : '正零'
          : '正规数',
  }
}
export function float32Parts(value: number): FloatParts {
  const data = new DataView(new ArrayBuffer(4))
  data.setFloat32(0, value)
  return decodeFloat32Bits(data.getUint32(0))
}
function nearestEven(n: bigint, d: bigint): bigint {
  const q = n / d,
    remainder = n % d
  return q + (remainder * 2n > d || (remainder * 2n === d && q % 2n === 1n) ? 1n : 0n)
}
/** Round the exact rational directly; decimal → binary64 → binary32 can double-round at a tie. */
export function roundToFloat32(exact: Rational, negativeZero = false): FloatParts {
  const sign = exact.n < 0n || (exact.n === 0n && negativeZero) ? 0x80000000 : 0
  const n = exact.n < 0n ? -exact.n : exact.n,
    d = exact.d
  if (n === 0n) return decodeFloat32Bits(sign)
  let exponent = n.toString(2).length - d.toString(2).length
  if (exponent >= 0 ? n < d * 2n ** BigInt(exponent) : n * 2n ** BigInt(-exponent) < d) exponent--
  if (exponent > 127) return decodeFloat32Bits(sign + 0x7f800000)
  if (exponent < -126) {
    const fraction = nearestEven(n * 2n ** 149n, d)
    // A subnormal rounding upward to 2^23 is the smallest normal encoding.
    return decodeFloat32Bits(sign + Number(fraction))
  }
  const shift = 23 - exponent
  let significand = nearestEven(
    shift >= 0 ? n * 2n ** BigInt(shift) : n,
    shift < 0 ? d * 2n ** BigInt(-shift) : d,
  )
  if (significand === 2n ** 24n) {
    significand /= 2n
    exponent++
  }
  if (exponent > 127) return decodeFloat32Bits(sign + 0x7f800000)
  return decodeFloat32Bits(sign + (exponent + 127) * 0x800000 + Number(significand - 0x800000n))
}
export interface FloatResult {
  parts: FloatParts
  operandA: number
  operandB: number
  target: Rational | null
  error: Rational | null
}
export function calculateFloat32(a: string, b: string, operation: 'convert' | 'add'): FloatResult | null {
  const left = parseFloatInput(a),
    right = operation === 'add' ? parseFloatInput(b) : { value: 0, exact: { n: 0n, d: 1n } }
  if (!left || !right) return null
  const aParts = left.exact ? roundToFloat32(left.exact, Object.is(left.value, -0)) : float32Parts(left.value)
  const bParts = right.exact
    ? roundToFloat32(right.exact, Object.is(right.value, -0))
    : float32Parts(right.value)
  const operandA = aParts.value,
    operandB = bParts.value
  const sum =
    aParts.exact && bParts.exact
      ? rational(
          aParts.exact.n * bParts.exact.d + bParts.exact.n * aParts.exact.d,
          aParts.exact.d * bParts.exact.d,
        )
      : null
  const parts =
    operation === 'convert'
      ? aParts
      : sum
        ? roundToFloat32(sum, Object.is(operandA, -0) && Object.is(operandB, -0))
        : float32Parts(operandA + operandB)
  const target =
    left.exact && right.exact
      ? rational(left.exact.n * right.exact.d + right.exact.n * left.exact.d, left.exact.d * right.exact.d)
      : null
  const error =
    target && parts.exact
      ? rational(parts.exact.n * target.d - target.n * parts.exact.d, parts.exact.d * target.d)
      : null
  return { parts, operandA, operandB, target, error }
}
export interface FloatState {
  a: string
  b: string
  operation: 'convert' | 'add'
  result: FloatResult | null
  comparison: { label: string; result: FloatResult }[]
  error: string | null
  log: Observation[]
}
const showNumber = (number: number) => (Object.is(number, -0) ? '-0' : String(number))
const showRational = (number: Rational | null) =>
  number ? (number.d === 1n ? String(number.n) : `${number.n} / ${number.d}`) : '不适用'
export function initialFloat(a = '0.1', b = '0.2', operation: 'convert' | 'add' = 'add'): FloatState {
  if (!['convert', 'add'].includes(operation) || !calculateFloat32(a, b, operation))
    throw new Error('Float32 requires decimal inputs (≤24 digits, exponent ±60), NaN or Infinity')
  return { a, b, operation, result: null, comparison: [], error: null, log: [] }
}
export function floatTransition(s: FloatState, a: ExperimentAction): FloatState {
  if (a.type === 'a' || a.type === 'b')
    return { ...s, [a.type]: String(a.value ?? ''), result: null, error: null }
  if (a.type === 'operation' && ['add', 'convert'].includes(String(a.value)))
    return { ...s, operation: a.value as FloatState['operation'], result: null, error: null }
  if (a.type === 'compute') {
    const result = calculateFloat32(s.a, s.b, s.operation)
    if (!result)
      return {
        ...s,
        result: null,
        error:
          '请输入十进制或科学记数法（最多 24 个数字，指数 -60..60），也支持 NaN、Infinity、-Infinity 和 -0。',
      }
    return {
      ...s,
      result,
      error: null,
      log: addLog(
        s.log,
        '按 binary32 舍入',
        `${s.operation === 'add' ? `先将两个输入舍入为 ${showNumber(result.operandA)} 和 ${showNumber(result.operandB)}，相加后再次舍入。` : '将输入舍入到最近的 binary32 值。'}结果 ${showNumber(result.parts.value)}，类别：${result.parts.category}。`,
        result.error?.n ? 'warning' : 'success',
      ),
    }
  }
  if (a.type === 'compare')
    return {
      ...s,
      comparison: [
        { label: '0.5（可精确表示）', result: calculateFloat32('0.5', '0', 'convert')! },
        { label: '0.1 + 0.2', result: calculateFloat32('0.1', '0.2', 'add')! },
        { label: '16777216 + 1', result: calculateFloat32('16777216', '1', 'add')! },
      ],
      log: addLog(
        s.log,
        '三组精度对照',
        '参考值来自十进制字符串的精确分数；binary32 由真实 IEEE 754 转换产生，不把 JavaScript binary64 的近似值当作精确答案。',
        'success',
      ),
    }
  return s
}
export function presentFloat(s: FloatState): ExperimentView {
  const parts = s.result?.parts,
    error = s.result?.error
  const binary = parts?.bits.toString(2).padStart(32, '0')
  return {
    scene: {
      kind: 'data',
      title: 'IEEE 754 binary32 · 1 + 8 + 23 位',
      cards: [
        { id: 'sign', label: '符号位', value: binary?.slice(0, 1) ?? '—' },
        { id: 'exponent', label: '指数域', value: binary?.slice(1, 9) ?? '—' },
        { id: 'fraction', label: '小数域', value: binary?.slice(9) ?? '—' },
      ],
      tables: [
        {
          id: 'float-fields',
          title: '存储格式与精确数值',
          columns: ['字段', '含义 / 值'],
          rows: parts
            ? [
                { id: 'exp', values: ['指数域原值', parts.exponent] },
                {
                  id: 'exponent',
                  values: [
                    '实际指数',
                    parts.exponent === 255 ? '特殊值' : parts.exponent === 0 ? -126 : parts.exponent - 127,
                  ],
                },
                {
                  id: 'significand',
                  values: [
                    '有效数起始位',
                    parts.exponent === 255
                      ? '特殊值'
                      : parts.exponent === 0
                        ? '0.xxx（无隐藏的 1）'
                        : '1.xxx（隐藏的 1）',
                  ],
                },
                { id: 'target', values: ['输入的精确数学目标', showRational(s.result!.target)] },
                { id: 'stored', values: ['实际存储值（精确分数）', showRational(parts.exact)] },
              ]
            : [],
        },
        {
          id: 'float-comparison',
          title: '不同数量级的精度对照',
          columns: ['输入', 'binary32 结果', '结果 − 精确目标'],
          rows: s.comparison.map((row) => ({
            id: row.label,
            values: [row.label, showNumber(row.result.parts.value), showRational(row.result.error)],
          })),
        },
      ],
      caption:
        '正规数为 (−1)^s × (1.f) × 2^(e−127)；e=0 使用 0.f × 2^-126；e=255 表示无穷或 NaN。采用最近值、平局取偶数舍入。',
    },
    metrics: [
      { label: 'binary32 结果', value: parts ? showNumber(parts.value) : '待计算' },
      { label: '分类', value: parts?.category ?? '—' },
      {
        label: '十六进制编码',
        value: parts ? '0x' + parts.bits.toString(16).toUpperCase().padStart(8, '0') : '—',
      },
      {
        label: '误差（近似显示）',
        value: error ? (Number(error.n) / Number(error.d)).toExponential(6) : '—',
      },
    ],
    controls: [
      { id: 'a', kind: 'text', label: '十进制输入 A', value: s.a },
      { id: 'b', kind: 'text', label: '十进制输入 B', value: s.b, disabled: s.operation === 'convert' },
      {
        id: 'operation',
        kind: 'select',
        label: '浮点操作',
        value: s.operation,
        options: [
          { value: 'add', label: 'A + B（binary32 运算）' },
          { value: 'convert', label: '只将 A 转为 binary32' },
        ],
      },
      { id: 'compute', kind: 'button', label: '执行舍入并拆解编码', primary: true },
      { id: 'compare', kind: 'button', label: '比较精确值与舍入值' },
    ],
    status: {
      title: s.error ? '检查浮点输入' : parts ? '有限位数描述连续数量' : '先选择需要保存的数值',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '默认计算 binary32 的 0.1 + 0.2；对照精确的 3/10，而不是近似的显示字符串。',
      tone: s.error ? 'danger' : error?.n ? 'warning' : 'neutral',
    },
    goal: {
      label: '执行一次浮点转换或运算，并比较三组精度反例。',
      reached: !!s.result && !s.error && s.comparison.length === 3,
    },
    log: s.log,
  }
}
export const floatEngine: EngineFactory = (config) =>
  createSession(
    () =>
      initialFloat(
        String(config.a ?? '0.1'),
        String(config.b ?? '0.2'),
        (config.operation ?? 'add') as FloatState['operation'],
      ),
    floatTransition,
    presentFloat,
  )
