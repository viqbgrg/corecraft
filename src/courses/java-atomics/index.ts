import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'java-atomics',
  slug: 'java-atomics',
  title: '线程、自增与 CAS',
  englishTitle: 'Java Threads, Volatile and CAS',
  level: 10,
  category: 'Java 并发',
  duration: 28,
  description: '交错执行两个线程的自增，用 CAS 重试修复丢失更新，并通过版本识别 ABA。',
  question: 'volatile 可见，为什么两个自增还是可能只得到 1？',
  objectives: [
    'start 只能调用一次；join 等待目标终止，中断需要线程主动响应。',
    'volatile 读写可见性不把读取、计算、写回自动合成一次原子操作。',
    'CAS 失败后应重新读取并计算；只比较值可能看不见 ABA，版本可帮助识别。',
  ],
  prerequisites: ['java-memory-model', 'process'],
  nextConcepts: ['java-locks', 'java-concurrent-map'],
  concepts: [
    {
      id: 'java-thread',
      title: 'Thread 的启动、等待与协作中断',
      content: 'start 只能调用一次；join 等待目标终止，中断需要线程主动响应。',
      why: '线程生命周期决定哪些动作可以继续。',
      relatedConcepts: ['process', 'java-memory-model'],
    },
    {
      id: 'volatile',
      title: 'volatile 自增与可见性',
      content: 'volatile 读写可见性不把读取、计算、写回自动合成一次原子操作。',
      why: '看到最新值与完成整个更新是不同保证。',
      relatedConcepts: ['java-memory-model', 'cas'],
    },
    {
      id: 'cas',
      title: 'CAS 与带版本的原子更新',
      content: 'CAS 失败后应重新读取并计算；只比较值可能看不见 ABA，版本可帮助识别。',
      why: '条件更新需要定义比较的身份和重试方式。',
      relatedConcepts: ['java-concurrent-map'],
    },
  ],
  experiments: [
    {
      id: 'java-atomics-lab',
      type: 'java-atomics',
      title: '线程、自增与 CAS',
      description: '交错执行两个线程的自增，用 CAS 重试修复丢失更新，并通过版本识别 ABA。',
      question: 'volatile 可见，为什么两个自增还是可能只得到 1？',
      config: {},
    },
  ],
  challenge: {
    question: '两个线程都已读取 volatile counter=0，再分别写回自己的结果，可能发生什么？',
    options: [
      {
        id: 'a',
        text: '一定得到 2，因为每次读写都可见。',
      },
      {
        id: 'b',
        text: '最终得到 1；volatile 不保证整个自增原子，CAS 需要失败重读后再提交。',
      },
      {
        id: 'c',
        text: '两个线程都会因为 volatile 自动阻塞。',
      },
    ],
    answer: 'b',
    explanation:
      '两个写入都提交 1，第二个覆盖第一个。CAS 把比较与修改放在一个原子边界，但整个重试循环仍可能多次执行。',
    hint: '把两个线程的读步骤安排在任何写步骤之前。',
  },
  content,
} satisfies Course
