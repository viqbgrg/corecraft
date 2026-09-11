import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
import {
  allNodes,
  createBPlus,
  deleteBPlus,
  insertBPlus,
  rangeBPlus,
  searchBPlus,
  type BPlusTree,
} from '../structures/bplus-tree'

export interface InnoRow {
  id: number
  region: number
  amount: number
}
export type InnoProjection = 'full' | 'covered'
export interface IndexTrace {
  tree: 'clustered' | 'secondary'
  node: string
  detail: string
  row?: { id: number; region: number; amount?: number }
}
export interface InnoIndexRun {
  mode: 'primary' | 'secondary'
  projection: InnoProjection
  trace: IndexTrace[]
  rows: { id: number; region: number; amount?: number }[]
  lookups: number
}
export interface InnoIndexState {
  rows: InnoRow[]
  clustered: BPlusTree
  secondary: BPlusTree
  id: number
  region: number
  amount: number
  mode: 'primary' | 'secondary'
  projection: InnoProjection
  run: InnoIndexRun | null
  cursor: number
  primaryRead: boolean
  secondaryRead: boolean
  comparison: InnoIndexRun[]
  error: string | null
  log: Observation[]
}
const secondaryKey = (row: { id: number; region: number }) => row.region * 100 + row.id
export function initialInnoIndexes(id = 30, region = 1): InnoIndexState {
  if (boundedInteger(id, 1, 99) === null || boundedInteger(region, 1, 3) === null)
    throw new Error('InnoDB index model requires id 1–99 and region 1–3')
  const regions = [1, 2, 1, 3, 2, 1, 3, 2, 1]
  const rows = regions.map((region, i) => ({ id: (i + 1) * 10, region, amount: (i + 1) * 100 }))
  return {
    rows,
    clustered: createBPlus(rows.map((row) => row.id)),
    secondary: createBPlus(rows.map(secondaryKey)),
    id,
    region,
    amount: 250,
    mode: 'primary',
    projection: 'full',
    run: null,
    cursor: 0,
    primaryRead: false,
    secondaryRead: false,
    comparison: [],
    error: null,
    log: [],
  }
}
export function runInnoIndex(s: InnoIndexState, mode = s.mode, projection = s.projection): InnoIndexRun {
  const trace: IndexTrace[] = [],
    rows: InnoIndexRun['rows'] = [],
    payload = new Map(s.rows.map((row) => [row.id, row]))
  let lookups = 0
  const primaryLookup = (id: number, secondaryLookup: boolean) => {
    const result = searchBPlus(s.clustered, id),
      nodes = allNodes(s.clustered)
    if (secondaryLookup) lookups++
    for (const nodeId of result.path) {
      const node = nodes.find((node) => node.id === nodeId)!
      trace.push({
        tree: 'clustered',
        node: nodeId,
        detail: `${secondaryLookup ? '按二级叶项中的主键回表' : '主键查询'} id=${id}，${node.leaf ? '聚簇叶子保存完整记录' : '内部节点只用于导航'} [${node.keys.join(', ')}]。`,
      })
    }
    if (result.found) {
      const row = { ...payload.get(id)! }
      rows.push(row)
      trace[trace.length - 1]!.row = row
    }
  }
  if (mode === 'primary') primaryLookup(s.id, false)
  else {
    const low = s.region * 100,
      high = low + 99,
      result = rangeBPlus(s.secondary, low, high),
      nodes = allNodes(s.secondary)
    for (const nodeId of result.path) {
      const node = nodes.find((node) => node.id === nodeId)!
      trace.push({
        tree: 'secondary',
        node: nodeId,
        detail: `${node.leaf ? '二级叶子' : '二级内部导航'}：(region,id)=[${node.keys.map((key) => `(${Math.floor(key / 100)},${key % 100})`).join(', ')}]。`,
      })
      if (!node.leaf) continue
      for (const key of node.keys.filter((key) => key >= low && key <= high)) {
        const id = key % 100
        if (projection === 'full') primaryLookup(id, true)
        else {
          const row = { id, region: Math.floor(key / 100) }
          rows.push(row)
          trace.push({
            tree: 'secondary',
            node: nodeId,
            detail: `覆盖查询直接从二级叶项得到 id=${id}、region=${row.region}，不读取 amount。`,
            row,
          })
        }
      }
    }
  }
  return { mode, projection, trace, rows, lookups }
}
export function innoIndexesTransition(s: InnoIndexState, a: ExperimentAction): InnoIndexState {
  if (['id', 'region', 'amount'].includes(a.type)) {
    const value = boundedInteger(
      a.value,
      a.type === 'amount' ? 0 : 1,
      a.type === 'id' ? 99 : a.type === 'region' ? 3 : 999,
    )
    return value === null ? s : { ...s, [a.type]: value, run: null, cursor: 0, comparison: [], error: null }
  }
  if (a.type === 'mode' && ['primary', 'secondary'].includes(String(a.value)))
    return {
      ...s,
      mode: a.value as InnoIndexState['mode'],
      run: null,
      cursor: 0,
      comparison: [],
      error: null,
    }
  if (a.type === 'projection' && ['full', 'covered'].includes(String(a.value)))
    return { ...s, projection: a.value as InnoProjection, run: null, cursor: 0, comparison: [], error: null }
  if (a.type === 'insert' || a.type === 'delete') {
    const existing = s.rows.find((row) => row.id === s.id)
    if (a.type === 'insert' && existing) return { ...s, error: '聚簇主键必须唯一，重复主键被拒绝。' }
    if (a.type === 'delete' && !existing) return { ...s, error: '没有这个主键，两个索引均保持不变。' }
    if (a.type === 'insert' && s.rows.length >= 12) return { ...s, error: '教学表最多 12 条记录。' }
    const row = a.type === 'insert' ? { id: s.id, region: s.region, amount: s.amount } : existing!
    const mutate = a.type === 'insert' ? insertBPlus : deleteBPlus
    const clustered = mutate(s.clustered, row.id),
      secondary = mutate(s.secondary, secondaryKey(row))
    return {
      ...s,
      rows: a.type === 'insert' ? [...s.rows, row] : s.rows.filter((entry) => entry.id !== row.id),
      clustered: clustered.tree,
      secondary: secondary.tree,
      run: null,
      cursor: 0,
      primaryRead: false,
      secondaryRead: false,
      comparison: [],
      error: null,
      log: addLog(
        s.log,
        '同时维护两棵索引',
        `${a.type === 'insert' ? '插入' : '删除'}主键 ${row.id} 与二级键 (${row.region},${row.id})；聚簇事件：${clustered.events.map((e) => e.type).join(', ')}；二级事件：${secondary.events.map((e) => e.type).join(', ')}。`,
        'success',
      ),
    }
  }
  if (a.type === 'compare')
    return {
      ...s,
      comparison: [runInnoIndex(s, 'secondary', 'full'), runInnoIndex(s, 'secondary', 'covered')],
      error: null,
      log: addLog(
        s.log,
        '相同条件比较字段覆盖',
        `两组都查询 region=${s.region}，完整字段需要通过主键回表；id 与 region 已包含在二级叶项。`,
      ),
    }
  if (a.type === 'step' || a.type === 'run') {
    const run = s.run ?? runInnoIndex(s),
      cursor = a.type === 'run' ? run.trace.length : Math.min(s.cursor + 1, run.trace.length),
      done = cursor === run.trace.length
    return {
      ...s,
      run,
      cursor,
      primaryRead: s.primaryRead || (done && run.mode === 'primary' && run.rows.length > 0),
      secondaryRead: s.secondaryRead || (done && run.mode === 'secondary' && run.rows.length > 0),
      error: null,
      log: addLog(
        s.log,
        done ? '查询完成' : `节点访问 ${cursor}`,
        done
          ? `返回 ${run.rows.length} 条记录；按二级叶项主键回表 ${run.lookups} 次。`
          : run.trace[cursor - 1]!.detail,
        done ? 'success' : 'neutral',
      ),
    }
  }
  return s
}
export function presentInnoIndexes(s: InnoIndexState): ExperimentView {
  const visible = s.run?.trace.slice(0, s.cursor) ?? [],
    results = visible.flatMap((entry) => (entry.row ? [entry.row] : [])),
    done = !!s.run && s.cursor === s.run.trace.length
  const reached =
    s.primaryRead &&
    s.secondaryRead &&
    s.comparison.length === 2 &&
    s.comparison[0]!.lookups > 0 &&
    s.comparison[1]!.lookups === 0
  return {
    scene: {
      kind: 'data',
      title: '聚簇叶子放整行，二级叶子携带主键',
      tables: [
        {
          id: 'innodb-clustered',
          title: '主键聚簇 B+Tree',
          columns: ['节点', '类型', '键', '叶子记录 / 子节点'],
          rows: allNodes(s.clustered).map((node) => ({
            id: node.id,
            values: [
              node.id,
              node.leaf ? '叶子' : '内部',
              node.keys.join(', ') || '空',
              node.leaf
                ? node.keys
                    .map((id) => {
                      const row = s.rows.find((row) => row.id === id)!
                      return `${id} → region=${row.region}, amount=${row.amount}`
                    })
                    .join('\n') || '空'
                : node.children.map((child) => child.id).join(', '),
            ],
          })),
        },
        {
          id: 'innodb-secondary',
          title: '二级 B+Tree / idx_region，主键 id 隐含在叶项中',
          columns: ['节点', '类型', '(region, id)', '子节点'],
          rows: allNodes(s.secondary).map((node) => ({
            id: node.id,
            values: [
              node.id,
              node.leaf ? '叶子' : '内部',
              node.keys.map((key) => `(${Math.floor(key / 100)}, ${key % 100})`).join(', ') || '空',
              node.children.map((child) => child.id).join(', ') || '—',
            ],
          })),
        },
        {
          id: 'innodb-query-trace',
          title: '查询节点访问 / 最近 20 步',
          columns: ['索引', '节点', '发生了什么'],
          rows: visible
            .slice(-20)
            .map((entry, i) => ({ id: String(i), values: [entry.tree, entry.node, entry.detail] })),
        },
        {
          id: 'innodb-query-result',
          title: '实际读取的字段',
          columns: ['id', 'region', 'amount'],
          rows: results.map((row) => ({
            id: String(row.id),
            values: [row.id, row.region, row.amount ?? '覆盖查询未读取'],
          })),
        },
        {
          id: 'innodb-covering',
          title: '相同 region 条件的完整字段与覆盖字段对照',
          columns: ['字段', '返回记录', '回表次数', '逻辑节点 / 返回访问'],
          rows: s.comparison.map((run) => ({
            id: run.projection,
            values: [
              run.projection === 'full' ? 'id, region, amount' : 'id, region',
              run.rows.length,
              run.lookups,
              run.trace.length,
            ],
          })),
        },
      ],
      caption:
        'MySQL InnoDB 的教学布局：主键叶项关联完整行，二级叶项关联主键，而不是堆表物理 RID。两棵树固定 4 阶，不模拟真实 16 KiB 页、MVCC 可见性检查、缓存 IO、Change Buffer 或并发索引维护。逻辑访问次数不等于磁盘 IO 次数。',
    },
    metrics: [
      { label: '表记录数', value: s.rows.length },
      { label: '已读取记录', value: results.length },
      { label: '逻辑访问步骤', value: `${s.cursor} / ${s.run?.trace.length ?? '—'}` },
      { label: '完成查询的回表次数', value: done ? s.run!.lookups : '—' },
    ],
    controls: [
      {
        id: 'mode',
        kind: 'select',
        label: 'InnoDB 查询入口',
        value: s.mode,
        options: [
          { value: 'primary', label: '主键 id 点查询' },
          { value: 'secondary', label: '二级 region 范围查询' },
        ],
      },
      { id: 'id', kind: 'number', label: '主键 id / 增删对象', value: s.id, min: 1, max: 99 },
      { id: 'region', kind: 'number', label: 'region 条件 / 插入字段', value: s.region, min: 1, max: 3 },
      { id: 'amount', kind: 'number', label: '插入 amount', value: s.amount, min: 0, max: 999 },
      {
        id: 'projection',
        kind: 'select',
        label: '二级查询需要的字段',
        value: s.projection,
        disabled: s.mode === 'primary',
        options: [
          { value: 'full', label: 'id, region, amount / 需要回表' },
          { value: 'covered', label: 'id, region / 索引覆盖' },
        ],
      },
      { id: 'step', kind: 'button', label: '推进一个索引访问', primary: true, disabled: done },
      { id: 'run', kind: 'button', label: '执行当前索引查询', disabled: done },
      { id: 'compare', kind: 'button', label: '对比覆盖查询与回表' },
      { id: 'insert', kind: 'button', label: '插入行并维护两个索引' },
      { id: 'delete', kind: 'button', label: '删除行并维护两个索引' },
    ],
    status: {
      title: s.error
        ? '检查索引操作'
        : reached
          ? '索引记录布局决定后续访问'
          : '二级索引命中后可能还需查一次主键树',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先执行默认主键查询，再切换 region 二级查询，比较是否需要 amount 字段造成的回表差异。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '成功执行主键与二级查询，并对比相同条件下有回表和无回表的字段覆盖路径。', reached },
    log: s.log,
  }
}
export const innoIndexesEngine: EngineFactory = (config) =>
  createSession(
    () => initialInnoIndexes(Number(config.id ?? 30), Number(config.region ?? 1)),
    innoIndexesTransition,
    presentInnoIndexes,
  )
