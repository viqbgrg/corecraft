import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export interface IndexLock {
  kind: 'record' | 'gap' | 'next-key'
  left: number | null
  right: number | null
}
export type LockQuery = 'unique' | 'range'
export type LockIsolation = 'rr' | 'rc'
export interface LockAttempt {
  operation: 'insert' | 'update'
  key: number
}
export interface InnoLocksState {
  rows: { key: number; value: number }[]
  isolation: LockIsolation
  query: LockQuery
  start: number
  operation: LockAttempt['operation']
  key: number
  active: boolean
  locks: IndexLock[]
  pending: LockAttempt | null
  blocked: boolean
  retried: boolean
  comparison: { label: string; locks: IndexLock[]; blocked: boolean }[]
  error: string | null
  log: Observation[]
}
export function lockFootprint(
  keys: number[],
  isolation: LockIsolation,
  query: LockQuery,
  start: number,
): IndexLock[] {
  const ordered = [...keys].sort((a, b) => a - b)
  if (query === 'unique') {
    if (ordered.includes(start)) return [{ kind: 'record', left: start, right: start }]
    if (isolation === 'rc') return []
    return [
      {
        kind: 'gap',
        left: ordered.filter((key) => key < start).at(-1) ?? null,
        right: ordered.find((key) => key > start) ?? null,
      },
    ]
  }
  const records = ordered.flatMap((key, i): IndexLock[] =>
    key < start
      ? []
      : [
          {
            kind: isolation === 'rr' ? 'next-key' : 'record',
            left: isolation === 'rr' ? (ordered[i - 1] ?? null) : key,
            right: key,
          },
        ],
  )
  return isolation === 'rr'
    ? [...records, { kind: 'gap', left: ordered.at(-1) ?? null, right: null }]
    : records
}
export function conflictsWithLock(lock: IndexLock, attempt: LockAttempt): boolean {
  if (attempt.operation === 'update') return lock.kind !== 'gap' && attempt.key === lock.right
  return (
    lock.kind !== 'record' &&
    (lock.left === null || attempt.key > lock.left) &&
    (lock.right === null || attempt.key < lock.right)
  )
}
const describe = (lock: IndexLock) =>
  lock.kind === 'record'
    ? `{${lock.right}}`
    : `(${lock.left ?? '−∞'}, ${lock.right ?? '+∞'}${lock.kind === 'next-key' ? ']' : ')'}`
export function initialInnoLocks(): InnoLocksState {
  return {
    rows: [10, 20, 30].map((key) => ({ key, value: key })),
    isolation: 'rr',
    query: 'range',
    start: 15,
    operation: 'insert',
    key: 15,
    active: false,
    locks: [],
    pending: null,
    blocked: false,
    retried: false,
    comparison: [],
    error: null,
    log: [],
  }
}
function attemptOperation(s: InnoLocksState, attempt: LockAttempt, retry: boolean): InnoLocksState {
  const existing = s.rows.find((row) => row.key === attempt.key)
  if (attempt.operation === 'insert' && existing)
    return { ...s, pending: null, error: `唯一键 ${attempt.key} 已存在，插入失败。` }
  if (attempt.operation === 'update' && !existing)
    return { ...s, pending: null, error: `没有记录 ${attempt.key}，本次 UPDATE 匹配 0 行。` }
  if (attempt.operation === 'insert' && s.rows.length >= 12)
    return { ...s, pending: null, error: '教学索引最多 12 条记录。' }
  const conflict = s.locks.find((lock) => conflictsWithLock(lock, attempt))
  if (conflict)
    return {
      ...s,
      pending: { ...attempt },
      blocked: true,
      error: null,
      log: addLog(
        s.log,
        'T2 等待',
        `${attempt.operation} key=${attempt.key} 与 T1 的 ${conflict.kind} ${describe(conflict)} 冲突；语句未执行，参数已保存。`,
        'warning',
      ),
    }
  const rows =
    attempt.operation === 'insert'
      ? [...s.rows, { key: attempt.key, value: attempt.key }].sort((a, b) => a.key - b.key)
      : s.rows.map((row) => (row.key === attempt.key ? { ...row, value: row.value + 1 } : row))
  return {
    ...s,
    rows,
    pending: null,
    retried: s.retried || retry,
    error: null,
    log: addLog(
      s.log,
      retry ? '原语句重试成功' : 'T2 自动提交成功',
      `${attempt.operation} key=${attempt.key} 已执行；T2 的语句事务随即结束。`,
      'success',
    ),
  }
}
export function innoLocksTransition(s: InnoLocksState, a: ExperimentAction): InnoLocksState {
  if (a.type === 'start' || a.type === 'key') {
    const value = boundedInteger(a.value, 0, 99)
    return value === null || (a.type === 'start' && s.active) ? s : { ...s, [a.type]: value, error: null }
  }
  if (a.type === 'isolation' && !s.active && ['rr', 'rc'].includes(String(a.value)))
    return { ...s, isolation: a.value as LockIsolation, error: null }
  if (a.type === 'query' && !s.active && ['unique', 'range'].includes(String(a.value)))
    return { ...s, query: a.value as LockQuery, error: null }
  if (a.type === 'operation' && ['insert', 'update'].includes(String(a.value)))
    return { ...s, operation: a.value as LockAttempt['operation'], error: null }
  if (a.type === 'lock' && !s.active) {
    const locks = lockFootprint(
      s.rows.map((row) => row.key),
      s.isolation,
      s.query,
      s.start,
    )
    return {
      ...s,
      active: true,
      locks,
      error: null,
      log: addLog(
        s.log,
        'T1 锁定读',
        `${s.isolation.toUpperCase()}：WHERE key ${s.query === 'unique' ? '=' : '>='} ${s.start} FOR UPDATE；持有 ${locks.map(describe).join('、') || '空锁集合'}，直到事务结束。`,
      ),
    }
  }
  if (a.type === 'attempt')
    return s.pending
      ? { ...s, error: 'T2 正在等待上一条语句；先结束 T1，再重试已保存的语句。' }
      : attemptOperation(s, { operation: s.operation, key: s.key }, false)
  if (a.type === 'commit' && s.active)
    return {
      ...s,
      active: false,
      locks: [],
      error: null,
      log: addLog(s.log, 'T1 COMMIT', '事务释放全部记录与间隙锁；等待语句尚未执行，点击重试继续。'),
    }
  if (a.type === 'retry' && s.pending) return attemptOperation(s, s.pending, true)
  if (a.type === 'compare') {
    const cases: { label: string; isolation: LockIsolation; query: LockQuery; start: number }[] = [
      { label: 'RR 范围 ≥15', isolation: 'rr', query: 'range', start: 15 },
      { label: 'RC 范围 ≥15', isolation: 'rc', query: 'range', start: 15 },
      { label: 'RR 唯一等值 =20（存在）', isolation: 'rr', query: 'unique', start: 20 },
      { label: 'RR 唯一等值 =15（缺失）', isolation: 'rr', query: 'unique', start: 15 },
    ]
    const comparison = cases.map((entry) => {
      const locks = lockFootprint([10, 20, 30], entry.isolation, entry.query, entry.start)
      return {
        label: entry.label,
        locks,
        blocked: locks.some((lock) => conflictsWithLock(lock, { operation: 'insert', key: 15 })),
      }
    })
    return {
      ...s,
      comparison,
      error: null,
      log: addLog(
        s.log,
        '固定输入比较锁范围',
        '四组独立索引均从 [10,20,30] 开始，T2 都尝试 INSERT key=15；排除数据变化对结果的影响。',
      ),
    }
  }
  return s
}
export function presentInnoLocks(s: InnoLocksState): ExperimentView {
  const reached = s.blocked && s.retried && s.comparison.length === 4
  return {
    scene: {
      kind: 'data',
      title: '记录部分保护已有行，间隙部分阻止插入',
      sequence: s.rows.map((row) => ({
        label: '唯一索引 key',
        value: row.key,
        tone: s.locks.some((lock) => conflictsWithLock(lock, { operation: 'update', key: row.key }))
          ? 'warning'
          : 'neutral',
      })),
      tables: [
        {
          id: 'innodb-locks',
          title: 'T1 持有的索引锁',
          columns: ['类型', '区间', '阻挡的操作'],
          rows: s.locks.map((lock, i) => ({
            id: String(i),
            values: [
              lock.kind,
              describe(lock),
              lock.kind === 'record'
                ? '该记录 UPDATE'
                : lock.kind === 'gap'
                  ? '开区间内 INSERT'
                  : '开区间 INSERT 与右端记录 UPDATE',
            ],
          })),
        },
        {
          id: 'lock-records',
          title: '实际数据 / 等待中的语句不改变它',
          columns: ['key', 'value'],
          rows: s.rows.map((row) => ({ id: String(row.key), values: [row.key, row.value] })),
        },
        {
          id: 'lock-comparison',
          title: '同一初始索引 [10,20,30]，同一 INSERT 15',
          columns: ['T1 读取', '锁范围', 'T2 结果'],
          rows: s.comparison.map((entry, i) => ({
            id: String(i),
            values: [
              entry.label,
              entry.locks.map(describe).join('、') || '无',
              entry.blocked ? '等待' : '可插入',
            ],
            tone: entry.blocked ? 'warning' : 'success',
          })),
        },
      ],
      caption:
        '唯一升序索引、两会话、显式 T1 与自动提交 T2。RR 范围按扫描区间保守地持有 Next-Key 与 supremum 间隙；实际 MySQL 锁足迹取决于版本、索引和计划。RC 省略普通间隙锁，未模拟外键 / 重复键检查例外、共享锁或 Insert Intention；间隙锁彼此并非一定冲突。',
    },
    metrics: [
      { label: 'T1 状态', value: s.active ? '事务中' : '未持锁' },
      { label: '持有锁区间', value: s.locks.length },
      { label: 'T2 等待语句', value: s.pending ? `${s.pending.operation} ${s.pending.key}` : '无' },
      { label: '记录数量', value: s.rows.length },
    ],
    controls: [
      {
        id: 'isolation',
        kind: 'select',
        label: 'T1 隔离级别',
        value: s.isolation,
        disabled: s.active,
        options: [
          { value: 'rr', label: 'RR / 记录与间隙' },
          { value: 'rc', label: 'RC / 普通范围只锁记录' },
        ],
      },
      {
        id: 'query',
        kind: 'select',
        label: 'T1 锁定查询',
        value: s.query,
        disabled: s.active,
        options: [
          { value: 'range', label: '下界范围 key >= 起点' },
          { value: 'unique', label: '唯一等值 key = 起点' },
        ],
      },
      {
        id: 'start',
        kind: 'number',
        label: 'T1 查询起点',
        value: s.start,
        min: 0,
        max: 99,
        disabled: s.active,
      },
      {
        id: 'operation',
        kind: 'select',
        label: 'T2 操作',
        value: s.operation,
        disabled: !!s.pending,
        options: [
          { value: 'insert', label: 'INSERT / 插入新键' },
          { value: 'update', label: 'UPDATE / 现有值加一' },
        ],
      },
      { id: 'key', kind: 'number', label: 'T2 目标键', value: s.key, min: 0, max: 99, disabled: !!s.pending },
      {
        id: 'lock',
        kind: 'button',
        label: 'T1 BEGIN + SELECT FOR UPDATE',
        primary: true,
        disabled: s.active,
      },
      { id: 'attempt', kind: 'button', label: 'T2 执行当前语句', disabled: !!s.pending },
      { id: 'commit', kind: 'button', label: 'T1 COMMIT · 释放锁', disabled: !s.active },
      { id: 'retry', kind: 'button', label: 'T2 重试原等待语句', disabled: !s.pending },
      { id: 'compare', kind: 'button', label: '对比四种索引锁范围' },
    ],
    status: {
      title: s.error
        ? '检查事务操作'
        : reached
          ? '锁区间解释了等待与放行'
          : s.pending
            ? 'T2 等待 T1 释放冲突区间'
            : '先定位扫描的索引区间',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '默认 RR 锁定 key >= 15，随后尝试插入 15，结束 T1 并重试，再比较四种查询。',
      tone: s.error || s.pending ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '让插入因间隙锁等待，释放锁后重试成功，并比较 RR / RC 与唯一等值查询。', reached },
    log: s.log,
  }
}
export const innoLocksEngine: EngineFactory = () =>
  createSession(initialInnoLocks, innoLocksTransition, presentInnoLocks)
