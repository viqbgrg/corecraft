import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type TransferMode = 'polling' | 'interrupt' | 'dma'
export interface TransferTick {
  tick: number
  cpu: string
  bus: string
  pc: number
  buffered: number
}
export interface TransferState {
  mode: TransferMode
  bytes: number
  interval: number
  work: number
  tick: number
  produced: number
  fifo: number[]
  memory: number[]
  pc: number
  savedPc: number | null
  handler: 'copy' | 'return' | null
  configured: boolean
  completionPending: boolean
  completionHandled: boolean
  polls: number
  copies: number
  setup: number
  overhead: number
  interrupts: number
  idle: number
  history: TransferTick[]
  comparison: {
    mode: TransferMode
    ticks: number
    polls: number
    copies: number
    setup: number
    overhead: number
    interrupts: number
    transfers: number
    work: number
  }[]
  log: Observation[]
}
const labels: Record<TransferMode, string> = {
  polling: '忙轮询 + CPU 搬运',
  interrupt: '中断 + CPU 搬运',
  dma: 'DMA + 完成中断',
}
export function initialTransfer(
  mode: TransferMode = 'polling',
  bytes = 6,
  interval = 3,
  work = 12,
): TransferState {
  if (
    !Object.hasOwn(labels, mode) ||
    boundedInteger(bytes, 1, 8) === null ||
    boundedInteger(interval, 1, 8) === null ||
    boundedInteger(work, 1, 24) === null
  )
    throw new Error('Transfer requires a supported mode, 1–8 bytes, interval 1–8 and work 1–24')
  return {
    mode,
    bytes,
    interval,
    work,
    tick: 0,
    produced: 0,
    fifo: [],
    memory: [],
    pc: 0,
    savedPc: null,
    handler: null,
    configured: false,
    completionPending: false,
    completionHandled: false,
    polls: 0,
    copies: 0,
    setup: 0,
    overhead: 0,
    interrupts: 0,
    idle: 0,
    history: [],
    comparison: [],
    log: [],
  }
}
export function transferFinished(s: TransferState): boolean {
  return (
    s.memory.length === s.bytes && s.pc === s.work && !s.handler && (s.mode !== 'dma' || s.completionHandled)
  )
}
export function transferStep(state: TransferState): TransferState {
  if (transferFinished(state)) return state
  const s = { ...state, tick: state.tick + 1, fifo: [...state.fifo], memory: [...state.memory] }
  let cpu = '',
    bus = '空闲'
  if (s.produced < s.bytes && s.tick % s.interval === 0) {
    s.produced++
    s.fifo.push(s.produced * 11)
  }
  const transfer = (owner: string) => {
    const value = s.fifo.shift()!
    s.memory.push(value)
    bus = `${owner}：${value} → M[${s.memory.length - 1}]`
  }
  const work = () => {
    if (s.pc < s.work) {
      cpu = `后台指令 PC=${s.pc}`
      s.pc++
    } else {
      cpu = '等待设备完成'
      s.idle++
    }
  }
  const enter = () => {
    s.savedPc = s.pc
    s.interrupts++
    s.overhead++
    cpu = `中断入口：保存 PC=${s.pc}`
  }
  const restore = () => {
    s.pc = s.savedPc!
    s.savedPc = null
    s.handler = null
    s.overhead++
    cpu = `中断返回：恢复 PC=${s.pc}`
  }
  if (s.mode === 'polling') {
    if (s.memory.length < s.bytes) {
      if (s.fifo.length) {
        transfer('CPU')
        s.copies++
        cpu = 'CPU 读取设备并写入内存'
      } else {
        s.polls++
        cpu = '轮询：设备尚未就绪'
      }
    } else work()
  } else if (s.mode === 'interrupt') {
    if (s.handler === 'return') restore()
    else if (s.handler === 'copy') {
      if (s.fifo.length) {
        transfer('CPU')
        s.copies++
        cpu = '中断处理程序逐字节搬运'
      }
      if (!s.fifo.length) s.handler = 'return'
    } else if (s.fifo.length) {
      enter()
      s.handler = 'copy'
    } else work()
  } else {
    if (s.configured && s.fifo.length) {
      transfer('DMA')
      if (s.memory.length === s.bytes) s.completionPending = true
    }
    if (!s.configured) {
      s.configured = true
      s.setup++
      cpu = 'CPU 配置 DMA 描述符'
    } else if (s.handler === 'return') {
      restore()
      s.completionHandled = true
    } else if (s.completionPending) {
      enter()
      s.handler = 'return'
      s.completionPending = false
    } else work()
  }
  s.history = [...s.history, { tick: s.tick, cpu, bus, pc: s.pc, buffered: s.fifo.length }]
  s.log = addLog(
    s.log,
    `时隙 ${s.tick}`,
    `CPU：${cpu}；总线：${bus}。`,
    transferFinished(s) ? 'success' : 'neutral',
  )
  return s
}
export function finishTransfer(s: TransferState): TransferState {
  for (let i = 0; i < 500 && !transferFinished(s); i++) s = transferStep(s)
  return s
}
export function transferTransition(s: TransferState, a: ExperimentAction): TransferState {
  if (a.type === 'mode' && Object.hasOwn(labels, String(a.value)))
    return initialTransfer(a.value as TransferMode, s.bytes, s.interval, s.work)
  if (['bytes', 'interval', 'work'].includes(a.type)) {
    const value = boundedInteger(a.value, 1, a.type === 'work' ? 24 : 8)
    return value === null
      ? s
      : initialTransfer(
          s.mode,
          a.type === 'bytes' ? value : s.bytes,
          a.type === 'interval' ? value : s.interval,
          a.type === 'work' ? value : s.work,
        )
  }
  if (a.type === 'step') return transferStep(s)
  if (a.type === 'run') return finishTransfer(s)
  if (a.type === 'compare')
    return {
      ...s,
      comparison: (Object.keys(labels) as TransferMode[]).map((mode) => {
        const result = finishTransfer(initialTransfer(mode, s.bytes, s.interval, s.work))
        return {
          mode,
          ticks: result.tick,
          polls: result.polls,
          copies: result.copies,
          setup: result.setup,
          overhead: result.overhead,
          interrupts: result.interrupts,
          transfers: result.memory.length,
          work: result.pc,
        }
      }),
      log: addLog(
        s.log,
        '相同设备与后台任务',
        '三种策略独立从空内存运行，设备到达时间与后台指令数完全相同。比较 CPU 开销与传输数量。',
        'success',
      ),
    }
  return s
}
export function presentTransfer(s: TransferState): ExperimentView {
  const done = transferFinished(s)
  return {
    scene: {
      kind: 'data',
      title: '设备、CPU 与总线分别在做什么',
      cards: [
        {
          id: 'device',
          label: '设备 FIFO',
          value: s.fifo.join(' ') || '空',
          detail: `已产生 ${s.produced}/${s.bytes} 字节`,
        },
        { id: 'memory', label: '内存接收区', value: s.memory.join(' ') || '空' },
        {
          id: 'context',
          label: '后台 PC / 保存的 PC',
          value: `${s.pc} / ${s.savedPc ?? '无'}`,
          detail: s.handler ? '正在处理中断' : '普通执行上下文',
        },
      ],
      tables: [
        {
          id: 'transfer-history',
          title: 'CPU 与总线时间线',
          columns: ['时隙', 'CPU 活动', '总线传输', '后台 PC', 'FIFO 长度'],
          rows: s.history.map((row) => ({
            id: String(row.tick),
            values: [row.tick, row.cpu, row.bus, row.pc, row.buffered],
          })),
        },
        {
          id: 'transfer-comparison',
          title: '相同工作量的完整运行',
          columns: [
            '方式',
            '总时隙',
            '轮询',
            'CPU 搬运',
            '设置 + 中断开销',
            '中断数',
            '总线字节',
            '后台指令',
          ],
          rows: s.comparison.map((row) => ({
            id: row.mode,
            values: [
              labels[row.mode],
              row.ticks,
              row.polls,
              row.copies,
              row.setup + row.overhead,
              row.interrupts,
              row.transfers,
              row.work,
            ],
          })),
        },
      ],
      caption:
        '一个时隙允许一个逻辑字节传输；PIO 的设备读取与内存写回合并计数。后台任务仅用寄存器，故可与 DMA 总线传输并行；这里没有模拟 CPU 的内存带宽竞争。',
    },
    metrics: [
      { label: '时间时隙', value: s.tick },
      { label: 'CPU 搬运字节', value: s.copies },
      { label: '忙轮询时隙', value: s.polls },
      { label: '后台任务完成', value: `${s.pc} / ${s.work}` },
      { label: '中断次数', value: s.interrupts },
      { label: '总线传输字节', value: s.memory.length },
    ],
    controls: [
      {
        id: 'mode',
        kind: 'select',
        label: '设备传输方式',
        value: s.mode,
        options: (Object.keys(labels) as TransferMode[]).map((mode) => ({
          value: mode,
          label: labels[mode],
        })),
      },
      { id: 'bytes', kind: 'number', label: '设备数据字节数', value: s.bytes, min: 1, max: 8 },
      { id: 'interval', kind: 'number', label: '每个字节的到达间隔', value: s.interval, min: 1, max: 8 },
      { id: 'work', kind: 'number', label: '后台指令数量', value: s.work, min: 1, max: 24 },
      { id: 'step', kind: 'button', label: '推进一个设备时隙', primary: true, disabled: done },
      { id: 'run', kind: 'button', label: '运行到数据与任务完成', disabled: done },
      { id: 'compare', kind: 'button', label: '对比轮询、中断与 DMA' },
    ],
    status: {
      title: done
        ? '数据完整，后台任务完成'
        : s.handler
          ? '进入处理程序后仍需恢复上下文'
          : '传输带宽与 CPU 占用是两个指标',
      detail:
        s.log.at(-1)?.detail ?? '观察 CPU 搬运与 DMA 搬运的区别；DMA 仍然使用总线，结束后仍需通知 CPU。',
      tone: done ? 'success' : 'neutral',
    },
    goal: {
      label: '完成一次传输与后台任务，并对比三种方式的 CPU 开销和总线字节数。',
      reached: done && s.comparison.length === 3,
    },
    log: s.log,
  }
}
export const transferEngine: EngineFactory = (config) =>
  createSession(
    () =>
      initialTransfer(
        (config.mode ?? 'polling') as TransferMode,
        Number(config.bytes ?? 6),
        Number(config.interval ?? 3),
        Number(config.work ?? 12),
      ),
    transferTransition,
    presentTransfer,
  )
