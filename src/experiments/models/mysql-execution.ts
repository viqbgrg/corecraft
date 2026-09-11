import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type JoinMethod = 'nested' | 'index' | 'hash'
export interface Customer {
  id: number
  city: string
}
export interface Order {
  id: number
  customer: number
  amount: number
}
export interface Aggregate {
  city: string
  total: number
  count: number
}
export interface QueryStep {
  operator: string
  detail: string
  rows: number
}
export interface ExecutionResult {
  method: JoinMethod
  filtered: Order[]
  joined: { order: number; city: string; amount: number }[]
  groups: Aggregate[]
  sorted: Aggregate[]
  result: Aggregate[]
  trace: QueryStep[]
  comparisons: number
  probes: number
  builds: number
  sortComparisons: number
  runs: Aggregate[][]
  spilled: boolean
  cost: number
}
export interface ExecutionState {
  customers: Customer[]
  orders: Order[]
  threshold: number
  limit: number
  memory: number
  method: JoinMethod | 'auto'
  stale: boolean
  run: ExecutionResult | null
  cursor: number
  comparison: ExecutionResult[]
  analyzed: boolean
  error: string | null
  log: Observation[]
}
const names: Record<JoinMethod, string> = { nested: 'Nested Loop', index: 'Index Lookup', hash: 'Hash Join' }
export function initialExecution(): ExecutionState {
  const customers = [1, 2, 3, 4, 5, 6].map((id) => ({
    id,
    city: ['上海', '杭州', '深圳'][Math.floor((id - 1) / 2)]!,
  }))
  const orders = [10, 90, 50, 70, 20, 60, 100, 40, 80, 30, 55, 75].map((amount, i) => ({
    id: i + 1,
    customer: (i % 6) + 1,
    amount,
  }))
  return {
    customers,
    orders,
    threshold: 50,
    limit: 3,
    memory: 2,
    method: 'auto',
    stale: true,
    run: null,
    cursor: 0,
    comparison: [],
    analyzed: false,
    error: null,
    log: [],
  }
}
/** Logical cost units. Index already exists; hash table is built for each execution. */
export function explainExecution(
  s: ExecutionState,
): { method: JoinMethod; estimate: number; cost: number }[] {
  const estimate = s.stale ? 1 : s.orders.filter((order) => order.amount >= s.threshold).length
  return [
    { method: 'nested', estimate, cost: s.orders.length + estimate * s.customers.length },
    { method: 'index', estimate, cost: s.orders.length + estimate * 3 },
    { method: 'hash', estimate, cost: s.orders.length + s.customers.length + estimate },
  ]
}
export function chosenJoin(s: ExecutionState): JoinMethod {
  return s.method === 'auto' ? [...explainExecution(s)].sort((a, b) => a.cost - b.cost)[0]!.method : s.method
}
export function executeQuery(s: ExecutionState, method: JoinMethod): ExecutionResult {
  const trace: QueryStep[] = [],
    filtered: Order[] = [],
    joined: ExecutionResult['joined'] = []
  let comparisons = 0,
    probes = 0,
    builds = 0,
    sortComparisons = 0
  for (const order of s.orders) {
    if (order.amount >= s.threshold) filtered.push({ ...order })
    trace.push({
      operator: 'Filter',
      detail: `订单 ${order.id}：${order.amount} >= ${s.threshold} → ${order.amount >= s.threshold ? '保留' : '过滤'}`,
      rows: filtered.length,
    })
  }
  const index = new Map(s.customers.map((customer) => [customer.id, customer]))
  const hash = new Map<number, Customer[]>()
  if (method === 'hash')
    for (const customer of s.customers) {
      hash.set(customer.id, [...(hash.get(customer.id) ?? []), customer])
      builds++
      trace.push({
        operator: 'Hash Build',
        detail: `客户 ${customer.id} 放入哈希桶；构建侧按主键唯一。`,
        rows: builds,
      })
    }
  for (const order of filtered) {
    let matches: Customer[] = []
    if (method === 'nested') {
      for (const customer of s.customers) {
        comparisons++
        if (customer.id === order.customer) matches.push(customer)
      }
    } else if (method === 'index') {
      probes++
      const customer = index.get(order.customer)
      if (customer) matches = [customer]
    } else {
      probes++
      matches = hash.get(order.customer) ?? []
    }
    for (const customer of matches)
      joined.push({ order: order.id, city: customer.city, amount: order.amount })
    trace.push({
      operator: names[method],
      detail: `订单 ${order.id} 关联客户 ${order.customer} → ${matches.map((customer) => customer.city).join(', ') || '无匹配'}`,
      rows: joined.length,
    })
  }
  const aggregate = new Map<string, Aggregate>()
  for (const row of joined) {
    const group = aggregate.get(row.city) ?? { city: row.city, total: 0, count: 0 }
    group.total += row.amount
    group.count++
    aggregate.set(row.city, group)
    trace.push({
      operator: 'GROUP BY',
      detail: `${row.city} 累加 ${row.amount} → SUM=${group.total}, COUNT=${group.count}`,
      rows: aggregate.size,
    })
  }
  const groups = [...aggregate.values()].map((row) => ({ ...row }))
  const compare = (a: Aggregate, b: Aggregate) => {
    sortComparisons++
    return b.total - a.total || (a.city < b.city ? -1 : a.city > b.city ? 1 : 0)
  }
  // Explicit insertion sort within bounded runs, then k-way merge. No host sort comparator counts.
  const runs: Aggregate[][] = []
  for (let start = 0; start < groups.length; start += s.memory) {
    const run: Aggregate[] = []
    for (const group of groups.slice(start, start + s.memory)) {
      let i = run.length
      while (i > 0 && compare(group, run[i - 1]!) < 0) i--
      run.splice(i, 0, { ...group })
    }
    runs.push(run)
    trace.push({
      operator: 'Filesort Run',
      detail: `排序段 ${runs.length}：${run.map((row) => `${row.city}:${row.total}`).join(' → ')}`,
      rows: run.length,
    })
  }
  const pointers = runs.map(() => 0),
    sorted: Aggregate[] = []
  while (sorted.length < groups.length) {
    let best = -1
    for (let i = 0; i < runs.length; i++)
      if (
        pointers[i]! < runs[i]!.length &&
        (best < 0 || compare(runs[i]![pointers[i]!]!, runs[best]![pointers[best]!]!) < 0)
      )
        best = i
    sorted.push({ ...runs[best]![pointers[best]!]! })
    pointers[best] = pointers[best]! + 1
    trace.push({
      operator: runs.length > 1 ? 'Merge' : 'ORDER BY',
      detail: `输出 ${sorted.at(-1)!.city}，SUM=${sorted.at(-1)!.total}`,
      rows: sorted.length,
    })
  }
  const result = sorted.slice(0, s.limit)
  trace.push({
    operator: 'LIMIT',
    detail: `有序 ${sorted.length} 组取前 ${s.limit} 组，返回 ${result.length} 行。`,
    rows: result.length,
  })
  return {
    method,
    filtered,
    joined,
    groups,
    sorted,
    result,
    trace,
    comparisons,
    probes,
    builds,
    sortComparisons,
    runs,
    spilled: runs.length > 1,
    cost: s.orders.length + comparisons + probes * (method === 'index' ? 3 : 1) + builds,
  }
}
export function executionTransition(s: ExecutionState, a: ExperimentAction): ExecutionState {
  if (['threshold', 'limit', 'memory'].includes(a.type)) {
    const value = boundedInteger(
      a.value,
      a.type === 'threshold' ? 0 : 1,
      a.type === 'threshold' ? 150 : a.type === 'limit' ? 3 : 6,
    )
    return value === null ? s : { ...s, [a.type]: value, run: null, cursor: 0, comparison: [], error: null }
  }
  if (a.type === 'method' && ['auto', 'nested', 'index', 'hash'].includes(String(a.value)))
    return { ...s, method: a.value as ExecutionState['method'], run: null, cursor: 0, error: null }
  if (a.type === 'analyze')
    return {
      ...s,
      stale: false,
      analyzed: true,
      run: null,
      cursor: 0,
      comparison: [],
      log: addLog(
        s.log,
        '更新过滤行数统计',
        '本小表用精确计数更新选择率；真实 ANALYZE 通常依赖采样，EXPLAIN 的估计并非执行结果。',
      ),
    }
  if (a.type === 'explain')
    return {
      ...s,
      log: addLog(
        s.log,
        'EXPLAIN · 仅估计',
        `优化器选择 ${names[chosenJoin(s)]}；Filter → Join → GROUP BY → Filesort → LIMIT。没有执行任何数据算子。`,
      ),
    }
  if (a.type === 'compare')
    return {
      ...s,
      comparison: (['nested', 'index', 'hash'] as const).map((method) => executeQuery(s, method)),
      log: addLog(
        s.log,
        '三条路径分别执行',
        '输入表、过滤、分组和排序相同；索引预先存在，Hash Join 计入本次构建成本。',
        'success',
      ),
    }
  if (a.type === 'step' || a.type === 'run') {
    const run = s.run ?? executeQuery(s, chosenJoin(s)),
      cursor = a.type === 'run' ? run.trace.length : Math.min(s.cursor + 1, run.trace.length),
      last = run.trace[cursor - 1]!
    return {
      ...s,
      run,
      cursor,
      error: null,
      log: addLog(s.log, last.operator, last.detail, cursor === run.trace.length ? 'success' : 'neutral'),
    }
  }
  return s
}
export function presentExecution(s: ExecutionState): ExperimentView {
  const done = !!s.run && s.cursor === s.run.trace.length,
    reached = done && s.analyzed && s.comparison.length === 3,
    estimates = explainExecution(s),
    selected = chosenJoin(s)
  return {
    scene: {
      kind: 'data',
      title: 'Filter → Join → GROUP BY → ORDER BY → LIMIT',
      cards: [
        {
          id: 'sql',
          label: '固定查询模板',
          value: `amount >= ${s.threshold}，按 city 分组`,
          detail: `SUM(amount) DESC, city ASC；LIMIT ${s.limit}`,
        },
        {
          id: 'plan',
          label: '选择的连接方式',
          value: names[selected],
          detail: s.stale ? '过时统计：仅估计 1 条订单' : '本小表的精确过滤计数',
        },
      ],
      tables: [
        {
          id: 'execution-customers',
          title: 'customers / 预先存在主键索引',
          columns: ['id', 'city'],
          rows: s.customers.map((row) => ({ id: String(row.id), values: [row.id, row.city] })),
        },
        {
          id: 'execution-orders',
          title: 'orders / 相同输入表',
          columns: ['id', 'customer_id', 'amount'],
          rows: s.orders.map((row) => ({ id: String(row.id), values: [row.id, row.customer, row.amount] })),
        },
        {
          id: 'execution-explain',
          title: 'EXPLAIN 示意 / 只估计扫描与连接成本',
          columns: ['连接算子', '估计过滤行', '估计成本', '选择'],
          rows: estimates.map((entry) => ({
            id: entry.method,
            values: [
              names[entry.method],
              entry.estimate,
              entry.cost,
              entry.method === selected ? '当前路径' : '候选',
            ],
          })),
        },
        {
          id: 'execution-trace',
          title: '实际算子轨迹 / 最近 20 步',
          columns: ['算子', '该阶段累计行', '动作'],
          rows: (s.run?.trace.slice(0, s.cursor).slice(-20) ?? []).map((step, i) => ({
            id: String(i),
            values: [step.operator, step.rows, step.detail],
          })),
        },
        {
          id: 'execution-result',
          title: '最终有序结果',
          columns: ['city', 'SUM(amount)', 'COUNT(*)'],
          rows: done
            ? s.run!.result.map((row) => ({ id: row.city, values: [row.city, row.total, row.count] }))
            : [],
        },
        {
          id: 'execution-comparison',
          title: '三种真实执行 / 不含排序的同单位成本',
          columns: ['路径', '键比较', '索引 / 哈希探测', '哈希构建', '实际成本', '结果组数'],
          rows: s.comparison.map((run) => ({
            id: run.method,
            values: [names[run.method], run.comparisons, run.probes, run.builds, run.cost, run.result.length],
          })),
        },
      ],
      caption:
        'MySQL 8 风格算子教学，不解析任意 SQL，也不复刻某版本优化器。Nested Loop 作为基线；现代 MySQL 具体可用算法由版本与计划决定。索引一次查找按 3 成本单位；哈希无碰撞计时。Filesort 表示不能直接利用索引顺序，不必写磁盘；本实验用每段容量显式模拟外排写段与归并，不执行真实文件 IO。',
    },
    metrics: [
      { label: '已执行算子步骤', value: s.cursor },
      { label: '过滤后订单数', value: done ? s.run!.filtered.length : '—' },
      { label: '排序段数', value: done ? s.run!.runs.length : '—' },
      { label: '模拟排序落盘', value: done ? (s.run!.spilled ? '是' : '否') : '—' },
      { label: '排序比较次数', value: done ? s.run!.sortComparisons : '—' },
    ],
    controls: [
      { id: 'threshold', kind: 'number', label: '订单最小 amount', value: s.threshold, min: 0, max: 150 },
      { id: 'limit', kind: 'number', label: 'LIMIT 组数', value: s.limit, min: 1, max: 3 },
      { id: 'memory', kind: 'number', label: '每个排序段的内存容量（组）', value: s.memory, min: 1, max: 6 },
      {
        id: 'method',
        kind: 'select',
        label: '连接执行策略',
        value: s.method,
        options: [
          { value: 'auto', label: '按估计成本选择' },
          ...(['nested', 'index', 'hash'] as const).map((method) => ({
            value: method,
            label: names[method],
          })),
        ],
      },
      { id: 'explain', kind: 'button', label: 'EXPLAIN · 仅查看计划' },
      { id: 'step', kind: 'button', label: '执行一个查询算子动作', primary: true, disabled: done },
      { id: 'run', kind: 'button', label: '执行完整 SQL 管线', disabled: done },
      { id: 'analyze', kind: 'button', label: '更新 Join 选择率统计' },
      { id: 'compare', kind: 'button', label: '实际对比三种 Join' },
    ],
    status: {
      title: reached ? '相同结果可以来自不同工作量' : '估计选计划，执行产生记录',
      detail:
        s.log.at(-1)?.detail ??
        '先执行过时统计选择的计划并对比，再更新统计、重新执行；增加排序容量，观察 Filesort 仍存在但不再模拟落盘。',
      tone: reached ? 'success' : 'neutral',
    },
    goal: {
      label: '完成查询并实际比较三种连接，再更新统计重新执行，解释估计、连接工作量与排序的区别。',
      reached,
    },
    log: s.log,
  }
}
export const executionEngine: EngineFactory = () =>
  createSession(initialExecution, executionTransition, presentExecution)
