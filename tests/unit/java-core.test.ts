import { describe, expect, it } from 'vitest'
import {
  initialJavaObjects,
  objectsTransition,
  presentJavaObjects,
  reachableBoxes,
} from '../../src/experiments/models/java-objects'
import {
  classesTransition,
  initialJavaClasses,
  presentJavaClasses,
} from '../../src/experiments/models/java-classes'
import {
  collectionsTransition,
  initialJavaCollections,
  javaBucket,
  javaStringHash,
  presentJavaCollections,
  putJavaMap,
  type JavaMapEntry,
} from '../../src/experiments/models/java-collections'
import {
  happensBefore,
  initialJmm,
  jmmTransition,
  presentJmm,
  publicationEdges,
  publicationOutcomes,
} from '../../src/experiments/models/java-memory-model'
import {
  compareJavaApis,
  initialJavaIo,
  javaIoTransition,
  presentJavaIo,
} from '../../src/experiments/models/java-io-apis'

describe('Java object references and stack frames', () => {
  it('copies argument references, shares field mutations, and confines reassignment to the callee', () => {
    let s = initialJavaObjects()
    const act = (type: string, value?: string | number) => {
      s = objectsTransition(s, { type, value })
    }
    act('allocate')
    act('alias')
    act('call')
    act('value', 20)
    act('mutate')
    expect(s.heap).toEqual([{ id: 1, className: 'Box', value: 20 }])
    expect(s.stack[0]!.refs).toEqual({ a: 1, b: 1 })
    act('value', 30)
    act('rebind')
    expect(s.stack[1]!.refs.p).toBe(2)
    expect(s.stack[0]!.refs.a).toBe(1)
    act('return')
    expect(reachableBoxes(s)).toEqual([1])
    expect(s.heap).toHaveLength(2)
    expect(presentJavaObjects(s).goal.reached).toBe(true)
    act('clear')
    expect(reachableBoxes(s)).toEqual([1])
    act('selected', 'b')
    act('clear')
    expect(reachableBoxes(s)).toEqual([])
    expect(s.heap).toHaveLength(2)
  })
  it('rejects null dereferences and prevents the paused caller from mutating local variables', () => {
    const base = initialJavaObjects(),
      failed = objectsTransition(base, { type: 'mutate' })
    expect(failed.error).toContain('NullPointerException')
    expect(base.error).toBeNull()
    let s = objectsTransition(objectsTransition(base, { type: 'allocate' }), { type: 'call' })
    s = objectsTransition(s, { type: 'selected', value: 'a' })
    s = objectsTransition(s, { type: 'clear' })
    expect(s.error).toContain('main')
    expect(s.stack[0]!.refs.a).toBe(1)
  })
})

describe('loader identity and reflection exception propagation', () => {
  it('separates class loading from one-time initialization and shares delegated definitions', () => {
    let s = initialJavaClasses()
    const act = (type: string, value?: string | number) => {
      s = classesTransition(s, { type, value })
    }
    act('selected', 'Plugin')
    act('load')
    act('inspect')
    expect(s.classes).toEqual([
      { id: 'App::demo.Counter', definingLoader: 'App', initialized: false, initCount: 0 },
    ])
    act('new')
    act('new')
    act('cast')
    expect(s.sharedType).toBe(true)
    expect(s.classes[0]!.initCount).toBe(1)
    act('selected', 'App')
    act('load')
    expect(s.classes).toHaveLength(1)
    act('delegation', 'local')
    act('selected', 'Plugin')
    act('new')
    act('cast')
    expect(s.error).toContain('ClassCastException')
    expect(s.classes).toHaveLength(2)
    expect(s.classes.find((klass) => klass.definingLoader === 'App')!.initialized).toBe(false)
    act('invoke')
    expect(s.exception!.type).toBe('ArithmeticException')
    expect(s.finallyRuns).toBe(0)
    act('unwind')
    expect(s.finallyRuns).toBe(1)
    expect(s.stack).toHaveLength(2)
    act('unwind')
    expect(s.exception).toEqual({ type: 'InvocationTargetException', cause: 'ArithmeticException' })
    act('unwind')
    expect(s.stack).toEqual(['main'])
    expect(s.exception).toBeNull()
    expect(s.instances[0]!.value).toBe(10)
    expect(presentJavaClasses(s).goal.reached).toBe(true)
  })
  it('distinguishes method lookup errors from successful invocation and target exceptions', () => {
    let s = classesTransition(initialJavaClasses(), { type: 'new' })
    s = classesTransition(s, { type: 'method', value: 'missing' })
    s = classesTransition(s, { type: 'invoke' })
    expect(s.error).toContain('NoSuchMethodException')
    expect(s.exception).toBeNull()
    expect(s.finallyRuns).toBe(0)
    s = classesTransition(s, { type: 'method', value: 'divide' })
    s = classesTransition(s, { type: 'argument', value: 3 })
    s = classesTransition(s, { type: 'invoke' })
    expect(s.instances[0]!.value).toBe(3)
    expect(s.finallyRuns).toBe(1)
  })
})

describe('Java collection algorithms and erased generic checks', () => {
  it('computes Java UTF-16 hashes, preserves colliding keys across repeated resize and replacement', () => {
    for (const key of ['Aa', 'BB', '你好', '🙂', 'longer string with overflow']) {
      let expected = 0n
      for (let i = 0; i < key.length; i++)
        expected = BigInt.asIntN(32, expected * 31n + BigInt(key.charCodeAt(i)))
      expect(javaStringHash(key)).toBe(Number(expected))
    }
    expect(javaStringHash('Aa')).toBe(2112)
    expect(javaStringHash('BB')).toBe(2112)
    let buckets: JavaMapEntry[][] = Array.from({ length: 4 }, () => [])
    const oracle = new Map<string, string>()
    for (const [i, key] of [
      'Aa',
      'BB',
      ...Array.from({ length: 20 }, (_, i) => `K${i}`),
      'Aa',
      'BB',
    ].entries()) {
      oracle.set(key, String(i))
      buckets = putJavaMap(buckets, key, { type: 'String', value: String(i) }).buckets
      expect(new Map(buckets.flat().map((entry) => [entry.key, entry.value.value]))).toEqual(oracle)
      buckets.forEach((bucket, slot) =>
        bucket.forEach((entry) => expect(javaBucket(entry.key, buckets.length)).toBe(slot)),
      )
    }
    expect(buckets.length).toBe(32)
  })
  it('grows a List, rejects typed pollution, then exposes raw pollution at the cast on read', () => {
    let s = initialJavaCollections()
    const act = (type: string, value?: string | number) => {
      s = collectionsTransition(s, { type, value })
    }
    act('add')
    act('add')
    act('add')
    expect(s.capacity).toBe(3)
    expect(s.moves).toBe(2)
    act('type', 'Integer')
    act('draft', '7')
    act('add')
    expect(s.list).toHaveLength(3)
    expect(s.error).toContain('泛型检查')
    act('raw', 'raw')
    act('add')
    act('index', 3)
    act('get')
    expect(s.error).toContain('ClassCastException')
    expect(s.list[3]).toEqual({ type: 'Integer', value: 7 })
    act('container', 'map')
    act('type', 'String')
    act('key', 'Aa')
    act('add')
    act('key', 'BB')
    act('add')
    expect(s.collisions).toBe(1)
    expect(presentJavaCollections(s).goal.reached).toBe(true)
    act('container', 'list')
    act('index', 1)
    act('remove')
    expect(s.list.map((entry) => entry.value)).toEqual(['A', 'A', 7])
    expect(s.capacity).toBe(4)
  })
  it('detects structural modification while map replacement and Set duplicates preserve iterator validity', () => {
    let s = collectionsTransition(initialJavaCollections(), { type: 'container', value: 'map' })
    s = collectionsTransition(s, { type: 'add' })
    s = collectionsTransition(s, { type: 'iterator' })
    s = collectionsTransition(s, { type: 'draft', value: 'replacement' })
    s = collectionsTransition(s, { type: 'add' })
    s = collectionsTransition(s, { type: 'next' })
    expect(s.error).toBeNull()
    expect(s.result).toBe('Aa')
    s = collectionsTransition(s, { type: 'key', value: 'BB' })
    s = collectionsTransition(s, { type: 'add' })
    s = collectionsTransition(s, { type: 'next' })
    expect(s.error).toContain('ConcurrentModificationException')
    s = collectionsTransition(s, { type: 'container', value: 'set' })
    s = collectionsTransition(s, { type: 'add' })
    s = collectionsTransition(s, { type: 'iterator' })
    s = collectionsTransition(s, { type: 'add' })
    s = collectionsTransition(s, { type: 'next' })
    expect(s.error).toBeNull()
    expect(s.set.flat()).toHaveLength(1)
  })
})

describe('JMM release/acquire publication litmus', () => {
  it('connects program order transitively only when a volatile read observes the publication', () => {
    expect(happensBefore(publicationEdges('plain', true), 'Wdata', 'Rdata')).toBe(false)
    expect(happensBefore(publicationEdges('volatile', false), 'Wdata', 'Rdata')).toBe(false)
    expect(happensBefore(publicationEdges('volatile', true), 'Wdata', 'Rdata')).toBe(true)
    expect(new Set(publicationOutcomes('plain').map((o) => `${o.flag}/${o.data}`))).toEqual(
      new Set(['false/null', 'true/0', 'true/42']),
    )
    expect(new Set(publicationOutcomes('volatile').map((o) => `${o.flag}/${o.data}`))).toEqual(
      new Set(['false/null', 'true/42']),
    )
  })
  it('allows a racy old-value witness and forbids that witness after synchronized publication', () => {
    let s = initialJmm()
    const act = (type: string, value?: string) => {
      s = jmmTransition(s, { type, value })
    }
    act('write-data')
    act('write-flag')
    act('read-flag')
    act('read-data')
    expect(s.dataRead).toBe(0)
    act('mode', 'volatile')
    act('write-data')
    act('write-flag')
    act('read-flag')
    act('read-data')
    expect(s.error).toContain('happens-before')
    expect(s.dataRead).toBeNull()
    expect(s.events).not.toContain('Rdata')
    act('source', 'writer')
    act('read-data')
    expect(s.dataRead).toBe(42)
    act('compare')
    expect(presentJmm(s).goal.reached).toBe(true)
    let early = jmmTransition(initialJmm('volatile'), { type: 'read-flag' })
    early = jmmTransition(early, { type: 'read-data' })
    expect(early.flagRead).toBe(false)
    expect(early.dataRead).toBeNull()
  })
})

describe('Java byte, char and channel input interfaces', () => {
  it('reads identical input to EOF with explicit byte and UTF-16 units across chunk boundaries', () => {
    for (const text of ['', 'ABC', 'A中🙂B', 'é漢𠮷'])
      for (const count of [1, 2, 4]) {
        const results = compareJavaApis(text, count),
          bytes = [...new TextEncoder().encode(text)]
        const expectedBytes = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
        const expectedChars = Array.from({ length: text.length }, (_, i) =>
          text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'),
        ).join(' ')
        expect(results.map((result) => result.output)).toEqual([expectedBytes, expectedChars, expectedBytes])
        expect(results.map((result) => result.units)).toEqual([bytes.length, text.length, bytes.length])
        expect(results.every((result) => result.eof)).toBe(true)
        expect(results[0]!.calls).toBe(Math.ceil(bytes.length / count) + 1)
      }
    expect(() => initialJavaIo('\uD800')).toThrow('代理项')
  })
  it('preserves unread bytes through compact and distinguishes full buffers, EOF and closed input', () => {
    let s = javaIoTransition(initialJavaIo('A中🙂B', 4), { type: 'api', value: 'channel' })
    const act = (type: string, value?: string | number) => {
      s = javaIoTransition(s, { type, value })
    }
    act('read')
    expect(s.position).toBe(4)
    act('read')
    expect(s.last).toBe('0')
    expect(s.eof.channel).toBe(false)
    act('flip')
    act('count', 1)
    act('get')
    expect(s.channelOutput).toEqual([65])
    act('compact')
    expect(s.position).toBe(3)
    expect(s.buffer.slice(0, 3)).toEqual([0xe4, 0xb8, 0xad])
    act('read')
    expect(s.channelAt).toBe(5)
    act('flip')
    act('count', 4)
    act('get')
    expect(s.channelOutput).toEqual([65, 0xe4, 0xb8, 0xad, 0xf0])
    act('close')
    act('read')
    expect(s.error).toContain('ClosedChannelException')
    act('clear')
    expect(s.buffer[0]).toBe(0xe4)
    act('api', 'stream')
    act('read')
    act('api', 'reader')
    act('read')
    act('compare')
    expect(presentJavaIo(s).goal.reached).toBe(true)
  })
})
