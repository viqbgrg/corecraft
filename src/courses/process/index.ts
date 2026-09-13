import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'process',
  slug: 'process',
  title: '进程与线程',
  englishTitle: 'Sharing the CPU',
  level: 3,
  category: '操作系统',
  duration: 25,
  description: '让线程轮流拿到 CPU，观察运行、等待与上下文切换。',
  question: '一个 CPU，为什么能让多个程序看起来同时运行？',
  objectives: [
    '区分进程资源与线程执行状态',
    '观察 Ready、Running、Blocked 与 Waiting',
    '保存与恢复 PC 和私有栈帧',
  ],
  prerequisites: ['cpu', 'memory'],
  nextConcepts: ['virtual-memory', 'java-thread', 'jmm'],
  concepts: [
    {
      id: 'process',
      title: '进程',
      content: '程序运行时的资源容器，拥有独立的地址空间。本模型中 A、B 的共享计数器互相隔离。',
      why: '程序需要独立的资源与保护边界，避免任意访问彼此的数据。',
      relatedConcepts: ['virtual-memory', 'thread'],
    },
    {
      id: 'thread',
      title: '线程',
      content: '进程中的执行流。同一进程的线程共享地址空间，各自有 PC、寄存器上下文和栈。',
      why: '多个任务可能需要共享数据，同时保持独立的执行进度。',
      relatedConcepts: ['context-switch', 'java-thread'],
    },
    {
      id: 'context-switch',
      title: '上下文切换',
      content: '暂停一条执行流，保存它的状态，再恢复另一条执行流。',
      why: '有限的 CPU 必须在多个可运行线程间复用，又不能丢失任何一个线程的进度。',
      relatedConcepts: ['register', 'jmm'],
    },
  ],
  challenge: {
    question: 'Thread 1 的 IO 已经完成，此时 Thread 2 正在运行。Thread 1 会怎样？',
    options: [
      {
        id: 'a',
        text: '立即进入 Running，让 Thread 2 消失。',
      },
      {
        id: 'b',
        text: '先进入 Ready，等调度器分配 CPU。',
      },
      {
        id: 'c',
        text: '重新从 PC = 0 开始运行。',
      },
    ],
    answer: 'b',
    explanation: '唤醒只代表再次具备运行资格。保存的 PC 和栈仍在；轮转调度下一次选择它时才继续运行。',
    hint: '阻塞 Thread 1，观察 Thread 2 被调度，再点击“完成目标 IO”。',
  },
  experiments: [
    {
      id: 'process-scheduler',
      type: 'process',
      title: '单核调度实验台',
      description: '亲手安排线程，观察资源与执行状态。',
      question: '等待 IO 的线程还能被调度吗？',
      config: {},
    },
  ],
  content,
} satisfies Course
