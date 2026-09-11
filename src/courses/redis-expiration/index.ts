import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'redis-expiration',
  slug: 'redis-expiration',
  title: '过期、淘汰与容量拒绝',
  englishTitle: 'Redis Expiration and Eviction',
  level: 14,
  category: 'Redis',
  duration: 28,
  description: '推进 TTL 时钟，比较驻留与逻辑有效性，再用不同容量策略拒绝或淘汰键。',
  question: 'TTL 已经到零，为什么键还可能占着内存？',
  objectives: [
    '键到期后不能作为有效结果返回，但删除可能由访问检查或主动周期完成。',
    'noeviction 拒绝需要更多空间的写入，allkeys 与 volatile 策略选择不同候选集合。',
  ],
  prerequisites: ['redis-structures'],
  nextConcepts: ['redis-persistence', 'redis-topology'],
  concepts: [
    {
      id: 'redis-expiry',
      title: '逻辑期限与过期清理',
      content: '键到期后不能作为有效结果返回，但删除可能由访问检查或主动周期完成。',
      why: '业务可见性和内存回收时点不同。',
      relatedConcepts: ['dns-cache'],
    },
    {
      id: 'redis-eviction',
      title: '内存压力下的淘汰',
      content: 'noeviction 拒绝需要更多空间的写入，allkeys 与 volatile 策略选择不同候选集合。',
      why: '缓存保留承诺受到容量约束。',
      relatedConcepts: ['page-replacement'],
    },
  ],
  experiments: [
    {
      id: 'redis-expiration-lab',
      type: 'redis-expiration',
      title: '过期、淘汰与容量拒绝',
      description: '推进 TTL 时钟，比较驻留与逻辑有效性，再用不同容量策略拒绝或淘汰键。',
      question: 'TTL 已经到零，为什么键还可能占着内存？',
      config: {},
    },
  ],
  challenge: {
    question: 'volatile-lru 下容量已满，现有键全部没有 TTL，再写新键会怎样？',
    options: [
      {
        id: 'a',
        text: '策略可以任意淘汰永久键。',
      },
      {
        id: 'b',
        text: '没有符合条件的淘汰候选，写入可能被拒绝，即使配置了 LRU 名称。',
      },
      {
        id: 'c',
        text: '它会自动给全部键设置同一个 TTL。',
      },
    ],
    answer: 'b',
    explanation:
      'volatile 策略只从带过期设置的键中挑选。没有候选时不能从永久键中凭空选择，容量准入仍可能失败。',
    hint: '将 B、C 用不带 TTL 的 SET 覆盖后再试写入。',
  },
  content,
} satisfies Course
