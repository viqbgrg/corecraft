import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
import { encodeUtf8 } from './encoding'

export type JavaIoApi = 'stream' | 'reader' | 'channel'
export interface ApiComparison {
  api: JavaIoApi
  calls: number
  units: number
  output: string
  eof: boolean
}
export interface JavaIoState {
  text: string
  draft: string
  bytes: number[]
  api: JavaIoApi
  count: number
  streamAt: number
  readerAt: number
  channelAt: number
  streamOutput: number[]
  readerOutput: string
  channelOutput: number[]
  buffer: number[]
  position: number
  limit: number
  calls: Record<JavaIoApi, number>
  eof: Record<JavaIoApi, boolean>
  closed: Record<JavaIoApi, boolean>
  last: string
  streamRead: boolean
  readerRead: boolean
  flipped: boolean
  drained: boolean
  comparison: ApiComparison[]
  error: string | null
  log: Observation[]
}
export function initialJavaIo(text = 'A中🙂B', count = 2): JavaIoState {
  if (text.length > 16 || boundedInteger(count, 1, 4) === null)
    throw new Error('IO model supports at most 16 UTF-16 units and chunk 1–4')
  return {
    text,
    draft: text,
    bytes: encodeUtf8(text).bytes,
    api: 'stream',
    count,
    streamAt: 0,
    readerAt: 0,
    channelAt: 0,
    streamOutput: [],
    readerOutput: '',
    channelOutput: [],
    buffer: Array(4).fill(0) as number[],
    position: 0,
    limit: 4,
    calls: { stream: 0, reader: 0, channel: 0 },
    eof: { stream: false, reader: false, channel: false },
    closed: { stream: false, reader: false, channel: false },
    last: '尚未读取',
    streamRead: false,
    readerRead: false,
    flipped: false,
    drained: false,
    comparison: [],
    error: null,
    log: [],
  }
}
const byteHex = (bytes: number[]) =>
  bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
const charUnits = (text: string) =>
  Array.from({ length: text.length }, (_, i) =>
    text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'),
  ).join(' ')
export function compareJavaApis(text: string, count: number): ApiComparison[] {
  return (['stream', 'reader', 'channel'] as const).map((api) => {
    let s = { ...initialJavaIo(text, count), api }
    for (let budget = 0; budget < 100 && !s.eof[api]; budget++) {
      s = javaIoTransition(s, { type: 'read' })
      if (api === 'channel') {
        s = javaIoTransition(s, { type: 'flip' })
        while (s.position < s.limit) s = javaIoTransition(s, { type: 'get' })
        s = javaIoTransition(s, { type: 'compact' })
      }
    }
    const output =
      api === 'stream'
        ? byteHex(s.streamOutput)
        : api === 'reader'
          ? charUnits(s.readerOutput)
          : byteHex(s.channelOutput)
    return {
      api,
      calls: s.calls[api],
      units:
        api === 'stream'
          ? s.streamOutput.length
          : api === 'reader'
            ? s.readerOutput.length
            : s.channelOutput.length,
      output,
      eof: s.eof[api],
    }
  })
}
export function javaIoTransition(state: JavaIoState, a: ExperimentAction): JavaIoState {
  if (a.type === 'draft') return { ...state, draft: String(a.value ?? ''), error: null }
  if (a.type === 'apply') {
    try {
      return initialJavaIo(state.draft, state.count)
    } catch (error) {
      return { ...state, error: error instanceof Error ? error.message : '无效文字' }
    }
  }
  if (a.type === 'count') {
    const count = boundedInteger(a.value, 1, 4)
    return count === null ? state : { ...state, count, comparison: [], error: null }
  }
  if (a.type === 'api' && ['stream', 'reader', 'channel'].includes(String(a.value)))
    return { ...state, api: a.value as JavaIoApi, error: null }
  if (a.type === 'compare')
    return {
      ...state,
      comparison: compareJavaApis(state.text, state.count),
      error: null,
      log: addLog(
        state.log,
        '同一文件的独立 API 读取',
        '每组从文件开头运行到 −1；Stream / Channel 统计字节，Reader 统计 UTF-16 代码单元。调用次数不等于操作系统 IO 次数。',
      ),
    }
  if (!['read', 'flip', 'get', 'compact', 'clear', 'close'].includes(a.type)) return state
  const s = structuredClone(state)
  s.error = null
  let detail = ''
  if (a.type === 'close') {
    s.closed[s.api] = true
    detail = `${s.api}.close 释放该输入句柄；已复制到数组或 Buffer 的内容仍可使用。`
  } else if (a.type === 'read') {
    if (s.closed[s.api])
      return {
        ...state,
        error:
          s.api === 'channel'
            ? 'ClosedChannelException：不能从已关闭通道读取。'
            : 'IOException：输入已经关闭。',
      }
    s.calls[s.api]++
    if (s.api === 'stream') {
      const values = s.bytes.slice(s.streamAt, s.streamAt + s.count)
      s.streamAt += values.length
      s.streamOutput.push(...values)
      s.eof.stream = values.length === 0
      s.streamRead ||= values.length > 0
      s.last = values.length ? `${values.length} B: ${byteHex(values)}` : '−1 / EOF'
      detail = `InputStream.read(byte[]) → ${s.last}。字节本身不是 Unicode 字符。`
    } else if (s.api === 'reader') {
      const value = s.text.slice(s.readerAt, s.readerAt + s.count)
      s.readerAt += value.length
      s.readerOutput += value
      s.eof.reader = value.length === 0
      s.readerRead ||= value.length > 0
      s.last = value.length ? `${value.length} char: ${charUnits(value)}` : '−1 / EOF'
      detail = `InputStreamReader(UTF-8).read(char[]) → ${s.last}。Java char 是 UTF-16 单元，补充字符的代理对可能跨两次 read。`
    } else {
      const remaining = s.limit - s.position,
        size = Math.min(s.count, remaining, s.bytes.length - s.channelAt)
      for (const byte of s.bytes.slice(s.channelAt, s.channelAt + size)) s.buffer[s.position++] = byte
      s.channelAt += size
      s.eof.channel = remaining > 0 && size === 0 && s.channelAt === s.bytes.length
      s.last = String(s.eof.channel ? -1 : size)
      detail = `FileChannel.read(buffer) → ${s.last}；position=${s.position}，limit=${s.limit}。${remaining === 0 ? 'Buffer 无剩余空间，返回 0，不代表 EOF。' : '通道推进 Buffer 的 position；程序负责切换后续读取边界。'}`
    }
  } else {
    if (s.api !== 'channel') return state
    if (a.type === 'flip') {
      s.limit = s.position
      s.position = 0
      s.flipped ||= s.limit > 0
      detail = `flip：limit ← 已写入位置 ${s.limit}，position ← 0；没有复制字节。`
    } else if (a.type === 'get') {
      const values = s.buffer.slice(s.position, Math.min(s.limit, s.position + s.count))
      s.position += values.length
      s.channelOutput.push(...values)
      s.drained ||= s.flipped && values.length > 0
      s.last = byteHex(values) || '无 remaining'
      detail = `循环 get 最多 ${s.count} 个 remaining 字节 → ${s.last}；limit 不变。未 flip 就 get 可能读到不属于新输入的槽位。`
    } else if (a.type === 'compact') {
      const unread = s.buffer.slice(s.position, s.limit)
      unread.forEach((byte, i) => {
        s.buffer[i] = byte
      })
      s.position = unread.length
      s.limit = s.buffer.length
      detail = `compact 把 ${unread.length} 个未读字节搬到开头，position=${s.position}、limit=${s.limit}，后续通道读追加在其后。`
    } else {
      s.position = 0
      s.limit = s.buffer.length
      detail = 'clear 重置 position / limit；不清零底层字节，不保存未消费输入的逻辑边界。'
    }
  }
  s.log = addLog(s.log, a.type, detail)
  return s
}
export function presentJavaIo(s: JavaIoState): ExperimentView {
  const reached =
    s.streamRead &&
    s.readerRead &&
    s.flipped &&
    s.drained &&
    s.comparison.length === 3 &&
    s.comparison.every((result) => result.eof)
  return {
    scene: {
      kind: 'data',
      title: '同一份 UTF-8 文件，三种 Java 读取接口',
      cards: [
        {
          id: 'text',
          label: '文件文字',
          value: s.text || '空文件',
          detail: `UTF-8 ${s.bytes.length} 字节 / Java String ${s.text.length} char`,
        },
        { id: 'result', label: '最近一次调用返回', value: s.last },
      ],
      tables: [
        {
          id: 'java-file-bytes',
          title: '源文件 / UTF-8 字节',
          columns: ['偏移', '十六进制', '十进制'],
          rows: s.bytes.map((byte, i) => ({ id: String(i), values: [i, byteHex([byte]), byte] })),
        },
        {
          id: 'java-byte-buffer',
          title: 'ByteBuffer / Java 对象中的位置边界',
          columns: ['槽', '字节', '相对 position / limit'],
          rows: s.buffer.map((byte, i) => ({
            id: String(i),
            values: [
              i,
              byteHex([byte]),
              i < s.position ? 'position 之前' : i < s.limit ? 'remaining 可访问' : 'limit 之外',
            ],
            tone: i >= s.position && i < s.limit ? 'success' : 'neutral',
          })),
        },
        {
          id: 'java-io-outputs',
          title: '三个独立输入句柄的累计输出',
          columns: ['接口', '已经读取的内容'],
          rows: [
            { id: 'stream', values: ['InputStream / bytes', byteHex(s.streamOutput) || '空'] },
            { id: 'reader', values: ['Reader / char', charUnits(s.readerOutput) || '空'] },
            { id: 'channel', values: ['Channel → Buffer → bytes', byteHex(s.channelOutput) || '空'] },
          ],
        },
        {
          id: 'java-io-comparison',
          title: '从头读到 EOF 的独立对照',
          columns: ['接口', 'read 调用', '返回单元数', '完整输出'],
          rows: s.comparison.map((result) => ({
            id: result.api,
            values: [result.api, result.calls, result.units, result.output || '空'],
          })),
        },
      ],
      caption:
        '固定内存文件，不执行真实 Java 或文件 IO。Reader 用显式 UTF-8 得到等价 UTF-16 单元序列，省略解码器预读与缓冲成本；字符编码算法见编码课。Channel 使用阻塞 FileChannel 的接口语义：NIO 不代表所有 Channel 都非阻塞，也不意味着 FileChannel 能注册 Selector。',
    },
    metrics: [
      { label: 'Stream 字节偏移', value: s.streamAt },
      { label: 'Reader char 偏移', value: s.readerAt },
      { label: 'Channel 文件偏移', value: s.channelAt },
      {
        label: 'Buffer position / limit / capacity',
        value: `${s.position} / ${s.limit} / ${s.buffer.length}`,
      },
    ],
    controls: [
      { id: 'draft', kind: 'text', label: 'UTF-8 文件内容 / 最多 16 char', value: s.draft },
      { id: 'apply', kind: 'button', label: '重新打开此内容的三个输入' },
      {
        id: 'api',
        kind: 'select',
        label: '当前 Java IO 接口',
        value: s.api,
        options: [
          { value: 'stream', label: 'InputStream / 字节' },
          { value: 'reader', label: 'Reader / UTF-16 char' },
          { value: 'channel', label: 'FileChannel / ByteBuffer' },
        ],
      },
      { id: 'count', kind: 'number', label: '每次最多读取单元数', value: s.count, min: 1, max: 4 },
      { id: 'read', kind: 'button', label: 'read · 从当前输入读取', primary: true },
      { id: 'flip', kind: 'button', label: 'ByteBuffer.flip', disabled: s.api !== 'channel' },
      { id: 'get', kind: 'button', label: 'ByteBuffer.get · 消费剩余字节', disabled: s.api !== 'channel' },
      { id: 'compact', kind: 'button', label: 'ByteBuffer.compact', disabled: s.api !== 'channel' },
      { id: 'clear', kind: 'button', label: 'ByteBuffer.clear', disabled: s.api !== 'channel' },
      { id: 'close', kind: 'button', label: 'close · 关闭当前输入' },
      { id: 'compare', kind: 'button', label: '独立运行三个 API 到 EOF' },
    ],
    status: {
      title: s.error
        ? '读取接口报告失败'
        : reached
          ? '单位、缓冲边界与资源生命周期各有职责'
          : '先确认 read 返回的是字节、char 还是数量',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '分别读取 Stream 和 Reader，再通过 Channel 写入 Buffer、flip 后 get，最后对照完整输出。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '读取字节与字符两种单位，亲手 flip 后消费 Buffer，再比较三个 API 从头读取到 EOF 的结果。',
      reached,
    },
    log: s.log,
  }
}
export const javaIoEngine: EngineFactory = () =>
  createSession(() => initialJavaIo(), javaIoTransition, presentJavaIo)
