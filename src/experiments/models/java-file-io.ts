import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
export interface FileIoState {
  text: string
  source: number[]
  buffered: boolean
  bufferSize: number
  cursor: number
  inputBuffer: number[]
  copied: number[]
  outputBuffer: number[]
  pageCache: number[]
  disk: number[]
  readCalls: number
  writeCalls: number
  eof: boolean
  closed: boolean
  comparison: { mode: string; calls: number; bytes: number[] }[]
  flushObserved: boolean
  forceObserved: boolean
  crashed: boolean
  error: string | null
  log: Observation[]
}
export function initialFileIo(): FileIoState {
  return {
    text: 'A中🙂B\n',
    source: [...new TextEncoder().encode('A中🙂B\n')],
    buffered: true,
    bufferSize: 4,
    cursor: 0,
    inputBuffer: [],
    copied: [],
    outputBuffer: [],
    pageCache: [],
    disk: [],
    readCalls: 0,
    writeCalls: 0,
    eof: false,
    closed: false,
    comparison: [],
    flushObserved: false,
    forceObserved: false,
    crashed: false,
    error: null,
    log: [],
  }
}
function flushStream(s: FileIoState) {
  if (s.outputBuffer.length) {
    s.pageCache.push(...s.outputBuffer)
    s.outputBuffer = []
    s.writeCalls++
  }
}
function readCopy(s: FileIoState) {
  if (s.closed) {
    s.error = '流已关闭，不能继续 read。'
    return
  }
  if (s.eof) return
  if (!s.inputBuffer.length) {
    s.readCalls++
    const count = s.buffered ? s.bufferSize : 1
    s.inputBuffer = s.source.slice(s.cursor, s.cursor + count)
    s.cursor += s.inputBuffer.length
  }
  if (!s.inputBuffer.length) {
    s.eof = true
    s.log = addLog(s.log, 'InputStream.read', '返回 -1：到达 EOF；0 是合法字节值，不表示文件结束。')
    return
  }
  const byte = s.inputBuffer.shift()!
  s.copied.push(byte)
  s.outputBuffer.push(byte)
  if (!s.buffered || s.outputBuffer.length >= s.bufferSize) flushStream(s)
  s.log = addLog(
    s.log,
    '逐字节复制',
    `read 返回无符号字节 ${byte}；应用已复制 ${s.copied.length} 字节。输入预取、输出缓冲与内核页缓存分别记录。`,
  )
}
export function fileIoTransition(state: FileIoState, a: ExperimentAction): FileIoState {
  if (a.type === 'text') return { ...state, text: String(a.value ?? '') }
  if (a.type === 'bufferSize') {
    const n = boundedInteger(a.value, 2, 16)
    return n === null ? state : { ...state, bufferSize: n }
  }
  if (
    a.type === 'buffered' &&
    ['yes', 'no'].includes(String(a.value)) &&
    state.copied.length === 0 &&
    state.cursor === 0
  )
    return { ...state, buffered: a.value === 'yes' }
  if (!['open', 'read', 'copy', 'flush', 'force', 'crash', 'close', 'compare'].includes(a.type)) return state
  let s = structuredClone(state)
  s.error = null
  if (a.type === 'open') {
    const bytes = [...new TextEncoder().encode(s.text)]
    if (bytes.length > 64) return { ...state, error: '教学源文件最多 64 个 UTF-8 字节。' }
    s = { ...initialFileIo(), text: s.text, source: bytes, buffered: s.buffered, bufferSize: s.bufferSize }
  } else if (a.type === 'read') readCopy(s)
  else if (a.type === 'copy') {
    for (let i = 0; i < 66 && !s.eof && !s.closed; i++) readCopy(s)
  } else if (a.type === 'compare') {
    s.comparison = [false, true].map((buffered) => {
      const trial = { ...initialFileIo(), source: [...s.source], buffered, bufferSize: s.bufferSize }
      while (!trial.eof) readCopy(trial)
      return {
        mode: buffered ? 'BufferedInputStream' : 'FileInputStream',
        calls: trial.readCalls,
        bytes: trial.copied,
      }
    })
    s.log = addLog(
      s.log,
      '同输入对照',
      '两组从相同文件开头读取完全相同字节，应用均一次读一字节；只改变输入预取大小。系统调用计数不等于磁盘读取次数。',
    )
  } else if (a.type === 'crash') {
    s.outputBuffer = []
    s.pageCache = [...s.disk]
    s.closed = true
    s.crashed = true
    s.log = addLog(
      s.log,
      '模拟主机断电恢复',
      `只恢复稳定文件 ${s.disk.length} 字节；进程缓冲和未持久页丢失。`,
      'warning',
    )
  } else if (a.type === 'force') {
    if (s.closed) return { ...state, error: '关联文件资源已关闭，不能继续 force。' }
    s.disk = [...s.pageCache]
    s.forceObserved ||= s.eof && s.outputBuffer.length === 0 && s.disk.length === s.source.length
    s.log = addLog(
      s.log,
      'FileChannel.force(true)',
      `持久化当前内核已接收的 ${s.disk.length} 字节；尚在 OutputStream 缓冲中的 ${s.outputBuffer.length} 字节不会凭空刷出。`,
    )
  } else {
    if (s.closed) return { ...state, error: '流已关闭，不能再次写入或 flush。' }
    flushStream(s)
    s.flushObserved ||= s.eof && s.pageCache.length === s.source.length && s.disk.length < s.source.length
    if (a.type === 'close') s.closed = true
    s.log = addLog(
      s.log,
      a.type === 'close' ? 'try-with-resources / close' : 'OutputStream.flush',
      '用户态输出缓冲已交给内核页缓存；正常 close 会释放资源，本身不保证主机断电后数据可恢复。',
    )
  }
  return s
}
export function presentFileIo(s: FileIoState): ExperimentView {
  const reached =
    s.source.length > 0 &&
    s.comparison.length === 2 &&
    s.comparison[1]!.calls < s.comparison[0]!.calls &&
    s.flushObserved &&
    s.forceObserved &&
    s.crashed &&
    s.disk.join(',') === s.source.join(',')
  return {
    scene: {
      kind: 'data',
      title: 'Stream 缓冲、Page Cache 和稳定文件是三个位置',
      tables: [
        {
          id: 'file-io-bytes',
          title: '同一字节流的去向',
          columns: ['位置', '字节数量', '十六进制内容'],
          rows: [
            ['源文件', s.source],
            ['输入预取剩余', s.inputBuffer],
            ['应用已复制', s.copied],
            ['输出流缓冲', s.outputBuffer],
            ['内核 Page Cache', s.pageCache],
            ['稳定文件', s.disk],
          ].map(([name, bytes]) => ({
            id: String(name),
            values: [
              String(name),
              (bytes as number[]).length,
              (bytes as number[]).map((b) => b.toString(16).padStart(2, '0')).join(' ') || '空',
            ],
          })),
        },
        {
          id: 'file-io-comparison',
          title: '同文件、同应用读粒度',
          columns: ['输入方式', 'read 系统调用', '复制字节数'],
          rows: s.comparison.map((r) => ({ id: r.mode, values: [r.mode, r.calls, r.bytes.length] })),
        },
      ],
      caption:
        '固定文件字节复制，InputStream.read 返回字节或 -1；BufferedInputStream 批量预取。系统调用只计教学 read/write 请求，不等于物理磁盘 IO。flush 与 force 展示进程、内核、稳定存储边界，假定本地存储正确兑现 force；不模拟设备缓存、目录 fsync、并发修改或完整异常链。',
    },
    metrics: [
      { label: '源文件字节数', value: s.source.length },
      { label: 'read 系统调用次数', value: s.readCalls },
      { label: 'write 系统调用次数', value: s.writeCalls },
      { label: 'EOF 已观察', value: String(s.eof) },
      { label: '恢复后的文本', value: new TextDecoder().decode(new Uint8Array(s.disk)) || '空' },
    ],
    controls: [
      { id: 'text', kind: 'text', label: '新源文件文本', value: s.text },
      {
        id: 'bufferSize',
        kind: 'number',
        label: '预取 / 输出缓冲容量',
        value: s.bufferSize,
        min: 2,
        max: 16,
      },
      {
        id: 'buffered',
        kind: 'select',
        label: '复制流的缓冲方式',
        value: s.buffered ? 'yes' : 'no',
        disabled: s.copied.length > 0,
        options: [
          { value: 'yes', label: 'Buffered Stream' },
          { value: 'no', label: '逐字节直接 IO' },
        ],
      },
      { id: 'open', kind: 'button', label: '从文本创建新文件并打开流' },
      { id: 'read', kind: 'button', label: '读取并复制一个字节', primary: true },
      { id: 'copy', kind: 'button', label: '复制直到 read 返回 -1' },
      { id: 'compare', kind: 'button', label: '对比有缓冲与无缓冲读取' },
      { id: 'flush', kind: 'button', label: 'flush · 清空输出流缓冲' },
      { id: 'force', kind: 'button', label: 'force · 持久化内核文件页' },
      { id: 'close', kind: 'button', label: 'close · 正常关闭流' },
      { id: 'crash', kind: 'button', label: '模拟断电并读取稳定文件' },
    ],
    status: {
      title: s.error
        ? '文件操作前提未满足'
        : reached
          ? '字节、调用成本与持久边界均已验证'
          : '复制完成不等于数据已稳定保存',
      detail: s.error ?? s.log.at(-1)?.detail ?? '复制到 EOF，对照 read 次数，再 flush、force 并模拟断电。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '同输入减少 read 调用，观察 flush 与 force 的差别，再从断电中恢复完整文本。', reached },
    log: s.log,
  }
}
export const fileIoEngine: EngineFactory = () => createSession(initialFileIo, fileIoTransition, presentFileIo)
