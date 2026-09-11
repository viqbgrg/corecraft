import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'innodb-commit',
  slug: 'innodb-commit',
  title: 'Redo 和 Binlog 怎样决定同一次提交',
  englishTitle: 'InnoDB Commit and Binlog Recovery',
  level: 7,
  category: 'MySQL',
  duration: 25,
  description: '分步持久化 PREPARE 与 Binlog，在不同阶段崩溃，观察主库恢复与复制端应用。',
  question: '客户端没收到成功，恢复后事务一定会回滚吗？',
  objectives: [
    '行修改先进入缓冲页，脏页写回可以晚于事务提交。',
    '引擎 PREPARE 后，以完整持久 Binlog 中的 XID 协调最终提交。',
    'Server 层的逻辑变更日志可供复制与时间点恢复，与 InnoDB Redo 职责不同。',
  ],
  prerequisites: ['wal', 'innodb-indexes'],
  nextConcepts: ['innodb-read-view'],
  concepts: [
    {
      id: 'innodb-buffer-pool',
      title: 'InnoDB Buffer Pool',
      content: '行修改先进入缓冲页，脏页写回可以晚于事务提交。',
      why: '减少每次提交等待随机数据页写入的成本。',
      relatedConcepts: ['buffer-pool', 'wal'],
    },
    {
      id: 'internal-two-phase-commit',
      title: '内部两阶段提交',
      content: '引擎 PREPARE 后，以完整持久 Binlog 中的 XID 协调最终提交。',
      why: '让引擎恢复结果与 Server 日志记录保持一致。',
      relatedConcepts: ['innodb', 'binlog'],
    },
    {
      id: 'binlog',
      title: 'Binlog',
      content: 'Server 层的逻辑变更日志可供复制与时间点恢复，与 InnoDB Redo 职责不同。',
      why: '复制端需要可按事务顺序消费的变更记录。',
      relatedConcepts: ['wal', 'internal-two-phase-commit'],
    },
  ],
  experiments: [
    {
      id: 'innodb-commit-lab',
      type: 'innodb-commit',
      title: '准备、决定与恢复',
      description: '分步持久化 PREPARE 与 Binlog，在不同阶段崩溃，观察主库恢复与复制端应用。',
      question: '持久 PREPARE 之后，哪条证据能把恢复决定从回滚变为提交？',
      config: {},
    },
  ],
  challenge: {
    question: '只有持久 PREPARE，且同 XID 的完整 Binlog 已持久，但引擎最终提交前崩溃，应如何恢复？',
    options: [
      {
        id: 'a',
        text: '看到没有最终引擎提交标记就无条件回滚。',
      },
      {
        id: 'b',
        text: '根据同 XID 的持久 Binlog 决定提交，即使客户端尚未收到成功。',
      },
      {
        id: 'c',
        text: '以磁盘数据页是否已经变成新值来决定。',
      },
    ],
    answer: 'b',
    explanation:
      'PREPARE 表示引擎可以完成决定。完整持久 Binlog 是协调提交的证据；页的新旧与客户端是否收到回复，都不能单独证明提交结局。',
    hint: '分别在 Binlog 同步前后崩溃，对比恢复决定。',
  },
  content,
} satisfies Course
