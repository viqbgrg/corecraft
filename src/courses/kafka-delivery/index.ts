import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'kafka-delivery',
  slug: 'kafka-delivery',
  title: 'Kafka 日志与投递语义',
  englishTitle: 'Kafka Logs and Delivery Semantics',
  level: 15,
  category: '消息队列',
  duration: 32,
  description: '写入分区日志并操控消费 offset，在崩溃与重试中比较重复、丢失和事务输出。',
  question: 'Producer 幂等，为什么消费者仍可能重复扣款？',
  objectives: [
    '记录按分区 offset 排序，同组每个分区有一个当前拥有者，不同分区没有统一全序。',
    '处理后提交允许崩溃重投，先提交再处理允许处理前故障导致丢失。',
    '幂等生产去重重试追加，Kafka 事务可原子提交输出与 offset，但不覆盖任意外部副作用。',
  ],
  prerequisites: ['wal', 'spring-transactions'],
  nextConcepts: ['rabbitmq-delivery'],
  concepts: [
    {
      id: 'kafka-log',
      title: 'Topic、Partition 与消费组',
      content: '记录按分区 offset 排序，同组每个分区有一个当前拥有者，不同分区没有统一全序。',
      why: '并行度与顺序约束由分区决定。',
      relatedConcepts: ['hash-table', 'java-executors'],
    },
    {
      id: 'message-delivery',
      title: '至少一次与至多一次',
      content: '处理后提交允许崩溃重投，先提交再处理允许处理前故障导致丢失。',
      why: '记录进度的时点影响失败后从哪里继续。',
      relatedConcepts: ['wal'],
    },
    {
      id: 'kafka-exactly-once',
      title: 'Kafka 事务的作用域',
      content: '幂等生产去重重试追加，Kafka 事务可原子提交输出与 offset，但不覆盖任意外部副作用。',
      why: 'Exactly-once 必须说明在哪个系统和读取协议下成立。',
      relatedConcepts: ['spring-transactions'],
    },
  ],
  experiments: [
    {
      id: 'kafka-delivery-lab',
      type: 'kafka-delivery',
      title: 'Kafka 日志与投递语义',
      description: '写入分区日志并操控消费 offset，在崩溃与重试中比较重复、丢失和事务输出。',
      question: 'Producer 幂等，为什么消费者仍可能重复扣款？',
      config: {},
    },
  ],
  challenge: {
    question: 'Kafka 事务把输出和消费 offset 一起提交，是否自动保证外部数据库扣款只发生一次？',
    options: [
      {
        id: 'a',
        text: '保证，任何副作用都会参与 Kafka 事务。',
      },
      {
        id: 'b',
        text: '不保证；外部数据库不在该事务范围，需要自己的事务、去重或协调协议。',
      },
      {
        id: 'c',
        text: '只要 Producer 开启幂等，就不需要处理消费者重试。',
      },
    ],
    answer: 'b',
    explanation:
      '幂等 Producer 解决同一会话分区序列的重复追加，Kafka 事务解决 Kafka 内部原子可见性。外部资源必须有明确的幂等或事务方案。',
    hint: '在事务处理后、提交前崩溃，比较输出 Topic 和外部效果计数。',
  },
  content,
} satisfies Course
