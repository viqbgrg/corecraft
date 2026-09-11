import { describe, expect, it } from 'vitest'
import {
  initialScheduling,
  parseJobs,
  runScheduling,
  schedulingStats,
  schedulingStep,
  schedulingTransition,
} from '../../src/experiments/models/scheduling'
import {
  initialReplacement,
  replacementStep,
  replacementTransition,
  runReplacement,
} from '../../src/experiments/models/page-replacement'

describe('CPU scheduling', () => {
  it('handles arrivals, preemption and independent waiting / response metrics', () => {
    const fcfs = runScheduling(initialScheduling())
    const srtf = runScheduling(initialScheduling('srtf'))
    expect(fcfs.jobs.map((j) => j.finish)).toEqual([8, 12, 14])
    expect(srtf.jobs.map((j) => j.finish)).toEqual([14, 7, 4])
    expect(srtf.jobs.map((j) => j.start)).toEqual([0, 1, 2])
    expect(schedulingStats(fcfs).waiting).toBeCloseTo(17 / 3)
    expect(schedulingStats(srtf).waiting).toBeCloseTo(8 / 3)
    expect(schedulingStats(srtf).response).toBe(0)
    expect(srtf.history.slice(0, 7).map((h) => h.job)).toEqual(['P1', 'P2', 'P3', 'P3', 'P2', 'P2', 'P2'])
  })
  it('does not preempt SJF and lets an arrival join before a RR requeue', () => {
    const sjf = runScheduling(initialScheduling('sjf'))
    expect(sjf.jobs.map((j) => j.finish)).toEqual([8, 14, 10])
    const rr = runScheduling(initialScheduling('rr', '0:4, 2:1', 2))
    expect(rr.history.map((h) => h.job)).toEqual(['P1', 'P1', 'P2', 'P1', 'P1'])
  })
  it('accounts for idle time and never executes jobs before arrival', () => {
    for (const policy of ['fcfs', 'sjf', 'srtf', 'rr'] as const) {
      const initial = initialScheduling(policy, '6:1, 3:2')
      const snapshot = structuredClone(initial)
      const result = runScheduling(initial)
      expect(initial).toEqual(snapshot)
      expect(result.history.map((h) => h.job)).toEqual(['IDLE', 'IDLE', 'IDLE', 'P2', 'P2', 'IDLE', 'P1'])
      expect(schedulingStats(result).waiting).toBe(0)
      expect(schedulingStep(result)).toBe(result)
    }
  })
  it('compares the same workload without advancing the current run and validates drafts', () => {
    const partial = schedulingStep(initialScheduling())
    const compared = schedulingTransition(partial, { type: 'compare' })
    expect(compared.time).toBe(1)
    expect(compared.jobs).toEqual(partial.jobs)
    expect(compared.comparison).toHaveLength(4)
    const bad = schedulingTransition(compared, { type: 'workload', value: '1:0, x:2' })
    expect(bad.error).toBeTruthy()
    expect(schedulingStep(bad)).toBe(bad)
    const fixed = schedulingTransition(bad, { type: 'workload', value: '0:1' })
    expect(fixed.time).toBe(0)
    expect(fixed.error).toBeNull()
    expect(fixed.comparison).toEqual([])
    for (const input of ['', '0:1:2', '-1:2', '31:1', '0:21', '0:1.5']) expect(parseJobs(input)).toBeNull()
  })
  it('conserves CPU work for varied arrival order, burst lengths and policies', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const workload = Array.from(
        { length: 5 },
        (_, i) => `${(seed * (i + 2)) % 9}:${((seed + i * 3) % 7) + 1}`,
      ).join(',')
      for (const policy of ['fcfs', 'sjf', 'srtf', 'rr'] as const) {
        const s = runScheduling(initialScheduling(policy, workload, (seed % 4) + 1))
        for (const job of s.jobs) {
          expect(s.history.filter((h) => h.job === job.id)).toHaveLength(job.burst)
          expect(job.start!).toBeGreaterThanOrEqual(job.arrival)
          expect(job.finish! - job.arrival).toBeGreaterThanOrEqual(job.burst)
        }
      }
    }
  })
})

describe('page replacement', () => {
  it('reproduces Belady anomaly from the real FIFO transitions', () => {
    expect(runReplacement(initialReplacement()).faults).toBe(9)
    expect(runReplacement(initialReplacement('fifo', undefined, 4)).faults).toBe(10)
    expect(runReplacement(initialReplacement('opt')).faults).toBe(7)
    expect(runReplacement(initialReplacement('lru')).faults).toBe(10)
  })
  it('updates LRU on a hit without changing FIFO arrival order', () => {
    const fifo = runReplacement(initialReplacement('fifo', '1 2 1 3', 2))
    const lru = runReplacement(initialReplacement('lru', '1 2 1 3', 2))
    expect(fifo.history.at(-1)?.evicted).toBe(1)
    expect(lru.history.at(-1)?.evicted).toBe(2)
  })
  it('gives Clock pages a second chance, without moving its hand on hits', () => {
    let s = initialReplacement('clock', '1 2 1 3', 2)
    s = replacementStep(replacementStep(s))
    expect(s.hand).toBe(0)
    s = replacementStep(s)
    expect(s.hand).toBe(0)
    s = replacementStep(s)
    expect(s.frames.map((f) => f?.page)).toEqual([3, 2])
    expect(s.frames.map((f) => f?.referenced)).toEqual([true, false])
    expect(s.hand).toBe(1)
  })
  it('preserves capacity, unique residency, hit accounting and the optimal lower bound', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const refs = Array.from({ length: 30 }, (_, i) => (i * seed + i * i) % 8).join(' ')
      let lastLru = Infinity
      for (let capacity = 1; capacity <= 5; capacity++) {
        const optimal = runReplacement(initialReplacement('opt', refs, capacity)).faults
        for (const policy of ['fifo', 'lru', 'clock', 'opt'] as const) {
          const s = runReplacement(initialReplacement(policy, refs, capacity))
          expect(s.hits + s.faults).toBe(30)
          expect(s.faults).toBeGreaterThanOrEqual(optimal)
          for (const h of s.history) {
            const pages = h.frames.filter((f) => f !== null)
            expect(pages.length).toBeLessThanOrEqual(capacity)
            expect(new Set(pages).size).toBe(pages.length)
          }
          if (policy === 'lru') {
            expect(s.faults).toBeLessThanOrEqual(lastLru)
            lastLru = s.faults
          }
        }
      }
    }
  })
  it('blocks invalid drafts, resets after corrections and leaves comparison runs isolated', () => {
    const initial = initialReplacement()
    const snapshot = structuredClone(initial)
    const compared = replacementTransition(initial, { type: 'compare' })
    expect(initial).toEqual(snapshot)
    expect(compared.cursor).toBe(0)
    expect(compared.comparison).toHaveLength(4)
    const bad = replacementTransition(compared, { type: 'references', value: '1 16 2' })
    expect(replacementStep(bad)).toBe(bad)
    expect(replacementTransition(bad, { type: 'references', value: '1,2,1' })).toMatchObject({
      cursor: 0,
      error: null,
      comparison: [],
    })
    expect(() => initialReplacement('fifo', '1', 0)).toThrow()
  })
})
