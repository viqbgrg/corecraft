import type {
  EngineFactory,
  ExperimentAction,
  ExperimentView,
  Observation,
  ProcessScene,
} from '../../types/experiment'
import { addLog, createSession, integer } from '../core/session'

export interface ProcessState {
  processes: ProcessScene['processes']
  threads: ProcessScene['threads']
  ready: string[]
  running: string | null
  last: string | null
  selected: string
  quantum: number
  used: number
  ticks: number
  switches: number
  blocks: number
  wakes: number
  log: Observation[]
}
export function initialProcess(): ProcessState {
  return {
    processes: [
      { id: 'p1', name: 'Process A', memory: 0 },
      { id: 'p2', name: 'Process B', memory: 0 },
    ],
    threads: [
      { id: 'T1', name: 'Thread 1', process: 'p1', state: 'Ready', pc: 0, stack: [0] },
      { id: 'T2', name: 'Thread 2', process: 'p1', state: 'Ready', pc: 0, stack: [0] },
      { id: 'T3', name: 'Thread 3', process: 'p2', state: 'Ready', pc: 0, stack: [0] },
    ],
    ready: ['T1', 'T2', 'T3'],
    running: null,
    last: null,
    selected: 'T1',
    quantum: 3,
    used: 0,
    ticks: 0,
    switches: 0,
    blocks: 0,
    wakes: 0,
    log: [],
  }
}
function schedule(s: ProcessState) {
  if (s.running) {
    const current = s.threads.find((t) => t.id === s.running)!
    current.state = 'Ready'
    s.ready.push(current.id)
    s.log = addLog(
      s.log,
      '保存 ' + current.id + ' 上下文',
      '保存 PC = ' + current.pc + ' 与私有栈帧。进程共享计数器继续保留。',
    )
  }
  const next = s.ready.shift() ?? null
  if (next) {
    const thread = s.threads.find((t) => t.id === next)!
    thread.state = 'Running'
    if (s.last && s.last !== next) s.switches++
    s.log = addLog(
      s.log,
      '调度 ' + next,
      '恢复 PC = ' +
        thread.pc +
        '、栈内局部计数 = ' +
        thread.stack[0] +
        '。就绪队列：' +
        (s.ready.join(' → ') || '空') +
        '。',
      'success',
    )
    s.last = next
  } else
    s.log = addLog(
      s.log,
      'CPU 空闲',
      '没有 Ready 线程。等待 IO 完成或条件通知，不能调度一个仍然阻塞的线程。',
      'warning',
    )
  s.running = next
  s.used = 0
}
export function transitionProcess(state: ProcessState, action: ExperimentAction): ProcessState {
  const s = structuredClone(state)
  if (action.type === 'selected' && s.threads.some((t) => t.id === action.value)) {
    s.selected = String(action.value)
    return s
  }
  if (action.type === 'quantum') {
    s.quantum = integer(action.value, 1, 5, s.quantum)
    s.used = 0
    return s
  }
  if (action.type === 'schedule') schedule(s)
  else if (action.type === 'execute') {
    const thread = s.threads.find((t) => t.id === s.running)
    if (!thread) return state
    const process = s.processes.find((p) => p.id === thread.process)!
    thread.pc++
    thread.stack[0] = (thread.stack[0] ?? 0) + 1
    process.memory++
    s.used++
    s.ticks++
    s.log = addLog(
      s.log,
      thread.id + ' 执行一步',
      '私有局部计数 → ' + thread.stack[0] + '；' + process.name + ' 的共享计数器 → ' + process.memory + '。',
      'success',
    )
    if (s.used >= s.quantum) {
      s.log = addLog(s.log, '时间片耗尽', '当前线程回到 Ready，轮转选择下一个就绪线程。')
      schedule(s)
    }
  } else if (action.type === 'block' || action.type === 'wait') {
    const thread = s.threads.find((t) => t.id === s.running)
    if (!thread) return state
    thread.state = action.type === 'block' ? 'Blocked' : 'Waiting'
    s.selected = thread.id
    s.blocks++
    s.running = null
    s.log = addLog(
      s.log,
      thread.id + ' → ' + thread.state,
      action.type === 'block'
        ? '等待 IO 完成，保存当前 PC / 栈，主动让出 CPU。'
        : '等待条件通知。其他 Ready 线程可以继续运行。',
      'warning',
    )
    schedule(s)
  } else if (action.type === 'io-complete' || action.type === 'notify') {
    const thread = s.threads.find((t) => t.id === s.selected)
    const expected = action.type === 'io-complete' ? 'Blocked' : 'Waiting'
    if (!thread || thread.state !== expected) return state
    thread.state = 'Ready'
    s.ready.push(thread.id)
    s.wakes++
    s.log = addLog(
      s.log,
      thread.id + ' → Ready',
      '事件完成只使线程有资格被调度，不会立刻抢占当前线程。其 PC 和栈仍然保留。',
      'success',
    )
  } else return state
  return s
}
export function presentProcess(s: ProcessState): ExperimentView {
  const selected = s.threads.find((t) => t.id === s.selected)!
  return {
    scene: {
      kind: 'process',
      processes: s.processes,
      threads: s.threads,
      running: s.running,
      quantum: s.quantum,
      used: s.used,
      switches: s.switches,
    },
    controls: [
      { id: 'quantum', kind: 'number', label: '时间片 / 步', value: s.quantum, min: 1, max: 5 },
      {
        id: 'selected',
        kind: 'select',
        label: '唤醒目标',
        value: s.selected,
        options: s.threads.map((t) => ({ value: t.id, label: t.id + ' · ' + t.state })),
      },
      {
        id: 'schedule',
        kind: 'button',
        label: s.running ? '切换到下一线程' : '调度 Ready 线程',
        primary: !s.running,
      },
      { id: 'execute', kind: 'button', label: '执行一步', disabled: !s.running, primary: !!s.running },
      { id: 'block', kind: 'button', label: '当前线程等待 IO', disabled: !s.running },
      { id: 'wait', kind: 'button', label: '当前线程等待条件', disabled: !s.running },
      { id: 'io-complete', kind: 'button', label: '完成目标 IO', disabled: selected.state !== 'Blocked' },
      { id: 'notify', kind: 'button', label: '通知目标线程', disabled: selected.state !== 'Waiting' },
    ],
    metrics: [
      { label: 'Running', value: s.running ?? 'IDLE' },
      { label: 'Ready Queue', value: s.ready.join(' → ') || '空' },
      { label: 'Context Switch', value: s.switches },
      { label: '执行步数', value: s.ticks },
    ],
    status: {
      title: s.log.at(-1)?.label ?? '一个 CPU，同一时刻只运行一个线程。',
      detail:
        s.log.at(-1)?.detail ??
        '同一进程的线程共享地址空间，但各自保存 PC 和栈。这里用轮转调度观察它们交替执行。',
      tone: s.log.at(-1)?.tone ?? 'neutral',
    },
    log: s.log,
    goal: {
      label: '让一个线程阻塞，再唤醒它，并观察至少一次线程切换。',
      reached: s.blocks > 0 && s.wakes > 0 && s.switches > 0,
    },
  }
}
export const processEngine: EngineFactory = () =>
  createSession(initialProcess, transitionProcess, presentProcess)
