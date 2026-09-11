import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
export interface LeaseState {
  mode: 'unsafe' | 'fenced'
  clock: number
  selected: string
  ttl: number
  value: number
  lease: { owner: string; token: number; expires: number } | null
  nextToken: number
  clients: { id: string; token: number | null; paused: boolean }[]
  resource: { value: number; fence: number }
  writes: { client: string; token: number; value: number; accepted: boolean }[]
  unsafeSeen: boolean
  fencedSeen: boolean
  error: string | null
  log: Observation[]
}
export function initialLease(): LeaseState {
  return {
    mode: 'unsafe',
    clock: 0,
    selected: 'T1',
    ttl: 3,
    value: 10,
    lease: null,
    nextToken: 1,
    clients: ['T1', 'T2'].map((id) => ({ id, token: null, paused: false })),
    resource: { value: 0, fence: 0 },
    writes: [],
    unsafeSeen: false,
    fencedSeen: false,
    error: null,
    log: [],
  }
}
export function leaseTransition(state: LeaseState, a: ExperimentAction): LeaseState {
  if (a.type === 'mode' && ['unsafe', 'fenced'].includes(String(a.value)))
    return {
      ...initialLease(),
      mode: a.value as LeaseState['mode'],
      unsafeSeen: state.unsafeSeen,
      fencedSeen: state.fencedSeen,
      log: addLog(state.log, '新租约场景', '资源和租约重建，保留两种写入协议的对照证据。'),
    }
  if (a.type === 'selected' && ['T1', 'T2'].includes(String(a.value)))
    return { ...state, selected: String(a.value) }
  if (a.type === 'value') {
    const n = boundedInteger(a.value, 0, 99)
    return n === null ? state : { ...state, value: n }
  }
  if (!['acquire', 'renew', 'release', 'pause', 'resume', 'tick', 'write'].includes(a.type)) return state
  const s = structuredClone(state),
    c = s.clients.find((c) => c.id === s.selected)!
  s.error = null
  let detail = ''
  if (a.type === 'tick') {
    s.clock++
    detail = `租约服务时间=${s.clock}；客户端局部 token 不会因过期自动消失。`
  } else if (a.type === 'pause' || a.type === 'resume') {
    c.paused = a.type === 'pause'
    detail = `${c.id} ${c.paused ? '暂停执行，例如长时间调度停顿' : '恢复执行，旧的局部状态仍在'}。`
  } else {
    if (c.paused) return { ...state, error: '当前客户端暂停，无法执行自己的续租或资源操作。' }
    if (a.type === 'acquire') {
      if (s.lease && s.lease.expires > s.clock)
        return { ...state, error: `租约由 ${s.lease.owner} 持有到 ${s.lease.expires}，当前无法获得。` }
      const token = s.nextToken++
      s.lease = { owner: c.id, token, expires: s.clock + s.ttl }
      c.token = token
      detail = `${c.id} 得到 token=${token}，有效到 ${s.lease.expires}；token 随成功获取严格增加。`
    } else if (a.type === 'renew') {
      if (!s.lease || s.lease.token !== c.token || s.lease.expires <= s.clock)
        return { ...state, error: '续租时匹配失败或已经过期，不能凭旧 token 延长别人的租约。' }
      s.lease.expires = s.clock + s.ttl
      detail = `在租约服务原子验证 owner/token 后续租到 ${s.lease.expires}。`
    } else if (a.type === 'release') {
      if (!s.lease || s.lease.token !== c.token)
        return { ...state, error: 'compare-and-delete 未匹配，旧 owner 不能删除新 owner 的租约。' }
      s.lease = null
      detail = '租约服务原子比较 token 后删除，避免 GET 与 DEL 之间的竞争。'
    } else {
      if (c.token === null) return { ...state, error: '客户端尚未获得过一个租约 token。' }
      const stale = !s.lease || s.lease.token !== c.token || s.lease.expires <= s.clock,
        accepted = s.mode === 'unsafe' || c.token >= s.resource.fence
      s.writes.push({ client: c.id, token: c.token, value: s.value, accepted })
      if (accepted) {
        s.resource.value = s.value
        s.resource.fence = Math.max(s.resource.fence, c.token)
      }
      s.unsafeSeen ||= s.mode === 'unsafe' && stale && c.token < s.resource.fence
      s.fencedSeen ||= s.mode === 'fenced' && !accepted && stale
      detail = accepted
        ? `资源接受 ${c.id} 的 token=${c.token}，value=${s.value}。${stale ? '客户端租约已失效，但资源不能仅凭客户端本地判断阻止它。' : ''}`
        : `资源拒绝旧 token=${c.token}，已接受 fence=${s.resource.fence}；值保持 ${s.resource.value}。`
    }
  }
  s.log = addLog(s.log, a.type, detail)
  return s
}
export function presentLease(s: LeaseState): ExperimentView {
  const reached = s.unsafeSeen && s.fencedSeen
  return {
    scene: {
      kind: 'data',
      title: '租约过期释放协调权，资源端 fencing 阻止旧持有者覆盖新写入',
      tables: [
        {
          id: 'lease-clients',
          title: '客户端保留的局部状态',
          columns: ['客户端', 'token', '暂停'],
          rows: s.clients.map((c) => ({ id: c.id, values: [c.id, c.token ?? '无', String(c.paused)] })),
        },
        {
          id: 'lease-writes',
          title: '资源实际接受 / 拒绝的写入',
          columns: ['客户端', 'token', '候选值', '接受'],
          rows: s.writes.map((w, i) => ({
            id: String(i),
            values: [w.client, w.token, w.value, String(w.accepted)],
          })),
        },
      ],
      cards: [
        {
          id: 'lease',
          label: '租约服务',
          value: s.lease ? `${s.lease.owner} / token ${s.lease.token} / 到期 ${s.lease.expires}` : '无租约',
        },
        {
          id: 'resource',
          label: '受保护资源',
          value: `value=${s.resource.value} / fence=${s.resource.fence}`,
        },
      ],
      caption:
        '一个可靠租约服务、统一服务时钟、两个可暂停客户端与支持 fencing 的资源；租约固定 3 秒。token 单调且不回绕，资源原子比较 token 与写值。同 token 可重复写，幂等是另一个协议。fencing 拒绝比已见 token 更旧的操作，不单独判断租约是否已过期。未模拟 Redis 主切换、Redlock、时钟漂移或协调服务共识。',
    },
    metrics: [
      { label: '租约服务时间', value: s.clock },
      { label: '资源最终值', value: s.resource.value },
      { label: '资源最大 fencing token', value: s.resource.fence },
    ],
    controls: [
      {
        id: 'mode',
        kind: 'select',
        label: '新场景资源写入协议',
        value: s.mode,
        options: [
          { value: 'unsafe', label: '只相信客户端曾持锁' },
          { value: 'fenced', label: '资源端校验 fencing token' },
        ],
      },
      {
        id: 'selected',
        kind: 'select',
        label: '当前租约客户端',
        value: s.selected,
        options: ['T1', 'T2'].map((id) => ({ value: id, label: id })),
      },
      { id: 'value', kind: 'number', label: '写入资源的值', value: s.value, min: 0, max: 99 },
      ...[
        ['acquire', '申请带单调 token 的租约'],
        ['renew', '原子校验并续租'],
        ['release', '原子 compare-and-delete 释放'],
        ['pause', '暂停当前客户端'],
        ['resume', '恢复当前客户端'],
        ['tick', '租约服务推进一秒'],
        ['write', '携带局部 token 写受保护资源'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'write' })),
    ],
    status: {
      title: s.error
        ? '租约操作未满足条件'
        : reached
          ? '过期旧客户端的写入已被资源拒绝'
          : '暂停的旧客户端可能在租约过期后恢复',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        'T1 获租约并暂停，推进三秒，T2 获新租约并写入，T1 恢复后再写；切 fencing 重做。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '复现旧客户端覆盖新 owner 的写入，再用资源端 fencing 拒绝相同过期操作。', reached },
    log: s.log,
  }
}
export const leaseEngine: EngineFactory = () => createSession(initialLease, leaseTransition, presentLease)
