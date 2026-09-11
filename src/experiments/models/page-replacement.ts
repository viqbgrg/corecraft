import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger, integerList } from '../core/inputs'

export type ReplacementPolicy = 'fifo' | 'lru' | 'clock' | 'opt'
interface Frame {
  page: number
  loaded: number
  used: number
  referenced: boolean
}
export interface ReplacementState {
  policy: ReplacementPolicy
  draft: string
  references: number[]
  capacity: number
  cursor: number
  frames: (Frame | null)[]
  hand: number
  faults: number
  hits: number
  history: { page: number; frames: (number | null)[]; hit: boolean; evicted: number | null }[]
  comparison: { policy: string; faults: number; hits: number }[]
  error: string | null
  log: Observation[]
}
const policies = [
  { value: 'fifo', label: 'FIFO · 最先进入' },
  { value: 'lru', label: 'LRU · 最久未使用' },
  { value: 'clock', label: 'Clock · 第二次机会' },
  { value: 'opt', label: 'OPT · 未来最晚使用' },
] as const
const example = '1 2 3 4 1 2 5 1 2 3 4 5'
export function initialReplacement(
  policy: ReplacementPolicy = 'fifo',
  draft = example,
  capacity = 3,
): ReplacementState {
  const references = integerList(draft, 0, 15)
  if (!references || boundedInteger(capacity, 1, 5) === null || !policies.some((p) => p.value === policy))
    throw new Error('Replacement requires FIFO/LRU/Clock/OPT, 1–40 pages in 0–15 and 1–5 frames')
  return {
    policy,
    draft,
    references,
    capacity,
    cursor: 0,
    frames: Array.from({ length: capacity }, () => null),
    hand: 0,
    faults: 0,
    hits: 0,
    history: [],
    comparison: [],
    error: null,
    log: [],
  }
}
export function replacementStep(state: ReplacementState): ReplacementState {
  if (state.error || state.cursor >= state.references.length) return state
  const s = { ...state, frames: state.frames.map((f) => (f ? { ...f } : null)) }
  const page = s.references[s.cursor]!,
    existing = s.frames.findIndex((f) => f?.page === page)
  let evicted: number | null = null
  if (existing >= 0) {
    s.frames[existing]!.used = s.cursor
    s.frames[existing]!.referenced = true
    s.hits++
  } else {
    s.faults++
    let target = s.frames.findIndex((f) => f === null)
    if (target < 0) {
      if (s.policy === 'clock') {
        while (s.frames[s.hand]!.referenced) {
          s.frames[s.hand]!.referenced = false
          s.hand = (s.hand + 1) % s.capacity
        }
        target = s.hand
      } else if (s.policy === 'opt') {
        const nextUse = (f: Frame) => {
          const at = s.references.indexOf(f.page, s.cursor + 1)
          return at < 0 ? Infinity : at
        }
        target = s.frames.reduce(
          (best, frame, i) => (nextUse(frame!) > nextUse(s.frames[best]!) ? i : best),
          0,
        )
      } else {
        const field = s.policy === 'fifo' ? 'loaded' : 'used'
        target = s.frames.reduce((best, frame, i) => (frame![field] < s.frames[best]![field] ? i : best), 0)
      }
      evicted = s.frames[target]!.page
    }
    s.frames[target] = { page, loaded: s.cursor, used: s.cursor, referenced: true }
    if (s.policy === 'clock') s.hand = (target + 1) % s.capacity
  }
  s.cursor++
  s.history = [
    ...s.history,
    { page, frames: s.frames.map((f) => f?.page ?? null), hit: existing >= 0, evicted },
  ]
  s.log = addLog(
    s.log,
    `访问页 ${page} · ${existing >= 0 ? '命中' : '缺页'}`,
    existing >= 0
      ? '更新使用时间与引用位；FIFO 的进入时间保持不变。'
      : `${evicted === null ? '使用空闲帧' : `淘汰页 ${evicted}`}，载入页 ${page}。${s.policy === 'opt' ? 'OPT 使用完整未来序列，是比较下界，不是可在线实现的策略。' : ''}`,
    existing >= 0 ? 'success' : 'warning',
  )
  return s
}
export function runReplacement(state: ReplacementState): ReplacementState {
  let s = state
  while (!s.error && s.cursor < s.references.length) s = replacementStep(s)
  return s
}
export function replacementTransition(s: ReplacementState, a: ExperimentAction): ReplacementState {
  if (a.type === 'step') return replacementStep(s)
  if (a.type === 'run') return runReplacement(s)
  if (a.type === 'compare' && !s.error)
    return {
      ...s,
      comparison: policies.map((p) => {
        const result = runReplacement(initialReplacement(p.value, s.draft, s.capacity))
        return { policy: p.value.toUpperCase(), faults: result.faults, hits: result.hits }
      }),
      log: addLog(
        s.log,
        '同一访问序列对照',
        `${s.capacity} 个帧，每组都从空内存开始；没有在组间共享缓存。`,
        'success',
      ),
    }
  if (a.type === 'references') {
    const draft = String(a.value ?? '')
    return integerList(draft, 0, 15)
      ? initialReplacement(s.policy, draft, s.capacity)
      : { ...s, draft, error: '请输入 1–40 个 0–15 的页号，用空格或逗号分隔。' }
  }
  if (a.type === 'policy' && !s.error && policies.some((p) => p.value === a.value))
    return initialReplacement(a.value as ReplacementPolicy, s.draft, s.capacity)
  if (a.type === 'capacity' && !s.error) {
    const capacity = boundedInteger(a.value, 1, 5)
    if (capacity !== null) return initialReplacement(s.policy, s.draft, capacity)
  }
  return s
}
export function presentReplacement(s: ReplacementState): ExperimentView {
  const done = s.cursor === s.references.length
  return {
    scene: {
      kind: 'data',
      title: '页帧与置换轨迹',
      cards: s.frames.map((f, i) => ({
        id: String(i),
        label: `帧 ${i}${s.policy === 'clock' && s.hand === i ? ' ← 指针' : ''}`,
        value: f?.page ?? '空',
        detail: f ? `进入 #${f.loaded + 1} · 最近 #${f.used + 1} · R=${Number(f.referenced)}` : '尚未分配',
      })),
      tables: [
        {
          id: 'replacement-history',
          title: '逐次访问后的内存',
          columns: ['访问', '页号', ...s.frames.map((_, i) => `帧 ${i}`), '结果', '淘汰'],
          rows: s.history.map((h, i) => ({
            id: String(i),
            values: [
              i + 1,
              h.page,
              ...h.frames.map((f) => f ?? '—'),
              h.hit ? '命中' : '缺页',
              h.evicted ?? '—',
            ],
            tone: h.hit ? 'success' : 'neutral',
          })),
        },
        {
          id: 'replacement-comparison',
          title: '相同页序列与帧数',
          columns: ['策略', '缺页', '命中'],
          rows: s.comparison.map((c) => ({ id: c.policy, values: [c.policy, c.faults, c.hits] })),
        },
      ],
      caption: '页号代表已经合法映射的页面；不模拟 TLB、脏页写回和磁盘耗时。OPT 预知未来，仅用来说明下界。',
    },
    metrics: [
      { label: '已访问', value: `${s.cursor} / ${s.references.length}` },
      { label: '缺页次数', value: s.faults },
      { label: '命中次数', value: s.hits },
      { label: '缺页率', value: s.cursor ? `${((s.faults / s.cursor) * 100).toFixed(1)}%` : '—' },
    ],
    controls: [
      { id: 'references', kind: 'text', label: '页面访问序列', value: s.draft },
      {
        id: 'policy',
        kind: 'select',
        label: '页面置换策略',
        value: s.policy,
        options: [...policies],
        disabled: !!s.error,
      },
      {
        id: 'capacity',
        kind: 'number',
        label: '物理帧数',
        value: s.capacity,
        min: 1,
        max: 5,
        disabled: !!s.error,
      },
      { id: 'step', kind: 'button', label: '访问下一个页面', primary: true, disabled: done || !!s.error },
      { id: 'run', kind: 'button', label: '运行全部访问', disabled: done || !!s.error },
      { id: 'compare', kind: 'button', label: '对比四种置换策略', disabled: !!s.error },
    ],
    status: {
      title: s.error ? '检查页号序列' : done ? '访问序列已完成' : '下一页是否已经驻留',
      detail: s.error ?? s.log.at(-1)?.detail ?? '试试默认序列在 FIFO 下使用 3 帧和 4 帧的区别。',
      tone: s.error ? 'danger' : done ? 'success' : 'neutral',
    },
    goal: {
      label: '完成一次页面访问序列，并比较 FIFO、LRU、Clock 与 OPT 的缺页次数。',
      reached: !s.error && done && s.comparison.length === 4,
    },
    log: s.log,
  }
}
export const replacementEngine: EngineFactory = (config) =>
  createSession(
    () =>
      initialReplacement(
        (config.policy ?? 'fifo') as ReplacementPolicy,
        String(config.references ?? example),
        Number(config.capacity ?? 3),
      ),
    replacementTransition,
    presentReplacement,
  )
