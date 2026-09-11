import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
import { allNodes, createBPlus, rangeBPlus } from '../structures/bplus-tree'

export interface QueryRow {
  id: number
  category: number
  score: number
  page: number
}
export type QueryPlan = 'scan' | 'index'
export type HeapLayout = 'ordered' | 'scattered'
export interface QueryEvent {
  kind: 'index-node' | 'index-leaf' | 'data-page' | 'compare' | 'return'
  target: string
  detail: string
  cost: number
  row?: QueryRow
}
export interface QueryRun {
  plan: QueryPlan
  events: QueryEvent[]
  results: QueryRow[]
  cost: number
  dataPages: number
  indexLeaves: number
}
export interface OptimizerState {
  rows: QueryRow[]
  layout: HeapLayout
  category: number
  randomCost: number
  statistics: number[]
  analyzed: boolean
  staleObserved: boolean
  run: QueryRun | null
  cursor: number
  comparison: QueryRun[]
  log: Observation[]
}
const planName = (plan: QueryPlan) => (plan === 'scan' ? '全表扫描' : 'B+Tree 索引范围 + 取记录')
const queryIndex = (rows: QueryRow[]) =>
  createBPlus([...rows].sort((a, b) => a.id - b.id).map((row) => row.category * 100 + row.id))
export function queryDataset(layout: HeapLayout): QueryRow[] {
  if (!['ordered', 'scattered'].includes(layout)) throw new Error('Unsupported heap layout')
  return Array.from({ length: 24 }, (_, position) => {
    const id = (layout === 'scattered' ? (position * 7) % 24 : position) + 1
    return {
      id,
      category: id <= 18 ? 1 : id <= 23 ? 2 : 3,
      score: (id * 17) % 101,
      page: Math.floor(position / 3),
    }
  })
}
export function executeQueryPlan(
  rows: QueryRow[],
  category: number,
  plan: QueryPlan,
  randomCost: number,
): QueryRun {
  if (
    ![1, 2, 3].includes(category) ||
    !['scan', 'index'].includes(plan) ||
    boundedInteger(randomCost, 1, 8) === null
  )
    throw new Error('Unsupported query parameters')
  const events: QueryEvent[] = [],
    results: QueryRow[] = [],
    pages = [...new Set(rows.map((row) => row.page))]
  const heap = new Map(pages.map((page) => [page, rows.filter((row) => row.page === page)]))
  // Leaf payloads map index keys to physical record IDs; score is read from the heap page.
  const locations = new Map<number, { page: number; slot: number }>()
  for (const [page, records] of heap)
    records.forEach((row, slot) => locations.set(row.category * 100 + row.id, { page, slot }))
  const append = (kind: QueryEvent['kind'], target: string, detail: string, cost: number, row?: QueryRow) => {
    events.push({ kind, target, detail, cost, ...(row ? { row } : {}) })
    if (row) results.push(row)
  }
  if (plan === 'scan') {
    for (const page of pages) {
      append('data-page', `P${page}`, '顺序读取一个数据页', 1)
      for (const row of heap.get(page)!)
        append(
          'compare',
          `id=${row.id}`,
          `category=${row.category} ${row.category === category ? '符合' : '不符合'}条件`,
          0.05,
          row.category === category ? row : undefined,
        )
    }
  } else {
    const tree = queryIndex(rows),
      nodes = allNodes(tree)
    const low = category * 100,
      high = low + 99,
      range = rangeBPlus(tree, low, high),
      fetched = new Set<number>()
    for (const id of range.path) {
      const node = nodes.find((node) => node.id === id)!
      if (!node.leaf) {
        append(
          'index-node',
          id,
          `内部节点已缓存，检查导航键 ${node.keys.join(', ')}`,
          node.keys.length * 0.05,
        )
        continue
      }
      append('index-leaf', id, `读取索引叶页 [${node.keys.join(', ')}]`, randomCost)
      for (const key of node.keys) {
        append(
          'compare',
          String(key),
          `比较复合索引键 (category,id)=(${Math.floor(key / 100)},${key % 100})`,
          0.05,
        )
        if (key > high) break
        if (key < low) continue
        const location = locations.get(key)!,
          row = heap.get(location.page)![location.slot]!
        if (!fetched.has(row.page)) {
          fetched.add(row.page)
          append(
            'data-page',
            `P${row.page}`,
            `根据叶项 RID=(P${row.page}, slot ${location.slot}) 读取数据页`,
            randomCost,
          )
        }
        append('return', `id=${row.id}`, `取回不在索引中的 score=${row.score}`, 0.05, row)
      }
    }
  }
  return {
    plan,
    events,
    results,
    cost: Number(events.reduce((sum, event) => sum + event.cost, 0).toFixed(2)),
    dataPages: events.filter((e) => e.kind === 'data-page').length,
    indexLeaves: events.filter((e) => e.kind === 'index-leaf').length,
  }
}
export function initialOptimizer(
  layout: HeapLayout = 'scattered',
  category = 1,
  randomCost = 2,
): OptimizerState {
  if (![1, 2, 3].includes(category) || boundedInteger(randomCost, 1, 8) === null)
    throw new Error('Invalid optimizer configuration')
  return {
    rows: queryDataset(layout),
    layout,
    category,
    randomCost,
    statistics: [1, 4, 19],
    analyzed: false,
    staleObserved: false,
    run: null,
    cursor: 0,
    comparison: [],
    log: [],
  }
}
export function estimatePlans(s: OptimizerState): {
  scan: number
  index: number
  chosen: QueryPlan
  estimatedRows: number
} {
  const tree = queryIndex(s.rows),
    leaves = allNodes(tree).filter((node) => node.leaf).length
  const estimatedRows = s.statistics[s.category - 1]!,
    averageLeafFill = s.rows.length / leaves
  const leafPages = Math.max(1, Math.min(leaves, Math.ceil(estimatedRows / averageLeafFill))),
    dataPages = Math.min(8, estimatedRows)
  const scan = 8 + s.rows.length * 0.05,
    index = (leafPages + dataPages) * s.randomCost + estimatedRows * 0.1 + 0.2
  return { scan, index, chosen: index < scan ? 'index' : 'scan', estimatedRows }
}
export function optimizerTransition(s: OptimizerState, a: ExperimentAction): OptimizerState {
  if (a.type === 'layout' && ['ordered', 'scattered'].includes(String(a.value)))
    return initialOptimizer(a.value as HeapLayout, s.category, s.randomCost)
  if (a.type === 'category' || a.type === 'random-cost') {
    const value = boundedInteger(a.value, 1, a.type === 'category' ? 3 : 8)
    return value === null
      ? s
      : {
          ...s,
          category: a.type === 'category' ? value : s.category,
          randomCost: a.type === 'random-cost' ? value : s.randomCost,
          run: null,
          cursor: 0,
          comparison: [],
        }
  }
  if (a.type === 'analyze')
    return {
      ...s,
      statistics: [1, 2, 3].map((category) => s.rows.filter((row) => row.category === category).length),
      analyzed: true,
      run: null,
      cursor: 0,
      comparison: [],
      log: addLog(
        s.log,
        '更新统计信息',
        '扫描当前数据，得到 category 1 / 2 / 3 的行数 18 / 5 / 1；统计更新后重新估价与执行。',
        'success',
      ),
    }
  if (a.type === 'compare')
    return {
      ...s,
      comparison: (['scan', 'index'] as QueryPlan[]).map((plan) =>
        executeQueryPlan(s.rows, s.category, plan, s.randomCost),
      ),
      log: addLog(
        s.log,
        '独立执行两条访问路径',
        '相同表、条件与冷叶页 / 数据页，从空查询缓存执行；两条路径返回相同记录集合，但工作量不同。',
      ),
    }
  if (a.type === 'explain') {
    const estimates = estimatePlans(s)
    return {
      ...s,
      log: addLog(
        s.log,
        'EXPLAIN / 仅估计',
        `估计 ${estimates.estimatedRows} 行，全表成本 ${estimates.scan.toFixed(2)}，索引成本 ${estimates.index.toFixed(2)}，选择${planName(estimates.chosen)}。尚未执行或读取记录。`,
      ),
    }
  }
  if (a.type === 'step' || a.type === 'run') {
    const run = s.run ?? executeQueryPlan(s.rows, s.category, estimatePlans(s).chosen, s.randomCost),
      cursor = a.type === 'run' ? run.events.length : Math.min(s.cursor + 1, run.events.length)
    const event = run.events[cursor - 1]
    const alternative =
      cursor === run.events.length
        ? executeQueryPlan(s.rows, s.category, run.plan === 'scan' ? 'index' : 'scan', s.randomCost)
        : null
    return {
      ...s,
      run,
      cursor,
      staleObserved: s.staleObserved || (!s.analyzed && !!alternative && run.cost > alternative.cost),
      log: addLog(
        s.log,
        cursor === run.events.length ? '访问路径执行完成' : `步骤 ${cursor}`,
        cursor === run.events.length
          ? `${planName(run.plan)}返回 ${run.results.length} 行，实际模型成本 ${run.cost.toFixed(2)}。`
          : `${event?.target}：${event?.detail}。`,
        cursor === run.events.length ? 'success' : 'neutral',
      ),
    }
  }
  return s
}
export function presentOptimizer(s: OptimizerState): ExperimentView {
  const estimates = estimatePlans(s),
    executed = s.run?.events.slice(0, s.cursor) ?? [],
    results = executed.flatMap((event) => (event.row ? [event.row] : [])),
    done = !!s.run && s.cursor === s.run.events.length
  const reached = s.staleObserved && s.analyzed && done && s.comparison.length === 2
  return {
    scene: {
      kind: 'data',
      title: '估算代价决定选择，真实执行给出证据',
      cards: [
        {
          id: 'query',
          label: '查询条件',
          value: `category = ${s.category}`,
          detail: 'SELECT id, category, score FROM items WHERE category = ?',
        },
        {
          id: 'chosen',
          label: '当前估计选择',
          value: planName(estimates.chosen),
          detail: `统计预计 ${estimates.estimatedRows} 行；${s.analyzed ? '已更新统计' : '历史统计已过时'}`,
        },
      ],
      tables: [
        {
          id: 'query-estimates',
          title: '候选路径的估计成本',
          columns: ['访问路径', '估计成本'],
          rows: [
            { id: 'scan', values: [planName('scan'), estimates.scan.toFixed(2)] },
            { id: 'index', values: [planName('index'), estimates.index.toFixed(2)] },
          ],
        },
        {
          id: 'query-events',
          title: '执行轨迹 / 最近 24 步',
          columns: ['步骤', '对象', '操作', '成本'],
          rows: executed.slice(-24).map((event, i) => ({
            id: String(Math.max(0, executed.length - 24) + i),
            values: [
              Math.max(0, executed.length - 24) + i + 1,
              event.target,
              event.detail,
              event.cost.toFixed(2),
            ],
          })),
        },
        {
          id: 'query-results',
          title: '当前实际返回的记录',
          columns: ['id', 'category', 'score', '数据页'],
          rows: results.map((row) => ({
            id: String(row.id),
            values: [row.id, row.category, row.score, row.page],
          })),
        },
        {
          id: 'query-comparison',
          title: '同一条件的实际执行对照',
          columns: ['访问路径', '返回行', '数据页读取', '索引叶页读取', '实际模型成本'],
          rows: s.comparison.map((run) => ({
            id: run.plan,
            values: [
              planName(run.plan),
              run.results.length,
              run.dataPages,
              run.indexLeaves,
              run.cost.toFixed(2),
            ],
          })),
        },
      ],
      caption:
        '24 条记录、8 个三记录数据页；复合索引键 category×100+id 使用真实 4 阶 B+Tree，score 需访问数据页。内部索引节点假定已缓存，叶页 / 数据页从冷状态读取，查询内已读数据页保留；没有 ORDER BY，不保证两条路径返回顺序一致。成本单位不是毫秒。',
    },
    metrics: [
      { label: '估计结果行数', value: estimates.estimatedRows },
      { label: '已返回行数', value: results.length },
      { label: '累计执行成本', value: executed.reduce((sum, event) => sum + event.cost, 0).toFixed(2) },
      { label: '执行步骤', value: `${s.cursor} / ${s.run?.events.length ?? '—'}` },
    ],
    controls: [
      {
        id: 'category',
        kind: 'select',
        label: '查询 category',
        value: s.category,
        options: [
          { value: '1', label: '1 · 常见类别' },
          { value: '2', label: '2 · 中等类别' },
          { value: '3', label: '3 · 稀有类别' },
        ],
      },
      {
        id: 'random-cost',
        kind: 'number',
        label: '随机读页成本 / 顺序页=1',
        value: s.randomCost,
        min: 1,
        max: 8,
      },
      {
        id: 'layout',
        kind: 'select',
        label: '堆表物理布局 / 修改会重置',
        value: s.layout,
        options: [
          { value: 'scattered', label: '按置换分散到数据页' },
          { value: 'ordered', label: '按 id 顺序装页' },
        ],
      },
      { id: 'explain', kind: 'button', label: 'EXPLAIN · 查看估计', primary: true },
      { id: 'step', kind: 'button', label: '执行一个访问步骤', disabled: done },
      { id: 'run', kind: 'button', label: '运行优化器选择的路径', disabled: done },
      { id: 'compare', kind: 'button', label: '实际执行两种访问路径' },
      { id: 'analyze', kind: 'button', label: 'ANALYZE · 更新统计信息' },
    ],
    status: {
      title: reached
        ? '统计变化会改变计划选择'
        : s.analyzed
          ? '用当前分布重新估计'
          : '优化器依据估计，可能选错访问路径',
      detail:
        s.log.at(-1)?.detail ??
        '默认历史统计只预计 category=1 有一行，实际却有 18 行；先运行与对比，再更新统计重试。',
      tone: reached ? 'success' : 'neutral',
    },
    goal: {
      label: '观察一次过时统计导致的较差选择，更新统计后重新执行，并对照两条路径的实际成本。',
      reached,
    },
    log: s.log,
  }
}
export const optimizerEngine: EngineFactory = (config) =>
  createSession(
    () =>
      initialOptimizer(
        (config.layout ?? 'scattered') as HeapLayout,
        Number(config.category ?? 1),
        Number(config.randomCost ?? 2),
      ),
    optimizerTransition,
    presentOptimizer,
  )
