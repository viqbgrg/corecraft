import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
interface Property {
  key: string
  value: string
  source: string
}
interface BoundConfig {
  timeoutMs: number
  poolSize: number
  enabled: boolean
  port: number
}
export interface BootConfigState {
  profile: 'default' | 'prod'
  env: string
  cli: string
  starter: boolean
  custom: boolean
  properties: Property[]
  effective: Property[]
  bound: BoundConfig | null
  conditions: { name: string; match: boolean; reason: string }[]
  beans: { name: string; origin: string; timeout: number }[]
  running: boolean
  attempts: number
  bindingFailed: boolean
  precedenceSeen: boolean
  autoSeen: boolean
  backoffSeen: boolean
  error: string | null
  log: Observation[]
}
export function initialBootConfig(): BootConfigState {
  return {
    profile: 'prod',
    env: 'APP_CLIENT_POOLSIZE=oops',
    cli: 'app.client.timeout=1s',
    starter: true,
    custom: false,
    properties: [],
    effective: [],
    bound: null,
    conditions: [],
    beans: [],
    running: false,
    attempts: 0,
    bindingFailed: false,
    precedenceSeen: false,
    autoSeen: false,
    backoffSeen: false,
    error: null,
    log: [],
  }
}
const envNames: Record<string, string> = {
  APP_CLIENT_TIMEOUT: 'app.client.timeout',
  APP_CLIENT_POOLSIZE: 'app.client.pool-size',
  APP_CLIENT_ENABLED: 'app.client.enabled',
  SERVER_PORT: 'server.port',
}
function parseProperties(raw: string, source: string, env: boolean): Property[] {
  if (!raw.trim()) return []
  return raw.split(';').map((piece) => {
    const idx = piece.indexOf('=')
    if (idx < 1) throw new Error(`${source} 需要 key=value，以分号分隔。`)
    const key = piece.slice(0, idx).trim().replace(/^--/, '')
    return {
      key: env ? (envNames[key] ?? key) : key.replace('poolSize', 'pool-size'),
      value: piece.slice(idx + 1).trim(),
      source,
    }
  })
}
export function bootConfigTransition(state: BootConfigState, a: ExperimentAction): BootConfigState {
  if (['env', 'cli'].includes(a.type)) return { ...state, [a.type]: String(a.value ?? '') }
  if (a.type === 'profile' && ['default', 'prod'].includes(String(a.value)))
    return { ...state, profile: a.value as BootConfigState['profile'] }
  if (['starter', 'custom'].includes(a.type) && ['yes', 'no'].includes(String(a.value)))
    return { ...state, [a.type]: a.value === 'yes' }
  if (a.type !== 'build') return state
  const s = structuredClone(state)
  s.error = null
  s.running = false
  s.bound = null
  s.beans = []
  s.conditions = []
  s.properties = []
  s.effective = []
  s.attempts++
  try {
    s.properties = [
      ...Object.entries({
        'app.client.timeout': '2s',
        'app.client.pool-size': '4',
        'app.client.enabled': 'true',
        'server.port': '8080',
      }).map(([key, value]) => ({ key, value, source: '代码默认' })),
      { key: 'app.client.timeout', value: '1500ms', source: 'application.properties' },
      ...(s.profile === 'prod'
        ? [
            { key: 'app.client.timeout', value: '500ms', source: 'application-prod.properties' },
            { key: 'app.client.pool-size', value: '8', source: 'application-prod.properties' },
          ]
        : []),
      ...parseProperties(s.env, '环境变量', true),
      ...parseProperties(s.cli, '命令行', false),
    ]
    const effective = new Map<string, Property>()
    for (const property of s.properties) effective.set(property.key, property)
    s.effective = [...effective.values()]
    const value = (key: string) => effective.get(key)!.value
    const duration = /^(\d+)(ms|s)$/.exec(value('app.client.timeout'))
    const timeout = duration ? Number(duration[1]) * (duration[2] === 's' ? 1000 : 1) : NaN,
      poolText = value('app.client.pool-size'),
      portText = value('server.port'),
      pool = Number(poolText),
      port = Number(portText),
      enabled = value('app.client.enabled')
    if (
      !Number.isSafeInteger(timeout) ||
      timeout < 1 ||
      timeout > 60000 ||
      !/^\d+$/.test(poolText) ||
      !Number.isInteger(pool) ||
      pool < 1 ||
      pool > 32 ||
      !/^\d+$/.test(portText) ||
      !Number.isInteger(port) ||
      port < 0 ||
      port > 65535 ||
      !['true', 'false'].includes(enabled)
    )
      throw new Error(
        'ConfigurationProperties 绑定 / 校验失败：timeout 需 1ms–60s，pool-size 需 1–32 整数，port 需 0–65535，enabled 需 true/false。',
      )
    s.bound = { timeoutMs: timeout, poolSize: pool, enabled: enabled === 'true', port }
    s.precedenceSeen ||=
      effective.get('app.client.timeout')!.source === '命令行' &&
      s.properties.filter((p) => p.key === 'app.client.timeout').length >= 3
    s.conditions = [
      {
        name: 'ConditionalOnClass(HttpClient)',
        match: s.starter,
        reason: s.starter ? '教学 starter 提供客户端类与自动配置候选' : '类路径缺少客户端类',
      },
      {
        name: 'ConditionalOnProperty(enabled)',
        match: s.bound.enabled,
        reason: `有效 app.client.enabled=${s.bound.enabled}`,
      },
      {
        name: 'ConditionalOnMissingBean(Client)',
        match: !s.custom,
        reason: s.custom ? '用户 @Configuration 已声明 Client，自动配置退让' : '没有用户 Client 定义',
      },
    ]
    if (s.custom) s.beans.push({ name: 'client', origin: '用户 @Bean', timeout: timeout })
    if (s.conditions.every((c) => c.match)) {
      s.beans.push({ name: 'client', origin: '自动配置 @Bean', timeout })
      s.autoSeen = true
    }
    s.backoffSeen ||= s.custom && s.starter && s.bound.enabled
    s.running = true
    s.log = addLog(
      s.log,
      '启动完成',
      `属性绑定为 timeout=${timeout}ms、pool=${pool}、port=${port}；Client Bean 数=${s.beans.length}。Starter 提供依赖，条件判定才决定自动配置是否创建 Bean。`,
      'success',
    )
  } catch (error) {
    s.error = (error as Error).message
    s.bindingFailed = true
    s.log = addLog(s.log, '启动失败', s.error, 'warning')
  }
  return s
}
export function presentBootConfig(s: BootConfigState): ExperimentView {
  const reached = s.bindingFailed && s.precedenceSeen && s.autoSeen && s.backoffSeen
  return {
    scene: {
      kind: 'data',
      title: 'Environment 合并属性，绑定类型，条件决定自动配置',
      tables: [
        {
          id: 'boot-properties',
          title: '属性源 / 从低到高优先级',
          columns: ['来源', '键', '原始值'],
          nowrapColumns: [0, 1],
          rows: s.properties.map((p, i) => ({ id: String(i), values: [p.source, p.key, p.value] })),
        },
        {
          id: 'boot-effective',
          title: '最终生效的属性与来源',
          columns: ['键', '值', '获胜来源'],
          nowrapColumns: [0],
          rows: s.effective.map((p) => ({ id: p.key, values: [p.key, p.value, p.source] })),
        },
        {
          id: 'boot-conditions',
          title: '自动配置条件报告',
          columns: ['条件', '匹配', '原因'],
          nowrapColumns: [0],
          rows: s.conditions.map((c) => ({ id: c.name, values: [c.name, String(c.match), c.reason] })),
        },
        {
          id: 'boot-beans',
          title: '最终 Client Bean',
          columns: ['名字', '来源', 'timeout ms'],
          rows: s.beans.map((b) => ({ id: b.name, values: [b.name, b.origin, b.timeout] })),
        },
      ],
      caption:
        '教学客户端 starter 与用户配置，五级属性源：默认、基础配置、profile 配置、环境变量、命令行。只实现列出的 relaxed binding 别名、Duration/整数/布尔绑定与范围校验；无真实类加载、配置导入、完整优先级、条件评估时序或热刷新。修改输入只影响下一次完整启动。',
    },
    metrics: [
      { label: '启动尝试次数', value: s.attempts },
      { label: '应用已启动', value: String(s.running) },
      { label: '绑定 timeout', value: s.bound ? `${s.bound.timeoutMs} ms` : '未绑定' },
      { label: 'Client Bean 数量', value: s.beans.length },
    ],
    controls: [
      {
        id: 'profile',
        kind: 'select',
        label: '下次启动的 Profile',
        value: s.profile,
        options: [
          { value: 'default', label: 'default' },
          { value: 'prod', label: 'prod' },
        ],
      },
      { id: 'env', kind: 'text', label: '环境属性 / 分号分隔', value: s.env },
      { id: 'cli', kind: 'text', label: '命令行属性 / 分号分隔', value: s.cli },
      {
        id: 'starter',
        kind: 'select',
        label: '类路径是否含教学 Client Starter',
        value: s.starter ? 'yes' : 'no',
        options: [
          { value: 'yes', label: '包含 Starter' },
          { value: 'no', label: '缺少客户端类' },
        ],
      },
      {
        id: 'custom',
        kind: 'select',
        label: '用户 Configuration 是否声明 Client',
        value: s.custom ? 'yes' : 'no',
        options: [
          { value: 'no', label: '没有自定义 Bean' },
          { value: 'yes', label: '有自定义 @Bean' },
        ],
      },
      { id: 'build', kind: 'button', label: '重新绑定配置并启动应用', primary: true },
    ],
    status: {
      title: s.error
        ? '配置阻止启动'
        : reached
          ? '属性来源与自动配置退让已验证'
          : '依赖在类路径中不等于 Bean 必定创建',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先验证错误 pool-size，修正为整数观察命令行覆盖，再声明用户 Bean 查看自动配置退让。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '修复配置绑定失败，追踪命令行优先级，创建自动 Bean 后让它向用户 Bean 退让。', reached },
    log: s.log,
  }
}
export const bootConfigEngine: EngineFactory = () =>
  createSession(initialBootConfig, bootConfigTransition, presentBootConfig)
