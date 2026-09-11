import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
import {
  capacityKeys,
  capacityStats,
  defaultCapacity,
  simulateCapacity,
  type CapacityConfig,
  type CapacityRun,
} from './backend-capacity'
type Scenario = 'db' | 'cpu' | 'gc'
type Fix = 'index' | 'cpu' | 'allocation' | 'workers'
export interface ObservabilityState {
  scenario: Scenario
  fix: Fix
  budget: number
  snapshotAt: number
  requestId: number
  baseline: CapacityRun | null
  candidate: CapacityRun | null
  observed: string[]
  error: string | null
  log: Observation[]
}
export function initialObservability(): ObservabilityState {
  return {
    scenario: 'db',
    fix: 'workers',
    budget: 50,
    snapshotAt: 5,
    requestId: 1,
    baseline: null,
    candidate: null,
    observed: [],
    error: null,
    log: [],
  }
}
export function incidentConfig(scenario: Scenario): CapacityConfig {
  const base = defaultCapacity()
  if (scenario === 'db') return base
  if (scenario === 'cpu')
    return { ...base, indexed: true, dbConnections: 2, workers: 4, allocation: 2, heap: 64, cpuCost: 6 }
  return { ...base, indexed: true, dbConnections: 2, heap: 24, allocation: 8 }
}
export function violationCount(r: CapacityRun, budget: number) {
  return r.jobs.filter((j) => j.stage !== 'done' || j.finished! - j.arrival > budget).length
}
export function observabilityTransition(state: ObservabilityState, a: ExperimentAction): ObservabilityState {
  if (a.type === 'scenario' && ['db', 'cpu', 'gc'].includes(String(a.value)))
    return { ...initialObservability(), scenario: a.value as Scenario, budget: a.value === 'db' ? 50 : 30 }
  if (a.type === 'fix' && ['index', 'cpu', 'allocation', 'workers'].includes(String(a.value)))
    return { ...state, fix: a.value as Fix }
  const fields: Record<string, [number, number]> = {
    budget: [1, 150],
    snapshotAt: [1, 200],
    requestId: [1, 12],
  }
  if (fields[a.type]) {
    const n = boundedInteger(a.value, ...fields[a.type]!)
    return n === null ? state : { ...state, [a.type]: n }
  }
  if (!['baseline', 'metrics', 'threads', 'trace', 'profile', 'heap', 'compare'].includes(a.type))
    return state
  const s = structuredClone(state)
  s.error = null
  if (a.type === 'baseline') {
    s.baseline = simulateCapacity(incidentConfig(s.scenario))
    s.candidate = null
    s.observed = []
    s.log = addLog(
      s.log,
      '运行故障负载',
      `完成 ${s.baseline.clock} 个确定时隙，保存每个请求的阶段、CPU 样本与线程/堆快照。`,
    )
    return s
  }
  if (!s.baseline) return { ...state, error: '先运行同一组十二请求，产生可检查的实际记录。' }
  if (a.type === 'compare') {
    const config = incidentConfig(s.scenario)
    if (s.fix === 'index') config.indexed = true
    else if (s.fix === 'cpu') config.cpuCost = 1
    else if (s.fix === 'allocation') config.allocation = 2
    else config.workers = Math.min(8, config.workers * 2)
    s.candidate = simulateCapacity(config)
    s.log = addLog(
      s.log,
      '控制变量复测',
      `只应用 ${s.fix} 调整，同样的 ${capacityKeys.length} 个输入与到达时序。p95 ${capacityStats(s.baseline).p95} → ${capacityStats(s.candidate).p95}；拒绝数与结果仍需核对。`,
    )
  } else {
    s.observed = [...new Set([...s.observed, a.type])]
    s.log = addLog(
      s.log,
      '采集诊断证据',
      (
        {
          metrics: '聚合延迟、吞吐、错误预算；计数包含拒绝，避免仅看成功样本。',
          threads: '快照来自指定时隙的实际 worker 状态，WAITING 不表示正在占用 CPU。',
          trace: '沿指定请求的排队、绑定、DB 等待/执行与序列化时点解释端到端延迟。',
          profile: 'CPU 样本只累计模型实际执行的 JVM 工作；长时间外部 IO 等待不会被当作 CPU 热点。',
          heap: '比较实际堆占用轨迹、GC 暂停和活跃请求持有，GC 后可回收部分与保留部分不同。',
        } as Record<string, string>
      )[a.type]!,
    )
  }
  return s
}
export function presentObservability(s: ObservabilityState): ExperimentView {
  const base = s.baseline,
    candidate = s.candidate,
    snapshot = base?.timeline.find((t) => t.clock === s.snapshotAt),
    job = base?.jobs.find((j) => j.id === s.requestId)
  const spans = job
    ? [
        ['入口等待', job.arrival, job.started],
        ['参数绑定 / 调度', job.started, job.cpuEnd],
        ['DB 连接等待', job.dbQueued, job.dbStart],
        ['数据库执行', job.dbStart, job.dbEnd],
        ['响应续执行等待', job.dbEnd, job.renderStart],
        ['序列化', job.renderStart, job.finished],
      ]
    : []
  const reached =
    !!base &&
    !!candidate &&
    ['metrics', 'threads', 'trace', 'profile', 'heap'].every((type) => s.observed.includes(type)) &&
    capacityStats(base).rejected === 0 &&
    capacityStats(candidate).rejected === 0 &&
    JSON.stringify(capacityStats(base).results) === JSON.stringify(capacityStats(candidate).results) &&
    capacityStats(candidate).p95 < capacityStats(base).p95 &&
    violationCount(candidate, s.budget) < violationCount(base, s.budget)
  return {
    scene: {
      kind: 'data',
      title: '先用指标定位范围，再用 Trace、线程、CPU 与堆证据检验解释',
      tables: [
        {
          id: 'observability-metrics',
          title: `SLO：99% 请求在 ${s.budget} 时隙内成功 / 当前有限样本`,
          columns: ['运行', 'p95', 'CPU 利用率', 'DB 利用率', 'GC 时隙', '不达标 / 总数', '错误预算消耗率'],
          rows: s.observed.includes('metrics')
            ? [
                { label: '基线', run: base },
                { label: '调整后', run: candidate },
              ]
                .filter((r) => r.run)
                .map((r) => {
                  const run = r.run!,
                    stats = capacityStats(run),
                    bad = violationCount(run, s.budget)
                  return {
                    id: r.label,
                    values: [
                      r.label,
                      stats.p95,
                      `${(stats.cpuUtil * 100).toFixed(1)}%`,
                      `${(stats.dbUtil * 100).toFixed(1)}%`,
                      run.gcTicks,
                      `${bad} / ${run.jobs.length}`,
                      `${(bad / run.jobs.length / 0.01).toFixed(1)}x`,
                    ],
                  }
                })
            : [],
        },
        {
          id: 'observability-threads',
          title: `时隙 ${s.snapshotAt} 结束后的 worker 快照`,
          columns: ['worker', '请求 / trace id', '状态'],
          rows: s.observed.includes('threads')
            ? (snapshot?.threads.map((t) => ({
                id: String(t.worker),
                values: [t.worker, `request-${t.request}`, t.state],
              })) ?? [])
            : [],
        },
        {
          id: 'observability-trace',
          title: `request-${s.requestId} 的实际阶段 / 不混入其他请求`,
          columns: ['阶段', '开始', '结束', '时长'],
          rows: s.observed.includes('trace')
            ? spans
                .filter((p) => p[1] !== null && p[2] !== null)
                .map(([name, start, end]) => ({
                  id: String(name),
                  values: [String(name), Number(start), Number(end), Number(end) - Number(start)],
                }))
            : [],
        },
        {
          id: 'observability-profile',
          title: '实际 CPU 执行样本',
          columns: ['帧', '样本 / 服务单位'],
          rows: s.observed.includes('profile')
            ? (base?.samples.map((p) => ({ id: p.frame, values: [p.frame, p.count] })) ?? [])
            : [],
        },
        {
          id: 'observability-heap',
          title: '堆与 GC 时序 / 每四时隙及暂停点',
          columns: ['时隙', '堆单位', 'GC 暂停', '系统内请求'],
          rows: s.observed.includes('heap')
            ? (base?.timeline
                .filter((t) => t.clock % 4 === 0 || t.gc)
                .map((t) => ({ id: String(t.clock), values: [t.clock, t.heap, String(t.gc), t.inflight] })) ??
              [])
            : [],
        },
      ],
      caption:
        '指标、trace、线程和 CPU/堆样本全部来自同一确定性容量模型，无真实 profiler 或 OpenTelemetry 采集。p95 用最近秩法，SLO 失败含拒绝与延迟超标；错误预算率为当前失败比例 / 1%，十二请求不代表稳定生产统计。DB 是外部服务工作，不能把其时长当成 JVM CPU。无完整 GC Roots、分布式时钟校正或并行 span 汇总。',
    },
    metrics: [
      { label: '已采集证据类型', value: s.observed.length },
      { label: '基线 p95', value: base ? capacityStats(base).p95 : '未运行' },
      { label: '调整后 p95', value: candidate ? capacityStats(candidate).p95 : '未运行' },
      { label: '调整后不达标请求', value: candidate ? violationCount(candidate, s.budget) : '未运行' },
    ],
    controls: [
      {
        id: 'scenario',
        kind: 'select',
        label: '新的故障负载',
        value: s.scenario,
        options: [
          { value: 'db', label: '慢查询与连接等待' },
          { value: 'cpu', label: '绑定 CPU 工作过多' },
          { value: 'gc', label: '短命对象分配压力' },
        ],
      },
      {
        id: 'fix',
        kind: 'select',
        label: '对照组唯一调整',
        value: s.fix,
        options: [
          { value: 'workers', label: '增加 worker 数量' },
          { value: 'index', label: '索引减少查询工作' },
          { value: 'cpu', label: '减少绑定 CPU 工作' },
          { value: 'allocation', label: '减少请求对象分配' },
        ],
      },
      { id: 'budget', kind: 'number', label: '成功响应时延预算', value: s.budget, min: 1, max: 150 },
      {
        id: 'snapshotAt',
        kind: 'number',
        label: '查看线程快照的时隙',
        value: s.snapshotAt,
        min: 1,
        max: 200,
      },
      { id: 'requestId', kind: 'number', label: '查看 Trace 的请求 id', value: s.requestId, min: 1, max: 12 },
      ...[
        ['baseline', '运行并记录基线负载'],
        ['metrics', '采集延迟与资源指标'],
        ['threads', '查看指定时隙线程快照'],
        ['trace', '查看指定请求 Trace'],
        ['profile', '查看实际 CPU 样本'],
        ['heap', '查看堆与 GC 时序'],
        ['compare', '应用一个调整并用同负载复测'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'trace' })),
    ],
    status: {
      title: s.error
        ? '还没有诊断记录'
        : reached
          ? '调整通过相同输入的结果与 SLO 检验'
          : '单个指标不足以证明瓶颈原因',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '记录基线，分别采集指标、线程、Trace、CPU 和堆；比较增加线程与减少真正瓶颈工作量的效果。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '从五种实际证据解释一次性能故障，并用控制变量复测降低 p95 与 SLO 不达标数，保持结果与接纳量。',
      reached,
    },
    log: s.log,
  }
}
export const observabilityEngine: EngineFactory = () =>
  createSession(initialObservability, observabilityTransition, presentObservability)
