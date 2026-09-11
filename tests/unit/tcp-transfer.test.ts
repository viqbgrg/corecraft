import { describe, expect, it } from 'vitest'
import {
  canSendSegment,
  initialReliability,
  presentReliability,
  reliabilityTransition as act,
} from '../../src/experiments/models/tcp-reliability'
import {
  congestionTransition as event,
  initialCongestion,
  presentCongestion,
} from '../../src/experiments/models/tcp-congestion'

describe('reliable TCP byte stream', () => {
  it('buffers out of order data without ACKing over a hole and completes through window updates', () => {
    let s = act(initialReliability(), { type: 'fault', value: 'data' })
    for (let i = 0; i < 4; i++) s = act(s, { type: 'send' })
    expect(s.received).toEqual([false, true, true, true, false, false, false, false])
    s = act(s, { type: 'ack' })
    expect(s.base).toBe(0)
    expect(canSendSegment(s)).toBe(false)
    expect(act(s, { type: 'send' })).toBe(s)
    s = act(s, { type: 'timeout' })
    expect(s.expected).toBe(4)
    s = act(s, { type: 'ack' })
    expect(s.base).toBe(4)
    expect(canSendSegment(s)).toBe(false)
    for (let i = 0; i < 4; i++) s = act(s, { type: 'consume' })
    expect(canSendSegment(s)).toBe(false)
    s = act(s, { type: 'ack' })
    expect(canSendSegment(s)).toBe(true)
    for (let i = 0; i < 4; i++) s = act(s, { type: 'send' })
    s = act(s, { type: 'ack' })
    for (let i = 0; i < 4; i++) s = act(s, { type: 'consume' })
    expect(presentReliability(s).goal.reached).toBe(true)
    expect(s.transmissions.reduce((a, b) => a + b, 0)).toBe(9)
    expect(s.consumed).toBe(8)
  })
  it('deduplicates a retransmission after an ACK was lost, even if the application already read', () => {
    let s = act(initialReliability(), { type: 'send' })
    s = act(s, { type: 'fault', value: 'ack' })
    s = act(s, { type: 'ack' })
    s = act(s, { type: 'consume' })
    expect(s.base).toBe(0)
    s = act(s, { type: 'timeout' })
    expect(s).toMatchObject({ expected: 1, consumed: 1, duplicates: 1, retransmissions: 1 })
    expect(act(s, { type: 'consume' })).toBe(s)
    s = act(s, { type: 'ack' })
    expect(s.base).toBe(1)
  })
  it('enforces both sender and receiver windows and keeps old states immutable', () => {
    for (const [capacity, window] of [
      [1, 6],
      [6, 1],
      [3, 2],
    ]) {
      const initial = initialReliability(8, capacity, window)
      const snapshot = structuredClone(initial)
      let s = initial
      for (let i = 0; i < 8; i++) s = act(s, { type: 'send' })
      expect(s.next).toBe(Math.min(capacity!, window!))
      expect(initial).toEqual(snapshot)
    }
    expect(() => initialReliability(8, 0)).toThrow()
  })
})

describe('Reno congestion control', () => {
  it('grows only on ACKs, crosses the threshold, and applies additive growth per actual ACK', () => {
    let s = initialCongestion()
    for (const target of [2, 4, 8]) {
      const before = s.cwnd
      s = event(s, { type: 'send' })
      expect(s.cwnd).toBe(before)
      s = event(s, { type: 'ack' })
      expect(s.cwnd).toBe(target)
    }
    expect(s.phase).toBe('avoidance')
    s = event(event(s, { type: 'send' }), { type: 'ack' })
    expect(s.cwnd).toBeGreaterThan(8.9)
    expect(s.cwnd).toBeLessThan(9)
  })
  it('uses actual FlightSize for fast recovery and separately handles RTO', () => {
    let s = initialCongestion(4)
    for (let i = 0; i < 6; i++) s = event(event(s, { type: 'send' }), { type: 'ack' })
    expect(s.cwnd).toBeGreaterThan(8)
    s = event(s, { type: 'send' })
    expect(s.flight).toBe(4)
    s = event(s, { type: 'duplicates' })
    expect(s).toMatchObject({ threshold: 2, cwnd: 5, phase: 'recovery' })
    expect(event(s, { type: 'ack' })).toBe(s)
    s = event(s, { type: 'recover' })
    expect(s).toMatchObject({ cwnd: 2, phase: 'avoidance', flight: 0 })
    s = event(event(s, { type: 'send' }), { type: 'timeout' })
    expect(s).toMatchObject({ cwnd: 1, phase: 'slow-start', threshold: 2 })
    expect(presentCongestion(s).goal.reached).toBe(true)
  })
  it('rejects impossible loss events and resets all evidence when changing the workload', () => {
    const s = initialCongestion()
    for (const type of ['timeout', 'ack', 'recover', 'duplicates']) expect(event(s, { type })).toBe(s)
    const flight = event(s, { type: 'send' })
    expect(event(flight, { type: 'duplicates' })).toBe(flight)
    expect(event(flight, { type: 'window', value: 1 })).toEqual(initialCongestion(1))
    expect(() => initialCongestion(0)).toThrow()
  })
})
