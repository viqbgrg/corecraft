import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'java-executors',
  slug: 'java-executors',
  title: '线程池接纳与背压',
  englishTitle: 'Thread Pools, Queues and Backpressure',
  level: 10,
  category: 'Java 并发',
  duration: 28,
  description: '突发提交任务，检查核心线程、队列、非核心线程、拒绝策略与关闭时的任务去向。',
  question: 'maximumPoolSize=3，为什么第三个任务先排队？',
  objectives: [
    'ThreadPoolExecutor 先创建核心 worker，再尝试队列，再扩展到上限，最后调用拒绝策略。',
    'execute 使用 offer；有界队列满时可以拒绝或让 caller 执行，不能无限隐藏过载。',
    'shutdown 排空已接纳工作；shutdownNow 返回未开始任务并请求中断正在运行的 worker。',
  ],
  prerequisites: ['java-coordination'],
  nextConcepts: ['java-futures'],
  concepts: [
    {
      id: 'thread-pool',
      title: '线程池的分阶段接纳',
      content: 'ThreadPoolExecutor 先创建核心 worker，再尝试队列，再扩展到上限，最后调用拒绝策略。',
      why: '参数需要与队列及负载一起理解。',
      relatedConcepts: ['java-thread'],
    },
    {
      id: 'blocking-queue',
      title: '有界队列与提交端背压',
      content: 'execute 使用 offer；有界队列满时可以拒绝或让 caller 执行，不能无限隐藏过载。',
      why: '排队消耗容量并增加等待时间。',
      relatedConcepts: ['java-coordination'],
    },
    {
      id: 'pool-shutdown',
      title: '关闭与协作中断',
      content: 'shutdown 排空已接纳工作；shutdownNow 返回未开始任务并请求中断正在运行的 worker。',
      why: '调用关闭不意味着全部工作立即停止。',
      relatedConcepts: ['java-atomics'],
    },
  ],
  experiments: [
    {
      id: 'java-executors-lab',
      type: 'java-executors',
      title: '线程池接纳与背压',
      description: '突发提交任务，检查核心线程、队列、非核心线程、拒绝策略与关闭时的任务去向。',
      question: 'maximumPoolSize=3，为什么第三个任务先排队？',
      config: {},
    },
  ],
  challenge: {
    question: 'core=2、max=3、queue=2，六个长任务连续到达且没有任务完成，哪些最先运行？',
    options: [
      {
        id: 'a',
        text: '任务 1、2、3，因为总是先填满 max。',
      },
      {
        id: 'b',
        text: '任务 1、2、5；3、4 排队，6 触发拒绝策略。',
      },
      {
        id: 'c',
        text: '只有 1、2；第 5 次 execute 永远阻塞在 put。',
      },
    ],
    answer: 'b',
    explanation:
      '核心数满足后先 offer 队列，队列满才创建非核心 worker 运行当前任务。因此后提交的第 5 个任务可早于队列里的 3、4。',
    hint: '记录各任务实际开始时点，不只看提交顺序。',
  },
  content,
} satisfies Course
