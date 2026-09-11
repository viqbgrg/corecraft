import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type QueueKind = 'stack' | 'queue' | 'deque'
export interface QueueState {
  kind: QueueKind
  capacity: number
  slots: (number | null)[]
  head: number
  size: number
  value: number
  removed: number | null
  fullSeen: boolean
  removedAfterFull: boolean
  reused: boolean
  log: Observation[]
}
export function initialQueue(kind: QueueKind = 'queue', capacity = 4): QueueState {
  if (!['stack', 'queue', 'deque'].includes(kind) || boundedInteger(capacity, 2, 8) === null)
    throw new Error('Stack/queue/deque requires a capacity of 2–8')
  return {
    kind,
    capacity,
    slots: Array.from({ length: capacity }, () => null),
    head: 0,
    size: 0,
    value: 10,
    removed: null,
    fullSeen: false,
    removedAfterFull: false,
    reused: false,
    log: [],
  }
}
export const queueValues = (s: QueueState) =>
  Array.from({ length: s.size }, (_, i) => s.slots[(s.head + i) % s.capacity]!)
export function queueTransition(state: QueueState, a: ExperimentAction): QueueState {
  if (a.type === 'kind' && ['stack', 'queue', 'deque'].includes(String(a.value)))
    return initialQueue(a.value as QueueKind, state.capacity)
  if (a.type === 'capacity') {
    const capacity = boundedInteger(a.value, 2, 8)
    return capacity === null ? state : initialQueue(state.kind, capacity)
  }
  if (a.type === 'value') {
    const value = boundedInteger(a.value, -99, 99)
    return value === null ? state : { ...state, value }
  }
  const push = a.type === 'push-back' || a.type === 'push-front'
  const pop = a.type === 'pop-back' || a.type === 'pop-front'
  if (
    (!push && !pop) ||
    (a.type === 'push-front' && state.kind !== 'deque') ||
    (a.type === 'pop-front' && state.kind === 'stack') ||
    (a.type === 'pop-back' && state.kind === 'queue')
  )
    return state
  if ((push && state.size === state.capacity) || (pop && state.size === 0))
    return {
      ...state,
      log: addLog(
        state.log,
        push ? '结构已满' : '结构为空',
        push ? '拒绝插入，不能覆盖尚未移除的数据。' : '没有可返回的元素。',
        'warning',
      ),
    }
  const s = { ...state, slots: [...state.slots] }
  let at: number
  if (push) {
    if (a.type === 'push-front') s.head = (s.head - 1 + s.capacity) % s.capacity
    at = a.type === 'push-front' ? s.head : (s.head + s.size) % s.capacity
    s.slots[at] = s.value
    s.size++
    s.fullSeen ||= s.size === s.capacity
    s.reused ||= s.removedAfterFull && s.size === s.capacity
  } else {
    at = a.type === 'pop-front' ? s.head : (s.head + s.size - 1) % s.capacity
    s.removed = s.slots[at]!
    s.slots[at] = null
    s.size--
    if (a.type === 'pop-front') s.head = (s.head + 1) % s.capacity
    s.removedAfterFull ||= s.fullSeen
  }
  s.log = addLog(
    s.log,
    `${push ? '放入' : '移除'} ${push ? s.value : s.removed}`,
    `物理槽位 ${at}；head=${s.head}，size=${s.size}，下一尾部槽位=${(s.head + s.size) % s.capacity}。没有搬移其他元素。`,
    'success',
  )
  return s
}
export function presentQueue(s: QueueState): ExperimentView {
  const tail = (s.head + s.size) % s.capacity
  return {
    scene: {
      kind: 'data',
      title: '逻辑顺序与循环槽位',
      sequence: queueValues(s).map((value, i) => ({
        label: `${i === 0 ? '队首 / 底' : i === s.size - 1 ? '队尾 / 顶' : `第 ${i + 1} 项`}`,
        value,
      })),
      tables: [
        {
          id: 'ring-buffer',
          title: '固定容量的物理数组',
          columns: ['槽位', '值', '指针'],
          rows: s.slots.map((value, i) => ({
            id: String(i),
            values: [
              i,
              value ?? '空',
              [i === s.head ? 'head' : '', i === tail ? 'tail（下一尾插位置）' : '']
                .filter(Boolean)
                .join(' / ') || '—',
            ],
            tone: value === null ? 'neutral' : 'success',
          })),
        },
      ],
      caption:
        '用 size 区分满与空：两者都可能 head=tail。队列的移除只推进 head，索引按容量取模，空位可以循环复用。',
    },
    metrics: [
      { label: '已用 / 容量', value: `${s.size} / ${s.capacity}` },
      { label: 'head', value: s.head },
      { label: 'tail', value: tail },
      { label: '最近移除值', value: s.removed ?? '—' },
    ],
    controls: [
      {
        id: 'kind',
        kind: 'select',
        label: '访问规则',
        value: s.kind,
        options: [
          { value: 'stack', label: 'Stack · 后进先出' },
          { value: 'queue', label: 'Queue · 先进先出' },
          { value: 'deque', label: 'Deque · 两端操作' },
        ],
      },
      { id: 'capacity', kind: 'number', label: '固定容量', value: s.capacity, min: 2, max: 8 },
      { id: 'value', kind: 'number', label: '放入的值', value: s.value, min: -99, max: 99 },
      {
        id: 'push-back',
        kind: 'button',
        label: s.kind === 'stack' ? 'Push · 入栈' : '队尾放入',
        primary: true,
        disabled: s.size === s.capacity,
      },
      ...(s.kind === 'deque'
        ? [{ id: 'push-front', kind: 'button' as const, label: '队首放入', disabled: s.size === s.capacity }]
        : []),
      ...(s.kind !== 'stack'
        ? [{ id: 'pop-front', kind: 'button' as const, label: '队首移除', disabled: s.size === 0 }]
        : []),
      ...(s.kind !== 'queue'
        ? [
            {
              id: 'pop-back',
              kind: 'button' as const,
              label: s.kind === 'stack' ? 'Pop · 出栈' : '队尾移除',
              disabled: s.size === 0,
            },
          ]
        : []),
    ],
    status: {
      title:
        s.size === s.capacity ? '容量已满' : s.kind === 'stack' ? '最后放入的先出来' : '顺序来自访问规则',
      detail: s.log.at(-1)?.detail ?? '依次放入不同值，装满后移除一个，再放入新值，观察复用的槽位。',
      tone: s.size === s.capacity ? 'warning' : 'neutral',
    },
    goal: { label: '装满结构，移除一个元素，再放入新元素复用空位。', reached: s.reused },
    log: s.log,
  }
}
export const queueEngine: EngineFactory = (config) =>
  createSession(
    () => initialQueue((config.kind ?? 'queue') as QueueKind, Number(config.capacity ?? 4)),
    queueTransition,
    presentQueue,
  )
