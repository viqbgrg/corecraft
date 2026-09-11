import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export function ipv4(address: string): number | null {
  const parts = address.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255))
    return null
  return parts.reduce((result, part) => result * 256 + Number(part), 0) >>> 0
}
export function sameSubnet(a: string, b: string, prefix = 24): boolean {
  const left = ipv4(a),
    right = ipv4(b)
  if (left === null || right === null || boundedInteger(prefix, 0, 32) === null) return false
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (left & mask) === (right & mask)
}
const sourceIp = '192.0.2.10',
  sourceMac = '02:00:00:00:00:10',
  gatewayIp = '192.0.2.1',
  gatewayMac = '02:00:00:00:00:01',
  routerRemoteMac = '02:00:00:00:01:01'
const destinations = [
  { value: '198.51.100.20', label: 'C · 198.51.100.20（跨网段）' },
  { value: '192.0.2.20', label: 'B · 192.0.2.20（同网段）' },
  { value: '192.0.2.99', label: '192.0.2.99（本地无此主机）' },
  { value: '203.0.113.20', label: '203.0.113.20（路由器无路由）' },
]
export interface LinkFrame {
  hop: string
  srcMac: string
  dstMac: string
  srcIp: string
  dstIp: string
  ttl: number
  protocol: 'udp' | 'tcp'
  port: number
  bytes: number
}
export type NetworkStage =
  | 'host-route'
  | 'host-arp'
  | 'host-frame'
  | 'router-route'
  | 'router-arp'
  | 'router-frame'
  | 'socket'
  | 'done'
  | 'failed'
export interface LayerState {
  destination: string
  protocol: 'udp' | 'tcp'
  port: number
  ttl: number
  payload: string
  open: boolean
  stage: NetworkStage
  nextHop: string
  remainingTtl: number
  arp: { interface: string; ip: string; mac: string }[]
  arpRequests: number
  frames: LinkFrame[]
  received: string | null
  error: string | null
  log: Observation[]
}
export function initialLayers(
  destination = destinations[0]!.value,
  protocol: 'udp' | 'tcp' = 'udp',
  port = 9000,
  ttl = 3,
  payload = 'hello',
  open = true,
): LayerState {
  if (
    !destinations.some((d) => d.value === destination) ||
    !['udp', 'tcp'].includes(protocol) ||
    boundedInteger(port, 1, 65535) === null ||
    boundedInteger(ttl, 1, 8) === null ||
    !payload.length ||
    new TextEncoder().encode(payload).length > 32 ||
    typeof open !== 'boolean'
  )
    throw new Error(
      'Network layer config requires a topology destination, UDP/TCP, port 1–65535, TTL 1–8 and 1–32 payload bytes',
    )
  return {
    destination,
    protocol,
    port,
    ttl,
    payload,
    open,
    stage: 'host-route',
    nextHop: '',
    remainingTtl: ttl,
    arp: [],
    arpRequests: 0,
    frames: [],
    received: null,
    error: null,
    log: [],
  }
}
const resolvedMac = (networkInterface: string, ip: string): string | null =>
  networkInterface === 'A.eth0'
    ? ip === gatewayIp
      ? gatewayMac
      : ip === '192.0.2.20'
        ? '02:00:00:00:00:20'
        : null
    : ip === '198.51.100.20'
      ? '02:00:00:00:01:20'
      : null
export function layerStep(state: LayerState): LayerState {
  if (['done', 'failed'].includes(state.stage)) return state
  const s: LayerState = { ...state, frames: [...state.frames], arp: [...state.arp] }
  const fail = (error: string) => {
    s.error = error
    s.stage = 'failed'
    s.log = addLog(s.log, '交付失败', error, 'warning')
    return s
  }
  const resolve = (networkInterface: string, nextStage: NetworkStage): LayerState => {
    const cached = s.arp.find((entry) => entry.interface === networkInterface && entry.ip === s.nextHop)
    if (cached)
      s.log = addLog(s.log, 'ARP 缓存命中', `${networkInterface} 的下一跳 ${s.nextHop} → ${cached.mac}。`)
    else {
      s.arpRequests++
      s.log = addLog(
        s.log,
        'ARP Request · 广播',
        `${networkInterface} 在本链路询问：谁拥有 ${s.nextHop}？广播不穿越路由器。`,
      )
      const mac = resolvedMac(networkInterface, s.nextHop)
      if (!mac) return fail(`ARP 未应答：本链路无法解析下一跳 ${s.nextHop}，教学等待结束后报错。`)
      s.arp.push({ interface: networkInterface, ip: s.nextHop, mac })
      s.log = addLog(s.log, 'ARP Reply', `${s.nextHop} 回应自己的链路地址 ${mac}。`)
    }
    s.stage = nextStage
    return s
  }
  if (s.stage === 'host-route') {
    s.nextHop = sameSubnet(sourceIp, s.destination) ? s.destination : gatewayIp
    s.stage = 'host-arp'
    s.log = addLog(
      s.log,
      'A 查询路由',
      `${sourceIp}/24 → ${s.destination}：${s.nextHop === s.destination ? '直连目的主机' : '经默认网关'}，下一跳 ${s.nextHop}。`,
    )
  } else if (s.stage === 'host-arp') return resolve('A.eth0', 'host-frame')
  else if (s.stage === 'host-frame') {
    const dstMac = s.arp.find((entry) => entry.interface === 'A.eth0' && entry.ip === s.nextHop)!.mac
    s.frames.push({
      hop: s.nextHop === gatewayIp ? 'A → R' : 'A → B',
      srcMac: sourceMac,
      dstMac,
      srcIp: sourceIp,
      dstIp: s.destination,
      ttl: s.remainingTtl,
      protocol: s.protocol,
      port: s.port,
      bytes: new TextEncoder().encode(s.payload).length,
    })
    s.stage = s.nextHop === gatewayIp ? 'router-route' : 'socket'
    s.log = addLog(
      s.log,
      '发送 Ethernet 帧',
      `链路目的 ${dstMac}，IP 目的仍为 ${s.destination}；端口属于 ${s.protocol.toUpperCase()} 头部。`,
    )
  } else if (s.stage === 'router-route') {
    s.remainingTtl--
    if (s.remainingTtl === 0) return fail('ICMP Time Exceeded：路由器将 TTL 减至 0，丢弃 IP 包并通知源主机。')
    if (!sameSubnet('198.51.100.1', s.destination))
      return fail('ICMP Destination Unreachable：此教学路由器只有两个直连网段，没有通往目标网段的路由。')
    s.nextHop = s.destination
    s.stage = 'router-arp'
    s.log = addLog(
      s.log,
      'R 转发 IP 包',
      `剥离入站 Ethernet 头，TTL=${s.remainingTtl}，选择 R.eth1；源 IP ${sourceIp} 与目的 IP ${s.destination} 保持不变。`,
    )
  } else if (s.stage === 'router-arp') return resolve('R.eth1', 'router-frame')
  else if (s.stage === 'router-frame') {
    const dstMac = s.arp.find((entry) => entry.interface === 'R.eth1' && entry.ip === s.nextHop)!.mac
    s.frames.push({
      hop: 'R → C',
      srcMac: routerRemoteMac,
      dstMac,
      srcIp: sourceIp,
      dstIp: s.destination,
      ttl: s.remainingTtl,
      protocol: s.protocol,
      port: s.port,
      bytes: new TextEncoder().encode(s.payload).length,
    })
    s.stage = 'socket'
    s.log = addLog(
      s.log,
      '重新封装 Ethernet',
      `${routerRemoteMac} → ${dstMac}；跨路由后链路头已变化，端到端 IP 地址与端口保持。`,
    )
  } else if (s.stage === 'socket') {
    if (!s.open || s.port !== 9000)
      return fail(
        s.protocol === 'udp'
          ? `ICMP Port Unreachable：主机可达，但 UDP ${s.port} 没有匹配的已绑定 Socket。`
          : `TCP RST：没有匹配的已建立 TCP Socket，不能把载荷交给应用。`,
      )
    s.received = s.payload
    s.stage = 'done'
    s.log = addLog(
      s.log,
      'Socket 分用成功',
      `${s.destination} 的 ${s.protocol.toUpperCase()} 9000 收到「${s.payload}」。IP 到主机，传输层与 Socket 将数据交给对应端点。`,
      'success',
    )
  }
  return s
}
export function layerTransition(s: LayerState, a: ExperimentAction): LayerState {
  if (['destination', 'protocol', 'port', 'ttl', 'payload', 'open'].includes(a.type)) {
    const destination = a.type === 'destination' ? String(a.value) : s.destination,
      protocol = a.type === 'protocol' ? (String(a.value) as LayerState['protocol']) : s.protocol
    const port = a.type === 'port' ? boundedInteger(a.value, 1, 65535) : s.port,
      ttl = a.type === 'ttl' ? boundedInteger(a.value, 1, 8) : s.ttl
    const payload = a.type === 'payload' ? String(a.value ?? '') : s.payload
    if (port === null || ttl === null || (a.type === 'open' && !['yes', 'no'].includes(String(a.value))))
      return s
    try {
      return initialLayers(
        destination,
        protocol,
        port,
        ttl,
        payload,
        a.type === 'open' ? a.value === 'yes' : s.open,
      )
    } catch {
      return { ...s, error: '请选择拓扑内目的地址与协议，载荷须为 1–32 个 UTF-8 字节。' }
    }
  }
  if (a.type === 'again')
    return { ...initialLayers(s.destination, s.protocol, s.port, s.ttl, s.payload, s.open), arp: [...s.arp] }
  if (s.error) return s
  if (a.type === 'step') return layerStep(s)
  if (a.type === 'run') {
    for (let i = 0; i < 16 && !['done', 'failed'].includes(s.stage); i++) s = layerStep(s)
    return s
  }
  return s
}
export function presentLayers(s: LayerState): ExperimentView {
  const done = ['done', 'failed'].includes(s.stage),
    remoteDelivered =
      s.stage === 'done' &&
      s.frames.length === 2 &&
      s.frames[0]!.dstIp === s.frames[1]!.dstIp &&
      s.frames[0]!.dstMac !== s.frames[1]!.dstMac
  return {
    scene: {
      kind: 'data',
      title: 'A ─ Ethernet ─ 路由器 R ─ Ethernet ─ C',
      cards: [
        { id: 'local', label: '左侧 /24 网络', value: '192.0.2.0/24', detail: 'A=.10，B=.20，R.eth0=.1' },
        { id: 'remote', label: '右侧 /24 网络', value: '198.51.100.0/24', detail: 'R.eth1=.1，C=.20' },
        {
          id: 'socket',
          label: '目标 Socket 接收区',
          value: s.received ?? '尚未交付',
          detail: `${s.protocol.toUpperCase()} 9000 ${s.open ? '可用' : '关闭'}`,
        },
      ],
      sequence: [
        { label: '应用', value: s.payload },
        { label: '传输', value: `${s.protocol.toUpperCase()} 50000 → ${s.port}` },
        { label: '网络', value: `${sourceIp} → ${s.destination}` },
        { label: '链路', value: '逐跳 MAC 封装' },
      ],
      tables: [
        {
          id: 'network-frames',
          title: '实际发送的逐跳数据帧',
          nowrapColumns: [1, 2, 3, 4],
          columns: ['链路', '源 MAC', '目的 MAC', '源 IP', '目的 IP', 'TTL', '载荷字节'],
          rows: s.frames.map((frame, i) => ({
            id: String(i),
            values: [frame.hop, frame.srcMac, frame.dstMac, frame.srcIp, frame.dstIp, frame.ttl, frame.bytes],
          })),
        },
        {
          id: 'network-arp',
          title: '每条本地链路的 ARP 缓存',
          columns: ['接口', '下一跳 IP', 'MAC'],
          rows: s.arp.map((entry) => ({
            id: `${entry.interface}-${entry.ip}`,
            values: [entry.interface, entry.ip, entry.mac],
          })),
        },
      ],
      caption:
        '使用文档专用 IP 网段，不发送真实网络请求。一个路由器、两个 Ethernet 网段；无 NAT、分片、校验和、路由协议或 ARP 老化。TCP 载荷假定连接已建立，握手与重传另见 TCP 课程。',
    },
    metrics: [
      { label: '处理阶段', value: s.stage },
      { label: 'ARP 广播次数', value: s.arpRequests },
      { label: '已发送数据帧', value: s.frames.length },
      { label: '当前 IP TTL', value: s.remainingTtl },
      { label: '应用收到的载荷', value: s.received ?? '—' },
    ],
    controls: [
      { id: 'destination', kind: 'select', label: '目的主机', value: s.destination, options: destinations },
      {
        id: 'protocol',
        kind: 'select',
        label: '传输层协议',
        value: s.protocol,
        options: [
          { value: 'udp', label: 'UDP 数据报' },
          { value: 'tcp', label: 'TCP 已建立连接的载荷' },
        ],
      },
      { id: 'port', kind: 'number', label: '目的端口', value: s.port, min: 1, max: 65535 },
      { id: 'ttl', kind: 'number', label: '初始 IP TTL', value: s.ttl, min: 1, max: 8 },
      { id: 'payload', kind: 'text', label: '应用载荷', value: s.payload },
      {
        id: 'open',
        kind: 'select',
        label: '服务端 9000 Socket',
        value: s.open ? 'yes' : 'no',
        options: [
          { value: 'yes', label: '可用' },
          { value: 'no', label: '关闭' },
        ],
      },
      {
        id: 'step',
        kind: 'button',
        label: '推进一个分层处理步骤',
        primary: true,
        disabled: done || !!s.error,
      },
      { id: 'run', kind: 'button', label: '运行到交付或失败', disabled: done || !!s.error },
      { id: 'again', kind: 'button', label: '保留 ARP 缓存重新发送' },
    ],
    status: {
      title: s.error
        ? '在具体层级定位失败'
        : s.stage === 'done'
          ? '载荷到达对应 Socket'
          : '下一跳地址与最终目的地址各有用途',
      detail: s.error ?? s.log.at(-1)?.detail ?? '向跨网段的 C 发送数据，逐跳检查 ARP、MAC、IP、TTL 与端口。',
      tone: s.error ? 'warning' : s.stage === 'done' ? 'success' : 'neutral',
    },
    goal: {
      label: '将载荷跨路由交付给 C，观察两帧的 MAC 改变、IP 保持和 TTL 递减。',
      reached: remoteDelivered && !s.error,
    },
    log: s.log,
  }
}
export const layersEngine: EngineFactory = (config) =>
  createSession(
    () =>
      initialLayers(
        String(config.destination ?? destinations[0]!.value),
        (config.protocol ?? 'udp') as LayerState['protocol'],
        Number(config.port ?? 9000),
        Number(config.ttl ?? 3),
        String(config.payload ?? 'hello'),
        config.open === undefined ? true : (config.open as boolean),
      ),
    layerTransition,
    presentLayers,
  )
