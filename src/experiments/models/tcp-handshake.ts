import type { EngineFactory, ExperimentAction, ExperimentView, NetworkMessage, Observation } from '../../types/experiment'
import { addLog, createSession, integer } from '../core/session'

export const seqNext = (n: number, consumed = 1): number => (n + consumed) >>> 0
export interface HandshakeState {
  client: 'CLOSED' | 'SYN_SENT' | 'ESTABLISHED'
  server: 'LISTEN' | 'SYN_RCVD' | 'ESTABLISHED'
  clientIsn: number
  serverIsn: number
  ack: number
  transport: 'deliver' | 'drop'
  synReceived: boolean
  synAckSent: boolean
  synAckReceived: boolean
  messages: NetworkMessage[]
  log: Observation[]
  attempts: number
  dropped: number
  errors: number
  duplicates: number
  faultObserved: boolean
}
export function initialHandshake(): HandshakeState {
  return { client: 'CLOSED', server: 'LISTEN', clientIsn: 1000, serverIsn: 8000, ack: 8001, transport: 'deliver', synReceived: false, synAckSent: false, synAckReceived: false, messages: [], log: [], attempts: 0, dropped: 0, errors: 0, duplicates: 0, faultObserved: false }
}
function packet(s: HandshakeState, message: NetworkMessage): boolean {
  const delivered = s.transport !== 'drop'
  s.attempts++
  if (!delivered) {
    s.dropped++
    s.faultObserved = true
    message.lost = true
    message.tone = 'danger'
  }
  s.transport = 'deliver'
  s.messages = [...s.messages, message].slice(-24)
  if (!delivered) s.log = addLog(s.log, message.label + ' 丢失', '发送端已经改变状态，接收端没有看到这条消息。下一次发送恢复正常，可手动重传。', 'warning')
  return delivered
}
export function transitionHandshake(state: HandshakeState, action: ExperimentAction): HandshakeState {
  const s = structuredClone(state)
  if (action.type === 'client-isn' && s.client === 'CLOSED' && s.server === 'LISTEN') {
    s.clientIsn = integer(action.value, 0, 0xffffffff, s.clientIsn)
    return s
  }
  if (action.type === 'server-isn' && s.client === 'CLOSED' && s.server === 'LISTEN') {
    s.serverIsn = integer(action.value, 0, 0xffffffff, s.serverIsn)
    s.ack = seqNext(s.serverIsn)
    return s
  }
  if (action.type === 'ack-number') { s.ack = integer(action.value, 0, 0xffffffff, s.ack); return s }
  if (action.type === 'transport' && ['deliver', 'drop'].includes(String(action.value))) { s.transport = action.value as HandshakeState['transport']; return s }
  if (action.type === 'syn' || action.type === 'duplicate-syn') {
    const duplicate = action.type === 'duplicate-syn'
    if (s.server === 'ESTABLISHED' || (!duplicate && s.client === 'ESTABLISHED') || (duplicate && !s.synReceived)) return state
    if (!duplicate) s.client = 'SYN_SENT'
    if (duplicate) { s.duplicates++; s.faultObserved = true }
    const delivered = packet(s, { from: 'client', to: 'server', label: duplicate ? 'SYN · duplicate' : 'SYN', detail: 'Seq = ' + s.clientIsn, tone: duplicate ? 'warning' : 'neutral' })
    if (delivered) {
      const already = s.synReceived
      s.synReceived = true
      s.server = 'SYN_RCVD'
      s.log = addLog(s.log, already ? '识别重复 SYN' : 'Server 收到 SYN', already ? '相同初始序号对应同一个半连接，不创建第二个连接；可以重发原 SYN+ACK。' : 'Server 记录 Client 的初始序号 ' + s.clientIsn + '，期望下一个序号 ' + seqNext(s.clientIsn) + '。', already ? 'warning' : 'success')
    }
  } else if (action.type === 'syn-ack') {
    if (s.server !== 'SYN_RCVD') return state
    const repeat = s.synAckSent
    s.synAckSent = true
    const delivered = packet(s, { from: 'server', to: 'client', label: repeat ? 'SYN + ACK · retransmit' : 'SYN + ACK', detail: 'Seq = ' + s.serverIsn + '   Ack = ' + seqNext(s.clientIsn), tone: 'success' })
    if (delivered) {
      s.client = 'ESTABLISHED'
      s.synAckReceived = true
      s.log = addLog(s.log, repeat ? '重发的 SYN+ACK 已到达' : 'Client 确认 Server 的初始序号', 'Client 进入 ESTABLISHED，但 Server 仍是 SYN_RCVD。最后的 ACK 用来确认 Server 的 SYN；实际协议栈会自动发送它。', 'success')
    }
  } else if (action.type === 'ack') {
    if (!s.synAckReceived || s.server !== 'SYN_RCVD') return state
    const expected = seqNext(s.serverIsn)
    const valid = s.ack === expected
    const delivered = packet(s, { from: 'client', to: 'server', label: valid ? 'ACK' : 'ACK · invalid', detail: 'Seq = ' + seqNext(s.clientIsn) + '   Ack = ' + s.ack, tone: valid ? 'success' : 'danger' })
    if (delivered && valid) {
      s.server = 'ESTABLISHED'
      s.log = addLog(s.log, '双方 ESTABLISHED', 'Server 收到对自身 SYN 的确认。纯 ACK 不消耗序列号，双方已经同步初始序号。', 'success')
    } else if (delivered) {
      s.errors++
      s.faultObserved = true
      s.messages.push({ from: 'server', to: 'client', label: 'RST · unacceptable ACK', detail: 'Seq = ' + s.ack + ' · 仅展示拒绝响应', tone: 'danger' })
      s.log = addLog(s.log, '错误 ACK，不能建立连接', '应确认 ' + expected + '，实际收到 ' + s.ack + '。Server 保持 SYN_RCVD 并发出 RST。本教学模型省略 RST 在 Client 的验序处理；可改正 ACK 再验证。', 'danger')
    }
  } else return state
  return s
}
export function presentHandshake(s: HandshakeState): ExperimentView {
  const connected = s.client === 'ESTABLISHED' && s.server === 'ESTABLISHED'
  const started = s.client !== 'CLOSED' || s.server !== 'LISTEN'
  return {
    scene: {
      kind: 'network', layout: 'sequence',
      nodes: [{ id: 'client', label: 'Client', subtitle: '主动打开连接', state: s.client, active: s.client === 'ESTABLISHED' }, { id: 'server', label: 'Server', subtitle: '监听端口', state: s.server, active: s.server === 'ESTABLISHED' }],
      messages: s.messages,
      caption: 'SYN 占用一个序列号；纯 ACK 不占用。32 位序列号按模 2³² 回绕。报文传输由你手动推进。',
    },
    controls: [
      { id: 'client-isn', kind: 'number', label: 'Client 初始 Seq', value: s.clientIsn, min: 0, max: 0xffffffff, disabled: started },
      { id: 'server-isn', kind: 'number', label: 'Server 初始 Seq', value: s.serverIsn, min: 0, max: 0xffffffff, disabled: started },
      { id: 'ack-number', kind: 'number', label: '最后 ACK 的确认号', value: s.ack, min: 0, max: 0xffffffff },
      { id: 'transport', kind: 'select', label: '下一次发送', value: s.transport, options: [{ value: 'deliver', label: '正常送达' }, { value: 'drop', label: '模拟丢包（仅一次）' }] },
      { id: 'syn', kind: 'button', label: s.client === 'SYN_SENT' ? '重传 SYN' : '发送 SYN', disabled: s.client === 'ESTABLISHED' || s.server === 'ESTABLISHED', primary: s.client === 'CLOSED' || !s.synReceived },
      { id: 'syn-ack', kind: 'button', label: s.synAckSent ? '重传 SYN+ACK' : '发送 SYN+ACK', disabled: s.server !== 'SYN_RCVD', primary: s.server === 'SYN_RCVD' && !s.synAckReceived },
      { id: 'ack', kind: 'button', label: '发送 ACK', disabled: !s.synAckReceived || s.server !== 'SYN_RCVD', primary: s.synAckReceived && s.server === 'SYN_RCVD' },
      { id: 'duplicate-syn', kind: 'button', label: '注入重复 SYN', disabled: !s.synReceived || s.server !== 'SYN_RCVD' },
    ],
    metrics: [{ label: 'Client State', value: s.client }, { label: 'Server State', value: s.server }, { label: 'Server 期望 ACK', value: seqNext(s.serverIsn) }, { label: '丢包 / 错误 ACK', value: s.dropped + ' / ' + s.errors }],
    status: { title: connected ? '连接建立，双方终于知道同一件事。' : '连接状态属于端点，而不是整条连线。', detail: s.log.at(-1)?.detail ?? '先发送 SYN。试着让最后一个 ACK 丢失，再判断哪一端仍然不知道握手完成。', tone: connected ? 'success' : s.log.at(-1)?.tone ?? 'neutral' },
    log: s.log,
    goal: { label: '尝试丢包、错误 ACK 或重复 SYN，然后让双方完成握手。', reached: connected && s.faultObserved },
  }
}
export const handshakeEngine: EngineFactory = () => createSession(initialHandshake, transitionHandshake, presentHandshake)
