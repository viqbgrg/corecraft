import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type Isolation = 'ru' | 'rc' | 'rr' | 'serializable'
export type TransactionSlot = 'T1' | 'T2'
export type Statement = 'read' | 'read-for-update' | 'set' | 'increment'
export interface RowVersion {
  row: number
  value: number
  tx: number
  commit: number
}
export interface PendingStatement {
  type: Statement
  row: number
  value: number
}
export interface TeachingTransaction {
  id: number
  slot: TransactionSlot
  isolation: Isolation
  status: 'active' | 'committed' | 'aborted'
  snapshot: number | null
  writes: { row: number; value: number }[]
  read: { row: number; value: number; source: string } | null
  waiting: number[]
  pending: PendingStatement | null
}
export interface IsolationComparison {
  isolation: Isolation
  before: number
  during: number
  after: number
  writer: string
}
export interface TransactionState {
  selected: TransactionSlot
  isolation: Isolation
  row: number
  value: number
  nextTx: number
  clock: number
  transactions: TeachingTransaction[]
  versions: RowVersion[]
  locks: { row: number; readers: number[]; writer: number | null }[]
  reads: number
  writeCommits: number
  rollbacks: number
  comparison: IsolationComparison[]
  error: string | null
  log: Observation[]
}
const labels: Record<Isolation, string> = {
  ru: 'Read Uncommitted',
  rc: 'Read Committed',
  rr: 'Repeatable Read',
  serializable: 'Serializable / 点读取两阶段锁',
}
const shortLabels: Record<Isolation, string> = { ru: 'RU', rc: 'RC', rr: 'RR', serializable: 'Serializable' }
export function initialTransactions(isolation: Isolation = 'rr'): TransactionState {
  if (!Object.hasOwn(labels, isolation)) throw new Error('Unsupported transaction isolation')
  return {
    selected: 'T1',
    isolation,
    row: 1,
    value: 20,
    nextTx: 1,
    clock: 0,
    transactions: [],
    versions: [
      { row: 1, value: 10, tx: 0, commit: 0 },
      { row: 2, value: 10, tx: 0, commit: 0 },
    ],
    locks: [1, 2].map((row) => ({ row, readers: [], writer: null })),
    reads: 0,
    writeCommits: 0,
    rollbacks: 0,
    comparison: [],
    error: null,
    log: [],
  }
}
export function currentTransaction(s: TransactionState): TeachingTransaction | undefined {
  return s.transactions.find((tx) => tx.slot === s.selected)
}
function latestVersion(s: TransactionState, row: number, snapshot = Infinity): RowVersion {
  return [...s.versions].reverse().find((version) => version.row === row && version.commit <= snapshot)!
}
function releaseLocks(s: TransactionState, id: number): void {
  for (const lock of s.locks) {
    lock.readers = lock.readers.filter((reader) => reader !== id)
    if (lock.writer === id) lock.writer = null
  }
  for (const tx of s.transactions) tx.waiting = tx.waiting.filter((owner) => owner !== id)
}
function acquire(
  s: TransactionState,
  tx: TeachingTransaction,
  statement: PendingStatement,
  exclusive: boolean,
): boolean {
  const lock = s.locks.find((lock) => lock.row === statement.row)!
  const blockers = [
    ...new Set([
      ...(lock.writer !== null && lock.writer !== tx.id ? [lock.writer] : []),
      ...(exclusive ? lock.readers.filter((id) => id !== tx.id) : []),
    ]),
  ]
  tx.waiting = blockers
  if (blockers.length) {
    tx.pending = { ...statement }
    s.log = addLog(
      s.log,
      '等待行锁',
      `事务 ${tx.id} 对行 ${statement.row} 请求 ${exclusive ? 'X' : 'S'} 锁，等待事务 ${blockers.join(', ')}；语句尚未执行。`,
      'warning',
    )
    return false
  }
  tx.pending = null
  if (exclusive) {
    lock.writer = tx.id
    lock.readers = lock.readers.filter((id) => id !== tx.id)
  } else if (lock.writer !== tx.id && !lock.readers.includes(tx.id)) lock.readers.push(tx.id)
  return true
}
function executeStatement(s: TransactionState, tx: TeachingTransaction, statement: PendingStatement): void {
  const { type, row, value } = statement,
    write = type === 'set' || type === 'increment',
    currentRead = type === 'read-for-update' || write
  if ((currentRead || tx.isolation === 'serializable') && !acquire(s, tx, statement, currentRead)) return
  const own = tx.writes.find((write) => write.row === row)
  let visible = own?.value,
    source = own ? `本事务 ${tx.id} 的未提交写入` : ''
  if (visible === undefined) {
    const dirty =
      tx.isolation === 'ru' && !currentRead
        ? s.transactions.find(
            (other) =>
              other.id !== tx.id &&
              other.status === 'active' &&
              other.writes.some((write) => write.row === row),
          )
        : undefined
    if (dirty) {
      visible = dirty.writes.find((write) => write.row === row)!.value
      source = `事务 ${dirty.id} 的未提交值 / 脏读`
    } else {
      if (tx.isolation === 'rr' && !currentRead) tx.snapshot ??= s.clock
      const version = latestVersion(s, row, tx.isolation === 'rr' && !currentRead ? tx.snapshot! : Infinity)
      visible = version.value
      source = `已提交版本 C${version.commit} / Tx ${version.tx}`
    }
  }
  if (write) {
    const next = type === 'increment' ? visible + value : value
    if (!Number.isInteger(next) || next < 0 || next > 200) {
      s.error = 'CHECK 约束拒绝：库存必须在 0–200 之间。本语句没有修改数据，事务仍需提交或回滚。'
      return
    }
    if (own) own.value = next
    else tx.writes.push({ row, value: next })
    s.log = addLog(
      s.log,
      '更新私有写集',
      `事务 ${tx.id} 持有行 ${row} 的 X 锁，${visible} → ${next}；其他普通 RC / RR 读取仍按版本规则取值。`,
    )
  } else {
    tx.read = { row, value: visible, source }
    s.reads++
    s.log = addLog(
      s.log,
      currentRead ? '当前读 + X 锁' : '读取行版本',
      `事务 ${tx.id} 读行 ${row} 得到 ${visible}，来源：${source}。`,
      'success',
    )
  }
}
export function transactionCycle(s: TransactionState): number[] {
  const active = s.transactions.filter((tx) => tx.status === 'active')
  const visit = (id: number, path: number[]): number[] => {
    const index = path.indexOf(id)
    if (index >= 0) return path.slice(index)
    for (const blocker of active.find((tx) => tx.id === id)?.waiting ?? []) {
      const cycle = visit(blocker, [...path, id])
      if (cycle.length) return cycle
    }
    return []
  }
  for (const tx of active) {
    const cycle = visit(tx.id, [])
    if (cycle.length) return cycle
  }
  return []
}
export function transactionTransition(state: TransactionState, a: ExperimentAction): TransactionState {
  if (a.type === 'selected' && ['T1', 'T2'].includes(String(a.value)))
    return { ...state, selected: a.value as TransactionSlot, error: null }
  if (a.type === 'isolation' && Object.hasOwn(labels, String(a.value)))
    return { ...state, isolation: a.value as Isolation }
  if (a.type === 'row' || a.type === 'value') {
    const value = boundedInteger(a.value, a.type === 'row' ? 1 : -200, a.type === 'row' ? 2 : 200)
    return value === null ? state : { ...state, [a.type]: value, error: null }
  }
  if (a.type === 'compare')
    return {
      ...state,
      comparison: compareIsolation(),
      log: addLog(
        state.log,
        '相同交错下比较隔离级别',
        'T1 先读，T2 尝试写 20，T1 在提交前后再读。每组都使用独立初始数据库。',
      ),
    }
  if (
    ![
      'begin',
      'read',
      'read-for-update',
      'set',
      'increment',
      'commit',
      'rollback',
      'retry',
      'resolve-deadlock',
    ].includes(a.type)
  )
    return state
  const s: TransactionState = {
    ...state,
    versions: [...state.versions],
    transactions: state.transactions.map((tx) => ({
      ...tx,
      writes: tx.writes.map((write) => ({ ...write })),
      read: tx.read ? { ...tx.read } : null,
      waiting: [...tx.waiting],
      pending: tx.pending ? { ...tx.pending } : null,
    })),
    locks: state.locks.map((lock) => ({ ...lock, readers: [...lock.readers] })),
    error: null,
  }
  let tx = currentTransaction(s)
  const abort = (target: TeachingTransaction) => {
    target.status = 'aborted'
    target.writes = []
    target.pending = null
    target.waiting = []
    releaseLocks(s, target.id)
    s.rollbacks++
  }
  if (a.type === 'begin') {
    if (tx?.status === 'active') return state
    tx = {
      id: s.nextTx++,
      slot: s.selected,
      isolation: s.isolation,
      status: 'active',
      snapshot: null,
      writes: [],
      read: null,
      waiting: [],
      pending: null,
    }
    s.transactions = s.transactions.filter((old) => old.slot !== s.selected)
    s.transactions.push(tx)
    s.log = addLog(
      s.log,
      'BEGIN',
      `${s.selected} 开始事务 ${tx.id}，隔离级别 ${labels[tx.isolation]}；RR 快照在第一次普通一致性读时建立。`,
    )
  } else if (a.type === 'resolve-deadlock') {
    const cycle = transactionCycle(s)
    if (!cycle.length)
      return { ...s, log: addLog(s.log, '等待图检查', '当前没有等待环，普通锁等待不等于死锁。') }
    const victim = s.transactions.find((tx) => tx.id === Math.max(...cycle))!
    abort(victim)
    s.log = addLog(
      s.log,
      '选择死锁牺牲者',
      `等待环 ${cycle.join(' → ')} → ${cycle[0]}；回滚较新的事务 ${victim.id}，释放锁，其他待执行语句可重试。`,
      'warning',
    )
  } else {
    if (!tx || tx.status !== 'active') return { ...state, error: '先在当前会话 BEGIN 一个事务。' }
    if (a.type === 'rollback') {
      abort(tx)
      s.log = addLog(s.log, 'ROLLBACK', `事务 ${tx.id} 的私有写集全部丢弃，已提交版本不变，锁全部释放。`)
    } else if (a.type === 'commit') {
      if (tx.pending) return { ...state, error: '尚有未执行完的等待语句；先重试该语句或回滚。' }
      const count = tx.writes.length
      if (count) {
        s.clock++
        for (const write of tx.writes) s.versions.push({ ...write, tx: tx.id, commit: s.clock })
        s.writeCommits++
      }
      tx.status = 'committed'
      tx.writes = []
      releaseLocks(s, tx.id)
      s.log = addLog(
        s.log,
        'COMMIT',
        `事务 ${tx.id} 的 ${count} 个行修改作为提交 C${s.clock} 一起发布；其他事务是否看到它们仍取决于读规则。`,
        'success',
      )
    } else if (a.type === 'retry') {
      if (!tx.pending) return state
      executeStatement(s, tx, { ...tx.pending })
    } else {
      if (tx.pending) return { ...state, error: '当前会话有等待语句，使用“重试等待语句”或 ROLLBACK。' }
      executeStatement(s, tx, { type: a.type as Statement, row: s.row, value: s.value })
    }
  }
  return s
}
export function compareIsolation(): IsolationComparison[] {
  return (Object.keys(labels) as Isolation[]).map((isolation) => {
    let s = initialTransactions(isolation)
    const act = (type: string, value?: string | number) => {
      s = transactionTransition(s, { type, value })
    }
    act('begin')
    act('read')
    const before = currentTransaction(s)!.read!.value
    act('selected', 'T2')
    act('begin')
    act('set')
    act('selected', 'T1')
    act('read')
    const during = currentTransaction(s)!.read!.value
    act('selected', 'T2')
    act('commit')
    const writer = currentTransaction(s)!.status === 'committed' ? '已提交' : '等待 T1 释放 S 锁'
    act('selected', 'T1')
    act('read')
    const after = currentTransaction(s)!.read!.value
    return { isolation, before, during, after, writer }
  })
}
export function presentTransactions(s: TransactionState): ExperimentView {
  const tx = currentTransaction(s),
    active = tx?.status === 'active',
    pending = !!tx?.pending,
    cycle = transactionCycle(s)
  return {
    scene: {
      kind: 'data',
      title: '两个事务怎样选择版本与协调写入',
      tables: [
        {
          id: 'transaction-sessions',
          title: '会话、快照与未提交写集',
          columns: ['会话 / Tx', '状态', '隔离', '快照', '写集', '最近读取'],
          rows: s.transactions.map((tx) => ({
            id: String(tx.id),
            values: [
              `${tx.slot} / ${tx.id}`,
              tx.pending
                ? tx.waiting.length
                  ? `等待 ${tx.waiting.join(',')}`
                  : '锁已释放，可重试'
                : tx.status,
              shortLabels[tx.isolation],
              tx.snapshot === null
                ? tx.isolation === 'rr'
                  ? '尚未创建'
                  : '每次当前规则'
                : `C${tx.snapshot}`,
              tx.writes.map((write) => `${write.row}:${write.value}`).join(', ') || '无',
              tx.read ? `${tx.read.row}=${tx.read.value} / ${tx.read.source}` : '无',
            ],
          })),
        },
        {
          id: 'transaction-versions',
          title: '已提交的历史行版本',
          columns: ['行', '库存', '写入事务', '提交序号'],
          rows: s.versions.map((version, i) => ({
            id: String(i),
            values: [version.row, version.value, version.tx, version.commit],
          })),
        },
        {
          id: 'transaction-locks',
          title: '行锁与等待关系',
          columns: ['行', 'S 共享锁持有者', 'X 排他锁持有者'],
          rows: s.locks.map((lock) => ({
            id: String(lock.row),
            values: [lock.row, lock.readers.join(', ') || '无', lock.writer ?? '无'],
          })),
        },
        {
          id: 'isolation-comparison',
          title: '同一交错的独立隔离级别对照',
          columns: ['隔离级别', 'T1 初读', 'T2 未提交时 T1 读', 'T2 尝试提交后 T1 读', 'T2 状态'],
          rows: s.comparison.map((row) => ({
            id: row.isolation,
            values: [shortLabels[row.isolation], row.before, row.during, row.after, row.writer],
          })),
        },
      ],
      caption:
        '固定两行、两会话；RR 在首次普通读取快照，自己的写入可见，UPDATE / FOR UPDATE 按 InnoDB 风格取当前版本并加 X 锁。Serializable 使用点读取两阶段锁，没有范围 / 幻读模型；日志持久化另见 WAL，版本回收未模拟。',
    },
    metrics: [
      { label: '最新提交序号', value: s.clock },
      { label: '成功读取次数', value: s.reads },
      { label: '写事务提交次数', value: s.writeCommits },
      { label: '回滚次数', value: s.rollbacks },
      { label: '当前会话读取值', value: tx?.read?.value ?? '—' },
      { label: '等待环', value: cycle.length ? cycle.join(' → ') : '无' },
    ],
    controls: [
      {
        id: 'selected',
        kind: 'select',
        label: '当前数据库会话',
        value: s.selected,
        options: [
          { value: 'T1', label: 'T1' },
          { value: 'T2', label: 'T2' },
        ],
      },
      {
        id: 'isolation',
        kind: 'select',
        label: '新事务隔离级别',
        value: s.isolation,
        options: (Object.keys(labels) as Isolation[]).map((key) => ({ value: key, label: labels[key] })),
      },
      { id: 'row', kind: 'number', label: '目标库存行', value: s.row, min: 1, max: 2 },
      { id: 'value', kind: 'number', label: '设置值 / 原子增量', value: s.value, min: -200, max: 200 },
      { id: 'begin', kind: 'button', label: 'BEGIN 当前会话', primary: true, disabled: active },
      { id: 'read', kind: 'button', label: 'SELECT · 普通读取', disabled: !active || pending },
      {
        id: 'read-for-update',
        kind: 'button',
        label: 'SELECT FOR UPDATE · 当前读',
        disabled: !active || pending,
      },
      { id: 'set', kind: 'button', label: 'UPDATE · 设置库存值', disabled: !active || pending },
      { id: 'increment', kind: 'button', label: 'UPDATE · 库存加增量', disabled: !active || pending },
      { id: 'commit', kind: 'button', label: 'COMMIT 当前会话', disabled: !active || pending },
      { id: 'rollback', kind: 'button', label: 'ROLLBACK 当前会话', disabled: !active },
      { id: 'retry', kind: 'button', label: '重试等待语句', disabled: !active || !pending },
      { id: 'resolve-deadlock', kind: 'button', label: '检测等待环并回滚牺牲者' },
      { id: 'compare', kind: 'button', label: '对比四种事务隔离规则' },
    ],
    status: {
      title: s.error
        ? '检查事务操作'
        : pending
          ? '等待语句尚未产生结果'
          : '普通读取与更新可以采用不同版本规则',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        'T1 先 BEGIN 并读行 1；T2 BEGIN 写 20 并提交，再看 RR 中 T1 是否仍读到 10。',
      tone: s.error || pending ? 'warning' : 'neutral',
    },
    goal: {
      label: '在会话中实际读取并提交一次库存修改，再对比四种隔离级别在相同交错下的结果。',
      reached: s.reads > 0 && s.writeCommits > 0 && s.comparison.length === 4,
    },
    log: s.log,
  }
}
export const transactionsEngine: EngineFactory = (config) =>
  createSession(
    () => initialTransactions((config.isolation ?? 'rr') as Isolation),
    transactionTransition,
    presentTransactions,
  )
