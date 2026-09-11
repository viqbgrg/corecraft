import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'backend-consistency',
  slug: 'backend-consistency',
  title: '缓存、Outbox 与微服务一致性',
  englishTitle: 'Caches, Outbox and Service Consistency',
  level: 17,
  category: '高级 Java 后端',
  duration: 34,
  description: '复现旧缓存回填和数据库/MQ 双写间隙，使用事务 outbox、relay 租约和 inbox 恢复重复投递。',
  question: '已经更新 DB 并删缓存，为什么过时数据还会回来？',
  objectives: [
    '更新后的失效不能阻止已开始的旧读回填，需要版本约束或其他明确的一致性协议。',
    '本地事务保存业务变更和消息意图，relay 重试发布，消费事务按事件身份去重。',
    '服务各自保存数据，租约可协调 relay 接管，但发布与标记仍是独立步骤。',
  ],
  prerequisites: ['distributed-transactions', 'distributed-locks', 'rabbitmq-delivery', 'redis-topology'],
  nextConcepts: ['backend-observability'],
  concepts: [
    {
      id: 'cache-refill-race',
      title: '分布式缓存的旧读回填',
      content: '更新后的失效不能阻止已开始的旧读回填，需要版本约束或其他明确的一致性协议。',
      why: '正确顺序仍需考虑并发交错。',
      relatedConcepts: ['redis-expiration', 'distributed-consistency'],
    },
    {
      id: 'transactional-outbox',
      title: '事务 Outbox 与 Inbox',
      content: '本地事务保存业务变更和消息意图，relay 重试发布，消费事务按事件身份去重。',
      why: '跨 DB/MQ 的可靠推进不等于它们成为一个 ACID 事务。',
      relatedConcepts: ['distributed-transactions', 'rabbitmq-delivery'],
    },
    {
      id: 'microservice-boundary',
      title: '微服务数据与锁的边界',
      content: '服务各自保存数据，租约可协调 relay 接管，但发布与标记仍是独立步骤。',
      why: '分布式锁不能自动创造跨资源原子性。',
      relatedConcepts: ['distributed-locks'],
    },
  ],
  experiments: [
    {
      id: 'backend-consistency-lab',
      type: 'backend-consistency',
      title: '缓存、Outbox 与微服务一致性',
      description: '复现旧缓存回填和数据库/MQ 双写间隙，使用事务 outbox、relay 租约和 inbox 恢复重复投递。',
      question: '已经更新 DB 并删缓存，为什么过时数据还会回来？',
      config: {},
    },
  ],
  challenge: {
    question: 'relay 已把 outbox 事件发布到 MQ，却在标记数据库前停止，正确恢复设计是什么？',
    options: [
      {
        id: 'a',
        text: '不能重试，否则一定破坏整个系统。',
      },
      {
        id: 'b',
        text: '允许重复发布，消费者用稳定事件 id 和本地事务 inbox 去重；租约本身不消除这个间隙。',
      },
      {
        id: 'c',
        text: '分布式锁会自动撤回队列里已接纳的消息。',
      },
    ],
    answer: 'b',
    explanation:
      '数据库标记与 MQ 接纳不在同一个本地事务。Outbox 保留重试意图，Inbox 将去重和业务效果原子处理；锁只能减少同时执行者，不能代替跨资源协议。',
    hint: '观察重启接管后相同事件 id 的两个队列副本。',
  },
  content,
} satisfies Course
