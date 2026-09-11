import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
export function redisSlot(key: string): number {
  const open = key.indexOf('{'),
    close = open < 0 ? -1 : key.indexOf('}', open + 1)
  const hashKey = open >= 0 && close > open + 1 ? key.slice(open + 1, close) : key
  let crc = 0
  for (const byte of new TextEncoder().encode(hashKey)) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff
  }
  return crc % 16384
}
interface Replica {
  id: string
  history: { id: number; value: number }[]
  role: 'master' | 'replica'
}
interface SlotMigration {
  slot: number
  owner: 'A' | 'B'
  source: 'A' | 'B'
  target: 'A' | 'B'
  cache: 'A' | 'B'
  location: 'A' | 'B'
  phase: 'stable' | 'migrating' | 'moved'
  reply: string
  asking: boolean
}
export interface RedisTopologyState {
  nodes: Replica[]
  master: string
  replica: string
  sentinel: string
  votes: string[]
  partitioned: boolean
  next: number
  acked: number[]
  lost: number[]
  staleSeen: boolean
  promoted: boolean
  key: string
  otherKey: string
  cluster: SlotMigration
  askSeen: boolean
  movedSeen: boolean
  error: string | null
  log: Observation[]
}
function clusterFor(key: string): SlotMigration {
  const slot = redisSlot(key),
    owner = slot < 8192 ? 'A' : 'B'
  return {
    slot,
    owner,
    source: owner,
    target: owner === 'A' ? 'B' : 'A',
    cache: owner,
    location: owner,
    phase: 'stable',
    reply: '尚未请求',
    asking: false,
  }
}
export function initialTopology(): RedisTopologyState {
  return {
    nodes: ['M', 'R1', 'R2'].map((id) => ({ id, role: id === 'M' ? 'master' : 'replica', history: [] })),
    master: 'M',
    replica: 'R1',
    sentinel: 'S1',
    votes: [],
    partitioned: false,
    next: 1,
    acked: [],
    lost: [],
    staleSeen: false,
    promoted: false,
    key: '{user}:cart',
    otherKey: '{user}:profile',
    cluster: clusterFor('{user}:cart'),
    askSeen: false,
    movedSeen: false,
    error: null,
    log: [],
  }
}
const latest = (n: Replica) => n.history.at(-1)?.value ?? 0
export function topologyTransition(state: RedisTopologyState, a: ExperimentAction): RedisTopologyState {
  if (a.type === 'replica' && ['M', 'R1', 'R2'].includes(String(a.value)))
    return { ...state, replica: String(a.value) }
  if (a.type === 'sentinel' && ['S1', 'S2', 'S3'].includes(String(a.value)))
    return { ...state, sentinel: String(a.value) }
  if (a.type === 'key') {
    const key = String(a.value ?? '')
    if (new TextEncoder().encode(key).length > 64) return state
    return { ...state, key, cluster: clusterFor(key) }
  }
  if (a.type === 'otherKey') return { ...state, otherKey: String(a.value ?? '') }
  if (
    ![
      'write',
      'old-write',
      'replicate',
      'read-replica',
      'partition',
      'vote',
      'promote',
      'heal',
      'cluster-get',
      'migrate',
      'move-key',
      'finalize',
      'ask',
      'refresh',
      'cross-slot',
    ].includes(a.type)
  )
    return state
  const s = structuredClone(state)
  s.error = null
  const master = s.nodes.find((n) => n.id === s.master)!,
    replica = s.nodes.find((n) => n.id === s.replica)!
  let detail = ''
  if (a.type === 'write' || a.type === 'old-write') {
    if (a.type === 'old-write' && !s.partitioned)
      return { ...state, error: '旧主隔离写入只在网络分区场景演示。' }
    const target = a.type === 'old-write' ? s.nodes[0]! : master
    if (target.history.length >= 20) return { ...state, error: '教学写入最多 20 条。' }
    const entry = { id: s.next++, value: latest(target) + 1 }
    target.history.push(entry)
    s.acked.push(entry.id)
    detail = `${target.id} 已确认写入 #${entry.id}，value=${entry.value}；复制尚未自动完成。Sentinel 无法仅凭故障判断物理阻止隔离旧主继续接受客户端写入。`
  } else if (a.type === 'replicate') {
    if (replica.id === master.id) return { ...state, error: '当前选中的是主节点。' }
    if (s.partitioned && (master.id === 'M' || replica.id === 'M'))
      return { ...state, error: '分区阻止该复制链路。' }
    replica.history = structuredClone(master.history)
    detail = `${replica.id} 应用主节点的复制前缀至 #${replica.history.at(-1)?.id ?? 0}。这是数据复制，不是 Raft 提交。`
  } else if (a.type === 'read-replica') {
    s.staleSeen ||= latest(replica) !== latest(master)
    detail = `从 ${replica.id} 读 ${latest(replica)}，当前主 ${master.id} 为 ${latest(master)}；异步复制允许滞后。`
  } else if (a.type === 'partition') {
    s.partitioned = true
    s.votes = []
    detail = '旧主 M 与两个副本及多数 Sentinel 隔离，但另一路客户端仍可到达 M；不是所有网络都同时断开。'
  } else if (a.type === 'vote') {
    if (!s.partitioned) return { ...state, error: '先制造旧主网络隔离。' }
    if (!s.votes.includes(s.sentinel)) s.votes.push(s.sentinel)
    detail = `${s.sentinel} 对故障与本轮故障转移授权投票；去重票数 ${s.votes.length}/3，教学 quorum=2 且需多数授权。`
  } else if (a.type === 'promote') {
    if (!s.partitioned || s.votes.length < 2)
      return { ...state, error: '未满足故障判断 quorum 与多数授权，不能故障转移。' }
    if (s.promoted) return state
    const candidate = s.nodes
      .filter((n) => n.id !== 'M')
      .sort(
        (a, b) => (b.history.at(-1)?.id ?? 0) - (a.history.at(-1)?.id ?? 0) || a.id.localeCompare(b.id),
      )[0]!
    candidate.role = 'master'
    s.master = candidate.id
    s.promoted = true
    detail = `相同优先级且可达副本中 ${candidate.id} 复制最前，提升为新主。旧主仍隔离，数据是否丢失由已复制前缀决定。`
  } else if (a.type === 'heal') {
    if (!s.promoted) return { ...state, error: '先完成多数授权的故障转移。' }
    s.partitioned = false
    s.lost = s.acked.filter((id) => !master.history.some((h) => h.id === id))
    for (const n of s.nodes) {
      n.role = n.id === s.master ? 'master' : 'replica'
      n.history = structuredClone(master.history)
    }
    detail = `旧主重配为副本并同步新主，丢弃分叉；已确认却不在获胜历史中的写入：${s.lost.join(', ') || '无'}。`
  } else {
    const c = s.cluster
    if (a.type === 'cluster-get') {
      c.asking = false
      if (c.cache !== c.owner && c.phase === 'moved') c.reply = `MOVED ${c.slot} ${c.owner}`
      else if (c.phase === 'migrating' && c.cache === c.source && c.location === c.target)
        c.reply = `ASK ${c.slot} ${c.target}`
      else c.reply = `VALUE 1 from ${c.cache}`
      detail = c.reply
    } else if (a.type === 'migrate') {
      if (c.phase !== 'stable') return state
      c.phase = 'migrating'
      detail = `槽 ${c.slot} 从 ${c.source} MIGRATING 到 ${c.target} IMPORTING；当前归属尚未改变。`
    } else if (a.type === 'move-key') {
      if (c.phase !== 'migrating') return state
      c.location = c.target
      detail = '把本课此槽唯一键迁移到目标；旧节点遇到缺失键会要求 ASK 重试。'
    } else if (a.type === 'ask') {
      if (!c.reply.startsWith('ASK '))
        return { ...state, error: '需要先收到 ASK，才能对目标发送 ASKING + 本次命令。' }
      c.asking = true
      c.reply = `VALUE 1 from ${c.target} / ASKING`
      s.askSeen = true
      detail = '只对本次命令临时到目标重试，客户端长期槽缓存仍指向旧主。'
    } else if (a.type === 'finalize') {
      if (c.phase !== 'migrating' || c.location !== c.target)
        return { ...state, error: '先完成此槽唯一教学键迁移。' }
      c.owner = c.target
      c.phase = 'moved'
      detail = '槽归属正式变更；旧客户端缓存下一次请求会收到 MOVED。'
    } else if (a.type === 'refresh') {
      if (!c.reply.startsWith('MOVED ')) return { ...state, error: '需要先收到 MOVED。' }
      c.cache = c.owner
      c.reply = `VALUE 1 from ${c.owner}`
      s.movedSeen = true
      detail = '更新客户端槽映射并重试；MOVED 与 ASK 的缓存处理不同。'
    } else {
      const other = redisSlot(s.otherKey)
      c.reply = other === c.slot ? '同槽：允许本课多键命令路由' : 'CROSSSLOT'
      detail = `${s.key} → ${c.slot}，${s.otherKey} → ${other}；有效非空 hash tag 可让相关键进入同一槽。`
    }
  }
  s.log = addLog(s.log, a.type, detail)
  return s
}
export function presentTopology(s: RedisTopologyState): ExperimentView {
  const c = s.cluster,
    reached = s.staleSeen && s.promoted && s.lost.length > 0 && s.askSeen && s.movedSeen
  return {
    scene: {
      kind: 'data',
      title: '复制与 Sentinel 决定主节点；Cluster 槽映射决定键路由',
      tables: [
        {
          id: 'redis-replicas',
          title: '独立的 Sentinel 复制组',
          columns: ['节点', '角色', 'value', '复制写入历史'],
          rows: s.nodes.map((n) => ({
            id: n.id,
            values: [n.id, n.role, latest(n), n.history.map((h) => h.id).join(', ') || '空'],
          })),
        },
        {
          id: 'redis-cluster-route',
          title: '独立的两分片 Cluster 路由场景',
          columns: ['key', '槽', '归属', '客户端缓存', '键所在', '迁移阶段'],
          rows: [{ id: 'route', values: [s.key, c.slot, c.owner, c.cache, c.location, c.phase] }],
        },
      ],
      caption:
        '两个独立场景，不把 Sentinel 组当作 Redis Cluster。复制组异步、三 Sentinel、quorum=2 且多数授权，副本优先级相同，省略超时细节与 Sentinel 领导选举消息。Cluster 使用真实 CRC16/XMODEM 与 16384 槽，只迁移含一个教学键的槽；无真实 Cluster gossip、多副本故障转移或事务脚本执行。',
    },
    metrics: [
      { label: '当前 Sentinel 组主节点', value: s.master },
      { label: '去重 Sentinel 票数', value: s.votes.length },
      { label: '丢失的已确认写入', value: s.lost.join(', ') || '无' },
      { label: 'Cluster 最近结果', value: c.reply },
    ],
    controls: [
      {
        id: 'replica',
        kind: 'select',
        label: '复制 / 读取节点',
        value: s.replica,
        options: ['M', 'R1', 'R2'].map((id) => ({ value: id, label: id })),
      },
      {
        id: 'sentinel',
        kind: 'select',
        label: '投票 Sentinel',
        value: s.sentinel,
        options: ['S1', 'S2', 'S3'].map((id) => ({ value: id, label: id })),
      },
      { id: 'key', kind: 'text', label: '新 Cluster 路由 key', value: s.key },
      { id: 'otherKey', kind: 'text', label: '同槽校验的第二个 key', value: s.otherKey },
      ...[
        ['write', '向当前主写入并确认'],
        ['replicate', '把主节点历史复制到选中副本'],
        ['read-replica', '读取选中副本的值'],
        ['partition', '隔离旧主 M 与多数节点'],
        ['old-write', '隔离客户端向旧主 M 写入'],
        ['vote', '当前 Sentinel 投出一次授权票'],
        ['promote', '按多数授权提升最前副本'],
        ['heal', '恢复链路并将旧主重配为副本'],
        ['cluster-get', '按客户端槽缓存执行 GET'],
        ['migrate', '开始迁移当前槽'],
        ['move-key', '迁移当前槽的唯一教学键'],
        ['ask', 'ASKING 后临时重试本次命令'],
        ['finalize', '发布新的槽归属'],
        ['refresh', '按 MOVED 更新槽缓存并重试'],
        ['cross-slot', '检查两键的 hash slot'],
      ].map(([id, label]) => ({
        id: id!,
        label: label!,
        kind: 'button' as const,
        primary: id === 'replicate',
      })),
    ],
    status: {
      title: s.error
        ? '复制或路由前提尚未满足'
        : reached
          ? '主切换的数据边界和槽重定向已验证'
          : '可用性机制不会自动补齐丢失的复制前缀',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '写入后先读滞后副本，再复制、隔离、旧主写入、两票提升并恢复；另行比较 Cluster 的 ASK 与 MOVED。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '观察复制滞后及故障转移丢失已确认写入，再分别处理槽迁移的 ASK 和 MOVED。', reached },
    log: s.log,
  }
}
export const topologyEngine: EngineFactory = () =>
  createSession(initialTopology, topologyTransition, presentTopology)
