/** Order 4: max 4 children / 3 keys per node; records live only in leaves. */
export const ORDER = 4
export const MAX_KEYS = ORDER - 1
export const MIN_LEAF_KEYS = Math.ceil(MAX_KEYS / 2)
export const MIN_CHILDREN = Math.ceil(ORDER / 2)
export interface BPlusNode { id: string; leaf: boolean; keys: number[]; children: BPlusNode[]; next: string | null }
export interface BPlusTree { root: BPlusNode; nextId: number }
export interface TreeEvent { type: 'insert' | 'delete' | 'split' | 'merge' | 'borrow' | 'root-grow' | 'root-shrink' | 'duplicate' | 'missing'; detail: string }
export interface Mutation { tree: BPlusTree; events: TreeEvent[]; changed: boolean }
function newNode(tree: BPlusTree, leaf: boolean): BPlusNode {
  return { id: 'n' + tree.nextId++, leaf, keys: [], children: [], next: null }
}
export function minimum(node: BPlusNode): number {
  let n = node
  while (!n.leaf) n = n.children[0]!
  const key = n.keys[0]
  if (key === undefined) throw new Error('Only the root leaf may be empty')
  return key
}
function refresh(node: BPlusNode) {
  if (!node.leaf) node.keys = node.children.slice(1).map(minimum)
}
export function allNodes(tree: BPlusTree): BPlusNode[] {
  const nodes: BPlusNode[] = []
  const walk = (n: BPlusNode) => { nodes.push(n); for (const child of n.children) walk(child) }
  walk(tree.root)
  return nodes
}
export function allKeys(tree: BPlusTree): number[] {
  return allNodes(tree).filter(n => n.leaf).flatMap(n => n.keys)
}
function childIndex(node: BPlusNode, key: number): number {
  // A separator is the minimum key of its RIGHT subtree: equality goes right.
  const index = node.keys.findIndex(separator => key < separator)
  return index === -1 ? node.keys.length : index
}
export function searchBPlus(tree: BPlusTree, key: number): { found: boolean; leaf: BPlusNode; path: string[] } {
  let node = tree.root
  const path = [node.id]
  while (!node.leaf) { node = node.children[childIndex(node, key)]!; path.push(node.id) }
  return { found: node.keys.includes(key), leaf: node, path }
}
export function insertBPlus(original: BPlusTree, key: number): Mutation {
  const tree = structuredClone(original)
  const events: TreeEvent[] = []
  if (!Number.isSafeInteger(key)) throw new Error('Keys must be safe integers')
  if (searchBPlus(tree, key).found) return { tree, events: [{ type: 'duplicate', detail: '键 ' + key + ' 已存在。本模型使用唯一键，不重复插入。' }], changed: false }
  function insert(node: BPlusNode): BPlusNode | null {
    if (node.leaf) {
      node.keys.push(key)
      node.keys.sort((a, b) => a - b)
      events.push({ type: 'insert', detail: '把记录 ' + key + ' 插入叶子 ' + node.id + '，保持键有序。' })
      if (node.keys.length <= MAX_KEYS) return null
      const right = newNode(tree, true)
      right.keys = node.keys.splice(Math.ceil(node.keys.length / 2))
      right.next = node.next
      node.next = right.id
      events.push({ type: 'split', detail: '叶子超过 3 个键，分裂为 [' + node.keys.join(', ') + '] 与 [' + right.keys.join(', ') + ']；右叶最小键 ' + right.keys[0] + ' 成为父节点的导航边界。' })
      return right
    }
    const index = childIndex(node, key)
    const sibling = insert(node.children[index]!)
    if (sibling) node.children.splice(index + 1, 0, sibling)
    refresh(node)
    if (node.children.length <= ORDER) return null
    const right = newNode(tree, false)
    right.children = node.children.splice(Math.ceil(node.children.length / 2))
    refresh(node)
    refresh(right)
    events.push({ type: 'split', detail: '内部节点超过 4 个孩子，向上分裂。叶子层仍然保持相同深度。' })
    return right
  }
  const sibling = insert(tree.root)
  if (sibling) {
    const root = newNode(tree, false)
    root.children = [tree.root, sibling]
    refresh(root)
    tree.root = root
    events.push({ type: 'root-grow', detail: '根节点分裂，创建新根；树高增加一层。' })
  }
  return { tree, events, changed: true }
}
function underfull(node: BPlusNode): boolean {
  return node.leaf ? node.keys.length < MIN_LEAF_KEYS : node.children.length < MIN_CHILDREN
}
function canLend(node: BPlusNode): boolean {
  return node.leaf ? node.keys.length > MIN_LEAF_KEYS : node.children.length > MIN_CHILDREN
}
export function deleteBPlus(original: BPlusTree, key: number): Mutation {
  const tree = structuredClone(original)
  const events: TreeEvent[] = []
  if (!searchBPlus(tree, key).found) return { tree, events: [{ type: 'missing', detail: '键 ' + key + ' 不存在，树结构不变。' }], changed: false }
  function rebalance(parent: BPlusNode, index: number) {
    const node = parent.children[index]!
    if (!underfull(node)) return
    const left = parent.children[index - 1]
    const right = parent.children[index + 1]
    if (left && canLend(left)) {
      if (node.leaf) node.keys.unshift(left.keys.pop()!)
      else node.children.unshift(left.children.pop()!)
      refresh(left)
      refresh(node)
      events.push({ type: 'borrow', detail: '从左兄弟借一个' + (node.leaf ? '记录' : '子树') + '，补足最小占用，并更新父节点分隔键。' })
    } else if (right && canLend(right)) {
      if (node.leaf) node.keys.push(right.keys.shift()!)
      else node.children.push(right.children.shift()!)
      refresh(right)
      refresh(node)
      events.push({ type: 'borrow', detail: '从右兄弟借一个' + (node.leaf ? '记录' : '子树') + '，保持节点有序和各层平衡。' })
    } else if (left) {
      if (node.leaf) { left.keys.push(...node.keys); left.next = node.next }
      else left.children.push(...node.children)
      parent.children.splice(index, 1)
      refresh(left)
      events.push({ type: 'merge', detail: '兄弟没有多余容量，将 ' + node.id + ' 合并进左兄弟 ' + left.id + '。' + (node.leaf ? '同时修复叶子链表。' : '父层可能继续向上合并。') })
    } else if (right) {
      if (node.leaf) { node.keys.push(...right.keys); node.next = right.next }
      else node.children.push(...right.children)
      parent.children.splice(index + 1, 1)
      refresh(node)
      events.push({ type: 'merge', detail: '右兄弟 ' + right.id + ' 并入 ' + node.id + '，父节点移除对应导航边界。' })
    }
    refresh(parent)
  }
  function remove(node: BPlusNode) {
    if (node.leaf) {
      node.keys.splice(node.keys.indexOf(key), 1)
      events.push({ type: 'delete', detail: '从叶子 ' + node.id + ' 移除记录 ' + key + '。内部导航键不是另一份数据记录。' })
      return
    }
    const index = childIndex(node, key)
    remove(node.children[index]!)
    rebalance(node, index)
    refresh(node)
  }
  remove(tree.root)
  if (!tree.root.leaf && tree.root.children.length === 1) {
    tree.root = tree.root.children[0]!
    events.push({ type: 'root-shrink', detail: '根只剩一个孩子，提升该孩子作为新根；树高降低。' })
  }
  return { tree, events, changed: true }
}
export function createBPlus(keys: readonly number[] = []): BPlusTree {
  let tree: BPlusTree = { root: { id: 'n0', leaf: true, keys: [], children: [], next: null }, nextId: 1 }
  for (const key of keys) tree = insertBPlus(tree, key).tree
  return tree
}
export function rangeBPlus(tree: BPlusTree, low: number, high: number): { values: number[]; path: string[] } {
  if (low > high) return { values: [], path: [] }
  const first = searchBPlus(tree, low)
  const path = [...first.path]
  const values: number[] = []
  const byId = new Map(allNodes(tree).map(n => [n.id, n]))
  let leaf: BPlusNode | undefined = first.leaf
  while (leaf) {
    if (!path.includes(leaf.id)) path.push(leaf.id)
    for (const key of leaf.keys) {
      if (key > high) return { values, path }
      if (key >= low) values.push(key)
    }
    leaf = leaf.next ? byId.get(leaf.next) : undefined
  }
  return { values, path }
}
