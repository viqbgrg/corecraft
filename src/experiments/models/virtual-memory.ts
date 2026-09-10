import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, address, createSession, hex } from '../core/session'

export interface VmState {
  draft: string
  current: number
  vpn: number
  offset: number
  physical: number | null
  pages: (number | null)[]
  tlb: { vpn: number; frame: number }[]
  fifo: number[]
  phase: 'idle' | 'page-table' | 'page-fault' | 'done'
  accesses: number
  hits: number
  walks: number
  faults: number
  resolved: number
  evictions: number
  log: Observation[]
}
export function initialVm(): VmState {
  return {
    draft: '0x012C',
    current: 300,
    vpn: 1,
    offset: 44,
    physical: null,
    pages: [2, 0, null, 1, null, null, null, null],
    tlb: [],
    fifo: [1, 3, 0],
    phase: 'idle',
    accesses: 0,
    hits: 0,
    walks: 0,
    faults: 0,
    resolved: 0,
    evictions: 0,
    log: [],
  }
}
function fillTlb(s: VmState, frame: number) {
  s.tlb = [{ vpn: s.vpn, frame }, ...s.tlb.filter((t) => t.vpn !== s.vpn)].slice(0, 2)
}
export function transitionVm(state: VmState, action: ExperimentAction): VmState {
  const s = structuredClone(state)
  const pending = s.phase === 'page-table' || s.phase === 'page-fault'
  if (action.type === 'address' && !pending) {
    s.draft = String(action.value ?? '')
    return s
  }
  if (action.type === 'access' && !pending) {
    const value = address(s.draft, 2047)
    if (value === null) {
      s.log = addLog(
        s.log,
        '虚拟地址越界',
        '本进程有 8 个 256 B 的虚拟页，合法地址为 0x0000–0x07FF。',
        'danger',
      )
      return s
    }
    s.current = value
    s.vpn = Math.floor(value / 256)
    s.offset = value % 256
    s.physical = null
    s.accesses++
    const entry = s.tlb.find((t) => t.vpn === s.vpn)
    if (entry) {
      s.hits++
      fillTlb(s, entry.frame)
      s.physical = entry.frame * 256 + s.offset
      s.phase = 'done'
      s.log = addLog(
        s.log,
        'TLB Hit',
        'VPN ' +
          s.vpn +
          ' → PFN ' +
          entry.frame +
          '。物理地址 = ' +
          entry.frame +
          ' × 256 + ' +
          s.offset +
          ' = ' +
          hex(s.physical) +
          '。',
        'success',
      )
    } else {
      s.phase = 'page-table'
      s.log = addLog(
        s.log,
        'TLB Miss ≠ Page Fault',
        'TLB 没有这条映射，下一步查询页表。只有页表表明页不驻留时，才需要处理缺页。',
        'warning',
      )
    }
  } else if (action.type === 'walk' && s.phase === 'page-table') {
    s.walks++
    const frame = s.pages[s.vpn]!
    if (frame === null) {
      s.faults++
      s.phase = 'page-fault'
      s.log = addLog(
        s.log,
        'Page Fault · 缺页异常',
        'VPN ' + s.vpn + ' 合法，但 Present = 0。硬件交给操作系统载入页面；原访问尚未完成。',
        'warning',
      )
    } else {
      s.physical = frame * 256 + s.offset
      s.phase = 'done'
      fillTlb(s, frame)
      s.log = addLog(
        s.log,
        '页表命中，回填 TLB',
        'VPN ' +
          s.vpn +
          ' → PFN ' +
          frame +
          '，页内偏移 ' +
          s.offset +
          ' 保持不变，物理地址 ' +
          hex(s.physical) +
          '。',
        'success',
      )
    }
  } else if (action.type === 'resolve' && s.phase === 'page-fault') {
    let frame = [0, 1, 2, 3].find((f) => !s.pages.includes(f))
    if (frame === undefined) {
      const victim = s.fifo.shift()!
      frame = s.pages[victim]!
      s.pages[victim] = null
      s.tlb = s.tlb.filter((t) => t.vpn !== victim)
      s.evictions++
      s.log = addLog(
        s.log,
        'FIFO 页面置换',
        '物理帧已满，换出 VPN ' +
          victim +
          ' 并使其 TLB 映射失效，复用 PFN ' +
          frame +
          '。本模型只读，无脏页写回。',
        'warning',
      )
    }
    s.pages[s.vpn] = frame
    s.fifo.push(s.vpn)
    s.resolved++
    fillTlb(s, frame)
    s.physical = frame * 256 + s.offset
    s.phase = 'done'
    s.log = addLog(
      s.log,
      'OS 载入页面，重试访问',
      '更新页表、建立 TLB 映射，原指令重试成功。物理地址 ' +
        hex(s.physical) +
        '，页内偏移仍是 ' +
        s.offset +
        '。',
      'success',
    )
  } else if (action.type === 'flush' && !pending) {
    s.tlb = []
    s.log = addLog(s.log, '清空 TLB', '只清除快速映射缓存，页表与物理页面仍在。下一次 TLB Miss 不一定缺页。')
  } else return state
  return s
}
export function presentVm(s: VmState): ExperimentView {
  const pending = s.phase === 'page-table' || s.phase === 'page-fault'
  return {
    scene: {
      kind: 'virtual-memory',
      address: s.current,
      pageSize: 256,
      vpn: s.vpn,
      offset: s.offset,
      physical: s.physical,
      tlb: s.tlb,
      pages: s.pages.map((frame, vpn) => ({ vpn, frame, active: vpn === s.vpn })),
      stage: s.phase.toUpperCase(),
    },
    controls: [
      { id: 'address', kind: 'text', label: '虚拟地址 / 0x0000–0x07FF', value: s.draft, disabled: pending },
      { id: 'access', kind: 'button', label: '访问地址 · 查询 TLB', disabled: pending, primary: !pending },
      {
        id: 'walk',
        kind: 'button',
        label: '查询页表',
        disabled: s.phase !== 'page-table',
        primary: s.phase === 'page-table',
      },
      {
        id: 'resolve',
        kind: 'button',
        label: '处理缺页并重试',
        disabled: s.phase !== 'page-fault',
        primary: s.phase === 'page-fault',
      },
      { id: 'flush', kind: 'button', label: '清空 TLB', disabled: pending || !s.tlb.length },
    ],
    metrics: [
      { label: 'TLB Hits', value: s.hits },
      { label: 'Page Table Walks', value: s.walks },
      { label: 'Page Faults', value: s.faults },
      { label: 'Physical Address', value: s.physical === null ? '—' : hex(s.physical) },
    ],
    status: {
      title: s.log.at(-1)?.label ?? '程序看到的地址，不是数据的物理位置。',
      detail:
        s.log.at(-1)?.detail ??
        '先访问 0x012C，再查页表；重复访问观察 TLB Hit。之后访问 0x022A，制造一次缺页。',
      tone: s.log.at(-1)?.tone ?? 'neutral',
    },
    log: s.log,
    goal: {
      label: '观察一次 TLB Hit，再完成一次 Page Fault 的载入与重试。',
      reached: s.hits > 0 && s.resolved > 0,
    },
  }
}
export const vmEngine: EngineFactory = () => createSession(initialVm, transitionVm, presentVm)
