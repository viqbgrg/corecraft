import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
interface NioSocket {
  id: 'C1' | 'C2'
  kernel: number[]
  closedByPeer: boolean
  registered: boolean
  readInterest: boolean
  writeInterest: boolean
  output: number[]
  sent: number[]
  writable: number
  frames: string[]
  buffer: number[]
  position: number
  limit: number
  mode: 'write' | 'read'
  eof: boolean
}
export interface SelectorState {
  sockets: NioSocket[]
  selected: 'C1' | 'C2'
  packet: string
  quota: number
  selectedKeys: { id: string; ready: string[] }[]
  selects: number
  removed: boolean
  emptyWrites: number
  partial: boolean
  compacted: boolean
  interestRemoved: boolean
  error: string | null
  log: Observation[]
}
const socket = (id: 'C1' | 'C2'): NioSocket => ({
  id,
  kernel: [],
  closedByPeer: false,
  registered: false,
  readInterest: true,
  writeInterest: false,
  output: [],
  sent: [],
  writable: 2,
  frames: [],
  buffer: Array(16).fill(0),
  position: 0,
  limit: 16,
  mode: 'write',
  eof: false,
})
export function initialSelector(): SelectorState {
  return {
    sockets: [socket('C1'), socket('C2')],
    selected: 'C1',
    packet: '2,65',
    quota: 2,
    selectedKeys: [],
    selects: 0,
    removed: false,
    emptyWrites: 0,
    partial: false,
    compacted: false,
    interestRemoved: false,
    error: null,
    log: [],
  }
}
export function selectorTransition(state: SelectorState, a: ExperimentAction): SelectorState {
  if (a.type === 'selected' && ['C1', 'C2'].includes(String(a.value)))
    return { ...state, selected: a.value as SelectorState['selected'] }
  if (a.type === 'packet') return { ...state, packet: String(a.value ?? '') }
  if (a.type === 'quota') {
    const n = boundedInteger(a.value, 1, 8)
    return n === null ? state : { ...state, quota: n }
  }
  if (
    ![
      'register',
      'arrive',
      'peer-close',
      'select',
      'remove',
      'read',
      'flip',
      'decode',
      'compact',
      'write-interest',
      'write',
      'drain',
      'cancel',
    ].includes(a.type)
  )
    return state
  const s = structuredClone(state),
    c = s.sockets.find((c) => c.id === s.selected)!
  s.error = null
  let detail = ''
  if (a.type === 'register') {
    c.registered = true
    detail = '非阻塞 SocketChannel 注册 OP_READ；FileChannel 不是 SelectableChannel。'
  } else if (a.type === 'arrive') {
    const bytes = s.packet.split(',').map((p) => boundedInteger(p.trim(), 0, 255))
    if (bytes.length > 16 || bytes.some((b) => b === null))
      return { ...state, error: '输入最多 16 个 0–255 的十进制字节，以逗号分隔。' }
    if (c.closedByPeer) return { ...state, error: '对端已经发送 EOF，不能再到达数据。' }
    if (c.kernel.length + bytes.length > 64) return { ...state, error: '教学接收缓冲最多 64 字节。' }
    c.kernel.push(...(bytes as number[]))
    detail = `${bytes.length} 字节进入内核接收缓冲；不保证恰好构成一帧。`
  } else if (a.type === 'peer-close') {
    c.closedByPeer = true
    detail = '对端关闭发送方向；剩余字节读完后 read 才返回 -1。'
  } else if (a.type === 'select') {
    s.selects++
    let newly = 0
    for (const channel of s.sockets) {
      if (!channel.registered) continue
      const ready: string[] = []
      if (channel.readInterest && (channel.kernel.length > 0 || (channel.closedByPeer && !channel.eof)))
        ready.push('READ')
      if (channel.writeInterest && channel.writable > 0) ready.push('WRITE')
      if (!ready.length) continue
      const key = s.selectedKeys.find((k) => k.id === channel.id)
      if (key) key.ready = [...new Set([...key.ready, ...ready])]
      else {
        s.selectedKeys.push({ id: channel.id, ready })
        newly++
      }
    }
    detail = `本轮加入 ${newly} 个新 key，selected-key 集合保留 ${s.selectedKeys.length} 个；select 不读取字节，也不自动清空已选集合。`
  } else if (a.type === 'remove') {
    s.removed ||= s.selectedKeys.some((k) => k.id === c.id)
    s.selectedKeys = s.selectedKeys.filter((k) => k.id !== c.id)
    detail = '从 selected-key 集合移除当前 key；不会取消注册，也不关闭 Channel。'
  } else if (a.type === 'cancel') {
    c.registered = false
    s.selectedKeys = s.selectedKeys.filter((k) => k.id !== c.id)
    detail = '取消注册并在教学选择周期移除 key；连接字节仍属于独立的 Channel 状态。'
  } else if (a.type === 'read') {
    if (c.mode !== 'write')
      return { ...state, error: 'Buffer 当前处于读模式；消费后 compact，再接收 Channel 数据。' }
    const count = Math.min(s.quota, c.limit - c.position, c.kernel.length)
    if (!count) {
      if (c.position === c.limit) detail = 'Buffer 没有 remaining，read 返回 0，不等于 EOF。'
      else if (c.closedByPeer) {
        c.eof = true
        c.readInterest = false
        detail = '接收缓冲已空，对端已关闭，read 返回 -1。'
      } else detail = '当前没有可读字节，非阻塞 read 返回 0。'
    } else {
      for (const byte of c.kernel.splice(0, count)) c.buffer[c.position++] = byte
      detail = `Channel.read 实际复制 ${count} 字节，position=${c.position}。`
    }
  } else if (a.type === 'flip') {
    if (c.mode !== 'write') return state
    c.limit = c.position
    c.position = 0
    c.mode = 'read'
    detail = 'flip：limit=原 position，position=0，开始解析已接收区。'
  } else if (a.type === 'decode') {
    if (c.mode !== 'read') return { ...state, error: '先 flip，再读取帧。' }
    let frames = 0
    while (c.position < c.limit) {
      const length = c.buffer[c.position]!
      if (length > 12) return { ...state, error: '教学长度字段最大 12；协议非法，连接应由应用关闭。' }
      if (c.limit - c.position < length + 1) {
        s.partial = true
        break
      }
      c.position++
      const bytes = c.buffer.slice(c.position, c.position + length)
      c.position += length
      c.frames.push(new TextDecoder().decode(new Uint8Array(bytes)))
      c.output.push(length, ...bytes)
      frames++
    }
    detail = `解析 ${frames} 帧，未消费 ${c.limit - c.position} 字节；长度不足时保留头部，不能把半包当作完整消息。响应只排入用户态待写队列。`
  } else if (a.type === 'compact') {
    if (c.mode !== 'read') return state
    const remaining = c.buffer.slice(c.position, c.limit)
    s.compacted ||= s.partial && remaining.length > 0
    c.buffer = [...remaining, ...Array(16 - remaining.length).fill(0)]
    c.position = remaining.length
    c.limit = 16
    c.mode = 'write'
    detail = `compact 保留 ${remaining.length} 个未消费字节，position 指向其后，继续接收。clear 会丢失这部分解析进度。`
  } else if (a.type === 'write-interest') {
    c.writeInterest = !c.writeInterest
    s.interestRemoved ||= !c.writeInterest && c.output.length === 0 && c.sent.length > 0
    detail = `OP_WRITE=${c.writeInterest}；待发送队列为空后应撤销兴趣，避免可写 socket 反复立即唤醒。`
  } else if (a.type === 'drain') {
    c.writable = 2
    detail = '对端消耗发送数据，教学内核恢复两个字节的发送空间。'
  } else {
    const count = Math.min(s.quota, c.writable, c.output.length)
    if (!c.output.length) s.emptyWrites++
    c.sent.push(...c.output.splice(0, count))
    c.writable -= count
    detail = `非阻塞 write 实际接受 ${count} 字节，用户队列剩余 ${c.output.length}。内核接受不等于对端业务处理成功。`
  }
  s.log = addLog(s.log, a.type, detail)
  return s
}
export function presentSelector(s: SelectorState): ExperimentView {
  const reached =
    s.selects >= 2 &&
    s.removed &&
    s.partial &&
    s.compacted &&
    s.interestRemoved &&
    s.sockets.some((c) => c.frames.includes('AB') && c.sent.join(',') === '2,65,66')
  return {
    scene: {
      kind: 'data',
      title: 'Selector 通知就绪，Channel 搬运字节，Buffer 保留解析进度',
      tables: [
        {
          id: 'nio-keys',
          title: 'selected-key 集合',
          columns: ['Channel', 'readyOps'],
          rows: s.selectedKeys.map((k) => ({ id: k.id, values: [k.id, k.ready.join(' | ')] })),
        },
        {
          id: 'nio-sockets',
          title: 'SocketChannel 与用户态状态',
          columns: ['连接', '注册 / 兴趣', '内核待收', 'Buffer p/l', '未解析字节', '帧', '待写 / 已写'],
          rows: s.sockets.map((c) => ({
            id: c.id,
            values: [
              c.id,
              `${c.registered} / ${c.readInterest ? 'R' : ''}${c.writeInterest ? 'W' : ''}`,
              c.kernel.join(',') || '空',
              `${c.mode} ${c.position}/${c.limit}`,
              c.buffer
                .slice(c.mode === 'read' ? c.position : 0, c.mode === 'read' ? c.limit : c.position)
                .join(',') || '空',
              c.frames.join(' | ') || '无',
              `${c.output.join(',') || '空'} / ${c.sent.join(',') || '空'}`,
            ],
          })),
        },
      ],
      caption:
        '两个非阻塞 SocketChannel、16 字节 Buffer、单字节长度头与最多 12 字节载荷。read/write 的短传输真实改变位置；用显式 flip/compact 观察半包。selected keys 持续保留直到移除；不模拟操作系统 Provider、连接建立、增量字符解码或实际网络。',
    },
    metrics: [
      { label: 'select 次数', value: s.selects },
      { label: '空输出 write 次数', value: s.emptyWrites },
      { label: '完整帧数', value: s.sockets.reduce((n, c) => n + c.frames.length, 0) },
    ],
    controls: [
      {
        id: 'selected',
        kind: 'select',
        label: '当前 SocketChannel',
        value: s.selected,
        options: ['C1', 'C2'].map((id) => ({ value: id, label: id })),
      },
      { id: 'packet', kind: 'text', label: '到达的十进制字节', value: s.packet },
      { id: 'quota', kind: 'number', label: '单次 Channel 传输上限', value: s.quota, min: 1, max: 8 },
      ...[
        ['register', '注册非阻塞 Channel'],
        ['arrive', '注入到达字节'],
        ['select', 'Selector.select · 收集就绪'],
        ['remove', '移除当前 selected key'],
        ['read', 'Channel.read · 接收字节'],
        ['flip', 'Buffer.flip · 转为解析'],
        ['decode', '解析完整长度帧'],
        ['compact', 'Buffer.compact · 保留半包'],
        ['write-interest', '切换 OP_WRITE 兴趣'],
        ['write', 'Channel.write · 发送部分响应'],
        ['drain', '对端释放发送空间'],
        ['peer-close', '对端关闭发送方向'],
        ['cancel', '取消当前 key 注册'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'read' })),
    ],
    status: {
      title: s.error
        ? '操作或协议需要修正'
        : reached
          ? '半包保存与写就绪管理已验证'
          : '一次就绪通知不保证一条完整消息',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先收到 [2,65]，解析不足后 compact，再注入 [66] 得到 AB；响应分两次写完并撤销 OP_WRITE。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '保留并补全 AB 半包，分次发送完整响应，清空后撤销 OP_WRITE 兴趣。', reached },
    log: s.log,
  }
}
export const selectorEngine: EngineFactory = () =>
  createSession(initialSelector, selectorTransition, presentSelector)
