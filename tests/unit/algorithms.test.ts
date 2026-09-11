import { describe, expect, it } from 'vitest'
import { initialSearch, searchStep, searchTransition } from '../../src/experiments/models/search'
import {
  initialSorting,
  isStableOrder,
  sortingTransition,
  sortTrace,
} from '../../src/experiments/models/sorting'
import {
  graphPath,
  graphEngine,
  graphPathCost,
  graphStep,
  graphTransition,
  initialGraph,
  parseEdges,
  runGraph,
  vertices,
} from '../../src/experiments/models/graph'
import {
  coinSolution,
  initialOptimization,
  optimizationStep,
  optimizationTransition,
  runOptimization,
} from '../../src/experiments/models/optimization'

describe('lower_bound binary search', () => {
  it('maintains both excluded regions and returns the first legal insertion position', () => {
    for (let length = 1; length <= 24; length++) {
      const values = Array.from({ length }, (_, i) => Math.floor(i / 3) - 3)
      for (let target = -5; target <= 9; target++) {
        let s = initialSearch(values.join(' '), target)
        while (!s.done) {
          const width = s.hi - s.lo,
            snapshot = structuredClone(s)
          const next = searchStep(s)
          expect(s).toEqual(snapshot)
          s = next
          expect(s.hi - s.lo).toBeLessThan(width)
          expect(values.slice(0, s.lo).every((v) => v < target)).toBe(true)
          expect(values.slice(s.hi).every((v) => v >= target)).toBe(true)
        }
        const expected = values.findIndex((v) => v >= target)
        expect(s.lo).toBe(expected < 0 ? values.length : expected)
        expect(s.comparisons).toBeLessThanOrEqual(Math.ceil(Math.log2(values.length + 1)))
        expect(searchStep(s)).toBe(s)
      }
    }
  })
  it('rejects unsorted input and recovers without reusing the previous search', () => {
    const s = searchTransition(initialSearch(), { type: 'run' })
    expect(s.lo).toBe(1)
    const invalid = searchTransition(s, { type: 'values', value: '3 1 2' })
    expect(invalid.error).toBeTruthy()
    expect(searchStep(invalid)).toBe(invalid)
    const recovered = searchTransition(invalid, { type: 'values', value: '1 2 3' })
    expect(recovered).toMatchObject({ lo: 0, hi: 3, done: false, error: null })
  })
})

describe('sorting traces', () => {
  it('sorts arbitrary duplicate and negative values without losing any record identity', () => {
    for (let seed = 0; seed < 12; seed++) {
      const values = Array.from({ length: seed + 1 }, (_, i) => ((i * 7 + seed * i * i) % 11) - 5)
      for (const algorithm of ['insertion', 'selection', 'merge'] as const) {
        const frames = sortTrace(values, algorithm),
          final = frames.at(-1)!
        expect(final.items.map((item) => item.value)).toEqual([...values].sort((a, b) => a - b))
        for (const frame of frames)
          expect(frame.items.map((item) => item.id).sort((a, b) => a - b)).toEqual(values.map((_, i) => i))
        if (algorithm !== 'selection') expect(isStableOrder(final.items)).toBe(true)
      }
    }
  })
  it('exposes selection instability and counts actual comparisons and writes', () => {
    expect(
      sortTrace([2, 2, 1], 'selection')
        .at(-1)!
        .items.map((item) => item.id),
    ).toEqual([2, 1, 0])
    expect(
      sortTrace([2, 2, 1], 'merge')
        .at(-1)!
        .items.map((item) => item.id),
    ).toEqual([2, 0, 1])
    const reverse = [7, 6, 5, 4, 3, 2, 1]
    expect(sortTrace(reverse, 'insertion').at(-1)).toMatchObject({ comparisons: 21, writes: 42 })
    expect(sortTrace([...reverse].reverse(), 'insertion').at(-1)).toMatchObject({ comparisons: 6, writes: 0 })
    expect(sortTrace(reverse, 'selection').at(-1)!.comparisons).toBe(21)
    const merge = sortTrace([1, 3, 2, 4], 'merge')
    expect(merge.find((frame) => frame.detail.startsWith('合并 [0,2)'))?.active).toEqual([0, 2])
  })
  it('uses the original input for comparisons, isolates state and rejects malformed values', () => {
    const initial = initialSorting(),
      snapshot = structuredClone(initial)
    const run = sortingTransition(initial, { type: 'run' })
    const compared = sortingTransition(run, { type: 'compare' })
    expect(initial).toEqual(snapshot)
    expect(compared.comparison[0]!.comparisons).toBe(run.frames.at(-1)!.comparisons)
    const invalid = sortingTransition(compared, { type: 'values', value: '1 2 nope' })
    expect(sortingTransition(invalid, { type: 'run' })).toBe(invalid)
    expect(sortingTransition(invalid, { type: 'values', value: '3 2 1' })).toMatchObject({
      cursor: 0,
      comparison: [],
      error: null,
    })
  })
})

describe('graph traversal and shortest paths', () => {
  it('separates minimum hops from minimum weight and maintains DFS parent chains', () => {
    const bfs = runGraph(initialGraph('bfs'))
    const dfs = runGraph(initialGraph('dfs'))
    const dijkstra = runGraph(initialGraph('dijkstra'))
    expect(graphPath(bfs)).toEqual(['A', 'B', 'C', 'F'])
    expect(graphPathCost(bfs, graphPath(bfs))).toBe(9)
    expect(graphPath(dijkstra)).toEqual(['A', 'D', 'B', 'C', 'F'])
    expect(dijkstra.distance.F).toBe(8)
    expect(dfs.visited).toEqual(['A', 'B', 'C', 'E', 'D', 'F'])
    expect(graphPath(dfs)).toEqual(['A', 'B', 'C', 'E', 'F'])
    expect(dfs.frontier).toEqual([])
  })
  it('agrees with an independent Floyd–Warshall oracle for zero-weight, directed and disconnected graphs', () => {
    for (const directed of [false, true])
      for (let seed = 1; seed <= 8; seed++) {
        const tokens: string[] = []
        for (let a = 0; a < 6; a++)
          for (let b = directed ? 0 : a + 1; b < 6; b++)
            if (a !== b && (a * 7 + b * 11 + seed) % 3 === 0)
              tokens.push(`${vertices[a]}-${vertices[b]}:${(a + b * seed) % 7}`)
        const draft = tokens.join(' '),
          base = initialGraph('dijkstra', draft, directed)
        const distances = Array.from({ length: 6 }, (_, i) =>
          Array.from({ length: 6 }, (_, j) => (i === j ? 0 : Infinity)),
        )
        for (const edge of base.edges) {
          const a = vertices.indexOf(edge.from),
            b = vertices.indexOf(edge.to)
          distances[a]![b] = edge.weight
          if (!directed) distances[b]![a] = edge.weight
        }
        for (let k = 0; k < 6; k++)
          for (let i = 0; i < 6; i++)
            for (let j = 0; j < 6; j++)
              distances[i]![j] = Math.min(distances[i]![j]!, distances[i]![k]! + distances[k]![j]!)
        for (let start = 0; start < 6; start++) {
          const result = runGraph(initialGraph('dijkstra', draft, directed, vertices[start]!))
          expect(vertices.map((v) => result.distance[v])).toEqual(distances[start])
          for (const target of vertices) {
            const path = graphPath(result, target)
            expect(new Set(path).size).toBe(path.length)
            expect(graphPathCost(result, path) ?? Infinity).toBe(result.distance[target])
          }
          for (const algorithm of ['bfs', 'dfs'] as const) {
            const traversal = runGraph(initialGraph(algorithm, draft, directed, vertices[start]!))
            expect([...traversal.visited].sort()).toEqual(
              vertices.filter((_, i) => Number.isFinite(distances[start]![i])),
            )
            expect(new Set(traversal.visited).size).toBe(traversal.visited.length)
          }
        }
      }
  })
  it('allows an empty graph, rejects negative weights and validates direction changes', () => {
    expect(() => graphEngine({ directed: 'false' })).toThrow('must be a boolean')
    expect(runGraph(initialGraph('bfs', '')).visited).toEqual(['A'])
    for (const invalid of ['A-B:-1', 'A-A:2', 'A-G:2', 'A-B:21', 'A-B:1 B-A:2'])
      expect(parseEdges(invalid)).toBeNull()
    const directed = initialGraph('dijkstra', 'A-B:1 B-A:2', true)
    const invalid = graphTransition(directed, { type: 'directed', value: 'no' })
    expect(invalid.error).toBeTruthy()
    expect(graphStep(invalid)).toBe(invalid)
    expect(graphTransition(invalid, { type: 'edges', value: 'A-B:1' })).toMatchObject({
      directed: false,
      error: null,
      done: false,
    })
  })
  it('keeps comparison runs and earlier snapshots independent', () => {
    const first = initialGraph(),
      snapshot = structuredClone(first),
      next = graphStep(first)
    expect(first).toEqual(snapshot)
    const compared = graphTransition(next, { type: 'compare' })
    expect(compared.visited).toEqual(['A'])
    expect(compared.distance).toEqual(next.distance)
    expect(compared.comparison.map((c) => c.cost)).toEqual([9, 13, 8])
  })
})

function fewestCoins(coins: number[], amount: number): number | null {
  // Breadth-first enumeration of reachable sums provides an independent minimum-length oracle.
  let frontier = [0]
  const seen = new Set([0])
  for (let depth = 0; frontier.length; depth++) {
    if (frontier.includes(amount)) return depth
    const next: number[] = []
    for (const sum of frontier)
      for (const coin of coins)
        if (sum + coin <= amount && !seen.has(sum + coin)) {
          seen.add(sum + coin)
          next.push(sum + coin)
        }
    frontier = next
  }
  return null
}
describe('greedy versus dynamic programming', () => {
  it('finds the optimal number of coins or proves unreachable amounts', () => {
    for (const coins of [[1, 3, 4], [3, 4], [2, 6, 7], [5], [1, 2, 5]])
      for (let amount = 1; amount <= 30; amount++) {
        const s = runOptimization(initialOptimization('dp', coins.join(' '), amount)),
          solution = coinSolution(s)
        expect(solution?.length ?? null).toBe(fewestCoins(coins, amount))
        if (solution) {
          expect(solution.reduce((a, b) => a + b, 0)).toBe(amount)
          expect(solution.every((c) => coins.includes(c))).toBe(true)
        }
      }
  })
  it('shows both a suboptimal greedy result and a false greedy dead end', () => {
    expect(coinSolution(runOptimization(initialOptimization()))).toEqual([4, 1, 1])
    expect(coinSolution(runOptimization(initialOptimization('dp')))).toEqual([3, 3])
    expect(coinSolution(runOptimization(initialOptimization('greedy', '3 4', 6)))).toBeNull()
    expect(coinSolution(runOptimization(initialOptimization('dp', '3 4', 6)))).toEqual([3, 3])
  })
  it('computes one subtotal per step and leaves comparisons separate from the live DP table', () => {
    const initial = initialOptimization('dp'),
      snapshot = structuredClone(initial)
    const step = optimizationStep(initial)
    expect(initial).toEqual(snapshot)
    expect(step.dp.slice(0, 3)).toEqual([0, 1, Infinity])
    const compared = optimizationTransition(step, { type: 'compare' })
    expect(compared.dp).toEqual(step.dp)
    expect(compared.cursor).toBe(1)
    const invalid = optimizationTransition(compared, { type: 'coins', value: '0 1 3' })
    expect(optimizationStep(invalid)).toBe(invalid)
    expect(optimizationTransition(invalid, { type: 'coins', value: '2 5' })).toMatchObject({
      cursor: 0,
      error: null,
      comparison: [],
    })
    expect(() => initialOptimization('dp', '1 1')).toThrow()
  })
})
