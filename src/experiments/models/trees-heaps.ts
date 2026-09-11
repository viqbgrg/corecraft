import type {
  EngineFactory,
  ExperimentAction,
  ExperimentView,
  Observation,
  TreeScene,
} from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export interface BstNode {
  id: number
  key: number
  left: number | null
  right: number | null
}
export interface Bst {
  root: number | null
  nextId: number
  nodes: BstNode[]
}
export type OrderedStorage = { kind: 'bst'; tree: Bst } | { kind: 'heap'; values: number[] }
export interface TreesState {
  storage: OrderedStorage
  key: number
  path: number[]
  found: number | null
  inserted: boolean
  read: boolean
  removed: boolean
  log: Observation[]
}
export function findBst(tree: Bst, key: number) {
  const path: number[] = []
  let id = tree.root
  while (id !== null) {
    const node = tree.nodes.find((n) => n.id === id)!
    path.push(id)
    if (node.key === key) return { found: id, path }
    id = key < node.key ? node.left : node.right
  }
  return { found: null, path }
}
export function insertBst(tree: Bst, key: number) {
  const search = findBst(tree, key)
  if (search.found !== null) return { tree, path: search.path, changed: false }
  const result = { ...tree, nodes: tree.nodes.map((n) => ({ ...n })) },
    id = result.nextId++
  if (result.root === null) result.root = id
  else {
    const parent = result.nodes.find((n) => n.id === search.path.at(-1))!
    if (key < parent.key) parent.left = id
    else parent.right = id
  }
  result.nodes.push({ id, key, left: null, right: null })
  return { tree: result, path: [...search.path, id], changed: true }
}
export function deleteBst(tree: Bst, key: number) {
  const search = findBst(tree, key)
  if (search.found === null) return { tree, path: search.path, changed: false }
  const result = { ...tree, nodes: tree.nodes.map((n) => ({ ...n })) },
    path = [...search.path]
  let node = result.nodes.find((n) => n.id === search.found)!,
    parent = result.nodes.find((n) => n.id === search.path.at(-2)) ?? null
  if (node.left !== null && node.right !== null) {
    let successor = result.nodes.find((n) => n.id === node.right)!,
      successorParent = node
    path.push(successor.id)
    while (successor.left !== null) {
      successorParent = successor
      successor = result.nodes.find((n) => n.id === successor.left)!
      path.push(successor.id)
    }
    node.key = successor.key
    node = successor
    parent = successorParent
  }
  const child = node.left ?? node.right
  if (!parent) result.root = child
  else if (parent.left === node.id) parent.left = child
  else parent.right = child
  result.nodes = result.nodes.filter((n) => n.id !== node.id)
  return { tree: result, path, changed: true }
}
export function heapInsert(input: number[], key: number) {
  const values = [...input, key],
    path: number[] = []
  let i = values.length - 1
  path.push(i)
  while (i > 0) {
    const parent = Math.floor((i - 1) / 2)
    path.push(parent)
    if (values[parent]! <= values[i]!) break
    ;[values[i], values[parent]] = [values[parent]!, values[i]!]
    i = parent
  }
  return { values, path }
}
export function heapRemove(input: number[]) {
  if (!input.length) return { values: [] as number[], path: [] as number[], removed: null }
  const values = [...input],
    removed = values[0]!,
    last = values.pop()!,
    path: number[] = []
  if (values.length) {
    values[0] = last
    let i = 0
    path.push(i)
    while (2 * i + 1 < values.length) {
      let smaller = 2 * i + 1
      if (smaller + 1 < values.length && values[smaller + 1]! < values[smaller]!) smaller++
      path.push(smaller)
      if (values[i]! <= values[smaller]!) break
      ;[values[i], values[smaller]] = [values[smaller]!, values[i]!]
      i = smaller
    }
  }
  return { values, path, removed }
}
export function initialTrees(kind: OrderedStorage['kind'] = 'bst'): TreesState {
  if (!['bst', 'heap'].includes(kind)) throw new Error('Ordered trees require bst or heap')
  const values = [40, 20, 60, 10, 30, 50, 70]
  const storage: OrderedStorage =
    kind === 'bst'
      ? {
          kind,
          tree: values.reduce((tree, value) => insertBst(tree, value).tree, {
            root: null,
            nextId: 0,
            nodes: [],
          } as Bst),
        }
      : { kind, values: values.reduce((heap, value) => heapInsert(heap, value).values, [] as number[]) }
  return { storage, key: 25, path: [], found: null, inserted: false, read: false, removed: false, log: [] }
}
export function treesTransition(s: TreesState, a: ExperimentAction): TreesState {
  if (a.type === 'kind' && ['bst', 'heap'].includes(String(a.value)))
    return initialTrees(a.value as OrderedStorage['kind'])
  if (a.type === 'key') {
    const key = boundedInteger(a.value, -99, 99)
    return key === null ? s : { ...s, key }
  }
  if (!['insert', 'read', 'remove'].includes(a.type)) return s
  const length = s.storage.kind === 'bst' ? s.storage.tree.nodes.length : s.storage.values.length
  if ((a.type === 'insert' && length >= 15) || (a.type !== 'insert' && !length)) return s
  if (s.storage.kind === 'bst') {
    if (a.type === 'read') {
      const result = findBst(s.storage.tree, s.key)
      return {
        ...s,
        path: result.path,
        found: result.found === null ? null : s.key,
        read: s.read || result.found !== null,
        log: addLog(
          s.log,
          result.found === null ? '键不存在' : `找到 ${s.key}`,
          `沿大小关系访问 ${result.path.length} 个节点。`,
          result.found === null ? 'warning' : 'success',
        ),
      }
    }
    const result = a.type === 'insert' ? insertBst(s.storage.tree, s.key) : deleteBst(s.storage.tree, s.key)
    return {
      ...s,
      storage: { kind: 'bst', tree: result.tree },
      path: result.path,
      found: null,
      inserted: s.inserted || (a.type === 'insert' && result.changed),
      removed: s.removed || (a.type === 'remove' && result.changed),
      log: addLog(
        s.log,
        result.changed ? `${a.type === 'insert' ? '插入' : '删除'} ${s.key}` : '键集合未改变',
        a.type === 'insert'
          ? '按大小关系定位空链接；重复键不创建第二个节点。'
          : '双子节点用右子树最小键替换，再删除其原节点；单子节点直接接回父节点。',
        result.changed ? 'success' : 'warning',
      ),
    }
  }
  if (a.type === 'read')
    return {
      ...s,
      found: s.storage.values[0]!,
      path: [0],
      read: true,
      log: addLog(
        s.log,
        `最小值 ${s.storage.values[0]}`,
        '堆顶可直接读取；其他位置没有完整的左右大小顺序。',
        'success',
      ),
    }
  const result = a.type === 'insert' ? heapInsert(s.storage.values, s.key) : heapRemove(s.storage.values)
  return {
    ...s,
    storage: { kind: 'heap', values: result.values },
    path: result.path,
    found: null,
    inserted: s.inserted || a.type === 'insert',
    removed: s.removed || a.type === 'remove',
    log: addLog(
      s.log,
      a.type === 'insert' ? `插入 ${s.key} 并上浮` : `移除堆顶 ${s.storage.values[0]} 并下沉`,
      '最小堆要求父节点不大于子节点；数组下标对应完全二叉树的位置。',
      'success',
    ),
  }
}
export function orderedScene(s: TreesState): TreeScene {
  const storage = s.storage
  const records: BstNode[] =
    storage.kind === 'bst'
      ? storage.tree.nodes
      : storage.values.map((key, id) => ({
          id,
          key,
          left: id * 2 + 1 < storage.values.length ? id * 2 + 1 : null,
          right: id * 2 + 2 < storage.values.length ? id * 2 + 2 : null,
        }))
  const root = s.storage.kind === 'bst' ? s.storage.tree.root : records.length ? 0 : null
  const nodes: TreeScene['nodes'] = [],
    edges: TreeScene['edges'] = []
  let x = 0,
    maxDepth = 0
  const walk = (id: number | null, depth: number) => {
    if (id === null) return
    const node = records.find((n) => n.id === id)!
    walk(node.left, depth + 1)
    maxDepth = Math.max(maxDepth, depth)
    nodes.push({
      id: String(id),
      keys: [node.key],
      leaf: node.left === null && node.right === null,
      x: 30 + x++ * 76,
      y: 30 + depth * 76,
      width: 54,
    })
    for (const child of [node.left, node.right])
      if (child !== null) edges.push({ from: String(id), to: String(child) })
    walk(node.right, depth + 1)
  }
  walk(root, 0)
  return {
    kind: 'tree',
    variant: storage.kind,
    width: Math.max(300, records.length * 76 + 45),
    height: Math.max(140, (maxDepth + 1) * 76 + 35),
    nodes,
    edges,
    leafLinks: [],
    path: s.path.map(String),
    found: s.found,
  }
}
export function presentTrees(s: TreesState): ExperimentView {
  const bst = s.storage.kind === 'bst',
    count =
      bst && s.storage.kind === 'bst'
        ? s.storage.tree.nodes.length
        : s.storage.kind === 'heap'
          ? s.storage.values.length
          : 0
  return {
    scene: orderedScene(s),
    metrics: [
      { label: '结构', value: bst ? '二叉搜索树' : '最小堆' },
      { label: '节点数', value: count },
      { label: '本次路径长度', value: s.path.length },
      { label: '读取结果', value: s.found ?? '—' },
    ],
    controls: [
      {
        id: 'kind',
        kind: 'select',
        label: '树的约束',
        value: s.storage.kind,
        options: [
          { value: 'bst', label: 'BST · 左小右大' },
          { value: 'heap', label: 'Min Heap · 父不大于子' },
        ],
      },
      { id: 'key', kind: 'number', label: '操作键', value: s.key, min: -99, max: 99 },
      { id: 'insert', kind: 'button', label: '插入键', primary: true, disabled: count >= 15 },
      { id: 'read', kind: 'button', label: bst ? '按键查找' : '查看堆顶', disabled: !count },
      { id: 'remove', kind: 'button', label: bst ? '删除键' : '移除堆顶', disabled: !count },
    ],
    status: {
      title: bst ? '左子树 < 节点 < 右子树' : '父节点 ≤ 每个子节点',
      detail: s.log.at(-1)?.detail ?? '试着插入、读取和删除。二叉树描述形状，BST 与堆再施加各自的顺序约束。',
      tone: 'neutral',
    },
    goal: {
      label: bst ? '插入一个新键，成功查找一个键，再删除一个键。' : '插入一个值，读取堆顶，再移除最小值。',
      reached: s.inserted && s.read && s.removed,
    },
    log: s.log,
  }
}
export const treesEngine: EngineFactory = (config) =>
  createSession(
    () => initialTrees((config.kind ?? 'bst') as OrderedStorage['kind']),
    treesTransition,
    presentTrees,
  )
