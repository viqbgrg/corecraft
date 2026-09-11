import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
interface CacheEntry {
  key: string
  value: string
  expires: number | null
  last: number
}
export interface ExpirationState {
  clock: number
  sequence: number
  entries: CacheEntry[]
  key: string
  value: string
  ttl: number
  policy: 'noeviction' | 'allkeys-lru' | 'volatile-lru'
  result: string
  expired: number
  evicted: number
  rejected: number
  cursor: number
  history: { key: string; reason: string; clock: number }[]
  error: string | null
  log: Observation[]
}
export function initialExpiration(): ExpirationState {
  return {
    clock: 0,
    sequence: 3,
    entries: [
      { key: 'A', value: 'persistent', expires: null, last: 1 },
      { key: 'B', value: 'session', expires: 5, last: 2 },
      { key: 'C', value: 'short', expires: 1, last: 3 },
    ],
    key: 'C',
    value: 'new',
    ttl: 0,
    policy: 'noeviction',
    result: '尚未访问',
    expired: 0,
    evicted: 0,
    rejected: 0,
    cursor: 0,
    history: [],
    error: null,
    log: [],
  }
}
function removeCache(s: ExpirationState, key: string, reason: 'expired' | 'evicted') {
  s.entries = s.entries.filter((e) => e.key !== key)
  s[reason]++
  s.history.push({ key, reason, clock: s.clock })
}
export function expirationTransition(state: ExpirationState, a: ExperimentAction): ExpirationState {
  if (['key', 'value'].includes(a.type)) return { ...state, [a.type]: String(a.value ?? '') }
  if (a.type === 'ttl') {
    const ttl = boundedInteger(a.value, 0, 20)
    return ttl === null ? state : { ...state, ttl }
  }
  if (a.type === 'policy' && ['noeviction', 'allkeys-lru', 'volatile-lru'].includes(String(a.value)))
    return { ...state, policy: a.value as ExpirationState['policy'] }
  if (!['tick', 'get', 'ttl-query', 'set', 'expire', 'active'].includes(a.type)) return state
  const s = structuredClone(state)
  s.error = null
  s.sequence++
  if (a.type === 'tick') {
    s.clock++
    s.result = `时间 ${s.clock}；到期键尚可占内存，逻辑上已不可读。`
  } else if (a.type === 'active') {
    const candidates = s.entries.map((e) => e.key)
    const sampled = Array.from(
      { length: Math.min(2, candidates.length) },
      (_, i) => candidates[(s.cursor + i) % candidates.length]!,
    )
    for (const key of sampled) {
      const e = s.entries.find((e) => e.key === key)!
      if (e.expires !== null && e.expires <= s.clock) removeCache(s, key, 'expired')
    }
    s.cursor = candidates.length ? (s.cursor + sampled.length) % candidates.length : 0
    s.result = `主动周期检查 ${sampled.join(', ') || '无'}；最多两个候选。`
  } else {
    if (!/^[A-Za-z][A-Za-z0-9]{0,11}$/.test(s.key) || s.value.length > 24)
      return { ...state, error: '键为 1–12 位字母数字，值最多 24 字符。' }
    let entry = s.entries.find((e) => e.key === s.key)
    if (entry && entry.expires !== null && entry.expires <= s.clock) {
      removeCache(s, s.key, 'expired')
      entry = undefined
    }
    if (a.type === 'get') {
      if (entry) entry.last = s.sequence
      s.result = entry?.value ?? 'nil'
    } else if (a.type === 'ttl-query')
      s.result = entry ? String(entry.expires === null ? -1 : entry.expires - s.clock) : '-2'
    else if (a.type === 'expire') {
      if (!entry) s.result = '0'
      else {
        entry.expires = s.clock + s.ttl
        if (s.ttl === 0) removeCache(s, s.key, 'expired')
        s.result = '1'
      }
    } else {
      for (const e of [...s.entries])
        if (e.expires !== null && e.expires <= s.clock) removeCache(s, e.key, 'expired')
      if (!entry && s.entries.length >= 3) {
        const eligible = s.entries
          .filter((e) => s.policy === 'allkeys-lru' || (s.policy === 'volatile-lru' && e.expires !== null))
          .sort((a, b) => a.last - b.last)
        if (s.policy === 'noeviction' || !eligible.length) {
          s.rejected++
          s.result = 'OOM / write rejected'
          s.error = '容量已满且策略没有可淘汰候选，写命令未执行。'
          s.log = addLog(s.log, '内存准入拒绝', s.error, 'warning')
          return s
        }
        removeCache(s, eligible[0]!.key, 'evicted')
      }
      if (entry) {
        entry.value = s.value
        entry.expires = s.ttl ? s.clock + s.ttl : null
        entry.last = s.sequence
      } else
        s.entries.push({
          key: s.key,
          value: s.value,
          expires: s.ttl ? s.clock + s.ttl : null,
          last: s.sequence,
        })
      s.result = 'OK'
    }
  }
  s.log = addLog(
    s.log,
    a.type,
    `${s.result}；resident=${s.entries.length}/3，expired=${s.expired}，evicted=${s.evicted}。`,
  )
  return s
}
export function presentExpiration(s: ExpirationState): ExperimentView {
  const reached = s.expired > 0 && s.evicted > 0 && s.rejected > 0
  return {
    scene: {
      kind: 'data',
      title: 'TTL 判断逻辑有效性，容量策略决定未到期键是否保留',
      tables: [
        {
          id: 'redis-expiry-keys',
          title: '仍驻留的键 / 教学容量三个等大小条目',
          columns: ['键', '值', '到期时间', '逻辑有效', '最近访问序号'],
          rows: s.entries.map((e) => ({
            id: e.key,
            values: [
              e.key,
              e.value,
              e.expires ?? '永久',
              String(e.expires === null || e.expires > s.clock),
              e.last,
            ],
          })),
        },
        {
          id: 'redis-removals',
          title: '实际删除原因',
          columns: ['键', '原因', '时间'],
          rows: s.history.map((h, i) => ({ id: String(i), values: [h.key, h.reason, h.clock] })),
        },
      ],
      caption:
        '三个等大小条目代替真实 maxmemory 字节核算；LRU 为精确教学顺序，真实 Redis 常用采样近似。主动过期每步检查两个确定候选，写准入前教学实现检查全部过期键，非真实主动过期算法。SET 未带 TTL 会清除旧期限；TTL 查询 -1 永久、-2 不存在。EXPIRE 0 立即删除。',
    },
    metrics: [
      { label: '逻辑时间', value: s.clock },
      { label: '到期删除数量', value: s.expired },
      { label: '容量淘汰数量', value: s.evicted },
      { label: '拒绝写入数量', value: s.rejected },
      { label: '最近结果', value: s.result },
    ],
    controls: [
      { id: 'key', kind: 'text', label: '缓存 key', value: s.key },
      { id: 'value', kind: 'text', label: '缓存 value', value: s.value },
      { id: 'ttl', kind: 'number', label: 'TTL 秒 / SET 的 0 表示不设置期限', value: s.ttl, min: 0, max: 20 },
      {
        id: 'policy',
        kind: 'select',
        label: '内存不足策略',
        value: s.policy,
        options: ['noeviction', 'allkeys-lru', 'volatile-lru'].map((id) => ({ value: id, label: id })),
      },
      ...[
        ['tick', '推进一秒'],
        ['get', 'GET · 访问并检查到期'],
        ['ttl-query', 'TTL · 查询剩余期限'],
        ['set', 'SET · 写入并执行容量准入'],
        ['expire', 'EXPIRE · 修改当前键期限'],
        ['active', '运行一个主动过期周期'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'get' })),
    ],
    status: {
      title: s.error
        ? '当前写入被容量策略拒绝'
        : reached
          ? '过期、淘汰与拒绝已区分'
          : '到期不是立即从内存消失',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '时间推进后读 C 触发过期；填满容量并触发 noeviction 拒绝，再用 LRU 淘汰未到期键。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '观察一次 TTL 到期删除、一次容量拒绝与一次未到期键的 LRU 淘汰。', reached },
    log: s.log,
  }
}
export const expirationEngine: EngineFactory = () =>
  createSession(initialExpiration, expirationTransition, presentExpiration)
