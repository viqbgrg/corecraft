import type {
  EngineFactory,
  ExperimentAction,
  ExperimentView,
  NetworkMessage,
  Observation,
} from '../../types/experiment'
import { addLog, createSession } from '../core/session'

type Phase =
  | 'idle'
  | 'root-query'
  | 'root-reply'
  | 'tld-query'
  | 'tld-reply'
  | 'auth-query'
  | 'auth-reply'
  | 'response'
  | 'done'
interface DnsEntry {
  domain: string
  answer: string | null
  expires: number
}
export interface DnsState {
  domain: string
  phase: Phase
  now: number
  cache: DnsEntry[]
  cacheHit: boolean
  result: string | null
  upstream: number
  cacheHits: number
  coldCompleted: boolean
  cachedCompleted: boolean
  active: string
  messages: NetworkMessage[]
  log: Observation[]
}
const zone: Record<string, string | null> = {
  'www.corecraft.test': '203.0.113.42',
  'api.corecraft.test': '203.0.113.10',
  'missing.corecraft.test': null,
}
export function initialDns(): DnsState {
  return {
    domain: 'www.corecraft.test',
    phase: 'idle',
    now: 0,
    cache: [],
    cacheHit: false,
    result: null,
    upstream: 0,
    cacheHits: 0,
    coldCompleted: false,
    cachedCompleted: false,
    active: 'browser',
    messages: [],
    log: [],
  }
}
export function transitionDns(state: DnsState, action: ExperimentAction): DnsState {
  const s = structuredClone(state)
  const stopped = s.phase === 'idle' || s.phase === 'done'
  if (action.type === 'domain' && stopped && Object.hasOwn(zone, String(action.value))) {
    s.domain = String(action.value)
    s.phase = 'idle'
    return s
  }
  if (action.type === 'advance' && stopped) {
    s.now += 30
    s.log = addLog(s.log, '教学时钟 +30 s', '现在 t = ' + s.now + ' s。已到期的缓存条目不会再用于查询。')
    return s
  }
  if (action.type === 'clear-cache' && stopped) {
    s.cache = []
    s.log = addLog(s.log, '清空解析器缓存', '下一次查询将重新向根、TLD、权威服务器迭代查询。')
    return s
  }
  if (action.type !== 'next') return state
  const send = (from: string, to: string, label: string, detail: string) => {
    s.messages.push({ from, to, label, detail, tone: 'success' })
    s.active = to
    s.log = addLog(s.log, label, detail, 'success')
  }
  if (stopped) {
    s.messages = []
    s.upstream = 0
    s.result = null
    s.cacheHit = false
    send('browser', 'resolver', '递归查询 · A?', s.domain)
    const cached = s.cache.find((c) => c.domain === s.domain && c.expires > s.now)
    if (cached) {
      s.cacheHit = true
      s.cacheHits++
      s.result = cached.answer
      s.phase = 'response'
      s.log = addLog(
        s.log,
        'DNS Cache Hit',
        '缓存仍有效，剩余 TTL = ' + (cached.expires - s.now) + ' s，无需查询上游。',
        'success',
      )
    } else s.phase = 'root-query'
  } else if (s.phase === 'root-query') {
    s.upstream++
    send('resolver', 'root', '迭代查询 · A?', s.domain)
    s.phase = 'root-reply'
  } else if (s.phase === 'root-reply') {
    send('root', 'resolver', 'Referral · .test NS', '请向 .test 顶级域服务器询问')
    s.phase = 'tld-query'
  } else if (s.phase === 'tld-query') {
    s.upstream++
    send('resolver', 'tld', '迭代查询 · A?', s.domain)
    s.phase = 'tld-reply'
  } else if (s.phase === 'tld-reply') {
    send('tld', 'resolver', 'Referral · authoritative NS', 'corecraft.test 的权威服务器')
    s.phase = 'auth-query'
  } else if (s.phase === 'auth-query') {
    s.upstream++
    send('resolver', 'auth', '迭代查询 · A?', s.domain)
    s.phase = 'auth-reply'
  } else if (s.phase === 'auth-reply') {
    s.result = zone[s.domain] ?? null
    const ttl = s.result ? 60 : 30
    s.cache = [
      ...s.cache.filter((c) => c.domain !== s.domain),
      { domain: s.domain, answer: s.result, expires: s.now + ttl },
    ]
    send(
      'auth',
      'resolver',
      s.result ? 'A = ' + s.result : 'NXDOMAIN',
      s.result ? '权威记录 · TTL 60 s' : '名称不存在 · 负缓存 TTL 30 s',
    )
    s.phase = 'response'
  } else if (s.phase === 'response') {
    send('resolver', 'browser', s.cacheHit ? '缓存响应' : '最终响应', s.result ?? 'NXDOMAIN · 域名不存在')
    if (s.cacheHit) s.cachedCompleted = true
    else s.coldCompleted = true
    s.phase = 'done'
  }
  return s
}
export function presentDns(s: DnsState): ExperimentView {
  const labels: Record<Phase, string> = {
    idle: '开始查询',
    'root-query': '查询 Root',
    'root-reply': 'Root 返回转介',
    'tld-query': '查询 TLD',
    'tld-reply': 'TLD 返回转介',
    'auth-query': '查询权威 DNS',
    'auth-reply': '权威 DNS 回答',
    response: '返回 Browser',
    done: '再查一次',
  }
  const stopped = s.phase === 'idle' || s.phase === 'done'
  const ttl = Math.max(0, (s.cache.find((c) => c.domain === s.domain)?.expires ?? s.now) - s.now)
  return {
    scene: {
      kind: 'network',
      layout: 'sequence',
      nodes: [
        {
          id: 'browser',
          label: 'Browser',
          subtitle: '应用 / Stub',
          state: s.phase === 'done' ? (s.result ? 'ANSWER' : 'NXDOMAIN') : '等待结果',
        },
        {
          id: 'resolver',
          label: 'Local DNS',
          subtitle: '递归解析器',
          state: s.cacheHit ? 'CACHE HIT' : '递归 → 迭代',
        },
        { id: 'root', label: 'Root', subtitle: '根服务器', state: '.test NS' },
        { id: 'tld', label: 'TLD', subtitle: '.test 顶级域', state: '权威 NS' },
        { id: 'auth', label: 'Authoritative', subtitle: '权威服务器', state: 'A 记录' },
      ].map((n) => ({ ...n, active: n.id === s.active })),
      messages: s.messages,
      caption:
        'Local DNS 代表递归解析器，由它查询每个上游。隔离的 .test 教学域与 203.0.113.0/24 示例地址不进行真实解析。',
    },
    controls: [
      {
        id: 'domain',
        kind: 'select',
        label: '查询域名',
        value: s.domain,
        disabled: !stopped,
        options: Object.keys(zone).map((domain) => ({ value: domain, label: domain })),
      },
      { id: 'next', kind: 'button', label: labels[s.phase], primary: true },
      { id: 'advance', kind: 'button', label: '时间 +30 s', disabled: !stopped },
      { id: 'clear-cache', kind: 'button', label: '清空 DNS 缓存', disabled: !stopped || !s.cache.length },
    ],
    metrics: [
      { label: '本次上游查询', value: s.upstream },
      { label: '累计 Cache Hits', value: s.cacheHits },
      { label: '记录剩余 TTL', value: ttl, unit: 's' },
      { label: '解析结果', value: s.phase === 'done' ? (s.result ?? 'NXDOMAIN') : '等待响应' },
    ],
    status: {
      title:
        s.phase === 'done'
          ? s.cacheHit
            ? '缓存省去了整条上游查询路径。'
            : '递归解析器把答案带了回来。'
          : '根服务器不必知道每个域名的 IP。',
      detail:
        s.log.at(-1)?.detail ??
        '根知道顶级域在哪里，顶级域知道权威服务器在哪里。点击每一步，看究竟是谁在向谁提问。',
      tone: s.phase === 'done' ? 'success' : 'neutral',
    },
    log: s.log,
    goal: {
      label: '完成一次冷查询，再对相同域名查询一次，观察有效缓存。',
      reached: s.coldCompleted && s.cachedCompleted,
    },
  }
}
export const dnsEngine: EngineFactory = () => createSession(initialDns, transitionDns, presentDns)
