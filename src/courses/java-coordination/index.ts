import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'java-coordination',
  slug: 'java-coordination',
  title: '完成门闩与资源许可',
  englishTitle: 'CountDownLatch and Semaphore',
  level: 10,
  category: 'Java 并发',
  duration: 28,
  description: '等待三份结果发布，再用两个可复用许可调度三项资源任务，试验过量释放。',
  question: 'countDown 与 release 都改变计数，为什么不能互换？',
  objectives: [
    'Latch 计数归零后 await 可以返回，同一实例不会再次关门。',
    'Semaphore.acquire 消耗许可，release 补充许可；资源容量由调用协议维护。',
  ],
  prerequisites: ['java-locks'],
  nextConcepts: ['java-executors'],
  concepts: [
    {
      id: 'countdown-latch',
      title: '一次性完成门闩',
      content: 'Latch 计数归零后 await 可以返回，同一实例不会再次关门。',
      why: '完成信号与任务结果需要按正确顺序发布。',
      relatedConcepts: ['java-memory-model'],
    },
    {
      id: 'semaphore',
      title: '可复用资源许可',
      content: 'Semaphore.acquire 消耗许可，release 补充许可；资源容量由调用协议维护。',
      why: '许可没有锁所有权，过量 release 可能超售资源。',
      relatedConcepts: ['java-locks'],
    },
  ],
  experiments: [
    {
      id: 'java-coordination-lab',
      type: 'java-coordination',
      title: '完成门闩与资源许可',
      description: '等待三份结果发布，再用两个可复用许可调度三项资源任务，试验过量释放。',
      question: 'countDown 与 release 都改变计数，为什么不能互换？',
      config: {},
    },
  ],
  challenge: {
    question: '初始两个许可的 Semaphore，被无配对地 release 一次后，会怎样？',
    options: [
      {
        id: 'a',
        text: '它一定抛出非 owner 释放异常。',
      },
      {
        id: 'b',
        text: '可用许可可能变为 3，Semaphore 不自动知道外部资源只有两个。',
      },
      {
        id: 'c',
        text: '第三次 acquire 永远无法返回。',
      },
    ],
    answer: 'b',
    explanation:
      'Semaphore 不要求由获得许可的线程释放，也不自动限制为构造时许可数。任务包装器必须配对成功 acquire 与 finally release。',
    hint: '比较 active + available 与外部容量 2。',
  },
  content,
} satisfies Course
