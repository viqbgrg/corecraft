import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type PoolPhase = 'running' | 'shutdown' | 'stop' | 'terminated'
export interface PoolTask {
  id: number
  duration: number
  remaining: number
  state: 'queued' | 'running' | 'caller' | 'completed' | 'interrupted' | 'returned' | 'rejected'
  arrival: number
  started: number | null
  finished: number | null
  worker: string | null
  cooperative: boolean
  interruptRequested: boolean
}
export interface PoolWorker {
  id: string
  task: number | null
}
export interface ExecutorState {
  phase: PoolPhase
  core: number
  max: number
  queueCapacity: number
  duration: number
  policy: 'abort' | 'caller'
  cooperative: boolean
  clock: number
  tasks: PoolTask[]
  workers: PoolWorker[]
  queue: number[]
  callerTask: number | null
  nextTask: number
  created: number
  rejectionEvents: number
  callerRuns: number
  queuedOnce: boolean
  nonCoreStarted: boolean
  peakQueue: number
  error: string | null
  log: Observation[]
}
export function initialExecutor(): ExecutorState {
  return {
    phase: 'running',
    core: 2,
    max: 3,
    queueCapacity: 2,
    duration: 3,
    policy: 'abort',
    cooperative: true,
    clock: 0,
    tasks: [],
    workers: [],
    queue: [],
    callerTask: null,
    nextTask: 1,
    created: 0,
    rejectionEvents: 0,
    callerRuns: 0,
    queuedOnce: false,
    nonCoreStarted: false,
    peakQueue: 0,
    error: null,
    log: [],
  }
}
function startOnWorker(s: ExecutorState, worker: PoolWorker, task: PoolTask) {
  worker.task = task.id
  task.state = 'running'
  task.started = s.clock
  task.worker = worker.id
}
function assignIdle(s: ExecutorState) {
  if (s.phase === 'stop' || s.phase === 'terminated') return
  for (const worker of s.workers)
    if (worker.task === null && s.queue.length) {
      const id = s.queue.shift()!
      startOnWorker(
        s,
        worker,
        s.tasks.find((task) => task.id === id)!,
      )
    }
}
function settlePool(s: ExecutorState) {
  if (s.phase !== 'running' && s.queue.length === 0 && s.workers.every((worker) => worker.task === null)) {
    s.phase = 'terminated'
    s.workers = []
  }
}
function submitPoolTask(s: ExecutorState): ExecutorState {
  if (s.callerTask !== null)
    return { ...s, error: '提交线程正在 CallerRunsPolicy 中执行任务，当前 execute 尚未返回，不能继续提交。' }
  if (s.tasks.length >= 32) return { ...s, error: '教学任务轨迹最多保留 32 个任务，请重置后继续。' }
  const task: PoolTask = {
    id: s.nextTask++,
    duration: s.duration,
    remaining: s.duration,
    state: 'rejected',
    arrival: s.clock,
    started: null,
    finished: null,
    worker: null,
    cooperative: s.cooperative,
    interruptRequested: false,
  }
  s.tasks.push(task)
  const createWorker = () => {
    const worker = { id: `W${++s.created}`, task: null }
    s.workers.push(worker)
    startOnWorker(s, worker, task)
  }
  let detail: string
  if (s.phase === 'running' && s.workers.length < s.core) {
    createWorker()
    detail = `任务 ${task.id} 创建核心 worker，立即开始。`
  } else if (
    s.phase === 'running' &&
    s.queueCapacity === 0 &&
    s.workers.some((worker) => worker.task === null)
  ) {
    startOnWorker(
      s,
      s.workers.find((worker) => worker.task === null)!,
      task,
    )
    detail = `任务 ${task.id} 直接交给等待接收的空闲 worker；容量 0 不存储任务。`
  } else if (s.phase === 'running' && s.queue.length < s.queueCapacity) {
    task.state = 'queued'
    s.queue.push(task.id)
    s.queuedOnce = true
    s.peakQueue = Math.max(s.peakQueue, s.queue.length)
    assignIdle(s)
    detail = `任务 ${task.id} 通过 BlockingQueue.offer；队列先于扩展到 maximumPoolSize。`
  } else if (s.phase === 'running' && s.workers.length < s.max) {
    createWorker()
    s.nonCoreStarted = true
    detail = `队列无法接纳任务 ${task.id}，创建非核心 worker；新任务可早于已排队任务开始。`
  } else {
    s.rejectionEvents++
    if (s.phase === 'running' && s.policy === 'caller') {
      task.state = 'caller'
      task.started = s.clock
      task.worker = 'caller'
      s.callerTask = task.id
      s.callerRuns++
      detail = `任务 ${task.id} 触发 CallerRunsPolicy，在提交线程执行，形成提交端背压。`
    } else {
      task.finished = s.clock
      detail =
        s.policy === 'abort'
          ? `任务 ${task.id} 触发 AbortPolicy / RejectedExecutionException；没有被静默接收。`
          : `线程池已关闭，CallerRunsPolicy 不执行任务 ${task.id}；调用者仍需设计关闭期的任务处理。`
    }
  }
  s.log = addLog(s.log, 'execute 提交', detail, task.state === 'rejected' ? 'warning' : 'neutral')
  return s
}
function tickExecutor(s: ExecutorState): ExecutorState {
  if (!s.queue.length && s.workers.every((worker) => worker.task === null) && s.callerTask === null) return s
  s.clock++
  assignIdle(s)
  const advance = (task: PoolTask, belongsToPool: boolean) => {
    if (belongsToPool && task.interruptRequested && task.cooperative) {
      task.state = 'interrupted'
      task.finished = s.clock
      return true
    }
    task.remaining--
    if (task.remaining === 0) {
      task.state = 'completed'
      task.finished = s.clock
      return true
    }
    return false
  }
  for (const worker of s.workers)
    if (
      worker.task !== null &&
      advance(
        s.tasks.find((task) => task.id === worker.task)!,
        true,
      )
    )
      worker.task = null
  if (
    s.callerTask !== null &&
    advance(
      s.tasks.find((task) => task.id === s.callerTask)!,
      false,
    )
  )
    s.callerTask = null
  assignIdle(s)
  settlePool(s)
  s.log = addLog(
    s.log,
    `服务时隙 ${s.clock}`,
    `完成 ${s.tasks.filter((task) => task.state === 'completed').length} 个，队列剩余 ${s.queue.length}；${s.callerTask === null ? '提交线程可继续' : '提交线程仍执行自己的任务'}。`,
  )
  return s
}
export function executorTransition(state: ExecutorState, a: ExperimentAction): ExecutorState {
  if (a.type === 'policy' && ['abort', 'caller'].includes(String(a.value)))
    return { ...state, policy: a.value as ExecutorState['policy'], error: null }
  if (a.type === 'cooperative' && ['yes', 'no'].includes(String(a.value)))
    return { ...state, cooperative: a.value === 'yes', error: null }
  if (a.type === 'duration') {
    const duration = boundedInteger(a.value, 1, 9)
    return duration === null ? state : { ...state, duration, error: null }
  }
  if (['core', 'max', 'queueCapacity'].includes(a.type) && state.tasks.length === 0) {
    const value = boundedInteger(a.value, a.type === 'queueCapacity' ? 0 : 1, 4)
    if (value === null) return state
    if ((a.type === 'core' && value > state.max) || (a.type === 'max' && value < state.core))
      return { ...state, error: '必须满足 corePoolSize ≤ maximumPoolSize，请先调整另一项。' }
    return { ...state, [a.type]: value, error: null }
  }
  if (!['submit', 'burst', 'tick', 'run', 'shutdown', 'shutdown-now'].includes(a.type)) return state
  let s = structuredClone(state)
  s.error = null
  if (a.type === 'submit') return submitPoolTask(s)
  if (a.type === 'burst') {
    for (let i = 0; i < 6 && s.callerTask === null; i++) s = submitPoolTask(s)
    return s
  }
  if (a.type === 'tick') return tickExecutor(s)
  if (a.type === 'run') {
    for (
      let budget = 0;
      budget < 500 &&
      (s.queue.length || s.workers.some((worker) => worker.task !== null) || s.callerTask !== null);
      budget++
    )
      s = tickExecutor(s)
    return s
  }
  if (s.phase === 'terminated') return state
  if (a.type === 'shutdown') {
    if (s.phase === 'running') s.phase = 'shutdown'
    s.log = addLog(
      s.log,
      'shutdown',
      '停止接纳新任务，队列和正在执行的任务继续；达到终止条件后才 TERMINATED。',
    )
  } else {
    s.phase = 'stop'
    for (const id of s.queue) {
      const task = s.tasks.find((task) => task.id === id)!
      task.state = 'returned'
      task.finished = s.clock
    }
    s.queue = []
    for (const worker of s.workers)
      if (worker.task !== null) s.tasks.find((task) => task.id === worker.task)!.interruptRequested = true
    s.log = addLog(
      s.log,
      'shutdownNow',
      '退还尚未开始的任务，向 pool worker 发出中断；忽略中断的任务仍可继续。CallerRuns 中的提交线程不属于 pool worker，不由此中断。',
      'warning',
    )
  }
  settlePool(s)
  return s
}
export function presentExecutor(s: ExecutorState): ExperimentView {
  const completed = s.tasks.filter((task) => task.state === 'completed'),
    reached =
      s.queuedOnce &&
      s.nonCoreStarted &&
      s.rejectionEvents > 0 &&
      s.callerRuns > 0 &&
      s.phase === 'terminated' &&
      s.callerTask === null &&
      s.tasks.every((task) => ['completed', 'rejected'].includes(task.state))
  return {
    scene: {
      kind: 'data',
      title: '核心线程 → 队列 offer → 非核心线程 → 拒绝策略',
      tables: [
        {
          id: 'executor-workers',
          title: 'Pool worker 与提交线程分别执行',
          columns: ['执行者', '当前任务'],
          rows: [
            ...s.workers.map((worker) => ({
              id: worker.id,
              values: [worker.id, worker.task === null ? '空闲 / 等待队列' : `任务 ${worker.task}`],
            })),
            {
              id: 'caller',
              values: ['提交线程 caller', s.callerTask === null ? '可继续提交' : `执行任务 ${s.callerTask}`],
            },
          ],
        },
        {
          id: 'executor-queue',
          title: `有界 BlockingQueue / capacity=${s.queueCapacity}`,
          columns: ['位置', '任务'],
          rows: s.queue.map((id, i) => ({ id: String(id), values: [i, id] })),
        },
        {
          id: 'executor-tasks',
          title: '任务的实际接纳与完成轨迹',
          columns: ['任务', '状态', '执行者', '到达 / 开始 / 结束', '剩余服务', '中断'],
          rows: s.tasks.map((task) => ({
            id: String(task.id),
            values: [
              task.id,
              task.state,
              task.worker ?? '无',
              `${task.arrival} / ${task.started ?? '—'} / ${task.finished ?? '—'}`,
              task.remaining,
              task.interruptRequested ? (task.cooperative ? '会响应' : '忽略请求') : '无',
            ],
          })),
        },
      ],
      caption:
        'ThreadPoolExecutor 接纳顺序与有界队列教学，1–4 worker、32 任务、确定性服务时隙。execute 使用 offer，不把 BlockingQueue.put 的阻塞套到提交路径。省略任务运行异常、keepAlive、动态扩缩、队列并发重检和操作系统 CPU 竞争；每个 worker 的服务进度不是 CPU 核心数的性能模型。',
    },
    metrics: [
      { label: '线程池阶段', value: s.phase },
      { label: '已创建 pool worker', value: s.created },
      { label: '队列峰值', value: s.peakQueue },
      { label: '触发拒绝策略次数', value: s.rejectionEvents },
      { label: 'CallerRuns 次数', value: s.callerRuns },
      { label: '完成任务数量', value: completed.length },
      {
        label: '平均排队时隙',
        value: completed.length
          ? (
              completed.reduce((sum, task) => sum + task.started! - task.arrival, 0) / completed.length
            ).toFixed(2)
          : '—',
      },
    ],
    controls: [
      {
        id: 'core',
        kind: 'number',
        label: 'corePoolSize',
        value: s.core,
        min: 1,
        max: 4,
        disabled: s.tasks.length > 0,
      },
      {
        id: 'max',
        kind: 'number',
        label: 'maximumPoolSize',
        value: s.max,
        min: 1,
        max: 4,
        disabled: s.tasks.length > 0,
      },
      {
        id: 'queueCapacity',
        kind: 'number',
        label: 'BlockingQueue 容量',
        value: s.queueCapacity,
        min: 0,
        max: 4,
        disabled: s.tasks.length > 0,
      },
      { id: 'duration', kind: 'number', label: '新任务服务时隙', value: s.duration, min: 1, max: 9 },
      {
        id: 'policy',
        kind: 'select',
        label: '拒绝处理策略',
        value: s.policy,
        options: [
          { value: 'abort', label: 'AbortPolicy / 明确拒绝' },
          { value: 'caller', label: 'CallerRunsPolicy / 提交者执行' },
        ],
      },
      {
        id: 'cooperative',
        kind: 'select',
        label: '新任务是否响应 interrupt',
        value: s.cooperative ? 'yes' : 'no',
        options: [
          { value: 'yes', label: '协作退出' },
          { value: 'no', label: '继续执行，忽略请求' },
        ],
      },
      {
        id: 'submit',
        kind: 'button',
        label: 'execute · 提交一个任务',
        primary: true,
        disabled: s.callerTask !== null,
      },
      { id: 'burst', kind: 'button', label: '突发提交六个任务', disabled: s.callerTask !== null },
      { id: 'tick', kind: 'button', label: '推进一个服务时隙' },
      { id: 'run', kind: 'button', label: '运行到所有已接纳任务结束' },
      { id: 'shutdown', kind: 'button', label: 'shutdown · 排空后关闭', disabled: s.phase !== 'running' },
      {
        id: 'shutdown-now',
        kind: 'button',
        label: 'shutdownNow · 请求中断并退还队列',
        disabled: s.phase === 'terminated',
      },
    ],
    status: {
      title: s.error
        ? '提交或配置尚不能继续'
        : reached
          ? '接纳、背压与关闭形成完整生命周期'
          : 'maximumPoolSize 不会在队列有空间时立即用满',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '默认突发六任务：两个核心、两个排队、一个非核心、一个拒绝。再用 CallerRuns 提交一个任务，运行完成并 shutdown。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '观察有界排队、非核心扩展与拒绝，再用 CallerRuns 施加背压，完成已接纳任务并正常终止线程池。',
      reached,
    },
    log: s.log,
  }
}
export const executorEngine: EngineFactory = () =>
  createSession(initialExecutor, executorTransition, presentExecutor)
