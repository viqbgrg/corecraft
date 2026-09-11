import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'transactions',
  slug: 'transactions',
  title: '别人提交了，我为什么仍读到旧值',
  englishTitle: 'Transactions, Isolation and MVCC',
  level: 6,
  category: '并发事务',
  duration: 28,
  description: '交错两个会话的读取、更新、提交与回滚，观察快照、行锁、脏读和死锁恢复。',
  question: '同一事务的普通读取与 SELECT FOR UPDATE，为什么可能看到不同版本？',
  objectives: [
    '将 ACID 对应到具体约束与机制',
    '比较 RU / RC / RR 与点读取 Serializable',
    '观察写集发布、版本可见性、锁等待与死锁',
  ],
  prerequisites: ['database-pages', 'wal'],
  nextConcepts: ['query-optimizer', 'clustered-index'],
  concepts: [
    {
      id: 'transaction',
      title: '事务与提交',
      content: '把多次读写组织为一个逻辑单位，提交时共同发布修改，回滚时丢弃尚未提交的影响。',
      why: '业务操作往往跨多行，不能把任意中间状态都当成最终结果。',
      relatedConcepts: ['acid', 'wal'],
    },
    {
      id: 'acid',
      title: 'ACID 的不同保证',
      content:
        'Atomicity 是全有或全无，Consistency 是满足定义的约束，Isolation 控制并发可见行为，Durability 保护已确认提交。',
      why: '把四种目标分开，才能判断需要约束、锁、版本还是恢复日志。',
      relatedConcepts: ['transaction', 'isolation', 'redo-log'],
    },
    {
      id: 'isolation',
      title: '事务隔离',
      content: '不同隔离规则限制读取未提交数据、重复读取变化及其他并发现象，不同数据库的实现并不完全相同。',
      why: '相同交错在不同规则下可以产生不同结果或等待。',
      relatedConcepts: ['mvcc', 'row-lock'],
    },
    {
      id: 'mvcc',
      title: '多版本并发控制',
      content: '保留多个行版本，读取者根据快照和事务状态选择可见版本；自己的写入通常另行可见。',
      why: '让部分读写并发进行，而不必让所有读取都阻塞写入。',
      relatedConcepts: ['isolation', 'undo-log'],
    },
    {
      id: 'row-lock',
      title: '行锁、等待与死锁',
      content: 'S 锁可共享，X 锁排斥其他读写锁；相互等待形成环时需要回滚一个参与者解除死锁。',
      why: '版本读取不替代写写冲突协调，正确更新仍需要锁或其他冲突检查。',
      relatedConcepts: ['transaction', 'mvcc', 'database-pin'],
    },
  ],
  experiments: [
    {
      id: 'transaction-interleaving',
      type: 'transactions',
      title: '两个库存事务',
      description: '控制快照读、当前读、原子增量、锁等待、回滚和四种规则对照。',
      question: '等待一把锁一定是死锁吗？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '本模型 RR 下 T1 普通读到 10，T2 写 20 并提交。T1 再普通读和 SELECT FOR UPDATE 分别看到什么？',
    options: [
      { id: 'a', text: '普通读 10，当前锁定读 20；它们采用不同的版本选择规则。' },
      { id: 'b', text: '两个读取永远只能看到 10，更新也必须基于 10。' },
      { id: 'c', text: '两个读取永远都是 20，RR 不保留快照。' },
    ],
    answer: 'a',
    explanation:
      '这里按 InnoDB 风格区分快照读与当前读。RR 的普通一致性读复用首次快照；FOR UPDATE 读取当前版本并加 X 锁。不同引擎的 RR 行为需要查具体语义。',
    hint: 'T1 首次读取后，让 T2 提交 20，再分别点击普通读取和当前读。',
  },
} satisfies Course
