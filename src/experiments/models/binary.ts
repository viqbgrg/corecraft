import type { BinaryScene, EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession, integer } from '../core/session'

export interface BinaryState {
  width: number
  a: number
  b: number
  operation: BinaryScene['operation']
  bitsDraft: string
  error: string
  log: Observation[]
  observedLogic: boolean
  observedOverflow: boolean
}
export function initialBinary(width = 8): BinaryState {
  return { width, a: 42, b: 15, operation: 'AND', bitsDraft: (42).toString(2).padStart(width, '0'), error: '', log: [], observedLogic: false, observedOverflow: false }
}
export function binaryResult(s: BinaryState) {
  const mask = 2 ** s.width - 1
  const full = s.operation === 'ADD' ? s.a + s.b : s.operation === 'AND' ? s.a & s.b : s.operation === 'OR' ? s.a | s.b : s.a ^ s.b
  return { result: full & mask, carry: full > mask ? 1 : 0, full }
}
export function transitionBinary(state: BinaryState, action: ExperimentAction): BinaryState {
  const s = structuredClone(state)
  const mask = 2 ** s.width - 1
  s.error = ''
  let label = '输入改变'
  if (action.type === 'a' || action.type === 'b') s[action.type] = integer(action.value, 0, mask, s[action.type])
  else if (action.type === 'bits-a') {
    s.bitsDraft = String(action.value ?? '')
    if (!new RegExp('^[01]{1,' + s.width + '}$').test(s.bitsDraft)) {
      s.error = '请输入 1–' + s.width + ' 个二进制位，只能包含 0 和 1。'
      return s
    }
    s.a = Number.parseInt(s.bitsDraft, 2)
    label = '从二进制到十进制'
  } else if (action.type === 'toggle-a' || action.type === 'toggle-b') {
    const bit = integer(action.value, 0, s.width - 1, 0)
    const target = action.type === 'toggle-a' ? 'a' : 'b'
    s[target] ^= 2 ** bit
    label = '翻转 bit ' + bit
  } else if (action.type === 'operation') {
    if (!['AND', 'OR', 'XOR', 'ADD'].includes(String(action.value))) return state
    s.operation = action.value as BinaryScene['operation']
    label = '切换到 ' + s.operation
  } else if (action.type === 'invert') { s.a = (~s.a) & mask; label = 'NOT A：逐位取反' }
  else if (action.type === 'shift') { s.a = (s.a << 1) & mask; label = 'A 左移一位：高位移出，低位补 0' }
  else if (action.type === 'overflow') { s.a = mask; s.b = 1; s.operation = 'ADD'; label = '边界实验：' + mask + ' + 1' }
  else return state
  s.bitsDraft = s.a.toString(2).padStart(s.width, '0')
  const { result, carry, full } = binaryResult(s)
  s.observedLogic ||= s.operation !== 'ADD'
  s.observedOverflow ||= carry === 1
  const detail = s.a + ' ' + (s.operation === 'ADD' ? '+' : s.operation) + ' ' + s.b + ' = ' + result + (carry ? '；完整和是 ' + full + '，第 ' + (s.width + 1) + ' 位的进位无法存入 ' + s.width + ' 位寄存器。' : '；结果由每一位的规则决定。')
  s.log = addLog(s.log, label, detail, carry ? 'warning' : 'success')
  return s
}
export function presentBinary(s: BinaryState): ExperimentView {
  const { result, carry } = binaryResult(s)
  return {
    scene: { kind: 'binary', width: s.width, a: s.a, b: s.b, operation: s.operation, result, carry },
    controls: [
      { id: 'a', kind: 'number', label: '十进制 A', value: s.a, min: 0, max: 2 ** s.width - 1 },
      { id: 'b', kind: 'number', label: '十进制 B', value: s.b, min: 0, max: 2 ** s.width - 1 },
      { id: 'bits-a', kind: 'text', label: '二进制 A', value: s.bitsDraft, hint: '只包含 0 和 1' },
      { id: 'operation', kind: 'select', label: '运算方式', value: s.operation, options: [{ value: 'AND', label: 'AND · 与' }, { value: 'OR', label: 'OR · 或' }, { value: 'XOR', label: 'XOR · 异或' }, { value: 'ADD', label: 'ADD · 加法' }] },
      { id: 'invert', kind: 'button', label: 'NOT A · 取反' },
      { id: 'shift', kind: 'button', label: 'A << 1 · 左移' },
      { id: 'overflow', kind: 'button', label: '试试 255 + 1', primary: true },
    ],
    metrics: [{ label: '十进制结果', value: result }, { label: '十六进制', value: '0x' + result.toString(16).toUpperCase().padStart(2, '0') }, { label: '无符号范围', value: '0–' + (2 ** s.width - 1) }, { label: '进位 Carry', value: carry, tone: carry ? 'warning' : 'neutral' }],
    status: { title: s.error ? '输入需要调整' : carry ? '进位没有消失，它装不下了。' : '每一位，都是一个可以观察的开关。', detail: s.error || (carry ? '8 位只保留低 8 位，所以 255 + 1 的存储结果是 0，进位为 1。这是无符号溢出。' : '点击 A 或 B 的任意一位，观察位权、十进制与运算结果如何一起变化。'), tone: s.error ? 'danger' : carry ? 'warning' : 'neutral' },
    log: s.log,
    goal: { label: '尝试位运算，再制造一次 8 位加法溢出。', reached: s.observedLogic && s.observedOverflow },
  }
}
export const binaryEngine: EngineFactory = () => createSession(() => initialBinary(), transitionBinary, presentBinary)
