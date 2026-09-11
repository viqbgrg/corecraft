import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'tls',
  slug: 'tls',
  title: '协商出了密钥，就能相信对方吗',
  englishTitle: 'TLS Identity and Key Establishment',
  level: 4,
  category: '网络安全',
  duration: 24,
  description: '计算玩具 DH 共享值，检查证书、握手绑定与 Finished，观察认证失败如何阻止应用交付。',
  question: '双方算出相同共享值，证书名称不匹配时为什么仍要停止？',
  objectives: [
    '分开密钥协商与服务器身份认证',
    '检查信任、主机名与有效期',
    '说明握手记录完整性和密钥确认的作用',
  ],
  prerequisites: ['network-layers', 'http'],
  nextConcepts: ['tcp', 'http'],
  concepts: [
    {
      id: 'tls',
      title: 'TLS 安全通道',
      content: 'TLS 将密钥建立、对端认证和记录保护组合起来；成功握手后使用协商密钥保护应用数据。',
      why: '网络可达不能证明通信对端身份，也不能保证传输内容未被观察或改动。',
      relatedConcepts: ['certificate', 'key-exchange', 'http'],
    },
    {
      id: 'certificate',
      title: '证书与身份校验',
      content: '验证证书链、信任根、名称和有效期等条件，把公钥与预期身份关联起来。',
      why: '仅凭一个公钥或相同共享值，无法排除连接到了错误的主体。',
      relatedConcepts: ['tls', 'key-exchange'],
    },
    {
      id: 'key-exchange',
      title: '密钥建立与握手确认',
      content:
        'DH 类交换让双方从私有值与公开交换量导出共享秘密；签名和 Finished 将协商过程绑定到身份与握手记录。',
      why: '密钥必须与经过认证、未被改动的协商过程关联，才能安全用于后续数据。',
      relatedConcepts: ['certificate', 'tls'],
    },
  ],
  experiments: [
    {
      id: 'tls-handshake-model',
      type: 'tls',
      title: '身份与共享值实验',
      description: '修改私有指数、证书情形、验证时间与握手改动，逐步检查交付条件。',
      question: '改动服务器的公开交换量，会在哪一项认证中被拒绝？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '双方算出相同共享值，但服务器证书的名称不是你要访问的主机，应当怎样做？',
    options: [
      { id: 'a', text: '继续发送；共享值相同已证明服务器身份。' },
      { id: 'b', text: '拒绝应用数据交付；密钥协商成功不能替代预期主机名的身份验证。' },
      { id: 'c', text: '只需把地址栏名称改成证书声明的名称。' },
    ],
    answer: 'b',
    explanation:
      '密钥协商说明双方能得到一致秘密，不能说明对方就是目标服务。身份验证必须针对原本预期的主机名与受信任的认证链。',
    hint: '把证书改成“证书名称不匹配”，即使两个共享值仍为 2，应用数据也不能交付。',
  },
} satisfies Course
