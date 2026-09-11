import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
export interface CapacityConfig {
  workers: number
  dbConnections: number
  queueLimit: number
  indexed: boolean
  cache: boolean
  async: boolean
  allocation: number
  heap: number
  cpuCost: number
}
export interface CapacityJob {
  id: number
  key: number
  arrival: number
  stage: 'scheduled' | 'queued' | 'cpu' | 'db-wait' | 'db' | 'resume' | 'render' | 'done' | 'rejected'
  worker: number | null
  remaining: number
  dbRemaining: number
  result: number | null
  allocated: number
  started: number | null
  cpuEnd: number | null
  renderStart: number | null
  dbQueued: number | null
  dbStart: number | null
  dbEnd: number | null
  finished: number | null
}
export interface CapacitySnapshot {
  clock: number
  queued: number
  inflight: number
  cpu: number
  db: number
  heap: number
  gc: boolean
  threads: { worker: number; request: number; state: string }[]
}
export interface CapacityRun {
  config: CapacityConfig
  clock: number
  jobs: CapacityJob[]
  cache: { key: number; value: number }[]
  heapUsed: number
  gcRemaining: number
  gcCount: number
  gcTicks: number
  cpuUnits: number
  dbUnits: number
  queries: number
  hits: number
  timeline: CapacitySnapshot[]
  samples: { frame: string; count: number }[]
  done: boolean
}
export interface CapacityState {
  input: string
  options: CapacityConfig
  run: CapacityRun
  comparison: { label: string; run: CapacityRun }[]
  error: string | null
  log: Observation[]
}
export const defaultCapacity = (): CapacityConfig => ({
  workers: 2,
  dbConnections: 1,
  queueLimit: 16,
  indexed: false,
  cache: false,
  async: false,
  allocation: 8,
  heap: 32,
  cpuCost: 1,
})
export const capacityKeys = [1, 2, 1, 2, 3, 3, 1, 2, 4, 4, 1, 2]
export function lookupCapacity(key: number, indexed: boolean): { value: number | null; work: number } {
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, price: (i + 1) * 10 }))
  let work = 0,
    value: number | null = null
  if (indexed) {
    let lo = 0,
      hi = rows.length
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2),
        row = rows[mid]!
      work++
      if (row.id === key) {
        value = row.price
        break
      }
      if (row.id < key) lo = mid + 1
      else hi = mid
    }
  } else
    for (const row of rows) {
      work++
      if (row.id === key) value = row.price
    }
  return { value, work }
}
export function newCapacityRun(config: CapacityConfig, keys: number[] = capacityKeys): CapacityRun {
  return {
    config: { ...config },
    clock: 0,
    jobs: keys.map((key, i) => ({
      id: i + 1,
      key,
      arrival: Math.floor(i / 2),
      stage: 'scheduled',
      worker: null,
      remaining: config.cpuCost,
      dbRemaining: 0,
      result: null,
      allocated: 0,
      started: null,
      cpuEnd: null,
      renderStart: null,
      dbQueued: null,
      dbStart: null,
      dbEnd: null,
      finished: null,
    })),
    cache: [],
    heapUsed: 0,
    gcRemaining: 0,
    gcCount: 0,
    gcTicks: 0,
    cpuUnits: 0,
    dbUnits: 0,
    queries: 0,
    hits: 0,
    timeline: [],
    samples: [],
    done: false,
  }
}
function dbProgress(r: CapacityRun, callbacks: boolean) {
  for (const j of r.jobs.filter((j) => j.stage === 'db')) {
    if (j.dbRemaining > 0) {
      j.dbRemaining--
      r.dbUnits++
    }
    if (j.dbRemaining === 0 && callbacks) {
      j.dbEnd = r.clock + 1
      if (r.config.cache && !r.cache.some((c) => c.key === j.key))
        r.cache.push({ key: j.key, value: j.result! })
      j.stage = r.config.async ? 'resume' : 'render'
      j.remaining = 1
    }
  }
}
function snapshot(r: CapacityRun, cpu: number, gc: boolean) {
  r.timeline.push({
    clock: r.clock + 1,
    queued: r.jobs.filter((j) => ['queued', 'resume'].includes(j.stage)).length,
    inflight: r.jobs.filter((j) => j.arrival <= r.clock && (j.finished === null || j.finished > r.clock))
      .length,
    cpu,
    db: r.jobs.filter((j) => j.stage === 'db').length,
    heap: r.heapUsed,
    gc,
    threads: r.jobs
      .filter((j) => j.worker !== null)
      .map((j) => ({
        worker: j.worker!,
        request: j.id,
        state:
          j.stage === 'db' || j.stage === 'db-wait'
            ? 'WAITING / JDBC'
            : j.stage === 'cpu' || j.stage === 'render'
              ? 'RUNNABLE'
              : j.stage,
      })),
  })
  r.clock++
  r.done = r.jobs.every((j) => ['done', 'rejected'].includes(j.stage))
}
export function stepCapacity(source: CapacityRun): CapacityRun {
  if (source.done) return source
  const r = structuredClone(source)
  for (const j of r.jobs)
    if (j.stage === 'scheduled' && j.arrival <= r.clock) {
      if (
        r.jobs.filter((j) => j.stage === 'queued' || j.stage === 'resume').length >=
        r.config.queueLimit + Math.max(0, r.config.workers - r.jobs.filter((j) => j.worker !== null).length)
      ) {
        j.stage = 'rejected'
        j.finished = r.clock
      } else j.stage = 'queued'
    }
  const pause = () => {
    r.gcTicks++
    dbProgress(r, false)
    r.gcRemaining--
    if (r.gcRemaining === 0)
      r.heapUsed = r.jobs
        .filter((j) => !['done', 'rejected'].includes(j.stage))
        .reduce((n, j) => n + j.allocated, 0)
    snapshot(r, 0, true)
    return r
  }
  if (r.gcRemaining > 0) return pause()
  for (let worker = 1; worker <= r.config.workers; worker++)
    if (!r.jobs.some((j) => j.worker === worker)) {
      const j = r.jobs.find((j) => j.stage === 'resume') ?? r.jobs.find((j) => j.stage === 'queued')
      if (j) {
        j.worker = worker
        j.stage = j.stage === 'resume' ? 'render' : 'cpu'
        j.started ??= r.clock
      }
    }
  const cpuReady = r.jobs.filter((j) => j.stage === 'cpu' || j.stage === 'render').slice(0, 2)
  for (const j of cpuReady)
    if (j.allocated === 0 && j.stage === 'cpu') {
      if (r.heapUsed + r.config.allocation > r.config.heap) {
        const live = r.jobs
          .filter((j) => !['done', 'rejected'].includes(j.stage))
          .reduce((n, j) => n + j.allocated, 0)
        if (live < r.heapUsed) {
          r.gcRemaining = 2
          r.gcCount++
          return pause()
        }
        j.stage = 'rejected'
        j.finished = r.clock
        j.worker = null
        continue
      }
      j.allocated = r.config.allocation
      r.heapUsed += j.allocated
    }
  let available = r.config.dbConnections - r.jobs.filter((j) => j.stage === 'db').length
  for (const j of r.jobs)
    if (j.stage === 'db-wait' && available > 0) {
      j.stage = 'db'
      j.dbStart = r.clock
      available--
    }
  dbProgress(r, true)
  let used = 0
  for (const j of cpuReady) {
    if (!['cpu', 'render'].includes(j.stage)) continue
    used++
    r.cpuUnits++
    if (j.stage === 'render') j.renderStart ??= r.clock
    const frame = j.stage === 'cpu' ? 'OrderController.bind' : 'JsonEncoder.encode'
    const sample = r.samples.find((p) => p.frame === frame)
    if (sample) sample.count++
    else r.samples.push({ frame, count: 1 })
    j.remaining--
    if (j.remaining > 0) continue
    if (j.stage === 'render') {
      j.stage = 'done'
      j.finished = r.clock + 1
      j.worker = null
    } else {
      j.cpuEnd = r.clock + 1
      const cached = r.config.cache ? r.cache.find((c) => c.key === j.key) : undefined
      if (cached) {
        r.hits++
        j.result = cached.value
        j.stage = 'render'
        j.remaining = 1
      } else {
        const query = lookupCapacity(j.key, r.config.indexed)
        r.queries++
        j.result = query.value
        j.dbRemaining = query.work
        j.dbQueued = r.clock + 1
        j.stage = 'db-wait'
        if (r.config.async) j.worker = null
      }
    }
  }
  snapshot(r, used, false)
  return r
}
export function simulateCapacity(config: CapacityConfig, keys: number[] = capacityKeys): CapacityRun {
  let r = newCapacityRun(config, keys)
  for (let i = 0; i < 1500 && !r.done; i++) r = stepCapacity(r)
  return r
}
export function capacityStats(r: CapacityRun) {
  const completed = r.jobs.filter((j) => j.stage === 'done'),
    latencies = completed.map((j) => j.finished! - j.arrival).sort((a, b) => a - b)
  return {
    completed: completed.length,
    rejected: r.jobs.filter((j) => j.stage === 'rejected').length,
    p95: latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1]! : 0,
    mean: latencies.length ? latencies.reduce((n, v) => n + v, 0) / latencies.length : 0,
    throughput: r.clock ? completed.length / r.clock : 0,
    cpuUtil: r.clock ? r.cpuUnits / (2 * r.clock) : 0,
    dbUtil: r.clock ? r.dbUnits / (r.config.dbConnections * r.clock) : 0,
    results: completed.map((j) => [j.id, j.result]),
  }
}
export function initialCapacity(): CapacityState {
  return {
    input: capacityKeys.join(','),
    options: defaultCapacity(),
    run: newCapacityRun(defaultCapacity()),
    comparison: [],
    error: null,
    log: [],
  }
}
export function capacityTransition(state: CapacityState, a: ExperimentAction): CapacityState {
  if (a.type === 'input') return { ...state, input: String(a.value ?? '') }
  if (['indexed', 'cache', 'async'].includes(a.type) && ['on', 'off'].includes(String(a.value)))
    return { ...state, options: { ...state.options, [a.type]: a.value === 'on' } }
  const bounds: Record<string, [number, number]> = {
    workers: [1, 8],
    dbConnections: [1, 3],
    queueLimit: [1, 24],
    allocation: [1, 16],
    heap: [16, 128],
    cpuCost: [1, 6],
  }
  if (bounds[a.type]) {
    const [min, max] = bounds[a.type]!
    const n = boundedInteger(a.value, min, max)
    return n === null ? state : { ...state, options: { ...state.options, [a.type]: n } }
  }
  if (!['start', 'tick', 'run', 'compare'].includes(a.type)) return state
  const s = structuredClone(state)
  s.error = null
  if (a.type === 'start' || a.type === 'compare') {
    const keys = s.input.split(',').map((part) => boundedInteger(part.trim(), 1, 8))
    if (keys.length > 24 || keys.some((key) => key === null))
      return { ...state, error: '输入 1–24 个产品 id，每个为 1–8 整数，以逗号分隔。' }
    if (a.type === 'start') s.run = newCapacityRun(s.options, keys as number[])
    else {
      const baseline = simulateCapacity(defaultCapacity(), keys as number[]),
        candidate = simulateCapacity(s.options, keys as number[])
      s.run = candidate
      s.comparison = [
        { label: '相同负载 / 基线', run: baseline },
        { label: '相同负载 / 当前配置', run: candidate },
      ]
      s.log = addLog(
        s.log,
        '同输入容量对照',
        `基线 ${baseline.clock} 时隙，当前 ${candidate.clock} 时隙；同时检查结果、拒绝、DB 工作量和 GC，不能只挑成功请求的延迟。`,
      )
    }
  } else if (a.type === 'tick') s.run = stepCapacity(s.run)
  else for (let i = 0; i < 1500 && !s.run.done; i++) s.run = stepCapacity(s.run)
  return s
}
export function presentCapacity(s: CapacityState): ExperimentView {
  const r = s.run,
    stats = capacityStats(r),
    base = s.comparison[0]?.run,
    candidate = s.comparison[1]?.run,
    reached =
      !!base &&
      !!candidate &&
      candidate.done &&
      capacityStats(candidate).rejected === 0 &&
      JSON.stringify(capacityStats(base).results) === JSON.stringify(stats.results) &&
      candidate.clock < base.clock &&
      candidate.dbUnits < base.dbUnits &&
      candidate.gcTicks <= base.gcTicks
  return {
    scene: {
      kind: 'data',
      title: '固定 CPU、DB 连接和堆容量下，排队与阻塞决定实际完成时间',
      tables: [
        {
          id: 'capacity-jobs',
          title: '实际请求流水 / 每时隙到达两个请求',
          columns: ['请求 / key', '到达', '阶段', 'worker', 'DB 等待 / 开始 / 结束', '结束', '查询结果'],
          rows: r.jobs.map((j) => ({
            id: String(j.id),
            values: [
              `${j.id} / ${j.key}`,
              j.arrival,
              j.stage,
              j.worker ?? '无',
              `${j.dbQueued ?? '—'} / ${j.dbStart ?? '—'} / ${j.dbEnd ?? '—'}`,
              j.finished ?? '—',
              j.result ?? '无',
            ],
          })),
        },
        {
          id: 'capacity-comparison',
          title: '同产品序列、同到达速率、同结果比较',
          columns: ['配置', '总时隙', '完成 / 拒绝', 'p95', 'DB 工作', '缓存命中', 'GC 时隙'],
          rows: s.comparison.map((c) => ({
            id: c.label,
            values: [
              c.label,
              c.run.clock,
              `${capacityStats(c.run).completed} / ${capacityStats(c.run).rejected}`,
              capacityStats(c.run).p95,
              c.run.dbUnits,
              c.run.hits,
              c.run.gcTicks,
            ],
          })),
        },
      ],
      caption:
        '固定两 CPU 服务槽、最多三 DB 连接，真实八行扫描或二分索引查找，缓存存实际结果；CPU 和 DB 分阶段推进。同步等待保留 worker，异步释放但请求对象仍占堆。堆单位是教学分配量，短命对象完成后可回收，STW 两时隙，外部 DB 继续而回调等待。不是 HotSpot/数据库性能基准，无并发缓存更新、分代 GC 或网络时延。',
    },
    metrics: [
      { label: '当前模拟时隙', value: r.clock },
      { label: '完成 / 拒绝请求', value: `${stats.completed} / ${stats.rejected}` },
      { label: 'p95 响应时隙', value: stats.p95 },
      { label: 'CPU 利用率', value: `${(stats.cpuUtil * 100).toFixed(1)}%` },
      { label: 'DB 服务工作量', value: r.dbUnits },
      { label: 'GC 暂停时隙', value: r.gcTicks },
      {
        label: '平均系统内请求数',
        value: r.clock ? (r.timeline.reduce((n, t) => n + t.inflight, 0) / r.clock).toFixed(2) : '0',
      },
      { label: '完成吞吐 / 时隙', value: stats.throughput.toFixed(3) },
    ],
    controls: [
      { id: 'input', kind: 'text', label: '下次负载产品 id 序列', value: s.input },
      ...(['workers', 'dbConnections', 'queueLimit', 'allocation', 'heap', 'cpuCost'] as const).map((id) => ({
        id,
        kind: 'number' as const,
        label: {
          workers: 'worker 数量',
          dbConnections: 'DB 连接数量',
          queueLimit: '入口排队上限',
          allocation: '每请求分配单位',
          heap: '堆容量单位',
          cpuCost: '请求绑定 CPU 工作量',
        }[id],
        value: s.options[id],
        min: { workers: 1, dbConnections: 1, queueLimit: 1, allocation: 1, heap: 16, cpuCost: 1 }[id],
        max: { workers: 8, dbConnections: 3, queueLimit: 24, allocation: 16, heap: 128, cpuCost: 6 }[id],
      })),
      ...(['indexed', 'cache', 'async'] as const).map((id) => ({
        id,
        kind: 'select' as const,
        label: { indexed: '查询路径', cache: '读取结果缓存', async: 'DB 等待方式' }[id],
        value: s.options[id] ? 'on' : 'off',
        options: [
          { value: 'off', label: { indexed: '扫描八行', cache: '关闭缓存', async: '同步占用 worker' }[id] },
          {
            value: 'on',
            label: { indexed: '二分索引定位', cache: '缓存命中跳过 DB', async: '异步释放 worker' }[id],
          },
        ],
      })),
      ...[
        ['start', '按当前配置重建负载'],
        ['tick', '推进一个容量时隙'],
        ['run', '运行当前负载直到结束'],
        ['compare', '运行同负载基线与当前配置对照'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'tick' })),
    ],
    status: {
      title: s.error
        ? '负载输入未通过校验'
        : reached
          ? '结果不变，瓶颈工作与等待成本下降'
          : '增加线程不能凭空增加 DB 或 CPU 容量',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先运行基线，再启用索引、缓存或调整分配与异步策略，对照同样请求的完成和资源成本。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '保持全部请求结果和零拒绝，用同负载对照减少总时间与 DB 工作，且不增加 GC 暂停。',
      reached,
    },
    log: s.log,
  }
}
export const capacityEngine: EngineFactory = () =>
  createSession(initialCapacity, capacityTransition, presentCapacity)
