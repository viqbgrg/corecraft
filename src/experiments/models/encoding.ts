import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'

export interface EncodedScalar {
  point: number
  character: string
  units: number
  bytes: number[]
}
export interface Utf8Result {
  text: string
  bytes: number[]
  scalars: EncodedScalar[]
}
export function encodeUtf8(text: string): Utf8Result {
  const scalars: EncodedScalar[] = [],
    bytes: number[] = []
  for (const character of text) {
    const point = character.codePointAt(0)!
    if (point >= 0xd800 && point <= 0xdfff)
      throw new Error('发现未配对的 UTF-16 代理项；它不是 Unicode 标量值。')
    const encoded =
      point < 0x80
        ? [point]
        : point < 0x800
          ? [0xc0 | (point >> 6), 0x80 | (point & 63)]
          : point < 0x10000
            ? [0xe0 | (point >> 12), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63)]
            : [
                0xf0 | (point >> 18),
                0x80 | ((point >> 12) & 63),
                0x80 | ((point >> 6) & 63),
                0x80 | (point & 63),
              ]
    bytes.push(...encoded)
    scalars.push({ point, character, units: character.length, bytes: encoded })
  }
  return { text, bytes, scalars }
}
export function decodeUtf8(bytes: number[]): Utf8Result {
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255))
    throw new Error('每个字节必须在 00–FF 之间。')
  let text = ''
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i]!,
      length =
        first <= 0x7f
          ? 1
          : first >= 0xc2 && first <= 0xdf
            ? 2
            : first >= 0xe0 && first <= 0xef
              ? 3
              : first >= 0xf0 && first <= 0xf4
                ? 4
                : 0
    if (!length)
      throw new Error(`字节 ${i} 的 ${first.toString(16).toUpperCase()} 不是合法的 UTF-8 起始字节。`)
    if (i + length > bytes.length) throw new Error(`字节 ${i} 开始的序列不完整，需要 ${length} 个字节。`)
    let point = first & (length === 1 ? 127 : (1 << (7 - length)) - 1)
    for (let j = 1; j < length; j++) {
      const next = bytes[i + j]!
      if ((next & 0xc0) !== 0x80) throw new Error(`字节 ${i + j} 必须是 10xxxxxx 形式的续字节。`)
      point = (point << 6) | (next & 63)
    }
    if (length > 1 && point < [0, 0, 0x80, 0x800, 0x10000][length]!)
      throw new Error('不允许过长编码：必须使用该标量值最短的 UTF-8 表示。')
    if ((point >= 0xd800 && point <= 0xdfff) || point > 0x10ffff)
      throw new Error('解码结果不是合法的 Unicode 标量值。')
    text += String.fromCodePoint(point)
    i += length
  }
  return encodeUtf8(text)
}
const hexBytes = (bytes: number[]) =>
  bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')
export function parseHexBytes(draft: string): number[] | null {
  if (!draft.trim()) return []
  const tokens = draft.trim().split(/[\s,]+/)
  return tokens.length <= 96 && tokens.every((token) => /^[\da-f]{2}$/i.test(token))
    ? tokens.map((token) => parseInt(token, 16))
    : null
}
export interface EncodingState {
  text: string
  hex: string
  result: Utf8Result | null
  encoded: { text: string; hex: string } | null
  roundTrip: boolean
  error: string | null
  log: Observation[]
}
export function initialEncoding(text = 'A中🙂'): EncodingState {
  if (text.length > 32) throw new Error('Encoding text is limited to 32 UTF-16 code units')
  encodeUtf8(text)
  return { text, hex: '', result: null, encoded: null, roundTrip: false, error: null, log: [] }
}
export function encodingTransition(s: EncodingState, a: ExperimentAction): EncodingState {
  if (a.type === 'text' || a.type === 'hex')
    return { ...s, [a.type]: String(a.value ?? ''), result: null, roundTrip: false, error: null }
  if (!['encode', 'decode'].includes(a.type)) return s
  try {
    if (a.type === 'encode') {
      if (s.text.length > 32) throw new Error('文字最多 32 个 UTF-16 代码单元。')
      const result = encodeUtf8(s.text),
        hex = hexBytes(result.bytes)
      return {
        ...s,
        hex,
        result,
        encoded: { text: s.text, hex },
        roundTrip: false,
        error: null,
        log: addLog(
          s.log,
          '编码为 UTF-8',
          `${result.scalars.length} 个 Unicode 标量值，${s.text.length} 个 UTF-16 代码单元，${result.bytes.length} 个 UTF-8 字节。`,
          'success',
        ),
      }
    }
    const bytes = parseHexBytes(s.hex)
    if (!bytes) throw new Error('请输入最多 96 个两位十六进制字节，用空格或逗号分隔，例如 41 E4 B8 AD。')
    const result = decodeUtf8(bytes),
      hex = hexBytes(bytes)
    if (result.text.length > 32) throw new Error('解码后的文字超过本实验 32 个 UTF-16 代码单元的上限。')
    return {
      ...s,
      text: result.text,
      hex,
      result,
      error: null,
      roundTrip:
        !!s.encoded &&
        hex === s.encoded.hex &&
        result.text === s.encoded.text &&
        result.scalars.some((scalar) => scalar.point > 127),
      log: addLog(
        s.log,
        '严格解码 UTF-8',
        `还原 ${result.scalars.length} 个 Unicode 标量值；拒绝截断、过长编码、代理项和超范围码点。`,
        'success',
      ),
    }
  } catch (error) {
    return {
      ...s,
      result: null,
      roundTrip: false,
      error: error instanceof Error ? error.message : '无法处理当前编码。',
    }
  }
}
export function presentEncoding(s: EncodingState): ExperimentView {
  return {
    scene: {
      kind: 'data',
      title: '文字、码点、代码单元与字节',
      tables: [
        {
          id: 'encoding-scalars',
          title: '每个 Unicode 标量值怎样编码',
          columns: ['字符', 'Unicode', 'UTF-16 单元', 'UTF-8 字节', '编码模式'],
          rows:
            s.result?.scalars.map((scalar, i) => ({
              id: String(i),
              values: [
                scalar.point < 32 || scalar.point === 127 ? '控制字符' : scalar.character,
                'U+' + scalar.point.toString(16).toUpperCase().padStart(4, '0'),
                scalar.units,
                hexBytes(scalar.bytes),
                scalar.bytes.map((byte) => byte.toString(2).padStart(8, '0')).join(' '),
              ],
            })) ?? [],
        },
      ],
      caption:
        'ASCII 的 00–7F 与 UTF-8 的单字节部分兼容。Unicode 分配码点；UTF-8 和 UTF-16 定义不同编码。一个可见字形也可能由多个码点组合。',
    },
    metrics: [
      { label: 'Unicode 标量值', value: s.result?.scalars.length ?? '—' },
      { label: 'UTF-16 代码单元', value: s.result?.text.length ?? '—' },
      { label: 'UTF-8 字节数', value: s.result?.bytes.length ?? '—' },
      { label: '往返验证', value: s.roundTrip ? '一致' : '待验证' },
    ],
    controls: [
      { id: 'text', kind: 'text', label: '待编码文字', value: s.text },
      { id: 'hex', kind: 'text', label: 'UTF-8 十六进制字节', value: s.hex },
      { id: 'encode', kind: 'button', label: '文字 → UTF-8 字节', primary: true },
      { id: 'decode', kind: 'button', label: '严格解码 UTF-8 → 文字' },
    ],
    status: {
      title: s.error ? '编码验证失败' : s.roundTrip ? '字节往返与原文一致' : '同一段文字可以有不同的编码表示',
      detail: s.error ?? s.log.at(-1)?.detail ?? '编码默认的 A、中和 🙂，比较单字节、三字节与四字节序列。',
      tone: s.error ? 'danger' : s.roundTrip ? 'success' : 'neutral',
    },
    goal: {
      label: '编码包含非 ASCII 字符的文字，再严格解码这些字节，验证原文完全一致。',
      reached: s.roundTrip && !s.error,
    },
    log: s.log,
  }
}
export const encodingEngine: EngineFactory = (config) =>
  createSession(() => initialEncoding(String(config.text ?? 'A中🙂')), encodingTransition, presentEncoding)
