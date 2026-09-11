import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'database-pages',
  slug: 'database-pages',
  title: '读一条记录，为什么要搬进一整页',
  englishTitle: 'Database Pages and Buffer Pool',
  level: 6,
  category: '数据库存储',
  duration: 22,
  description: '把关系表映射到固定大小的数据页，观察缓存命中、pin 引用、脏页写回与主键约束。',
  question: 'Buffer Pool 中有一页最久没用，为什么仍可能无法回收？',
  objectives: [
    '区分数据库、表、记录和页',
    '按页计算记录容量与 IO',
    '解释 Buffer Pool 命中、pin 和 dirty 的不同含义',
  ],
  prerequisites: ['filesystem', 'page-cache'],
  nextConcepts: ['wal', 'query-optimizer', 'clustered-index'],
  concepts: [
    {
      id: 'database',
      title: '数据库、表与记录',
      content: '数据库组织具有模式与约束的数据；关系表由行记录组成，每条记录包含类型明确的字段。',
      why: '统一结构与约束让数据可以被查询、验证和共享使用。',
      relatedConcepts: ['database-page', 'transaction'],
    },
    {
      id: 'database-page',
      title: '数据库数据页',
      content: '存储引擎以页组织记录与槽目录，逻辑上一行的访问可能触发整页 IO。',
      why: '将零散记录与块设备的大粒度传输匹配。',
      relatedConcepts: ['buffer-pool', 'index'],
    },
    {
      id: 'buffer-pool',
      title: 'Buffer Pool',
      content: '数据库管理的数据页内存副本，命中避免重复读盘，dirty 表示相对磁盘已有修改。',
      why: '把频繁访问和每次同步落盘分开，同时控制有限内存。',
      relatedConcepts: ['page-cache', 'wal', 'database-pin'],
    },
    {
      id: 'database-pin',
      title: '缓冲页 pin 引用',
      content: '使用者 pin 一个缓冲页期间，管理器不能把该帧回收成另一页；它不同于事务行锁。',
      why: '保护当前使用的页对象不会在访问中被替换。',
      relatedConcepts: ['buffer-pool', 'row-lock'],
    },
  ],
  experiments: [
    {
      id: 'database-buffer-pages',
      type: 'database-pages',
      title: '记录与缓冲页实验',
      description: '在六个磁盘页与有限缓冲帧之间读写记录，观察引用和写回。',
      question: '最少一次插入会改变逻辑表、缓冲页还是磁盘页？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '一个缓冲页的 pin=1、dirty=false，而且很久未被访问。能否直接将它回收？',
    options: [
      { id: 'a', text: '可以，LRU 总是选择最久未使用的页。' },
      { id: 'b', text: '不能，仍有使用引用；pin 归零后才是回收候选。' },
      { id: 'c', text: '不能，因为 pin=1 就等于持有一把数据库事务行锁。' },
    ],
    answer: 'b',
    explanation:
      'LRU 在可回收候选中选择，pin 保护缓冲帧仍被使用。dirty 判断是否需要写回，行锁控制事务冲突，三者分别解决不同问题。',
    hint: '读取并 pin 当前页，再尝试回收；释放一次 pin 后重新操作。',
  },
} satisfies Course
