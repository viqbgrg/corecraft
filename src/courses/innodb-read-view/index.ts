import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'innodb-read-view',
  slug: 'innodb-read-view',
  title: '已经提交的新版本，为什么仍不可见',
  englishTitle: 'InnoDB Read View and Undo Versions',
  level: 7,
  category: 'MySQL',
  duration: 25,
  description: '操作三个事务，沿真实 Undo 版本链检查事务 ID 边界，观察旧 Read View 阻止清理。',
  question: '一个活跃事务后来提交了，已有快照会把它从 m_ids 中删掉吗？',
  objectives: [
    '记录创建者、活跃事务集合和 ID 边界，决定普通一致性读可见哪个版本。',
    '当前行的事务 ID 与旧版本指针使读者能沿链跳过不可见修改。',
    '仍被活跃快照需要的旧版本必须保留，视图释放后才能继续清理。',
  ],
  prerequisites: ['transactions', 'innodb-commit'],
  nextConcepts: ['innodb-locks'],
  concepts: [
    {
      id: 'read-view',
      title: 'Read View',
      content: '记录创建者、活跃事务集合和 ID 边界，决定普通一致性读可见哪个版本。',
      why: '在写入继续发生时提供稳定的已提交视图。',
      relatedConcepts: ['mvcc', 'undo-chain'],
    },
    {
      id: 'undo-chain',
      title: 'Undo 版本链',
      content: '当前行的事务 ID 与旧版本指针使读者能沿链跳过不可见修改。',
      why: '最新物理值不一定是当前读者应当读取的值。',
      relatedConcepts: ['read-view', 'innodb-commit'],
    },
    {
      id: 'purge',
      title: '旧版本清理',
      content: '仍被活跃快照需要的旧版本必须保留，视图释放后才能继续清理。',
      why: '长事务可能阻碍历史版本回收，即使它没有写数据。',
      relatedConcepts: ['read-view', 'transactions'],
    },
  ],
  experiments: [
    {
      id: 'innodb-read-view-lab',
      type: 'innodb-read-view',
      title: '三会话与一条 Undo 链',
      description: '操作三个事务，沿真实 Undo 版本链检查事务 ID 边界，观察旧 Read View 阻止清理。',
      question: 'RR 读者能解释两种不同原因的不可见新版本吗？',
      config: {},
    },
  ],
  challenge: {
    question: 'T1 创建 RR Read View 时 T2 仍活跃，之后 T2 提交；T1 的下一次普通读如何判断 T2？',
    options: [
      {
        id: 'a',
        text: 'T2 已提交，所以自动从旧视图 m_ids 移除。',
      },
      {
        id: 'b',
        text: '旧视图保持原活跃集合，T2 的版本仍不可见，需要沿 Undo 查找。',
      },
      {
        id: 'c',
        text: '所有事务提交都会强制 T1 重建快照。',
      },
    ],
    answer: 'b',
    explanation:
      'RR 首次普通一致性读创建的视图在事务内复用；事务后续提交不改写已经创建的视图。RC 则每次普通读创建新视图。',
    hint: '先让 T2 写入但不提交，再让 T1 首次读取。',
  },
  content,
} satisfies Course
