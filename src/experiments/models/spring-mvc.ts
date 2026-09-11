import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
type Phase =
  | 'idle'
  | 'filter'
  | 'mapping'
  | 'interceptor'
  | 'binding'
  | 'controller'
  | 'render'
  | 'resolve'
  | 'completion'
  | 'done'
interface Request {
  method: 'GET' | 'POST'
  url: string
  body: string
  accept: string
  authorized: boolean
}
interface Response {
  status: number
  type: string
  body: string
}
export interface MvcState {
  method: 'GET' | 'POST'
  url: string
  body: string
  accept: string
  authorized: boolean
  request: Request | null
  phase: Phase
  handler: 'get-order' | 'post-order' | 'hello' | null
  bound: Record<string, string | number>
  returnValue: unknown
  response: Response | null
  exception: { status: number; cause: string } | null
  intercepted: boolean
  trace: string[]
  orders: { id: number; quantity: number }[]
  calls: number
  bindingSeen: boolean
  createdSeen: boolean
  resolvedSeen: boolean
  viewSeen: boolean
  error: string | null
  log: Observation[]
}
export function initialMvc(): MvcState {
  return {
    method: 'POST',
    url: '/orders',
    body: '{"quantity":"oops"}',
    accept: 'application/json',
    authorized: true,
    request: null,
    phase: 'idle',
    handler: null,
    bound: {},
    returnValue: null,
    response: null,
    exception: null,
    intercepted: false,
    trace: [],
    orders: [
      { id: 7, quantity: 2 },
      { id: 8, quantity: 5 },
    ],
    calls: 0,
    bindingSeen: false,
    createdSeen: false,
    resolvedSeen: false,
    viewSeen: false,
    error: null,
    log: [],
  }
}
const htmlEscape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
function mvcFail(s: MvcState, status: number, cause: string) {
  s.exception = { status, cause }
  s.phase = 'resolve'
  s.trace.push(`抛出 ${cause}`)
}
function mvcStep(s: MvcState) {
  const req = s.request
  if (!req) return
  if (s.phase === 'filter') {
    s.trace.push('Servlet Filter / 鉴权')
    if (!req.authorized) {
      s.response = { status: 401, type: 'application/json', body: '{"error":"unauthorized"}' }
      s.phase = 'done'
    } else s.phase = 'mapping'
  } else if (s.phase === 'mapping') {
    let path: string
    try {
      path = new URL(req.url, 'https://teaching.invalid').pathname
    } catch {
      mvcFail(s, 400, 'InvalidURL')
      return
    }
    const expected =
      path === '/orders' ? 'POST' : path === '/hello' || /^\/orders\/\d+$/.test(path) ? 'GET' : null
    s.trace.push('DispatcherServlet → HandlerMapping')
    if (!expected) mvcFail(s, 404, 'NoHandlerFound')
    else if (expected !== req.method) mvcFail(s, 405, 'MethodNotAllowed')
    else {
      s.handler = path === '/orders' ? 'post-order' : path === '/hello' ? 'hello' : 'get-order'
      s.phase = 'interceptor'
    }
  } else if (s.phase === 'interceptor') {
    s.intercepted = true
    s.trace.push('HandlerInterceptor.preHandle')
    s.phase = 'binding'
  } else if (s.phase === 'binding') {
    s.trace.push('HandlerAdapter → 参数解析 / 消息转换')
    try {
      const url = new URL(req.url, 'https://teaching.invalid')
      if (s.handler === 'post-order') {
        const data: unknown = JSON.parse(req.body)
        if (
          !data ||
          typeof data !== 'object' ||
          !('quantity' in data) ||
          !Number.isSafeInteger(data.quantity)
        )
          throw new Error('quantity 需要 JSON 整数')
        s.bound = { quantity: data.quantity as number }
      } else if (s.handler === 'get-order') s.bound = { id: Number(url.pathname.split('/').at(-1)) }
      else s.bound = { name: url.searchParams.get('name') ?? 'world' }
      s.phase = 'controller'
    } catch {
      s.bindingSeen = true
      mvcFail(s, 400, 'HttpMessageNotReadableException')
    }
  } else if (s.phase === 'controller') {
    s.calls++
    s.trace.push(`Controller.${s.handler}`)
    if (s.handler === 'get-order') {
      const order = s.orders.find((o) => o.id === s.bound.id)
      if (!order) {
        mvcFail(s, 404, 'OrderNotFoundException')
        return
      }
      s.returnValue = { ...order }
    } else if (s.handler === 'post-order') {
      if (s.orders.length >= 12) {
        mvcFail(s, 503, 'TeachingCapacityExceeded')
        return
      }
      const order = { id: Math.max(...s.orders.map((o) => o.id)) + 1, quantity: Number(s.bound.quantity) }
      s.orders.push(order)
      s.returnValue = { ...order }
    } else s.returnValue = { view: 'greeting', model: { name: s.bound.name } }
    s.phase = 'render'
  } else if (s.phase === 'render') {
    const type = s.handler === 'hello' ? 'text/html' : 'application/json'
    if (
      !req.accept
        .split(',')
        .map((t) => t.trim())
        .some((t) => t === '*/*' || t === type)
    ) {
      mvcFail(s, 406, 'NotAcceptable')
      return
    }
    if (s.handler === 'hello') {
      s.trace.push('ViewResolver → greeting 模板')
      s.response = { status: 200, type, body: `<h1>Hello, ${htmlEscape(String(s.bound.name))}</h1>` }
      s.viewSeen = true
    } else {
      s.trace.push('HttpMessageConverter → JSON')
      s.response = {
        status: s.handler === 'post-order' ? 201 : 200,
        type,
        body: JSON.stringify(s.returnValue),
      }
      s.createdSeen ||= s.handler === 'post-order'
    }
    s.trace.push('HandlerInterceptor.postHandle')
    s.phase = 'completion'
  } else if (s.phase === 'resolve') {
    const failure = s.exception!
    s.trace.push(`HandlerExceptionResolver / ControllerAdvice → ${failure.status}`)
    s.response = {
      status: failure.status,
      type: 'application/json',
      body: JSON.stringify({ error: failure.cause }),
    }
    s.resolvedSeen ||= failure.cause === 'OrderNotFoundException'
    s.phase = 'completion'
  } else if (s.phase === 'completion') {
    if (s.intercepted) s.trace.push('HandlerInterceptor.afterCompletion')
    s.trace.push('HTTP 响应返回')
    s.phase = 'done'
  }
  s.log = addLog(s.log, s.phase, s.trace.at(-1) ?? '请求继续')
}
export function mvcTransition(state: MvcState, a: ExperimentAction): MvcState {
  if (['url', 'body'].includes(a.type) && ['idle', 'done'].includes(state.phase))
    return { ...state, [a.type]: String(a.value ?? '') }
  if (
    a.type === 'method' &&
    ['GET', 'POST'].includes(String(a.value)) &&
    ['idle', 'done'].includes(state.phase)
  )
    return { ...state, method: a.value as MvcState['method'] }
  if (
    a.type === 'accept' &&
    ['application/json', 'text/html', '*/*'].includes(String(a.value)) &&
    ['idle', 'done'].includes(state.phase)
  )
    return { ...state, accept: String(a.value) }
  if (
    a.type === 'authorized' &&
    ['yes', 'no'].includes(String(a.value)) &&
    ['idle', 'done'].includes(state.phase)
  )
    return { ...state, authorized: a.value === 'yes' }
  if (!['begin', 'step', 'run'].includes(a.type)) return state
  let s = structuredClone(state)
  s.error = null
  if (a.type === 'begin') {
    if (!['idle', 'done'].includes(s.phase)) return { ...state, error: '当前请求尚未结束。' }
    s.request = { method: s.method, url: s.url, body: s.body, accept: s.accept, authorized: s.authorized }
    s.phase = 'filter'
    s.handler = null
    s.bound = {}
    s.returnValue = null
    s.response = null
    s.exception = null
    s.intercepted = false
    s.trace = []
    return s
  }
  if (a.type === 'step') {
    mvcStep(s)
    return s
  }
  if (s.phase === 'idle' || s.phase === 'done') s = mvcTransition(s, { type: 'begin' })
  for (let i = 0; i < 12 && s.phase !== 'done'; i++) mvcStep(s)
  return s
}
export function presentMvc(s: MvcState): ExperimentView {
  const reached = s.bindingSeen && s.createdSeen && s.resolvedSeen && s.viewSeen,
    disabled = !['idle', 'done'].includes(s.phase)
  return {
    scene: {
      kind: 'data',
      title: '从 Servlet 请求到 HandlerAdapter、Controller 和返回值处理',
      sequence: s.trace.map((value, i) => ({ label: String(i + 1), value })),
      tables: [
        {
          id: 'mvc-routes',
          title: 'HandlerMapping 路由',
          columns: ['方法', '路径', '参数', '返回'],
          rows: [
            { id: 'post', values: ['POST', '/orders', 'JSON quantity 整数', '201 JSON'] },
            { id: 'get', values: ['GET', '/orders/{id}', '路径 id', '200 JSON / 404 异常'] },
            { id: 'hello', values: ['GET', '/hello?name=Ada', '查询 name', '逻辑视图 greeting'] },
          ],
        },
        {
          id: 'mvc-bound',
          title: '已绑定参数',
          columns: ['参数', '值'],
          rows: Object.entries(s.bound).map(([name, value]) => ({ id: name, values: [name, value] })),
        },
        {
          id: 'mvc-orders',
          title: '教学应用订单',
          columns: ['id', 'quantity'],
          rows: s.orders.map((o) => ({ id: String(o.id), values: [o.id, o.quantity] })),
        },
        {
          id: 'mvc-response',
          title: 'HTTP 响应',
          columns: ['状态', 'Content-Type', 'Body'],
          rows: s.response
            ? [{ id: 'response', values: [s.response.status, s.response.type, s.response.body] }]
            : [],
        },
      ],
      caption:
        '模拟 Servlet Spring MVC 三条固定路由、参数转换、拦截器、JSON 与逻辑视图、异常解析。JSON quantity 在此只检查整数类型，不施加业务 Bean Validation。HTML 模板转义用户输入，显示为文本。仅精确媒体类型 / */* 协商，无真实 Servlet、网络、扫描、完整 Accept 权重、内容类型协商或 WebFlux。',
    },
    metrics: [
      { label: 'Controller 调用次数', value: s.calls },
      { label: '响应状态', value: s.response?.status ?? '未返回' },
      { label: '请求处理阶段', value: s.phase },
    ],
    controls: [
      {
        id: 'method',
        kind: 'select',
        label: '下一请求 HTTP 方法',
        value: s.method,
        disabled,
        options: ['GET', 'POST'].map((id) => ({ value: id, label: id })),
      },
      { id: 'url', kind: 'text', label: '下一请求路径与查询', value: s.url, disabled },
      { id: 'body', kind: 'text', label: '下一请求 JSON body', value: s.body, disabled },
      {
        id: 'accept',
        kind: 'select',
        label: '下一请求 Accept',
        value: s.accept,
        disabled,
        options: ['application/json', 'text/html', '*/*'].map((id) => ({ value: id, label: id })),
      },
      {
        id: 'authorized',
        kind: 'select',
        label: '下一请求鉴权结果',
        value: s.authorized ? 'yes' : 'no',
        disabled,
        options: [
          { value: 'yes', label: '通过 Filter' },
          { value: 'no', label: 'Filter 拒绝' },
        ],
      },
      ...[
        ['begin', '开始下一条 MVC 请求'],
        ['step', '推进一个 MVC 处理阶段'],
        ['run', '处理请求直到 HTTP 返回'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'step' })),
    ],
    status: {
      title: s.error
        ? '请求仍在处理中'
        : reached
          ? '绑定、控制器、异常与视图路径均已验证'
          : 'Controller 之前和之后都有框架工作',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先提交无法绑定的 quantity，再提交整数、查询不存在订单，最后访问 HTML 问候视图。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '观察参数绑定 400、成功创建 201、业务异常映射 404，并渲染转义后的 HTML 视图。', reached },
    log: s.log,
  }
}
export const mvcEngine: EngineFactory = () => createSession(initialMvc, mvcTransition, presentMvc)
