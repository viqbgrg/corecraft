import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger, integerList } from '../core/inputs'

export interface SearchState {
  draft: string
  values: number[]
  target: number
  lo: number
  hi: number
  mid: number | null
  comparisons: number
  done: boolean
  error: string | null
  log: Observation[]
}
const example = '1 3 3 3 5 8 13 21'
export function sortedValues(draft: string) {
  const values = integerList(draft, -99, 99, 24)
  return values && values.every((v, i) => i === 0 || values[i - 1]! <= v) ? values : null
}
export function initialSearch(draft = example, target = 3): SearchState {
  const values = sortedValues(draft)
  if (!values || boundedInteger(target, -99, 99) === null)
    throw new Error('Binary search requires 1–24 sorted integers in -99–99')
  return {
    draft,
    values,
    target,
    lo: 0,
    hi: values.length,
    mid: null,
    comparisons: 0,
    done: false,
    error: null,
    log: [],
  }
}
export function searchStep(s: SearchState): SearchState {
  if (s.done || s.error) return s
  const mid = s.lo + Math.floor((s.hi - s.lo) / 2),
    less = s.values[mid]! < s.target
  const lo = less ? mid + 1 : s.lo,
    hi = less ? s.hi : mid
  return {
    ...s,
    lo,
    hi,
    mid,
    comparisons: s.comparisons + 1,
    done: lo === hi,
    log: addLog(
      s.log,
      `比较 a[${mid}]=${s.values[mid]} 与 ${s.target}`,
      `${less ? '中点偏小，左侧包含中点都可排除' : '中点已经不小于目标，保留更左侧的可能性'}；候选半开区间 [${lo}, ${hi})。${lo === hi ? `第一个不小于目标的位置为 ${lo}。` : ''}`,
      lo === hi ? 'success' : 'neutral',
    ),
  }
}
export function searchTransition(s: SearchState, a: ExperimentAction): SearchState {
  if (a.type === 'step') return searchStep(s)
  if (a.type === 'run') {
    let result = s
    while (!result.done && !result.error) result = searchStep(result)
    return result
  }
  if (a.type === 'values') {
    const draft = String(a.value ?? '')
    return sortedValues(draft)
      ? initialSearch(draft, s.target)
      : { ...s, draft, error: '请输入 1–24 个已按非递减顺序排列的整数（-99–99）；实验不会偷偷排序。' }
  }
  if (a.type === 'target' && !s.error) {
    const target = boundedInteger(a.value, -99, 99)
    if (target !== null) return initialSearch(s.draft, target)
  }
  return s
}
export function presentSearch(s: SearchState): ExperimentView {
  const found = s.done && s.values[s.lo] === s.target
  return {
    scene: {
      kind: 'data',
      title: '二分边界 · 第一个不小于目标的位置',
      sequence: s.values.map((value, i) => ({
        label: `${i}${i === s.mid ? ' · mid' : ''}`,
        value,
        tone: s.done && i === s.lo ? 'success' : i >= s.lo && i < s.hi ? 'warning' : 'neutral',
      })),
      tables: [
        {
          id: 'search-bounds',
          title: '循环不变量',
          columns: ['区域', '已知事实'],
          rows: [
            { id: 'left', values: [`[0, ${s.lo})`, `全部 < ${s.target}`] },
            { id: 'candidate', values: [`[${s.lo}, ${s.hi})`, '仍需比较的候选区间'] },
            { id: 'right', values: [`[${s.hi}, ${s.values.length})`, `全部 ≥ ${s.target}`] },
          ],
        },
      ],
      caption:
        '这是 lower_bound 二分查找。即使中点等于目标，也要继续找左边界；最终再检查该位置是否等于目标。返回数组长度表示所有元素都更小。',
    },
    metrics: [
      { label: 'lo', value: s.lo },
      { label: 'hi（不含）', value: s.hi },
      { label: '比较次数', value: s.comparisons },
      {
        label: '搜索结果',
        value: s.done ? (found ? `首个索引 ${s.lo}` : `未找到 · 插入点 ${s.lo}`) : '搜索中',
      },
    ],
    controls: [
      { id: 'values', kind: 'text', label: '有序数组', value: s.draft },
      {
        id: 'target',
        kind: 'number',
        label: '查找目标',
        value: s.target,
        min: -99,
        max: 99,
        disabled: !!s.error,
      },
      {
        id: 'step',
        kind: 'button',
        label: '比较一次并缩小区间',
        primary: true,
        disabled: s.done || !!s.error,
      },
      { id: 'run', kind: 'button', label: '查找到结束', disabled: s.done || !!s.error },
    ],
    status: {
      title: s.error
        ? '检查有序前提'
        : s.done
          ? found
            ? '找到了第一个匹配位置'
            : '目标不存在'
          : '候选区间逐次缩小',
      detail: s.error ?? s.log.at(-1)?.detail ?? '默认数组包含三个 3；预测最终会返回哪一个索引。',
      tone: s.error ? 'danger' : s.done ? 'success' : 'neutral',
    },
    goal: {
      label: '完成二分查找，确认最终位置与比较次数。',
      reached: !s.error && s.done && s.comparisons > 0,
    },
    log: s.log,
  }
}
export const searchEngine: EngineFactory = (config) =>
  createSession(
    () => initialSearch(String(config.values ?? example), Number(config.target ?? 3)),
    searchTransition,
    presentSearch,
  )
