import { describe, expect, it } from 'vitest'
import { allKeys, allNodes, createBPlus, deleteBPlus, insertBPlus, minimum, rangeBPlus, searchBPlus } from '../../src/experiments/structures/bplus-tree'
import type { BPlusNode, BPlusTree } from '../../src/experiments/structures/bplus-tree'
import { initialBtree, transitionBtree, presentBtree } from '../../src/experiments/models/btree'

function assertTree(tree: BPlusTree, expected: number[]) {
  const depths = new Set<number>()
  const leaves: BPlusNode[] = []
  const check = (n: BPlusNode, depth: number, root: boolean) => {
    expect(n.keys).toEqual([...n.keys].sort((a, b) => a - b))
    expect(n.keys.length).toBeLessThanOrEqual(3)
    if (n.leaf) {
      depths.add(depth)
      leaves.push(n)
      expect(n.children).toEqual([])
      if (!root) expect(n.keys.length).toBeGreaterThanOrEqual(2)
    } else {
      expect(n.children.length).toBe(n.keys.length + 1)
      expect(n.children.length).toBeGreaterThanOrEqual(2)
      expect(n.children.length).toBeLessThanOrEqual(4)
      expect(n.keys).toEqual(n.children.slice(1).map(minimum))
      n.children.forEach(c => check(c, depth + 1, false))
    }
  }
  check(tree.root, 0, true)
  expect(depths.size).toBe(1)
  expect(allKeys(tree)).toEqual([...expected].sort((a, b) => a - b))
  for (let i = 0; i < leaves.length; i++) expect(leaves[i]!.next).toBe(leaves[i + 1]?.id ?? null)
  expect(new Set(allNodes(tree).map(n => n.id)).size).toBe(allNodes(tree).length)
}
function shuffled(seed: number, count: number) {
  const list = Array.from({ length: count }, (_, i) => i)
  for (let i = count - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const j = seed % (i + 1)
    ;[list[i], list[j]] = [list[j]!, list[i]!]
  }
  return list
}
describe('B+Tree structural invariants', () => {
  it('splits leaves and internal nodes while retaining all records and leaf links', () => {
    const tree = createBPlus(Array.from({ length: 64 }, (_, i) => i))
    assertTree(tree, Array.from({ length: 64 }, (_, i) => i))
    for (let key = 0; key < 64; key++) {
      const result = searchBPlus(tree, key)
      expect(result.found).toBe(true)
      expect(result.leaf.leaf).toBe(true)
      expect(result.path.length).toBeGreaterThan(1)
    }
    expect(searchBPlus(tree, 999).found).toBe(false)
  })
  it('treats duplicate and missing keys as no-op mutations', () => {
    const original = createBPlus([10, 20, 30])
    expect(insertBPlus(original, 20).changed).toBe(false)
    expect(deleteBPlus(original, 99).changed).toBe(false)
    expect(allKeys(original)).toEqual([10, 20, 30])
  })
  it('preserves balance, separators and leaf chains after every seeded insertion and deletion', () => {
    let sawBorrow = false
    for (const seed of [1, 3, 42, 51, 97, 123]) {
      let tree = createBPlus()
      let keys: number[] = []
      for (const key of shuffled(seed, 64)) {
        const result = insertBPlus(tree, key)
        tree = result.tree
        keys.push(key)
        assertTree(tree, keys)
      }
      for (const key of shuffled(seed + 10, 64)) {
        const result = deleteBPlus(tree, key)
        sawBorrow ||= result.events.some(e => e.type === 'borrow')
        tree = result.tree
        keys = keys.filter(k => k !== key)
        assertTree(tree, keys)
      }
      expect(tree.root.leaf).toBe(true)
      expect(tree.root.keys).toEqual([])
    }
    expect(sawBorrow).toBe(true)
  })
  it('range-scans across linked leaves after merges', () => {
    let tree = createBPlus(Array.from({ length: 30 }, (_, i) => i * 3))
    for (const key of [6, 12, 15, 24, 30]) tree = deleteBPlus(tree, key).tree
    expect(rangeBPlus(tree, 10, 45).values).toEqual(allKeys(tree).filter(k => k >= 10 && k <= 45))
    expect(rangeBPlus(tree, 50, 10).values).toEqual([])
  })
  it('lets the guided experiment genuinely trigger split, search and merge', () => {
    let s = initialBtree()
    s = transitionBtree(s, { type: 'example' })
    s = transitionBtree(s, { type: 'example' })
    expect(s.splits).toBeGreaterThan(0)
    expect(s.key).toBe(15)
    s = transitionBtree(s, { type: 'search' })
    expect(s.found).toBe(15)
    s = transitionBtree(s, { type: 'delete' })
    expect(s.merges).toBeGreaterThan(0)
    expect(presentBtree(s).goal.reached).toBe(true)
    assertTree(s.tree, [5, 10, 20, 30, 40, 50, 60, 70, 80])
  })
})
