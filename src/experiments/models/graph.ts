import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'

export type GraphAlgorithm = 'bfs' | 'dfs' | 'dijkstra'
export interface Edge {
  from: string
  to: string
  weight: number
}
export interface GraphState {
  algorithm: GraphAlgorithm
  draft: string
  edges: Edge[]
  directed: boolean
  start: string
  target: string
  frontier: { node: string; parent: string | null }[]
  visited: string[]
  distance: Record<string, number>
  parents: Record<string, string | null>
  current: string | null
  done: boolean
  comparison: { name: string; path: string; cost: number | null; order: string }[]
  error: string | null
  log: Observation[]
}
export const vertices = ['A', 'B', 'C', 'D', 'E', 'F']
const algorithms = [
  { value: 'bfs', label: 'BFS · 广度优先' },
  { value: 'dfs', label: 'DFS · 深度优先' },
  { value: 'dijkstra', label: 'Dijkstra · 最短距离' },
] as const
const example = 'A-B:4 A-D:2 D-B:1 B-C:3 D-E:4 E-C:1 C-F:2 E-F:5'
export function parseEdges(draft: string, directed = false): Edge[] | null {
  if (!draft.trim()) return []
  const tokens = draft
    .trim()
    .toUpperCase()
    .split(/[\s,]+/)
  if (tokens.length > 20) return null
  const edges: Edge[] = [],
    keys = new Set<string>()
  for (const token of tokens) {
    const match = /^([A-F])-([A-F]):(\d{1,2})$/.exec(token)
    if (!match || match[1] === match[2] || Number(match[3]) > 20) return null
    const from = match[1]!,
      to = match[2]!,
      key = directed ? from + to : [from, to].sort().join('')
    if (keys.has(key)) return null
    keys.add(key)
    edges.push({ from, to, weight: Number(match[3]) })
  }
  return edges
}
export function initialGraph(
  algorithm: GraphAlgorithm = 'bfs',
  draft = example,
  directed = false,
  start = 'A',
  target = 'F',
): GraphState {
  const edges = parseEdges(draft, directed)
  if (
    !edges ||
    !algorithms.some((a) => a.value === algorithm) ||
    !vertices.includes(start) ||
    !vertices.includes(target)
  )
    throw new Error('Graph requires BFS/DFS/Dijkstra, vertices A–F and unique edges with weights 0–20')
  return {
    algorithm,
    draft,
    edges,
    directed,
    start,
    target,
    frontier: [{ node: start, parent: null }],
    visited: [],
    distance: Object.fromEntries(vertices.map((v) => [v, v === start ? 0 : Infinity])),
    parents: Object.fromEntries(vertices.map((v) => [v, null])),
    current: null,
    done: false,
    comparison: [],
    error: null,
    log: [],
  }
}
export function graphNeighbors(s: Pick<GraphState, 'edges' | 'directed'>, node: string) {
  return s.edges
    .flatMap((e) =>
      e.from === node
        ? [{ node: e.to, weight: e.weight }]
        : !s.directed && e.to === node
          ? [{ node: e.from, weight: e.weight }]
          : [],
    )
    .sort((a, b) => a.node.localeCompare(b.node))
}
export function graphPath(s: GraphState, target = s.target): string[] {
  if (!s.visited.includes(target)) return []
  const path: string[] = []
  let current: string | null = target
  while (current !== null) {
    path.unshift(current)
    current = s.parents[current]!
  }
  return path
}
export function graphPathCost(s: GraphState, path: string[]): number | null {
  if (!path.length) return null
  return path
    .slice(1)
    .reduce((cost, node, i) => cost + graphNeighbors(s, path[i]!).find((n) => n.node === node)!.weight, 0)
}
export function graphStep(state: GraphState): GraphState {
  if (state.done || state.error) return state
  const s = {
    ...state,
    frontier: [...state.frontier],
    visited: [...state.visited],
    distance: { ...state.distance },
    parents: { ...state.parents },
  }
  if (s.algorithm === 'dijkstra')
    s.frontier.sort((a, b) => s.distance[a.node]! - s.distance[b.node]! || a.node.localeCompare(b.node))
  let entry = s.algorithm === 'dfs' ? s.frontier.pop() : s.frontier.shift()
  while (entry && s.visited.includes(entry.node))
    entry = s.algorithm === 'dfs' ? s.frontier.pop() : s.frontier.shift()
  if (!entry) return { ...s, done: true }
  const node = entry.node
  if (s.algorithm === 'dfs') {
    s.parents[node] = entry.parent
    s.distance[node] = entry.parent === null ? 0 : s.distance[entry.parent]! + 1
  }
  s.current = node
  s.visited.push(node)
  const neighbors = graphNeighbors(s, node)
  if (s.algorithm === 'dfs') {
    // Candidates carry their own parent. Only popping discovers them, so cross edges do not steal DFS parents.
    for (const next of [...neighbors].reverse())
      if (!s.visited.includes(next.node)) s.frontier.push({ node: next.node, parent: node })
  } else {
    for (const next of neighbors) {
      if (s.visited.includes(next.node)) continue
      const distance = s.distance[node]! + (s.algorithm === 'bfs' ? 1 : next.weight)
      if (distance < s.distance[next.node]!) {
        s.distance[next.node] = distance
        s.parents[next.node] = node
        if (!s.frontier.some((e) => e.node === next.node)) s.frontier.push({ node: next.node, parent: node })
      }
    }
  }
  s.frontier = s.frontier.filter((e) => !s.visited.includes(e.node))
  s.done = s.frontier.length === 0
  s.log = addLog(
    s.log,
    `访问 ${node}`,
    `${s.algorithm === 'dijkstra' ? '确定最小暂定距离并松弛出边' : s.algorithm === 'bfs' ? '从队首取出，按边数扩展下一层' : '从栈顶取出，沿分支深入'}；已访问 ${s.visited.join(' → ')}。`,
    s.done ? 'success' : 'neutral',
  )
  return s
}
export function runGraph(state: GraphState): GraphState {
  let s = state
  while (!s.done && !s.error) s = graphStep(s)
  return s
}
export function graphTransition(s: GraphState, a: ExperimentAction): GraphState {
  if (a.type === 'step') return graphStep(s)
  if (a.type === 'run') return runGraph(s)
  if (a.type === 'edges') {
    const draft = String(a.value ?? '')
    return parseEdges(draft, s.directed)
      ? initialGraph(s.algorithm, draft, s.directed, s.start, s.target)
      : {
          ...s,
          draft,
          error:
            '边格式为 A-B:4；顶点 A–F，权重 0–20，最多 20 条。禁止自环、重复边与负权。空输入表示没有边。',
        }
  }
  if (s.error) return s
  if (a.type === 'algorithm' && algorithms.some((algo) => algo.value === a.value))
    return initialGraph(a.value as GraphAlgorithm, s.draft, s.directed, s.start, s.target)
  if (a.type === 'start' && vertices.includes(String(a.value)))
    return initialGraph(s.algorithm, s.draft, s.directed, String(a.value), s.target)
  if (a.type === 'target' && vertices.includes(String(a.value)))
    return initialGraph(s.algorithm, s.draft, s.directed, s.start, String(a.value))
  if (a.type === 'directed' && ['yes', 'no'].includes(String(a.value))) {
    const directed = a.value === 'yes'
    if (parseEdges(s.draft, directed)) return initialGraph(s.algorithm, s.draft, directed, s.start, s.target)
    return { ...s, directed, error: '转为无向图后出现重复边，请在边输入中删除重复方向。' }
  }
  if (a.type === 'compare')
    return {
      ...s,
      comparison: algorithms.map((algo) => {
        const result = runGraph(initialGraph(algo.value, s.draft, s.directed, s.start, s.target))
        const path = graphPath(result)
        return {
          name: algo.value.toUpperCase(),
          path: path.join(' → ') || '不可达',
          cost: graphPathCost(result, path),
          order: result.visited.join(' → '),
        }
      }),
      log: addLog(
        s.log,
        '同一张图的三种遍历',
        'BFS 最小化边数，DFS 找到一条探索路径，Dijkstra 在非负边权下最小化总权重。',
        'success',
      ),
    }
  return s
}
export function presentGraph(s: GraphState): ExperimentView {
  const path = graphPath(s),
    positions = [
      [60, 70],
      [210, 40],
      [360, 70],
      [60, 230],
      [210, 260],
      [360, 230],
    ]
  return {
    scene: {
      kind: 'graph',
      directed: s.directed,
      nodes: vertices.map((id, i) => ({
        id,
        x: positions[i]![0]!,
        y: positions[i]![1]!,
        distance: Number.isFinite(s.distance[id]) ? String(s.distance[id]) : '∞',
        parent: s.parents[id]!,
        visited: s.visited.includes(id),
        current: s.current === id,
      })),
      edges: s.edges.map((edge) => ({
        ...edge,
        active: path.some(
          (node, i) =>
            (node === edge.from && path[i + 1] === edge.to) ||
            (!s.directed && node === edge.to && path[i + 1] === edge.from),
        ),
      })),
      frontier: s.frontier.map((e) => e.node),
      path,
      caption: s.comparison.length
        ? s.comparison
            .map((c) => `${c.name}：${c.path}；权重 ${c.cost ?? '∞'}；访问顺序 ${c.order}`)
            .join('\n')
        : `${s.algorithm === 'dijkstra' ? '距离为边权之和' : '距离为发现路径的边数'}；邻接顶点按字母排序，DFS 栈顶位于右端，已访问的重复候选会跳过。`,
    },
    metrics: [
      { label: '访问顶点', value: `${s.visited.length} / 6` },
      { label: '目标路径', value: path.join(' → ') || (s.done ? '不可达' : '待确定') },
      { label: '路径总权重', value: graphPathCost(s, path) ?? '—' },
      { label: '当前顶点', value: s.current ?? '—' },
    ],
    controls: [
      { id: 'edges', kind: 'text', label: '边 / 起点-终点:权重', value: s.draft },
      {
        id: 'algorithm',
        kind: 'select',
        label: '图算法',
        value: s.algorithm,
        options: [...algorithms],
        disabled: !!s.error,
      },
      {
        id: 'directed',
        kind: 'select',
        label: '边的方向',
        value: s.directed ? 'yes' : 'no',
        options: [
          { value: 'no', label: '无向图' },
          { value: 'yes', label: '有向图' },
        ],
        disabled: !!s.error,
      },
      {
        id: 'start',
        kind: 'select',
        label: '起点',
        value: s.start,
        options: vertices.map((v) => ({ value: v, label: v })),
        disabled: !!s.error,
      },
      {
        id: 'target',
        kind: 'select',
        label: '目标顶点',
        value: s.target,
        options: vertices.map((v) => ({ value: v, label: v })),
        disabled: !!s.error,
      },
      { id: 'step', kind: 'button', label: '访问下一个顶点', primary: true, disabled: s.done || !!s.error },
      { id: 'run', kind: 'button', label: '运行图算法到结束', disabled: s.done || !!s.error },
      { id: 'compare', kind: 'button', label: '对比三种图算法', disabled: !!s.error },
    ],
    status: {
      title: s.error ? '检查图输入' : s.done ? '可达顶点已处理' : '选择下一个顶点',
      detail: s.error ?? s.log.at(-1)?.detail ?? '同一个起点与终点，最少的边不一定意味着最小的权重。',
      tone: s.error ? 'danger' : s.done ? 'success' : 'neutral',
    },
    goal: {
      label: '完成遍历，并比较 BFS、DFS 与 Dijkstra 找到的路径代价。',
      reached: !s.error && s.done && s.comparison.length === 3,
    },
    log: s.log,
  }
}
export const graphEngine: EngineFactory = (config) => {
  if (config.directed !== undefined && typeof config.directed !== 'boolean')
    throw new Error('Graph directed configuration must be a boolean')
  return createSession(
    () =>
      initialGraph(
        (config.algorithm ?? 'bfs') as GraphAlgorithm,
        String(config.edges ?? example),
        config.directed === true,
        String(config.start ?? 'A'),
        String(config.target ?? 'F'),
      ),
    graphTransition,
    presentGraph,
  )
}
