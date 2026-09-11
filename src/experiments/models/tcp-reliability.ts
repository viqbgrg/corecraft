import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export interface ReliabilityState {
  count: number
  capacity: number
  window: number
  next: number
  base: number
  expected: number
  consumed: number
  remoteEdge: number
  received: boolean[]
  transmissions: number[]
  retransmissions: number
  duplicates: number
  fault: 'none' | 'data' | 'ack'
  log: Observation[]
}
const seq = (segment: number) => 1001 + segment * 100
export function initialReliability(count = 8, capacity = 4, window = 4): ReliabilityState {
  if (
    boundedInteger(count, 4, 12) === null ||
    boundedInteger(capacity, 1, 6) === null ||
    boundedInteger(window, 1, 6) === null
  )
    throw new Error('TCP reliability requires 4–12 segments and windows of 1–6 segments')
  return {
    count,
    capacity,
    window,
    next: 0,
    base: 0,
    expected: 0,
    consumed: 0,
    remoteEdge: capacity,
    received: Array.from({ length: count }, () => false),
    transmissions: Array.from({ length: count }, () => 0),
    retransmissions: 0,
    duplicates: 0,
    fault: 'none',
    log: [],
  }
}
export const canSendSegment = (s: ReliabilityState) =>
  s.next < Math.min(s.count, s.base + s.window, s.remoteEdge)
function deliver(state: ReliabilityState, index: number, retransmit: boolean): ReliabilityState {
  const s = { ...state, received: [...state.received], transmissions: [...state.transmissions] }
  s.transmissions[index] = s.transmissions[index]! + 1
  if (retransmit) s.retransmissions++
  if (s.fault === 'data') {
    s.fault = 'none'
    s.log = addLog(
      s.log,
      `${retransmit ? '重传' : '发送'}段 ${index + 1} · 丢失`,
      `Seq=${seq(index)}，Len=100；接收端仍等待 ${seq(s.expected)}。`,
      'warning',
    )
    return s
  }
  if (s.received[index]) s.duplicates++
  else if (index >= s.consumed && index < s.consumed + s.capacity) s.received[index] = true
  while (s.expected < s.count && s.received[s.expected]) s.expected++
  s.log = addLog(
    s.log,
    `${retransmit ? 'RTO 重传' : '发送'}段 ${index + 1} · 到达`,
    `Seq=${seq(index)}，Len=100；累计 ACK 应为 ${seq(s.expected)}。${index < state.expected ? '重复数据不会再次交给应用。' : index > state.expected ? '先缓冲乱序段，累计确认不能越过缺口。' : '连续前缀已经向前推进。'}`,
    'success',
  )
  return s
}
export function reliabilityTransition(s: ReliabilityState, a: ExperimentAction): ReliabilityState {
  if (a.type === 'send' && canSendSegment(s)) return deliver({ ...s, next: s.next + 1 }, s.next, false)
  if (a.type === 'timeout' && s.base < s.next) return deliver(s, s.base, true)
  if (a.type === 'ack' && s.next > 0) {
    if (s.fault === 'ack')
      return {
        ...s,
        fault: 'none',
        log: addLog(
          s.log,
          'ACK 丢失',
          `ACK=${seq(s.expected)} 未到达；发送端的 SND.UNA 仍为 ${seq(s.base)}。`,
          'warning',
        ),
      }
    return {
      ...s,
      base: s.expected,
      remoteEdge: s.consumed + s.capacity,
      log: addLog(
        s.log,
        '累计 ACK 到达',
        `ACK=${seq(s.expected)}，rwnd=${(s.consumed + s.capacity - s.expected) * 100} B；发送端窗口右边界更新为 ${seq(s.consumed + s.capacity)}。`,
        'success',
      ),
    }
  }
  if (a.type === 'consume' && s.consumed < s.expected)
    return {
      ...s,
      consumed: s.consumed + 1,
      log: addLog(
        s.log,
        '应用读取 100 B',
        `第 ${s.consumed + 1} 段只交付一次。还需发送窗口更新 ACK，发送方才知道有空位。`,
        'success',
      ),
    }
  if (a.type === 'fault' && ['none', 'data', 'ack'].includes(String(a.value)))
    return { ...s, fault: a.value as ReliabilityState['fault'] }
  if (['capacity', 'window', 'count'].includes(a.type)) {
    const value = boundedInteger(a.value, a.type === 'count' ? 4 : 1, a.type === 'count' ? 12 : 6)
    if (value !== null)
      return initialReliability(
        a.type === 'count' ? value : s.count,
        a.type === 'capacity' ? value : s.capacity,
        a.type === 'window' ? value : s.window,
      )
  }
  return s
}
export function presentReliability(s: ReliabilityState): ExperimentView {
  const done = s.base === s.count && s.consumed === s.count
  const blocked = !canSendSegment(s) && s.next < s.count
  return {
    scene: {
      kind: 'data',
      title: '两个端点各自知道什么',
      cards: [
        {
          id: 'sender',
          label: '发送端 · SND.UNA',
          value: seq(s.base),
          detail: `SND.NXT=${seq(s.next)}；已知窗口右边界 ${seq(s.remoteEdge)}`,
        },
        {
          id: 'receiver',
          label: '接收端 · RCV.NXT',
          value: seq(s.expected),
          detail: `可通告 rwnd=${(s.consumed + s.capacity - s.expected) * 100} B`,
        },
        {
          id: 'application',
          label: '应用已读取',
          value: `${s.consumed * 100} B`,
          detail: '重传不会重复交付',
        },
      ],
      tables: [
        {
          id: 'segments',
          title: '每段 100 字节 · ISN=1000',
          columns: ['段', 'Seq', '发送次数', '发送方确认', '接收状态'],
          rows: s.received.map((received, i) => ({
            id: String(i),
            values: [
              i + 1,
              seq(i),
              s.transmissions[i]!,
              i < s.base ? '已确认' : i < s.next ? '未确认' : '未发送',
              i < s.consumed
                ? '应用已读取'
                : received
                  ? i < s.expected
                    ? '有序可读'
                    : '乱序缓冲'
                  : '未到达',
            ],
            tone: i < s.base ? 'success' : i < s.next && !received ? 'warning' : 'neutral',
          })),
        },
      ],
      caption:
        '这是已建立连接后的单向字节流。接收窗口保留缺口位置，右边界=应用读取位置+缓冲容量；累计 ACK 指向下一个期待字节。拥塞窗口另见下一课。',
    },
    metrics: [
      { label: '已确认字节', value: s.base * 100 },
      { label: '未确认段', value: s.next - s.base },
      { label: 'RTO 重传次数', value: s.retransmissions },
      { label: '重复到达段', value: s.duplicates },
    ],
    controls: [
      { id: 'capacity', kind: 'number', label: '接收缓冲容量 / 段', value: s.capacity, min: 1, max: 6 },
      { id: 'window', kind: 'number', label: '发送窗口上限 / 段', value: s.window, min: 1, max: 6 },
      { id: 'count', kind: 'number', label: '总数据段数', value: s.count, min: 4, max: 12 },
      {
        id: 'fault',
        kind: 'select',
        label: '下一次故障',
        value: s.fault,
        options: [
          { value: 'none', label: '正常传输' },
          { value: 'data', label: '丢失下一个数据段' },
          { value: 'ack', label: '丢失下一个 ACK' },
        ],
      },
      { id: 'send', kind: 'button', label: '发送下一段', primary: true, disabled: !canSendSegment(s) },
      { id: 'ack', kind: 'button', label: '发送累计 ACK / 窗口更新', disabled: s.next === 0 },
      { id: 'timeout', kind: 'button', label: '触发 RTO · 重传最早未确认段', disabled: s.base === s.next },
      { id: 'consume', kind: 'button', label: '应用读取 1 段', disabled: s.consumed === s.expected },
    ],
    status: {
      title: done ? '字节流已完整交付' : blocked ? '发送窗口暂时关闭' : '跟踪数据与确认',
      detail:
        s.log.at(-1)?.detail ?? '先丢失第 1 段，再发送后续段：接收端可以缓冲它们，但累计 ACK 不能越过缺口。',
      tone: done ? 'success' : blocked ? 'warning' : 'neutral',
    },
    goal: {
      label: '经历至少一次 RTO 重传，让所有字节被累计确认并由应用读取。',
      reached: done && s.retransmissions > 0,
    },
    log: s.log,
  }
}
export const reliabilityEngine: EngineFactory = (config) =>
  createSession(
    () =>
      initialReliability(Number(config.count ?? 8), Number(config.capacity ?? 4), Number(config.window ?? 4)),
    reliabilityTransition,
    presentReliability,
  )
