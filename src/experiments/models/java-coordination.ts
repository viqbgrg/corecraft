import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'

export type WorkerId = 'T1' | 'T2' | 'T3'
export interface CoordinationState {
  selected: WorkerId
  latch: number
  results: Record<WorkerId, number | null>
  coordinator: 'idle' | 'waiting' | 'returned'
  readResults: number[]
  published: WorkerId[]
  latchWaited: boolean
  latchObserved: boolean
  permits: number
  active: WorkerId[]
  waiters: WorkerId[]
  completed: number
  semBlocked: boolean
  semRetried: boolean
  extraReleases: number
  error: string | null
  log: Observation[]
}
const workers: WorkerId[] = ['T1', 'T2', 'T3']
export function initialCoordination(): CoordinationState {
  return {
    selected: 'T1',
    latch: 3,
    results: { T1: null, T2: null, T3: null },
    coordinator: 'idle',
    readResults: [],
    published: [],
    latchWaited: false,
    latchObserved: false,
    permits: 2,
    active: [],
    waiters: [],
    completed: 0,
    semBlocked: false,
    semRetried: false,
    extraReleases: 0,
    error: null,
    log: [],
  }
}
export function coordinationTransition(state: CoordinationState, a: ExperimentAction): CoordinationState {
  if (a.type === 'selected' && workers.includes(a.value as WorkerId))
    return { ...state, selected: a.value as WorkerId, error: null }
  if (
    ![
      'await',
      'finish-latch',
      'count-down',
      'new-latch',
      'acquire',
      'finish-permit',
      'raw-release',
      'new-semaphore',
    ].includes(a.type)
  )
    return state
  const s = structuredClone(state),
    id = s.selected
  s.error = null
  let detail = ''
  if (a.type === 'await') {
    if (s.latch > 0) {
      s.coordinator = 'waiting'
      s.latchWaited = true
      detail = `协调者 await 等待 count=${s.latch} 归零；没有消费一个许可。`
    } else {
      s.coordinator = 'returned'
      s.readResults = workers.flatMap((worker) => (s.results[worker] === null ? [] : [s.results[worker]!]))
      s.latchObserved ||= s.latchWaited && s.readResults.length === 3 && s.published.length === 3
      detail = `await 返回，看到已完成工作的结果 [${s.readResults.join(', ')}]。countDown 之前的动作经成功 await 建立可见性；计数本身不验证业务是否全部完成。`
    }
  } else if (a.type === 'finish-latch') {
    if (s.results[id] !== null)
      return { ...state, error: `${id} 的这份工作已经完成；包装任务不会重复 countDown。` }
    s.results[id] = (workers.indexOf(id) + 1) * 10
    if (s.latch > 0) s.published.push(id)
    s.latch = Math.max(0, s.latch - 1)
    detail = `${id} 先写结果 ${s.results[id]}，再 countDown；count=${s.latch}。${s.latch === 0 ? '协调者现在可以重新调度并从 await 返回。' : '仍需等待其他完成信号。'}`
  } else if (a.type === 'count-down') {
    s.latch = Math.max(0, s.latch - 1)
    detail = `直接 countDown，count=${s.latch}；这不替任何工作产生结果。到零后不会变成负数，也不能再次关门。`
  } else if (a.type === 'new-latch') {
    s.latch = 3
    s.results = { T1: null, T2: null, T3: null }
    s.coordinator = 'idle'
    s.readResults = []
    s.published = []
    s.latchWaited = false
    detail = '创建新的 CountDownLatch(3) 与三份新工作；原 Latch 没有被 reset。'
  } else if (a.type === 'acquire') {
    if (s.active.includes(id))
      return {
        ...state,
        error: '这份任务已占用一个资源；本任务包装器不重复 acquire，并非 Semaphore 自带所有权检查。',
      }
    if (s.permits === 0 || (s.waiters.length > 0 && s.waiters[0] !== id)) {
      if (!s.waiters.includes(id)) s.waiters.push(id)
      s.semBlocked = true
      detail = `${id} 等待许可；available=${s.permits}。公平常规 acquire 不越过前方等待者，尚未开始使用资源。`
    } else {
      const retry = s.waiters.includes(id)
      s.waiters = s.waiters.filter((worker) => worker !== id)
      s.permits--
      s.active.push(id)
      s.semRetried ||= retry
      detail = `${id} ${retry ? '重试后' : ''}获得一个许可，开始使用资源；当前并行任务 ${s.active.length}，available=${s.permits}。`
    }
  } else if (a.type === 'finish-permit') {
    if (!s.active.includes(id))
      return { ...state, error: '当前任务没有占用资源；正常的 finally 释放只配对它成功的 acquire。' }
    s.active = s.active.filter((worker) => worker !== id)
    s.permits++
    s.completed++
    detail = `${id} 完成资源使用，在 finally 中 release；available=${s.permits}。等待者可以重试，release 不意味着它已经执行。`
  } else if (a.type === 'raw-release') {
    if (s.permits >= 8) return { ...state, error: '演示许可最多显示 8 个；请新建 Semaphore 再试。' }
    s.permits++
    s.extraReleases++
    detail = `直接 Semaphore.release 增加许可到 ${s.permits}。Semaphore 不检查锁所有权，也不自动知道外部资源容量；未配对释放可造成超额并发。`
  } else {
    s.permits = 2
    s.active = []
    s.waiters = []
    s.completed = 0
    s.extraReleases = 0
    detail = '重建教学 Semaphore(2) 与资源任务，恢复可用许可与实际容量的一致性。'
  }
  s.log = addLog(s.log, a.type, detail, s.active.length + s.permits > 2 ? 'warning' : 'neutral')
  return s
}
export function presentCoordination(s: CoordinationState): ExperimentView {
  const reached =
    s.latchObserved &&
    s.semBlocked &&
    s.semRetried &&
    s.completed >= 3 &&
    s.permits === 2 &&
    s.active.length === 0 &&
    s.waiters.length === 0
  return {
    scene: {
      kind: 'data',
      title: 'Latch 等待一次完成，Semaphore 分配可复用许可',
      cards: [
        {
          id: 'latch',
          label: 'CountDownLatch.count',
          value: s.latch,
          detail: '只减到零；await 返回不再关闭闸门',
        },
        {
          id: 'permits',
          label: 'Semaphore.availablePermits',
          value: s.permits,
          detail: 'acquire 减少，release 增加；外部资源容量固定为 2',
        },
      ],
      tables: [
        {
          id: 'latch-workers',
          title: '三份独立工作 / 写结果后 countDown',
          columns: ['任务', '业务结果', '是否完成'],
          rows: workers.map((id) => ({
            id,
            values: [id, s.results[id] ?? '未写入', s.results[id] === null ? '否' : '是'],
          })),
        },
        {
          id: 'latch-reader',
          title: '协调者的 await 与读取',
          columns: ['状态', '最近读取的结果'],
          rows: [{ id: 'coordinator', values: [s.coordinator, s.readResults.join(', ') || '无'] }],
        },
        {
          id: 'semaphore-workers',
          title: '同名线程的另一组资源任务 / 与 Latch 工作独立',
          columns: ['任务', '资源状态'],
          rows: workers.map((id) => ({
            id,
            values: [
              id,
              s.active.includes(id) ? '占用一个资源' : s.waiters.includes(id) ? '等待许可' : '未占用',
            ],
          })),
        },
        {
          id: 'semaphore-queue',
          title: '公平 acquire 等待顺序',
          columns: ['顺序', '任务'],
          rows: s.waiters.map((id, i) => ({ id, values: [i + 1, id] })),
        },
      ],
      caption:
        '三个固定任务，Latch(3) 与 Semaphore(2) 是独立实验。正常资源任务保证一次 acquire 配对一次 finally release；额外 release 专门展示 Semaphore 没有锁所有权，也不校验外部容量。模拟公平 acquire、手动重试，不含中断 / 超时 / tryAcquire 插队、传播式共享唤醒或真实 AQS 节点。',
    },
    metrics: [
      { label: 'Latch 剩余信号', value: s.latch },
      { label: '已读取工作结果数', value: s.readResults.length },
      { label: '正在使用资源的任务', value: s.active.length },
      { label: '完成资源任务数', value: s.completed },
      { label: '未配对的额外 release', value: s.extraReleases },
    ],
    controls: [
      {
        id: 'selected',
        kind: 'select',
        label: '当前协调任务',
        value: s.selected,
        options: workers.map((id) => ({ value: id, label: id })),
      },
      { id: 'await', kind: 'button', label: '协调者 await / 重试返回', primary: true },
      { id: 'finish-latch', kind: 'button', label: '完成当前工作，再 countDown' },
      { id: 'count-down', kind: 'button', label: '只 countDown，不完成工作' },
      { id: 'new-latch', kind: 'button', label: '创建新的 Latch 与工作' },
      { id: 'acquire', kind: 'button', label: 'acquire · 获取或重试许可' },
      { id: 'finish-permit', kind: 'button', label: '完成资源任务并 release' },
      { id: 'raw-release', kind: 'button', label: '直接额外 release 一次' },
      { id: 'new-semaphore', kind: 'button', label: '重建 Semaphore 与资源任务' },
    ],
    status: {
      title: s.error
        ? '任务协调操作不能完成'
        : reached
          ? '一次性完成信号与可复用容量已经分开'
          : s.active.length + s.permits > 2
            ? '许可已超过真实资源容量'
            : '先明确等待的是完成事件还是资源许可',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先 await，再完成三份工作并重试返回；随后让 T1 / T2 各占一个资源，T3 等待释放后重试。',
      tone: s.error || s.active.length + s.permits > 2 ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '等待三份工作完成并读取结果，再让三个资源任务在两个许可下经历等待、重试与配对释放。',
      reached,
    },
    log: s.log,
  }
}
export const coordinationEngine: EngineFactory = () =>
  createSession(initialCoordination, coordinationTransition, presentCoordination)
