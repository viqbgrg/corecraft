import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { javaBucket } from './java-collections'

export type MapThread = 'T1' | 'T2' | 'T3'
export interface ConcurrentEntry {
  key: string
  value: number
}
export interface ConcurrentBucket {
  entries: ConcurrentEntry[]
  forwarding: number | null
}
export interface ConcurrentTable {
  id: number
  capacity: number
  buckets: ConcurrentBucket[]
}
export interface MapOperation {
  thread: MapThread
  key: string
  kind: 'naive' | 'compute'
  stage: 'read' | 'wait-read' | 'wait-write'
  expected: number | null
  held: string | null
}
export interface ConcurrentMapState {
  tables: ConcurrentTable[]
  root: number
  resize: { old: number; next: number; cursor: number } | null
  keys: string[]
  locks: Record<string, MapThread>
  pending: Partial<Record<MapThread, MapOperation>>
  selected: MapThread
  key: string
  operation: 'naive' | 'compute'
  lastGet: number | null
  lastPath: string[]
  updates: number
  computeUpdates: number
  lost: boolean
  computeWaited: boolean
  forwardedRead: boolean
  resized: number
  error: string | null
  log: Observation[]
}
const makeTable = (id: number, capacity: number): ConcurrentTable => ({
  id,
  capacity,
  buckets: Array.from({ length: capacity }, () => ({ entries: [], forwarding: null })),
})
export function initialConcurrentMap(): ConcurrentMapState {
  const table = makeTable(0, 4)
  for (const key of ['A', 'B']) table.buckets[javaBucket(key, 4)]!.entries.push({ key, value: 0 })
  return {
    tables: [table],
    root: 0,
    resize: null,
    keys: ['A', 'B'],
    locks: {},
    pending: {},
    selected: 'T1',
    key: 'A',
    operation: 'naive',
    lastGet: null,
    lastPath: [],
    updates: 0,
    computeUpdates: 0,
    lost: false,
    computeWaited: false,
    forwardedRead: false,
    resized: 0,
    error: null,
    log: [],
  }
}
export function locateConcurrentBucket(
  s: ConcurrentMapState,
  key: string,
): { table: ConcurrentTable; index: number; bucket: ConcurrentBucket; address: string; path: string[] } {
  let table = s.tables.find((table) => table.id === s.root)!
  const seen = new Set<number>(),
    path: string[] = []
  while (true) {
    if (seen.has(table.id)) throw new Error('Forwarding table cycle')
    seen.add(table.id)
    const index = javaBucket(key, table.capacity),
      bucket = table.buckets[index]!,
      address = `${table.id}:${index}`
    path.push(`T${table.id}/B${index}`)
    if (bucket.forwarding === null) return { table, index, bucket, address, path }
    table = s.tables.find((table) => table.id === bucket.forwarding)!
  }
}
export function concurrentMapEntries(s: ConcurrentMapState): ConcurrentEntry[] {
  return s.keys
    .map((key) => ({ ...locateConcurrentBucket(s, key).bucket.entries.find((entry) => entry.key === key)! }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}
function acquireComputation(s: ConcurrentMapState, job: MapOperation): boolean {
  const location = locateConcurrentBucket(s, job.key),
    owner = s.locks[location.address]
  if (owner && owner !== job.thread) {
    job.stage = 'wait-read'
    s.computeWaited = true
    return false
  }
  s.locks[location.address] = job.thread
  job.held = location.address
  job.expected = location.bucket.entries.find((entry) => entry.key === job.key)?.value ?? 0
  job.stage = 'read'
  return true
}
export function concurrentMapTransition(state: ConcurrentMapState, a: ExperimentAction): ConcurrentMapState {
  if (a.type === 'selected' && ['T1', 'T2', 'T3'].includes(String(a.value)))
    return { ...state, selected: a.value as MapThread, error: null }
  if (a.type === 'key') return { ...state, key: String(a.value ?? ''), error: null }
  if (a.type === 'operation' && ['naive', 'compute'].includes(String(a.value)))
    return { ...state, operation: a.value as ConcurrentMapState['operation'], error: null }
  if (!['begin', 'advance', 'get', 'start-resize', 'transfer'].includes(a.type)) return state
  if (['begin', 'get'].includes(a.type) && !/^[A-Za-z][A-Za-z0-9]{0,7}$/.test(state.key))
    return { ...state, error: '教学键为 1–8 个字母或数字，首字符需为字母。' }
  const s = structuredClone(state)
  s.error = null
  let detail = ''
  if (a.type === 'get') {
    const location = locateConcurrentBucket(s, s.key)
    s.lastGet = location.bucket.entries.find((entry) => entry.key === s.key)?.value ?? null
    s.lastPath = location.path
    s.forwardedRead ||= location.path.length > 1
    detail = `get(${s.key}) 经 ${location.path.join(' → ')} 返回 ${s.lastGet ?? 'null'}；读取不获取本模型的桶写锁，尚未提交的 compute 候选不可见。`
  } else if (a.type === 'begin') {
    if (s.pending[s.selected])
      return { ...state, error: '当前线程已有未完成操作，请推进原操作；输入框修改不会替换已保存的键。' }
    const job: MapOperation = {
      thread: s.selected,
      key: s.key,
      kind: s.operation,
      stage: 'read',
      expected: null,
      held: null,
    }
    s.pending[s.selected] = job
    if (job.kind === 'naive') {
      const location = locateConcurrentBucket(s, job.key)
      job.expected = location.bucket.entries.find((entry) => entry.key === job.key)?.value ?? 0
      detail = `${job.thread} get(${job.key})=${job.expected}，只保留局部值；稍后单独 put(value+1)。每个调用线程安全，不代表调用组合原子。`
    } else if (acquireComputation(s, job))
      detail = `${job.thread} 获取桶 ${job.held} 并读取 ${job.key}=${job.expected}；compute 回调期间同桶写入需要等待。`
    else detail = `${job.thread} 等待 ${job.key} 所在桶的写锁，尚未读取或运行 compute 回调。`
  } else if (a.type === 'advance') {
    const job = s.pending[s.selected]
    if (!job) return { ...state, error: '先开始当前线程的更新操作。' }
    if (job.kind === 'compute' && job.stage === 'wait-read') {
      detail = acquireComputation(s, job)
        ? `${job.thread} 重试获得桶 ${job.held}，现在读取最新值 ${job.expected}；下一步提交回调结果。`
        : `${job.thread} 仍等待原键 ${job.key} 的桶，未重复执行回调。`
    } else {
      const location = locateConcurrentBucket(s, job.key),
        owner = s.locks[location.address]
      if (owner && owner !== job.thread) {
        job.stage = 'wait-write'
        detail = `${job.thread} 的单次 put 等待桶锁；之前 get 的局部值 ${job.expected} 不会因此自动刷新。`
      } else {
        const existing = location.bucket.entries.find((entry) => entry.key === job.key),
          current = existing?.value ?? 0
        if (!existing && s.keys.length >= 12) {
          if (job.held) delete s.locks[job.held]
          delete s.pending[job.thread]
          s.error = '教学 Map 最多 12 个键，本次写入取消并释放桶。'
          detail = s.error
        } else {
          const value = job.expected! + 1
          if (existing) existing.value = value
          else {
            location.bucket.entries.push({ key: job.key, value })
            s.keys.push(job.key)
          }
          s.updates++
          s.computeUpdates += Number(job.kind === 'compute')
          s.lost ||= job.kind === 'naive' && current !== job.expected
          if (job.held) delete s.locks[job.held]
          delete s.pending[job.thread]
          detail = `${job.thread} ${job.kind === 'compute' ? '原子 compute' : '单独 put'}：${job.key} ${current} → ${value}。${job.kind === 'naive' && current !== job.expected ? '已覆盖其他更新，问题在 get + put 的复合操作。' : '本次更新提交，桶锁释放。'}`
        }
      }
    }
  } else if (a.type === 'start-resize') {
    if (s.resize) return state
    const old = s.tables.find((table) => table.id === s.root)!
    if (old.capacity >= 16) return { ...state, error: '教学表最大容量为 16。' }
    const next = makeTable(s.tables.length, old.capacity * 2)
    s.tables.push(next)
    s.resize = { old: old.id, next: next.id, cursor: 0 }
    detail = `创建容量 ${next.capacity} 的 T${next.id}；旧表仍是入口，逐桶迁移后才发布新根。`
  } else {
    if (!s.resize) return state
    const resize = s.resize,
      old = s.tables.find((table) => table.id === resize.old)!,
      next = s.tables.find((table) => table.id === resize.next)!,
      address = `${old.id}:${resize.cursor}`
    if (s.locks[address])
      return {
        ...state,
        error: `桶 ${address} 正被 ${s.locks[address]} 的 compute 持有，本次迁移等待；其他桶仍可读写。`,
      }
    const bucket = old.buckets[resize.cursor]!,
      count = bucket.entries.length
    for (const entry of bucket.entries)
      next.buckets[javaBucket(entry.key, next.capacity)]!.entries.push({ ...entry })
    bucket.entries = []
    bucket.forwarding = next.id
    detail = `迁移 T${old.id}/B${resize.cursor} 的 ${count} 项，放置指向 T${next.id} 的 forwarding 标记。`
    resize.cursor++
    if (resize.cursor === old.capacity) {
      s.root = next.id
      s.resize = null
      s.resized++
      detail += ' 全部旧桶完成，新表成为入口。'
    }
  }
  s.log = addLog(s.log, a.type, detail, s.error ? 'warning' : 'neutral')
  return s
}
export function presentConcurrentMap(s: ConcurrentMapState): ExperimentView {
  const reached = s.lost && s.computeWaited && s.computeUpdates >= 2 && s.forwardedRead && s.resized > 0
  return {
    scene: {
      kind: 'data',
      title: 'ConcurrentHashMap 的调用原子性不自动覆盖 get + put',
      tables: [
        {
          id: 'concurrent-map-values',
          title: '通过当前入口实际读取的键值',
          columns: ['键', '值'],
          rows: concurrentMapEntries(s).map((entry) => ({ id: entry.key, values: [entry.key, entry.value] })),
        },
        {
          id: 'concurrent-map-buckets',
          title: '桶、写锁与迁移标记',
          columns: ['表 / 桶', '条目', '写锁 owner', 'Forwarding'],
          rows: s.tables.flatMap((table) =>
            table.buckets.map((bucket, index) => ({
              id: `${table.id}:${index}`,
              values: [
                `T${table.id}/B${index}`,
                bucket.entries.map((entry) => `${entry.key}:${entry.value}`).join(', ') || '空',
                s.locks[`${table.id}:${index}`] ?? '无',
                bucket.forwarding === null ? '无' : `→ T${bucket.forwarding}`,
              ],
            })),
          ),
        },
        {
          id: 'concurrent-map-operations',
          title: '尚未完成的复合操作',
          columns: ['线程', '原键', '操作', '阶段', '局部读取'],
          rows: Object.values(s.pending).map((job) => ({
            id: job.thread,
            values: [job.thread, job.key, job.kind, job.stage, job.expected ?? '未读取'],
          })),
        },
      ],
      caption:
        '三个逻辑线程、整数值、链式桶与受保护的 compute 递增回调；get 返回已提交值。模拟桶级互斥和扩容 Forwarding，不复刻 OpenJDK 源码，省略空桶 CAS、红黑树、size 统计、协作 transfer 和弱一致迭代。迁移逐桶原子进行，被持有的桶暂不迁移；旧表保留供观察。',
    },
    metrics: [
      { label: '已提交更新次数', value: s.updates },
      { label: 'compute 提交次数', value: s.computeUpdates },
      { label: '当前根表', value: `T${s.root}` },
      { label: '完整扩容次数', value: s.resized },
      { label: '最近 get 结果', value: s.lastGet ?? 'null / 未读取' },
    ],
    controls: [
      {
        id: 'selected',
        kind: 'select',
        label: 'ConcurrentHashMap 操作线程',
        value: s.selected,
        options: ['T1', 'T2', 'T3'].map((id) => ({ value: id, label: id })),
      },
      { id: 'key', kind: 'text', label: 'ConcurrentHashMap 键', value: s.key },
      {
        id: 'operation',
        kind: 'select',
        label: '新操作的更新方式',
        value: s.operation,
        options: [
          { value: 'naive', label: 'get + put / 两次独立调用' },
          { value: 'compute', label: 'compute / 原子递增回调' },
        ],
      },
      { id: 'begin', kind: 'button', label: '开始当前线程的更新', primary: true },
      { id: 'advance', kind: 'button', label: '推进 / 重试已保存的更新' },
      { id: 'get', kind: 'button', label: 'get · 读取当前键' },
      { id: 'start-resize', kind: 'button', label: '开始扩容到双倍容量', disabled: !!s.resize },
      { id: 'transfer', kind: 'button', label: '迁移一个旧桶', disabled: !s.resize },
    ],
    status: {
      title: s.error
        ? '当前桶操作需要等待或修正'
        : reached
          ? '安全结构仍需要正确的业务原子边界'
          : '先复现丢失更新，再用 compute 缩小原子范围',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '让 T1 / T2 都 get A=0 后再 put；改用 compute 重做，随后逐桶扩容并在中途读取已转发的 A。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '复现 get + put 丢失更新，完成两个经过等待的 compute，再在扩容中沿 Forwarding 读取并完成迁移。',
      reached,
    },
    log: s.log,
  }
}
export const concurrentMapEngine: EngineFactory = () =>
  createSession(initialConcurrentMap, concurrentMapTransition, presentConcurrentMap)
