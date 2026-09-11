import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'

export type AtomicMode = 'volatile' | 'cas' | 'stamped'
export interface IncrementThread {
  id: 'T1' | 'T2'
  state: 'NEW' | 'RUNNABLE' | 'TERMINATED'
  pc: 'read' | 'write' | 'done'
  expected: number | null
  expectedStamp: number | null
  interrupted: boolean
  completed: boolean
}
export interface AtomicsState {
  mode: AtomicMode
  value: number
  stamp: number
  selected: 'T1' | 'T2'
  threads: IncrementThread[]
  joined: string | null
  mainWaiting: string | null
  failures: number
  commits: number
  abaChanges: number
  lost: boolean
  retried: boolean
  casCorrect: boolean
  stampedGuarded: boolean
  joinedCompleted: boolean
  error: string | null
  log: Observation[]
}
export function initialAtomics(mode: AtomicMode = 'volatile'): AtomicsState {
  return {
    mode,
    value: 0,
    stamp: 0,
    selected: 'T1',
    threads: (['T1', 'T2'] as const).map((id) => ({
      id,
      state: 'NEW',
      pc: 'read',
      expected: null,
      expectedStamp: null,
      interrupted: false,
      completed: false,
    })),
    joined: null,
    mainWaiting: null,
    failures: 0,
    commits: 0,
    abaChanges: 0,
    lost: false,
    retried: false,
    casCorrect: false,
    stampedGuarded: false,
    joinedCompleted: false,
    error: null,
    log: [],
  }
}
export function atomicsTransition(state: AtomicsState, a: ExperimentAction): AtomicsState {
  if (a.type === 'selected' && ['T1', 'T2'].includes(String(a.value)))
    return { ...state, selected: a.value as AtomicsState['selected'], error: null }
  if (a.type === 'mode' && ['volatile', 'cas', 'stamped'].includes(String(a.value)))
    return {
      ...initialAtomics(a.value as AtomicMode),
      lost: state.lost,
      retried: state.retried,
      casCorrect: state.casCorrect,
      stampedGuarded: state.stampedGuarded,
      joinedCompleted: state.joinedCompleted,
      log: addLog(
        state.log,
        '新建线程与计数场景',
        '新的两个 Thread 从 NEW 开始，共享值和版本归零；之前的正确性观察保留。',
      ),
    }
  if (!['start', 'step', 'join', 'interrupt', 'clear-interrupt', 'aba'].includes(a.type)) return state
  const s = structuredClone(state),
    thread = s.threads.find((thread) => thread.id === s.selected)!
  s.error = null
  let detail = ''
  if (a.type === 'start') {
    if (thread.state !== 'NEW')
      return {
        ...state,
        error: 'IllegalThreadStateException：同一个 Thread 只能 start 一次，即使它已经终止。',
      }
    thread.state = 'RUNNABLE'
    detail = `${thread.id}.start 使任务可被调度；并不保证立刻占用 CPU。直接调用 run() 则在调用者线程执行，不会创建这个生命周期。`
  } else if (a.type === 'join') {
    const target = s.threads.find((entry) => entry.id === (s.mainWaiting ?? thread.id))!
    if (target.state === 'RUNNABLE') {
      s.mainWaiting = target.id
      detail = `main.join 等待 ${target.id} 终止；它的自增还未必完成。选择其他线程不会替换已经等待的目标。`
    } else {
      s.mainWaiting = null
      s.joined = target.id
      s.joinedCompleted ||= target.completed
      detail =
        target.state === 'NEW'
          ? '尚未启动的线程并不 alive，join 可以立即返回；这不代表它的任务已经执行。'
          : `观察到 ${target.id} 终止，join 返回；本次读取共享值为 ${s.value}。线程动作与成功观察终止之间建立相应 happens-before。`
    }
  } else if (a.type === 'interrupt') {
    if (thread.state !== 'RUNNABLE')
      return { ...state, error: '本教学场景只向已启动且未终止的线程发出中断请求。' }
    thread.interrupted = true
    detail = `${thread.id} 的中断标志已设置；线程尚未被强制终止，任务在下一步骤主动检查它。`
  } else if (a.type === 'clear-interrupt') {
    if (thread.state !== 'RUNNABLE')
      return { ...state, error: '只有正在运行的教学线程可以执行 Thread.interrupted()。' }
    const previous = thread.interrupted
    thread.interrupted = false
    detail = `${thread.id} 模拟调用 Thread.interrupted() → ${previous}，并清除自己的中断状态。`
  } else if (a.type === 'aba') {
    const original = s.value
    s.value = original + 1
    s.stamp++
    s.value = original
    s.stamp++
    s.abaChanges++
    detail = `另一个写者将 ${original} → ${original + 1} → ${original}，值恢复但版本变成 ${s.stamp}。普通值 CAS 不能据此识别中间变化。`
  } else {
    if (thread.state !== 'RUNNABLE')
      return { ...state, error: '先 start 当前 Thread；终止后的线程不能继续执行。' }
    if (thread.interrupted) {
      thread.state = 'TERMINATED'
      thread.pc = 'done'
      detail = `${thread.id} 主动检查到中断并退出，未完成的自增不提交。中断不是撤销此前已完成动作。`
    } else if (thread.pc === 'read') {
      thread.expected = s.value
      thread.expectedStamp = s.stamp
      thread.pc = 'write'
      detail = `${thread.id} 读取当前值 ${s.value}、版本 ${s.stamp}，局部计算候选值 ${s.value + 1}。读取可见性不把后面的写合并成一个原子步骤。`
    } else {
      const equalValue = thread.expected === s.value,
        equalStamp = thread.expectedStamp === s.stamp
      if (s.mode !== 'volatile' && (!equalValue || (s.mode === 'stamped' && !equalStamp))) {
        s.failures++
        s.retried ||= s.mode === 'cas'
        s.stampedGuarded ||= s.mode === 'stamped' && equalValue && !equalStamp
        thread.pc = 'read'
        detail = `${thread.id} CAS 失败：期望 (${thread.expected},v${thread.expectedStamp})，实际 (${s.value},v${s.stamp})。不写入，下一步重新读取后重算。`
        thread.expected = null
        thread.expectedStamp = null
      } else {
        const before = s.value
        s.value = thread.expected! + 1
        s.stamp++
        s.commits++
        thread.completed = true
        thread.state = 'TERMINATED'
        thread.pc = 'done'
        s.lost ||= s.mode === 'volatile' && !equalValue
        s.casCorrect ||= s.mode === 'cas' && s.commits === 2 && s.value === 2 && s.failures > 0
        detail = `${thread.id} ${s.mode === 'volatile' ? '写回局部候选' : '以原子 CAS 提交'}：${before} → ${s.value}。${s.mode === 'volatile' && !equalValue ? '另一个自增被覆盖，volatile 的新鲜读取仍不能保护这个复合操作。' : '本次自增完成，线程随后终止。'}`
      }
    }
  }
  s.log = addLog(s.log, a.type, detail, s.lost && s.mode === 'volatile' ? 'warning' : 'neutral')
  return s
}
export function presentAtomics(s: AtomicsState): ExperimentView {
  const thread = s.threads.find((thread) => thread.id === s.selected)!,
    reached = s.lost && s.retried && s.casCorrect && s.stampedGuarded && s.joinedCompleted
  return {
    scene: {
      kind: 'data',
      title: '新鲜读取、复合原子性与中间历史是三种问题',
      cards: [
        { id: 'shared', label: '共享计数 / 版本', value: `${s.value} / v${s.stamp}` },
        {
          id: 'main',
          label: 'main 的 join 状态',
          value: s.mainWaiting ? `等待 ${s.mainWaiting}` : s.joined ? `已观察 ${s.joined} 结束` : '未 join',
        },
      ],
      tables: [
        {
          id: 'atomic-threads',
          title: '两个 Thread 的生命周期与局部读取',
          columns: ['线程', '状态', '下一步', '期望值', '期望版本', '中断'],
          rows: s.threads.map((thread) => ({
            id: thread.id,
            values: [
              thread.id,
              thread.state,
              thread.pc,
              thread.expected ?? '未读',
              thread.expectedStamp ?? '未读',
              String(thread.interrupted),
            ],
          })),
        },
        {
          id: 'atomic-semantics',
          title: '当前写回规则',
          columns: ['模式', '提交条件', '失败时'],
          rows: [
            {
              id: s.mode,
              values: [
                s.mode,
                s.mode === 'volatile'
                  ? '直接写入 read+1；读写分别可见'
                  : s.mode === 'cas'
                    ? '当前值 = 期望值'
                    : '当前值与版本都等于读取时快照',
                s.mode === 'volatile' ? '不会自动检测丢失更新' : '不写入，重新读取并计算',
              ],
            },
          ],
        },
      ],
      caption:
        '两线程各自执行一次自增，调度由点击显式控制；volatile 读取在本模型始终取当前值，仍可复现丢失更新。CAS 是单个不可分割的状态转移，不模拟机器指令或弱 CAS 的伪失败。版本戳单调增长且不回绕；ABA 场景只展示历史检测，不涉及真实对象回收。中断检查是本任务的协作约定。',
    },
    metrics: [
      { label: '共享计数值', value: s.value },
      { label: '完成的自增动作', value: s.commits },
      { label: 'CAS 失败次数', value: s.failures },
      { label: 'ABA 中间变化', value: s.abaChanges },
    ],
    controls: [
      {
        id: 'mode',
        kind: 'select',
        label: '新线程场景的更新机制',
        value: s.mode,
        options: [
          { value: 'volatile', label: 'volatile int / read + write' },
          { value: 'cas', label: 'Atomic CAS / 值比较与重试' },
          { value: 'stamped', label: 'Stamped CAS / 值与版本比较' },
        ],
      },
      {
        id: 'selected',
        kind: 'select',
        label: '当前 Java Thread',
        value: s.selected,
        options: ['T1', 'T2'].map((id) => ({ value: id, label: id })),
      },
      { id: 'start', kind: 'button', label: 'Thread.start · 启动一次', primary: true },
      {
        id: 'step',
        kind: 'button',
        label: '执行当前线程的读 / 写步骤',
        disabled: thread.state !== 'RUNNABLE',
      },
      { id: 'join', kind: 'button', label: 'main · join 当前线程' },
      {
        id: 'interrupt',
        kind: 'button',
        label: '向当前线程发出 interrupt',
        disabled: thread.state !== 'RUNNABLE',
      },
      {
        id: 'clear-interrupt',
        kind: 'button',
        label: '线程检查并清除中断标志',
        disabled: thread.state !== 'RUNNABLE',
      },
      {
        id: 'aba',
        kind: 'button',
        label: '插入一次 A → B → A 修改',
        disabled: !s.threads.some((thread) => thread.state === 'RUNNABLE' && thread.pc === 'write'),
      },
    ],
    status: {
      title: s.error
        ? '线程操作不能完成'
        : reached
          ? '可见性、CAS 重试与版本检测已经分开'
          : '先让两个线程都读到 0，再分别提交',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '默认 volatile 模式启动两线程并各读一次，再写回；换 CAS 重做并重试，最后用 Stamped CAS 检查 ABA。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '复现 volatile 丢失更新，用 CAS 失败后重试得到 2 并 join，再验证版本戳拒绝一次 ABA。',
      reached,
    },
    log: s.log,
  }
}
export const atomicsEngine: EngineFactory = () =>
  createSession(() => initialAtomics(), atomicsTransition, presentAtomics)
