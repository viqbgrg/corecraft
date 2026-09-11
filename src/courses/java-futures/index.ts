import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'java-futures',
  slug: 'java-futures',
  title: '工作窃取与异步依赖',
  englishTitle: 'ForkJoin and CompletableFuture',
  level: 10,
  category: 'Java 并发',
  duration: 32,
  description: '分解真实求和任务，窃取分支并归并结果，比较 Future 正常、失败、恢复与取消。',
  question: 'Future 描述依赖，是否意味着每个阶段都创建一个线程？',
  objectives: [
    '任务按区间拆分，owner 取最新工作，空闲 worker 可窃取最旧分支并归并真实结果。',
    '正常回调依赖成功值；异常传播或恢复后决定组合结果，Async 通过执行器调度。',
  ],
  prerequisites: ['java-executors', 'java-classes'],
  nextConcepts: ['java-io-apis'],
  concepts: [
    {
      id: 'fork-join',
      title: 'ForkJoin 的分解与工作窃取',
      content: '任务按区间拆分，owner 取最新工作，空闲 worker 可窃取最旧分支并归并真实结果。',
      why: '负载分配应保留计算依赖。',
      relatedConcepts: ['stack-queue', 'java-executors'],
    },
    {
      id: 'completable-future',
      title: 'Future 组合与异常传播',
      content: '正常回调依赖成功值；异常传播或恢复后决定组合结果，Async 通过执行器调度。',
      why: '完成状态、执行上下文与取消需要分别观察。',
      relatedConcepts: ['java-classes', 'java-executors'],
    },
  ],
  experiments: [
    {
      id: 'java-futures-lab',
      type: 'java-futures',
      title: '工作窃取与异步依赖',
      description: '分解真实求和任务，窃取分支并归并结果，比较 Future 正常、失败、恢复与取消。',
      question: 'Future 描述依赖，是否意味着每个阶段都创建一个线程？',
      config: {},
    },
  ],
  challenge: {
    question: '对组合 CompletableFuture 调用 cancel(true)，可以据此保证什么？',
    options: [
      {
        id: 'a',
        text: '所有底层 ForkJoin 任务立刻被强行停止。',
      },
      {
        id: 'b',
        text: '这个 future 进入取消状态；不能据此保证产生结果的底层工作被中断。',
      },
      {
        id: 'c',
        text: '已经完成的外部写入也会自动回滚。',
      },
    ],
    answer: 'b',
    explanation:
      'CompletableFuture 的取消是一种异常完成，mayInterruptIfRunning 不用于控制底层任务中断。取消结果与资源回收需要应用协议配合。',
    hint: '取消后继续运行 worker，观察求和叶任务是否仍完成。',
  },
  content,
} satisfies Course
