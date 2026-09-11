import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'rabbitmq-delivery',
  slug: 'rabbitmq-delivery',
  title: 'RabbitMQ 路由、确认与去重',
  englishTitle: 'RabbitMQ Routing and Acknowledgments',
  level: 15,
  category: '消息队列',
  duration: 28,
  description: '路由消息到多个队列，观察 prefetch、unacked 重投、inbox 去重、mandatory return 与死信。',
  question: 'Publisher confirm 已收到，为什么仍不能证明消费者处理完成？',
  objectives: [
    'Exchange 按类型和 binding 路由，匹配队列各接收副本，消费进度由队列维护。',
    'confirm 面向生产者，ack 面向消费投递；断连重投要求应用按业务身份去重。',
  ],
  prerequisites: ['kafka-delivery', 'spring-transactions'],
  nextConcepts: ['redis-topology'],
  concepts: [
    {
      id: 'rabbit-exchange',
      title: 'Exchange 与 Queue 的绑定',
      content: 'Exchange 按类型和 binding 路由，匹配队列各接收副本，消费进度由队列维护。',
      why: '路由成功与最终业务成功不是同一状态。',
      relatedConcepts: ['kafka-delivery'],
    },
    {
      id: 'rabbit-ack',
      title: '发布确认与消费确认',
      content: 'confirm 面向生产者，ack 面向消费投递；断连重投要求应用按业务身份去重。',
      why: '网络间隙不能靠两个独立确认自动消除。',
      relatedConcepts: ['spring-transactions'],
    },
  ],
  experiments: [
    {
      id: 'rabbitmq-delivery-lab',
      type: 'rabbitmq-delivery',
      title: 'RabbitMQ 路由、确认与去重',
      description: '路由消息到多个队列，观察 prefetch、unacked 重投、inbox 去重、mandatory return 与死信。',
      question: 'Publisher confirm 已收到，为什么仍不能证明消费者处理完成？',
      config: {},
    },
  ],
  challenge: {
    question: 'mandatory 发布没有匹配队列，却随后收到 publisher confirm，合理解释是什么？',
    options: [
      {
        id: 'a',
        text: 'confirm 保证消息已经被某个消费者成功处理。',
      },
      {
        id: 'b',
        text: 'Broker 已处理该发布；不可路由由 basic.return 报告，confirm 不等于路由或消费成功。',
      },
      {
        id: 'c',
        text: '任何 confirm 都会自动创建一个新队列。',
      },
    ],
    answer: 'b',
    explanation:
      '发布确认、mandatory 返回和消费确认承担不同职责。生产者需要按协议分别处理返回与确认，不能只检查 confirm 就宣称业务完成。',
    hint: '观察 routes、returned、confirmed 三列。',
  },
  content,
} satisfies Course
