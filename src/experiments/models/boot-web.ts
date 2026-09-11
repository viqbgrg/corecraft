import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
interface WebMetric {
  uri: string
  status: number
  count: number
  total: number
}
export interface BootWebState {
  running: boolean
  db: boolean
  validation: boolean
  cascade: boolean
  metricsExposed: boolean
  role: 'anonymous' | 'operator'
  endpoint: 'orders' | 'readiness' | 'liveness' | 'metrics'
  body: string
  orders: unknown[]
  violations: string[]
  response: { status: number; body: string } | null
  metrics: WebMetric[]
  rejectedSeen: boolean
  createdSeen: boolean
  readyDownSeen: boolean
  liveUpSeen: boolean
  metricSeen: boolean
  error: string | null
  log: Observation[]
}
export function initialBootWeb(): BootWebState {
  return {
    running: false,
    db: true,
    validation: true,
    cascade: true,
    metricsExposed: false,
    role: 'anonymous',
    endpoint: 'orders',
    body: '{"email":"bad","quantity":0,"address":{"city":""}}',
    orders: [],
    violations: [],
    response: null,
    metrics: [],
    rejectedSeen: false,
    createdSeen: false,
    readyDownSeen: false,
    liveUpSeen: false,
    metricSeen: false,
    error: null,
    log: [],
  }
}
export function bootWebTransition(state: BootWebState, a: ExperimentAction): BootWebState {
  if (a.type === 'body') return { ...state, body: String(a.value ?? '') }
  if (
    ['db', 'validation', 'cascade', 'metricsExposed'].includes(a.type) &&
    ['on', 'off'].includes(String(a.value))
  )
    return { ...state, [a.type]: a.value === 'on' }
  if (a.type === 'role' && ['anonymous', 'operator'].includes(String(a.value)))
    return { ...state, role: a.value as BootWebState['role'] }
  if (a.type === 'endpoint' && ['orders', 'readiness', 'liveness', 'metrics'].includes(String(a.value)))
    return { ...state, endpoint: a.value as BootWebState['endpoint'] }
  if (!['start', 'stop', 'request'].includes(a.type)) return state
  const s = structuredClone(state)
  s.error = null
  s.violations = []
  if (a.type === 'start' || a.type === 'stop') {
    s.running = a.type === 'start'
    s.log = addLog(
      s.log,
      '嵌入式 Web 应用',
      s.running
        ? '应用启动并接受请求；Servlet Web starter 提供服务器与 MVC 集成，Validation 和 Actuator 能力需要相应依赖与配置。'
        : '应用停止，没有 HTTP listener。',
    )
    return s
  }
  if (!s.running)
    return { ...state, error: '应用未监听，连接失败；这不是应用返回了 HTTP 500。', response: null }
  let status = 200,
    body: unknown = {},
    duration = 1
  if (s.endpoint === 'orders') {
    let data: unknown
    try {
      data = JSON.parse(s.body)
    } catch {
      status = 400
      body = { error: 'malformed JSON' }
    }
    if (status === 200) {
      if (
        !data ||
        typeof data !== 'object' ||
        !('email' in data) ||
        typeof data.email !== 'string' ||
        !('quantity' in data) ||
        !Number.isSafeInteger(data.quantity)
      ) {
        status = 400
        body = { error: 'binding failure' }
      } else {
        if (s.validation) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) s.violations.push('email: @Email')
          if (Number(data.quantity) < 1) s.violations.push('quantity: @Min(1)')
          const address = 'address' in data ? data.address : undefined
          if (address === null || address === undefined) s.violations.push('address: @NotNull')
          else if (
            s.cascade &&
            (typeof address !== 'object' ||
              !('city' in address) ||
              typeof address.city !== 'string' ||
              !address.city.trim())
          )
            s.violations.push('address.city: @NotBlank / @Valid cascade')
        }
        if (s.violations.length) {
          status = 400
          body = { errors: s.violations }
          s.rejectedSeen = true
        } else if (!s.db) {
          status = 503
          body = { error: 'database unavailable' }
        } else if (s.orders.length >= 20) {
          status = 503
          body = { error: 'teaching order capacity' }
        } else {
          s.orders.push(structuredClone(data))
          status = 201
          body = { id: s.orders.length }
          duration = 3
          s.createdSeen ||= s.validation && s.cascade
        }
      }
    }
  } else if (s.endpoint === 'readiness') {
    status = s.db ? 200 : 503
    body = { status: s.db ? 'UP' : 'DOWN', group: 'readiness' }
    s.readyDownSeen ||= !s.db
  } else if (s.endpoint === 'liveness') {
    body = { status: 'UP', group: 'liveness' }
    s.liveUpSeen ||= !s.db
  } else if (!s.metricsExposed) {
    status = 404
    body = { error: 'endpoint not exposed' }
  } else if (s.role !== 'operator') {
    status = 403
    body = { error: 'application management policy' }
  } else {
    body = { name: 'http.server.requests', measurements: s.metrics.map((m) => ({ ...m })) }
    s.metricSeen = true
  }
  s.response = { status, body: JSON.stringify(body) }
  const uri =
      s.endpoint === 'orders'
        ? '/orders'
        : s.endpoint === 'metrics'
          ? '/actuator/metrics/http.server.requests'
          : `/actuator/health/${s.endpoint}`,
    metric = s.metrics.find((m) => m.uri === uri && m.status === status)
  if (metric) {
    metric.count++
    metric.total += duration
  } else s.metrics.push({ uri, status, count: 1, total: duration })
  s.log = addLog(
    s.log,
    'HTTP 完成',
    `${uri} → ${status}，教学时长 ${duration}；记录 uri 模板、status 等有限标签。暴露端点、授权与健康状态是独立判断。`,
    status >= 400 ? 'warning' : 'success',
  )
  return s
}
export function presentBootWeb(s: BootWebState): ExperimentView {
  const reached = s.rejectedSeen && s.createdSeen && s.readyDownSeen && s.liveUpSeen && s.metricSeen
  return {
    scene: {
      kind: 'data',
      title: 'Web 绑定、Bean Validation 和 Actuator 各自承担不同职责',
      tables: [
        {
          id: 'boot-validation',
          title: '本次约束违规',
          columns: ['字段 / 约束'],
          rows: s.violations.map((v, i) => ({ id: String(i), values: [v] })),
        },
        {
          id: 'boot-web-response',
          title: '最近响应',
          columns: ['HTTP', 'Body'],
          rows: s.response ? [{ id: 'response', values: [s.response.status, s.response.body] }] : [],
        },
        {
          id: 'boot-http-metrics',
          title: 'HTTP 请求指标 / 有限标签',
          columns: ['uri', 'status', 'count', 'total 教学时隙'],
          rows: s.metrics.map((m) => ({
            id: `${m.uri}:${m.status}`,
            values: [m.uri, m.status, m.count, m.total],
          })),
        },
      ],
      caption:
        '已配置的 Servlet Web / Validation / Actuator 应用模型，不等于所有 Boot 版本的默认依赖或安全规则。教学 @Email 是有限正则，quantity 类型绑定与 @Min 分开，嵌套校验需要 @Valid。readiness 明确纳入 DB，liveness 不因 DB 故障失败；实际 readiness 默认不必包含外部依赖。metrics 暴露和 operator 授权是本应用显式策略。',
    },
    metrics: [
      { label: '已创建订单数', value: s.orders.length },
      { label: '最近 HTTP 状态', value: s.response?.status ?? '无响应' },
      { label: '完成请求总数', value: s.metrics.reduce((n, m) => n + m.count, 0) },
    ],
    controls: [
      {
        id: 'endpoint',
        kind: 'select',
        label: '请求端点',
        value: s.endpoint,
        options: [
          { value: 'orders', label: 'POST /orders' },
          { value: 'readiness', label: 'GET /actuator/health/readiness' },
          { value: 'liveness', label: 'GET /actuator/health/liveness' },
          { value: 'metrics', label: 'GET /actuator/metrics/http.server.requests' },
        ],
      },
      { id: 'body', kind: 'text', label: '订单 JSON', value: s.body },
      {
        id: 'validation',
        kind: 'select',
        label: '是否配置 Validation provider 与 @Valid',
        value: s.validation ? 'on' : 'off',
        options: [
          { value: 'on', label: '约束生效' },
          { value: 'off', label: '缺少校验接入 / 反例' },
        ],
      },
      {
        id: 'cascade',
        kind: 'select',
        label: 'address 是否级联 @Valid',
        value: s.cascade ? 'on' : 'off',
        options: [
          { value: 'on', label: '校验嵌套地址' },
          { value: 'off', label: '不级联' },
        ],
      },
      {
        id: 'db',
        kind: 'select',
        label: '数据库依赖状态',
        value: s.db ? 'on' : 'off',
        options: [
          { value: 'on', label: '可用' },
          { value: 'off', label: '不可用' },
        ],
      },
      {
        id: 'metricsExposed',
        kind: 'select',
        label: '是否暴露 metrics 端点',
        value: s.metricsExposed ? 'on' : 'off',
        options: [
          { value: 'off', label: '未暴露' },
          { value: 'on', label: '已显式暴露' },
        ],
      },
      {
        id: 'role',
        kind: 'select',
        label: '请求者的应用管理角色',
        value: s.role,
        options: [
          { value: 'anonymous', label: 'anonymous' },
          { value: 'operator', label: 'operator' },
        ],
      },
      { id: 'start', kind: 'button', label: '启动嵌入式 Web 应用' },
      { id: 'request', kind: 'button', label: '发送当前 HTTP 请求', primary: true },
      { id: 'stop', kind: 'button', label: '停止 Web 应用' },
    ],
    status: {
      title: s.error
        ? '连接未到达应用'
        : reached
          ? '校验、探针与指标访问已分别验证'
          : '约束、暴露和授权需要实际配置',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '启动后提交无效和有效订单；让 DB 不可用，比较 readiness 与 liveness，再显式暴露并授权 metrics。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '拒绝无效订单并创建有效订单，区分 DB 故障时的两种探针，再读取受控暴露的请求指标。',
      reached,
    },
    log: s.log,
  }
}
export const bootWebEngine: EngineFactory = () =>
  createSession(initialBootWeb, bootWebTransition, presentBootWeb)
