import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'redis-structures',
  slug: 'redis-structures',
  title: 'Redis 值类型与跳表',
  englishTitle: 'Redis Values and Skip Lists',
  level: 14,
  category: 'Redis',
  duration: 28,
  description: '执行计数、列表、Hash、Set 与 ZSet 命令，观察真实跳表指针随分数更新重新连接。',
  question: '同样是存数据，为什么 Redis 提供多种值类型？',
  objectives: [
    'String、List、Hash、Set 和 ZSet 提供不同操作契约，选型取决于所需访问与修改方式。',
    '成员唯一，按 score 与成员顺序组织；更新分数必须维护有序结构的链接。',
  ],
  prerequisites: ['hash-table', 'stack-queue'],
  nextConcepts: ['redis-expiration', 'redis-persistence'],
  concepts: [
    {
      id: 'redis-value-types',
      title: 'Redis 键与值类型',
      content: 'String、List、Hash、Set 和 ZSet 提供不同操作契约，选型取决于所需访问与修改方式。',
      why: '一种容器不能自动高效满足所有问题。',
      relatedConcepts: ['hash-table', 'stack-queue'],
    },
    {
      id: 'redis-zset',
      title: 'ZSet 与跳表导航',
      content: '成员唯一，按 score 与成员顺序组织；更新分数必须维护有序结构的链接。',
      why: '排名与范围访问需要同时维护身份和顺序。',
      relatedConcepts: ['trees-heaps'],
    },
  ],
  experiments: [
    {
      id: 'redis-structures-lab',
      type: 'redis-structures',
      title: 'Redis 值类型与跳表',
      description: '执行计数、列表、Hash、Set 与 ZSet 命令，观察真实跳表指针随分数更新重新连接。',
      question: '同样是存数据，为什么 Redis 提供多种值类型？',
      config: {},
    },
  ],
  challenge: {
    question: 'ZSet 中已有 Alice:10，再执行 ZADD rank 3 Alice，会怎样？',
    options: [
      {
        id: 'a',
        text: '保留两个同名 Alice，分别处在两个分数位置。',
      },
      {
        id: 'b',
        text: '更新唯一 Alice 的分数并重新定位；新增成员数返回 0，成员总数不变。',
      },
      {
        id: 'c',
        text: '改变分数后旧跳表链接仍可原样保留。',
      },
    ],
    answer: 'b',
    explanation:
      'ZSet 成员唯一。ZADD 更新已有成员不是新增，默认返回新增数量；有序索引必须随 score 变化重新定位。',
    hint: '观察节点总数、底层顺序和上层 next 指针。',
  },
  content,
} satisfies Course
