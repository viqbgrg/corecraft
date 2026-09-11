import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type CollectorProfile = 'g1' | 'zgc'
export interface RegionObject {
  id: number
  address: string
  value: number
  refs: string[]
}
export interface CollectionRegion {
  id: number
  kind: 'young' | 'old' | 'reserve'
}
export interface RegionCandidate {
  region: number
  live: number
  garbage: number
  selected: boolean
}
export interface RelocationState {
  profile: CollectorProfile
  objects: RegionObject[]
  roots: Record<string, string>
  regions: CollectionRegion[]
  budget: number
  forwarding: Record<string, string>
  candidates: RegionCandidate[]
  moved: boolean
  barrier: boolean
  copied: number
  reclaimed: number
  rewritten: number
  barrierFixes: number
  lastRead: number | null
  g1Observed: boolean
  staleRejected: boolean
  healed: boolean
  error: string | null
  log: Observation[]
}
const regionOf = (address: string) => Number(address.split(':')[0])
export function initialRelocation(profile: CollectorProfile = 'g1'): RelocationState {
  const objects: RegionObject[] = [
    { id: 1, address: '0:0', value: 10, refs: ['1:0', '2:0'] },
    { id: 2, address: '0:1', value: 20, refs: [] },
    { id: 3, address: '1:0', value: 30, refs: ['2:1'] },
    { id: 4, address: '1:1', value: 40, refs: [] },
    { id: 5, address: '1:2', value: 50, refs: [] },
    { id: 6, address: '1:3', value: 60, refs: [] },
    { id: 7, address: '2:0', value: 70, refs: [] },
    { id: 8, address: '2:1', value: 80, refs: [] },
    { id: 9, address: '2:2', value: 90, refs: [] },
    { id: 10, address: '2:3', value: 100, refs: [] },
  ]
  return {
    profile,
    objects,
    roots: { main: '0:0', static: '0:1' },
    regions: [
      { id: 0, kind: 'young' },
      { id: 1, kind: 'old' },
      { id: 2, kind: 'old' },
      { id: 3, kind: 'reserve' },
      { id: 4, kind: 'reserve' },
    ],
    budget: 1,
    forwarding: {},
    candidates: [],
    moved: false,
    barrier: true,
    copied: 0,
    reclaimed: 0,
    rewritten: 0,
    barrierFixes: 0,
    lastRead: null,
    g1Observed: false,
    staleRejected: false,
    healed: false,
    error: null,
    log: [],
  }
}
export function resolveForwarding(address: string, forwarding: Record<string, string>): string {
  const seen = new Set<string>()
  let current = address
  while (forwarding[current]) {
    if (seen.has(current)) throw new Error('Forwarding cycle')
    seen.add(current)
    current = forwarding[current]!
  }
  return current
}
export function reachableRegionIds(s: RelocationState): number[] {
  const pending = Object.values(s.roots),
    seen = new Set<number>()
  while (pending.length) {
    const address = resolveForwarding(pending.pop()!, s.forwarding),
      object = s.objects.find((object) => object.address === address)
    if (!object) throw new Error(`Dangling address ${address}`)
    if (seen.has(object.id)) continue
    seen.add(object.id)
    pending.push(...object.refs)
  }
  return [...seen]
}
export function chooseRegions(s: RelocationState): RegionCandidate[] {
  const live = new Set(reachableRegionIds(s))
  const candidates = s.regions
    .filter((region) => region.kind === 'old')
    .map((region) => {
      const objects = s.objects.filter((object) => regionOf(object.address) === region.id)
      return {
        region: region.id,
        live: objects.filter((object) => live.has(object.id)).length,
        garbage: objects.filter((object) => !live.has(object.id)).length,
        selected: false,
      }
    })
    .sort((a, b) => b.garbage / Math.max(1, b.live) - a.garbage / Math.max(1, a.live) || a.region - b.region)
  let remaining = s.budget
  for (const candidate of candidates)
    if (candidate.garbage > 0 && candidate.live <= remaining) {
      candidate.selected = true
      remaining -= candidate.live
    }
  return candidates
}
export function relocateRegions(state: RelocationState): RelocationState {
  if (state.moved) return state
  const s = structuredClone(state),
    live = new Set(reachableRegionIds(s)),
    candidates = chooseRegions(s),
    selected = new Set(
      candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.region),
    )
  const moving = s.objects.filter((object) => selected.has(regionOf(object.address)) && live.has(object.id)),
    garbage = s.objects.filter((object) => selected.has(regionOf(object.address)) && !live.has(object.id))
  const destinations = s.regions
    .filter((region) => region.kind === 'reserve')
    .flatMap((region) => Array.from({ length: 4 }, (_, i) => `${region.id}:${i}`))
    .filter((address) => !s.objects.some((object) => object.address === address))
  if (moving.length > destinations.length)
    return { ...state, error: '保留区不足，取消搬迁，不修改任何对象或引用。' }
  moving.forEach((object, i) => {
    const previous = object.address
    object.address = destinations[i]!
    s.forwarding[previous] = object.address
  })
  s.objects = s.objects.filter((object) => !garbage.some((dead) => dead.id === object.id))
  s.copied = moving.length
  s.reclaimed = garbage.length
  s.candidates = candidates
  s.moved = true
  s.error = null
  if (s.profile === 'g1') {
    for (const key of Object.keys(s.roots)) {
      const mapped = resolveForwarding(s.roots[key]!, s.forwarding)
      if (mapped !== s.roots[key]) {
        s.roots[key] = mapped
        s.rewritten++
      }
    }
    for (const object of s.objects)
      object.refs = object.refs.map((address) => {
        const mapped = resolveForwarding(address, s.forwarding)
        if (mapped !== address) s.rewritten++
        return mapped
      })
    s.g1Observed ||= s.copied > 0 && s.rewritten > 0
  }
  s.log = addLog(
    s.log,
    s.profile === 'g1' ? 'G1 风格停顿搬迁' : 'ZGC 风格延迟修复',
    `选择老区 [${[...selected].join(', ') || '无'}]，复制 ${s.copied} 个存活对象，回收 ${s.reclaimed} 个垃圾对象。${s.profile === 'g1' ? '应用恢复前更新指向搬迁对象的引用。' : '保留旧引用与转发表，后续加载由屏障解析并修复。'}`,
    'success',
  )
  return s
}
export function relocationTransition(state: RelocationState, a: ExperimentAction): RelocationState {
  if (a.type === 'profile' && ['g1', 'zgc'].includes(String(a.value)))
    return {
      ...initialRelocation(a.value as CollectorProfile),
      budget: state.budget,
      g1Observed: state.g1Observed,
      staleRejected: state.staleRejected,
      healed: state.healed,
      log: addLog(
        state.log,
        '重开相同对象图',
        '两种机制使用同一初始对象图和容量，清空转发表；已经观察的学习证据保留。',
      ),
    }
  if (a.type === 'budget' && !state.moved) {
    const budget = boundedInteger(a.value, 1, 3)
    return budget === null ? state : { ...state, budget, candidates: [], error: null }
  }
  if (a.type === 'barrier' && ['on', 'off'].includes(String(a.value)))
    return { ...state, barrier: a.value === 'on', error: null }
  if (a.type === 'plan')
    return {
      ...state,
      candidates: chooseRegions(state),
      error: null,
      log: addLog(
        state.log,
        '已完成标记后的老区候选',
        '按垃圾 / 存活比例排序，在复制对象预算内选择回收区。这只是解释回收收益，不是 G1 的实际停顿预测器。',
      ),
    }
  if (a.type === 'relocate') return relocateRegions(state)
  if (a.type !== 'load') return state
  const s = structuredClone(state)
  s.error = null
  const rootAddress = resolveForwarding(s.roots.main!, s.forwarding),
    parent = s.objects.find((object) => object.address === rootAddress)!,
    old = parent.refs[0]!,
    current = resolveForwarding(old, s.forwarding)
  if (old !== current && !s.barrier)
    return {
      ...state,
      staleRejected: true,
      error: `旧引用 ${old} 指向已经搬走的地址；没有解析转发表就不能安全解引用。真实 ZGC 不允许应用关闭必需的屏障。`,
    }
  if (old !== current) {
    parent.refs[0] = current
    s.barrierFixes++
    s.healed ||= s.profile === 'zgc'
  }
  const object = s.objects.find((object) => object.address === current)!
  s.lastRead = object.value
  s.log = addLog(
    s.log,
    '加载 main 对象的第一个字段引用',
    `引用 ${old}${old === current ? '' : ` → 屏障转发到 ${current} 并修复字段`}，仍读取 O${object.id}.value=${object.value}。`,
    'success',
  )
  return s
}
export function presentRelocation(s: RelocationState): ExperimentView {
  const live = new Set(reachableRegionIds(s)),
    reached = s.g1Observed && s.staleRejected && s.healed
  return {
    scene: {
      kind: 'data',
      title: '搬迁改变地址，对象身份与引用语义必须保持',
      cards: [
        {
          id: 'profile',
          label: '当前机制侧面',
          value: s.profile === 'g1' ? 'G1 / 回收区与停顿内修复' : 'ZGC / 转发表与加载屏障',
          detail: '这两种侧面的组合不是任一收集器的完整实现',
        },
      ],
      tables: [
        {
          id: 'collector-regions',
          title: '区域 / 每区 4 个单元对象',
          columns: ['Region', '角色', '当前对象 / 地址', '可达对象'],
          rows: s.regions.map((region) => {
            const objects = s.objects.filter((object) => regionOf(object.address) === region.id)
            return {
              id: String(region.id),
              values: [
                `R${region.id}`,
                region.kind,
                objects.map((object) => `O${object.id}@${object.address}`).join(', ') || '空',
                objects
                  .filter((object) => live.has(object.id))
                  .map((object) => `O${object.id}`)
                  .join(', ') || '无',
              ],
            }
          }),
        },
        {
          id: 'collector-candidates',
          title: '已标记后的老区选择 / 复制预算',
          columns: ['老区', '存活', '垃圾', '选择'],
          rows: s.candidates.map((candidate) => ({
            id: String(candidate.region),
            values: [
              `R${candidate.region}`,
              candidate.live,
              candidate.garbage,
              candidate.selected ? '进入集合' : '暂不回收',
            ],
            tone: candidate.selected ? 'success' : 'neutral',
          })),
        },
        {
          id: 'collector-references',
          title: '对象字段中的地址 / 可保留尚未修复的旧地址',
          columns: ['对象', '当前地址', '字段引用', '值'],
          rows: s.objects
            .filter((object) => live.has(object.id))
            .map((object) => ({
              id: String(object.id),
              values: [
                `O${object.id}`,
                object.address,
                object.refs
                  .map((address) => `${address}${s.forwarding[address] ? ' / 旧地址' : ''}`)
                  .join(', ') || '无',
                object.value,
              ],
            })),
        },
        {
          id: 'collector-forwarding',
          title: '搬迁转发表',
          columns: ['原地址', '新地址'],
          rows: Object.entries(s.forwarding).map(([before, after]) => ({
            id: before,
            values: [before, after],
          })),
        },
      ],
      caption:
        'G1 部分：假设并发标记已经结束，只选择额外老区，省略必须收集的年轻区和真实记忆集扫描优化。ZGC 部分：只解释并发搬迁允许旧引用存在及加载屏障修复，未编码真实 colored pointer 位、标记屏障或分代 ZGC。每场景只搬迁一次，旧地址在转发有效期间不复用；逻辑工作量不是暂停时间或真实收集器基准。',
    },
    metrics: [
      { label: '复制的存活对象', value: s.copied },
      { label: '本轮回收垃圾', value: s.reclaimed },
      { label: '停顿内修复引用', value: s.rewritten },
      { label: '加载时修复引用', value: s.barrierFixes },
      { label: '最近读取字段值', value: s.lastRead ?? '未读取' },
    ],
    controls: [
      {
        id: 'profile',
        kind: 'select',
        label: '重开相同输入的收集机制',
        value: s.profile,
        options: [
          { value: 'g1', label: 'G1 风格 / 停顿内搬迁修复' },
          { value: 'zgc', label: 'ZGC 风格 / 加载屏障修复' },
        ],
      },
      {
        id: 'budget',
        kind: 'number',
        label: '本轮最多复制存活对象',
        value: s.budget,
        min: 1,
        max: 3,
        disabled: s.moved,
      },
      {
        id: 'barrier',
        kind: 'select',
        label: '加载引用时的教学验证',
        value: s.barrier ? 'on' : 'off',
        options: [
          { value: 'on', label: '通过加载屏障解析地址' },
          { value: 'off', label: '尝试跳过屏障 / 观察错误' },
        ],
      },
      { id: 'plan', kind: 'button', label: '检查各老区回收收益', primary: true, disabled: s.moved },
      { id: 'relocate', kind: 'button', label: '搬迁选中老区的存活对象', disabled: s.moved },
      { id: 'load', kind: 'button', label: '读取 main 指向对象的首个引用' },
    ],
    status: {
      title: s.error
        ? '旧地址不能直接使用'
        : reached
          ? '搬迁策略不同，读取语义相同'
          : '先标记存活，再选择区域与修复引用',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先观察 G1 风格搬迁的引用改写；切换相同输入的 ZGC 风格，搬迁后先尝试跳过屏障，再启用屏障读取。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '观察 G1 风格停顿修复，并在 ZGC 风格下拒绝旧地址直读，再通过加载屏障读取同一对象。',
      reached,
    },
    log: s.log,
  }
}
export const relocationEngine: EngineFactory = () =>
  createSession(() => initialRelocation(), relocationTransition, presentRelocation)
