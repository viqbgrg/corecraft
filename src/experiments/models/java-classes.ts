import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type DemoLoader = 'App' | 'Plugin'
export interface DemoClass {
  id: string
  definingLoader: DemoLoader
  initialized: boolean
  initCount: number
}
export interface DemoInstance {
  id: number
  classId: string
  value: number
}
export interface ReflectionException {
  type: 'ArithmeticException' | 'InvocationTargetException'
  cause: string | null
}
export interface JavaClassesState {
  selected: DemoLoader
  delegation: 'parent' | 'local'
  classes: DemoClass[]
  initiated: Partial<Record<DemoLoader, string>>
  instances: DemoInstance[]
  object: number | null
  nextId: number
  method: 'increment' | 'divide' | 'missing'
  argument: number
  stack: string[]
  exception: ReflectionException | null
  lastException: ReflectionException | null
  finallyRuns: number
  sharedType: boolean
  splitType: boolean
  caught: boolean
  inspected: boolean
  error: string | null
  log: Observation[]
}
export function initialJavaClasses(): JavaClassesState {
  return {
    selected: 'App',
    delegation: 'parent',
    classes: [],
    initiated: {},
    instances: [],
    object: null,
    nextId: 1,
    method: 'divide',
    argument: 0,
    stack: ['main'],
    exception: null,
    lastException: null,
    finallyRuns: 0,
    sharedType: false,
    splitType: false,
    caught: false,
    inspected: false,
    error: null,
    log: [],
  }
}
function loadCounter(s: JavaClassesState, requester: DemoLoader): DemoClass {
  const definingLoader = requester === 'App' || s.delegation === 'parent' ? 'App' : 'Plugin'
  const id = s.initiated[requester] ?? `${definingLoader}::demo.Counter`
  let klass = s.classes.find((klass) => klass.id === id)
  if (!klass) {
    klass = { id, definingLoader, initialized: false, initCount: 0 }
    s.classes.push(klass)
  }
  s.initiated[requester] = id
  return klass
}
export function classesTransition(state: JavaClassesState, a: ExperimentAction): JavaClassesState {
  if (a.type === 'selected' && ['App', 'Plugin'].includes(String(a.value)))
    return { ...state, selected: a.value as DemoLoader, error: null }
  if (a.type === 'method' && ['increment', 'divide', 'missing'].includes(String(a.value)) && !state.exception)
    return { ...state, method: a.value as JavaClassesState['method'], error: null }
  if (a.type === 'argument' && !state.exception) {
    const argument = boundedInteger(a.value, -10, 10)
    return argument === null ? state : { ...state, argument, error: null }
  }
  if (a.type === 'delegation' && ['parent', 'local'].includes(String(a.value)) && !state.exception)
    return {
      ...initialJavaClasses(),
      delegation: a.value as JavaClassesState['delegation'],
      selected: state.selected,
      sharedType: state.sharedType,
      splitType: state.splitType,
      caught: state.caught,
      inspected: state.inspected,
      log: addLog(
        state.log,
        '创建新加载场景',
        '委派规则在加载器创建时固定；切换规则会新建整个场景，已加载 Class 不会被换一种身份。已观察的学习证据保留。',
      ),
    }
  if (!['load', 'new', 'cast', 'inspect', 'invoke', 'unwind'].includes(a.type)) return state
  if (state.exception && a.type !== 'unwind')
    return { ...state, error: '先逐帧传播当前异常，才能继续执行 main。' }
  const s = structuredClone(state)
  s.error = null
  let detail = ''
  if (a.type === 'load') {
    const klass = loadCounter(s, s.selected)
    detail = `${s.selected} 请求 demo.Counter，定义加载器为 ${klass.definingLoader}。loadClass 得到 Class 元数据，本操作不触发初始化。`
  } else if (a.type === 'new') {
    if (s.instances.length >= 10) return { ...state, error: '当前场景最多 10 个对象。' }
    const klass = loadCounter(s, s.selected)
    if (!klass.initialized) {
      klass.initialized = true
      klass.initCount++
    }
    s.object = s.nextId++
    s.instances.push({ id: s.object, classId: klass.id, value: 10 })
    detail = `首次主动使用保证 ${klass.id} 初始化，然后创建 O${s.object}。同一 Class 的初始化只成功执行一次。`
  } else if (a.type === 'inspect') {
    const klass = loadCounter(s, s.selected)
    s.inspected = true
    detail = `${klass.id} 的元数据包含 public int increment(int) 与 public int divide(int)。反射检查得到方法描述，本操作不调用方法或初始化类。`
  } else if (a.type === 'cast') {
    const object = s.instances.find((object) => object.id === s.object)
    if (!object) return { ...state, error: '先创建一个实例。' }
    const expected = loadCounter(s, 'App')
    if (object.classId !== expected.id) {
      s.splitType = true
      s.error = `ClassCastException：${object.classId} 不是 ${expected.id}，类名相同不足以证明类型相同。`
      detail = s.error
    } else {
      s.sharedType ||= s.initiated.Plugin === expected.id
      detail = `O${object.id} 可以转换为 App 所见的 Counter；两个请求者委派到同一个定义类。`
    }
  } else if (a.type === 'invoke') {
    const object = s.instances.find((object) => object.id === s.object)
    if (!object) return { ...state, error: '先创建反射调用的接收对象。' }
    if (s.method === 'missing')
      return { ...state, error: 'getMethod 失败：NoSuchMethodException；尚未进入目标方法。' }
    s.inspected = true
    if (s.method === 'divide' && s.argument === 0) {
      s.stack = ['main', 'Method.invoke', 'Counter.divide']
      s.exception = { type: 'ArithmeticException', cause: null }
      detail = '目标方法执行 10 / 0，抛出 ArithmeticException；异常开始从 Counter.divide 帧传播。'
    } else {
      object.value =
        s.method === 'increment' ? object.value + s.argument : Math.trunc(object.value / s.argument)
      s.finallyRuns++
      detail = `反射调用 ${s.method}(${s.argument}) 正常返回 ${object.value}；目标方法 finally 执行一次。`
    }
  } else {
    if (!s.exception) return state
    const top = s.stack.at(-1)!
    if (top === 'Counter.divide') {
      s.finallyRuns++
      s.stack.pop()
      detail = 'Counter.divide 的 finally 执行，随后弹出目标帧；原异常继续向调用者传播。'
    } else if (top === 'Method.invoke') {
      s.exception = { type: 'InvocationTargetException', cause: s.exception.type }
      s.stack.pop()
      detail = 'Method.invoke 将目标异常包装为 InvocationTargetException，并保留 cause=ArithmeticException。'
    } else {
      s.lastException = { ...s.exception }
      s.exception = null
      s.caught = true
      detail =
        'main 的 catch 捕获 InvocationTargetException；检查 cause 得到 ArithmeticException。控制流从 catch 之后继续。'
    }
  }
  s.log = addLog(s.log, a.type, detail, s.error ? 'warning' : 'neutral')
  return s
}
export function presentJavaClasses(s: JavaClassesState): ExperimentView {
  const reached = s.sharedType && s.splitType && s.caught && s.inspected
  return {
    scene: {
      kind: 'data',
      title: '类型身份 = 二进制类名 + 定义它的 ClassLoader',
      cards: [
        {
          id: 'type',
          label: '最近对象的运行时类型',
          value: s.instances.find((object) => object.id === s.object)?.classId ?? '无实例',
        },
        {
          id: 'exception',
          label: '正在传播的异常',
          value: s.exception?.type ?? '无',
          detail: s.exception?.cause
            ? `cause: ${s.exception.cause}`
            : s.lastException
              ? `最近捕获 ${s.lastException.type}，cause=${s.lastException.cause}`
              : '反射查找失败与目标方法抛错发生在不同阶段',
        },
      ],
      tables: [
        {
          id: 'java-loaders',
          title: '请求加载器与定义加载器',
          columns: ['请求者', '父加载器', '已发起加载的 Class'],
          rows: (['App', 'Plugin'] as const).map((loader) => ({
            id: loader,
            values: [
              loader,
              loader === 'App' ? 'Platform / Bootstrap（省略）' : 'App',
              s.initiated[loader] ?? '未请求',
            ],
          })),
        },
        {
          id: 'java-loaded-classes',
          title: '已定义 Class / 加载不等于初始化',
          columns: ['Class 身份', '已初始化', '初始化次数', '可反射方法'],
          rows: s.classes.map((klass) => ({
            id: klass.id,
            values: [
              klass.id,
              klass.initialized ? '是' : '否',
              klass.initCount,
              s.inspected ? 'increment(int), divide(int)' : '点击检查元数据',
            ],
          })),
        },
        {
          id: 'java-reflect-objects',
          title: '实例与字段',
          columns: ['对象', 'Class', 'value'],
          rows: s.instances.map((object) => ({
            id: String(object.id),
            values: [`O${object.id}`, object.classId, object.value],
          })),
        },
        {
          id: 'java-exception-stack',
          title: '异常传播中的调用栈',
          columns: ['深度', '方法', '状态'],
          rows: s.stack.map((name, i) => ({
            id: String(i),
            values: [i, name, i === s.stack.length - 1 ? (s.exception ? '处理异常' : '可继续') : '等待返回'],
          })),
        },
      ],
      caption:
        '两个模拟加载器和固定 Counter 类；不读取 .class 文件，不执行任意反射代码。Plugin 可委派到 App 或独立定义；Bootstrap / 模块可访问性、链接约束和完整验证在此省略。finally 固定正常完成，无异常替换与 try-with-resources 的 suppressed 机制。',
    },
    metrics: [
      { label: '已定义类型数', value: s.classes.length },
      { label: '对象数量', value: s.instances.length },
      { label: 'finally 执行次数', value: s.finallyRuns },
      { label: '异常栈深度', value: s.stack.length },
    ],
    controls: [
      {
        id: 'selected',
        kind: 'select',
        label: '请求类的加载器',
        value: s.selected,
        options: [
          { value: 'App', label: 'App' },
          { value: 'Plugin', label: 'Plugin / 子加载器' },
        ],
      },
      {
        id: 'delegation',
        kind: 'select',
        label: '新场景的 Plugin 委派规则',
        value: s.delegation,
        disabled: !!s.exception,
        options: [
          { value: 'parent', label: '父优先 / 委派 App' },
          { value: 'local', label: '独立定义同名类' },
        ],
      },
      {
        id: 'method',
        kind: 'select',
        label: '反射方法名',
        value: s.method,
        disabled: !!s.exception,
        options: [
          { value: 'divide', label: 'divide(int)' },
          { value: 'increment', label: 'increment(int)' },
          { value: 'missing', label: '不存在的方法' },
        ],
      },
      {
        id: 'argument',
        kind: 'number',
        label: '反射调用参数',
        value: s.argument,
        min: -10,
        max: 10,
        disabled: !!s.exception,
      },
      { id: 'load', kind: 'button', label: 'loadClass · 仅加载类型', primary: true, disabled: !!s.exception },
      { id: 'inspect', kind: 'button', label: 'Reflection · 检查方法元数据', disabled: !!s.exception },
      { id: 'new', kind: 'button', label: '初始化并创建 Counter 实例', disabled: !!s.exception },
      { id: 'cast', kind: 'button', label: '转换为 App 的 Counter', disabled: !!s.exception },
      { id: 'invoke', kind: 'button', label: 'Method.invoke · 调用目标方法', disabled: !!s.exception },
      { id: 'unwind', kind: 'button', label: '传播异常 / 处理一个栈帧', disabled: !s.exception },
    ],
    status: {
      title: s.error
        ? '运行时检查失败'
        : reached
          ? '同名类型、反射入口和异常原因已经分开'
          : '先确认哪个加载器定义了这个类',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '让 Plugin 父优先加载并转换成功，再建立独立定义场景观察转换失败；反射除零并逐帧传播到 main。',
      tone: s.error || s.exception ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '对比委派共享类型与独立同名类型，并沿调用栈捕获反射包装异常及其 cause。', reached },
    log: s.log,
  }
}
export const classesEngine: EngineFactory = () =>
  createSession(initialJavaClasses, classesTransition, presentJavaClasses)
