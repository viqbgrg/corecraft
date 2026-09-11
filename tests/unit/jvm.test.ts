import { describe, expect, it } from 'vitest'
import {
  initialJvmRuntime,
  objectLayout,
  presentJvmRuntime,
  runtimeTransition,
  verifyRuntimeProgram,
} from '../../src/experiments/models/jvm-runtime'
import {
  gcTransition,
  initialGc,
  planCollection,
  presentGc,
  rememberedEdges,
  type GcState,
} from '../../src/experiments/models/jvm-gc'
import {
  chooseRegions,
  initialRelocation,
  presentRelocation,
  reachableRegionIds,
  relocateRegions,
  relocationTransition,
  resolveForwarding,
} from '../../src/experiments/models/jvm-collectors'
import { evaluatePoints, initialJit, jitTransition, presentJit } from '../../src/experiments/models/jvm-jit'

describe('JVM lifecycle, typed bytecode and layout', () => {
  it('prepares defaults, initializes once, executes the operand stack, and preserves separate capacities', () => {
    let s = initialJvmRuntime()
    const act = (type: string, value?: string | number) => {
      s = runtimeTransition(s, { type, value })
    }
    act('load')
    expect(s.metadataBytes).toBe(64)
    expect(s.staticSeed).toBeNull()
    act('verify')
    act('prepare')
    expect(s.staticSeed).toBe(0)
    act('resolve')
    act('initialize')
    act('initialize')
    expect(s.staticSeed).toBe(7)
    expect(s.initCount).toBe(1)
    act('step')
    expect(s.frame!.stack).toEqual([7])
    act('step')
    expect(s.frame!.stack).toEqual([7, 5])
    act('step')
    expect(s.frame!.stack).toEqual([12])
    act('run')
    expect(s.frame!.returned).toBe(12)
    expect(s.frame!.local).toBe(12)
    expect(s.frame!.stack).toEqual([])
    act('allocate')
    act('compare-layout')
    expect(s.heap).toEqual([{ id: 1, offset: 0, size: 24 }])
    expect(presentJvmRuntime(s).goal.reached).toBe(true)
    for (let i = 0; i < 5; i++) act('allocate')
    expect(s.error).toContain('OutOfMemoryError')
    expect(s.heap).toHaveLength(5)
    expect(s.metadataBytes).toBe(64)
  })
  it('rejects invalid return types before execution and keeps failed class initialization erroneous', () => {
    expect(verifyRuntimeProgram(['iadd', 'ireturn']).valid).toBe(false)
    expect(verifyRuntimeProgram(['iload_0', 'ireturn']).valid).toBe(false)
    let s = runtimeTransition(initialJvmRuntime(), { type: 'program', value: 'bad-return' })
    s = runtimeTransition(s, { type: 'load' })
    s = runtimeTransition(s, { type: 'verify' })
    expect(s.error).toContain('VerifyError')
    expect(s.phase).toBe('loaded')
    expect(s.frame).toBeNull()
    s = runtimeTransition(initialJvmRuntime(), { type: 'initFails', value: 'yes' })
    for (const type of ['load', 'verify', 'prepare', 'resolve', 'initialize'])
      s = runtimeTransition(s, { type })
    expect(s.error).toContain('ExceptionInInitializerError')
    expect(s.phase).toBe('erroneous')
    s = runtimeTransition(s, { type: 'initialize' })
    expect(s.error).toContain('NoClassDefFoundError')
    expect(s.initCount).toBe(1)
    let missing = runtimeTransition(initialJvmRuntime(), { type: 'dependency', value: 'no' })
    for (const type of ['load', 'verify', 'prepare', 'resolve'])
      missing = runtimeTransition(missing, { type })
    expect(missing.phase).toBe('prepared')
    expect(missing.error).toContain('NoClassDefFoundError')
  })
  it('lays out disjoint aligned segments and models distinct narrow and wide pointer profiles', () => {
    for (const compressed of [true, false])
      for (let ints = 1; ints <= 4; ints++)
        for (let refs = 0; refs <= 4; refs++) {
          const layout = objectLayout(ints, refs, compressed)
          expect(layout.size % 8).toBe(0)
          expect(layout.segments.reduce((sum, segment) => sum + segment.bytes, 0)).toBe(layout.size)
          for (const [i, segment] of layout.segments.entries()) {
            expect(segment.offset % segment.alignment).toBe(0)
            expect(segment.offset).toBe(
              i === 0 ? 0 : layout.segments[i - 1]!.offset + layout.segments[i - 1]!.bytes,
            )
          }
        }
    expect(objectLayout(1, 1, true).size).toBe(24)
    expect(objectLayout(1, 1, false).size).toBe(32)
  })
})

function checkHeap(s: GcState) {
  const ids = new Set(s.heap.map((object) => object.id))
  expect(ids.size).toBe(s.heap.length)
  for (const object of s.heap) for (const ref of object.refs) expect(ids.has(ref)).toBe(true)
  for (const root of Object.values(s.roots)) if (root !== null) expect(ids.has(root)).toBe(true)
  expect(s.remembered).toEqual(rememberedEdges(s.heap))
  for (const generation of ['young', 'old'] as const) {
    const objects = s.heap
      .filter((object) => object.generation === generation)
      .sort((a, b) => a.offset - b.offset)
    objects.forEach((object, i) => {
      expect(object.offset).toBeGreaterThanOrEqual(
        i === 0 ? 0 : objects[i - 1]!.offset + objects[i - 1]!.size,
      )
      expect(object.offset + object.size).toBeLessThanOrEqual(
        generation === 'young' ? s.youngCapacity : s.oldCapacity,
      )
    })
  }
}
describe('tracing, generational boundaries and promotion', () => {
  it('retains an old-to-young chain, reclaims a detached cycle, promotes survivors, then reclaims old garbage', () => {
    let s = initialGc()
    expect(planCollection(s).incoming).toEqual([{ from: 1, to: 2 }])
    s = gcTransition(s, { type: 'start-gc' })
    s = gcTransition(s, { type: 'sweep' })
    expect(s.error).toContain('前沿')
    s = gcTransition(s, { type: 'mark' })
    expect(s.gc!.marked).toEqual([2])
    expect(s.gc!.frontier).toEqual([3])
    s = gcTransition(s, { type: 'collect' })
    expect(s.lastRemoved).toEqual([4, 5])
    expect(s.heap.map((object) => object.id)).toEqual([1, 2, 3, 6])
    checkHeap(s)
    const oldOffsets = s.heap
      .filter((object) => object.generation === 'old')
      .map((object) => [object.id, object.offset])
    s = gcTransition(s, { type: 'collect' })
    expect(s.lastPromoted).toEqual([2, 3])
    expect(s.remembered).toEqual([])
    checkHeap(s)
    for (const [id, offset] of oldOffsets)
      expect(s.heap.find((object) => object.id === id)!.offset).toBe(offset)
    s = gcTransition(s, { type: 'scope', value: 'full' })
    s = gcTransition(s, { type: 'collect' })
    expect(s.lastRemoved).toEqual([6])
    checkHeap(s)
    expect(presentGc(s).goal.reached).toBe(true)
  })
  it('updates remembered edges through writes and treats retained generations conservatively', () => {
    let s = initialGc()
    s = gcTransition(s, { type: 'target', value: 2 })
    s = gcTransition(s, { type: 'unlink' })
    expect(s.remembered).toEqual([])
    s = gcTransition(s, { type: 'collect' })
    expect(s.heap.map((object) => object.id)).toEqual([1, 6])
    checkHeap(s)
    s = gcTransition(s, { type: 'set-root' })
    expect(s.error).toContain('不存在')
    const cycle: GcState = {
      ...initialGc(),
      heap: [
        { id: 1, generation: 'old', age: 2, size: 1, offset: 0, refs: [2] },
        { id: 2, generation: 'young', age: 0, size: 1, offset: 0, refs: [1] },
      ],
      roots: { stack: null, static: null, jni: null },
      remembered: [{ from: 1, to: 2 }],
      scope: 'old',
    }
    const oldOnly = gcTransition(cycle, { type: 'collect' })
    expect(oldOnly.heap).toHaveLength(2)
    const full = gcTransition({ ...cycle, scope: 'full' }, { type: 'collect' })
    expect(full.heap).toEqual([])
  })
  it('cancels failed promotion without half-applying deletion, age changes or roots', () => {
    let s = gcTransition({ ...initialGc(), oldCapacity: 4 }, { type: 'collect' })
    const before = structuredClone(s.heap)
    s = gcTransition(s, { type: 'collect' })
    expect(s.error).toContain('晋升失败')
    expect(s.heap).toEqual(before)
    expect(s.promotions).toBe(0)
    checkHeap(s)
    s = gcTransition(s, { type: 'oldCapacity', value: 6 })
    s = gcTransition(s, { type: 'scope', value: 'full' })
    s = gcTransition(s, { type: 'collect' })
    expect(s.heap).toHaveLength(3)
    expect(s.promotions).toBe(2)
    checkHeap(s)
  })
  it('matches independent root reachability over varied cyclic graphs', () => {
    let seed = 73
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed
    }
    for (let trial = 0; trial < 30; trial++) {
      const heap = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        generation: (i % 2 ? 'young' : 'old') as 'young' | 'old',
        age: 0,
        size: 1,
        offset: Math.floor(i / 2),
        refs: [...new Set([random() % 13, random() % 13])].filter((id) => id > 0),
      }))
      const roots = { stack: 1, static: (random() % 12) + 1, jni: null },
        reachable = new Set<number>(),
        queue = [roots.stack, roots.static]
      while (queue.length) {
        const id = queue.shift()!
        if (reachable.has(id)) continue
        reachable.add(id)
        queue.push(...heap.find((object) => object.id === id)!.refs)
      }
      const s = gcTransition(
        { ...initialGc(), heap, roots, remembered: rememberedEdges(heap), scope: 'full', threshold: 3 },
        { type: 'collect' },
      )
      expect(new Set(s.heap.map((object) => object.id))).toEqual(reachable)
      checkHeap(s)
    }
  })
})

describe('region evacuation and deferred reference repair', () => {
  it('chooses reclaimable regions within the live-copy budget and preserves object identity for both profiles', () => {
    for (const budget of [1, 2, 3])
      for (const profile of ['g1', 'zgc'] as const) {
        const s = { ...initialRelocation(profile), budget },
          before = reachableRegionIds(s).sort((a, b) => a - b),
          plan = chooseRegions(s)
        expect(
          plan.filter((entry) => entry.selected).reduce((sum, entry) => sum + entry.live, 0),
        ).toBeLessThanOrEqual(budget)
        const moved = relocateRegions(s)
        expect(reachableRegionIds(moved).sort((a, b) => a - b)).toEqual(before)
        expect(new Set(moved.objects.map((object) => object.address)).size).toBe(moved.objects.length)
        expect(moved.copied).toBe(budget === 3 ? 3 : 1)
        expect(moved.reclaimed).toBe(budget === 3 ? 5 : 3)
        for (const object of s.objects.filter((object) => before.includes(object.id)))
          expect(moved.objects.find((entry) => entry.id === object.id)!.value).toBe(object.value)
        expect(relocationTransition(moved, { type: 'load' }).lastRead).toBe(30)
      }
  })
  it('rejects unbarriered stale pointers and heals a field once at first use', () => {
    let s = relocateRegions(initialRelocation())
    expect(s.objects.find((object) => object.id === 1)!.refs[0]).toBe('3:0')
    expect(s.rewritten).toBe(1)
    s = relocationTransition(s, { type: 'profile', value: 'zgc' })
    s = relocationTransition(s, { type: 'relocate' })
    expect(s.objects.find((object) => object.id === 1)!.refs[0]).toBe('1:0')
    expect(s.rewritten).toBe(0)
    s = relocationTransition(s, { type: 'barrier', value: 'off' })
    s = relocationTransition(s, { type: 'load' })
    expect(s.error).toContain('旧引用')
    expect(s.lastRead).toBeNull()
    s = relocationTransition(s, { type: 'barrier', value: 'on' })
    s = relocationTransition(s, { type: 'load' })
    expect(s.lastRead).toBe(30)
    expect(s.barrierFixes).toBe(1)
    s = relocationTransition(s, { type: 'load' })
    expect(s.barrierFixes).toBe(1)
    expect(presentRelocation(s).goal.reached).toBe(true)
    expect(resolveForwarding('a', { a: 'b', b: 'c' })).toBe('c')
    expect(() => resolveForwarding('a', { a: 'b', b: 'a' })).toThrow('cycle')
  })
})

describe('JIT specialization, escape analysis and safepoint polling', () => {
  it('returns identical results while scalar replacement removes logical allocations only for nonescaping objects', () => {
    for (const count of [1, 5, 20])
      for (const shape of ['Point', 'ColoredPoint'] as const) {
        const runs = [
          evaluatePoints(count, shape, false, false),
          evaluatePoints(count, shape, true, false),
          evaluatePoints(count, shape, true, true),
        ]
        expect(runs.map((run) => run.result)).toEqual(
          Array(3).fill((count * (count + 1)) / 2 + (shape === 'ColoredPoint' ? 10 * count : 0)),
        )
        expect(runs.map((run) => run.allocations)).toEqual([count, 0, count])
        expect(runs.map((run) => run.fieldReads)).toEqual([2 * count, 0, 2 * count])
      }
  })
  it('warms up, pauses only at a poll, resumes correctly and deoptimizes an invalid receiver assumption', () => {
    let s = initialJit()
    const act = (type: string, value?: string | number) => {
      s = jitTransition(s, { type, value })
    }
    for (let call = 0; call < 3; call++) {
      act('begin')
      act('run')
    }
    expect(s.calls).toBe(3)
    expect(s.compiledFor).toBe('Point')
    expect(s.heap).toHaveLength(15)
    act('begin')
    act('request')
    expect(s.frame!.paused).toBe(false)
    act('step')
    act('step')
    expect(s.frame!.paused).toBe(false)
    expect(s.frame!.index).toBe(2)
    act('step')
    expect(s.frame!.paused).toBe(true)
    expect(s.pollRoots).toEqual([])
    expect(s.calls).toBe(3)
    act('resume')
    act('run')
    expect(s.last!.result).toBe(15)
    expect(s.last!.allocations).toBe(0)
    expect(s.heap).toHaveLength(15)
    act('shape', 'ColoredPoint')
    act('begin')
    expect(s.deopts).toBe(1)
    act('run')
    expect(s.last!.result).toBe(65)
    expect(s.last!.allocations).toBe(5)
    expect(s.compiledFor).toBeNull()
    act('compare')
    expect(presentJit(s).goal.reached).toBe(true)
  })
  it('keeps real escaped identities and exposes reference slots at a safepoint', () => {
    let s = jitTransition(initialJit(), { type: 'escaping', value: 'escape' })
    for (let i = 0; i < 3; i++) {
      s = jitTransition(s, { type: 'begin' })
      s = jitTransition(s, { type: 'run' })
    }
    s = jitTransition(s, { type: 'begin' })
    s = jitTransition(s, { type: 'request' })
    s = jitTransition(s, { type: 'run' })
    expect(s.frame!.scalar).toBe(false)
    expect(s.frame!.paused).toBe(true)
    expect(s.pollRoots).toEqual([18])
    expect(s.escaped).toHaveLength(18)
    s = jitTransition(s, { type: 'resume' })
    s = jitTransition(s, { type: 'run' })
    expect(s.last!.allocations).toBe(5)
  })
})
