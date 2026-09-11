import { describe, expect, it } from 'vitest'
import { allKeys } from '../../src/experiments/structures/bplus-tree'
import {
  initialInnoIndexes,
  innoIndexesTransition,
  presentInnoIndexes,
  runInnoIndex,
} from '../../src/experiments/models/innodb-indexes'
import {
  initialInnoCommit,
  innoCommitTransition,
  presentInnoCommit,
} from '../../src/experiments/models/innodb-commit'
import {
  initialReadView,
  presentReadView,
  readViewTransition,
  versionVisibility,
  type ReadView,
} from '../../src/experiments/models/innodb-read-view'
import {
  conflictsWithLock,
  initialInnoLocks,
  innoLocksTransition,
  lockFootprint,
  presentInnoLocks,
} from '../../src/experiments/models/innodb-locks'
import {
  chosenJoin,
  executeQuery,
  executionTransition,
  initialExecution,
  presentExecution,
} from '../../src/experiments/models/mysql-execution'

describe('InnoDB index lock intervals', () => {
  it('distinguishes open gaps, right-hand records, missing equality and supremum', () => {
    const locks = lockFootprint([30, 10, 20], 'rr', 'range', 15)
    expect(locks).toEqual([
      { kind: 'next-key', left: 10, right: 20 },
      { kind: 'next-key', left: 20, right: 30 },
      { kind: 'gap', left: 30, right: null },
    ])
    for (const key of [11, 15, 19, 21, 29, 31, 99])
      expect(locks.some((lock) => conflictsWithLock(lock, { operation: 'insert', key }))).toBe(true)
    expect(locks.some((lock) => conflictsWithLock(lock, { operation: 'update', key: 10 }))).toBe(false)
    for (const key of [20, 30])
      expect(locks.some((lock) => conflictsWithLock(lock, { operation: 'update', key }))).toBe(true)
    const record = lockFootprint([10, 20, 30], 'rr', 'unique', 20)
    expect(record).toEqual([{ kind: 'record', left: 20, right: 20 }])
    expect(record.some((lock) => conflictsWithLock(lock, { operation: 'insert', key: 15 }))).toBe(false)
    const gap = lockFootprint([10, 20, 30], 'rr', 'unique', 15)
    expect(gap).toEqual([{ kind: 'gap', left: 10, right: 20 }])
    expect(gap.some((lock) => conflictsWithLock(lock, { operation: 'update', key: 20 }))).toBe(false)
    expect(lockFootprint([10, 20, 30], 'rc', 'range', 15).every((lock) => lock.kind === 'record')).toBe(true)
    expect(lockFootprint([], 'rr', 'range', 15)).toEqual([{ kind: 'gap', left: null, right: null }])
    expect(lockFootprint([10, 20, 30], 'rc', 'unique', 15)).toEqual([])
  })
  it('preserves a blocked statement until explicit retry and compares independent inputs', () => {
    let s = initialInnoLocks()
    const act = (type: string, value?: string | number) => {
      s = innoLocksTransition(s, { type, value })
    }
    act('lock')
    act('attempt')
    expect(s.pending).toEqual({ operation: 'insert', key: 15 })
    expect(s.rows).toHaveLength(3)
    act('retry')
    expect(s.rows).toHaveLength(3)
    act('key', 99)
    act('operation', 'update')
    act('commit')
    expect(s.pending!.key).toBe(15)
    act('retry')
    expect(s.rows.map((row) => row.key)).toEqual([10, 15, 20, 30])
    expect(s.pending).toBeNull()
    act('compare')
    expect(s.comparison.map((entry) => entry.blocked)).toEqual([true, false, false, true])
    expect(presentInnoLocks(s).goal.reached).toBe(true)
    act('key', 15)
    act('operation', 'insert')
    act('attempt')
    expect(s.error).toContain('唯一键')
    expect(s.rows).toHaveLength(4)
  })
})

describe('real join, aggregation and bounded sort pipeline', () => {
  it('agrees with an independent relational result across selectivity, memory and limit', () => {
    const base = initialExecution()
    for (const threshold of [0, 50, 75, 100, 150])
      for (const memory of [1, 2, 6])
        for (const limit of [1, 3]) {
          const s = { ...base, threshold, memory, limit }
          const expected = base.customers.reduce<
            Record<string, { city: string; total: number; count: number }>
          >((groups, customer) => {
            for (const order of base.orders.filter(
              (row) => row.customer === customer.id && row.amount >= threshold,
            )) {
              groups[customer.city] ??= { city: customer.city, total: 0, count: 0 }
              groups[customer.city]!.total += order.amount
              groups[customer.city]!.count++
            }
            return groups
          }, {})
          const sorted = Object.values(expected).sort(
            (a, b) => b.total - a.total || (a.city < b.city ? -1 : a.city > b.city ? 1 : 0),
          )
          for (const method of ['nested', 'index', 'hash'] as const) {
            const run = executeQuery(s, method)
            expect(run.result, `${threshold}/${memory}/${method}`).toEqual(sorted.slice(0, limit))
            expect(run.sorted).toEqual(sorted)
            expect(run.runs.length).toBe(Math.ceil(sorted.length / memory))
            expect(run.spilled).toBe(sorted.length > memory)
            expect(run.joined.length).toBe(base.orders.filter((row) => row.amount >= threshold).length)
            expect(run.groups.reduce((sum, group) => sum + group.count, 0)).toBe(run.joined.length)
            expect(run.comparisons).toBe(
              method === 'nested' ? run.filtered.length * base.customers.length : 0,
            )
          }
        }
  })
  it('updates estimated choice without altering records and does not confuse EXPLAIN with execution', () => {
    let s = initialExecution()
    expect(chosenJoin(s)).toBe('index')
    s = executionTransition(s, { type: 'explain' })
    expect(s.run).toBeNull()
    expect(s.cursor).toBe(0)
    s = executionTransition(s, { type: 'run' })
    expect(s.run!.result).toEqual([
      { city: '杭州', total: 200, count: 3 },
      { city: '上海', total: 190, count: 2 },
      { city: '深圳', total: 190, count: 3 },
    ])
    expect(s.run!.cost).toBe(36)
    s = executionTransition(s, { type: 'analyze' })
    expect(chosenJoin(s)).toBe('hash')
    s = executionTransition(s, { type: 'run' })
    s = executionTransition(s, { type: 'compare' })
    expect(s.comparison.map((run) => run.cost)).toEqual([60, 36, 26])
    expect(presentExecution(s).goal.reached).toBe(true)
    expect(executeQuery({ ...s, memory: 6 }, 'hash').spilled).toBe(false)
    const withOrphan = { ...s, orders: [...s.orders, { id: 20, customer: 99, amount: 100 }] }
    for (const method of ['nested', 'index', 'hash'] as const)
      expect(executeQuery(withOrphan, method).result).toEqual(s.run!.result)
  })
})

describe('InnoDB clustered and secondary record layouts', () => {
  it('follows primary keys from secondary leaves while covering reads stay in the secondary tree', () => {
    const s = initialInnoIndexes()
    expect(runInnoIndex(s).rows).toEqual([{ id: 30, region: 1, amount: 300 }])
    for (const region of [1, 2, 3]) {
      const input = { ...s, region },
        full = runInnoIndex(input, 'secondary', 'full'),
        covered = runInnoIndex(input, 'secondary', 'covered')
      const expected = s.rows
        .filter((row) => row.region === region)
        .map((row) => row.id)
        .sort((a, b) => a - b)
      expect(full.rows.map((row) => row.id)).toEqual(expected)
      expect(covered.rows.map((row) => row.id)).toEqual(expected)
      expect(full.lookups).toBe(expected.length)
      expect(covered.lookups).toBe(0)
      expect(covered.trace.every((entry) => entry.tree === 'secondary')).toBe(true)
      expect(covered.rows.every((row) => row.amount === undefined)).toBe(true)
    }
    let completed = innoIndexesTransition(s, { type: 'run' })
    for (const action of [{ type: 'mode', value: 'secondary' }, { type: 'run' }, { type: 'compare' }])
      completed = innoIndexesTransition(completed, action)
    expect(presentInnoIndexes(completed).goal.reached).toBe(true)
  })
  it('maintains both trees on insert and delete, including deletes using a different query region', () => {
    let s = initialInnoIndexes()
    const act = (type: string, value?: number) => {
      s = innoIndexesTransition(s, { type, value })
      expect(allKeys(s.clustered).sort((a, b) => a - b)).toEqual(
        s.rows.map((row) => row.id).sort((a, b) => a - b),
      )
      expect(allKeys(s.secondary).sort((a, b) => a - b)).toEqual(
        s.rows.map((row) => row.region * 100 + row.id).sort((a, b) => a - b),
      )
    }
    act('id', 25)
    act('region', 3)
    act('insert')
    expect(s.rows.find((row) => row.id === 25)?.region).toBe(3)
    const duplicate = innoIndexesTransition(s, { type: 'insert' })
    expect(duplicate.error).toContain('重复主键')
    expect(duplicate.rows).toEqual(s.rows)
    act('region', 1)
    act('delete')
    expect(allKeys(s.secondary)).not.toContain(325)
    for (const id of s.rows.map((row) => row.id)) {
      act('id', id)
      act('delete')
    }
    expect(runInnoIndex(s, 'secondary').rows).toEqual([])
    expect(s.clustered.root.leaf).toBe(true)
    expect(s.secondary.root.leaf).toBe(true)
  })
})

describe('internal prepare/binlog commit coordination', () => {
  it('resolves every crash stage from durable evidence and keeps replicas consistent', () => {
    const stages = ['update', 'prepare', 'append-binlog', 'sync-binlog', 'commit']
    for (let cut = 0; cut <= stages.length; cut++)
      for (const flushPage of [false, true]) {
        let s = initialInnoCommit(90)
        for (const type of stages.slice(0, cut)) {
          s = innoCommitTransition(s, { type })
          if (flushPage) s = innoCommitTransition(s, { type: 'flush-page' })
        }
        s = innoCommitTransition(s, { type: 'replicate' })
        s = innoCommitTransition(s, { type: 'crash' })
        s = innoCommitTransition(s, { type: 'recover' })
        s = innoCommitTransition(s, { type: 'replicate' })
        const expected = cut >= 4 ? 90 : 100
        expect(s.disk.value, `cut=${cut}, page=${flushPage}`).toBe(expected)
        expect(s.replica.value).toBe(expected)
        expect(s.confirmed).toBe(cut === 5 ? 1 : 0)
        expect(s.recoveredPrepared).toBe(cut === 4)
        expect(s.binlog.every((event) => event.durable)).toBe(true)
      }
  })
  it('rolls back a flushed prepared row, then commits a prepared row whose binlog is durable without client success', () => {
    let s = initialInnoCommit()
    const act = (type: string, value?: number) => {
      s = innoCommitTransition(s, { type, value })
    }
    act('update')
    act('flush-page')
    expect(s.error).toContain('WAL 禁止')
    act('prepare')
    act('flush-page')
    expect(s.disk.value).toBe(90)
    act('crash')
    act('recover')
    expect(s.disk.value).toBe(100)
    act('update')
    act('prepare')
    act('append-binlog')
    act('sync-binlog')
    act('crash')
    act('recover')
    act('replicate')
    expect(s.disk.value).toBe(90)
    expect(s.confirmed).toBe(0)
    expect(s.replica.xid).toBe(2)
    expect(presentInnoCommit(s).goal.reached).toBe(true)
    act('target', 75)
    act('update')
    act('prepare')
    act('append-binlog')
    act('sync-binlog')
    act('commit')
    act('crash')
    act('recover')
    act('replicate')
    expect(s.disk.value).toBe(75)
    expect(s.replica.value).toBe(75)
    const before = s.replica
    act('replicate')
    expect(s.replica).toEqual(before)
  })
})

describe('InnoDB-style Read View bounds and Undo retention', () => {
  it('checks creator, both boundaries and the frozen active-transaction set', () => {
    const view: ReadView = { creator: 5, activeIds: [3, 5, 7], upLimit: 3, lowLimit: 9 }
    expect(versionVisibility(2, view)).toEqual({ visible: true, reason: 'before-upper' })
    expect(versionVisibility(3, view)).toEqual({ visible: false, reason: 'active-at-snapshot' })
    expect(versionVisibility(4, view)).toEqual({ visible: true, reason: 'committed-before-snapshot' })
    expect(versionVisibility(5, view)).toEqual({ visible: true, reason: 'own' })
    expect(versionVisibility(9, view)).toEqual({ visible: false, reason: 'after-lower' })
  })
  it('keeps an active writer invisible after commit and excludes a newly assigned writer, then purges after view release', () => {
    let s = initialReadView()
    const act = (type: string, value?: string | number) => {
      s = readViewTransition(s, { type, value })
      expect(s.versions.map((version) => version.undo)).toEqual(
        s.versions.map((_, i) => s.versions[i + 1]?.id ?? null),
      )
    }
    act('selected', 'T2')
    act('begin')
    act('write')
    act('selected', 'T1')
    act('begin')
    act('read')
    expect(s.lastRead).toBe(10)
    expect(s.lastView!.activeIds).toEqual([1, 2])
    expect(s.lastView!.lowLimit).toBe(3)
    act('selected', 'T2')
    act('commit')
    act('selected', 'T3')
    act('begin')
    act('value', 30)
    act('write')
    act('commit')
    act('selected', 'T1')
    act('read')
    expect(s.lastRead).toBe(10)
    expect(s.trace.map((entry) => entry.reason)).toEqual([
      'after-lower',
      'active-at-snapshot',
      'before-upper',
    ])
    act('purge')
    expect(s.versions).toHaveLength(3)
    expect(s.purgeGuarded).toBe(true)
    act('commit')
    act('purge')
    expect(s.versions.map((version) => version.value)).toEqual([30])
    expect(s.purged).toBe(2)
    expect(presentReadView(s).goal.reached).toBe(true)
  })
  it('RC refreshes the view per read and does not pin old versions after the statement', () => {
    let s = initialReadView('rc')
    const act = (type: string, value?: string | number) => {
      s = readViewTransition(s, { type, value })
    }
    act('begin')
    act('read')
    expect(s.lastRead).toBe(10)
    act('selected', 'T2')
    act('begin')
    act('write')
    act('commit')
    act('selected', 'T1')
    act('read')
    expect(s.lastRead).toBe(20)
    act('purge')
    expect(s.versions).toHaveLength(1)
    act('read')
    expect(s.lastRead).toBe(20)
  })
  it('retains an active writer rollback baseline and rejects concurrent writes without corrupting the chain', () => {
    let s = initialReadView()
    const act = (type: string, value?: string | number) => {
      s = readViewTransition(s, { type, value })
    }
    act('begin')
    act('write')
    act('purge')
    expect(s.versions.map((version) => version.value)).toEqual([20, 10])
    act('read')
    expect(s.lastRead).toBe(20)
    act('selected', 'T2')
    act('begin')
    act('value', 30)
    act('write')
    expect(s.error).toContain('仍持有本行写锁')
    act('selected', 'T1')
    act('rollback')
    expect(s.versions.map((version) => version.value)).toEqual([10])
    act('selected', 'T2')
    act('write')
    act('commit')
    expect(s.versions[0]!.value).toBe(30)
  })
})
