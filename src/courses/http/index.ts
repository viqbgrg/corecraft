import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'http',
  slug: 'http',
  title: 'HTTP 请求的一生',
  englishTitle: 'From URL to Response',
  level: 4,
  category: '网络与协议',
  duration: 16,
  description: '把 DNS、TCP、TLS 和 HTTP 串起来，跟踪一次完整请求。',
  question: '在地址栏按下回车后，为什么还没发 HTTP 就可能失败？',
  objectives: [
    '区分地址解析、连接、安全与应用层',
    '观察失败在哪一层阻止后续执行',
    '比较新连接和 Keep-Alive 的耗时',
  ],
  prerequisites: ['dns', 'tcp'],
  nextConcepts: ['socket', 'reactor'],
  concepts: [
    {
      id: 'http',
      title: 'HTTP 请求与响应',
      content: 'HTTP 定义方法、目标、头部、状态码与消息体。本实验使用 HTTP/1.1。',
      why: '网络传输只负责送达字节，应用还需要共同理解请求与响应的语义。',
      relatedConcepts: ['tcp', 'dns', 'tls'],
    },
    {
      id: 'tls',
      title: 'TLS',
      content: '为应用字节流提供认证、机密性和完整性。HTTPS 是在 TLS 保护下传输 HTTP。',
      why: '建立了 TCP 连接，不代表对端身份可信，也不代表途中无人能读取内容。',
      relatedConcepts: ['http', 'tcp'],
    },
  ],
  challenge: {
    question: 'Browser 收到了 HTTP 500。下面哪个判断有依据？',
    options: [
      {
        id: 'a',
        text: 'TCP 握手没有成功。',
      },
      {
        id: 'b',
        text: 'DNS 一定无法解析。',
      },
      {
        id: 'c',
        text: '请求已经到达应用并收到了 HTTP 错误响应，传输可以是成功的。',
      },
    ],
    answer: 'c',
    explanation:
      '500 是 HTTP 应用层状态。DNS、TCP 或 TLS 失败时，本模型不会到达 HTTP 响应阶段，也不会凭空产生 HTTP 500。',
    hint: '分别选择“TCP 连接超时”和“Server 返回 500”，比较流程停在哪一步。',
  },
  experiments: [
    {
      id: 'http-lifecycle-lab',
      type: 'http',
      title: '请求生命周期实验台',
      description: '逐层推进，用故障和连接复用解释等待时间。',
      question: 'HTTP 500 是否代表 TCP 连接失败？',
      config: {},
    },
  ],
  content,
} satisfies Course
