import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
type BeanName = 'memoryRepo' | 'jdbcRepo' | 'service' | 'controller' | 'audit'
interface BeanDefinition {
  name: BeanName
  type: string
  scope: 'singleton' | 'prototype'
  deps: { field: string; type: string }[]
}
interface BeanObject {
  id: number
  name: BeanName
  phase: 'instantiated' | 'populated' | 'initialized' | 'processed' | 'destroyed'
  deps: Record<string, number>
  events: string[]
}
export interface ContainerState {
  qualifier: 'none' | 'memoryRepo' | 'jdbcRepo'
  scope: 'singleton' | 'prototype'
  injection: 'constructor' | 'setter'
  cycle: boolean
  allowEarly: boolean
  target: BeanName
  definitions: BeanDefinition[]
  objects: BeanObject[]
  singletons: Partial<Record<BeanName, number>>
  creating: BeanName[]
  early: Partial<Record<BeanName, number>>
  next: number
  last: number | null
  lookups: { name: BeanName; id: number }[]
  closed: boolean
  ambiguousSeen: boolean
  injected: boolean
  reused: boolean
  prototypeSeen: boolean
  destroyed: boolean
  error: string | null
  log: Observation[]
}
export function initialContainer(): ContainerState {
  return {
    qualifier: 'none',
    scope: 'singleton',
    injection: 'constructor',
    cycle: false,
    allowEarly: false,
    target: 'controller',
    definitions: [],
    objects: [],
    singletons: {},
    creating: [],
    early: {},
    next: 1,
    last: null,
    lookups: [],
    closed: false,
    ambiguousSeen: false,
    injected: false,
    reused: false,
    prototypeSeen: false,
    destroyed: false,
    error: null,
    log: [],
  }
}
function definitions(s: ContainerState): BeanDefinition[] {
  return [
    { name: 'memoryRepo', type: 'Repo', scope: 'singleton', deps: [] },
    { name: 'jdbcRepo', type: 'Repo', scope: 'singleton', deps: [] },
    {
      name: 'service',
      type: 'Service',
      scope: s.scope,
      deps: [{ field: 'repo', type: 'Repo' }, ...(s.cycle ? [{ field: 'audit', type: 'Audit' }] : [])],
    },
    {
      name: 'controller',
      type: 'Controller',
      scope: 'singleton',
      deps: [{ field: 'service', type: 'Service' }],
    },
    ...(s.cycle
      ? [
          {
            name: 'audit' as const,
            type: 'Audit',
            scope: 'singleton' as const,
            deps: [{ field: 'service', type: 'Service' }],
          },
        ]
      : []),
  ]
}
function resolveType(s: ContainerState, type: string): BeanName {
  let candidates = s.definitions.filter((d) => d.type === type)
  if (type === 'Repo' && s.qualifier !== 'none') candidates = candidates.filter((d) => d.name === s.qualifier)
  if (candidates.length !== 1)
    throw new Error(
      `NoUniqueBeanDefinitionException: ${type} 候选 ${candidates.map((d) => d.name).join(', ')}；需要明确 qualifier 或唯一候选。`,
    )
  return candidates[0]!.name
}
function getBean(s: ContainerState, name: BeanName): number {
  const def = s.definitions.find((d) => d.name === name)
  if (!def) throw new Error('NoSuchBeanDefinitionException: 先注册 BeanDefinition。')
  const cached = s.singletons[name]
  if (cached !== undefined) return cached
  if (s.creating.includes(name)) {
    if (s.injection === 'setter' && s.allowEarly && s.early[name] !== undefined) return s.early[name]!
    throw new Error(
      `BeanCurrentlyInCreationException: ${[...s.creating, name].join(' → ')}；构造器循环或未允许提前暴露。`,
    )
  }
  s.creating.push(name)
  const deps: Record<string, number> = {}
  if (s.injection === 'constructor')
    for (const dep of def.deps) deps[dep.field] = getBean(s, resolveType(s, dep.type))
  const obj: BeanObject = { id: s.next++, name, phase: 'instantiated', deps, events: ['实例化'] }
  s.objects.push(obj)
  if (s.injection === 'setter') {
    if (def.scope === 'singleton' && s.allowEarly) s.early[name] = obj.id
    for (const dep of def.deps) obj.deps[dep.field] = getBean(s, resolveType(s, dep.type))
  }
  obj.phase = 'populated'
  obj.events.push('注入属性')
  obj.phase = 'initialized'
  obj.events.push('初始化回调')
  obj.phase = 'processed'
  obj.events.push('BeanPostProcessor 后处理')
  if (def.scope === 'singleton') s.singletons[name] = obj.id
  delete s.early[name]
  s.creating.pop()
  s.injected ||= name === 'service' && obj.deps.repo !== undefined
  s.log = addLog(
    s.log,
    `创建 ${name}`,
    `对象 O${obj.id}：${obj.events.join(' → ')}；${def.scope === 'singleton' ? '加入 singleton 缓存' : 'prototype 每次显式请求重新创建'}。`,
  )
  return obj.id
}
export function containerTransition(state: ContainerState, a: ExperimentAction): ContainerState {
  if (
    a.type === 'target' &&
    ['memoryRepo', 'jdbcRepo', 'service', 'controller', 'audit'].includes(String(a.value))
  )
    return { ...state, target: a.value as BeanName }
  const choices: Record<string, string[]> = {
    qualifier: ['none', 'memoryRepo', 'jdbcRepo'],
    scope: ['singleton', 'prototype'],
    injection: ['constructor', 'setter'],
    cycle: ['on', 'off'],
    allowEarly: ['on', 'off'],
  }
  if (choices[a.type]?.includes(String(a.value))) {
    const value = ['cycle', 'allowEarly'].includes(a.type) ? a.value === 'on' : a.value
    return {
      ...initialContainer(),
      qualifier: state.qualifier,
      scope: state.scope,
      injection: state.injection,
      cycle: state.cycle,
      allowEarly: state.allowEarly,
      target: state.target,
      [a.type]: value,
      ambiguousSeen: state.ambiguousSeen,
      injected: state.injected,
      reused: state.reused,
      prototypeSeen: state.prototypeSeen,
      destroyed: state.destroyed,
      log: addLog(
        state.log,
        '新容器配置',
        '配置改变后创建新教学容器，需重新注册定义；已观察的机制证据保留。',
      ),
    }
  }
  if (!['register', 'get', 'refresh', 'close'].includes(a.type)) return state
  const s = structuredClone(state)
  s.error = null
  if (s.closed) return { ...state, error: 'ApplicationContext 已关闭，不能继续创建或获取 Bean。' }
  if (a.type === 'register') {
    if (!s.definitions.length) s.definitions = definitions(s)
    s.log = addLog(
      s.log,
      '注册定义',
      'BeanDefinition 已注册，没有因此自动实例化所有对象。BeanFactory 可按需 getBean，ApplicationContext.refresh 还会预实例化非 lazy 单例。',
    )
    return s
  }
  if (a.type === 'close') {
    for (const obj of [...s.objects].reverse())
      if (s.singletons[obj.name] === obj.id) {
        obj.phase = 'destroyed'
        obj.events.push('销毁回调')
        s.destroyed = true
      }
    s.closed = true
    s.log = addLog(
      s.log,
      '容器关闭',
      '逆创建顺序销毁已管理的 singleton；prototype 初始化后交给调用者，容器不会统一执行其销毁回调。',
    )
    return s
  }
  try {
    if (a.type === 'refresh') {
      if (!s.definitions.length) throw new Error('先注册 BeanDefinition，再 refresh。')
      for (const def of s.definitions) if (def.scope === 'singleton') getBean(s, def.name)
      s.log = addLog(
        s.log,
        'ApplicationContext.refresh',
        '完成本课非 lazy singleton 预实例化；真实上下文还提供事件、资源、环境与国际化等能力。',
      )
    } else {
      const id = getBean(s, s.target)
      s.reused ||= s.lookups.some((r) => r.name === s.target && r.id === id)
      s.prototypeSeen ||=
        s.definitions.find((d) => d.name === s.target)?.scope === 'prototype' &&
        s.lookups.some((r) => r.name === s.target && r.id !== id)
      s.last = id
      s.lookups.push({ name: s.target, id })
      s.log = addLog(s.log, 'getBean', `${s.target} → O${id}；对象身份决定是否重用。`)
    }
  } catch (error) {
    const message = (error as Error).message
    return {
      ...state,
      error: message,
      ambiguousSeen: state.ambiguousSeen || message.includes('NoUnique'),
      log: addLog(state.log, '依赖解析失败', message, 'warning'),
    }
  }
  return s
}
export function presentContainer(s: ContainerState): ExperimentView {
  const reached = s.ambiguousSeen && s.injected && s.reused && s.prototypeSeen && s.destroyed
  return {
    scene: {
      kind: 'data',
      title: 'BeanDefinition 描述依赖，容器解析并管理对象身份',
      tables: [
        {
          id: 'spring-definitions',
          title: '已注册 BeanDefinition',
          columns: ['名字', '类型', '作用域', '依赖'],
          rows: s.definitions.map((d) => ({
            id: d.name,
            values: [
              d.name,
              d.type,
              d.scope,
              d.deps.map((dep) => `${dep.field}:${dep.type}`).join(', ') || '无',
            ],
          })),
        },
        {
          id: 'spring-beans',
          title: '创建出的对象与生命周期',
          columns: ['对象', 'Bean', '阶段', '注入对象', '回调轨迹'],
          rows: s.objects.map((o) => ({
            id: String(o.id),
            values: [
              `O${o.id}`,
              o.name,
              o.phase,
              Object.entries(o.deps)
                .map(([name, id]) => `${name}=O${id}`)
                .join(', ') || '无',
              o.events.join(' → '),
            ],
          })),
        },
        {
          id: 'spring-lookups',
          title: '显式 getBean 结果',
          columns: ['请求', '返回身份'],
          rows: s.lookups.map((l, i) => ({ id: String(i), values: [l.name, `O${l.id}`] })),
        },
      ],
      caption:
        '固定 Repo / Service / Controller 依赖图，显式 qualifier、singleton/prototype、构造器/属性注入。可选 Audit 循环验证提前暴露条件，默认禁用；未模拟早期代理、BeanFactoryPostProcessor、FactoryBean、完整扫描或 refresh 失败清理。失败解析在教学状态中原子撤销候选图，保留错误路径。',
    },
    metrics: [
      { label: '定义数量', value: s.definitions.length },
      { label: 'singleton 缓存数量', value: Object.keys(s.singletons).length },
      { label: '最近 getBean', value: s.last === null ? '无' : `O${s.last}` },
      { label: '容器已关闭', value: String(s.closed) },
    ],
    controls: [
      {
        id: 'qualifier',
        kind: 'select',
        label: '新容器的 Repo qualifier',
        value: s.qualifier,
        options: [
          { value: 'none', label: '未指定 / 两个候选' },
          { value: 'memoryRepo', label: 'memoryRepo' },
          { value: 'jdbcRepo', label: 'jdbcRepo' },
        ],
      },
      {
        id: 'scope',
        kind: 'select',
        label: '新容器 Service 作用域',
        value: s.scope,
        options: [
          { value: 'singleton', label: 'singleton' },
          { value: 'prototype', label: 'prototype' },
        ],
      },
      {
        id: 'injection',
        kind: 'select',
        label: '新容器注入方式',
        value: s.injection,
        options: [
          { value: 'constructor', label: '构造器注入' },
          { value: 'setter', label: '属性注入' },
        ],
      },
      {
        id: 'cycle',
        kind: 'select',
        label: '新容器 Service / Audit 循环',
        value: s.cycle ? 'on' : 'off',
        options: [
          { value: 'off', label: '无循环' },
          { value: 'on', label: '相互依赖' },
        ],
      },
      {
        id: 'allowEarly',
        kind: 'select',
        label: '新容器允许属性提前暴露',
        value: s.allowEarly ? 'on' : 'off',
        options: [
          { value: 'off', label: '禁止 / 默认' },
          { value: 'on', label: '允许教学 singleton 属性循环' },
        ],
      },
      {
        id: 'target',
        kind: 'select',
        label: 'getBean 目标',
        value: s.target,
        options: ['controller', 'service', 'memoryRepo', 'jdbcRepo', 'audit'].map((id) => ({
          value: id,
          label: id,
        })),
      },
      ...[
        ['register', '注册 BeanDefinition'],
        ['get', 'BeanFactory.getBean · 解析依赖'],
        ['refresh', 'ApplicationContext.refresh · 预实例化'],
        ['close', '关闭容器并销毁受管理单例'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'get' })),
    ],
    status: {
      title: s.error
        ? '依赖图暂不能创建'
        : reached
          ? '对象构造、作用域与销毁已验证'
          : '注册定义不等于创建对象',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '注册并获取 controller，先观察 Repo 歧义，再指定 qualifier 比较 singleton 与 prototype。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '解决多候选依赖，验证单例重用与原型身份不同，再关闭容器检查销毁范围。', reached },
    log: s.log,
  }
}
export const containerEngine: EngineFactory = () =>
  createSession(initialContainer, containerTransition, presentContainer)
