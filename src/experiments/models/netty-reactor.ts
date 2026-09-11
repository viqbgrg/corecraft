import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
interface ByteBuf {
  id: number
  bytes: number[]
  refs: number
}
interface BusinessJob {
  id: number
  channel: string
  buf: number
  remaining: number
  offloaded: boolean
  held: boolean
}
interface NettyChannel {
  id: string
  incoming: { bytes: number[]; cost: number }[]
  cumulation: number[]
  output: number[]
  sent: number[]
  writable: boolean
  autoRead: boolean
}
type LoopEvent =
  { kind: 'read'; channel: string } | { kind: 'response'; channel: string; bytes: number[]; job: number }
export interface ReactorState {
  channels: NettyChannel[]
  selected: string
  text: string
  cost: number
  offload: boolean
  retain: boolean
  events: LoopEvent[]
  buffers: ByteBuf[]
  jobs: BusinessJob[]
  local: BusinessJob | null
  next: number
  clock: number
  completed: { id: number; channel: string; clock: number }[]
  stallTicks: number
  released: number
  invalidAccess: number
  backpressure: boolean
  resumed: boolean
  overtook: boolean
  error: string | null
  log: Observation[]
}
export function initialReactor(): ReactorState {
  return {
    channels: ['C1', 'C2'].map((id) => ({
      id,
      incoming: [],
      cumulation: [],
      output: [],
      sent: [],
      writable: true,
      autoRead: true,
    })),
    selected: 'C1',
    text: 'abcdefghij',
    cost: 4,
    offload: true,
    retain: true,
    events: [],
    buffers: [],
    jobs: [],
    local: null,
    next: 1,
    clock: 0,
    completed: [],
    stallTicks: 0,
    released: 0,
    invalidAccess: 0,
    backpressure: false,
    resumed: false,
    overtook: false,
    error: null,
    log: [],
  }
}
function release(s: ReactorState, b: ByteBuf) {
  if (b.refs > 0) {
    b.refs--
    if (!b.refs) s.released++
  }
}
function finishBusiness(s: ReactorState, job: BusinessJob) {
  const b = s.buffers.find((b) => b.id === job.buf)!
  if (!b.refs) {
    s.invalidAccess++
    s.log = addLog(
      s.log,
      'IllegalReferenceCountException',
      '异步任务访问已自动释放的 ByteBuf，缺少 retain；不会产生虚构响应。',
      'warning',
    )
    return
  }
  const result = [
    ...new TextEncoder().encode(new TextDecoder().decode(new Uint8Array(b.bytes)).toUpperCase()),
  ]
  s.events.push({ kind: 'response', channel: job.channel, bytes: [result.length, ...result], job: job.id })
  release(s, b)
}
function workers(s: ReactorState) {
  if (!s.jobs.length) return false
  s.clock++
  for (const job of s.jobs.slice(0, 2)) {
    job.remaining--
    if (!job.remaining) {
      finishBusiness(s, job)
      s.jobs = s.jobs.filter((j) => j.id !== job.id)
    }
  }
  return true
}
function scheduleRead(s: ReactorState, c: NettyChannel) {
  if (c.autoRead && c.incoming.length && !s.events.some((e) => e.kind === 'read' && e.channel === c.id))
    s.events.push({ kind: 'read', channel: c.id })
}
function loop(s: ReactorState) {
  if (s.local) {
    s.clock++
    s.stallTicks++
    s.local.remaining--
    if (!s.local.remaining) {
      finishBusiness(s, s.local)
      s.local = null
    }
    return true
  }
  const e = s.events.shift()
  if (!e) return false
  s.clock++
  const c = s.channels.find((c) => c.id === e.channel)!
  if (e.kind === 'response') {
    c.output.push(...e.bytes)
    s.completed.push({ id: e.job, channel: c.id, clock: s.clock })
    s.overtook ||= c.id === 'C2' && s.jobs.some((j) => j.channel === 'C1')
    if (c.output.length > 8) {
      c.writable = false
      c.autoRead = false
      s.backpressure = true
    }
    s.log = addLog(
      s.log,
      'Outbound Encoder → Channel',
      `${c.id} 编码 ${e.bytes.length} 字节，待写=${c.output.length}；writable=${c.writable}，应用联动 autoRead=${c.autoRead}。实际 Netty 不会自动替应用暂停所有读。`,
    )
  } else {
    if (!c.autoRead) return true
    const packet = c.incoming.shift()
    if (!packet) return true
    c.cumulation.push(...packet.bytes)
    while (c.cumulation.length && c.cumulation.length >= c.cumulation[0]! + 1) {
      const len = c.cumulation.shift()!,
        bytes = c.cumulation.splice(0, len),
        id = s.next++,
        buf: ByteBuf = { id, bytes, refs: 1 }
      s.buffers.push(buf)
      const job: BusinessJob = {
        id,
        channel: c.id,
        buf: id,
        remaining: packet.cost,
        offloaded: s.offload,
        held: s.offload && s.retain,
      }
      if (s.offload) {
        if (s.retain) buf.refs++
        s.jobs.push(job)
        release(s, buf)
      } else {
        s.local = job
      }
      s.log = addLog(
        s.log,
        'Inbound Decoder → Business',
        `${c.id} 解码长度 ${len} 的完整帧，ByteBuf ${id} refCnt=${buf.refs}。${s.offload ? '提交给业务执行器，入站自动释放自己的引用。' : '业务留在 EventLoop，执行期间其他连接事件排队。'}`,
      )
    }
    scheduleRead(s, c)
  }
  return true
}
export function reactorTransition(state: ReactorState, a: ExperimentAction): ReactorState {
  if (a.type === 'selected' && ['C1', 'C2'].includes(String(a.value)))
    return { ...state, selected: String(a.value) }
  if (a.type === 'text') return { ...state, text: String(a.value ?? '') }
  if (a.type === 'cost') {
    const n = boundedInteger(a.value, 1, 8)
    return n === null ? state : { ...state, cost: n }
  }
  if (['offload', 'retain'].includes(a.type) && ['on', 'off'].includes(String(a.value)))
    return { ...state, [a.type]: a.value === 'on' }
  if (!['submit', 'loop', 'workers', 'run', 'flush', 'flush-all'].includes(a.type)) return state
  const s = structuredClone(state),
    c = s.channels.find((c) => c.id === s.selected)!
  s.error = null
  if (a.type === 'submit') {
    const bytes = [...new TextEncoder().encode(s.text)]
    if (bytes.length === 0 || bytes.length > 12)
      return { ...state, error: '教学请求需要 1–12 个 UTF-8 字节。' }
    if (s.next + s.channels.reduce((n, c) => n + c.incoming.length, 0) > 20)
      return { ...state, error: '最多演示 20 个请求，请重置。' }
    c.incoming.push({ bytes: [bytes.length, ...bytes], cost: s.cost })
    scheduleRead(s, c)
    s.log = addLog(
      s.log,
      'Channel 收到请求',
      `${c.id} 收到长度帧，进入入站事件；每个 Channel 固定由同一个教学 EventLoop 串行处理。`,
    )
  } else if (a.type === 'loop') loop(s)
  else if (a.type === 'workers') workers(s)
  else if (a.type === 'run') {
    for (let i = 0; i < 256; i++) {
      const progressed = loop(s)
      const worked = workers(s)
      if (!progressed && !worked) break
    }
  } else {
    const channels = a.type === 'flush-all' ? s.channels : [c]
    for (const channel of channels) {
      const count = a.type === 'flush-all' ? channel.output.length : Math.min(2, channel.output.length)
      channel.sent.push(...channel.output.splice(0, count))
      if (!channel.writable && channel.output.length < 3) {
        channel.writable = true
        channel.autoRead = true
        s.resumed = true
        scheduleRead(s, channel)
      }
    }
    s.log = addLog(
      s.log,
      'Flush / 可写性变化',
      '输出被教学下游接纳；低于低水位 3 后 writable=true，应用恢复 autoRead。高水位 8、低水位 3 构成滞回，避免阈值附近反复切换。',
    )
  }
  return s
}
export function presentReactor(s: ReactorState): ExperimentView {
  const reached =
    s.overtook &&
    s.backpressure &&
    s.resumed &&
    s.invalidAccess === 0 &&
    s.buffers.length >= 2 &&
    s.buffers.every((b) => b.refs === 0) &&
    s.channels.every((c) => c.output.length === 0)
  return {
    scene: {
      kind: 'data',
      title: '一个 EventLoop 串行处理多个 Channel，业务执行器承担耗时工作',
      sequence: [
        { label: 'Inbound', value: 'Channel → Decoder → Business' },
        { label: 'Outbound', value: 'Business → Encoder → Channel' },
      ],
      tables: [
        {
          id: 'reactor-channels',
          title: 'Channel、待写量与读背压',
          columns: ['连接', '等待入站', '待写字节', 'writable / autoRead', '已发字节'],
          rows: s.channels.map((c) => ({
            id: c.id,
            values: [
              c.id,
              c.incoming.length,
              c.output.length,
              `${c.writable} / ${c.autoRead}`,
              c.sent.length,
            ],
          })),
        },
        {
          id: 'reactor-jobs',
          title: '业务执行器 / 最多两任务同时服务',
          columns: ['任务', 'Channel', '剩余', '执行位置'],
          rows: [...(s.local ? [s.local] : []), ...s.jobs].map((j) => ({
            id: String(j.id),
            values: [j.id, j.channel, j.remaining, j.offloaded ? '业务执行器' : 'EventLoop 内阻塞'],
          })),
        },
        {
          id: 'reactor-buffers',
          title: 'ByteBuf 引用计数',
          columns: ['Buf', '载荷', 'refCnt'],
          rows: s.buffers.map((b) => ({
            id: String(b.id),
            values: [b.id, new TextDecoder().decode(new Uint8Array(b.bytes)), b.refs],
          })),
        },
        {
          id: 'reactor-completed',
          title: '回到 EventLoop 的响应顺序',
          columns: ['请求', 'Channel', '时隙'],
          rows: s.completed.map((r) => ({ id: String(r.id), values: [r.id, r.channel, r.clock] })),
        },
      ],
      caption:
        '一个 Reactor EventLoop、两个连接与双任务业务执行器。固定 Decoder → Business → Encoder 管线，真实长度帧与大写转换；单次接收为一帧，半包细节在 NIO 课。引用计数模仿自动释放入站 handler 的所有权交接；业务回调显式回到 EventLoop。水位改变可写性，autoRead 联动是本应用策略。无真实 Netty 线程、池化分配、TLS 或 TCP ACK。',
    },
    metrics: [
      { label: 'EventLoop 被业务占用时隙', value: s.stallTicks },
      { label: '释放的 ByteBuf', value: s.released },
      { label: '无效引用访问', value: s.invalidAccess },
      { label: '响应完成数', value: s.completed.length },
    ],
    controls: [
      {
        id: 'selected',
        kind: 'select',
        label: '提交到哪个 Channel',
        value: s.selected,
        options: ['C1', 'C2'].map((id) => ({ value: id, label: id })),
      },
      { id: 'text', kind: 'text', label: '请求文本', value: s.text },
      { id: 'cost', kind: 'number', label: '新请求业务服务时隙', value: s.cost, min: 1, max: 8 },
      {
        id: 'offload',
        kind: 'select',
        label: '新入站任务的执行位置',
        value: s.offload ? 'on' : 'off',
        options: [
          { value: 'on', label: '业务执行器 offload' },
          { value: 'off', label: '留在 EventLoop' },
        ],
      },
      {
        id: 'retain',
        kind: 'select',
        label: '异步交接是否 retain',
        value: s.retain ? 'on' : 'off',
        options: [
          { value: 'on', label: 'retain 后交接' },
          { value: 'off', label: '遗漏 retain / 反例' },
        ],
      },
      ...[
        ['submit', '提交长度帧请求'],
        ['loop', 'EventLoop 执行一个事件'],
        ['workers', '业务执行器推进一个时隙'],
        ['run', '运行到当前事件与业务完成'],
        ['flush', '当前 Channel 发送两个字节'],
        ['flush-all', '下游接纳所有待写响应'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'loop' })),
    ],
    status: {
      title: s.error
        ? '请求不符合教学输入'
        : reached
          ? '事件循环、引用交接与背压形成完整路径'
          : '耗时业务会延迟同一 EventLoop 上其他连接',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '提交 C1 默认长任务，再给 C2 提交 ok、耗时 1；先运行两个入站事件，观察短任务先返回与长响应触发水位。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '正确交接 ByteBuf，让 C2 短任务先于 C1 返回，并观察高低水位背压恢复且释放全部引用。',
      reached,
    },
    log: s.log,
  }
}
export const reactorEngine: EngineFactory = () =>
  createSession(initialReactor, reactorTransition, presentReactor)
