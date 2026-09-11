import { describe, it, expect } from 'vitest'
import {
  consistencyTransition,
  initialConsistency,
  presentConsistency,
} from '../../src/experiments/models/distributed-consistency'
import { initialRaft, presentRaft, raftTransition } from '../../src/experiments/models/raft-consensus'
describe('Distributed register behavior during partitions', () => {
  it('rejects minority quorum operations and later resolves conflicting accepted local values', () => {
    let s = initialConsistency()
    const act = (type: string, value?: string) => {
      s = consistencyTransition(s, { type, value })
    }
    act('partition')
    act('write')
    expect(s.rejected).toBe(1)
    expect(s.acks).toEqual([])
    act('selected', 'B')
    act('write')
    expect(s.replicas.map((r) => r.value)).toEqual([0, 1, 1])
    act('mode', 'local')
    act('partition')
    act('write')
    act('selected', 'B')
    act('value', '2')
    act('write')
    expect(s.acks).toHaveLength(2)
    act('heal')
    expect(new Set(s.replicas.map((r) => r.value)).size).toBe(3)
    act('repair')
    expect(s.replicas.map((r) => r.value)).toEqual([2, 2, 2])
    expect(presentConsistency(s).goal.reached).toBe(true)
  })
  it('reads the maximum quorum version and repairs stale reachable replicas before returning', () => {
    let s = initialConsistency()
    s.replicas[1] = { node: 'B', version: 3, writer: 'B', value: 8 }
    s = consistencyTransition(s, { type: 'read' })
    expect(s.reads.at(-1)!.value).toBe(8)
    expect(s.replicas.every((r) => r.version === 3)).toBe(true)
  })
})
describe('Raft elections and replicated state machine safety', () => {
  it('commits through a majority and replaces only the isolated old leader’s uncommitted suffix', () => {
    let s = initialRaft()
    const act = (type: string, value?: string) => {
      s = raftTransition(s, { type, value })
      for (const n of s.nodes) {
        expect(n.applied).toBeLessThanOrEqual(n.commit)
        expect(n.commit).toBeLessThanOrEqual(n.log.length)
      }
      for (const a of s.nodes)
        for (const b of s.nodes)
          expect(a.log.slice(0, Math.min(a.commit, b.commit))).toEqual(
            b.log.slice(0, Math.min(a.commit, b.commit)),
          )
    }
    act('timeout')
    act('drain')
    expect(s.nodes[0]!.role).toBe('leader')
    act('propose')
    act('drain')
    expect(s.nodes.map((n) => n.value)).toEqual([5, 5, 5])
    act('isolated', 'A')
    act('value', '9')
    act('propose')
    act('drain')
    expect(s.proposals.at(-1)!.committed).toBe(false)
    expect(s.nodes[0]!.value).toBe(5)
    act('selected', 'B')
    act('timeout')
    act('drain')
    expect(s.nodes[1]!.role).toBe('leader')
    act('value', '7')
    act('propose')
    act('drain')
    expect(s.nodes[1]!.value).toBe(7)
    act('isolated', 'none')
    act('heartbeat')
    act('drain')
    expect(s.nodes.map((n) => n.value)).toEqual([7, 7, 7])
    expect(s.nodes[0]!.role).toBe('follower')
    expect(s.proposals.find((p) => p.value === 9)!.committed).toBe(false)
    expect(presentRaft(s).goal.reached).toBe(true)
  })
  it('refuses a stale candidate even with a larger term, persists one vote per term and retries prev-log mismatches', () => {
    let s = initialRaft()
    s = raftTransition(s, { type: 'timeout' })
    s = raftTransition(s, { type: 'drain' })
    s = raftTransition(s, { type: 'isolated', value: 'C' })
    s = raftTransition(s, { type: 'propose' })
    s = raftTransition(s, { type: 'drain' })
    s = raftTransition(s, { type: 'isolated', value: 'none' })
    s = raftTransition(s, { type: 'selected', value: 'C' })
    s = raftTransition(s, { type: 'timeout' })
    s = raftTransition(s, { type: 'drain' })
    expect(s.nodes[2]!.role).toBe('candidate')
    expect(s.nodes[2]!.votes).toEqual(['C'])
    s = raftTransition(s, { type: 'selected', value: 'B' })
    s = raftTransition(s, { type: 'timeout' })
    s = raftTransition(s, { type: 'drain' })
    expect(s.nodes[1]!.role).toBe('leader')
    expect(s.nodes[2]!.log).toEqual(s.nodes[1]!.log)
    expect(s.nodes[2]!.value).toBe(5)
  })
  it('handles competing elections and delayed messages without two leaders in one term', () => {
    let s = initialRaft()
    for (const id of ['A', 'B', 'C']) {
      s = raftTransition(s, { type: 'selected', value: id })
      s = raftTransition(s, { type: 'timeout' })
    }
    s = raftTransition(s, { type: 'drain' })
    expect(s.nodes.filter((n) => n.role === 'leader')).toHaveLength(0)
    s = raftTransition(s, { type: 'selected', value: 'A' })
    s = raftTransition(s, { type: 'timeout' })
    s = raftTransition(s, { type: 'drain' })
    expect(s.nodes.filter((n) => n.role === 'leader').map((n) => n.id)).toEqual(['A'])
  })
})

import { initialLease, leaseTransition, presentLease } from '../../src/experiments/models/distributed-locks'
import {
  distributedTxTransition,
  initialDistributedTx,
  presentDistributedTx,
} from '../../src/experiments/models/distributed-transactions'
import {
  initialResilience,
  presentResilience,
  resilienceTransition,
} from '../../src/experiments/models/service-resilience'
describe('Distributed leases and resource fencing', () => {
  it('rejects wrong-owner release and compares expired-client writes under both protocols', () => {
    let s = initialLease()
    const act = (type: string, value?: string) => {
      s = leaseTransition(s, { type, value })
    }
    const scenario = () => {
      act('acquire')
      act('pause')
      act('tick')
      act('tick')
      act('tick')
      act('selected', 'T2')
      act('acquire')
      act('value', '20')
      act('write')
      act('selected', 'T1')
      act('resume')
      act('release')
      expect(s.error).toContain('未匹配')
      expect(s.lease!.owner).toBe('T2')
      act('value', '99')
      act('write')
    }
    scenario()
    expect(s.resource.value).toBe(99)
    act('mode', 'fenced')
    scenario()
    expect(s.resource.value).toBe(20)
    expect(presentLease(s).goal.reached).toBe(true)
  })
  it('does not pretend a fencing token independently proves a lease has not expired', () => {
    let s = { ...initialLease(), mode: 'fenced' as const }
    for (const type of ['acquire', 'tick', 'tick', 'tick', 'write']) s = leaseTransition(s, { type })
    expect(s.resource.value).toBe(10)
    expect(s.writes[0]!.accepted).toBe(true)
    expect(leaseTransition(s, { type: 'renew' }).error).toContain('过期')
  })
})
describe('Distributed transaction durable decisions and compensations', () => {
  it('retains prepared uncertainty, recovers COMMIT and retries idempotent Saga compensation', () => {
    let s = initialDistributedTx()
    const act = (type: string, value?: string) => {
      s = distributedTxTransition(s, { type, value })
    }
    act('begin')
    act('prepare')
    act('selected', 'B')
    act('prepare')
    act('decide')
    act('crash')
    act('timeout')
    expect(s.participants.every((p) => p.phase === 'prepared')).toBe(true)
    act('recover')
    expect(s.decision).toBe('commit')
    act('deliver')
    act('selected', 'A')
    act('deliver')
    act('deliver')
    expect(s.participants.map((p) => p.value)).toEqual([80, 120])
    act('mode', 'saga')
    act('rejectB', 'on')
    act('saga-forward')
    expect(s.participants.map((p) => p.value)).toEqual([80, 100])
    act('saga-forward')
    act('compensationDown', 'on')
    act('compensate')
    expect(s.participants[0]!.value).toBe(80)
    act('compensationDown', 'off')
    act('compensate')
    act('compensate')
    expect(s.participants.map((p) => p.value)).toEqual([100, 100])
    expect(presentDistributedTx(s).goal.reached).toBe(true)
  })
  it('never invents COMMIT without unanimous prepare or replaces an existing durable decision', () => {
    let s = initialDistributedTx()
    for (const type of ['begin', 'prepare', 'crash', 'recover']) s = distributedTxTransition(s, { type })
    expect(s.decision).toBe('abort')
    s = distributedTxTransition(s, { type: 'deliver' })
    expect(s.participants[0]!.value).toBe(100)
    expect(s.participants[0]!.phase).toBe('aborted')
    s = { ...initialDistributedTx(), rejectB: true }
    for (const action of [
      { type: 'begin' },
      { type: 'prepare' },
      { type: 'selected', value: 'B' },
      { type: 'prepare' },
      { type: 'decide' },
    ])
      s = distributedTxTransition(s, action)
    expect(s.decision).toBe('abort')
  })
})
describe('Service discovery and bounded resilient requests', () => {
  it('limits a burst, times out slow attempts, retries through another node and deduplicates late effects', () => {
    let s = initialResilience()
    for (const type of ['refresh', 'burst', 'run']) s = resilienceTransition(s, { type })
    expect(s.requests.map((r) => r.state)).toEqual(['success', 'success', 'success', 'rejected'])
    expect(s.rateRejected).toBe(1)
    expect(s.attempts).toHaveLength(5)
    expect(s.effects).toBe(3)
    expect(s.skips).toBe(2)
    expect(s.instances[0]!.breaker).toBe('open')
    expect(presentResilience(s).goal.reached).toBe(true)
  })
  it('demonstrates duplicate effects without idempotency and preserves stale discovery until refresh', () => {
    let s = { ...initialResilience(), idempotent: false }
    for (const type of ['refresh', 'burst', 'run']) s = resilienceTransition(s, { type })
    expect(s.effects).toBe(5)
    for (let i = 0; i < 6; i++) s = resilienceTransition(s, { type: 'tick' })
    expect(s.cache).toEqual(['A', 'B'])
    s = resilienceTransition(s, { type: 'refresh' })
    expect(s.cache).toEqual([])
    s = resilienceTransition(s, { type: 'submit' })
    expect(s.requests.at(-1)!.state).toBe('rejected')
  })
  it('respects total deadlines and allows at most one half-open probe per instance', () => {
    let s = { ...initialResilience(), timeout: 1, retries: 2 }
    s = resilienceTransition(s, { type: 'refresh' })
    s.instances[1]!.up = false
    s = resilienceTransition(s, { type: 'burst' })
    s = resilienceTransition(s, { type: 'run' })
    expect(s.requests.every((r) => r.state !== 'pending')).toBe(true)
    expect(s.attempts.every((a) => a.deadline <= s.requests[a.request - 1]!.deadline)).toBe(true)
    s = { ...initialResilience(), cache: ['A'] }
    s.instances[0]!.breaker = 'open'
    s.instances[0]!.openUntil = 0
    s = resilienceTransition(s, { type: 'submit' })
    s = resilienceTransition(s, { type: 'submit' })
    expect(s.attempts).toHaveLength(1)
    expect(s.instances[0]!.breaker).toBe('half-open')
  })
})
