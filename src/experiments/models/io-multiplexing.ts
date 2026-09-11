import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type IoMode = 'blocking' | 'nonblocking' | 'select' | 'poll' | 'epoll-lt' | 'epoll-et'
const labels: Record<IoMode, string> = {
  blocking: '阻塞 read',
  nonblocking: '非阻塞 read',
  select: 'select + 非阻塞 read',
  poll: 'poll + 非阻塞 read',
  'epoll-lt': 'epoll LT + 非阻塞 read',
  'epoll-et': 'epoll ET + 非阻塞 read',
}
const descriptors = [3, 40, 99]
export interface IoState {
  mode: IoMode
  buffers: { fd: number; data: string; received: string; consumed: string }[]
  selected: number
  arrivalFd: number
  payload: string
  count: number
  pending: { fd: number; count: number } | null
  events: number[]
  reported: number[]
  reads: number
  checks: number
  eagain: number
  lastResult: string
  partialFd: number | null
  silence: boolean
  drained: boolean
  comparison: { mode: string; candidates: number; ready: number[] }[]
  error: string | null
  log: Observation[]
}
export function initialIo(mode: IoMode = 'epoll-et'): IoState {
  if (!Object.hasOwn(labels, mode)) throw new Error('Unsupported IO mode')
  return {
    mode,
    buffers: descriptors.map((fd) => ({ fd, data: '', received: '', consumed: '' })),
    selected: 3,
    arrivalFd: 3,
    payload: 'abcd',
    count: 2,
    pending: null,
    events: [],
    reported: [],
    reads: 0,
    checks: 0,
    eagain: 0,
    lastResult: '—',
    partialFd: null,
    silence: false,
    drained: false,
    comparison: [],
    error: null,
    log: [],
  }
}
function consume(s: IoState, fd: number, count: number): string {
  const buffer = s.buffers.find((buffer) => buffer.fd === fd)!
  const result = buffer.data.slice(0, count)
  buffer.data = buffer.data.slice(result.length)
  buffer.consumed += result
  if (!buffer.data.length) s.events = s.events.filter((event) => event !== fd)
  return result
}
export function ioTransition(state: IoState, a: ExperimentAction): IoState {
  if (a.type === 'mode' && Object.hasOwn(labels, String(a.value))) return initialIo(a.value as IoMode)
  if (a.type === 'arrival-fd' || a.type === 'selected') {
    const fd = Number(a.value)
    return descriptors.includes(fd) && !(state.pending && a.type === 'selected')
      ? { ...state, [a.type === 'selected' ? 'selected' : 'arrivalFd']: fd }
      : state
  }
  if (a.type === 'payload') return { ...state, payload: String(a.value ?? ''), error: null }
  if (a.type === 'count' && !state.pending) {
    const count = boundedInteger(a.value, 1, 16)
    return count === null ? state : { ...state, count }
  }
  if (!['arrive', 'read', 'drain', 'wait', 'compare'].includes(a.type)) return state
  if (state.pending && !['arrive', 'compare'].includes(a.type)) return state
  const s: IoState = {
    ...state,
    buffers: state.buffers.map((b) => ({ ...b })),
    events: [...state.events],
    reported: [...state.reported],
    error: null,
  }
  let detail = ''
  if (a.type === 'arrive') {
    const buffer = s.buffers.find((buffer) => buffer.fd === s.arrivalFd)!
    if (!/^[\x20-\x7e]{1,16}$/.test(s.payload) || buffer.data.length + s.payload.length > 16)
      return {
        ...state,
        error: '每次到达限 1–16 个可打印 ASCII 字节；每个接收缓冲最多 16 字节，溢出时整次到达被拒绝。',
      }
    buffer.data += s.payload
    buffer.received += s.payload
    if (!s.events.includes(buffer.fd)) s.events.push(buffer.fd)
    detail = `FD ${buffer.fd} 收到「${s.payload}」，接收缓冲现有 ${buffer.data.length} 字节；新的到达可以产生就绪事件，多次事件可合并。`
    if (s.pending?.fd === buffer.fd) {
      const result = consume(s, buffer.fd, s.pending.count)
      s.pending = null
      s.lastResult = result
      detail += ` 阻塞 read 返回「${result}」，线程恢复。`
    } else if (s.pending) detail += ` 线程仍阻塞在 FD ${s.pending.fd}，不会自动改去读取 FD ${buffer.fd}。`
  } else if (a.type === 'read' || a.type === 'drain') {
    if (a.type === 'drain' && s.mode === 'blocking') return state
    const buffer = s.buffers.find((buffer) => buffer.fd === s.selected)!
    let result = '',
      calls = 0
    do {
      s.reads++
      calls++
      if (!buffer.data.length) {
        if (s.mode === 'blocking') {
          s.pending = { fd: buffer.fd, count: s.count }
          s.lastResult = `阻塞于 FD ${buffer.fd}`
          detail = `FD ${buffer.fd} 暂无字节，线程睡眠，等待此 FD 的数据到达。`
        } else {
          s.eagain++
          s.lastResult = result ? `${result} → EAGAIN` : 'EAGAIN'
          detail = `FD ${buffer.fd} 当前已无可读字节，read 返回 EAGAIN。`
          if (a.type === 'drain' && result && s.partialFd === buffer.fd && s.silence) s.drained = true
        }
        break
      }
      const chunk = consume(s, buffer.fd, s.count)
      result += chunk
      s.lastResult = result
      detail = `read FD ${buffer.fd} 返回「${result}」，缓冲剩 ${buffer.data.length} 字节。`
      if (s.mode === 'epoll-et' && buffer.data.length && s.reported.includes(buffer.fd))
        s.partialFd = buffer.fd
    } while (a.type === 'drain')
    if (a.type === 'drain')
      detail = `连续 ${calls} 次 read，取出「${result}」，最终返回 EAGAIN。缓冲已被读空。`
  } else if (a.type === 'wait') {
    if (['blocking', 'nonblocking'].includes(s.mode)) return state
    const ready = s.buffers.filter((buffer) => buffer.data.length).map((buffer) => buffer.fd)
    const reported = s.mode === 'epoll-et' ? s.events.filter((fd) => ready.includes(fd)) : ready
    s.checks +=
      s.mode === 'select'
        ? Math.max(...descriptors) + 1
        : s.mode === 'poll'
          ? descriptors.length
          : reported.length
    s.reported = [...reported]
    if (s.mode === 'epoll-et') {
      s.events = []
      if (s.partialFd !== null && ready.includes(s.partialFd) && !reported.includes(s.partialFd))
        s.silence = true
    }
    detail = `${labels[s.mode]} 的零超时检查返回 ${reported.length ? reported.map((fd) => `FD ${fd}`).join('、') : '0 个事件'}。${s.mode === 'epoll-et' && ready.length && !reported.length ? '缓冲仍有字节，但当前没有新通知；应继续非阻塞读取至 EAGAIN。' : '就绪只表示这次观察时可读，不等于完整应用消息已经到齐。'}`
  } else {
    const ready = s.buffers.filter((buffer) => buffer.data.length).map((buffer) => buffer.fd)
    s.comparison = [
      { mode: 'select', candidates: Math.max(...descriptors) + 1, ready },
      { mode: 'poll', candidates: descriptors.length, ready },
      { mode: 'epoll LT', candidates: ready.length, ready },
    ]
    detail =
      '按当前相同的就绪集合比较查找方式：select 的 fd 编号范围、poll 的注册数组、epoll 的就绪集合。不是实际内核指令数或完整复杂度基准。'
  }
  s.log = addLog(s.log, a.type, detail, s.pending || s.lastResult === 'EAGAIN' ? 'warning' : 'neutral')
  return s
}
export function presentIo(s: IoState): ExperimentView {
  const reached = s.silence && s.drained && s.comparison.length === 3
  const multiplexer = !['blocking', 'nonblocking'].includes(s.mode)
  return {
    scene: {
      kind: 'data',
      title: '就绪事件与缓冲里的字节是不同状态',
      cards: [
        { id: 'thread', label: '线程状态', value: s.pending ? `阻塞于 FD ${s.pending.fd}` : '可运行' },
        { id: 'events', label: '最近一次返回的就绪事件', value: s.reported.join(', ') || '无' },
        { id: 'pending', label: '待交付的到达通知 / 可合并', value: s.events.join(', ') || '无' },
      ],
      tables: [
        {
          id: 'io-buffers',
          title: '三个已注册描述符的接收缓冲',
          columns: ['FD', '未读字节', '长度', '累计已读取'],
          rows: s.buffers.map((buffer) => ({
            id: String(buffer.fd),
            values: [buffer.fd, buffer.data || '空', buffer.data.length, buffer.consumed || '无'],
          })),
        },
        {
          id: 'io-comparison',
          title: '同一就绪集合的候选检查示意',
          columns: ['机制', '候选检查数', '就绪 FD'],
          rows: s.comparison.map((row) => ({
            id: row.mode,
            values: [row.mode, row.candidates, row.ready.join(', ') || '无'],
          })),
        },
      ],
      caption:
        'ET 在本模型中对新字节到达排队通知，可合并；并非断言真实 Linux 只在“空→非空”时触发。LT 每次检查仍可报告未读数据。仅模拟可读事件，不覆盖 EOF、错误、写就绪、并发竞争或内核锁。',
    },
    metrics: [
      { label: 'read 调用次数', value: s.reads },
      { label: 'EAGAIN 次数', value: s.eagain },
      { label: '就绪候选检查', value: s.checks },
      { label: '最近 read 返回', value: s.lastResult },
    ],
    controls: [
      {
        id: 'mode',
        kind: 'select',
        label: 'IO 与通知方式 / 修改会重置',
        value: s.mode,
        options: (Object.keys(labels) as IoMode[]).map((mode) => ({ value: mode, label: labels[mode] })),
      },
      {
        id: 'selected',
        kind: 'select',
        label: '程序读取的 FD',
        value: s.selected,
        disabled: !!s.pending,
        options: descriptors.map((fd) => ({ value: String(fd), label: `FD ${fd}` })),
      },
      {
        id: 'count',
        kind: 'number',
        label: '单次 read 最多字节',
        value: s.count,
        min: 1,
        max: 16,
        disabled: !!s.pending,
      },
      {
        id: 'arrival-fd',
        kind: 'select',
        label: '外部数据到达 FD',
        value: s.arrivalFd,
        options: descriptors.map((fd) => ({ value: String(fd), label: `FD ${fd}` })),
      },
      { id: 'payload', kind: 'text', label: '到达的 ASCII 字节', value: s.payload },
      { id: 'arrive', kind: 'button', label: '模拟数据到达', primary: true },
      {
        id: 'wait',
        kind: 'button',
        label: '检查一次就绪事件 / timeout=0',
        disabled: !multiplexer || !!s.pending,
      },
      { id: 'read', kind: 'button', label: '只调用一次 read', disabled: !!s.pending },
      {
        id: 'drain',
        kind: 'button',
        label: '循环 read 直到 EAGAIN',
        disabled: s.mode === 'blocking' || !!s.pending,
      },
      { id: 'compare', kind: 'button', label: '对比 select、poll 与 epoll' },
    ],
    status: {
      title: s.error
        ? '检查缓冲输入'
        : reached
          ? '通知后继续读，直到暂时读空'
          : s.pending
            ? '线程正在等待指定的 FD'
            : '通知不会替应用读取数据',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '默认 ET：到达 abcd，取事件后只读 ab，再检查事件；缓冲剩 cd 但没有新通知，继续读至 EAGAIN。',
      tone: s.error || s.pending ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '观察 ET 通知后部分读取、剩余字节无新通知，再读至 EAGAIN，并对比三种就绪查找方式。',
      reached,
    },
    log: s.log,
  }
}
export const ioEngine: EngineFactory = (config) =>
  createSession(() => initialIo((config.mode ?? 'epoll-et') as IoMode), ioTransition, presentIo)
