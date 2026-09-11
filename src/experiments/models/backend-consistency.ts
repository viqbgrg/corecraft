import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
interface VersionedStock {
  version: number
  stock: number
}
interface OutboxEvent extends VersionedStock {
  id: string
  published: boolean
}
export interface IntegrationState {
  mode: 'naive' | 'outbox'
  db: VersionedStock
  cache: VersionedStock | null
  floor: number
  reader: VersionedStock | null
  stock: number
  outbox: OutboxEvent[]
  queue: OutboxEvent[]
  projection: VersionedStock
  inbox: string[]
  notifications: number
  duplicateSkips: number
  clock: number
  selected: string
  lease: { owner: string; token: number; expires: number } | null
  token: number
  workers: { id: string; token: number | null; pending: string | null; alive: boolean }[]
  lastNaive: number | null
  staleSeen: boolean
  gapSeen: boolean
  fillRejected: boolean
  error: string | null
  log: Observation[]
}
export function initialIntegration(): IntegrationState {
  return {
    mode: 'naive',
    db: { version: 1, stock: 10 },
    cache: null,
    floor: 1,
    reader: null,
    stock: 9,
    outbox: [],
    queue: [],
    projection: { version: 1, stock: 10 },
    inbox: [],
    notifications: 0,
    duplicateSkips: 0,
    clock: 0,
    selected: 'W1',
    lease: null,
    token: 0,
    workers: ['W1', 'W2'].map((id) => ({ id, token: null, pending: null, alive: true })),
    lastNaive: null,
    staleSeen: false,
    gapSeen: false,
    fillRejected: false,
    error: null,
    log: [],
  }
}
function invalidate(s: IntegrationState, version: number) {
  s.floor = Math.max(s.floor, version)
  if (s.cache && s.cache.version < s.floor) s.cache = null
}
export function integrationTransition(state: IntegrationState, a: ExperimentAction): IntegrationState {
  if (a.type === 'mode' && ['naive', 'outbox'].includes(String(a.value)))
    return {
      ...initialIntegration(),
      mode: a.value as IntegrationState['mode'],
      staleSeen: state.staleSeen,
      gapSeen: state.gapSeen,
      fillRejected: state.fillRejected,
      log: addLog(
        state.log,
        '新集成协议',
        '相同初始库存，重新比较双写与本地事务 outbox；保留已观察的失败证据。',
      ),
    }
  if (a.type === 'stock') {
    const value = boundedInteger(a.value, 0, 20)
    return value === null ? state : { ...state, stock: value }
  }
  if (a.type === 'selected' && ['W1', 'W2'].includes(String(a.value)))
    return { ...state, selected: String(a.value) }
  if (
    ![
      'read-start',
      'read-fill',
      'commit',
      'invalidate',
      'writer-crash',
      'claim',
      'publish',
      'mark',
      'relay-crash',
      'resume',
      'tick',
      'deliver',
      'reverse',
    ].includes(a.type)
  )
    return state
  const s = structuredClone(state),
    w = s.workers.find((w) => w.id === s.selected)!
  s.error = null
  let detail = ''
  if (a.type === 'read-start') {
    s.reader = s.cache ? { ...s.cache } : { ...s.db }
    detail = `读取线程保留 ${s.cache ? '缓存' : '数据库'} 快照 v${s.reader.version}、stock=${s.reader.stock}，稍后才回填。`
  } else if (a.type === 'read-fill') {
    if (!s.reader) return { ...state, error: '先开始一次读取，保存其实际读到的版本。' }
    if (s.mode === 'outbox' && s.reader.version < s.floor) {
      s.fillRejected = true
      detail = `拒绝回填 v${s.reader.version}，缓存端版本下界已是 ${s.floor}；避免晚到读覆盖更新后的失效状态。`
    } else {
      s.cache = { ...s.reader }
      s.staleSeen ||= s.cache.version < s.db.version
      detail = `回填 v${s.cache.version} / ${s.cache.stock}。${s.cache.version < s.db.version ? '数据库已更新，旧读把过时值重新放回共享缓存。' : '缓存与读时点一致。'}`
    }
    s.reader = null
  } else if (a.type === 'commit') {
    if (s.outbox.length >= 12) return { ...state, error: '教学 outbox 最多 12 项。' }
    s.db = { version: s.db.version + 1, stock: s.stock }
    if (s.mode === 'outbox') s.outbox.push({ id: `stock-v${s.db.version}`, ...s.db, published: false })
    else s.lastNaive = s.db.version
    detail = `数据库本地提交 v${s.db.version} / stock=${s.db.stock}。${s.mode === 'outbox' ? '同一事务原子插入 outbox 事件；这里只承诺本地原子性。' : '消息发送尚未发生，直接双写存在故障间隙。'}`
  } else if (a.type === 'invalidate') {
    if (s.mode === 'outbox') invalidate(s, s.db.version)
    else s.cache = null
    detail = '更新后使缓存失效；普通 DEL 不能阻止之前已开始的旧读稍后重新回填。'
  } else if (a.type === 'writer-crash') {
    s.gapSeen ||= s.mode === 'naive' && s.lastNaive !== null
    s.lastNaive = null
    detail = `写服务在本地提交后停止。${s.mode === 'naive' ? '没有持久消息意图，恢复进程不能自动补回漏发事件。' : 'outbox 仍在数据库，可由 relay 继续投递。'}`
  } else if (a.type === 'tick') {
    s.clock++
    detail = '推进 relay 租约服务时钟；过期让其他 relay 有机会接管。'
  } else if (a.type === 'relay-crash') {
    w.alive = false
    w.pending = null
    detail = 'relay 在发布后、标记 outbox 前停止，租约尚未到期；队列可能已有事件，数据库仍显示待发布。'
  } else if (a.type === 'resume') {
    w.alive = true
    detail = 'relay 恢复，其局部 token 仍需通过当前租约检查。'
  } else if (a.type === 'reverse') {
    s.queue.reverse()
    detail = '注入消息乱序，检查 projection 与缓存版本不会倒退。'
  } else if (a.type === 'deliver') {
    const event = s.queue.shift()
    if (!event) return { ...state, error: '队列没有待处理事件。' }
    if (s.inbox.includes(event.id)) {
      s.duplicateSkips++
      detail = `事件 ${event.id} 已在本地事务 inbox，跳过重复通知与投影。`
    } else {
      s.inbox.push(event.id)
      s.notifications++
      if (event.version > s.projection.version) s.projection = { version: event.version, stock: event.stock }
      invalidate(s, event.version)
      detail = `消费事务记录 ${event.id} 并更新适用版本投影，通知效果一次；随后确认消息。缓存版本下界=${s.floor}。`
    }
  } else {
    if (s.mode !== 'outbox') return { ...state, error: '本场景没有事务 outbox；切换协议后观察 relay。' }
    if (!w.alive) return { ...state, error: '当前 relay 已停止。' }
    if (a.type === 'claim') {
      if (s.lease && s.lease.expires > s.clock)
        return { ...state, error: 'relay 租约尚未到期，当前不允许另一个 worker 接管。' }
      s.lease = { owner: w.id, token: ++s.token, expires: s.clock + 2 }
      w.token = s.token
      detail = `${w.id} 获得 relay 租约 token=${w.token}，到期 ${s.lease.expires}；锁降低竞争，但不使发布与标记变成原子操作。`
    } else {
      if (!s.lease || s.lease.owner !== w.id || s.lease.token !== w.token || s.lease.expires <= s.clock)
        return { ...state, error: 'relay token 已失效，不能继续本次教学存储操作。' }
      if (a.type === 'publish') {
        if (s.queue.length >= 24) return { ...state, error: '教学队列最多 24 个事件副本。' }
        const event = s.outbox.find((e) => !e.published)
        if (!event) return { ...state, error: '没有尚待发布的 outbox 记录。' }
        s.queue.push({ ...event })
        w.pending = event.id
        detail = `发布 ${event.id} 到队列，收到 Broker 接纳；尚未在数据库标记完成，重试可能发布重复。`
      } else {
        const event = s.outbox.find((e) => e.id === w.pending)
        if (!event) return { ...state, error: '当前 relay 没有已发布但尚待标记的记录。' }
        event.published = true
        w.pending = null
        detail = '验证当前租约身份后标记 outbox 已发布；标记失败不代表队列没有接纳。'
      }
    }
  }
  s.log = addLog(s.log, a.type, detail)
  return s
}
export function presentIntegration(s: IntegrationState): ExperimentView {
  const reached =
    s.staleSeen &&
    s.gapSeen &&
    s.fillRejected &&
    s.duplicateSkips > 0 &&
    s.notifications === s.inbox.length &&
    s.outbox.length > 0 &&
    s.outbox.every((e) => e.published) &&
    s.queue.length === 0 &&
    s.projection.version === s.db.version
  return {
    scene: {
      kind: 'data',
      title: '数据库、共享缓存、relay 租约与消息消费者各有原子边界',
      tables: [
        {
          id: 'integration-state',
          title: '独立服务与版本',
          columns: ['位置', '版本 / 下界', 'stock'],
          rows: [
            { id: 'db', values: ['商品 DB', s.db.version, s.db.stock] },
            { id: 'cache', values: ['共享缓存', s.cache?.version ?? 'miss', s.cache?.stock ?? '无'] },
            { id: 'floor', values: ['缓存版本下界', s.floor, '不回退'] },
            { id: 'read', values: ['读取线程快照', s.reader?.version ?? '无', s.reader?.stock ?? '无'] },
            { id: 'projection', values: ['下游投影 DB', s.projection.version, s.projection.stock] },
          ],
        },
        {
          id: 'integration-outbox',
          title: '与商品更新原子提交的 outbox',
          columns: ['事件 id', 'version / stock', 'published'],
          rows: s.outbox.map((e) => ({
            id: e.id,
            values: [e.id, `${e.version} / ${e.stock}`, String(e.published)],
          })),
        },
        {
          id: 'integration-queue',
          title: '消息队列中的实际副本',
          columns: ['事件 id', 'version / stock'],
          rows: s.queue.map((e, i) => ({ id: String(i), values: [e.id, `${e.version} / ${e.stock}`] })),
        },
      ],
      caption:
        '商品服务与投影服务独立存储，单调数据版本，事务 outbox/inbox 与可靠消息接纳。共享缓存保存不丢失的版本下界，原子校验回填；实际需要处理下界淘汰、TTL 与失效消息延迟。relay 租约服务固定2时隙，只减少竞争，发布/标记仍可重复。不是跨缓存/MQ/数据库的全局 ACID，也不声称缓存始终线性一致。',
    },
    metrics: [
      { label: 'relay 时钟', value: s.clock },
      {
        label: 'relay 租约',
        value: s.lease ? `${s.lease.owner} / ${s.lease.token} / 到 ${s.lease.expires}` : '无',
      },
      { label: '实际通知效果数', value: s.notifications },
      { label: '重复消息跳过数', value: s.duplicateSkips },
    ],
    controls: [
      {
        id: 'mode',
        kind: 'select',
        label: '新场景集成写入协议',
        value: s.mode,
        options: [
          { value: 'naive', label: '直接双写 + 普通缓存 DEL' },
          { value: 'outbox', label: '事务 outbox/inbox + 版本下界' },
        ],
      },
      { id: 'stock', kind: 'number', label: '下次提交库存', value: s.stock, min: 0, max: 20 },
      {
        id: 'selected',
        kind: 'select',
        label: '当前 relay worker',
        value: s.selected,
        options: ['W1', 'W2'].map((id) => ({ value: id, label: id })),
      },
      ...[
        ['read-start', '读取线程保存当前数据库 / 缓存快照'],
        ['commit', '商品服务提交库存更新'],
        ['invalidate', '更新后执行缓存失效'],
        ['read-fill', '读取线程尝试回填旧快照'],
        ['writer-crash', '提交后停止商品服务'],
        ['claim', 'relay 获取有限租约'],
        ['publish', 'relay 发布待发送 outbox 事件'],
        ['mark', 'relay 标记发布完成'],
        ['relay-crash', '发布后停止当前 relay'],
        ['resume', '恢复当前 relay'],
        ['tick', '租约时钟推进一时隙'],
        ['deliver', '消费者处理一个事件并确认'],
        ['reverse', '注入队列事件逆序'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'commit' })),
    ],
    status: {
      title: s.error
        ? '集成操作前提不满足'
        : reached
          ? '双写间隙、旧回填与重复消费均有处理协议'
          : '分布式锁不自动合并多个系统的提交边界',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先复现更新后 DEL 仍被旧读回填、以及提交后漏发；再让 outbox relay 发布后崩溃并由另一 worker 接管。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '复现旧回填与直接双写漏发，用 outbox/inbox 恢复重复投递，并在失效版本到达后拒绝旧回填。',
      reached,
    },
    log: s.log,
  }
}
export const integrationEngine: EngineFactory = () =>
  createSession(initialIntegration, integrationTransition, presentIntegration)
