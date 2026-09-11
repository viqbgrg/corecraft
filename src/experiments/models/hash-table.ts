import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type HashSlot = { state: 'empty' | 'deleted' } | { state: 'occupied'; key: number; value: number }
export interface HashState {
  slots: HashSlot[]
  key: number
  value: number
  path: number[]
  result: string
  collision: boolean
  crossedDeleted: boolean
  resized: boolean
  log: Observation[]
}
export const hashIndex = (key: number, capacity: number) => ((key % capacity) + capacity) % capacity
export function probeHash(slots: HashSlot[], key: number) {
  const path: number[] = []
  let deleted: number | null = null
  for (let offset = 0; offset < slots.length; offset++) {
    const at = (hashIndex(key, slots.length) + offset) % slots.length,
      slot = slots[at]!
    path.push(at)
    if (slot.state === 'occupied' && slot.key === key) return { path, found: at, insert: at }
    if (slot.state === 'deleted' && deleted === null) deleted = at
    if (slot.state === 'empty') return { path, found: null, insert: deleted ?? at }
  }
  return { path, found: null, insert: deleted }
}
export function initialHash(): HashState {
  const slots: HashSlot[] = Array.from({ length: 7 }, () => ({ state: 'empty' }))
  slots[1] = { state: 'occupied', key: 1, value: 10 }
  return {
    slots,
    key: 8,
    value: 80,
    path: [],
    result: '等待操作',
    collision: false,
    crossedDeleted: false,
    resized: false,
    log: [],
  }
}
export function hashTransition(s: HashState, a: ExperimentAction): HashState {
  if (a.type === 'key' || a.type === 'value') {
    const n = boundedInteger(a.value, -99, 99)
    return n === null ? s : { ...s, [a.type]: n }
  }
  if (a.type === 'resize' && s.slots.length === 7) {
    const slots: HashSlot[] = Array.from({ length: 13 }, () => ({ state: 'empty' }))
    for (const slot of s.slots)
      if (slot.state === 'occupied') {
        const location = probeHash(slots, slot.key).insert!
        slots[location] = { ...slot }
      }
    return {
      ...s,
      slots,
      path: [],
      resized: true,
      result: '重新散列到 13 个槽位',
      log: addLog(
        s.log,
        '扩容并重新散列',
        '模数从 7 变为 13，每一个存活键都重新计算位置；墓碑不迁移。',
        'success',
      ),
    }
  }
  if (!['insert', 'find', 'delete'].includes(a.type)) return s
  const probe = probeHash(s.slots, s.key),
    slots = s.slots.map((slot) => ({ ...slot }))
  let result: string
  if (a.type === 'insert') {
    if (probe.insert === null) result = '表已满，请先扩容'
    else {
      slots[probe.insert] = { state: 'occupied', key: s.key, value: s.value }
      result = `${probe.found === null ? '插入' : '更新'} ${s.key} → ${s.value}`
    }
  } else if (probe.found === null) result = `没有键 ${s.key}`
  else if (a.type === 'delete') {
    slots[probe.found] = { state: 'deleted' }
    result = `删除 ${s.key}，保留墓碑`
  } else {
    const slot = slots[probe.found]!
    result = `找到 ${s.key} → ${slot.state === 'occupied' ? slot.value : ''}`
  }
  return {
    ...s,
    slots,
    path: probe.path,
    result,
    collision: s.collision || (a.type === 'insert' && probe.insert !== null && probe.path.length > 1),
    crossedDeleted:
      s.crossedDeleted ||
      (a.type === 'find' && probe.found !== null && probe.path.some((i) => s.slots[i]!.state === 'deleted')),
    log: addLog(
      s.log,
      result,
      `h(${s.key})=${hashIndex(s.key, slots.length)}，依次探测 ${probe.path.join(' → ')}。空槽表示未找到，墓碑表示继续查找。`,
      (probe.found === null && a.type !== 'insert') || probe.insert === null ? 'warning' : 'success',
    ),
  }
}
export function presentHash(s: HashState): ExperimentView {
  const count = s.slots.filter((slot) => slot.state === 'occupied').length
  return {
    scene: {
      kind: 'data',
      title: '线性探测与墓碑',
      sequence: s.path.map((index, i) => ({ label: `探测 ${i + 1}`, value: index })),
      tables: [
        {
          id: 'hash-slots',
          title: `h(key) = 非负的 key mod ${s.slots.length}`,
          columns: ['槽位', '状态', 'Key', 'Value'],
          rows: s.slots.map((slot, i) => ({
            id: String(i),
            values: [
              i,
              slot.state === 'empty' ? '空' : slot.state === 'deleted' ? '墓碑' : '占用',
              slot.state === 'occupied' ? slot.key : '—',
              slot.state === 'occupied' ? slot.value : '—',
            ],
            tone: s.path.includes(i) ? 'warning' : 'neutral',
          })),
        },
      ],
      caption: '线性探测在碰撞时按 (h+i) mod capacity 前进。插入遇墓碑仍须确认后面没有相同键，避免重复键。',
    },
    metrics: [
      { label: '存活键', value: count },
      { label: '负载因子', value: (count / s.slots.length).toFixed(2) },
      { label: '墓碑数量', value: s.slots.filter((slot) => slot.state === 'deleted').length },
      { label: '本次探测', value: s.path.length },
    ],
    controls: [
      { id: 'key', kind: 'number', label: 'Key', value: s.key, min: -99, max: 99 },
      { id: 'value', kind: 'number', label: 'Value', value: s.value, min: -99, max: 99 },
      { id: 'insert', kind: 'button', label: 'Put · 插入或更新', primary: true },
      { id: 'find', kind: 'button', label: 'Get · 查找' },
      { id: 'delete', kind: 'button', label: 'Remove · 删除' },
      { id: 'resize', kind: 'button', label: '扩容至 13 并重新散列', disabled: s.slots.length === 13 },
    ],
    status: {
      title: s.result,
      detail: s.log.at(-1)?.detail ?? '先插入键 8，它与已有的键 1 碰撞。删除键 1 后，键 8 还能找到吗？',
      tone: 'neutral',
    },
    goal: {
      label: '插入一次碰撞，删除前方键后穿过墓碑找到后方键，最后扩容重新散列。',
      reached: s.collision && s.crossedDeleted && s.resized,
    },
    log: s.log,
  }
}
export const hashEngine: EngineFactory = () => createSession(initialHash, hashTransition, presentHash)
