import { describe, expect, it } from 'vitest'
import {
  databasePagesTransition,
  initialDatabasePages,
  logicalPage,
  presentDatabasePages,
} from '../../src/experiments/models/database-pages'
import { initialWal, presentWal, walTransition } from '../../src/experiments/models/wal'
import {
  estimatePlans,
  executeQueryPlan,
  initialOptimizer,
  optimizerTransition,
  presentOptimizer,
  queryDataset,
  type HeapLayout,
} from '../../src/experiments/models/query-optimizer'
import {
  compareIsolation,
  currentTransaction,
  initialTransactions,
  transactionCycle,
  transactionTransition,
} from '../../src/experiments/models/transactions'

describe('database records, pages and Buffer Pool lifecycle', () => {
  it('loads whole pages, protects pinned frames, and writes a changed page before eviction', () => {
    const initial = initialDatabasePages()
    let s = initial
    const act = (type: string, value?: number) => {
      s = databasePagesTransition(s, { type, value })
    }
    act('pin')
    act('pin')
    expect(s.frames[0]!.pins).toBe(2)
    expect(s.reads).toBe(1)
    expect(s.hits).toBe(1)
    act('unpin')
    act('evict')
    expect(s.pinBlocked).toBe(true)
    expect(s.frames[0]!.pins).toBe(1)
    act('unpin')
    act('id', 1)
    act('score', 88)
    act('update')
    expect(logicalPage(s, 0)[0]!.score).toBe(88)
    expect(s.disk[0]![0]!.score).toBe(55)
    act('page', 1)
    act('read')
    act('page', 2)
    act('read')
    expect(s.disk[0]![0]!.score).toBe(88)
    expect(s.writes).toBe(1)
    expect(s.frames.map((frame) => frame.page)).toEqual([1, 2])
    expect(presentDatabasePages(s).goal.reached).toBe(true)
    expect(initial.frames).toEqual([])
    expect(initial.disk[0]![0]!.score).toBe(55)
  })
  it('rejects admission when all frames are pinned and resumes after a matching unpin', () => {
    let s = initialDatabasePages(1)
    for (const action of [{ type: 'pin' }, { type: 'page', value: 1 }, { type: 'read' }])
      s = databasePagesTransition(s, action)
    expect(s.error).toContain('所有缓冲帧')
    expect(s.reads).toBe(1)
    s = databasePagesTransition(s, { type: 'page', value: 0 })
    s = databasePagesTransition(s, { type: 'unpin' })
    s = databasePagesTransition(s, { type: 'page', value: 1 })
    s = databasePagesTransition(s, { type: 'read' })
    expect(s.error).toBeNull()
    expect(s.reads).toBe(2)
  })
  it('enforces primary-key uniqueness and fixed page capacity without losing dirty inserts', () => {
    let s = initialDatabasePages()
    for (let id = 10; id <= 18; id++) {
      s = databasePagesTransition(s, { type: 'id', value: id })
      s = databasePagesTransition(s, { type: 'insert' })
    }
    const rows = s.disk.flatMap((_, page) => logicalPage(s, page))
    expect(rows.map((row) => row.id).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    )
    expect(s.disk.every((_, page) => logicalPage(s, page).length === 3)).toBe(true)
    expect(databasePagesTransition(s, { type: 'insert' }).error).toContain('主键已存在')
    s = databasePagesTransition(s, { type: 'id', value: 19 })
    const refused = databasePagesTransition(s, { type: 'insert' })
    expect(refused.error).toContain('都已满')
    expect(refused.frames).toEqual(s.frames)
    expect(refused.disk).toEqual(s.disk)
  })
})

describe('write-ahead logging and bounded physical undo/redo recovery', () => {
  it('enforces WAL then preserves committed work and undoes a flushed loser', () => {
    let s = initialWal()
    const act = (type: string, value?: number) => {
      s = walTransition(s, { type, value })
    }
    act('begin')
    act('debit')
    act('flush-page')
    expect(s.error).toContain('WAL 阻止写页')
    expect(s.disk[0]!.value).toBe(100)
    act('credit')
    act('commit')
    expect(s.confirmations).toBe(1)
    expect(s.disk.map((p) => p.value)).toEqual([100, 100])
    act('crash')
    act('recover')
    expect(s.disk.map((p) => p.value)).toEqual([90, 110])
    expect(s.redo).toBe(2)
    act('begin')
    act('debit')
    act('flush-log')
    act('flush-page')
    expect(s.disk.map((p) => p.value)).toEqual([80, 110])
    act('crash')
    act('recover')
    expect(s.disk.map((p) => p.value)).toEqual([90, 110])
    expect(s.undo).toBe(1)
    expect(presentWal(s).goal.reached).toBe(true)
    act('begin')
    act('debit')
    act('credit')
    act('commit')
    act('crash')
    act('recover')
    expect(s.disk.map((p) => p.value)).toEqual([80, 120])
    act('crash')
    act('recover')
    expect(s.redo).toBe(0)
    expect(s.undo).toBe(0)
    expect(s.disk.map((p) => p.value)).toEqual([80, 120])
  })
  it('recovers the committed balance under every tested crash prefix and flush combination', () => {
    for (let cut = 0; cut <= 3; cut++)
      for (let mask = 0; mask < 8; mask++) {
        let s = walTransition(initialWal(7), { type: 'begin' })
        for (const action of ['debit', 'credit', 'commit'].slice(0, cut)) {
          s = walTransition(s, { type: action })
          if (mask & 1) s = walTransition(s, { type: 'flush-log' })
          for (let page = 0; page < 2; page++)
            if (mask & (2 << page)) {
              s = walTransition(s, { type: 'page', value: page })
              s = walTransition(s, { type: 'flush-page' })
            }
        }
        s = walTransition(s, { type: 'crash' })
        expect(s.records.every((record) => record.lsn <= s.durableLsn)).toBe(true)
        s = walTransition(s, { type: 'recover' })
        expect(
          s.disk.map((page) => page.value),
          `cut=${cut}, mask=${mask}`,
        ).toEqual(cut === 3 ? [93, 107] : [100, 100])
        expect(s.disk.reduce((sum, page) => sum + page.value, 0)).toBe(200)
      }
  })
  it('does not equate a flushed UPDATE with COMMIT or allow confirmation of a partial transfer', () => {
    let s = initialWal()
    for (const type of ['begin', 'debit', 'commit', 'flush-log']) s = walTransition(s, { type })
    expect(s.confirmations).toBe(0)
    expect(s.records.some((record) => record.kind === 'commit')).toBe(false)
    for (const type of ['crash', 'recover']) s = walTransition(s, { type })
    expect(s.disk.map((page) => page.value)).toEqual([100, 100])
  })
})

describe('cost estimates and real B+Tree access paths', () => {
  it('returns the same record set through both paths for layouts, selectivities and IO weights', () => {
    for (const layout of ['ordered', 'scattered'] as HeapLayout[])
      for (const category of [1, 2, 3])
        for (const randomCost of [1, 2, 8]) {
          const rows = queryDataset(layout),
            expected = rows
              .filter((row) => row.category === category)
              .map((row) => row.id)
              .sort((a, b) => a - b)
          for (const plan of ['scan', 'index'] as const) {
            const run = executeQueryPlan(rows, category, plan, randomCost)
            expect(run.results.map((row) => row.id).sort((a, b) => a - b)).toEqual(expected)
            expect(run.dataPages).toBe(plan === 'scan' ? 8 : new Set(run.results.map((row) => row.page)).size)
            expect(run.cost).toBeCloseTo(run.events.reduce((sum, event) => sum + event.cost, 0))
          }
        }
  })
  it('keeps the index shape fixed when comparing only the heap placement', () => {
    const ordered = executeQueryPlan(queryDataset('ordered'), 2, 'index', 2),
      scattered = executeQueryPlan(queryDataset('scattered'), 2, 'index', 2)
    expect(ordered.indexLeaves).toBe(scattered.indexLeaves)
    expect(ordered.dataPages).toBeLessThan(scattered.dataPages)
  })
  it('shows a wrong stale choice, then re-estimates after ANALYZE without pretending EXPLAIN ran data access', () => {
    let s = initialOptimizer()
    expect(estimatePlans(s).chosen).toBe('index')
    s = optimizerTransition(s, { type: 'explain' })
    expect(s.run).toBeNull()
    expect(s.cursor).toBe(0)
    s = optimizerTransition(s, { type: 'run' })
    s = optimizerTransition(s, { type: 'compare' })
    expect(s.run!.results).toHaveLength(18)
    expect(s.comparison[1]!.cost).toBeGreaterThan(s.comparison[0]!.cost)
    expect(s.staleObserved).toBe(true)
    s = optimizerTransition(s, { type: 'analyze' })
    expect(s.run).toBeNull()
    expect(estimatePlans(s).chosen).toBe('scan')
    s = optimizerTransition(s, { type: 'run' })
    s = optimizerTransition(s, { type: 'compare' })
    expect(presentOptimizer(s).goal.reached).toBe(true)
    s = optimizerTransition(s, { type: 'category', value: 3 })
    expect(estimatePlans(s).chosen).toBe('index')
  })
})

describe('transactions, versions and row locks', () => {
  it('distinguishes dirty reads, statement snapshots, transaction snapshots and locking reads', () => {
    const comparison = compareIsolation()
    expect(comparison.map((row) => [row.before, row.during, row.after])).toEqual([
      [10, 20, 20],
      [10, 10, 20],
      [10, 10, 10],
      [10, 10, 10],
    ])
    expect(comparison[3]!.writer).toContain('等待')
  })
  it('creates RR snapshot at first consistent read and exposes own writes from a current UPDATE', () => {
    let s = initialTransactions()
    const act = (type: string, value?: string | number) => {
      s = transactionTransition(s, { type, value })
    }
    act('begin')
    act('selected', 'T2')
    act('begin')
    act('set')
    act('commit')
    act('selected', 'T1')
    act('read')
    expect(currentTransaction(s)!.read!.value).toBe(20)
    expect(currentTransaction(s)!.snapshot).toBe(1)
    act('selected', 'T2')
    act('begin')
    act('value', 30)
    act('set')
    act('commit')
    act('selected', 'T1')
    act('read')
    expect(currentTransaction(s)!.read!.value).toBe(20)
    act('value', 1)
    act('increment')
    act('read')
    expect(currentTransaction(s)!.read!.value).toBe(31)
    act('commit')
    expect(s.versions.at(-1)!.value).toBe(31)
  })
  it('retries the original blocked atomic increment against the newest committed value', () => {
    let s = initialTransactions('rc')
    const act = (type: string, value?: string | number) => {
      s = transactionTransition(s, { type, value })
    }
    act('begin')
    act('value', 1)
    act('increment')
    act('selected', 'T2')
    act('begin')
    act('increment')
    expect(currentTransaction(s)!.pending?.value).toBe(1)
    expect(currentTransaction(s)!.writes).toEqual([])
    expect(transactionCycle(s)).toEqual([])
    act('selected', 'T1')
    act('commit')
    act('selected', 'T2')
    act('value', 100)
    act('retry')
    expect(currentTransaction(s)!.writes).toEqual([{ row: 1, value: 12 }])
    act('commit')
    expect(s.versions.at(-1)!.value).toBe(12)
  })
  it('rolls back both writes atomically and rejects invalid inventory without publishing a version', () => {
    let s = initialTransactions('rc')
    const act = (type: string, value?: string | number) => {
      s = transactionTransition(s, { type, value })
    }
    act('begin')
    act('set')
    act('row', 2)
    act('value', 30)
    act('set')
    act('selected', 'T2')
    act('begin')
    act('read')
    expect(currentTransaction(s)!.read!.value).toBe(10)
    act('row', 1)
    act('read')
    expect(currentTransaction(s)!.read!.value).toBe(10)
    act('selected', 'T1')
    act('rollback')
    expect(s.versions).toHaveLength(2)
    act('selected', 'T2')
    act('value', -1)
    act('set')
    expect(s.error).toContain('CHECK 约束拒绝')
    expect(currentTransaction(s)!.writes).toEqual([])
    act('rollback')
    expect(s.locks.every((lock) => lock.writer === null && !lock.readers.length)).toBe(true)
  })
  it('detects a real wait cycle, aborts the younger transaction and lets the survivor retry', () => {
    let s = initialTransactions()
    const act = (type: string, value?: string | number) => {
      s = transactionTransition(s, { type, value })
    }
    act('begin')
    act('set')
    act('selected', 'T2')
    act('begin')
    act('row', 2)
    act('set')
    act('selected', 'T1')
    act('set')
    act('selected', 'T2')
    act('row', 1)
    act('set')
    expect(transactionCycle(s).sort()).toEqual([1, 2])
    act('resolve-deadlock')
    expect(currentTransaction(s)!.status).toBe('aborted')
    expect(transactionCycle(s)).toEqual([])
    act('selected', 'T1')
    act('retry')
    act('commit')
    expect(s.versions.slice(-2).map((v) => [v.row, v.value, v.commit])).toEqual([
      [1, 20, 1],
      [2, 20, 1],
    ])
    expect(s.versions.some((v) => v.tx === 2)).toBe(false)
  })
})
