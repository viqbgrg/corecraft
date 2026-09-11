import { describe, it, expect } from 'vitest'
import {
  capacityKeys,
  capacityStats,
  capacityTransition,
  defaultCapacity,
  initialCapacity,
  lookupCapacity,
  newCapacityRun,
  presentCapacity,
  simulateCapacity,
  stepCapacity,
} from '../../src/experiments/models/backend-capacity'
import {
  initialIntegration,
  integrationTransition,
  presentIntegration,
} from '../../src/experiments/models/backend-consistency'
import {
  incidentConfig,
  initialObservability,
  observabilityTransition,
  presentObservability,
  violationCount,
} from '../../src/experiments/models/backend-observability'
describe('Backend resource capacity and controlled optimization', () => {
  it('preserves query results while reducing actual work, and verifies the finite-run Little law identity independently', () => {
    const baseline = simulateCapacity(defaultCapacity())
    expect(baseline.done).toBe(true)
    expect(baseline.dbUnits).toBe(96)
    expect(baseline.cpuUnits).toBe(24)
    expect(capacityStats(baseline).rejected).toBe(0)
    expect(capacityStats(baseline).results).toEqual(capacityKeys.map((key, i) => [i + 1, key * 10]))
    const area = baseline.timeline.reduce((n, t) => n + t.inflight, 0),
      latency = baseline.jobs.reduce((n, j) => n + j.finished! - j.arrival, 0)
    expect(area).toBe(latency)
    expect(area / baseline.clock).toBeCloseTo(
      capacityStats(baseline).throughput * capacityStats(baseline).mean,
    )
    let s = initialCapacity()
    for (const action of [
      { type: 'indexed', value: 'on' },
      { type: 'cache', value: 'on' },
      { type: 'allocation', value: 2 },
      { type: 'heap', value: 64 },
      { type: 'compare' },
    ])
      s = capacityTransition(s, action)
    expect(s.run.hits).toBeGreaterThan(0)
    expect(s.run.dbUnits).toBeLessThan(96)
    expect(presentCapacity(s).goal.reached).toBe(true)
    for (let key = 1; key <= 8; key++)
      expect(lookupCapacity(key, true).value).toBe(lookupCapacity(key, false).value)
  })
  it('bounds CPU, connections, workers and heap through synchronous, asynchronous and overloaded variants', () => {
    for (const config of [
      { ...defaultCapacity(), async: true, workers: 4, allocation: 2, heap: 64 },
      { ...defaultCapacity(), async: true, workers: 8, heap: 16 },
      { ...defaultCapacity(), queueLimit: 1 },
    ]) {
      let r = newCapacityRun(config)
      for (let i = 0; i < 300 && !r.done; i++) {
        r = stepCapacity(r)
        expect(r.timeline.at(-1)!.cpu).toBeLessThanOrEqual(2)
        expect(r.jobs.filter((j) => j.stage === 'db').length).toBeLessThanOrEqual(config.dbConnections)
        expect(r.heapUsed).toBeLessThanOrEqual(config.heap)
        const workers = r.jobs.flatMap((j) => (j.worker === null ? [] : [j.worker]))
        expect(new Set(workers).size).toBe(workers.length)
        expect(workers.length).toBeLessThanOrEqual(config.workers)
      }
      expect(r.done).toBe(true)
    }
    expect(capacityStats(simulateCapacity({ ...defaultCapacity(), queueLimit: 1 })).rejected).toBeGreaterThan(
      0,
    )
    expect(capacityTransition({ ...initialCapacity(), input: '1,,2' }, { type: 'compare' }).error).toContain(
      '整数',
    )
  })
})
describe('Cross-service outbox, inbox and cache version boundaries', () => {
  it('exposes stale fill and the direct double-write gap, then survives relay loss and rejects old cache refill', () => {
    let s = initialIntegration()
    const act = (type: string, value?: string) => {
      s = integrationTransition(s, { type, value })
    }
    act('read-start')
    act('commit')
    act('invalidate')
    act('read-fill')
    expect(s.cache).toEqual({ version: 1, stock: 10 })
    expect(s.db.stock).toBe(9)
    act('writer-crash')
    expect(s.outbox).toEqual([])
    act('mode', 'outbox')
    act('read-start')
    act('commit')
    expect(s.outbox[0]!.version).toBe(s.db.version)
    act('claim')
    act('publish')
    act('relay-crash')
    act('tick')
    act('tick')
    act('selected', 'W2')
    act('claim')
    act('publish')
    act('mark')
    expect(s.queue).toHaveLength(2)
    act('deliver')
    act('deliver')
    act('read-fill')
    expect(s.cache).toBeNull()
    expect(s.floor).toBe(2)
    expect(s.notifications).toBe(1)
    expect(s.duplicateSkips).toBe(1)
    expect(presentIntegration(s).goal.reached).toBe(true)
  })
  it('rejects a stale relay token and makes out-of-order events unable to lower projection or invalidation versions', () => {
    let s = { ...initialIntegration(), mode: 'outbox' as const }
    const act = (type: string, value?: string) => {
      s = integrationTransition(s, { type, value })
    }
    act('commit')
    act('claim')
    act('publish')
    act('tick')
    act('tick')
    act('mark')
    expect(s.error).toContain('token')
    act('claim')
    act('mark')
    expect(s.outbox[0]!.published).toBe(true)
    act('stock', '7')
    act('commit')
    act('publish')
    act('mark')
    act('reverse')
    act('deliver')
    expect(s.projection).toEqual({ version: 3, stock: 7 })
    act('deliver')
    expect(s.projection).toEqual({ version: 3, stock: 7 })
    expect(s.floor).toBe(3)
  })
})
describe('Observability from actual workload execution', () => {
  it('joins metrics, traces, thread state, CPU samples and heap events before validating a targeted adjustment', () => {
    let s = initialObservability()
    const act = (type: string, value?: string) => {
      s = observabilityTransition(s, { type, value })
    }
    act('baseline')
    for (const type of ['metrics', 'threads', 'trace', 'profile', 'heap']) act(type)
    expect(
      s.baseline!.timeline.find((t) => t.clock === 5)!.threads.some((t) => t.state.includes('JDBC')),
    ).toBe(true)
    expect(s.baseline!.samples.reduce((n, p) => n + p.count, 0)).toBe(s.baseline!.cpuUnits)
    act('fix', 'index')
    act('compare')
    expect(presentObservability(s).goal.reached).toBe(true)
    expect(violationCount(s.candidate!, s.budget)).toBeLessThan(violationCount(s.baseline!, s.budget))
    const j = s.baseline!.jobs[0]!
    expect(j.cpuEnd).toBeLessThanOrEqual(j.dbStart!)
    expect(j.dbEnd).toBeLessThanOrEqual(j.renderStart!)
    expect(j.renderStart).toBeLessThan(j.finished!)
  })
  it('improves separate CPU and allocation incidents by reducing their measured work, without inventing samples for IO waits', () => {
    for (const [scenario, fix] of [
      ['cpu', 'cpu'],
      ['gc', 'allocation'],
    ] as const) {
      let s = { ...initialObservability(), scenario, fix, budget: 30 }
      s = observabilityTransition(s, { type: 'baseline' })
      s = observabilityTransition(s, { type: 'compare' })
      expect(capacityStats(s.candidate!).p95).toBeLessThan(capacityStats(s.baseline!).p95)
      if (scenario === 'cpu') expect(s.candidate!.cpuUnits).toBeLessThan(s.baseline!.cpuUnits)
      else expect(s.candidate!.gcTicks).toBeLessThan(s.baseline!.gcTicks)
      expect(capacityStats(s.candidate!).results).toEqual(capacityStats(s.baseline!).results)
    }
    const db = simulateCapacity(incidentConfig('db'))
    expect(capacityStats(db).dbUtil).toBeGreaterThan(capacityStats(db).cpuUtil)
  })
})
