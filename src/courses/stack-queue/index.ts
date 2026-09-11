import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'stack-queue',
  slug: 'stack-queue',
  title: '栈、队列与循环缓冲',
  englishTitle: 'Stacks, Queues and Deques',
  level: 5,
  category: '数据结构',
  duration: 16,
  description: '改变两端的访问规则，观察后进先出、先进先出与槽位复用。',
  question: 'head 与 tail 相等，队列究竟是空还是满？',
  objectives: ['用操作顺序区分栈与队列', '理解双端队列允许哪些操作', '用 size 区分环形缓冲的满与空'],
  prerequisites: ['array', 'linked-list'],
  nextConcepts: ['graph', 'process'],
  concepts: [
    {
      id: 'stack',
      title: '栈与后进先出',
      content: '只从同一端压入和弹出；最后压入的元素先返回。',
      why: '适合保存尚未完成的嵌套任务，例如函数调用与深度优先搜索。',
      relatedConcepts: ['dfs', 'thread'],
    },
    {
      id: 'queue',
      title: '队列与先进先出',
      content: '队尾进入、队首离开，保持进入顺序。',
      why: '就绪调度与广度优先遍历需要按到达次序处理任务。',
      relatedConcepts: ['scheduling', 'bfs'],
    },
    {
      id: 'deque',
      title: '双端队列',
      content: '两端都允许放入和移除，可以支持栈或队列的访问规则。',
      why: '不同算法可能需要不同端点操作，抽象接口不必限定底层存储。',
      relatedConcepts: ['array', 'queue', 'stack'],
    },
  ],
  experiments: [
    {
      id: 'ring-buffer-lab',
      type: 'stack-queue',
      title: '端点与循环槽位实验台',
      description: '固定容量下观察各端点的推进与复用。',
      question: '移除一个元素后，是否必须搬移整个数组？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '本实验的环形队列中 head=tail，怎样区分空与满？',
    options: [
      { id: 'a', text: '只能靠比较 head 与 tail，无法区分。' },
      { id: 'b', text: 'head=tail 永远表示空，不可能表示满。' },
      { id: 'c', text: '检查 size：0 为空，等于 capacity 为满。' },
    ],
    answer: 'c',
    explanation: '本实现额外记录元素个数。另一种设计可以保留一个空槽，但那会减少可用容量；两种约定不能混用。',
    hint: '先把容量 4 的队列装满，再全部移除，观察 head、tail 和 size。',
  },
} satisfies Course
