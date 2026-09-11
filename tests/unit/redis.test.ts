import { describe, it, expect } from 'vitest'
import {
  emptySkipList,
  orderedSkipNodes,
  skipUpsert,
  initialRedisStructures,
  redisStructuresTransition,
  presentRedisStructures,
} from '../../src/experiments/models/redis-structures'
import {
  initialExpiration,
  expirationTransition,
  presentExpiration,
} from '../../src/experiments/models/redis-expiration'
import {
  initialPersistence,
  persistenceTransition,
  presentPersistence,
} from '../../src/experiments/models/redis-persistence'
import {
  initialTopology,
  topologyTransition,
  presentTopology,
  redisSlot,
} from '../../src/experiments/models/redis-topology'
describe('Redis value semantics and real skip-list links', () => {
  it('maintains sorted unique members across arbitrary score updates and every level forward chain', () => {
    let list = emptySkipList()
    const reference = new Map<string, number>()
    let seed = 7
    for (let i = 0; i < 120; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const member = 'm' + (seed % 20),
        score = ((seed >>> 8) % 21) - 10
      reference.set(member, score)
      list = skipUpsert(list, member, score)
      const sorted = [...reference].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
      expect(orderedSkipNodes(list).map((n) => [n.member, n.score])).toEqual(sorted)
      for (let level = 0; level < 4; level++) {
        const chain: string[] = []
        let p = list.head[level]
        while (p != null) {
          expect(chain).not.toContain(p)
          chain.push(p)
          const n = list.nodes.find((n) => n.member === p)!
          expect(n.next.length).toBeGreaterThan(level)
          p = n.next[level]
        }
        expect(chain).toEqual(
          orderedSkipNodes(list)
            .filter((n) => n.next.length > level)
            .map((n) => n.member),
        )
      }
    }
  })
  it('executes all value types, returns mutation counts, rejects WRONGTYPE and checks 64-bit overflow', () => {
    let s = initialRedisStructures()
    const run = (command: string, key: string, value = '5', field = 'name', score = '10') => {
      for (const [type, v] of Object.entries({ command, key, value, field, score }))
        s = redisStructuresTransition(s, { type, value: v })
      s = redisStructuresTransition(s, { type: 'execute' })
    }
    run('SET', 'counter')
    run('INCR', 'counter')
    expect(s.result).toBe('6')
    run('LPUSH', 'jobs', 'A')
    run('LPUSH', 'jobs', 'B')
    run('RPOP', 'jobs')
    expect(s.result).toBe('A')
    run('HSET', 'user', 'Ada')
    run('HGET', 'user')
    expect(s.result).toBe('Ada')
    run('SADD', 'tags', 'java')
    run('SADD', 'tags', 'java')
    expect(s.result).toBe('0')
    for (const [member, score] of [
      ['Alice', '10'],
      ['Bob', '5'],
      ['Carol', '10'],
      ['Alice', '3'],
    ])
      run('ZADD', 'rank', member, 'name', score)
    run('ZRANGE', 'rank')
    expect(JSON.parse(s.result)).toEqual([
      ['Alice', 3],
      ['Bob', 5],
      ['Carol', 10],
    ])
    expect(presentRedisStructures(s).goal.reached).toBe(true)
    run('LPUSH', 'counter')
    expect(s.error).toContain('WRONGTYPE')
    run('SET', 'counter', '9223372036854775807')
    run('INCR', 'counter')
    expect(s.error).toContain('overflow')
  })
})
describe('Redis expiration versus capacity eviction', () => {
  it('keeps expired keys resident until a check, refuses noeviction writes and evicts the least recently used eligible key', () => {
    let s = initialExpiration()
    const act = (type: string, value?: string) => {
      s = expirationTransition(s, { type, value })
    }
    act('tick')
    expect(s.entries).toHaveLength(3)
    act('get')
    expect(s.result).toBe('nil')
    expect(s.entries).toHaveLength(2)
    act('key', 'D')
    act('set')
    act('key', 'E')
    act('set')
    expect(s.rejected).toBe(1)
    act('key', 'A')
    act('get')
    act('policy', 'allkeys-lru')
    act('key', 'E')
    act('set')
    expect(s.entries.map((e) => e.key)).toEqual(['A', 'D', 'E'])
    expect(s.history).toContainEqual({ key: 'B', reason: 'evicted', clock: 1 })
    expect(presentExpiration(s).goal.reached).toBe(true)
  })
  it('clears TTL on plain SET, requires expiring candidates for volatile LRU and treats EXPIRE zero as deletion', () => {
    let s = initialExpiration()
    const act = (type: string, value?: string) => {
      s = expirationTransition(s, { type, value })
    }
    for (const key of ['B', 'C']) {
      act('key', key)
      act('set')
      act('ttl-query')
      expect(s.result).toBe('-1')
    }
    act('policy', 'volatile-lru')
    act('key', 'D')
    act('set')
    expect(s.rejected).toBe(1)
    act('key', 'B')
    act('expire')
    act('ttl-query')
    expect(s.result).toBe('-2')
    s = initialExpiration()
    act('tick')
    act('active')
    act('active')
    expect(s.entries.some((e) => e.key === 'C')).toBe(false)
  })
})
describe('Redis snapshot, durable AOF prefix and rewrite', () => {
  it('recovers the RDB start point, loses an unflushed AOF tail and preserves always-confirmed writes', () => {
    let s = initialPersistence()
    const act = (type: string, value?: string) => {
      s = persistenceTransition(s, { type, value })
    }
    for (const type of ['write', 'save-start', 'write', 'save-finish', 'crash', 'recover']) act(type)
    expect(s.value).toBe(1)
    expect(s.lost).toBe(1)
    act('mode', 'everysec')
    act('write')
    act('crash')
    act('recover')
    expect(s.value).toBe(0)
    expect(s.lost).toBe(1)
    act('mode', 'always')
    act('write')
    act('crash')
    act('recover')
    expect(s.value).toBe(1)
    expect(s.lost).toBe(0)
    expect(presentPersistence(s).goal.reached).toBe(true)
  })
  it('adds rewrite deltas to a compact baseline, and a crash before replacement keeps the old durable file', () => {
    let s = { ...initialPersistence(), mode: 'everysec' as const }
    const act = (type: string) => {
      s = persistenceTransition(s, { type })
    }
    act('write')
    act('write')
    act('fsync')
    act('rewrite-start')
    act('write')
    act('rewrite-finish')
    expect(s.aofDisk).toEqual([
      { seq: 2, value: 2 },
      { seq: 3, value: 3 },
    ])
    act('crash')
    act('recover')
    expect(s.value).toBe(3)
    act('rewrite-start')
    act('write')
    act('crash')
    act('recover')
    expect(s.value).toBe(3)
    expect(s.lost).toBe(1)
  })
})
describe('Redis asynchronous failover and Cluster routing', () => {
  it('requires distinct majority votes, loses isolated acknowledged writes and differentiates ASK from MOVED', () => {
    let s = initialTopology()
    const act = (type: string, value?: string) => {
      s = topologyTransition(s, { type, value })
    }
    act('write')
    act('read-replica')
    act('replicate')
    act('partition')
    act('old-write')
    act('vote')
    act('vote')
    expect(s.votes).toHaveLength(1)
    act('promote')
    expect(s.error).toContain('多数')
    act('sentinel', 'S2')
    act('vote')
    act('promote')
    expect(s.master).toBe('R1')
    act('heal')
    expect(s.lost).toEqual([2])
    expect(s.nodes.every((n) => n.history.at(-1)!.value === 1)).toBe(true)
    const owner = s.cluster.owner
    act('migrate')
    act('move-key')
    act('cluster-get')
    expect(s.cluster.reply).toContain('ASK ')
    act('ask')
    expect(s.cluster.cache).toBe(owner)
    act('finalize')
    act('cluster-get')
    expect(s.cluster.reply).toContain('MOVED ')
    act('refresh')
    expect(s.cluster.cache).toBe(s.cluster.target)
    expect(presentTopology(s).goal.reached).toBe(true)
  })
  it('uses CRC16 XMODEM and the first nonempty brace pair rule, and validates migration completion', () => {
    expect(redisSlot('123456789')).toBe(0x31c3 % 16384)
    expect(redisSlot('{user}:cart')).toBe(redisSlot('{user}:profile'))
    expect(redisSlot('a{user}b')).toBe(redisSlot('user'))
    expect(redisSlot('{}{user}')).not.toBe(redisSlot('user'))
    let s = topologyTransition(initialTopology(), { type: 'migrate' })
    expect(topologyTransition(s, { type: 'finalize' }).error).toContain('迁移')
    s = topologyTransition(s, { type: 'cross-slot' })
    expect(s.cluster.reply).toContain('同槽')
  })
})
