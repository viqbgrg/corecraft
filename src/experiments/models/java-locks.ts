import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'

export type LockThread = 'T1' | 'T2' | 'T3'
export interface QueuedAcquirer {
  thread: LockThread
  restore: number
  afterAwait: boolean
}
export interface ConditionWaiter {
  thread: LockThread
  restore: number
}
export interface JavaLocksState {
  kind: 'aqs' | 'monitor'
  fair: boolean
  selected: LockThread
  owner: LockThread | null
  holds: number
  syncQueue: QueuedAcquirer[]
  conditionQueue: ConditionWaiter[]
  ready: boolean
  produced: number
  consumed: number
  reentered: boolean
  releasedAll: boolean
  signaledWithoutTransfer: boolean
  restored: boolean
  spuriousHandled: boolean
  error: string | null
  log: Observation[]
}
export function initialJavaLocks(): JavaLocksState {
  return {
    kind: 'aqs',
    fair: true,
    selected: 'T1',
    owner: null,
    holds: 0,
    syncQueue: [],
    conditionQueue: [],
    ready: false,
    produced: 0,
    consumed: 0,
    reentered: false,
    releasedAll: false,
    signaledWithoutTransfer: false,
    restored: false,
    spuriousHandled: false,
    error: null,
    log: [],
  }
}
function newLockScenario(s: JavaLocksState): JavaLocksState {
  return {
    ...initialJavaLocks(),
    reentered: s.reentered,
    releasedAll: s.releasedAll,
    signaledWithoutTransfer: s.signaledWithoutTransfer,
    restored: s.restored,
    spuriousHandled: s.spuriousHandled,
    log: addLog(
      s.log,
      '创建新锁实例',
      '新实例采用选定机制和公平策略，所有权、等待队列与单槽数据重置；已观察的机制证据保留。',
    ),
  }
}
export function locksTransition(state: JavaLocksState, a: ExperimentAction): JavaLocksState {
  if (a.type === 'selected' && ['T1', 'T2', 'T3'].includes(String(a.value)))
    return { ...state, selected: a.value as LockThread, error: null }
  if (a.type === 'kind' && ['aqs', 'monitor'].includes(String(a.value)))
    return { ...newLockScenario(state), kind: a.value as JavaLocksState['kind'], fair: a.value === 'aqs' }
  if (a.type === 'fair' && ['fair', 'nonfair'].includes(String(a.value)) && state.kind === 'aqs')
    return { ...newLockScenario(state), fair: a.value === 'fair' }
  if (!['enter', 'exit', 'await', 'signal', 'produce', 'consume', 'spurious'].includes(a.type)) return state
  const s = structuredClone(state),
    thread = s.selected
  s.error = null
  let detail = ''
  if (a.type === 'enter') {
    if (s.conditionQueue.some((waiter) => waiter.thread === thread))
      return {
        ...state,
        error: `${thread} 仍在条件等待集合；signal、notify 或模拟伪唤醒使它离开后，才参与重新竞争。`,
      }
    if (s.owner === thread) {
      s.holds++
      s.reentered = true
      detail = `${thread} 可重入获取，持有计数变为 ${s.holds}；其他线程仍不能进入。`
    } else if (s.owner !== null || (s.fair && s.syncQueue.length > 0 && s.syncQueue[0]!.thread !== thread)) {
      if (!s.syncQueue.some((entry) => entry.thread === thread))
        s.syncQueue.push({ thread, restore: 1, afterAwait: false })
      detail = `${thread} 获取失败，进入${s.kind === 'aqs' ? 'AQS 同步队列' : '监视器争用集合'}。当前 owner=${s.owner ?? '无'}${s.fair && s.syncQueue[0]?.thread !== thread ? '，公平策略要求前方等待者先尝试' : ''}。`
    } else {
      const queued = s.syncQueue.find((entry) => entry.thread === thread)
      s.syncQueue = s.syncQueue.filter((entry) => entry.thread !== thread)
      s.owner = thread
      s.holds = queued?.restore ?? 1
      if (queued?.afterAwait && !s.ready) {
        s.spuriousHandled = true
        s.conditionQueue.push({ thread, restore: s.holds })
        s.owner = null
        s.holds = 0
        detail = `${thread} 已重新获得锁并恢复计数 ${queued.restore}，但 while(!ready) 仍为真，于是再次 await 并释放全部持有。唤醒不证明谓词成立。`
      } else {
        s.restored ||= !!queued?.afterAwait && s.holds > 1
        detail = `${thread} 成为 owner，持有计数=${s.holds}。${queued?.afterAwait ? 'await / wait 在重新获得锁后才正常返回，随后重新检查谓词。' : '现在可以执行受保护的操作。'}`
      }
    }
  } else if (a.type === 'spurious') {
    const waiter = s.conditionQueue.shift()
    if (!waiter) return state
    s.syncQueue.push({ ...waiter, afterAwait: true })
    detail = `模拟 ${waiter.thread} 伪唤醒：只使其有机会重新竞争锁，ready 仍为 ${s.ready}。本动作是调度注入，不是用户调用的 Java API。`
  } else {
    if (s.owner !== thread)
      return {
        ...state,
        error: 'IllegalMonitorStateException：当前线程没有持有对应锁，不能解锁或操作它的条件。',
      }
    if (a.type === 'exit') {
      s.holds--
      if (s.holds === 0) s.owner = null
      detail = `${thread} 释放一次持有，剩余=${s.holds}。${s.owner ? '重入计数尚未归零，其他线程仍不能进入。' : '等待者可重新竞争，尚未自动成为 owner。'}`
    } else if (a.type === 'await') {
      if (s.ready) detail = 'while(!ready) 为假，不需要等待；持有锁继续执行。'
      else {
        s.conditionQueue.push({ thread, restore: s.holds })
        s.releasedAll ||= s.holds > 1
        detail = `${thread} 记录持有计数 ${s.holds}，进入条件等待并释放全部计数；其他线程可以获得锁来改变 ready。`
        s.owner = null
        s.holds = 0
      }
    } else if (a.type === 'signal') {
      const waiter = s.conditionQueue.shift()
      if (!waiter) detail = '当前没有条件等待者，本次 signal / notify 不储存一个未来许可。'
      else {
        s.syncQueue.push({ ...waiter, afterAwait: true })
        s.signaledWithoutTransfer = true
        detail = `${waiter.thread} 从条件集合转入重新获取锁的队列；${thread} 仍是 owner，signal / notify 没有释放锁。`
      }
    } else if (a.type === 'produce') {
      if (s.ready) return { ...state, error: '单槽已经有数据；本次没有重复生产。' }
      s.ready = true
      s.produced++
      detail = `${thread} 在锁内写入单槽数据并设置 ready=true；是否唤醒等待者是另一项操作。`
    } else {
      if (!s.ready)
        return { ...state, error: '没有可消费数据；应该在 while 中检查谓词并 await，不能只凭被唤醒就消费。' }
      s.ready = false
      s.consumed++
      detail = `${thread} 重新检查 ready 后消费数据，设置 ready=false。`
    }
  }
  s.log = addLog(s.log, a.type, detail)
  return s
}
export function presentJavaLocks(s: JavaLocksState): ExperimentView {
  const reached =
    s.reentered &&
    s.releasedAll &&
    s.signaledWithoutTransfer &&
    s.restored &&
    s.consumed > 0 &&
    s.owner === null &&
    s.syncQueue.length === 0 &&
    s.conditionQueue.length === 0
  return {
    scene: {
      kind: 'data',
      title: '条件等待集合与获取锁的等待队列不是同一件事',
      cards: [
        {
          id: 'lock',
          label: s.kind === 'aqs' ? 'ReentrantLock / AQS state' : 'synchronized / Monitor 持有计数',
          value: `${s.owner ?? '无 owner'} / ${s.holds}`,
        },
        {
          id: 'predicate',
          label: '受保护的条件谓词',
          value: `ready = ${s.ready}`,
          detail: 'while (!ready) await / wait；返回后继续检查',
        },
      ],
      tables: [
        {
          id: 'lock-sync-queue',
          title:
            s.kind === 'aqs'
              ? 'AQS 同步队列 / 等待独占获取'
              : '监视器争用者 / 本模型展示顺序不构成 FIFO 保证',
          columns: ['线程', '待恢复计数', '来自条件等待'],
          rows: s.syncQueue.map((entry) => ({
            id: entry.thread,
            values: [entry.thread, entry.restore, entry.afterAwait ? '是' : '否'],
          })),
        },
        {
          id: 'lock-condition-queue',
          title: s.kind === 'aqs' ? 'Condition 等待集合' : 'Object.wait 等待集合',
          columns: ['线程', 'await 前保存的持有计数'],
          rows: s.conditionQueue.map((entry) => ({
            id: entry.thread,
            values: [entry.thread, entry.restore],
          })),
        },
        {
          id: 'lock-thread-states',
          title: '教学调度状态 / 不逐项等同于 Thread.State',
          columns: ['线程', '所在位置'],
          rows: (['T1', 'T2', 'T3'] as const).map((thread) => ({
            id: thread,
            values: [
              thread,
              s.owner === thread
                ? '临界区内'
                : s.conditionQueue.some((entry) => entry.thread === thread)
                  ? '等待条件'
                  : s.syncQueue.some((entry) => entry.thread === thread)
                    ? '等待获取锁'
                    : '可尝试执行',
            ],
          })),
        },
      ],
      caption:
        '单个可重入独占锁、单个条件与单槽谓词。AQS 是 ReentrantLock 的同步框架，不能用来解释 synchronized 的内部实现。Monitor 不承诺 FIFO；本模型的公平 ReentrantLock 只模拟常规获取，不含可插队的 tryLock 例外。未实现超时、中断、多个 Condition 或自旋 / park 的底层细节。伪唤醒路径自动执行 while 检查。',
    },
    metrics: [
      { label: '锁持有计数', value: s.holds },
      { label: '获取锁的等待者', value: s.syncQueue.length },
      { label: '等待条件的线程', value: s.conditionQueue.length },
      { label: '生产 / 消费次数', value: `${s.produced} / ${s.consumed}` },
    ],
    controls: [
      {
        id: 'kind',
        kind: 'select',
        label: '新锁实例的实现机制',
        value: s.kind,
        options: [
          { value: 'aqs', label: 'ReentrantLock + Condition / AQS' },
          { value: 'monitor', label: 'synchronized + wait / notify' },
        ],
      },
      {
        id: 'fair',
        kind: 'select',
        label: '新 ReentrantLock 的公平策略',
        value: s.fair ? 'fair' : 'nonfair',
        disabled: s.kind === 'monitor',
        options: [
          { value: 'fair', label: '公平常规获取' },
          { value: 'nonfair', label: '非公平 / 允许新尝试插队' },
        ],
      },
      {
        id: 'selected',
        kind: 'select',
        label: '当前锁操作线程',
        value: s.selected,
        options: ['T1', 'T2', 'T3'].map((thread) => ({ value: thread, label: thread })),
      },
      { id: 'enter', kind: 'button', label: 'lock / monitorenter · 获取或重试', primary: true },
      { id: 'exit', kind: 'button', label: 'unlock / monitorexit · 释放一次' },
      { id: 'await', kind: 'button', label: 'while 检查并 await / wait' },
      { id: 'produce', kind: 'button', label: '在锁内生产并设置 ready' },
      { id: 'signal', kind: 'button', label: 'signal / notify 一个等待者' },
      { id: 'consume', kind: 'button', label: '在锁内检查并消费' },
      {
        id: 'spurious',
        kind: 'button',
        label: '模拟一个条件伪唤醒',
        disabled: s.conditionQueue.length === 0,
      },
    ],
    status: {
      title: s.error
        ? '锁或条件操作前提不满足'
        : reached
          ? '唤醒、重新获取与条件检查缺一不可'
          : '通知只改变等待位置，不直接交出锁',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        'T1 重入两次再 await；T2 获锁、生产并 signal，释放后由 T1 重试，检查恢复的持有计数。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: 'T1 重入两次后完全释放并等待，T2 生产和通知，再让 T1 恢复两次持有、消费并正确释放。',
      reached,
    },
    log: s.log,
  }
}
export const locksEngine: EngineFactory = () =>
  createSession(initialJavaLocks, locksTransition, presentJavaLocks)
