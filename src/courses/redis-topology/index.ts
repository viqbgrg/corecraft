import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'redis-topology',
  slug: 'redis-topology',
  title: 'Redis 复制、Sentinel 与 Cluster',
  englishTitle: 'Redis Replication, Sentinel and Cluster',
  level: 14,
  category: 'Redis',
  duration: 34,
  description: '观察异步复制与旧主分叉，执行多数授权切换，再处理 Cluster 的 ASK 与 MOVED。',
  question: '故障转移恢复了服务，为什么仍可能丢失已确认写入？',
  objectives: [
    '副本可能滞后，故障转移只能选择已拥有的历史，旧主确认但未复制的数据可能丢失。',
    '多个 Sentinel 协调故障转移，不能仅凭一次主观失联就改变全组主节点。',
    'CRC16 将键映射到 16384 槽；ASK 临时路由，MOVED 更新槽缓存，hash tag 约束多键位置。',
  ],
  prerequisites: ['redis-persistence'],
  nextConcepts: ['redis-expiration'],
  concepts: [
    {
      id: 'redis-replication',
      title: '异步复制与主切换',
      content: '副本可能滞后，故障转移只能选择已拥有的历史，旧主确认但未复制的数据可能丢失。',
      why: '可用性恢复与数据完整性分别验证。',
      relatedConcepts: ['redis-persistence'],
    },
    {
      id: 'redis-sentinel',
      title: 'Sentinel 的故障与授权判断',
      content: '多个 Sentinel 协调故障转移，不能仅凭一次主观失联就改变全组主节点。',
      why: '分区中的局部观察不等于全局事实。',
      relatedConcepts: ['tcp-reliability'],
    },
    {
      id: 'redis-cluster',
      title: 'Cluster 哈希槽与重定向',
      content: 'CRC16 将键映射到 16384 槽；ASK 临时路由，MOVED 更新槽缓存，hash tag 约束多键位置。',
      why: '分片的数据定位和复制组高可用承担不同职责。',
      relatedConcepts: ['hash-table'],
    },
  ],
  experiments: [
    {
      id: 'redis-topology-lab',
      type: 'redis-topology',
      title: 'Redis 复制、Sentinel 与 Cluster',
      description: '观察异步复制与旧主分叉，执行多数授权切换，再处理 Cluster 的 ASK 与 MOVED。',
      question: '故障转移恢复了服务，为什么仍可能丢失已确认写入？',
      config: {},
    },
  ],
  challenge: {
    question: '迁移中收到 ASK，和槽归属变化后收到 MOVED，客户端应怎样区别处理？',
    options: [
      {
        id: 'a',
        text: '两者都必须永久把全部槽映射到同一个节点。',
      },
      {
        id: 'b',
        text: 'ASK 使用 ASKING 临时重试本次命令；MOVED 表示槽归属变化，应更新路由缓存后重试。',
      },
      {
        id: 'c',
        text: 'ASK 说明服务器要求客户端删除这个键。',
      },
    ],
    answer: 'b',
    explanation:
      '迁移期间旧节点仍可能负责同槽其他键，因此 ASK 不直接改写长期槽映射。MOVED 指向槽的当前归属，适合刷新缓存。',
    hint: '先迁移键但不发布归属，比较客户端缓存是否变化。',
  },
  content,
} satisfies Course
