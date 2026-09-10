import { describe, expect, it } from 'vitest'
import { binaryResult, initialBinary, transitionBinary } from '../../src/experiments/models/binary'
import { cpuStep, initialCpu, transitionCpu } from '../../src/experiments/models/cpu'
import { accessCache, cacheSequence, initialCache, transitionCache } from '../../src/experiments/models/cache'

describe('binary representation', () => {
  it('flips exactly the selected bit and keeps the previous state immutable', () => {
    const initial = initialBinary()
    const changed = transitionBinary(initial, { type: 'toggle-a', value: 7 })
    expect(changed.a).toBe(170)
    expect(initial.a).toBe(42)
    expect(changed.bitsDraft).toBe('10101010')
  })
  it('preserves the carry outside the 8-bit stored sum', () => {
    const s = transitionBinary(initialBinary(), { type: 'overflow' })
    expect(binaryResult(s)).toEqual({ result: 0, carry: 1, full: 256 })
  })
  it('uses real truth tables for AND, OR and XOR', () => {
    for (const [operation, result] of [
      ['AND', 10],
      ['OR', 47],
      ['XOR', 37],
    ] as const) {
      expect(
        binaryResult(transitionBinary(initialBinary(), { type: 'operation', value: operation })).result,
      ).toBe(result)
    }
  })
  it('converts binary inputs and rejects invalid or oversized representations', () => {
    expect(transitionBinary(initialBinary(), { type: 'bits-a', value: '11111111' }).a).toBe(255)
    for (const value of ['102', '100000000', '-1', '']) {
      const next = transitionBinary(initialBinary(), { type: 'bits-a', value })
      expect(next.a).toBe(42)
      expect(next.error).not.toBe('')
    }
  })
})

describe('teaching CPU', () => {
  it('advances PC at fetch but changes registers only during write back', () => {
    let s = initialCpu()
    s = cpuStep(s)
    expect(s.pc).toBe(1)
    expect(s.phase).toBe('Decode')
    s = cpuStep(cpuStep(s))
    expect(s.phase).toBe('Write Back')
    expect(s.registers.R1).toBe(0)
    s = cpuStep(s)
    expect(s.registers.R1).toBe(10)
    expect(s.retired).toBe(1)
  })
  it('stores and loads the computed result, then stays halted', () => {
    let s = initialCpu(10, 20)
    for (let i = 0; i < 6; i++) s = transitionCpu(s, { type: 'instruction' })
    expect(s.registers).toEqual({ R1: 30, R2: 20, R3: 30 })
    expect(s.memory[16]).toBe(30)
    expect(s.phase).toBe('Halted')
    expect(s.cycles).toBe(24)
    expect(cpuStep(s)).toEqual(s)
  })
})

describe('inclusive direct-mapped cache', () => {
  it('loads an entire cache line, not a single requested word', () => {
    let s = accessCache(initialCache(), 0x1000)
    expect(s.source).toBe('RAM')
    for (const a of [0x1004, 0x1008, 0x100c]) s = accessCache(s, a)
    expect(s.ram).toBe(1)
    expect(s.l1Hits).toBe(3)
    expect(s.cycles).toBe(92)
  })
  it('can hit L2 after an L1 conflict and invalidates L1 on L2 eviction', () => {
    let s = accessCache(initialCache(), 0x1000)
    s = accessCache(s, 0x1040)
    s = accessCache(s, 0x1000)
    expect(s.source).toBe('L2')
    s = accessCache(s, 0x2000)
    expect(s.l1).not.toContain(0x1000 / 16)
    expect(s.l2).not.toContain(0x1000 / 16)
    s = accessCache(s, 0x1000)
    expect(s.source).toBe('RAM')
  })
  it('compares identical workloads from cold caches', () => {
    expect(
      cacheSequence(true)
        .slice()
        .sort((a, b) => a - b),
    ).toEqual(cacheSequence())
    let s = transitionCache(initialCache(), { type: 'sequential' })
    s = transitionCache(s, { type: 'shuffled' })
    expect(s.comparisons.sequential?.rate).toBe(75)
    expect(s.comparisons.sequential?.ram).toBe(8)
    expect(s.comparisons.shuffled?.ram).toBe(8)
    expect(s.comparisons.shuffled!.cycles).toBeGreaterThan(s.comparisons.sequential!.cycles)
  })
  it('rejects malformed addresses without performing an access', () => {
    let s = transitionCache(initialCache(), { type: 'address', value: '0x1000z' })
    s = transitionCache(s, { type: 'access' })
    expect(s.error).not.toBe('')
    expect(s.ram).toBe(0)
  })
})
