import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { integerList } from '../core/inputs'

export type SortAlgorithm = 'insertion' | 'selection' | 'merge'
export interface SortItem {
  value: number
  id: number
}
export interface SortFrame {
  items: SortItem[]
  active: number[]
  comparisons: number
  writes: number
  detail: string
  buffer: SortItem[]
}
export interface SortingState {
  draft: string
  values: number[]
  algorithm: SortAlgorithm
  frames: SortFrame[]
  cursor: number
  comparison: { name: string; comparisons: number; writes: number; stable: boolean }[]
  error: string | null
  log: Observation[]
}
const algorithms = [
  { value: 'insertion', label: '插入排序 · 相邻交换' },
  { value: 'selection', label: '选择排序' },
  { value: 'merge', label: '归并排序' },
] as const
const example = '5 3 3 1 4 2'
export const isStableOrder = (items: SortItem[]) =>
  items.every((item, i) => !i || items[i - 1]!.value !== item.value || items[i - 1]!.id < item.id)
/** Traces are computed by the actual algorithms for the user's input, never by canned steps. */
export function sortTrace(values: number[], algorithm: SortAlgorithm): SortFrame[] {
  const items = values.map((value, id) => ({ value, id })),
    frames: SortFrame[] = []
  let comparisons = 0,
    writes = 0
  const emit = (detail: string, active: number[] = [], buffer: SortItem[] = []) =>
    frames.push({
      items: items.map((item) => ({ ...item })),
      comparisons,
      writes,
      detail,
      active: [...active],
      buffer: buffer.map((item) => ({ ...item })),
    })
  const swap = (a: number, b: number) => {
    ;[items[a], items[b]] = [items[b]!, items[a]!]
    writes += 2
  }
  emit('输入保留每个元素的原始编号；同值元素的编号用来观察稳定性。')
  if (algorithm === 'insertion') {
    for (let i = 1; i < items.length; i++) {
      for (let j = i; j > 0; j--) {
        comparisons++
        if (items[j - 1]!.value <= items[j]!.value) {
          emit(`位置 ${j - 1} ≤ 位置 ${j}，停止向左移动。`, [j - 1, j])
          break
        }
        swap(j - 1, j)
        emit(`交换相邻逆序对 ${j - 1} / ${j}。`, [j - 1, j])
      }
    }
  } else if (algorithm === 'selection') {
    for (let i = 0; i < items.length - 1; i++) {
      let best = i
      for (let j = i + 1; j < items.length; j++) {
        comparisons++
        if (items[j]!.value < items[best]!.value) best = j
        emit(`为位置 ${i} 寻找最小值，当前最小值在 ${best}。`, [best, j])
      }
      if (best !== i) {
        swap(i, best)
        emit(`把位置 ${best} 的最小值交换到 ${i}；远距离交换可能越过同值元素。`, [i, best])
      }
    }
  } else {
    const merge = (lo: number, hi: number) => {
      if (hi - lo < 2) return
      const mid = lo + Math.floor((hi - lo) / 2)
      merge(lo, mid)
      merge(mid, hi)
      const left = items.slice(lo, mid),
        right = items.slice(mid, hi),
        buffer: SortItem[] = []
      let a = 0,
        b = 0
      while (a < left.length && b < right.length) {
        const compared = [lo + a, mid + b]
        comparisons++
        if (left[a]!.value <= right[b]!.value) buffer.push(left[a++]!)
        else buffer.push(right[b++]!)
        writes++
        emit(`合并 [${lo},${mid}) 与 [${mid},${hi})：相等时先取左侧。`, compared, buffer)
      }
      while (a < left.length) {
        buffer.push(left[a++]!)
        writes++
      }
      while (b < right.length) {
        buffer.push(right[b++]!)
        writes++
      }
      for (let i = 0; i < buffer.length; i++) {
        items[lo + i] = buffer[i]!
        writes++
      }
      emit(
        `完整缓冲写回 [${lo},${hi})。`,
        Array.from({ length: hi - lo }, (_, i) => lo + i),
        buffer,
      )
    }
    merge(0, items.length)
  }
  emit('所有元素已按值排序；检查同值元素的原始编号是否保持顺序。')
  return frames
}
export function initialSorting(algorithm: SortAlgorithm = 'insertion', draft = example): SortingState {
  const values = integerList(draft, -99, 99, 16)
  if (!values || !algorithms.some((a) => a.value === algorithm))
    throw new Error('Sorting requires insertion/selection/merge and 1–16 integers in -99–99')
  return {
    draft,
    values,
    algorithm,
    frames: sortTrace(values, algorithm),
    cursor: 0,
    comparison: [],
    error: null,
    log: [],
  }
}
export function sortingTransition(s: SortingState, a: ExperimentAction): SortingState {
  if (a.type === 'values') {
    const draft = String(a.value ?? '')
    return integerList(draft, -99, 99, 16)
      ? initialSorting(s.algorithm, draft)
      : { ...s, draft, error: '请输入 1–16 个 -99–99 的整数，可重复，用空格或逗号分隔。' }
  }
  if (a.type === 'algorithm' && !s.error && algorithms.some((algo) => algo.value === a.value))
    return initialSorting(a.value as SortAlgorithm, s.draft)
  if (s.error) return s
  if (a.type === 'compare')
    return {
      ...s,
      comparison: algorithms.map((algo) => {
        const last = sortTrace(s.values, algo.value).at(-1)!
        return {
          name: algo.label,
          comparisons: last.comparisons,
          writes: last.writes,
          stable: isStableOrder(last.items),
        }
      }),
      log: addLog(
        s.log,
        '相同输入独立排序',
        '比较次数只统计元素之间的比较；写入包括交换以及归并辅助缓冲和写回，不统计初始装载。',
        'success',
      ),
    }
  if (['step', 'run'].includes(a.type) && s.cursor < s.frames.length - 1) {
    let result = s
    const end = a.type === 'run' ? s.frames.length - 1 : s.cursor + 1
    while (result.cursor < end) {
      const cursor = result.cursor + 1
      result = {
        ...result,
        cursor,
        log: addLog(
          result.log,
          `排序步骤 ${cursor}`,
          s.frames[cursor]!.detail,
          cursor === s.frames.length - 1 ? 'success' : 'neutral',
        ),
      }
    }
    return result
  }
  return s
}
export function presentSorting(s: SortingState): ExperimentView {
  const frame = s.frames[s.cursor]!,
    done = s.cursor === s.frames.length - 1
  return {
    scene: {
      kind: 'data',
      title: '排序、原始编号与辅助缓冲',
      sequence: frame.items.map((item, i) => ({
        label: `${i} · #${item.id}`,
        value: item.value,
        tone: frame.active.includes(i) ? 'warning' : done ? 'success' : 'neutral',
      })),
      tables: [
        {
          id: 'sort-buffer',
          title: '当前归并辅助缓冲',
          columns: ['位置', '值', '原始编号'],
          rows: frame.buffer.map((item, i) => ({ id: String(i), values: [i, item.value, `#${item.id}`] })),
        },
        {
          id: 'sorting-comparison',
          title: '同一输入的算法对照',
          columns: ['算法', '比较', '写入', '本次同值顺序'],
          rows: s.comparison.map((c) => ({
            id: c.name,
            values: [c.name, c.comparisons, c.writes, c.stable ? '保持' : '发生改变'],
          })),
        },
      ],
      caption:
        '原始编号只用于观察，不参与比较。一次输入保持同值顺序，不能证明算法对所有输入都稳定；选择排序并不保证稳定。',
    },
    metrics: [
      { label: '比较次数', value: frame.comparisons },
      { label: '写入次数', value: frame.writes },
      { label: '当前步骤', value: `${s.cursor} / ${s.frames.length - 1}` },
      { label: '排序状态', value: done ? '已完成' : '进行中' },
    ],
    controls: [
      { id: 'values', kind: 'text', label: '待排序数组', value: s.draft },
      {
        id: 'algorithm',
        kind: 'select',
        label: '排序算法',
        value: s.algorithm,
        options: [...algorithms],
        disabled: !!s.error,
      },
      { id: 'step', kind: 'button', label: '执行下一个排序步骤', primary: true, disabled: done || !!s.error },
      { id: 'run', kind: 'button', label: '运行排序到结束', disabled: done || !!s.error },
      { id: 'compare', kind: 'button', label: '对比三种排序算法', disabled: !!s.error },
    ],
    status: {
      title: s.error ? '检查数组输入' : done ? '排序完成' : '跟踪比较与移动',
      detail: s.error ?? frame.detail,
      tone: s.error ? 'danger' : done ? 'success' : 'neutral',
    },
    goal: {
      label: '完成一次排序，并用相同输入比较三种算法的操作次数与同值元素顺序。',
      reached: !s.error && done && s.comparison.length === 3,
    },
    log: s.log,
  }
}
export const sortingEngine: EngineFactory = (config) =>
  createSession(
    () =>
      initialSorting((config.algorithm ?? 'insertion') as SortAlgorithm, String(config.values ?? example)),
    sortingTransition,
    presentSorting,
  )
