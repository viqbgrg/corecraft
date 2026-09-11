import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export interface ListNode {
  id: number
  value: number
  next: number | null
}
export type LinearStorage =
  | { kind: 'array'; values: number[] }
  | { kind: 'linked'; head: number | null; nodes: ListNode[]; nextId: number }
export interface LinearState {
  storage: LinearStorage
  position: number
  value: number
  reads: number
  writes: number
  result: number | null
  path: number[]
  inserted: boolean
  deleted: boolean
  comparison: { name: string; reads: number; writes: number }[]
  log: Observation[]
}
export function linearValues(storage: LinearStorage): number[] {
  if (storage.kind === 'array') return [...storage.values]
  const values: number[] = []
  let id = storage.head
  while (id !== null) {
    const node = storage.nodes.find((n) => n.id === id)!
    values.push(node.value)
    id = node.next
  }
  return values
}
export function makeStorage(kind: LinearStorage['kind'], values: number[]): LinearStorage {
  return kind === 'array'
    ? { kind, values: [...values] }
    : {
        kind,
        head: values.length ? 0 : null,
        nodes: values.map((value, i) => ({ id: i, value, next: i + 1 < values.length ? i + 1 : null })),
        nextId: values.length,
      }
}
export function initialLinear(kind: LinearStorage['kind'] = 'array'): LinearState {
  if (!['array', 'linked'].includes(kind)) throw new Error('Linear storage requires array or linked')
  return {
    storage: makeStorage(kind, [10, 20, 30, 40]),
    position: 0,
    value: 25,
    reads: 0,
    writes: 0,
    result: null,
    path: [],
    inserted: false,
    deleted: false,
    comparison: [],
    log: [],
  }
}
/** Cost counts element reads/writes or node visits/link updates, excluding allocation. */
export function editLinear(
  storage: LinearStorage,
  operation: 'insert' | 'delete' | 'read',
  at: number,
  value = 0,
) {
  const length = linearValues(storage).length
  if (!Number.isInteger(at) || at < 0 || at >= length + Number(operation === 'insert')) return null
  let reads = 0,
    writes = 0,
    result: number | null = null
  const path: number[] = []
  if (storage.kind === 'array') {
    const values = [...storage.values]
    if (operation === 'insert') {
      for (let i = values.length; i > at; i--) {
        values[i] = values[i - 1]!
        reads++
        writes++
        path.push(i - 1)
      }
      values[at] = value
      writes++
    } else if (operation === 'delete') {
      result = values[at]!
      reads++
      path.push(at)
      for (let i = at; i < values.length - 1; i++) {
        values[i] = values[i + 1]!
        reads++
        writes++
        path.push(i + 1)
      }
      values.pop()
    } else {
      result = values[at]!
      reads = 1
      path.push(at)
    }
    return { storage: { kind: 'array' as const, values }, reads, writes, result, path }
  }
  const list = { ...storage, nodes: storage.nodes.map((n) => ({ ...n })) }
  let current = list.head,
    previous: ListNode | null = null
  for (let i = 0; i < at; i++) {
    previous = list.nodes.find((n) => n.id === current)!
    reads++
    path.push(previous.id)
    current = previous.next
  }
  if (operation === 'insert') {
    const node = { id: list.nextId++, value, next: current }
    list.nodes.push(node)
    if (previous) previous.next = node.id
    else list.head = node.id
    writes = 2 // new node's next and predecessor/head; payload allocation excluded
  } else {
    const node = list.nodes.find((n) => n.id === current)!
    reads++
    path.push(node.id)
    result = node.value
    if (operation === 'delete') {
      if (previous) previous.next = node.next
      else list.head = node.next
      list.nodes = list.nodes.filter((n) => n.id !== node.id)
      writes = 1
    }
  }
  return { storage: list, reads, writes, result, path }
}
export function linearTransition(s: LinearState, a: ExperimentAction): LinearState {
  if (a.type === 'kind' && ['array', 'linked'].includes(String(a.value)))
    return initialLinear(a.value as LinearStorage['kind'])
  if (a.type === 'value' || a.type === 'position') {
    const n = boundedInteger(
      a.value,
      a.type === 'value' ? -99 : 0,
      a.type === 'value' ? 99 : linearValues(s.storage).length,
    )
    return n === null ? s : { ...s, [a.type]: n, comparison: [] }
  }
  const values = linearValues(s.storage)
  if (a.type === 'compare' && values.length < 12) {
    return {
      ...s,
      comparison: (['array', 'linked'] as const).map((kind) => {
        const result = editLinear(makeStorage(kind, values), 'insert', s.position, s.value)!
        return { name: kind === 'array' ? '数组' : '单链表', reads: result.reads, writes: result.writes }
      }),
      log: addLog(
        s.log,
        '同一位置插入的代价',
        `两组都使用 [${values.join(', ')}]，在索引 ${s.position} 插入 ${s.value}；本次对照不改变当前结构。`,
        'success',
      ),
    }
  }
  if (!['insert', 'delete', 'read'].includes(a.type) || (a.type === 'insert' && values.length >= 12)) return s
  const changed = editLinear(s.storage, a.type as 'insert' | 'delete' | 'read', s.position, s.value)
  if (!changed) return s
  return {
    ...s,
    ...changed,
    comparison: a.type === 'read' ? s.comparison : [],
    position: Math.min(s.position, linearValues(changed.storage).length),
    inserted: s.inserted || a.type === 'insert',
    deleted: s.deleted || a.type === 'delete',
    log: addLog(
      s.log,
      `${a.type === 'insert' ? '插入' : a.type === 'delete' ? '删除' : '读取'}索引 ${s.position}`,
      `读取 / 节点访问 ${changed.reads} 次，元素 / 链接写入 ${changed.writes} 次。${changed.result !== null ? `返回 ${changed.result}。` : ''}`,
      'success',
    ),
  }
}
export function presentLinear(s: LinearState): ExperimentView {
  const values = linearValues(s.storage),
    linked = s.storage.kind === 'linked'
  return {
    scene: {
      kind: 'data',
      title: '逻辑顺序与存储位置',
      sequence: values.map((value, i) => ({ label: `索引 ${i}`, value })),
      tables: [
        {
          id: 'linear-storage',
          title: linked ? '分配顺序与 next 链接' : '连续槽位',
          columns: linked ? ['节点', '值', 'next'] : ['槽位', '值', '定位方式'],
          rows:
            s.storage.kind === 'linked'
              ? s.storage.nodes.map((n) => ({
                  id: String(n.id),
                  values: [`N${n.id}`, n.value, n.next === null ? 'null' : `N${n.next}`],
                  tone: s.path.includes(n.id) ? 'warning' : 'neutral',
                }))
              : s.storage.values.map((value, i) => ({
                  id: String(i),
                  values: [i, value, `base + ${i} × 元素大小`],
                  tone: s.path.includes(i) ? 'warning' : 'neutral',
                })),
        },
        {
          id: 'linear-comparison',
          title: '相同数据与插入索引的对照',
          columns: ['结构', '读取 / 节点访问', '元素 / 链接写入'],
          rows: s.comparison.map((c) => ({ id: c.name, values: [c.name, c.reads, c.writes] })),
        },
      ],
      caption: linked
        ? `head=${s.storage.kind === 'linked' && s.storage.head !== null ? `N${s.storage.head}` : 'null'}。按索引找前驱仍需遍历；已持有前驱引用时才可直接修改链接。`
        : '数组按索引直接定位；中间插入和删除要搬移后缀。容量增长与内存分配不计入本次操作成本。',
    },
    metrics: [
      { label: '元素数量', value: values.length },
      { label: '读取 / 节点访问', value: s.reads },
      { label: '元素 / 链接写入', value: s.writes },
      { label: '最近返回值', value: s.result ?? '—' },
    ],
    controls: [
      {
        id: 'kind',
        kind: 'select',
        label: '线性存储结构',
        value: s.storage.kind,
        options: [
          { value: 'array', label: '数组' },
          { value: 'linked', label: '单链表' },
        ],
      },
      { id: 'position', kind: 'number', label: '操作索引', value: s.position, min: 0, max: values.length },
      { id: 'value', kind: 'number', label: '插入值', value: s.value, min: -99, max: 99 },
      { id: 'insert', kind: 'button', label: '在索引处插入', primary: true, disabled: values.length >= 12 },
      { id: 'delete', kind: 'button', label: '删除索引处元素', disabled: s.position >= values.length },
      { id: 'read', kind: 'button', label: '读取索引处元素', disabled: s.position >= values.length },
      { id: 'compare', kind: 'button', label: '比较相同位置的插入', disabled: values.length >= 12 },
    ],
    status: {
      title: linked ? '链接决定顺序' : '索引决定位置',
      detail: s.log.at(-1)?.detail ?? '先在索引 0 插入，再试索引 3，比较搬移与遍历的代价。',
      tone: 'neutral',
    },
    goal: {
      label: '插入并删除元素，再用同一输入比较数组与单链表的插入代价。',
      reached: s.inserted && s.deleted && s.comparison.length === 2,
    },
    log: s.log,
  }
}
export const linearEngine: EngineFactory = (config) =>
  createSession(
    () => initialLinear((config.kind ?? 'array') as LinearStorage['kind']),
    linearTransition,
    presentLinear,
  )
