import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'java-locks',
  slug: 'java-locks',
  title: '可重入锁与条件等待',
  englishTitle: 'Monitors, AQS and Conditions',
  level: 10,
  category: 'Java 并发',
  duration: 28,
  description: '分开观察锁所有权、同步队列和条件集合，验证重入计数、通知与谓词重检。',
  question: 'signal 后，等待线程为什么还不能立即进入临界区？',
  objectives: [
    'AQS 用状态和等待队列支持同步器；ReentrantLock 用它表达独占持有与重入。',
    '同一 owner 可以重复获取，只有持有计数归零才完全释放。',
    'await 释放全部持有，signal 只转移等待位置；返回前重新获取锁并检查谓词。',
  ],
  prerequisites: ['java-atomics'],
  nextConcepts: ['java-coordination', 'java-executors'],
  concepts: [
    {
      id: 'aqs',
      title: 'AQS 的状态与同步队列',
      content: 'AQS 用状态和等待队列支持同步器；ReentrantLock 用它表达独占持有与重入。',
      why: '同步状态改变和获得运行机会需要区分。',
      relatedConcepts: ['cas', 'reentrant-lock'],
    },
    {
      id: 'reentrant-lock',
      title: '可重入独占锁',
      content: '同一 owner 可以重复获取，只有持有计数归零才完全释放。',
      why: '嵌套调用需要保持互斥与正确配对。',
      relatedConcepts: ['java-thread'],
    },
    {
      id: 'condition',
      title: 'Condition 与监视器等待',
      content: 'await 释放全部持有，signal 只转移等待位置；返回前重新获取锁并检查谓词。',
      why: '唤醒不等于资源一定可用。',
      relatedConcepts: ['java-coordination'],
    },
  ],
  experiments: [
    {
      id: 'java-locks-lab',
      type: 'java-locks',
      title: '可重入锁与条件等待',
      description: '分开观察锁所有权、同步队列和条件集合，验证重入计数、通知与谓词重检。',
      question: 'signal 后，等待线程为什么还不能立即进入临界区？',
      config: {},
    },
  ],
  challenge: {
    question: 'T2 持锁执行 signal 唤醒 T1 后，正确的后续是什么？',
    options: [
      {
        id: 'a',
        text: 'T1 立刻成为 owner，T2 自动退出。',
      },
      {
        id: 'b',
        text: 'T1 等待重新获取锁；T2 仍需解锁，T1 返回后必须检查条件谓词。',
      },
      {
        id: 'c',
        text: 'signal 为所有未来 await 储存一个许可。',
      },
    ],
    answer: 'b',
    explanation:
      '通知改变等待位置，不替通知者 unlock。重入等待保存并恢复持有计数；竞争、其他消费者和伪唤醒都要求 while 检查。',
    hint: '观察条件集合变空时，owner 是否同时变化。',
  },
  content,
} satisfies Course
