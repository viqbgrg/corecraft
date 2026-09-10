import type {
  EngineFactory,
  ExperimentAction,
  ExperimentView,
  NetworkMessage,
  Observation,
} from '../../types/experiment'
import { addLog, createSession } from '../core/session'

type Fault = 'none' | 'dns' | 'tcp' | 'tls' | 'server'
export interface HttpState {
  draft: string
  url: string
  phase: 'idle' | 'running' | 'done' | 'failed'
  stage: number
  completed: number[]
  skipped: number[]
  reuse: boolean
  dnsCaching: boolean
  fault: Fault
  dnsCache: string[]
  connections: string[]
  reused: boolean
  coldCompleted: boolean
  reusedCompleted: boolean
  time: number
  previousTime: number | null
  response: number | null
  preparedResponse: number
  failure: string
  requests: number
  messages: NetworkMessage[]
  log: Observation[]
}
const stages = ['Browser', 'DNS', 'TCP', 'TLS', 'HTTP', 'Server', 'Response']
const subtitles = ['解析 URL', '域名 → IP', '建立连接', '安全协商', '请求报文', '应用处理', '接收响应']
export function initialHttp(): HttpState {
  return {
    draft: 'https://corecraft.test/hello',
    url: 'https://corecraft.test/hello',
    phase: 'idle',
    stage: 0,
    completed: [],
    skipped: [],
    reuse: true,
    dnsCaching: true,
    fault: 'none',
    dnsCache: [],
    connections: [],
    reused: false,
    coldCompleted: false,
    reusedCompleted: false,
    time: 0,
    previousTime: null,
    response: null,
    preparedResponse: 200,
    failure: '',
    requests: 0,
    messages: [],
    log: [],
  }
}
export function transitionHttp(state: HttpState, action: ExperimentAction): HttpState {
  const s = structuredClone(state)
  const stopped = s.phase !== 'running'
  if (action.type === 'url' && stopped) {
    s.draft = String(action.value ?? '').slice(0, 2048)
    return s
  }
  if (action.type === 'reuse' && stopped) {
    s.reuse = action.value === 'yes'
    return s
  }
  if (action.type === 'dns-cache' && stopped) {
    s.dnsCaching = action.value === 'yes'
    return s
  }
  if (
    action.type === 'fault' &&
    stopped &&
    ['none', 'dns', 'tcp', 'tls', 'server'].includes(String(action.value))
  ) {
    s.fault = action.value as Fault
    if (s.fault !== 'none') s.connections = []
    if (s.fault === 'dns') s.dnsCache = []
    s.log = addLog(
      s.log,
      '设置故障情景',
      s.fault === 'none'
        ? '下一次请求恢复正常。'
        : '故障演示清除现有连接；DNS 故障也清除解析缓存，以便实际经过对应步骤。',
    )
    return s
  }
  if (action.type === 'close-connections' && stopped) {
    s.connections = []
    s.log = addLog(s.log, '关闭连接池', 'DNS 缓存仍然保留，下一次需要重新建立 TCP / TLS。')
    return s
  }
  if (action.type !== 'next') return state
  if (stopped) {
    let parsed: URL
    try {
      parsed = new URL(s.draft)
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password
      )
        throw new Error('invalid')
    } catch {
      s.log = addLog(
        s.log,
        'URL 无效',
        '请输入 http:// 或 https:// 开头的 URL，不包含用户名密码。所有操作都只在教学模型中执行。',
        'danger',
      )
      return s
    }
    if (s.phase === 'done') s.previousTime = s.time
    s.url = parsed.href
    s.phase = 'running'
    s.stage = 0
    s.completed = []
    s.skipped = []
    s.messages = []
    s.time = 0
    s.response = null
    s.failure = ''
    s.reused = s.reuse && s.connections.includes(parsed.origin)
    s.requests++
  }
  const url = new URL(s.url)
  const secure = url.protocol === 'https:'
  let detail = ''
  let cost = 0
  let failure = ''
  const stage = s.stage
  if (stage === 0)
    detail =
      '解析 URL：协议 ' +
      url.protocol +
      '，主机 ' +
      url.hostname +
      '，路径 ' +
      url.pathname +
      '。片段 #' +
      (url.hash.slice(1) || '（无）') +
      ' 不会发给服务器。'
  if (stage === 1) {
    if (s.reused) {
      s.skipped.push(stage)
      detail = '已找到同源的存活连接，无需重新解析 DNS。'
    } else if (s.dnsCaching && s.dnsCache.includes(url.hostname)) {
      cost = 1
      detail = '本地 DNS 缓存命中，直接获得示例 IP 203.0.113.42。'
    } else {
      cost = 20
      if (s.fault === 'dns') failure = 'DNS_FAILURE'
      else {
        if (!s.dnsCache.includes(url.hostname)) s.dnsCache.push(url.hostname)
        detail = '递归解析获得示例 IP 203.0.113.42。缓存只保存域名映射，不代表 TCP 已连接。'
      }
    }
  }
  if (stage === 2) {
    if (s.reused) {
      s.skipped.push(stage)
      detail = '复用同源 TCP 连接，省去握手。'
    } else {
      cost = 60
      if (s.fault === 'tcp') failure = 'TCP_TIMEOUT'
      else {
        detail = 'SYN → SYN+ACK → ACK，传输连接建立。'
        if (!secure && !s.connections.includes(url.origin)) s.connections.push(url.origin)
      }
    }
  }
  if (stage === 3) {
    if (!secure) {
      s.skipped.push(stage)
      detail = 'http:// 使用明文，本次没有 TLS 协商。'
    } else if (s.reused) {
      s.skipped.push(stage)
      detail = '现有连接已经完成 TLS，无需再次协商。'
    } else {
      cost = 60
      if (s.fault === 'tls') failure = 'TLS_CERT_ERROR'
      else {
        detail = '抽象 TLS 1.3 完整握手：验证证书身份、协商密钥。HTTP 报文随后通过加密通道传输。'
        if (!s.connections.includes(url.origin)) s.connections.push(url.origin)
      }
    }
  }
  if (stage === 4) {
    cost = 30
    detail =
      'GET ' + url.pathname + url.search + ' HTTP/1.1 · Host: ' + url.host + '。现在才发送 HTTP 应用报文。'
  }
  if (stage === 5) {
    cost = 25
    s.preparedResponse = s.fault === 'server' ? 500 : 200
    detail = '服务端应用处理请求，准备 HTTP ' + s.preparedResponse + ' 和 JSON 响应。'
  }
  if (stage === 6) {
    cost = 30
    s.response = s.preparedResponse
    s.phase = 'done'
    s.coldCompleted ||= !s.reused && s.response === 200
    s.reusedCompleted ||= s.reused && s.response === 200
    detail =
      'Browser 收到 HTTP ' +
      s.response +
      '，Content-Type: application/json。' +
      (s.response === 500
        ? '应用报告错误，但 DNS、TCP、TLS 和 HTTP 传输都已成功。'
        : '应用读取响应体；连接可留给下一次同源请求。')
  }
  s.time += cost
  if (failure) {
    s.failure = failure
    s.phase = 'failed'
    s.connections = s.connections.filter((origin) => origin !== url.origin)
    detail =
      failure === 'DNS_FAILURE'
        ? 'DNS 无法解析，尚未建立 TCP，后续层不执行。'
        : failure === 'TCP_TIMEOUT'
          ? 'TCP 建连超时，TLS 与 HTTP 尚未发生。'
          : '证书验证失败，浏览器终止 TLS，HTTP 请求没有发送。'
  } else s.completed.push(stage)
  s.messages.push({
    from: stages[Math.max(0, stage - 1)]!,
    to: stages[stage]!,
    label: stages[stage]! + (failure ? ' · ' + failure : ' · +' + cost + ' ms'),
    detail,
    tone: failure ? 'danger' : 'success',
  })
  s.log = addLog(s.log, s.messages.at(-1)!.label, detail, failure ? 'danger' : 'success')
  if (s.phase === 'running') s.stage++
  return s
}
export function presentHttp(s: HttpState): ExperimentView {
  const running = s.phase === 'running'
  return {
    scene: {
      kind: 'network',
      layout: 'pipeline',
      nodes: stages.map((label, i) => ({
        id: label,
        label,
        subtitle: subtitles[i]!,
        state:
          s.phase === 'failed' && i === s.stage
            ? '失败'
            : s.skipped.includes(i)
              ? i === 3 && new URL(s.url).protocol === 'http:'
                ? '跳过'
                : '复用'
              : s.completed.includes(i)
                ? '完成'
                : i === s.stage
                  ? '待操作'
                  : '等待',
        active: i === s.stage && s.phase !== 'done',
      })),
      messages: s.messages,
      caption:
        '模型：HTTP/1.1 + TCP，HTTPS 使用抽象 TLS 1.3。时延为教学参数，不发送任何真实网络请求，不包含 HTTP/3、代理或浏览器资源加载。',
    },
    controls: [
      { id: 'url', kind: 'text', label: '请求 URL', value: s.draft, disabled: running },
      {
        id: 'reuse',
        kind: 'select',
        label: '同源连接复用',
        value: s.reuse ? 'yes' : 'no',
        disabled: running,
        options: [
          { value: 'yes', label: '开启 Keep-Alive' },
          { value: 'no', label: '每次新建连接' },
        ],
      },
      {
        id: 'dns-cache',
        kind: 'select',
        label: 'DNS 缓存',
        value: s.dnsCaching ? 'yes' : 'no',
        disabled: running,
        options: [
          { value: 'yes', label: '使用缓存' },
          { value: 'no', label: '每次解析' },
        ],
      },
      {
        id: 'fault',
        kind: 'select',
        label: '故障情景',
        value: s.fault,
        disabled: running,
        options: [
          { value: 'none', label: '正常请求' },
          { value: 'dns', label: 'DNS 解析失败' },
          { value: 'tcp', label: 'TCP 连接超时' },
          { value: 'tls', label: 'TLS 证书错误' },
          { value: 'server', label: 'Server 返回 500' },
        ],
      },
      {
        id: 'next',
        kind: 'button',
        label: running ? '下一步 · ' + stages[s.stage] : s.phase === 'idle' ? '发起请求' : '再发一次请求',
        primary: true,
      },
      {
        id: 'close-connections',
        kind: 'button',
        label: '关闭连接池',
        disabled: running || !s.connections.length,
      },
    ],
    metrics: [
      { label: '模拟总耗时', value: s.time, unit: 'ms' },
      { label: '上次完成请求', value: s.previousTime ?? '—', unit: 'ms' },
      { label: '连接复用', value: s.reused ? 'REUSED' : 'NEW' },
      { label: '响应状态', value: s.failure || s.response || '等待响应' },
    ],
    status: {
      title:
        s.phase === 'failed'
          ? '失败发生在 ' + stages[s.stage] + ' 层。'
          : s.phase === 'done'
            ? s.reused
              ? '同一条连接，省去了重复准备。'
              : '一次请求，经过多个各司其职的层。'
            : '浏览器地址栏背后，有一条完整的协作链。',
      detail:
        s.log.at(-1)?.detail ??
        '发起一次请求，逐步经过 DNS、TCP、TLS 与 HTTP。再发送一次，观察连接复用如何改变路径。',
      tone: s.phase === 'failed' ? 'danger' : s.phase === 'done' ? 'success' : 'neutral',
    },
    log: s.log,
    goal: {
      label: '完成一次新连接请求，再复用同源连接完成第二次请求。',
      reached: s.coldCompleted && s.reusedCompleted,
    },
  }
}
export const httpEngine: EngineFactory = () => createSession(initialHttp, transitionHttp, presentHttp)
