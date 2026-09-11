import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export interface PreparedRedo {
  xid: number
  before: number
  after: number
  prepared: boolean
  prepareDurable: boolean
  commitDurable: boolean
}
export interface RowBinlog {
  xid: number
  before: number
  after: number
  durable: boolean
  applied: boolean
}
export type CommitPhase =
  'idle' | 'updated' | 'prepared' | 'binlog-written' | 'binlog-synced' | 'committed' | 'crashed'
export interface InnoCommitState {
  phase: CommitPhase
  target: number
  nextXid: number
  currentXid: number | null
  buffer: { value: number; xid: number } | null
  disk: { value: number; xid: number }
  replica: { value: number; xid: number }
  redo: PreparedRedo[]
  binlog: RowBinlog[]
  confirmed: number
  pageWrites: number
  decisions: { xid: number; decision: 'commit' | 'rollback'; reason: string }[]
  recoveredPrepared: boolean
  rolledBackPrepared: boolean
  replicated: boolean
  error: string | null
  log: Observation[]
}
export function initialInnoCommit(target = 90): InnoCommitState {
  if (boundedInteger(target, 0, 200) === null) throw new Error('Teaching row value must be 0–200')
  return {
    phase: 'idle',
    target,
    nextXid: 1,
    currentXid: null,
    buffer: { value: 100, xid: 0 },
    disk: { value: 100, xid: 0 },
    replica: { value: 100, xid: 0 },
    redo: [],
    binlog: [],
    confirmed: 0,
    pageWrites: 0,
    decisions: [],
    recoveredPrepared: false,
    rolledBackPrepared: false,
    replicated: false,
    error: null,
    log: [],
  }
}
export function innoCommitTransition(state: InnoCommitState, a: ExperimentAction): InnoCommitState {
  if (a.type === 'target' && ['idle', 'committed'].includes(state.phase)) {
    const target = boundedInteger(a.value, 0, 200)
    return target === null ? state : { ...state, target }
  }
  if (
    ![
      'update',
      'prepare',
      'append-binlog',
      'sync-binlog',
      'commit',
      'flush-page',
      'crash',
      'recover',
      'replicate',
    ].includes(a.type)
  )
    return state
  if (state.phase === 'crashed' && !['recover', 'replicate'].includes(a.type)) return state
  const s: InnoCommitState = {
    ...state,
    buffer: state.buffer ? { ...state.buffer } : null,
    disk: { ...state.disk },
    replica: { ...state.replica },
    redo: state.redo.map((record) => ({ ...record })),
    binlog: state.binlog.map((record) => ({ ...record })),
    decisions: [...state.decisions],
    error: null,
  }
  const active = s.redo.find((record) => record.xid === s.currentXid)
  let detail = ''
  if (a.type === 'update') {
    if (!['idle', 'committed'].includes(s.phase)) return state
    const xid = s.nextXid++,
      before = s.buffer!.value
    s.currentXid = xid
    s.redo.push({
      xid,
      before,
      after: s.target,
      prepared: false,
      prepareDurable: false,
      commitDurable: false,
    })
    s.buffer = { value: s.target, xid }
    s.phase = 'updated'
    detail = `事务 XID ${xid} 在 Buffer Pool 中将值 ${before} 改为 ${s.target}。Undo 旧值与 Redo 恢复信息已产生，但还没有持久 PREPARE。`
  } else if (a.type === 'prepare') {
    if (s.phase !== 'updated' || !active) return state
    active.prepared = true
    active.prepareDurable = true
    s.phase = 'prepared'
    detail = `XID ${active.xid} 的 InnoDB PREPARE 及恢复所需信息已持久。它仍不等于最终提交，需要协调 Binlog 的决定。`
  } else if (a.type === 'append-binlog') {
    if (s.phase !== 'prepared' || !active) return state
    s.binlog.push({
      xid: active.xid,
      before: active.before,
      after: active.after,
      durable: false,
      applied: false,
    })
    s.phase = 'binlog-written'
    detail = `写入 XID ${active.xid} 的行事件和事务结束记录，但 Binlog 尚未完成持久化。`
  } else if (a.type === 'sync-binlog') {
    if (s.phase !== 'binlog-written' || !active) return state
    s.binlog.find((record) => record.xid === active.xid)!.durable = true
    s.phase = 'binlog-synced'
    detail = `XID ${active.xid} 的完整 Binlog 事务已持久。即使此刻引擎最终提交标记尚未完成，恢复也有提交决定的证据。`
  } else if (a.type === 'commit') {
    if (s.phase !== 'binlog-synced' || !active) return state
    active.commitDurable = true
    s.phase = 'committed'
    s.confirmed++
    detail = `InnoDB 完成 XID ${active.xid} 的提交，客户端收到成功。缓冲数据页仍可延后写回。`
  } else if (a.type === 'flush-page') {
    if (!s.buffer) return state
    const redo = s.redo.find((record) => record.xid === s.buffer!.xid)
    if (redo && !redo.prepareDurable)
      return { ...state, error: '恢复日志尚未持久，WAL 禁止本模型把这个脏页写入磁盘。' }
    if (s.disk.value !== s.buffer.value || s.disk.xid !== s.buffer.xid) {
      s.disk = { ...s.buffer }
      s.pageWrites++
    }
    detail = `磁盘页现在为 ${s.disk.value}。数据页落盘本身不决定事务提交；prepared 且未决定的页仍可能需要撤销。`
  } else if (a.type === 'crash') {
    s.redo = s.redo.filter((record) => record.prepareDurable)
    s.binlog = s.binlog.filter((record) => record.durable)
    s.buffer = null
    s.currentXid = null
    s.phase = 'crashed'
    detail =
      '数据库进程崩溃，保留持久 Redo、持久 Binlog 与磁盘页，丢失未持久内容和 Buffer Pool。复制端是另一台机器，保留它已经应用的数据。'
  } else if (a.type === 'recover') {
    if (s.phase !== 'crashed') return state
    let recovered = { value: 100, xid: 0 }
    s.decisions = []
    for (const record of s.redo) {
      const inBinlog = s.binlog.some((event) => event.durable && event.xid === record.xid)
      if (record.commitDurable || (record.prepared && inBinlog)) {
        if (!record.commitDurable) s.recoveredPrepared = true
        s.decisions.push({
          xid: record.xid,
          decision: 'commit',
          reason: record.commitDurable ? '已有 InnoDB 提交标记' : '持久 Binlog 中找到完整同 XID 事务',
        })
        record.commitDurable = true
        recovered = { value: record.after, xid: record.xid }
      } else {
        s.rolledBackPrepared ||= record.prepared
        s.decisions.push({
          xid: record.xid,
          decision: 'rollback',
          reason: '仅有 PREPARE，持久 Binlog 中没有同 XID 的提交决定',
        })
      }
    }
    if (s.disk.value !== recovered.value || s.disk.xid !== recovered.xid) s.pageWrites++
    s.disk = recovered
    s.buffer = { ...recovered }
    s.phase = 'idle'
    detail = `按 XID 协调恢复后，主库值=${s.disk.value}。prepared 并不一律回滚；客户端未收到成功也不证明事务未提交。`
  } else {
    let applied = 0
    for (const event of s.binlog) {
      if (!event.durable || event.applied) continue
      s.replica = { value: event.after, xid: event.xid }
      event.applied = true
      applied++
    }
    s.replicated ||= applied > 0
    detail = `复制端应用 ${applied} 个持久 Binlog 事务，值=${s.replica.value}。已应用 XID 不重复执行；这里只演示按顺序消费，不模拟完整复制协议。`
  }
  s.log = addLog(s.log, a.type, detail, a.type === 'crash' ? 'warning' : 'neutral')
  return s
}
export function presentInnoCommit(s: InnoCommitState): ExperimentView {
  const reached =
    s.recoveredPrepared &&
    s.rolledBackPrepared &&
    s.replicated &&
    s.phase !== 'crashed' &&
    s.disk.value === s.replica.value &&
    s.disk.xid === s.replica.xid
  return {
    scene: {
      kind: 'data',
      title: 'InnoDB 日志与 Server Binlog 协调同一个 XID',
      cards: [
        { id: 'buffer', label: 'Buffer Pool 中的行', value: s.buffer?.value ?? '已丢失' },
        { id: 'disk', label: '主库磁盘页', value: s.disk.value, detail: `对应 XID ${s.disk.xid}` },
        {
          id: 'replica',
          label: '复制端已应用的行',
          value: s.replica.value,
          detail: `已应用 XID ${s.replica.xid}`,
        },
      ],
      tables: [
        {
          id: 'innodb-redo',
          title: 'InnoDB 恢复信息 / Undo 旧值由 Redo 保护',
          columns: ['XID', '旧值 → 新值', 'PREPARE', 'PREPARE 持久', '提交标记'],
          rows: s.redo.map((record) => ({
            id: String(record.xid),
            values: [
              record.xid,
              `${record.before} → ${record.after}`,
              record.prepared ? '是' : '否',
              record.prepareDurable ? '是' : '否',
              record.commitDurable ? '已完成' : '无',
            ],
          })),
        },
        {
          id: 'mysql-binlog',
          title: 'Server 层行模式 Binlog / 含完整事务结束 XID',
          columns: ['XID', '行事件', '持久', '复制端已应用'],
          rows: s.binlog.map((event) => ({
            id: String(event.xid),
            values: [
              event.xid,
              `SET value=${event.after}`,
              event.durable ? '是' : '否',
              event.applied ? '是' : '否',
            ],
          })),
        },
        {
          id: 'innodb-recovery-decisions',
          title: '最近一次恢复的协调决定',
          columns: ['XID', '决定', '依据'],
          rows: s.decisions.map((decision) => ({
            id: String(decision.xid),
            values: [decision.xid, decision.decision.toUpperCase(), decision.reason],
          })),
        },
      ],
      caption:
        '以 MySQL 8.4 InnoDB 内部两阶段提交解释日志职责，采用持久 PREPARE 与持久完整 Binlog 后确认的保守配置。单行、事务串行，保留全部日志；不模拟组提交优化、XA、刷盘弱配置、日志损坏或恢复中再次崩溃。',
    },
    metrics: [
      { label: '内部提交阶段', value: s.phase },
      { label: '客户端收到成功次数', value: s.confirmed },
      { label: '数据页写入次数', value: s.pageWrites },
      { label: '持久 Binlog 事务', value: s.binlog.filter((event) => event.durable).length },
      { label: '已应用 Binlog 事务', value: s.binlog.filter((event) => event.applied).length },
    ],
    controls: [
      {
        id: 'target',
        kind: 'number',
        label: '下一事务写入值',
        value: s.target,
        min: 0,
        max: 200,
        disabled: !['idle', 'committed'].includes(s.phase),
      },
      {
        id: 'update',
        kind: 'button',
        label: '开始事务并修改缓冲行',
        primary: true,
        disabled: !['idle', 'committed'].includes(s.phase),
      },
      { id: 'prepare', kind: 'button', label: 'PREPARE · 持久化 Redo', disabled: s.phase !== 'updated' },
      {
        id: 'append-binlog',
        kind: 'button',
        label: '写入完整 Binlog 事务',
        disabled: s.phase !== 'prepared',
      },
      {
        id: 'sync-binlog',
        kind: 'button',
        label: '同步 Binlog 到持久层',
        disabled: s.phase !== 'binlog-written',
      },
      {
        id: 'commit',
        kind: 'button',
        label: '完成引擎提交并确认成功',
        disabled: s.phase !== 'binlog-synced',
      },
      { id: 'flush-page', kind: 'button', label: '尝试写回主库数据页', disabled: s.phase === 'crashed' },
      { id: 'crash', kind: 'button', label: '在当前阶段崩溃', disabled: s.phase === 'crashed' },
      { id: 'recover', kind: 'button', label: '按 Redo 与 Binlog 恢复', disabled: s.phase !== 'crashed' },
      { id: 'replicate', kind: 'button', label: '复制端应用持久 Binlog' },
    ],
    status: {
      title: s.error
        ? '日志顺序尚未满足'
        : reached
          ? '主库恢复决定与复制事件一致'
          : 'PREPARE 之后还要确认协调者的决定',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先在只有持久 PREPARE 时崩溃，再在 Binlog 已持久而引擎未最终提交时崩溃，比较恢复决定。',
      tone: s.error || s.phase === 'crashed' ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '观察 prepared 回滚与 prepared 恢复提交两种情况，再让复制端应用 Binlog 并与主库一致。',
      reached,
    },
    log: s.log,
  }
}
export const innoCommitEngine: EngineFactory = (config) =>
  createSession(() => initialInnoCommit(Number(config.target ?? 90)), innoCommitTransition, presentInnoCommit)
