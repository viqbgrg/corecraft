import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'backend-capacity',
  slug: 'backend-capacity',
  title: '后端容量与性能调优',
  englishTitle: 'Backend Capacity and Performance Tuning',
  level: 17,
  category: '高级 Java 后端',
  duration: 36,
  description: '用同一负载比较线程、DB、索引、缓存、异步等待、对象分配与 GC 的实际成本。',
  question: '线程加倍，为什么吞吐可能仍被数据库限制？',
  objectives: [
    '系统内并发、完成吞吐和响应时间不同，队列、CPU、连接和内存各有容量边界。',
    '索引减少真实查找工作，缓存命中跳过 DB，但改变资源占用需要用相同输入验证。',
    '异步释放等待线程但保留请求状态；降低分配或调整堆可改变 GC 与内存压力。',
  ],
  prerequisites: ['java-executors', 'mysql-execution', 'jvm-gc', 'redis-structures'],
  nextConcepts: ['backend-consistency', 'backend-observability'],
  concepts: [
    {
      id: 'backend-capacity-model',
      title: '高并发与有限服务能力',
      content: '系统内并发、完成吞吐和响应时间不同，队列、CPU、连接和内存各有容量边界。',
      why: '优化不能只看线程数或成功请求的平均值。',
      relatedConcepts: ['java-executors', 'service-resilience'],
    },
    {
      id: 'backend-query-cache',
      title: '查询优化与缓存成本',
      content: '索引减少真实查找工作，缓存命中跳过 DB，但改变资源占用需要用相同输入验证。',
      why: '少做瓶颈工作常比增加排队者更有效。',
      relatedConcepts: ['mysql-execution', 'redis-structures'],
    },
    {
      id: 'backend-jvm-tuning',
      title: 'JVM 分配与异步等待',
      content: '异步释放等待线程但保留请求状态；降低分配或调整堆可改变 GC 与内存压力。',
      why: '减少线程占用不会让在途对象消失。',
      relatedConcepts: ['jvm-gc', 'jvm-jit'],
    },
  ],
  experiments: [
    {
      id: 'backend-capacity-lab',
      type: 'backend-capacity',
      title: '后端容量与性能调优',
      description: '用同一负载比较线程、DB、索引、缓存、异步等待、对象分配与 GC 的实际成本。',
      question: '线程加倍，为什么吞吐可能仍被数据库限制？',
      config: {},
    },
  ],
  challenge: {
    question: '固定两个 CPU 服务槽和一个 DB 连接，只增加等待 DB 的 worker，最可靠的判断是什么？',
    options: [
      {
        id: 'a',
        text: '吞吐一定按 worker 数线性增加。',
      },
      {
        id: 'b',
        text: '必须检查 DB 工作与排队；更多 worker 不增加 DB 容量，还可能增加在途内存与延迟。',
      },
      {
        id: 'c',
        text: '异步化会让所有请求对象立刻被回收。',
      },
    ],
    answer: 'b',
    explanation:
      '线程、CPU、连接、队列和堆分别受限。增加并发只有在可用瓶颈资源允许时才提高完成能力，需要同时核对接纳量、结果与尾延迟。',
    hint: '比较同样请求下的 DB 服务量、CPU 利用率、拒绝和 GC。',
  },
  content,
} satisfies Course
