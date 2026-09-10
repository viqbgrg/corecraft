import { describe, expect, it } from 'vitest'
import { initialProcess, transitionProcess } from '../../src/experiments/models/process'
import { initialVm, transitionVm } from '../../src/experiments/models/virtual-memory'
import { initialDns, transitionDns } from '../../src/experiments/models/dns'
import { initialHttp, transitionHttp } from '../../src/experiments/models/http'
import type { HttpState } from '../../src/experiments/models/http'

describe('round-robin process and thread scheduler', () => {
  it('preserves private execution state while sharing only within a process', () => {
    let s = transitionProcess(initialProcess(), { type: 'schedule' })
    s = transitionProcess(s, { type: 'execute' })
    s = transitionProcess(s, { type: 'schedule' })
    s = transitionProcess(s, { type: 'execute' })
    expect(s.processes[0]?.memory).toBe(2)
    expect(s.processes[1]?.memory).toBe(0)
    expect(s.threads[0]?.stack).toEqual([1])
    expect(s.threads[1]?.stack).toEqual([1])
    s = transitionProcess(s, { type: 'schedule' })
    s = transitionProcess(s, { type: 'execute' })
    expect(s.processes[1]?.memory).toBe(1)
    s = transitionProcess(s, { type: 'schedule' })
    expect(s.running).toBe('T1')
    expect(s.threads[0]?.pc).toBe(1)
  })
  it('wakes blocked threads into Ready and does not steal the CPU', () => {
    let s = transitionProcess(initialProcess(), { type: 'schedule' })
    s = transitionProcess(s, { type: 'block' })
    expect(s.running).toBe('T2')
    expect(s.threads[0]?.state).toBe('Blocked')
    s = transitionProcess(s, { type: 'io-complete' })
    expect(s.running).toBe('T2')
    expect(s.threads[0]?.state).toBe('Ready')
    expect(s.ready).toEqual(['T3', 'T1'])
  })
  it('preempts exactly at quantum and never schedules blocked threads', () => {
    let s = transitionProcess(initialProcess(), { type: 'schedule' })
    for (let i = 0; i < 3; i++) s = transitionProcess(s, { type: 'execute' })
    expect(s.running).toBe('T2')
    expect(s.switches).toBe(1)
    for (let i = 0; i < 3; i++) s = transitionProcess(s, { type: 'block' })
    expect(s.running).toBeNull()
    expect(s.ready).toEqual([])
    expect(s.threads.every((t) => t.state === 'Blocked')).toBe(true)
    s = transitionProcess(s, { type: 'io-complete' })
    s = transitionProcess(s, { type: 'schedule' })
    expect(s.threads.filter((t) => t.state === 'Running')).toHaveLength(1)
  })
})

describe('virtual address translation', () => {
  it('separates TLB misses from nonresident pages and keeps the offset', () => {
    let s = transitionVm(initialVm(), { type: 'access' })
    expect(s.phase).toBe('page-table')
    expect(s.faults).toBe(0)
    s = transitionVm(s, { type: 'walk' })
    expect(s.physical).toBe(44)
    expect(s.offset).toBe(44)
    s = transitionVm(s, { type: 'access' })
    expect(s.hits).toBe(1)
    expect(s.walks).toBe(1)
  })
  it('loads a missing page and invalidates the TLB on FIFO eviction', () => {
    let s = transitionVm(transitionVm(initialVm(), { type: 'access' }), { type: 'walk' })
    for (const value of ['0x022A', '0x0410']) {
      s = transitionVm(s, { type: 'address', value })
      s = transitionVm(s, { type: 'access' })
      s = transitionVm(s, { type: 'walk' })
      expect(s.phase).toBe('page-fault')
      s = transitionVm(s, { type: 'resolve' })
    }
    expect(s.pages[1]).toBeNull()
    expect(s.pages[4]).toBe(0)
    expect(s.physical).toBe(16)
    expect(s.tlb.some((t) => t.vpn === 1)).toBe(false)
    expect(s.evictions).toBe(1)
  })
  it('rejects addresses outside the mapped virtual space', () => {
    let s = transitionVm(initialVm(), { type: 'address', value: '0x0800' })
    s = transitionVm(s, { type: 'access' })
    expect(s.accesses).toBe(0)
    expect(s.log.at(-1)?.tone).toBe('danger')
  })
})

describe('recursive DNS resolution', () => {
  it('makes the resolver query each upstream, then serves from an unexpired cache', () => {
    let s = initialDns()
    for (let i = 0; i < 8; i++) s = transitionDns(s, { type: 'next' })
    expect(s.phase).toBe('done')
    expect(s.result).toBe('203.0.113.42')
    expect(s.upstream).toBe(3)
    expect(
      s.messages.filter((m) => ['root', 'tld', 'auth'].includes(m.to)).every((m) => m.from === 'resolver'),
    ).toBe(true)
    s = transitionDns(transitionDns(s, { type: 'next' }), { type: 'next' })
    expect(s.phase).toBe('done')
    expect(s.upstream).toBe(0)
    expect(s.messages).toHaveLength(2)
    expect(s.cachedCompleted).toBe(true)
  })
  it('expires positive and negative cache entries at their own TTLs', () => {
    let s = initialDns()
    for (let i = 0; i < 8; i++) s = transitionDns(s, { type: 'next' })
    s = transitionDns(transitionDns(s, { type: 'advance' }), { type: 'advance' })
    s = transitionDns(s, { type: 'next' })
    expect(s.phase).toBe('root-query')
    let missing = transitionDns(initialDns(), { type: 'domain', value: 'missing.corecraft.test' })
    for (let i = 0; i < 8; i++) missing = transitionDns(missing, { type: 'next' })
    expect(missing.result).toBeNull()
    expect(missing.cache[0]?.expires).toBe(30)
    missing = transitionDns(missing, { type: 'advance' })
    missing = transitionDns(missing, { type: 'next' })
    expect(missing.cacheHit).toBe(false)
  })
})

function request(state: HttpState): HttpState {
  let s = transitionHttp(state, { type: 'next' })
  for (let i = 0; s.phase === 'running' && i < 10; i++) s = transitionHttp(s, { type: 'next' })
  return s
}
describe('HTTP lifecycle', () => {
  it('reuses connections only for the same origin and reduces preparation work', () => {
    let s = request(initialHttp())
    expect(s.response).toBe(200)
    expect(s.time).toBe(225)
    s = request(s)
    expect(s.reused).toBe(true)
    expect(s.skipped).toEqual([1, 2, 3])
    expect(s.time).toBe(85)
    expect(s.previousTime).toBe(225)
    s = transitionHttp(s, { type: 'url', value: 'https://another.test/hello' })
    s = request(s)
    expect(s.reused).toBe(false)
    expect(s.skipped).toEqual([])
  })
  it('keeps DNS caching distinct from connection reuse', () => {
    let s = request(initialHttp())
    s = transitionHttp(s, { type: 'close-connections' })
    s = request(s)
    expect(s.reused).toBe(false)
    expect(s.time).toBe(206)
  })
  it.each([
    ['dns', 'DNS_FAILURE', 1],
    ['tcp', 'TCP_TIMEOUT', 2],
    ['tls', 'TLS_CERT_ERROR', 3],
  ] as const)('stops at %s without sending later protocol messages', (fault, error, stage) => {
    const s = request(transitionHttp(initialHttp(), { type: 'fault', value: fault }))
    expect(s.phase).toBe('failed')
    expect(s.failure).toBe(error)
    expect(s.stage).toBe(stage)
    expect(s.completed).not.toContain(4)
    expect(s.response).toBeNull()
  })
  it('distinguishes a received HTTP 500 from a transport failure', () => {
    const s = request(transitionHttp(initialHttp(), { type: 'fault', value: 'server' }))
    expect(s.phase).toBe('done')
    expect(s.response).toBe(500)
    expect(s.failure).toBe('')
  })
  it('skips TLS for HTTP and rejects malformed URLs', () => {
    const s = request(transitionHttp(initialHttp(), { type: 'url', value: 'http://corecraft.test/' }))
    expect(s.skipped).toContain(3)
    expect(s.time).toBe(165)
    const invalid = request(transitionHttp(initialHttp(), { type: 'url', value: 'javascript:alert(1)' }))
    expect(invalid.requests).toBe(0)
  })
})
