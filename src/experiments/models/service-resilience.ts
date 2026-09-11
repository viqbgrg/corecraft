import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
interface Instance {
  id: string
  up: boolean
  latency: number
  expires: number
  breaker: 'closed' | 'open' | 'half-open'
  failures: number
  openUntil: number
  probe: boolean
}
interface Request {
  id: number
  key: string
  start: number
  deadline: number
  timeout: number
  maxRetries: number
  idempotent: boolean
  nextAt: number
  state: 'pending' | 'success' | 'timeout' | 'rejected'
  attempts: number[]
}
interface Attempt {
  id: number
  request: number
  node: string
  start: number
  due: number
  deadline: number
  accepted: boolean
  workDone: boolean
  state: 'pending' | 'success' | 'timeout'
  probe: boolean
}
export interface ResilienceState {
  clock: number
  instances: Instance[]
  cache: string[]
  selected: string
  policy: 'round-robin' | 'least-inflight'
  timeout: number
  retries: number
  idempotent: boolean
  tokens: number
  cursor: number
  requests: Request[]
  attempts: Attempt[]
  inbox: string[]
  effects: number
  skips: number
  rateRejected: number
  openSeen: boolean
  retrySeen: boolean
  discovered: boolean
  error: string | null
  log: Observation[]
}
export function initialResilience(): ResilienceState {
  return {
    clock: 0,
    instances: [
      {
        id: 'A',
        up: true,
        latency: 3,
        expires: 6,
        breaker: 'closed',
        failures: 0,
        openUntil: 0,
        probe: false,
      },
      {
        id: 'B',
        up: true,
        latency: 1,
        expires: 6,
        breaker: 'closed',
        failures: 0,
        openUntil: 0,
        probe: false,
      },
    ],
    cache: [],
    selected: 'A',
    policy: 'round-robin',
    timeout: 2,
    retries: 1,
    idempotent: true,
    tokens: 3,
    cursor: 0,
    requests: [],
    attempts: [],
    inbox: [],
    effects: 0,
    skips: 0,
    rateRejected: 0,
    openSeen: false,
    retrySeen: false,
    discovered: false,
    error: null,
    log: [],
  }
}
function launch(s: ResilienceState, r: Request) {
  let candidates = s.instances.filter(
    (n) =>
      s.cache.includes(n.id) &&
      (n.breaker === 'closed' ||
        (n.breaker === 'open' && s.clock >= n.openUntil) ||
        (n.breaker === 'half-open' && !n.probe)),
  )
  if (s.policy === 'least-inflight')
    candidates = candidates.sort(
      (a, b) =>
        s.attempts.filter((t) => t.node === a.id && !t.workDone).length -
          s.attempts.filter((t) => t.node === b.id && !t.workDone).length || a.id.localeCompare(b.id),
    )
  const n = s.policy === 'round-robin' ? candidates[s.cursor++ % candidates.length] : candidates[0]
  if (!n) {
    r.state = 'rejected'
    s.log = addLog(s.log, 'Fail fast', '缓存没有端点或所有熔断器不允许调用，不创建无界重试。', 'warning')
    return
  }
  const probe = n.breaker !== 'closed'
  if (probe) {
    n.breaker = 'half-open'
    n.probe = true
  }
  const attempt: Attempt = {
    id: s.attempts.length + 1,
    request: r.id,
    node: n.id,
    start: s.clock,
    due: s.clock + n.latency,
    deadline: Math.min(s.clock + r.timeout, r.deadline),
    accepted: n.up,
    workDone: !n.up,
    state: 'pending',
    probe,
  }
  s.attempts.push(attempt)
  r.attempts.push(attempt.id)
  s.retrySeen ||= r.attempts.length > 1
  s.log = addLog(
    s.log,
    '发起下游尝试',
    `请求 ${r.id} attempt ${r.attempts.length} → ${n.id}，deadline=${attempt.deadline}；服务发现快照不保证端点此刻可达。`,
  )
}
function admit(s: ResilienceState) {
  if (s.requests.length >= 20) {
    s.error = '教学请求最多 20 个。'
    return
  }
  const r: Request = {
    id: s.requests.length + 1,
    key: `order-${s.requests.length + 1}`,
    start: s.clock,
    deadline: s.clock + 8,
    timeout: s.timeout,
    maxRetries: s.retries,
    idempotent: s.idempotent,
    nextAt: s.clock,
    state: 'pending',
    attempts: [],
  }
  s.requests.push(r)
  if (s.tokens < 1) {
    r.state = 'rejected'
    s.rateRejected++
    s.log = addLog(
      s.log,
      '入口令牌桶拒绝',
      '容量 3、每时隙补充 1 个令牌；逻辑请求入口限流不等于限制每次重试。',
      'warning',
    )
    return
  }
  s.tokens--
  launch(s, r)
}
function tickResilience(s: ResilienceState) {
  s.clock++
  s.tokens = Math.min(3, s.tokens + 1)
  // Complete work before checking deadlines at this same tick.
  for (const a of s.attempts) {
    if (a.workDone || a.due > s.clock) continue
    a.workDone = true
    const n = s.instances.find((n) => n.id === a.node)!,
      r = s.requests.find((r) => r.id === a.request)!
    if (!n.up) continue
    if (r.idempotent && s.inbox.includes(r.key)) s.skips++
    else {
      if (r.idempotent) s.inbox.push(r.key)
      s.effects++
    }
    if (a.state === 'pending' && r.state === 'pending') {
      a.state = 'success'
      r.state = 'success'
      if (a.probe || n.breaker === 'closed') {
        n.breaker = 'closed'
        n.failures = 0
        n.probe = false
      }
      s.log = addLog(s.log, '及时响应', `请求 ${r.id} 成功；业务效果按稳定幂等键 ${r.key} 处理。`)
    } else
      s.log = addLog(
        s.log,
        '超时后的迟到执行',
        `attempt ${a.id} 的下游工作仍完成；客户端超时没有自动取消或回滚它。`,
        'warning',
      )
  }
  for (const a of s.attempts)
    if (a.state === 'pending' && a.deadline <= s.clock) {
      a.state = 'timeout'
      const n = s.instances.find((n) => n.id === a.node)!,
        r = s.requests.find((r) => r.id === a.request)!
      n.failures++
      n.probe = false
      if (a.probe || n.failures >= 2) {
        n.breaker = 'open'
        n.openUntil = s.clock + 4
        s.openSeen = true
      }
      if (r.state !== 'pending') continue
      if (r.attempts.length <= r.maxRetries && s.clock < r.deadline)
        r.nextAt = s.clock + 2 ** (r.attempts.length - 1)
      else r.state = 'timeout'
      s.log = addLog(
        s.log,
        '调用超时',
        `请求 ${r.id} 等待已结束；${r.state === 'pending' ? `预算内下次重试不早于 ${r.nextAt}` : '重试预算耗尽'}，${n.id} breaker=${n.breaker}。`,
        'warning',
      )
    }
  for (const r of s.requests)
    if (r.state === 'pending' && !r.attempts.some((id) => s.attempts[id - 1]!.state === 'pending')) {
      if (s.clock >= r.deadline) r.state = 'timeout'
      else if (s.clock >= r.nextAt) launch(s, r)
    }
}
export function resilienceTransition(state: ResilienceState, a: ExperimentAction): ResilienceState {
  if (a.type === 'selected' && ['A', 'B'].includes(String(a.value)))
    return { ...state, selected: String(a.value) }
  if (a.type === 'policy' && ['round-robin', 'least-inflight'].includes(String(a.value)))
    return { ...state, policy: a.value as ResilienceState['policy'] }
  if (a.type === 'timeout') {
    const value = boundedInteger(a.value, 1, 6)
    return value === null ? state : { ...state, timeout: value }
  }
  if (a.type === 'retries') {
    const value = boundedInteger(a.value, 0, 2)
    return value === null ? state : { ...state, retries: value }
  }
  if (a.type === 'idempotent' && ['on', 'off'].includes(String(a.value)))
    return { ...state, idempotent: a.value === 'on' }
  if (!['refresh', 'heartbeat', 'toggle', 'submit', 'burst', 'tick', 'run'].includes(a.type)) return state
  const s = structuredClone(state)
  s.error = null
  if (a.type === 'refresh') {
    s.cache = s.instances.filter((n) => n.expires > s.clock).map((n) => n.id)
    s.discovered = true
    s.log = addLog(
      s.log,
      '刷新服务发现快照',
      `注册信息未到期的实例：${s.cache.join(', ') || '无'}；仅更新当前客户端快照。`,
    )
  } else if (a.type === 'heartbeat') {
    const n = s.instances.find((n) => n.id === s.selected)!
    if (!n.up) return { ...state, error: '实例停止，不能发送心跳。' }
    n.expires = s.clock + 6
  } else if (a.type === 'toggle') {
    const n = s.instances.find((n) => n.id === s.selected)!
    n.up = !n.up
    s.log = addLog(s.log, '实例可达性改变', `${n.id} up=${n.up}；注册 TTL 和客户端缓存不会因此自动同步。`)
  } else if (a.type === 'submit') admit(s)
  else if (a.type === 'burst') for (let i = 0; i < 4; i++) admit(s)
  else if (a.type === 'tick') tickResilience(s)
  else
    for (
      let i = 0;
      i < 100 && (s.requests.some((r) => r.state === 'pending') || s.attempts.some((a) => !a.workDone));
      i++
    )
      tickResilience(s)
  return s
}
export function presentResilience(s: ResilienceState): ExperimentView {
  const reached =
    s.discovered &&
    s.rateRejected > 0 &&
    s.retrySeen &&
    s.openSeen &&
    s.skips > 0 &&
    s.requests.filter((r) => r.state === 'success').length >= 3
  return {
    scene: {
      kind: 'data',
      title: '发现、均衡、超时、重试、熔断和限流共同限制故障放大',
      tables: [
        {
          id: 'resilience-instances',
          title: '注册快照与实时服务状态',
          columns: ['实例', '可达', '服务时隙', '注册到期', '客户端缓存', '熔断状态'],
          rows: s.instances.map((n) => ({
            id: n.id,
            values: [
              n.id,
              String(n.up),
              n.latency,
              n.expires,
              String(s.cache.includes(n.id)),
              `${n.breaker} / failures=${n.failures}${n.breaker === 'open' ? ` / 到 ${n.openUntil}` : ''}`,
            ],
          })),
        },
        {
          id: 'resilience-requests',
          title: '逻辑请求 / 固定总预算 8 时隙',
          columns: ['请求', '幂等键', '开始 / deadline', '状态', '尝试次数'],
          rows: s.requests.map((r) => ({
            id: String(r.id),
            values: [r.id, r.key, `${r.start} / ${r.deadline}`, r.state, r.attempts.length],
          })),
        },
        {
          id: 'resilience-attempts',
          title: '实际下游尝试与迟到工作',
          columns: ['attempt', '请求 / 节点', '开始 / due / timeout', '客户端状态', '服务工作完成'],
          rows: s.attempts.map((a) => ({
            id: String(a.id),
            values: [
              a.id,
              `${a.request} / ${a.node}`,
              `${a.start} / ${a.due} / ${a.deadline}`,
              a.state,
              String(a.workDone),
            ],
          })),
        },
      ],
      caption:
        '两个服务实例，统一确定时钟，令牌桶容量3/补充1；每实例连续两次失败开路4时隙，之后仅允许一个半开探针。重试用有上限的指数退避，无随机抖动；同刻先处理完成再判超时。业务效果由共享本地事务 inbox 去重，不把超时当取消。服务发现用 TTL 快照，无真实注册中心、网络、连接池或跨实例分布式限流。',
    },
    metrics: [
      { label: '模拟时隙', value: s.clock },
      { label: '入口剩余令牌', value: s.tokens },
      { label: '入口限流拒绝', value: s.rateRejected },
      { label: '实际业务效果数', value: s.effects },
      { label: '迟到 / 重试去重次数', value: s.skips },
    ],
    controls: [
      {
        id: 'selected',
        kind: 'select',
        label: '操作服务实例',
        value: s.selected,
        options: ['A', 'B'].map((id) => ({ value: id, label: id })),
      },
      {
        id: 'policy',
        kind: 'select',
        label: '客户端负载均衡策略',
        value: s.policy,
        options: [
          { value: 'round-robin', label: '轮询可尝试端点' },
          { value: 'least-inflight', label: '最少尚未完成工作' },
        ],
      },
      { id: 'timeout', kind: 'number', label: '新请求单次超时时隙', value: s.timeout, min: 1, max: 6 },
      { id: 'retries', kind: 'number', label: '新请求最多额外重试次数', value: s.retries, min: 0, max: 2 },
      {
        id: 'idempotent',
        kind: 'select',
        label: '新请求业务幂等协议',
        value: s.idempotent ? 'on' : 'off',
        options: [
          { value: 'on', label: '跨重试复用稳定幂等键' },
          { value: 'off', label: '每次执行都产生效果' },
        ],
      },
      ...[
        ['refresh', '刷新客户端服务发现快照'],
        ['heartbeat', '当前实例发送注册心跳'],
        ['toggle', '切换当前实例可达性'],
        ['submit', '提交一个逻辑请求'],
        ['burst', '同刻突发四个逻辑请求'],
        ['tick', '推进一个调度时隙'],
        ['run', '运行到请求与迟到工作都结束'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'tick' })),
    ],
    status: {
      title: s.error
        ? '服务动作前提未满足'
        : reached
          ? '过载与超时重试的放大已受到控制'
          : '超时是等待预算，不能证明服务没有执行',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '刷新发现快照，默认突发四请求，运行到结束：限流一个，慢 A 超时开路，预算内改向 B 重试并去重。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '通过发现与均衡处理突发，观察入口限流、超时重试和熔断，并阻止迟到工作导致重复业务效果。',
      reached,
    },
    log: s.log,
  }
}
export const resilienceEngine: EngineFactory = () =>
  createSession(initialResilience, resilienceTransition, presentResilience)
