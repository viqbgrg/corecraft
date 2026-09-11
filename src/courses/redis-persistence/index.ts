import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'redis-persistence',
  slug: 'redis-persistence',
  title: 'Redis 快照、日志与恢复',
  englishTitle: 'Redis RDB and AOF Recovery',
  level: 14,
  category: 'Redis',
  duration: 28,
  description: '在快照和日志同步之间插入写入与断电，检验已确认写入的恢复，并重写 AOF。',
  question: '收到 Redis 成功回复，是否已经跨过持久化边界？',
  objectives: [
    '快照固定开始时的逻辑状态，之后父进程写入不自动加入正在生成的文件。',
    'appendfsync 策略改变确认与同步之间的关系，恢复只能使用稳定文件中的命令。',
    '重写基线加期间增量形成等价状态，持久化并切换文件后才能替代旧日志。',
  ],
  prerequisites: ['redis-structures', 'java-file-io'],
  nextConcepts: ['redis-topology'],
  concepts: [
    {
      id: 'redis-rdb',
      title: 'RDB 的时间点快照',
      content: '快照固定开始时的逻辑状态，之后父进程写入不自动加入正在生成的文件。',
      why: '恢复点取决于文件代表的时间。',
      relatedConcepts: ['page-cache'],
    },
    {
      id: 'redis-aof',
      title: 'AOF 确认与日志持久前缀',
      content: 'appendfsync 策略改变确认与同步之间的关系，恢复只能使用稳定文件中的命令。',
      why: '确认和耐久性必须按策略解释。',
      relatedConcepts: ['wal'],
    },
    {
      id: 'redis-rewrite',
      title: 'AOF 的等价重写',
      content: '重写基线加期间增量形成等价状态，持久化并切换文件后才能替代旧日志。',
      why: '压缩历史不能漏掉并发更新。',
      relatedConcepts: ['redis-structures'],
    },
  ],
  experiments: [
    {
      id: 'redis-persistence-lab',
      type: 'redis-persistence',
      title: 'Redis 快照、日志与恢复',
      description: '在快照和日志同步之间插入写入与断电，检验已确认写入的恢复，并重写 AOF。',
      question: '收到 Redis 成功回复，是否已经跨过持久化边界？',
      config: {},
    },
  ],
  challenge: {
    question: 'BGSAVE 在 counter=1 时开始，期间 counter 变为 2，完成的 RDB 通常代表什么？',
    options: [
      {
        id: 'a',
        text: '必定是 2，因为保存结束时内存已经更新。',
      },
      {
        id: 'b',
        text: '开始快照时的逻辑状态 1；期间写入需要后续快照或日志才能恢复。',
      },
      {
        id: 'c',
        text: '每个字段随机来自任意时刻。',
      },
    ],
    answer: 'b',
    explanation:
      'fork/COW 等机制让子进程看到一致的起始状态，父进程之后的修改并不自动改变该快照。保存结束时点不是快照覆盖所有写入的边界。',
    hint: '观察正在生成的快照和当前内存值分别变化。',
  },
  content,
} satisfies Course
