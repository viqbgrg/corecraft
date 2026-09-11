import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'service-resilience',
  slug: 'service-resilience',
  title: '发现、重试与服务韧性',
  englishTitle: 'Discovery, Retries and Resilience',
  level: 16,
  category: '分布式系统',
  duration: 32,
  description: '更新发现快照并调度突发请求，跟踪超时后迟到的执行、退避、熔断、令牌桶与幂等。',
  question: '客户端已经超时，为什么下游还会产生业务效果？',
  objectives: [
    '注册 TTL、客户端快照和实例实时可达性分别变化，均衡只能从已知候选中选择。',
    '超时结束等待，不自动取消下游执行；重试需要总预算、退避和稳定幂等键。',
    '熔断减少持续失败的尝试，半开探针验证恢复；令牌桶限制入口速率与突发。',
  ],
  prerequisites: ['distributed-consistency', 'kafka-delivery'],
  nextConcepts: ['distributed-locks'],
  concepts: [
    {
      id: 'service-discovery',
      title: '服务发现与负载均衡',
      content: '注册 TTL、客户端快照和实例实时可达性分别变化，均衡只能从已知候选中选择。',
      why: '缓存中的地址不证明服务仍健康。',
      relatedConcepts: ['dns'],
    },
    {
      id: 'bounded-retry',
      title: '超时、重试和幂等',
      content: '超时结束等待，不自动取消下游执行；重试需要总预算、退避和稳定幂等键。',
      why: '失败恢复不能无限放大工作量。',
      relatedConcepts: ['rabbitmq-delivery'],
    },
    {
      id: 'circuit-rate-limit',
      title: '熔断与限流',
      content: '熔断减少持续失败的尝试，半开探针验证恢复；令牌桶限制入口速率与突发。',
      why: '两种机制控制不同来源的压力。',
      relatedConcepts: ['java-executors'],
    },
  ],
  experiments: [
    {
      id: 'service-resilience-lab',
      type: 'service-resilience',
      title: '发现、重试与服务韧性',
      description: '更新发现快照并调度突发请求，跟踪超时后迟到的执行、退避、熔断、令牌桶与幂等。',
      question: '客户端已经超时，为什么下游还会产生业务效果？',
      config: {},
    },
  ],
  challenge: {
    question: '请求超时后立即重试，为什么还可能重复扣款？',
    options: [
      {
        id: 'a',
        text: '超时意味着服务器一定没执行，所以不会重复。',
      },
      {
        id: 'b',
        text: '超时只结束客户端等待，旧工作可能稍后完成；重试需复用幂等身份并限制预算。',
      },
      {
        id: 'c',
        text: '熔断器会自动撤销所有迟到写入。',
      },
    ],
    answer: 'b',
    explanation:
      '网络或调度延迟让客户端状态和服务执行状态分离。幂等需要覆盖真实业务效果，重试预算和退避限制额外流量，均不能靠超时异常自动获得。',
    hint: '查看 attempt 超时后 workDone 的变化。',
  },
  content,
} satisfies Course
