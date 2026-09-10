import type {
  EngineFactory,
  ExperimentAction,
  ExperimentView,
  Observation,
  TreeScene,
} from '../../types/experiment'
import { addLog, createSession, integer } from '../core/session'
import {
  allKeys,
  allNodes,
  createBPlus,
  deleteBPlus,
  insertBPlus,
  rangeBPlus,
  searchBPlus,
} from '../structures/bplus-tree'
import type { BPlusNode, BPlusTree, Mutation } from '../structures/bplus-tree'

export interface BtreeState {
  tree: BPlusTree
  key: number
  upper: number
  path: string[]
  found: number | null
  splits: number
  merges: number
  borrows: number
  searched: boolean
  log: Observation[]
}
export function initialBtree(): BtreeState {
  return {
    tree: createBPlus([10, 20, 30, 40, 50, 60, 70, 80]),
    key: 5,
    upper: 55,
    path: [],
    found: null,
    splits: 0,
    merges: 0,
    borrows: 0,
    searched: false,
    log: [],
  }
}
const examples = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95]
export function transitionBtree(state: BtreeState, action: ExperimentAction): BtreeState {
  const s = structuredClone(state)
  if (action.type === 'key') {
    s.key = integer(action.value, 0, 999, s.key)
    return s
  }
  if (action.type === 'upper') {
    s.upper = integer(action.value, 0, 999, s.upper)
    return s
  }
  if (action.type === 'clear')
    return {
      ...initialBtree(),
      tree: createBPlus(),
      log: addLog([], '空树', '从一个空叶子开始构建。重置实验可以恢复示例树。'),
    }
  if (action.type === 'search') {
    const result = searchBPlus(s.tree, s.key)
    s.path = result.path
    s.found = result.found ? s.key : null
    s.searched ||= result.found
    s.log = addLog(
      s.log,
      result.found ? '找到记录 ' + s.key : '未找到 ' + s.key,
      '访问路径：' +
        result.path.join(' → ') +
        '。读取 ' +
        result.path.length +
        ' 个节点；即使匹配内部键，也要到叶子取记录。',
      result.found ? 'success' : 'warning',
    )
    return s
  }
  if (action.type === 'range') {
    if (s.key > s.upper) {
      s.log = addLog(s.log, '范围需要调整', '范围起点必须小于或等于终点。', 'warning')
      return s
    }
    const result = rangeBPlus(s.tree, s.key, s.upper)
    s.path = result.path
    s.found = null
    s.log = addLog(
      s.log,
      '范围 [' + s.key + ', ' + s.upper + ']',
      '先定位起点所在叶子，再沿叶子链表读取：[' +
        result.values.join(', ') +
        ']。无需为每条记录重新从根查找。',
      'success',
    )
    return s
  }
  let mutation: Mutation
  if (action.type === 'insert' || action.type === 'example') {
    if (allKeys(s.tree).length >= 64) {
      s.log = addLog(
        s.log,
        '可视化容量已达 64 条',
        '可以删除记录或清空树后继续实验。64 条是界面的可读性限制，不是 B+Tree 的算法上限。',
        'warning',
      )
      return s
    }
    if (action.type === 'example') s.key = examples.find((k) => !searchBPlus(s.tree, k).found) ?? s.key
    mutation = insertBPlus(s.tree, s.key)
  } else if (action.type === 'delete') mutation = deleteBPlus(s.tree, s.key)
  else return state
  s.tree = mutation.tree
  s.path = searchBPlus(s.tree, s.key).path
  s.found = action.type === 'delete' ? null : s.key
  for (const event of mutation.events) {
    if (event.type === 'split') s.splits++
    if (event.type === 'merge') s.merges++
    if (event.type === 'borrow') s.borrows++
    const labels = {
      insert: 'Insert',
      delete: 'Delete',
      split: 'Node Split · 节点分裂',
      merge: 'Node Merge · 节点合并',
      borrow: 'Redistribute · 兄弟借位',
      'root-grow': '新根',
      'root-shrink': '根收缩',
      duplicate: '重复键',
      missing: '键不存在',
    }
    s.log = addLog(
      s.log,
      labels[event.type],
      event.detail,
      event.type === 'split' || event.type === 'merge' || event.type === 'borrow'
        ? 'warning'
        : mutation.changed
          ? 'success'
          : 'neutral',
    )
  }
  return s
}
export function treeScene(s: BtreeState): TreeScene {
  const scene: TreeScene = {
    kind: 'tree',
    width: 640,
    height: 155,
    nodes: [],
    edges: [],
    leafLinks: [],
    path: s.path,
    found: s.found,
  }
  let leaves = 0
  let deepest = 0
  function place(n: BPlusNode, depth: number): number {
    deepest = Math.max(deepest, depth)
    let x: number
    if (n.leaf) {
      x = 80 + leaves++ * 145
      if (n.next) scene.leafLinks.push({ from: n.id, to: n.next })
    } else {
      const xs = n.children.map((child) => {
        scene.edges.push({ from: n.id, to: child.id })
        return place(child, depth + 1)
      })
      x = (xs[0]! + xs.at(-1)!) / 2
    }
    scene.nodes.push({
      id: n.id,
      keys: n.keys,
      leaf: n.leaf,
      x,
      y: 30 + depth * 105,
      width: Math.max(54, n.keys.length * 35 + 15),
    })
    return x
  }
  place(s.tree.root, 0)
  const contentWidth = 160 + (leaves - 1) * 145
  scene.width = Math.max(640, contentWidth)
  scene.height = (deepest + 1) * 105 + 20
  for (const node of scene.nodes) node.x += (scene.width - contentWidth) / 2
  return scene
}
export function presentBtree(s: BtreeState): ExperimentView {
  let height = 1
  let n = s.tree.root
  while (!n.leaf) {
    height++
    n = n.children[0]!
  }
  const nextExample = examples.find((k) => !searchBPlus(s.tree, k).found)
  return {
    scene: treeScene(s),
    controls: [
      { id: 'key', kind: 'number', label: 'Key / 范围起点', value: s.key, min: 0, max: 999 },
      { id: 'upper', kind: 'number', label: '范围终点', value: s.upper, min: 0, max: 999 },
      { id: 'insert', kind: 'button', label: 'Insert · 插入', primary: true },
      { id: 'search', kind: 'button', label: 'Search · 查找' },
      { id: 'delete', kind: 'button', label: 'Delete · 删除' },
      { id: 'range', kind: 'button', label: 'Range · 范围查询' },
      {
        id: 'example',
        kind: 'button',
        label: nextExample === undefined ? '示例值已插入' : '插入示例 ' + nextExample,
        disabled: nextExample === undefined,
      },
      { id: 'clear', kind: 'button', label: '清空树' },
    ],
    metrics: [
      { label: '叶子记录', value: allKeys(s.tree).length },
      { label: '树高 / 层', value: height },
      { label: '节点总数', value: allNodes(s.tree).length },
      { label: 'Split / Merge / Borrow', value: s.splits + ' / ' + s.merges + ' / ' + s.borrows },
    ],
    status: {
      title: s.log.at(-1)?.label ?? '更多分支，更少层级。',
      detail:
        s.log.at(-1)?.detail ?? '先插入示例 5、15，观察叶子和根分裂。查找 15，再删除它，观察节点如何合并。',
      tone: s.log.at(-1)?.tone ?? 'neutral',
    },
    log: s.log,
    goal: {
      label: '触发一次分裂，成功查找一个键，再通过删除触发一次合并。',
      reached: s.splits > 0 && s.searched && s.merges > 0,
    },
  }
}
export const btreeEngine: EngineFactory = () => createSession(initialBtree, transitionBtree, presentBtree)
