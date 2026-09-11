import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type Generation = 'young' | 'old'
export type GcScope = 'young' | 'old' | 'full'
export interface GcObject {
  id: number
  generation: Generation
  size: number
  offset: number
  age: number
  refs: number[]
}
export interface RememberedEdge {
  from: number
  to: number
}
export interface GcPlan {
  scope: GcScope
  candidates: number[]
  roots: number[]
  incoming: RememberedEdge[]
  frontier: number[]
  marked: number[]
  trace: { id: number; discovered: number[] }[]
}
export interface GcState {
  heap: GcObject[]
  roots: Record<'stack' | 'static' | 'jni', number | null>
  remembered: RememberedEdge[]
  nextId: number
  youngCapacity: number
  oldCapacity: number
  threshold: number
  scope: GcScope
  size: number
  source: number
  target: number
  rootSlot: 'stack' | 'static' | 'jni'
  gc: GcPlan | null
  lastPlan: GcPlan | null
  lastRemoved: number[]
  lastPromoted: number[]
  reclaimed: number
  promotions: number
  rememberedUsed: boolean
  oldReclaimedByFull: boolean
  error: string | null
  log: Observation[]
}
export function rememberedEdges(heap: GcObject[]): RememberedEdge[] {
  const young = new Set(heap.filter((object) => object.generation === 'young').map((object) => object.id))
  return heap
    .filter((object) => object.generation === 'old')
    .flatMap((object) => object.refs.filter((ref) => young.has(ref)).map((to) => ({ from: object.id, to })))
}
export function initialGc(): GcState {
  const heap: GcObject[] = [
    { id: 1, generation: 'old', size: 2, offset: 0, age: 2, refs: [2] },
    { id: 2, generation: 'young', size: 2, offset: 0, age: 0, refs: [3] },
    { id: 3, generation: 'young', size: 2, offset: 2, age: 0, refs: [2] },
    { id: 4, generation: 'young', size: 2, offset: 4, age: 0, refs: [5] },
    { id: 5, generation: 'young', size: 2, offset: 6, age: 0, refs: [4] },
    { id: 6, generation: 'old', size: 2, offset: 2, age: 2, refs: [] },
  ]
  return {
    heap,
    roots: { stack: 1, static: null, jni: null },
    remembered: rememberedEdges(heap),
    nextId: 7,
    youngCapacity: 12,
    oldCapacity: 24,
    threshold: 2,
    scope: 'young',
    size: 2,
    source: 1,
    target: 2,
    rootSlot: 'stack',
    gc: null,
    lastPlan: null,
    lastRemoved: [],
    lastPromoted: [],
    reclaimed: 0,
    promotions: 0,
    rememberedUsed: false,
    oldReclaimedByFull: false,
    error: null,
    log: [],
  }
}
export function planCollection(s: GcState, scope = s.scope): GcPlan {
  const candidates = s.heap
      .filter((object) => scope === 'full' || object.generation === scope)
      .map((object) => object.id),
    candidateSet = new Set(candidates)
  const roots = Object.values(s.roots).filter((id): id is number => id !== null && candidateSet.has(id))
  const incoming =
    scope === 'full'
      ? []
      : scope === 'young'
        ? s.remembered.map((edge) => ({ ...edge }))
        : s.heap
            .filter((object) => !candidateSet.has(object.id))
            .flatMap((object) =>
              object.refs.filter((ref) => candidateSet.has(ref)).map((to) => ({ from: object.id, to })),
            )
  return {
    scope,
    candidates,
    roots,
    incoming,
    frontier: [...new Set([...roots, ...incoming.map((edge) => edge.to)])].sort((a, b) => a - b),
    marked: [],
    trace: [],
  }
}
function markOne(s: GcState) {
  const plan = s.gc!,
    id = plan.frontier.shift()
  if (id === undefined || plan.marked.includes(id)) return
  plan.marked.push(id)
  const object = s.heap.find((object) => object.id === id)!,
    discovered = object.refs.filter(
      (ref) => plan.candidates.includes(ref) && !plan.marked.includes(ref) && !plan.frontier.includes(ref),
    )
  plan.frontier.push(...discovered)
  plan.trace.push({ id, discovered })
}
function finishCollection(s: GcState): GcState {
  const plan = s.gc!
  if (plan.frontier.length) return { ...s, error: '标记前沿尚未为空，不能回收可能仍可达的对象。' }
  const removed = s.heap.filter(
      (object) => plan.candidates.includes(object.id) && !plan.marked.includes(object.id),
    ),
    dead = new Set(removed.map((object) => object.id))
  const heap = s.heap
      .filter((object) => !dead.has(object.id))
      .map((object) => ({ ...object, refs: [...object.refs] })),
    promoted: number[] = []
  for (const object of heap)
    if (object.generation === 'young' && plan.marked.includes(object.id)) {
      object.age++
      if (object.age >= s.threshold) {
        object.generation = 'old'
        promoted.push(object.id)
      }
    }
  const oldUsed = heap
    .filter((object) => object.generation === 'old')
    .reduce((sum, object) => sum + object.size, 0)
  if (oldUsed > s.oldCapacity)
    return {
      ...s,
      gc: null,
      error: `晋升失败：需要老年代 ${oldUsed} 单位，容量只有 ${s.oldCapacity}。本轮原子取消，堆与年龄未改变；可执行 Full GC 或调整容量。`,
    }
  for (const generation of ['young', 'old'] as const) {
    if (plan.scope === 'old' && generation === 'young') continue
    if (plan.scope === 'young' && generation === 'old') {
      let offset = Math.max(
        0,
        ...heap
          .filter((object) => object.generation === 'old' && !promoted.includes(object.id))
          .map((object) => object.offset + object.size),
      )
      for (const object of heap.filter((object) => promoted.includes(object.id))) {
        object.offset = offset
        offset += object.size
      }
      if (offset > s.oldCapacity)
        return { ...s, gc: null, error: '晋升失败：老年代尾部连续空间不足，本轮取消；可先执行 Full GC。' }
    } else {
      let offset = 0
      for (const object of heap.filter((object) => object.generation === generation)) {
        object.offset = offset
        offset += object.size
      }
    }
  }
  return {
    ...s,
    heap,
    remembered: rememberedEdges(heap),
    lastPlan: structuredClone(plan),
    gc: null,
    lastRemoved: [...dead],
    lastPromoted: promoted,
    reclaimed: s.reclaimed + removed.length,
    promotions: s.promotions + promoted.length,
    rememberedUsed:
      s.rememberedUsed ||
      (plan.scope === 'young' && plan.incoming.some((edge) => plan.marked.includes(edge.to))),
    oldReclaimedByFull:
      s.oldReclaimedByFull ||
      (plan.scope === 'full' && removed.some((object) => object.generation === 'old')),
    log: addLog(
      s.log,
      `${plan.scope} GC 完成`,
      `回收 [${[...dead].join(', ') || '无'}]，晋升 [${promoted.join(', ') || '无'}]；幸存对象按代紧凑排列，引用身份不变。`,
      'success',
    ),
  }
}
export function gcTransition(state: GcState, a: ExperimentAction): GcState {
  if (state.gc && !['mark', 'mark-all', 'sweep', 'collect'].includes(a.type))
    return { ...state, error: '本轮是 Stop-The-World 标记，完成回收后再修改根或对象图。' }
  if (a.type === 'scope' && ['young', 'old', 'full'].includes(String(a.value)))
    return { ...state, scope: a.value as GcScope, error: null }
  if (a.type === 'rootSlot' && ['stack', 'static', 'jni'].includes(String(a.value)))
    return { ...state, rootSlot: a.value as GcState['rootSlot'], error: null }
  if (['size', 'source', 'target', 'threshold', 'oldCapacity'].includes(a.type)) {
    const value = boundedInteger(
      a.value,
      a.type === 'oldCapacity' ? 4 : 1,
      a.type === 'size' ? 4 : a.type === 'threshold' ? 3 : a.type === 'oldCapacity' ? 32 : 99,
    )
    if (value === null) return state
    if (
      a.type === 'oldCapacity' &&
      value <
        state.heap
          .filter((object) => object.generation === 'old')
          .reduce((sum, object) => sum + object.size, 0)
    )
      return { ...state, error: '新容量小于老年代当前占用。' }
    return { ...state, [a.type]: value, error: null }
  }
  if (
    ![
      'allocate',
      'link',
      'unlink',
      'set-root',
      'clear-root',
      'start-gc',
      'mark',
      'mark-all',
      'sweep',
      'collect',
    ].includes(a.type)
  )
    return state
  const s = structuredClone(state)
  s.error = null
  let detail = ''
  if (a.type === 'allocate') {
    const young = s.heap.filter((object) => object.generation === 'young').sort((a, b) => a.offset - b.offset)
    let offset = 0
    for (const object of young) {
      if (object.offset - offset >= s.size) break
      offset = object.offset + object.size
    }
    if (offset + s.size > s.youngCapacity)
      return { ...state, error: '年轻代没有足够连续空间；先进行回收，再重试分配。' }
    const id = s.nextId++
    s.heap.push({ id, generation: 'young', size: s.size, offset, age: 0, refs: [] })
    s.source = id
    detail = `分配 O${id}，年轻代偏移 ${offset}，大小 ${s.size}。尚未加入 GC Roots；从界面选择对象只属于观察操作，不是根。`
  } else if (['link', 'unlink', 'set-root'].includes(a.type)) {
    const target = s.heap.find((object) => object.id === s.target),
      source = s.heap.find((object) => object.id === s.source)
    if (!target || (a.type !== 'set-root' && !source))
      return { ...state, error: '源或目标对象已经不存在，不能制造悬空引用。' }
    if (a.type === 'set-root') {
      s.roots[s.rootSlot] = target.id
      detail = `${s.rootSlot} GC Root → O${target.id}。`
    } else {
      source!.refs =
        a.type === 'link'
          ? [...new Set([...source!.refs, target.id])]
          : source!.refs.filter((id) => id !== target.id)
      s.remembered = rememberedEdges(s.heap)
      detail = `${a.type === 'link' ? '写入' : '移除'} O${source!.id} → O${target.id}；写屏障维护 old → young 的记忆集合。`
    }
  } else if (a.type === 'clear-root') {
    s.roots[s.rootSlot] = null
    detail = `移除 ${s.rootSlot} 根，不立即回收对象。`
  } else {
    if (a.type === 'start-gc' || a.type === 'collect') s.gc ??= planCollection(s)
    if (!s.gc) return state
    if (a.type === 'mark' || a.type === 'mark-all' || a.type === 'collect') {
      const budget = a.type === 'mark' ? 1 : s.heap.length + 1
      for (let i = 0; i < budget && s.gc.frontier.length; i++) markOne(s)
    }
    if (a.type === 'sweep' || a.type === 'collect') return finishCollection(s)
    detail = `标记范围 ${s.gc.scope}；已标记 [${s.gc.marked.join(', ') || '无'}]，前沿 [${s.gc.frontier.join(', ') || '空'}]。外代到本代的引用按边界根处理。`
  }
  s.log = addLog(s.log, a.type, detail)
  return s
}
export function presentGc(s: GcState): ExperimentView {
  const plan = s.gc ?? s.lastPlan,
    reached = s.rememberedUsed && s.reclaimed >= 2 && s.promotions > 0 && s.oldReclaimedByFull,
    young = s.heap
      .filter((object) => object.generation === 'young')
      .reduce((sum, object) => sum + object.size, 0),
    old = s.heap.filter((object) => object.generation === 'old').reduce((sum, object) => sum + object.size, 0)
  return {
    scene: {
      kind: 'data',
      title: '从 GC Roots 和跨代引用出发，遍历真实对象图',
      tables: [
        {
          id: 'gc-roots',
          title: '显式强 GC Roots',
          columns: ['来源', '引用'],
          rows: Object.entries(s.roots).map(([name, id]) => ({
            id: name,
            values: [
              name === 'stack' ? '活跃栈槽' : name === 'static' ? '存活类的 static 引用' : 'JNI 强全局引用',
              id === null ? 'null' : `O${id}`,
            ],
          })),
        },
        {
          id: 'gc-objects',
          title: '堆对象、代、年龄与引用',
          columns: ['对象', '代', '年龄', '偏移 / 大小', '强引用'],
          rows: s.heap.map((object) => ({
            id: String(object.id),
            values: [
              `O${object.id}`,
              object.generation,
              object.age,
              `${object.offset} / ${object.size}`,
              object.refs.map((id) => `O${id}`).join(', ') || '无',
            ],
            tone: plan?.marked.includes(object.id) ? 'success' : 'neutral',
          })),
        },
        {
          id: 'gc-remembered',
          title: '写屏障维护的 old → young 记忆集合',
          columns: ['源对象', '目标对象'],
          rows: s.remembered.map((edge) => ({
            id: `${edge.from}-${edge.to}`,
            values: [`O${edge.from}`, `O${edge.to}`],
          })),
        },
        {
          id: 'gc-marking',
          title: '最近标记遍历 / 环只访问一次',
          columns: ['访问对象', '新发现的引用'],
          rows:
            plan?.trace.map((entry, i) => ({
              id: String(i),
              values: [`O${entry.id}`, entry.discovered.map((id) => `O${id}`).join(', ') || '无'],
            })) ?? [],
        },
      ],
      caption:
        '强引用、两个代、Stop-The-World 标记与紧凑整理，容量单位为教学槽。Young / Minor 只收年轻代；Old / Major 在本课特指保守的老年代单代回收，真实日志中 Major 含义依实现而异；Full 同时收两代。外代对象按保留处理，跨代边是边界根。无并发、弱引用、终结器、类卸载或真实 Survivor 区。',
    },
    metrics: [
      { label: 'Young 已用 / 容量', value: `${young} / ${s.youngCapacity}` },
      { label: 'Old 已用 / 容量', value: `${old} / ${s.oldCapacity}` },
      { label: '累计回收对象', value: s.reclaimed },
      { label: '累计晋升对象', value: s.promotions },
      { label: '标记前沿数量', value: s.gc?.frontier.length ?? 0 },
    ],
    controls: [
      {
        id: 'scope',
        kind: 'select',
        label: 'GC 回收范围',
        value: s.scope,
        disabled: !!s.gc,
        options: [
          { value: 'young', label: 'Young / Minor' },
          { value: 'old', label: 'Old / 本课的 Major' },
          { value: 'full', label: 'Full / 两代' },
        ],
      },
      {
        id: 'threshold',
        kind: 'number',
        label: '年轻对象晋升年龄',
        value: s.threshold,
        min: 1,
        max: 3,
        disabled: !!s.gc,
      },
      {
        id: 'oldCapacity',
        kind: 'number',
        label: '老年代容量 / 教学单位',
        value: s.oldCapacity,
        min: 4,
        max: 32,
        disabled: !!s.gc,
      },
      {
        id: 'size',
        kind: 'number',
        label: '新对象大小 / 教学单位',
        value: s.size,
        min: 1,
        max: 4,
        disabled: !!s.gc,
      },
      {
        id: 'source',
        kind: 'number',
        label: '引用源对象 ID',
        value: s.source,
        min: 1,
        max: 99,
        disabled: !!s.gc,
      },
      {
        id: 'target',
        kind: 'number',
        label: '引用目标对象 ID',
        value: s.target,
        min: 1,
        max: 99,
        disabled: !!s.gc,
      },
      {
        id: 'rootSlot',
        kind: 'select',
        label: '操作的 GC Root',
        value: s.rootSlot,
        disabled: !!s.gc,
        options: ['stack', 'static', 'jni'].map((name) => ({ value: name, label: name })),
      },
      { id: 'allocate', kind: 'button', label: '分配年轻对象', disabled: !!s.gc },
      { id: 'link', kind: 'button', label: '写入源 → 目标引用', disabled: !!s.gc },
      { id: 'unlink', kind: 'button', label: '移除源 → 目标引用', disabled: !!s.gc },
      { id: 'set-root', kind: 'button', label: '把目标对象设为 Root', disabled: !!s.gc },
      { id: 'clear-root', kind: 'button', label: '清空当前 Root', disabled: !!s.gc },
      { id: 'start-gc', kind: 'button', label: '暂停应用并开始标记', primary: true, disabled: !!s.gc },
      { id: 'mark', kind: 'button', label: '标记一个前沿对象', disabled: !s.gc?.frontier.length },
      { id: 'mark-all', kind: 'button', label: '完成剩余可达性标记', disabled: !s.gc?.frontier.length },
      {
        id: 'sweep',
        kind: 'button',
        label: '回收未标记对象并整理',
        disabled: !s.gc || s.gc.frontier.length > 0,
      },
      { id: 'collect', kind: 'button', label: '运行当前范围的完整 GC' },
    ],
    status: {
      title: s.error
        ? '回收或分配不能完成'
        : reached
          ? '根、跨代边与回收范围共同决定存活'
          : '互相引用不等于从根可达',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '初始 O2 / O3 经 old O1 保持可达，O4 / O5 只有彼此引用；运行两次 Young，再运行 Full。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '通过记忆集合保住年轻对象，回收不可达环，观察幸存者晋升，再用 Full 回收无根老对象。',
      reached,
    },
    log: s.log,
  }
}
export const gcEngine: EngineFactory = () => createSession(initialGc, gcTransition, presentGc)
