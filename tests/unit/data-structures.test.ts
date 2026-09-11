import { describe, expect, it } from 'vitest'
import {
  editLinear,
  initialLinear,
  linearTransition,
  linearValues,
  makeStorage,
  type LinearStorage,
} from '../../src/experiments/models/linear-storage'
import { initialQueue, queueTransition, queueValues } from '../../src/experiments/models/stack-queue'
import { hashIndex, hashTransition, initialHash, probeHash } from '../../src/experiments/models/hash-table'
import {
  deleteBst,
  findBst,
  heapInsert,
  heapRemove,
  insertBst,
  type Bst,
} from '../../src/experiments/models/trees-heaps'

describe('arrays and linked lists', () => {
  it('separates locating the predecessor from changing its links', () => {
    const values = [10, 20, 30, 40]
    expect(editLinear(makeStorage('array', values), 'insert', 0, 25)).toMatchObject({ reads: 4, writes: 5 })
    expect(editLinear(makeStorage('linked', values), 'insert', 0, 25)).toMatchObject({ reads: 0, writes: 2 })
    expect(editLinear(makeStorage('linked', values), 'insert', 3, 25)).toMatchObject({ reads: 3, writes: 2 })
    expect(editLinear(makeStorage('array', values), 'read', 3)).toMatchObject({ reads: 1, result: 40 })
    expect(editLinear(makeStorage('linked', values), 'read', 3)).toMatchObject({ reads: 4, result: 40 })
  })
  it.each(['array', 'linked'] as const)(
    '%s preserves order and handles head, tail and empty boundaries',
    (kind) => {
      let storage: LinearStorage = makeStorage(kind, [])
      const reference: number[] = []
      for (let i = 0; i < 80; i++) {
        const snapshot = structuredClone(storage)
        if (i % 3 !== 2 || !reference.length) {
          const index = i % (reference.length + 1)
          const result = editLinear(storage, 'insert', index, i)!
          reference.splice(index, 0, i)
          expect(storage).toEqual(snapshot)
          storage = result.storage
        } else {
          const index = i % reference.length,
            removed = reference.splice(index, 1)[0]
          const result = editLinear(storage, 'delete', index)!
          expect(result.result).toBe(removed)
          storage = result.storage
        }
        expect(linearValues(storage)).toEqual(reference)
        if (storage.kind === 'linked') {
          expect(storage.nodes).toHaveLength(reference.length)
          expect(new Set(storage.nodes.map((node) => node.id)).size).toBe(reference.length)
          for (const node of storage.nodes)
            if (node.next !== null) expect(storage.nodes.some((n) => n.id === node.next)).toBe(true)
        }
      }
      while (reference.length) {
        reference.shift()
        storage = editLinear(storage, 'delete', 0)!.storage
      }
      expect(linearValues(storage)).toEqual([])
      expect(editLinear(storage, 'read', 0)).toBeNull()
      expect(linearValues(editLinear(storage, 'insert', 0, 9)!.storage)).toEqual([9])
    },
  )
  it('compares without modifying the live sequence and preserves old snapshots', () => {
    const s = initialLinear(),
      snapshot = structuredClone(s)
    const compared = linearTransition(s, { type: 'compare' })
    expect(compared.storage).toEqual(s.storage)
    expect(compared.comparison).toHaveLength(2)
    expect(s).toEqual(snapshot)
    expect(editLinear(s.storage, 'insert', -1, 0)).toBeNull()
  })
})

describe('bounded ring structures', () => {
  it.each(['stack', 'queue', 'deque'] as const)(
    '%s agrees with its abstract ordering rules across many wraps',
    (kind) => {
      let s = initialQueue(kind, 5)
      const reference: number[] = []
      let random = 314159
      for (let i = 0; i < 150; i++) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0
        const operations =
          kind === 'stack'
            ? ['push-back', 'pop-back']
            : kind === 'queue'
              ? ['push-back', 'pop-front']
              : ['push-back', 'pop-front', 'push-front', 'pop-back']
        const action = operations[(random >>> 16) % operations.length]!
        const value = i % 99
        s = queueTransition(s, { type: 'value', value })
        const snapshot = structuredClone(s)
        const result = queueTransition(s, { type: action })
        expect(s).toEqual(snapshot)
        if (action.startsWith('push') && reference.length < s.capacity) {
          if (action === 'push-front') reference.unshift(value)
          else reference.push(value)
        } else if (action.startsWith('pop') && reference.length) {
          const removed = action === 'pop-front' ? reference.shift() : reference.pop()
          expect(result.removed).toBe(removed)
        }
        s = result
        expect(queueValues(s)).toEqual(reference)
        expect(s.slots.filter((slot) => slot !== null)).toHaveLength(reference.length)
        expect(s.size).toBe(reference.length)
        expect(s.head).toBeGreaterThanOrEqual(0)
        expect(s.head).toBeLessThan(s.capacity)
      }
    },
  )
  it('distinguishes full and empty with equal pointers and reuses a freed slot', () => {
    let s = initialQueue('queue', 2)
    s = queueTransition(s, { type: 'push-back' })
    s = queueTransition(s, { type: 'value', value: 20 })
    s = queueTransition(s, { type: 'push-back' })
    expect(s.size).toBe(2)
    expect((s.head + s.size) % s.capacity).toBe(s.head)
    s = queueTransition(s, { type: 'pop-front' })
    expect(s.removed).toBe(10)
    s = queueTransition(s, { type: 'value', value: 30 })
    s = queueTransition(s, { type: 'push-back' })
    expect(queueValues(s)).toEqual([20, 30])
    expect(s.slots).toEqual([30, 20])
    expect(s.reused).toBe(true)
    s = queueTransition(queueTransition(s, { type: 'pop-front' }), { type: 'pop-front' })
    expect(s.size).toBe(0)
    expect((s.head + s.size) % s.capacity).toBe(s.head)
  })
})

describe('linear-probing hash table', () => {
  it('crosses tombstones, updates existing keys beyond them and cleans up on resize', () => {
    let s = hashTransition(initialHash(), { type: 'insert' })
    s = hashTransition(s, { type: 'key', value: 1 })
    s = hashTransition(s, { type: 'delete' })
    expect(s.slots[1]!.state).toBe('deleted')
    s = hashTransition(s, { type: 'key', value: 8 })
    s = hashTransition(s, { type: 'find' })
    expect(s.path).toEqual([1, 2])
    expect(s.crossedDeleted).toBe(true)
    s = hashTransition(s, { type: 'value', value: 88 })
    s = hashTransition(s, { type: 'insert' })
    expect(s.slots.filter((slot) => slot.state === 'occupied')).toEqual([
      { state: 'occupied', key: 8, value: 88 },
    ])
    s = hashTransition(s, { type: 'resize' })
    expect(s.slots[8]).toEqual({ state: 'occupied', key: 8, value: 88 })
    expect(s.slots.some((slot) => slot.state === 'deleted')).toBe(false)
    expect(hashIndex(-1, 7)).toBe(6)
  })
  it('matches a reference map across collisions, full tables, negative keys and rehashing', () => {
    let s = initialHash()
    const reference = new Map([[1, 10]])
    let random = 123456
    for (let i = 0; i < 200; i++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      const key = ((random >>> 16) % 17) - 8,
        value = i % 99
      s = hashTransition(hashTransition(s, { type: 'key', value: key }), { type: 'value', value })
      const operation = i % 7 === 0 ? 'delete' : 'insert'
      if (operation === 'delete') reference.delete(key)
      else if (reference.has(key) || reference.size < s.slots.length) reference.set(key, value)
      s = hashTransition(s, { type: operation })
      if (i === 80) s = hashTransition(s, { type: 'resize' })
      const entries = s.slots.flatMap((slot) =>
        slot.state === 'occupied' ? [[slot.key, slot.value] as const] : [],
      )
      expect(new Map(entries)).toEqual(reference)
      expect(entries.length).toBe(reference.size)
      for (let query = -9; query <= 9; query++) {
        const probe = probeHash(s.slots, query)
        expect(probe.path.length).toBeLessThanOrEqual(s.slots.length)
        expect(probe.found !== null).toBe(reference.has(query))
      }
    }
  })
})

function checkBst(tree: Bst, reference: Set<number>) {
  const seen = new Set<number>(),
    order: number[] = []
  const visit = (id: number | null, min = -Infinity, max = Infinity) => {
    if (id === null) return
    expect(seen.has(id)).toBe(false)
    seen.add(id)
    const node = tree.nodes.find((n) => n.id === id)!
    expect(node).toBeDefined()
    expect(node.key).toBeGreaterThan(min)
    expect(node.key).toBeLessThan(max)
    visit(node.left, min, node.key)
    order.push(node.key)
    visit(node.right, node.key, max)
  }
  visit(tree.root)
  expect(order).toEqual([...reference].sort((a, b) => a - b))
  expect(seen.size).toBe(tree.nodes.length)
}
describe('BST and min heap invariants', () => {
  it('maintains all descendant bounds through insertions and two-child deletions', () => {
    let tree: Bst = { root: null, nextId: 0, nodes: [] }
    const reference = new Set<number>()
    const keys = [40, 20, 60, 10, 30, 50, 70, 45, 55, 52, 53]
    for (const key of keys) {
      const snapshot = structuredClone(tree)
      const result = insertBst(tree, key)
      expect(tree).toEqual(snapshot)
      tree = result.tree
      reference.add(key)
      checkBst(tree, reference)
    }
    for (const key of [40, 60, 20, 10, 30, 50, 70, 45, 55, 52, 53]) {
      tree = deleteBst(tree, key).tree
      reference.delete(key)
      checkBst(tree, reference)
      expect(findBst(tree, key).found).toBeNull()
    }
    expect(tree.root).toBeNull()
    expect(insertBst(insertBst(tree, 1).tree, 1).changed).toBe(false)
  })
  it('returns the current minimum after varied heap insertions, including duplicates', () => {
    let heap: number[] = [],
      reference: number[] = []
    for (let i = 0; i < 150; i++) {
      if (i % 3 !== 2) {
        const key = ((i * 17) % 31) - 15
        heap = heapInsert(heap, key).values
        reference.push(key)
      } else {
        reference.sort((a, b) => a - b)
        const result = heapRemove(heap)
        expect(result.removed).toBe(reference.shift())
        heap = result.values
      }
      expect([...heap].sort((a, b) => a - b)).toEqual([...reference].sort((a, b) => a - b))
      heap.forEach((key, index) => {
        if (index) expect(heap[Math.floor((index - 1) / 2)]!).toBeLessThanOrEqual(key)
      })
    }
    reference = reference.sort((a, b) => a - b)
    while (heap.length) {
      const result = heapRemove(heap)
      expect(result.removed).toBe(reference.shift())
      heap = result.values
    }
    expect(heapRemove(heap).removed).toBeNull()
  })
})
