import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'java-concurrent-map',
  slug: 'java-concurrent-map',
  title: '并发 Map 与渐进扩容',
  englishTitle: 'ConcurrentHashMap and Forwarding',
  level: 10,
  category: 'Java 并发',
  duration: 28,
  description: '交错更新同键、碰撞键与不同桶，逐桶迁移并沿 Forwarding 读取已提交值。',
  question: '线程安全的 Map，为什么业务计数仍会出错？',
  objectives: [
    'get 与 put 分别安全，不使它们的组合原子；compute 保护单键回调更新。',
    '已迁移的旧桶记录新表入口，读写沿转发找到当前条目，未迁移桶仍可使用。',
  ],
  prerequisites: ['java-locks', 'java-collections'],
  nextConcepts: ['java-futures'],
  concepts: [
    {
      id: 'concurrent-hash-map',
      title: '单次调用和复合操作',
      content: 'get 与 put 分别安全，不使它们的组合原子；compute 保护单键回调更新。',
      why: '业务不变量应落在正确的原子范围。',
      relatedConcepts: ['java-collections', 'cas'],
    },
    {
      id: 'map-forwarding',
      title: '扩容中的转发入口',
      content: '已迁移的旧桶记录新表入口，读写沿转发找到当前条目，未迁移桶仍可使用。',
      why: '扩容需要保持并发访问路径可追踪。',
      relatedConcepts: ['hash-table'],
    },
  ],
  experiments: [
    {
      id: 'java-concurrent-map-lab',
      type: 'java-concurrent-map',
      title: '并发 Map 与渐进扩容',
      description: '交错更新同键、碰撞键与不同桶，逐桶迁移并沿 Forwarding 读取已提交值。',
      question: '线程安全的 Map，为什么业务计数仍会出错？',
      config: {},
    },
  ],
  challenge: {
    question: 'T1 正在 compute(A)，同桶的 E 写入等待，B 位于另一桶。正确理解是什么？',
    options: [
      {
        id: 'a',
        text: '整个 Map 的所有读取与写入都必须停止。',
      },
      {
        id: 'b',
        text: '同桶写入可以等待，不同桶仍可推进；get 读取已提交值，不执行等待中的回调。',
      },
      {
        id: 'c',
        text: '任何 get 后的 put 都自动加入 compute 原子区间。',
      },
    ],
    answer: 'b',
    explanation: '本模型用桶级互斥解释更新协调。线程安全不扩大业务的原子边界，读操作不会返回尚未提交的候选。',
    hint: '尝试 A、E、B 三个键，并在 compute 中途 get(A)。',
  },
  content,
} satisfies Course
