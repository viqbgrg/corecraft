import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'distributed-transactions',
  slug: 'distributed-transactions',
  title: '两阶段提交与 Saga 补偿',
  englishTitle: 'Two-phase Commit and Sagas',
  level: 16,
  category: '分布式系统',
  duration: 28,
  description: '持久记录跨资源决定，观察 prepared 超时等待，再比较 Saga 的中间状态与补偿重试。',
  question: '协调者失联时，prepared 参与者能否自行宣布提交？',
  objectives: [
    '参与者准备并保留资源，协调者在全体 YES 后持久提交决定，再重试通知。',
    '多个本地事务暴露中间状态，失败后执行明确的幂等补偿，补偿也可能需要重试。',
  ],
  prerequisites: ['spring-transactions', 'raft-consensus'],
  nextConcepts: ['service-resilience'],
  concepts: [
    {
      id: 'distributed-2pc',
      title: '2PC 的准备与持久决定',
      content: '参与者准备并保留资源，协调者在全体 YES 后持久提交决定，再重试通知。',
      why: '失联不等于可以猜测全局决定。',
      relatedConcepts: ['wal', 'raft-consensus'],
    },
    {
      id: 'distributed-saga',
      title: 'Saga 与业务补偿',
      content: '多个本地事务暴露中间状态，失败后执行明确的幂等补偿，补偿也可能需要重试。',
      why: '业务副作用通常不能自动整体回滚。',
      relatedConcepts: ['spring-transactions', 'rabbitmq-delivery'],
    },
  ],
  experiments: [
    {
      id: 'distributed-transactions-lab',
      type: 'distributed-transactions',
      title: '两阶段提交与 Saga 补偿',
      description: '持久记录跨资源决定，观察 prepared 超时等待，再比较 Saga 的中间状态与补偿重试。',
      question: '协调者失联时，prepared 参与者能否自行宣布提交？',
      config: {},
    },
  ],
  challenge: {
    question: '2PC 参与者已 prepared，但协调者超时不可达，安全理解是什么？',
    options: [
      {
        id: 'a',
        text: '只要等足够久，就能自行决定 COMMIT。',
      },
      {
        id: 'b',
        text: '它可能处于不确定状态，需要可靠的全局决定或恢复协议；单凭失联不能推出提交或回滚。',
      },
      {
        id: 'c',
        text: 'prepared 已经等于所有资源都完成提交。',
      },
    ],
    answer: 'b',
    explanation:
      '全局 COMMIT 可能已经持久化，也可能尚未发生。准备参与者若独立猜测，会与其他参与者执行的可靠决定冲突。',
    hint: '在协调者持久 COMMIT 后、发通知前停止它。',
  },
  content,
} satisfies Course
