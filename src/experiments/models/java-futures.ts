import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

type WorkerId = 'W1' | 'W2'
type StageId = 'sum' | 'double' | 'remote' | 'recover' | 'combine'
interface ForkTask {
  id: number
  from: number
  to: number
  parent: number | null
  children: number[]
  state: 'queued' | 'waiting' | 'done'
  result: number | null
  worker: string | null
}
interface FutureStage {
  id: StageId
  deps: StageId[]
  state: 'pending' | 'queued' | 'fulfilled' | 'rejected' | 'cancelled'
  value: number | null
  cause: string | null
  context: string
}
type Work = { kind: 'fork'; id: number } | { kind: 'future'; id: StageId; epoch: number }
export interface FuturesState {
  input: string
  values: number[]
  leafSize: number
  activeLeafSize: number
  tasks: ForkTask[]
  deques: Record<WorkerId, Work[]>
  selected: WorkerId
  nextTask: number
  steals: number
  sum: number | null
  stages: FutureStage[]
  epoch: number
  async: boolean
  recovery: boolean
  outcome: 'success' | 'failure'
  chain: { async: boolean; recovery: boolean; outcome: 'success' | 'failure' }
  joined: string
  normalSeen: boolean
  failureSeen: boolean
  recoverySeen: boolean
  error: string | null
  log: Observation[]
}
const stage = (id: StageId, deps: StageId[] = []): FutureStage => ({
  id,
  deps,
  state: 'pending',
  value: null,
  cause: null,
  context: '尚未执行',
})
export function initialFutures(): FuturesState {
  return {
    input: '1,2,3,4,5,6,7,8',
    values: [1, 2, 3, 4, 5, 6, 7, 8],
    leafSize: 2,
    activeLeafSize: 2,
    tasks: [
      { id: 1, from: 0, to: 8, parent: null, children: [], state: 'queued', result: null, worker: null },
    ],
    deques: { W1: [{ kind: 'fork', id: 1 }], W2: [] },
    selected: 'W1',
    nextTask: 2,
    steals: 0,
    sum: null,
    stages: [stage('sum'), stage('double', ['sum']), stage('remote'), stage('combine', ['double', 'remote'])],
    epoch: 1,
    async: true,
    recovery: false,
    outcome: 'success',
    chain: { async: true, recovery: false, outcome: 'success' },
    joined: '尚未 join',
    normalSeen: false,
    failureSeen: false,
    recoverySeen: false,
    error: null,
    log: [],
  }
}
function node(s: FuturesState, id: StageId) {
  return s.stages.find((n) => n.id === id)!
}
function completeStage(s: FuturesState, n: FutureStage, context: string) {
  const deps = n.deps.map((id) => node(s, id))
  n.value =
    n.id === 'double' ? deps[0]!.value! * 2 : n.id === 'recover' ? 0 : deps[0]!.value! + deps[1]!.value!
  n.state = 'fulfilled'
  n.context = context
  s.log = addLog(
    s.log,
    `${n.id} 回调`,
    `${context} 执行 ${n.id}，得到 ${n.value}；依赖图不要求每阶段创建新线程。`,
  )
}
function settleFutures(s: FuturesState, context: string) {
  let changed = true
  while (changed) {
    changed = false
    for (const n of s.stages) {
      if (n.state !== 'pending' || n.deps.length === 0) continue
      const deps = n.deps.map((id) => node(s, id))
      if (deps.some((d) => ['pending', 'queued'].includes(d.state))) continue
      const failure = deps.find((d) => d.state !== 'fulfilled')
      changed = true
      if (n.id === 'recover' && !failure) {
        n.state = 'fulfilled'
        n.value = deps[0]!.value
        n.context = `${context} / 透传正常值`
        continue
      }
      if (n.id !== 'recover' && failure) {
        n.state = 'rejected'
        n.cause = failure.cause
        n.context = `${context} / 跳过正常回调`
        continue
      }
      if (s.chain.async) {
        n.state = 'queued'
        n.context = '等待显式教学执行器'
        s.deques[context === 'W2' ? 'W2' : 'W1'].push({ kind: 'future', id: n.id, epoch: s.epoch })
      } else completeStage(s, n, context)
    }
  }
}
function finishFork(s: FuturesState, task: ForkTask, context: string) {
  task.state = 'done'
  if (task.parent !== null) {
    const parent = s.tasks.find((t) => t.id === task.parent)!,
      children = parent.children.map((id) => s.tasks.find((t) => t.id === id)!)
    if (children.every((child) => child.state === 'done')) {
      parent.result = children.reduce((sum, child) => sum + child.result!, 0)
      parent.worker = `${context} / join`
      finishFork(s, parent, context)
    }
  } else {
    s.sum = task.result
    const source = node(s, 'sum')
    source.state = 'fulfilled'
    source.value = s.sum
    source.context = context
    settleFutures(s, context)
  }
}
function stepWorker(s: FuturesState, worker: WorkerId) {
  let job = s.deques[worker].pop()
  const other = worker === 'W1' ? 'W2' : 'W1'
  if (!job) {
    job = s.deques[other].shift()
    if (job) {
      s.steals++
      s.log = addLog(
        s.log,
        '工作窃取',
        `${worker} 从 ${other} 的队首窃取最旧任务；owner 从自己的队尾取最新任务。`,
      )
    }
  }
  if (!job) return false
  if (job.kind === 'future') {
    if (job.epoch !== s.epoch || node(s, job.id).state !== 'queued') return true
    completeStage(s, node(s, job.id), worker)
    settleFutures(s, worker)
    return true
  }
  const task = s.tasks.find((t) => t.id === job.id)!
  task.worker = worker
  if (task.to - task.from <= s.activeLeafSize) {
    task.result = s.values.slice(task.from, task.to).reduce((sum, value) => sum + value, 0)
    s.log = addLog(s.log, '叶任务求和', `${worker} 计算 [${task.from}, ${task.to}) = ${task.result}。`)
    finishFork(s, task, worker)
  } else {
    const mid = Math.floor((task.from + task.to) / 2)
    task.state = 'waiting'
    for (const [from, to] of [
      [task.from, mid],
      [mid, task.to],
    ]) {
      const child: ForkTask = {
        id: s.nextTask++,
        from: from!,
        to: to!,
        parent: task.id,
        children: [],
        state: 'queued',
        result: null,
        worker: null,
      }
      s.tasks.push(child)
      task.children.push(child.id)
      s.deques[worker].push({ kind: 'fork', id: child.id })
    }
    s.log = addLog(
      s.log,
      'Fork 分解',
      `${worker} 将 F${task.id} 分成 ${task.children.map((id) => `F${id}`).join('、')}，父任务等待两个真实子结果；worker 可继续执行其他任务。`,
    )
  }
  return true
}
export function futuresTransition(state: FuturesState, a: ExperimentAction): FuturesState {
  if (a.type === 'selected' && ['W1', 'W2'].includes(String(a.value)))
    return { ...state, selected: a.value as WorkerId, error: null }
  if (a.type === 'input') return { ...state, input: String(a.value ?? ''), error: null }
  if (a.type === 'leafSize') {
    const value = boundedInteger(a.value, 1, 4)
    return value === null ? state : { ...state, leafSize: value }
  }
  if (['async', 'recovery'].includes(a.type) && ['on', 'off'].includes(String(a.value)))
    return { ...state, [a.type]: a.value === 'on' }
  if (a.type === 'outcome' && ['success', 'failure'].includes(String(a.value)))
    return { ...state, outcome: a.value as FuturesState['outcome'] }
  if (!['step', 'run', 'remote', 'rebuild', 'restart', 'join', 'cancel'].includes(a.type)) return state
  const s = structuredClone(state)
  s.error = null
  if (a.type === 'restart') {
    const parts = s.input.split(',').map((part) => part.trim()),
      values = parts.map((part) => boundedInteger(part, -99, 99))
    if (!parts.length || parts.length > 16 || values.some((v) => v === null))
      return { ...state, error: '输入 1–16 个逗号分隔的整数，每个在 -99–99 之间。' }
    const fresh = initialFutures()
    fresh.input = s.input
    fresh.values = values as number[]
    fresh.tasks[0]!.to = values.length
    fresh.leafSize = s.leafSize
    fresh.activeLeafSize = s.leafSize
    return fresh
  }
  if (a.type === 'rebuild') {
    s.epoch++
    s.chain = { async: s.async, recovery: s.recovery, outcome: s.outcome }
    s.joined = '尚未 join'
    for (const id of ['W1', 'W2'] as const) s.deques[id] = s.deques[id].filter((job) => job.kind === 'fork')
    s.stages = [
      stage('sum'),
      stage('double', ['sum']),
      stage('remote'),
      ...(s.recovery ? [stage('recover', ['remote'])] : []),
      stage('combine', ['double', s.recovery ? 'recover' : 'remote']),
    ]
    if (s.sum !== null) {
      Object.assign(node(s, 'sum'), { state: 'fulfilled', value: s.sum, context: 'caller / 已有结果' })
      settleFutures(s, 'caller')
    }
    s.log = addLog(
      s.log,
      '构建新依赖链',
      `第 ${s.epoch} 条链使用${s.chain.async ? '异步回调' : '同步回调'}；已完成的求和可复用，旧链排队回调不参与新链。`,
    )
  } else if (a.type === 'step') stepWorker(s, s.selected)
  else if (a.type === 'run') {
    for (let i = 0; i < 256; i++) {
      const progressed = stepWorker(s, i % 2 ? 'W2' : 'W1')
      if (!progressed && !s.deques.W1.length && !s.deques.W2.length) break
    }
  } else if (a.type === 'remote') {
    const remote = node(s, 'remote')
    if (remote.state !== 'pending') return state
    remote.state = s.chain.outcome === 'failure' ? 'rejected' : 'fulfilled'
    remote.value = remote.state === 'fulfilled' ? 10 : null
    remote.cause = remote.state === 'rejected' ? 'RemoteException' : null
    remote.context = 'caller / 外部完成'
    s.log = addLog(s.log, '远端 source 完成', remote.cause ?? '返回 10')
    settleFutures(s, 'caller')
  } else if (a.type === 'cancel') {
    const result = node(s, 'combine')
    if (['fulfilled', 'rejected', 'cancelled'].includes(result.state)) return state
    result.state = 'cancelled'
    result.cause = 'CancellationException'
    result.context = 'caller / cancel(true)'
    s.log = addLog(
      s.log,
      '取消组合结果',
      'CompletableFuture.cancel(true) 将此 future 标记为取消，不保证中断产生结果的工作；ForkJoin 叶任务仍在队列中。',
      'warning',
    )
  } else {
    const result = node(s, 'combine')
    if (result.state === 'fulfilled') {
      s.joined = String(result.value)
      s.normalSeen ||= s.chain.outcome === 'success' && result.value === s.sum! * 2 + 10
      s.recoverySeen ||= s.chain.outcome === 'failure' && s.chain.recovery && result.value === s.sum! * 2
    } else if (result.state === 'rejected') {
      s.joined = `CompletionException(cause=${result.cause})`
      s.failureSeen ||= result.cause === 'RemoteException'
    } else if (result.state === 'cancelled') s.joined = 'CancellationException'
    else s.joined = '尚未完成：join 将等待；教学界面保持可操作'
    s.log = addLog(s.log, 'join 观察结果', s.joined)
  }
  return s
}
export function presentFutures(s: FuturesState): ExperimentView {
  const reached = s.steals > 0 && s.normalSeen && s.failureSeen && s.recoverySeen
  return {
    scene: {
      kind: 'data',
      title: '工作队列执行任务，Future 依赖决定结果何时可用',
      tables: [
        {
          id: 'fork-deques',
          title: 'owner 从右取，thief 从左取',
          columns: ['Worker', '从最旧到最新'],
          rows: (['W1', 'W2'] as const).map((id) => ({
            id,
            values: [
              id,
              s.deques[id]
                .map((job) => (job.kind === 'fork' ? `F${job.id}` : `${job.id}@${job.epoch}`))
                .join(' → ') || '空',
            ],
          })),
        },
        {
          id: 'fork-tasks',
          title: '真实区间分解与归并',
          columns: ['任务', '区间', '子任务', '状态', '结果', '执行者'],
          rows: s.tasks.map((task) => ({
            id: String(task.id),
            values: [
              `F${task.id}`,
              `[${task.from},${task.to})`,
              task.children.join(', ') || '叶',
              task.state,
              task.result ?? '—',
              task.worker ?? '等待',
            ],
          })),
        },
        {
          id: 'future-stages',
          title: `CompletableFuture 依赖链 ${s.epoch}`,
          columns: ['Stage', '依赖', '状态', '值 / 原因', '回调上下文'],
          rows: s.stages.map((n) => ({
            id: n.id,
            values: [n.id, n.deps.join(' + ') || 'source', n.state, n.cause ?? n.value ?? '—', n.context],
          })),
        },
      ],
      caption:
        '双 worker 的 ForkJoin 分治求和，显式教学执行器承接 Async 回调。非 Async 回调演示由完成线程执行的合法路径，真实实现也可能由其他完成相关调用者执行；未指定执行器的 Async 通常使用 commonPool。省略线程补偿、异常的 ForkJoinTask 传播与实际调度；父 join 挂起不等于始终占住 worker。',
    },
    metrics: [
      { label: 'ForkJoin 求和', value: s.sum ?? '未完成' },
      { label: '工作窃取次数', value: s.steals },
      { label: 'join 观察值', value: s.joined },
    ],
    controls: [
      {
        id: 'selected',
        kind: 'select',
        label: '执行一个步骤的 worker',
        value: s.selected,
        options: ['W1', 'W2'].map((id) => ({ value: id, label: id })),
      },
      { id: 'step', kind: 'button', label: 'worker 取任务并执行一步', primary: true },
      { id: 'run', kind: 'button', label: '运行所有当前可执行任务' },
      {
        id: 'outcome',
        kind: 'select',
        label: '新链的远端结果',
        value: s.outcome,
        options: [
          { value: 'success', label: '成功 / 10' },
          { value: 'failure', label: '失败 / RemoteException' },
        ],
      },
      {
        id: 'recovery',
        kind: 'select',
        label: '新链的异常恢复',
        value: s.recovery ? 'on' : 'off',
        options: [
          { value: 'off', label: '传播异常' },
          { value: 'on', label: 'exceptionally / 恢复为 0' },
        ],
      },
      {
        id: 'async',
        kind: 'select',
        label: '新链的回调执行方式',
        value: s.async ? 'on' : 'off',
        options: [
          { value: 'on', label: 'Async / 入执行器队列' },
          { value: 'off', label: '非 Async / 完成线程执行' },
        ],
      },
      { id: 'rebuild', kind: 'button', label: '按配置重建 Future 依赖链' },
      {
        id: 'remote',
        kind: 'button',
        label: '完成远端 source',
        disabled: node(s, 'remote').state !== 'pending',
      },
      { id: 'join', kind: 'button', label: 'join · 观察组合结果' },
      { id: 'cancel', kind: 'button', label: 'cancel(true) · 取消组合结果' },
      { id: 'input', kind: 'text', label: '重开求和的整数序列', value: s.input },
      { id: 'leafSize', kind: 'number', label: '叶任务最大长度', value: s.leafSize, min: 1, max: 4 },
      { id: 'restart', kind: 'button', label: '重开整个求和实验' },
    ],
    status: {
      title: s.error
        ? '检查求和输入'
        : reached
          ? '任务调度、异常传播和恢复分别得到验证'
          : '先取得真实子任务结果，再组合 Future',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        'W1 分解根任务，W2 窃取一个分支。运行求和，完成远端并 join，再重建失败和恢复两条链。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '观察工作窃取，join 正常组合值、未恢复异常与恢复后的组合值。', reached },
    log: s.log,
  }
}
export const futuresEngine: EngineFactory = () =>
  createSession(initialFutures, futuresTransition, presentFutures)
