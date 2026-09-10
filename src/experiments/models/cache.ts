import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, address, createSession, hex } from '../core/session'

type Source = 'L1' | 'L2' | 'RAM'
interface Comparison {
  rate: number
  cycles: number
  ram: number
}
export interface CacheState {
  draft: string
  current: number | null
  l1: (number | null)[]
  l2: (number | null)[]
  l1Hits: number
  l2Hits: number
  ram: number
  cycles: number
  source: Source | null
  recent: { address: number; source: Source; cycles: number }[]
  comparisons: Partial<Record<'sequential' | 'shuffled', Comparison>>
  log: Observation[]
  error: string
}
export function initialCache(): CacheState {
  return {
    draft: '0x1000',
    current: null,
    l1: Array<number | null>(4).fill(null),
    l2: Array<number | null>(8).fill(null),
    l1Hits: 0,
    l2Hits: 0,
    ram: 0,
    cycles: 0,
    source: null,
    recent: [],
    comparisons: {},
    log: [],
    error: '',
  }
}
export function accessCache(state: CacheState, value: number): CacheState {
  const s = structuredClone(state)
  const block = Math.floor(value / 16)
  const l1Index = block % 4
  const l2Index = block % 8
  s.error = ''
  let cycles = 1
  let source: Source = 'L1'
  let detail = ''
  if (s.l1[l1Index] === block) {
    s.l1Hits++
    detail = 'L1 Hit：同一条 16 B Cache Line 已在 L1。'
  } else if (s.l2[l2Index] === block) {
    cycles += 8
    source = 'L2'
    s.l2Hits++
    s.l1[l1Index] = block
    detail = 'L1 Miss → L2 Hit；从 L2 回填 L1，无需访问 RAM。'
  } else {
    cycles += 8 + 80
    source = 'RAM'
    s.ram++
    const evicted = s.l2[l2Index]
    if (evicted !== null && evicted !== undefined) {
      const childIndex = evicted % 4
      if (s.l1[childIndex] === evicted) s.l1[childIndex] = null
    }
    s.l2[l2Index] = block
    s.l1[l1Index] = block
    detail = 'L1 Miss → L2 Miss → RAM；整行 ' + hex(block * 16) + '–' + hex(block * 16 + 15) + ' 一起载入。'
  }
  s.current = value
  s.draft = hex(value)
  s.source = source
  s.cycles += cycles
  s.recent = [...s.recent, { address: value, source, cycles }].slice(-8)
  s.log = addLog(
    s.log,
    hex(value) + ' · ' + source,
    detail + ' 模拟成本 ' + cycles + ' 周期。',
    source === 'RAM' ? 'warning' : 'success',
  )
  return s
}
export function cacheSequence(shuffled = false): number[] {
  const values = Array.from({ length: 32 }, (_, i) => 0x1000 + i * 4)
  if (shuffled) {
    // Fixed Fisher–Yates shuffle: reproducible, same addresses and access count.
    let seed = 42
    for (let i = values.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const j = seed % (i + 1)
      const a = values[i]!
      values[i] = values[j]!
      values[j] = a
    }
  }
  return values
}
export function transitionCache(state: CacheState, action: ExperimentAction): CacheState {
  if (action.type === 'address') return { ...state, draft: String(action.value ?? ''), error: '' }
  if (action.type === 'access' || action.type === 'quick-address') {
    const value = address(action.type === 'quick-address' ? action.value : state.draft)
    if (value === null) return { ...state, error: '地址必须是 0–65535 的整数，支持 0x1000 形式。' }
    return accessCache(state, value)
  }
  if (action.type === 'sequential' || action.type === 'shuffled') {
    let s = initialCache()
    s.comparisons = structuredClone(state.comparisons)
    s.log = addLog(
      state.log,
      '冷缓存对照 · ' + (action.type === 'sequential' ? '顺序' : '打乱'),
      '清空两级缓存与本组计数；访问完全相同的 32 个地址，仅改变顺序。',
    )
    for (const value of cacheSequence(action.type === 'shuffled')) s = accessCache(s, value)
    s.comparisons[action.type] = { rate: (s.l1Hits / 32) * 100, cycles: s.cycles, ram: s.ram }
    return s
  }
  return state
}
export function presentCache(s: CacheState): ExperimentView {
  const count = s.l1Hits + s.l2Hits + s.ram
  const rate = count ? ((s.l1Hits / count) * 100).toFixed(1) : '0.0'
  const block = s.current === null ? null : Math.floor(s.current / 16)
  return {
    scene: {
      kind: 'cache',
      address: s.current,
      lineSize: 16,
      path: s.source,
      levels: [
        {
          name: 'L1 Cache',
          latency: 1,
          lines: s.l1.map((blockId, index) => ({
            index,
            block: blockId,
            active: blockId !== null && blockId === block,
          })),
        },
        {
          name: 'L2 Cache',
          latency: 8,
          lines: s.l2.map((blockId, index) => ({
            index,
            block: blockId,
            active: blockId !== null && blockId === block,
          })),
        },
      ],
      recent: s.recent,
    },
    controls: [
      { id: 'address', kind: 'text', label: '内存地址', value: s.draft },
      {
        id: 'quick-address',
        kind: 'select',
        label: '快速访问',
        value: '',
        options: [
          { value: '', label: '选择一个地址' },
          ...[0x1000, 0x1004, 0x1008, 0x100c, 0x1040, 0x2000].map((v) => ({ value: hex(v), label: hex(v) })),
        ],
      },
      { id: 'access', kind: 'button', label: '访问地址', primary: true },
      { id: 'sequential', kind: 'button', label: '顺序访问 32 次' },
      { id: 'shuffled', kind: 'button', label: '打乱访问 32 次' },
    ],
    metrics: [
      { label: 'L1 Hit Rate', value: rate, unit: '%' },
      { label: 'L2 Hits', value: s.l2Hits },
      { label: 'Memory Access', value: s.ram, unit: '次' },
      { label: '本组模拟成本', value: s.cycles, unit: '周期' },
      ...(s.comparisons.sequential
        ? [
            {
              label: '顺序组 · L1 命中',
              value:
                s.comparisons.sequential.rate.toFixed(1) + '% / ' + s.comparisons.sequential.cycles + ' 周期',
            },
          ]
        : []),
      ...(s.comparisons.shuffled
        ? [
            {
              label: '打乱组 · L1 命中',
              value:
                s.comparisons.shuffled.rate.toFixed(1) + '% / ' + s.comparisons.shuffled.cycles + ' 周期',
            },
          ]
        : []),
    ],
    status: {
      title: s.error
        ? '地址无效'
        : s.source
          ? s.source === 'RAM'
            ? 'Cache Miss：取回的不只是一个数。'
            : s.source + ' Hit：数据就在附近。'
          : '先访问 0x1000，再试试 0x1004。',
      detail:
        s.error ||
        s.log.at(-1)?.detail ||
        '本模型为直接映射、包含式两级只读缓存。延迟为教学参数；一个 Cache Line 包含相邻 16 字节。',
      tone: s.error ? 'danger' : s.source === 'RAM' ? 'warning' : 'neutral',
    },
    log: s.log,
    goal: {
      label: '运行顺序与打乱两组，比较相同地址集合的命中率和成本。',
      reached: !!s.comparisons.sequential && !!s.comparisons.shuffled,
    },
  }
}
export const cacheEngine: EngineFactory = (config) => {
  if (config.lineSize !== undefined && config.lineSize !== 16)
    throw new Error('The cache lab currently supports lineSize: 16 only')
  return createSession(initialCache, transitionCache, presentCache)
}
