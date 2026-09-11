import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type SchedulingPolicy = 'fcfs' | 'sjf' | 'srtf' | 'rr'
export interface Job {
  id: string
  arrival: number
  burst: number
  remaining: number
  start: number | null
  finish: number | null
}
export interface SchedulingState {
  policy: SchedulingPolicy
  draft: string
  quantum: number
  jobs: Job[]
  time: number
  ready: number[]
  running: number | null
  slice: number
  history: { time: number; job: string }[]
  comparison: { policy: string; waiting: number; response: number; turnaround: number; switches: number }[]
  error: string | null
  log: Observation[]
}
const policies = [
  { value: 'fcfs', label: 'FCFS · 先来先服务' },
  { value: 'sjf', label: 'SJF · 非抢占短作业优先' },
  { value: 'srtf', label: 'SRTF · 最短剩余时间' },
  { value: 'rr', label: 'RR · 时间片轮转' },
] as const
const example = '0:8, 1:4, 2:2'
export function parseJobs(draft: string): Job[] | null {
  const parts = draft.trim().split(/[\s,]+/)
  if (!draft.trim() || parts.length > 8) return null
  const jobs: Job[] = []
  for (const [index, part] of parts.entries()) {
    if (!/^\d+:\d+$/.test(part)) return null
    const [arrival, burst] = part.split(':').map(Number)
    if (boundedInteger(arrival, 0, 30) === null || boundedInteger(burst, 1, 20) === null) return null
    jobs.push({
      id: `P${index + 1}`,
      arrival: arrival!,
      burst: burst!,
      remaining: burst!,
      start: null,
      finish: null,
    })
  }
  return jobs
}
export function initialScheduling(
  policy: SchedulingPolicy = 'fcfs',
  draft = example,
  quantum = 2,
): SchedulingState {
  const jobs = parseJobs(draft)
  if (!jobs || !policies.some((p) => p.value === policy) || boundedInteger(quantum, 1, 10) === null)
    throw new Error('Scheduling requires FCFS/SJF/SRTF/RR, 1–8 arrival:burst jobs and a quantum of 1–10')
  return {
    policy,
    draft,
    quantum,
    jobs,
    time: 0,
    ready: [],
    running: null,
    slice: 0,
    history: [],
    comparison: [],
    error: null,
    log: [],
  }
}
export const schedulingDone = (s: SchedulingState) => s.jobs.every((job) => job.finish !== null)
export function schedulingStep(state: SchedulingState): SchedulingState {
  if (state.error || schedulingDone(state)) return state
  const s = { ...state, jobs: state.jobs.map((j) => ({ ...j })), ready: [...state.ready] }
  // New arrivals join before an expired RR slice is requeued at this boundary.
  s.jobs.forEach((j, i) => {
    if (j.arrival <= s.time && j.finish === null && i !== s.running && !s.ready.includes(i)) s.ready.push(i)
  })
  if (s.running !== null && s.policy === 'rr' && s.slice === s.quantum) {
    s.ready.push(s.running)
    s.running = null
    s.slice = 0
  }
  if (
    s.policy === 'srtf' &&
    s.running !== null &&
    s.ready.some((i) => s.jobs[i]!.remaining < s.jobs[s.running!]!.remaining)
  ) {
    s.ready.push(s.running)
    s.running = null
    s.slice = 0
  }
  if (s.running === null && s.ready.length) {
    if (s.policy === 'sjf' || s.policy === 'srtf')
      s.ready.sort(
        (a, b) =>
          s.jobs[a]!.remaining - s.jobs[b]!.remaining || s.jobs[a]!.arrival - s.jobs[b]!.arrival || a - b,
      )
    s.running = s.ready.shift()!
    s.slice = 0
  }
  const job = s.running === null ? null : s.jobs[s.running]!
  if (job) {
    job.start ??= s.time
    job.remaining--
    s.slice++
    if (!job.remaining) {
      job.finish = s.time + 1
      s.running = null
      s.slice = 0
    }
  }
  s.time++
  s.history = [...s.history, { time: state.time, job: job?.id ?? 'IDLE' }]
  s.log = addLog(
    s.log,
    `[${state.time}, ${s.time}) · ${job?.id ?? 'CPU 空闲'}`,
    job
      ? `剩余 ${job.remaining}；${job.finish === null ? '等待下一时刻的调度决策。' : `在 t=${job.finish} 完成。`}`
      : '没有已到达且未完成的任务。',
    job?.finish !== null && job ? 'success' : 'neutral',
  )
  return s
}
export function runScheduling(state: SchedulingState): SchedulingState {
  let s = state
  while (!s.error && !schedulingDone(s)) s = schedulingStep(s)
  return s
}
export function schedulingStats(s: SchedulingState) {
  const finished = s.jobs.filter((j) => j.finish !== null)
  const avg = (read: (j: Job) => number) =>
    finished.length ? finished.reduce((n, j) => n + read(j), 0) / finished.length : 0
  return {
    waiting: avg((j) => j.finish! - j.arrival - j.burst),
    turnaround: avg((j) => j.finish! - j.arrival),
    response: avg((j) => j.start! - j.arrival),
    switches: s.history.filter(
      (h, i) =>
        i > 0 && h.job !== 'IDLE' && s.history[i - 1]!.job !== 'IDLE' && h.job !== s.history[i - 1]!.job,
    ).length,
  }
}
export function schedulingTransition(s: SchedulingState, a: ExperimentAction): SchedulingState {
  if (a.type === 'step') return schedulingStep(s)
  if (a.type === 'run') return runScheduling(s)
  if (a.type === 'compare' && !s.error)
    return {
      ...s,
      comparison: policies.map((p) => ({
        policy: p.value.toUpperCase(),
        ...schedulingStats(runScheduling(initialScheduling(p.value, s.draft, s.quantum))),
      })),
      log: addLog(
        s.log,
        '相同工作负载对照',
        '四组从 t=0 独立运行；平均指标只在所有任务完成后比较。时间片影响 RR，切换暂不计耗时。',
        'success',
      ),
    }
  if (a.type === 'workload') {
    const draft = String(a.value ?? '')
    return parseJobs(draft)
      ? initialScheduling(s.policy, draft, s.quantum)
      : { ...s, draft, error: '请输入 1–8 个 到达时间:执行时长，例如 0:8, 1:4, 2:2；到达 0–30，时长 1–20。' }
  }
  if (a.type === 'policy' && policies.some((p) => p.value === a.value) && !s.error)
    return initialScheduling(a.value as SchedulingPolicy, s.draft, s.quantum)
  if (a.type === 'quantum') {
    const q = boundedInteger(a.value, 1, 10)
    if (q !== null && !s.error) return initialScheduling(s.policy, s.draft, q)
  }
  return s
}
export function presentScheduling(s: SchedulingState): ExperimentView {
  const done = schedulingDone(s),
    stats = schedulingStats(s)
  return {
    scene: {
      kind: 'data',
      title: 'CPU 时间线与任务状态',
      sequence: s.history.map((h) => ({
        label: `${h.time}–${h.time + 1}`,
        value: h.job,
        tone: h.job === 'IDLE' ? 'warning' : 'neutral',
      })),
      tables: [
        {
          id: 'jobs',
          title: '任务与完成时刻',
          columns: ['任务', '到达', '执行量', '剩余', '首次运行', '完成', '等待'],
          rows: s.jobs.map((j) => ({
            id: j.id,
            values: [
              j.id,
              j.arrival,
              j.burst,
              j.remaining,
              j.start ?? '—',
              j.finish ?? '—',
              j.finish === null ? '—' : j.finish - j.arrival - j.burst,
            ],
            tone: j.finish !== null ? 'success' : 'neutral',
          })),
        },
        {
          id: 'scheduling-comparison',
          title: '同一输入 · 独立运行',
          columns: ['策略', '平均等待', '平均响应', '平均周转', '任务切换'],
          rows: s.comparison.map((c) => ({
            id: c.policy,
            values: [
              c.policy,
              c.waiting.toFixed(2),
              c.response.toFixed(2),
              c.turnaround.toFixed(2),
              c.switches,
            ],
          })),
        },
      ],
      caption:
        '每格表示一个 CPU 时间单位。到达恰好发生在边界时，先入队，再把耗尽时间片的任务排到队尾；SJF / SRTF 同分按到达与输入顺序。',
    },
    metrics: [
      { label: '当前时间', value: s.time },
      { label: '已完成任务', value: `${s.jobs.filter((j) => j.finish !== null).length} / ${s.jobs.length}` },
      { label: '平均等待时间', value: done ? stats.waiting.toFixed(2) : '待完成' },
      { label: '任务切换', value: stats.switches },
    ],
    controls: [
      { id: 'workload', kind: 'text', label: '任务 / 到达:时长', value: s.draft },
      {
        id: 'policy',
        kind: 'select',
        label: '调度策略',
        value: s.policy,
        options: [...policies],
        disabled: !!s.error,
      },
      {
        id: 'quantum',
        kind: 'number',
        label: 'RR 时间片',
        value: s.quantum,
        min: 1,
        max: 10,
        disabled: !!s.error,
      },
      { id: 'step', kind: 'button', label: '执行 1 个时间单位', primary: true, disabled: done || !!s.error },
      { id: 'run', kind: 'button', label: '运行全部任务', disabled: done || !!s.error },
      { id: 'compare', kind: 'button', label: '对比四种调度策略', disabled: !!s.error },
    ],
    status: {
      title: s.error ? '检查任务输入' : done ? '任务全部完成' : '选择下一个执行机会',
      detail: s.error ?? s.log.at(-1)?.detail ?? '先运行默认任务，再比较短任务的等待与响应。',
      tone: s.error ? 'danger' : done ? 'success' : 'neutral',
    },
    goal: {
      label: '完成一组任务，并用相同输入比较 FCFS、SJF、SRTF 与 RR。',
      reached: !s.error && done && s.comparison.length === 4,
    },
    log: s.log,
  }
}
export const schedulingEngine: EngineFactory = (config) => {
  const initial = () =>
    initialScheduling(
      (config.policy ?? 'fcfs') as SchedulingPolicy,
      String(config.workload ?? example),
      Number(config.quantum ?? 2),
    )
  return createSession(initial, schedulingTransition, presentScheduling)
}
