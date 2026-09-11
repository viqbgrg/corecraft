import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'network-layers',
  slug: 'network-layers',
  title: '跨过路由器，哪些地址会改变',
  englishTitle: 'Network Layers, ARP and Sockets',
  level: 4,
  category: '网络基础',
  duration: 24,
  description: '沿两个网段逐跳发送载荷，计算下一跳、解析 ARP、改写链路头并分用到 Socket。',
  question: '发给远方主机的包，为什么先写上网关的 MAC 地址？',
  objectives: [
    '将封装与 OSI / TCP-IP 分层对应',
    '根据子网计算直连目标或网关',
    '区分 IP 路由、UDP / TCP 端口与 Socket 分用',
  ],
  prerequisites: ['binary', 'encoding'],
  nextConcepts: ['tcp', 'dns', 'tls'],
  concepts: [
    {
      id: 'network-layers',
      title: 'OSI 与 TCP/IP 分层',
      content:
        'OSI 用七层描述通信职责；TCP/IP 常按应用、传输、网际、链路组织协议，封装使每层处理自己的标识。',
      why: '把主机寻址、端点分用与应用消息分开，才能定位失败发生在哪一层。',
      relatedConcepts: ['ip-routing', 'socket', 'http'],
    },
    {
      id: 'ethernet-arp',
      title: 'Ethernet 与 ARP',
      content: 'Ethernet 在本地链路使用 MAC；IPv4 的 ARP 解析同链路下一跳 IP 对应的 MAC。',
      why: '跨网段传输仍须先把帧交到本地网关，不能在本地广播询问远方主机。',
      relatedConcepts: ['ip-routing', 'network-layers'],
    },
    {
      id: 'ip-routing',
      title: 'IP 与下一跳',
      content: '主机与路由器按网络前缀选择出口和下一跳；转发递减 TTL，并在下一条链路重新封装。',
      why: '用分段转发连接多个网络，同时限制包在环路中无限存活。',
      relatedConcepts: ['ethernet-arp', 'tcp'],
    },
    {
      id: 'udp',
      title: 'UDP 数据报',
      content: 'UDP 使用端口分用独立数据报，不自行提供可靠重传、顺序交付或拥塞控制。',
      why: '某些应用需要自己定义时效、重试与消息处理规则。',
      relatedConcepts: ['socket', 'tcp'],
    },
    {
      id: 'socket',
      title: 'Socket 端点',
      content: '操作系统提供的通信端点抽象，结合协议、本地地址与端口，连接还可包含对端信息。',
      why: '到达一台主机的数据需要进一步交给正确的应用端点。',
      relatedConcepts: ['udp', 'tcp', 'io-multiplexing'],
    },
  ],
  experiments: [
    {
      id: 'layered-delivery',
      type: 'network-layers',
      title: '逐跳数据交付',
      description: '修改目的地址、端口、TTL 与协议，定位 ARP、路由和端点错误。',
      question: 'IP 地址不变，为什么每条链路的源和目的 MAC 都不同？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: 'A 发包给不同 /24 网段的 C，默认路由指向 R。A 应通过 ARP 解析哪个地址？',
    options: [
      { id: 'a', text: 'C 的 IP；ARP 广播会自动穿过所有路由器。' },
      { id: 'b', text: '本地网关 R 的 IP；IP 包目的仍然是 C。' },
      { id: 'c', text: 'C 的端口号；MAC 与端口是一种地址。' },
    ],
    answer: 'b',
    explanation:
      'ARP 只在本链路解析下一跳。A 的 Ethernet 帧先交给 R，但 IP 头保留 C 为最终目的；R 再为下一条链路重新封装。',
    hint: '观察默认跨网段流程的第一条 ARP 缓存与第一个 Ethernet 数据帧。',
  },
} satisfies Course
