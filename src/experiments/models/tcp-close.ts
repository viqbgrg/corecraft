import type {
  EngineFactory,
  ExperimentAction,
  ExperimentView,
  NetworkMessage,
  Observation,
} from '../../types/experiment'
import { addLog, createSession, integer } from '../core/session'
import { seqNext } from './tcp-handshake'

export interface CloseState {
  client: 'ESTABLISHED' | 'FIN_WAIT_1' | 'FIN_WAIT_2' | 'TIME_WAIT' | 'CLOSED'
  server: 'ESTABLISHED' | 'CLOSE_WAIT' | 'LAST_ACK' | 'CLOSED'
  cSeq: number
  sSeq: number
  bytes: number
  transferred: number
  msl: number
  dropAck: boolean
  ackLost: boolean
  messages: NetworkMessage[]
  log: Observation[]
}
export function initialClose(): CloseState {
  return {
    client: 'ESTABLISHED',
    server: 'ESTABLISHED',
    cSeq: 1001,
    sSeq: 8001,
    bytes: 12,
    transferred: 0,
    msl: 0,
    dropAck: false,
    ackLost: false,
    messages: [],
    log: [],
  }
}
export function transitionClose(state: CloseState, action: ExperimentAction): CloseState {
  const s = structuredClone(state)
  const message = (from: string, to: string, label: string, seq: number, ack: number, lost = false) => {
    s.messages = [
      ...s.messages,
      {
        from,
        to,
        label,
        detail: 'Seq = ' + seq + '   Ack = ' + ack,
        tone: lost ? 'danger' : 'success',
        lost,
      } satisfies NetworkMessage,
    ].slice(-24)
  }
  if (action.type === 'bytes') {
    s.bytes = integer(action.value, 1, 64, s.bytes)
    return s
  }
  if (action.type === 'ack-delivery') {
    s.dropAck = action.value === 'drop'
    return s
  }
  if (action.type === 'client-fin' && s.client === 'ESTABLISHED') {
    message('client', 'server', 'FIN', s.cSeq, s.sSeq)
    s.cSeq = seqNext(s.cSeq)
    s.client = 'FIN_WAIT_1'
    s.server = 'CLOSE_WAIT'
    s.log = addLog(
      s.log,
      'Client 关闭发送方向',
      'FIN 消耗一个序列号。Server 进入 CLOSE_WAIT，知道对方不再发送，但仍可发送剩余数据。',
    )
  } else if (action.type === 'server-ack' && s.client === 'FIN_WAIT_1') {
    message('server', 'client', 'ACK', s.sSeq, s.cSeq)
    s.client = 'FIN_WAIT_2'
    s.log = addLog(
      s.log,
      'Client 的 FIN 已被确认',
      'Client 进入 FIN_WAIT_2，继续接收数据；Server 仍在 CLOSE_WAIT，等待自己的应用关闭发送方向。',
      'success',
    )
  } else if (action.type === 'data' && s.client === 'FIN_WAIT_2' && s.server === 'CLOSE_WAIT') {
    message('server', 'client', 'DATA · ' + s.bytes + ' B', s.sSeq, s.cSeq)
    s.sSeq = seqNext(s.sSeq, s.bytes)
    s.transferred += s.bytes
    message('client', 'server', 'ACK · data', s.cSeq, s.sSeq)
    s.log = addLog(
      s.log,
      '半关闭仍能接收数据',
      'Server 发送 ' +
        s.bytes +
        ' 字节，Client 自动确认。两个方向可以独立结束，因此确认 FIN 不等于发出自己的 FIN。',
      'success',
    )
  } else if (action.type === 'server-fin' && s.client === 'FIN_WAIT_2' && s.server === 'CLOSE_WAIT') {
    message('server', 'client', 'FIN', s.sSeq, s.cSeq)
    s.sSeq = seqNext(s.sSeq)
    s.server = 'LAST_ACK'
    s.client = 'TIME_WAIT'
    s.msl = 0
    s.log = addLog(
      s.log,
      'Server 也关闭发送方向',
      'Server 等待最后的 ACK。Client 收到 FIN 后进入 TIME_WAIT；真实协议栈会立即回复 ACK。',
    )
  } else if (action.type === 'client-ack' && s.client === 'TIME_WAIT' && s.server === 'LAST_ACK') {
    message('client', 'server', 'ACK · final', s.cSeq, s.sSeq, s.dropAck)
    if (s.dropAck) {
      s.ackLost = true
      s.dropAck = false
      s.log = addLog(
        s.log,
        '最后的 ACK 丢失',
        'Server 仍在 LAST_ACK，可重传 FIN。Client 留在 TIME_WAIT，正好还能为重复 FIN 再次发送 ACK。',
        'warning',
      )
    } else {
      s.server = 'CLOSED'
      s.ackLost = false
      s.log = addLog(
        s.log,
        'Server 释放连接',
        '最后的 ACK 不消耗序列号。Client 仍需等待 2 MSL，避免旧连接报文干扰后续连接。',
        'success',
      )
    }
  } else if (
    action.type === 'retransmit-fin' &&
    s.client === 'TIME_WAIT' &&
    s.server === 'LAST_ACK' &&
    s.ackLost
  ) {
    message('server', 'client', 'FIN · retransmit', seqNext(s.sSeq, 0xffffffff), s.cSeq)
    s.msl = 0
    s.log = addLog(
      s.log,
      '重复 FIN，重启 TIME_WAIT',
      '重传使用原 FIN 的序号，不再占用新序号。Client 可以再次回复最后的 ACK。',
      'warning',
    )
  } else if (action.type === 'tick' && s.client === 'TIME_WAIT' && s.server === 'CLOSED') {
    s.msl++
    if (s.msl >= 2) s.client = 'CLOSED'
    s.log = addLog(
      s.log,
      s.client === 'CLOSED' ? 'TIME_WAIT 结束' : '等待 1 MSL',
      s.client === 'CLOSED'
        ? '两端均为 CLOSED。按方向关闭，加上确认与等待，构成可靠终止。'
        : 'MSL 是报文的最大生存时间。本实验按单位推进，不代表固定现实秒数。',
      s.client === 'CLOSED' ? 'success' : 'neutral',
    )
  } else return state
  return s
}
export function presentClose(s: CloseState): ExperimentView {
  const complete = s.client === 'CLOSED' && s.server === 'CLOSED'
  return {
    scene: {
      kind: 'network',
      layout: 'sequence',
      nodes: [
        {
          id: 'client',
          label: 'Client',
          subtitle: '主动关闭',
          state: s.client,
          active: s.client === 'TIME_WAIT',
        },
        {
          id: 'server',
          label: 'Server',
          subtitle: '被动关闭',
          state: s.server,
          active: s.server === 'CLOSE_WAIT',
        },
      ],
      messages: s.messages,
      caption:
        '这是顺序关闭的典型四段交换。若 Server 已准备好关闭，ACK 与 FIN 可以合并；不是永远固定四个报文。',
    },
    controls: [
      { id: 'bytes', kind: 'number', label: 'Server 剩余数据 / B', value: s.bytes, min: 1, max: 64 },
      {
        id: 'ack-delivery',
        kind: 'select',
        label: '最后 ACK 的传输',
        value: s.dropAck ? 'drop' : 'deliver',
        options: [
          { value: 'deliver', label: '正常送达' },
          { value: 'drop', label: '丢失一次' },
        ],
      },
      {
        id: 'client-fin',
        kind: 'button',
        label: '① Client 发送 FIN',
        disabled: s.client !== 'ESTABLISHED',
        primary: s.client === 'ESTABLISHED',
      },
      {
        id: 'server-ack',
        kind: 'button',
        label: '② Server 发送 ACK',
        disabled: s.client !== 'FIN_WAIT_1',
        primary: s.client === 'FIN_WAIT_1',
      },
      {
        id: 'data',
        kind: 'button',
        label: 'Server 发送剩余数据',
        disabled: s.client !== 'FIN_WAIT_2' || s.server !== 'CLOSE_WAIT',
      },
      {
        id: 'server-fin',
        kind: 'button',
        label: '③ Server 发送 FIN',
        disabled: s.client !== 'FIN_WAIT_2' || s.server !== 'CLOSE_WAIT',
        primary: s.client === 'FIN_WAIT_2',
      },
      {
        id: 'client-ack',
        kind: 'button',
        label: '④ Client 发送 ACK',
        disabled: s.client !== 'TIME_WAIT' || s.server !== 'LAST_ACK',
        primary: s.client === 'TIME_WAIT' && s.server === 'LAST_ACK',
      },
      {
        id: 'retransmit-fin',
        kind: 'button',
        label: 'Server 重传 FIN',
        disabled: !s.ackLost || s.server !== 'LAST_ACK',
      },
      {
        id: 'tick',
        kind: 'button',
        label: '推进 1 MSL',
        disabled: s.client !== 'TIME_WAIT' || s.server !== 'CLOSED',
        primary: s.client === 'TIME_WAIT' && s.server === 'CLOSED',
      },
    ],
    metrics: [
      { label: 'Client State', value: s.client },
      { label: 'Server State', value: s.server },
      { label: '半关闭接收数据', value: s.transferred, unit: 'B' },
      { label: 'TIME_WAIT', value: s.msl + ' / 2', unit: 'MSL' },
    ],
    status: {
      title: complete
        ? '两个方向，都已可靠结束。'
        : s.server === 'CLOSE_WAIT'
          ? '我不再发送，不等于你不能发送。'
          : '关闭连接，也是一次有序的协作。',
      detail: s.log.at(-1)?.detail ?? '先发送 Client 的 FIN，再在 CLOSE_WAIT 阶段让 Server 继续发送数据。',
      tone: complete ? 'success' : (s.log.at(-1)?.tone ?? 'neutral'),
    },
    log: s.log,
    goal: {
      label: '在半关闭阶段传一次数据，再完成关闭并等待 2 MSL。',
      reached: complete && s.transferred > 0,
    },
  }
}
export const closeEngine: EngineFactory = () => createSession(initialClose, transitionClose, presentClose)
