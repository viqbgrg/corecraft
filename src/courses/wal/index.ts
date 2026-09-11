import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'wal',
  slug: 'wal',
  title: '提交成功，数据页还没落盘怎么办',
  englishTitle: 'WAL, Redo and Undo',
  level: 6,
  category: '日志与恢复',
  duration: 26,
  description: '逐步转账，控制日志与数据页的落盘顺序，在崩溃后重做已提交更新、撤销未提交更新。',
  question: '为什么必须先持久日志，却不必在每次 COMMIT 时刷完所有数据页？',
  objectives: [
    '用 LSN 检验 write-ahead 顺序',
    '区分日志持久、事务提交和脏页写回',
    '分别构造需要 REDO 与 UNDO 的崩溃',
  ],
  prerequisites: ['buffer-pool'],
  nextConcepts: ['transaction', 'mvcc', 'clustered-index'],
  concepts: [
    {
      id: 'wal',
      title: 'Write-Ahead Logging',
      content: '在数据页持久化前，先持久保存恢复它所需的日志；提交确认也需要相应提交日志的持久条件。',
      why: '防止磁盘已有新值，却没有足够信息判断如何恢复。',
      relatedConcepts: ['redo-log', 'undo-log', 'buffer-pool'],
    },
    {
      id: 'redo-log',
      title: 'Redo 与持久性',
      content: '当提交已被确认但数据页尚未落盘，可根据持久日志重做更新。',
      why: '支持 no-force 提交，减少每次提交强制刷新所有数据页的成本。',
      relatedConcepts: ['wal', 'acid'],
    },
    {
      id: 'undo-log',
      title: 'Undo 与原子性',
      content: '未提交修改如果已经进入持久页，需要足够的旧值信息把它撤销；旧版本也可服务于其他机制。',
      why: '支持 steal 页面管理，同时避免崩溃后留下部分事务结果。',
      relatedConcepts: ['wal', 'transaction', 'mvcc'],
    },
  ],
  experiments: [
    {
      id: 'wal-recovery',
      type: 'wal',
      title: '转账与崩溃恢复',
      description: '控制 BEGIN、两次 UPDATE、COMMIT、日志刷新、页刷新和崩溃。',
      question: '持久日志里只有 UPDATE，没有 COMMIT，能把它当成已提交转账吗？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: 'COMMIT 及之前的日志已经持久化，但两个账户数据页仍是旧值，此时崩溃怎么办？',
    options: [
      { id: 'a', text: '转账必然丢失，因为数据页没落盘。' },
      { id: 'b', text: '恢复时根据持久提交日志 REDO 缺失的更新，保留已经确认的转账。' },
      { id: 'c', text: '一律 UNDO，因为缓冲内存已经丢失。' },
    ],
    answer: 'b',
    explanation:
      'no-force 允许提交时不刷完数据页。只要提交与必要更新日志满足持久条件，恢复可以重做缺失更新；未提交事务则按另一套撤销条件处理。',
    hint: '完成两次 UPDATE 后 COMMIT，不刷数据页直接崩溃，再看 REDO 数量。',
  },
} satisfies Course
