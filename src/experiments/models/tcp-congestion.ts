import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export interface CongestionState {
  cwnd: number
  threshold: number
  receiveWindow: number
  flight: number
  phase: 'slow-start' | 'avoidance' | 'recovery'
  event: number
  grew: boolean
  recovered: boolean
  timedOut: boolean
  history: { event: string; cwnd: number; threshold: number; flight: number }[]
  log: Observation[]
}
export function initialCongestion(receiveWindow = 32): CongestionState {
  if (boundedInteger(receiveWindow, 1, 64) === null) throw new Error('Reno receive window must be 1–64 MSS')
  return {
    cwnd: 1,
    threshold: 8,
    receiveWindow,
    flight: 0,
    phase: 'slow-start',
    event: 0,
    grew: false,
    recovered: false,
    timedOut: false,
    history: [],
    log: [],
  }
}
function record(s: CongestionState, event: string, detail: string, loss = false): CongestionState {
  return {
    ...s,
    event: s.event + 1,
    history: [...s.history, { event, cwnd: s.cwnd, threshold: s.threshold, flight: s.flight }].slice(-40),
    log: addLog(s.log, event, detail, loss ? 'warning' : 'success'),
  }
}
export function congestionTransition(state: CongestionState, a: ExperimentAction): CongestionState {
  let s = { ...state }
  if (a.type === 'window') {
    const value = boundedInteger(a.value, 1, 64)
    return value !== null ? initialCongestion(value) : state
  }
  if (a.type === 'send' && !s.flight && s.phase !== 'recovery') {
    s.flight = Math.min(Math.floor(s.cwnd), s.receiveWindow)
    return record(s, '发送一轮', `发送 ${s.flight} MSS = min(⌊cwnd⌋, rwnd)。此时尚未收到 ACK，窗口没有增长。`)
  }
  if (a.type === 'ack' && s.flight > 0 && s.phase !== 'recovery') {
    for (let i = 0; i < s.flight; i++) {
      if (s.cwnd < s.threshold) s.cwnd += 1
      else s.cwnd += 1 / s.cwnd
    }
    s.phase = s.cwnd < s.threshold ? 'slow-start' : 'avoidance'
    s.flight = 0
    s.grew = true
    return record(
      s,
      '整轮新 ACK 到达',
      '每段一个新 ACK：慢启动每 ACK 增加 1 MSS；拥塞避免每 ACK 增加 1/cwnd MSS。受 rwnd 限制时，一轮不一定增长 1 MSS。',
    )
  }
  if (a.type === 'duplicates' && s.flight >= 4 && s.phase !== 'recovery') {
    s.threshold = Math.max(Math.floor(s.flight / 2), 2)
    s.cwnd = s.threshold + 3
    s.phase = 'recovery'
    return record(
      s,
      '3 次重复 ACK · 快速重传',
      `ssthresh=max(FlightSize/2, 2)=${s.threshold}；cwnd 暂时膨胀到 ${s.cwnd}，等待确认丢失段的新 ACK。`,
      true,
    )
  }
  if (a.type === 'recover' && s.phase === 'recovery') {
    s.cwnd = s.threshold
    s.flight = 0
    s.phase = 'avoidance'
    s.recovered = true
    return record(
      s,
      '新 ACK · 退出快速恢复',
      `cwnd 收缩到 ssthresh=${s.threshold}，继续拥塞避免；没有回到初始的 1 MSS。`,
    )
  }
  if (a.type === 'timeout' && s.flight > 0) {
    s.threshold = Math.max(Math.floor(s.flight / 2), 2)
    s.cwnd = 1
    s.flight = 0
    s.phase = 'slow-start'
    s.timedOut = true
    return record(
      s,
      'RTO 超时',
      `ssthresh=${s.threshold}；cwnd 降至 1 MSS，下轮包含重传。超时比重复 ACK 表现出更严重的不确定性。`,
      true,
    )
  }
  return state
}
export function presentCongestion(s: CongestionState): ExperimentView {
  const phase = { 'slow-start': '慢启动', avoidance: '拥塞避免', recovery: '快速恢复' }[s.phase]
  return {
    scene: {
      kind: 'data',
      title: 'Reno 窗口随事件变化',
      cards: [
        { id: 'cwnd', label: '网络 · cwnd', value: s.cwnd.toFixed(2), detail: '发送方根据 ACK 与丢包估计' },
        { id: 'rwnd', label: '接收端 · rwnd', value: s.receiveWindow, detail: '接收应用与缓冲区约束' },
        { id: 'flight', label: '在途数据 · FlightSize', value: s.flight, detail: '单位均为 MSS' },
      ],
      tables: [
        {
          id: 'congestion-history',
          title: '窗口轨迹（最近 40 个事件）',
          columns: ['事件', 'cwnd', 'ssthresh', '在途 MSS'],
          rows: s.history.map((h, i) => ({
            id: String(i),
            values: [h.event, h.cwnd.toFixed(2), h.threshold, h.flight],
          })),
        },
      ],
      caption:
        '教学版 Reno：初始 cwnd=1、ssthresh=8；一个 ACK 确认一个完整 MSS。仅模拟单次丢包恢复，不模拟延迟 ACK、SACK、多重丢包、RTO 估计或真实网络时延。',
    },
    metrics: [
      { label: '拥塞控制阶段', value: phase },
      { label: '拥塞窗口', value: s.cwnd.toFixed(2), unit: 'MSS' },
      { label: '慢启动阈值', value: s.threshold, unit: 'MSS' },
      { label: '本轮可发送', value: s.flight ? '等待 ACK' : Math.min(Math.floor(s.cwnd), s.receiveWindow) },
    ],
    controls: [
      { id: 'window', kind: 'number', label: '接收窗口 rwnd / MSS', value: s.receiveWindow, min: 1, max: 64 },
      {
        id: 'send',
        kind: 'button',
        label: '发送一轮数据',
        primary: true,
        disabled: s.flight > 0 || s.phase === 'recovery',
      },
      {
        id: 'ack',
        kind: 'button',
        label: '收到整轮新 ACK',
        disabled: s.flight === 0 || s.phase === 'recovery',
      },
      {
        id: 'duplicates',
        kind: 'button',
        label: '收到 3 次重复 ACK',
        disabled: s.flight < 4 || s.phase === 'recovery',
      },
      { id: 'recover', kind: 'button', label: '确认重传 · 退出快速恢复', disabled: s.phase !== 'recovery' },
      { id: 'timeout', kind: 'button', label: '触发 RTO 超时', disabled: s.flight === 0 },
    ],
    status: {
      title: phase,
      detail: s.log.at(-1)?.detail ?? '先交替发送与确认，增长到至少 4 MSS；再比较重复 ACK 与超时后的窗口。',
      tone: s.phase === 'recovery' ? 'warning' : 'neutral',
    },
    goal: {
      label: '观察 ACK 带来的窗口增长，完成快速恢复，再观察一次超时退回慢启动。',
      reached: s.grew && s.recovered && s.timedOut,
    },
    log: s.log,
  }
}
export const congestionEngine: EngineFactory = (config) =>
  createSession(() => initialCongestion(Number(config.window ?? 32)), congestionTransition, presentCongestion)
