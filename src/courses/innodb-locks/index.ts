import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'innodb-locks',
  slug: 'innodb-locks',
  title: '没有这条记录，为什么插入仍在等待',
  englishTitle: 'InnoDB Record, Gap and Next-Key Locks',
  level: 7,
  category: 'MySQL',
  duration: 25,
  description: '在有序唯一索引上观察记录锁、间隙锁和 Next-Key，比较 RR、RC 与唯一等值查询。',
  question: '锁住 key >= 15，为何会阻挡 15 的插入，却不一定阻挡 key=10 的修改？',
  objectives: [
    '保护索引中的具体已有记录，唯一等值命中可只锁定该记录。',
    '保护相邻键之间的开区间，阻止其他事务向其中插入新键。',
    '组合右端记录与其前方间隙，本课用 (前键,当前键] 表示。',
  ],
  prerequisites: ['innodb-read-view', 'innodb-indexes'],
  nextConcepts: ['mysql-execution'],
  concepts: [
    {
      id: 'record-lock',
      title: '记录锁',
      content: '保护索引中的具体已有记录，唯一等值命中可只锁定该记录。',
      why: '协调针对同一行的冲突当前读取和修改。',
      relatedConcepts: ['innodb-indexes', 'transactions'],
    },
    {
      id: 'gap-lock',
      title: '间隙锁',
      content: '保护相邻键之间的开区间，阻止其他事务向其中插入新键。',
      why: '保护范围边界，间隙本身并没有一条可锁的业务记录。',
      relatedConcepts: ['record-lock', 'next-key-lock'],
    },
    {
      id: 'next-key-lock',
      title: 'Next-Key Lock',
      content: '组合右端记录与其前方间隙，本课用 (前键,当前键] 表示。',
      why: '范围锁定读要协调现有行和可能进入范围的新行。',
      relatedConcepts: ['gap-lock', 'read-view'],
    },
  ],
  experiments: [
    {
      id: 'innodb-locks-lab',
      type: 'innodb-locks',
      title: '锁区间与等待语句',
      description: '在有序唯一索引上观察记录锁、间隙锁和 Next-Key，比较 RR、RC 与唯一等值查询。',
      question: '释放 T1 后，原等待语句实际执行了吗？',
      config: {},
    },
  ],
  challenge: {
    question: '在初始索引 [10,20,30] 上，RR 范围锁含 (10,20]。哪些操作与它冲突？',
    options: [
      {
        id: 'a',
        text: '只有 UPDATE key=10。',
      },
      {
        id: 'b',
        text: 'INSERT key=15 与 UPDATE key=20；左端现有记录 key=10 不属于这个锁的记录部分。',
      },
      {
        id: 'c',
        text: '间隙中没有记录，所以 INSERT key=15 不会等待。',
      },
    ],
    answer: 'b',
    explanation:
      'Next-Key 的间隙是开区间 (10,20)，记录部分是 20。两个部分阻止不同操作，不能把左端已有记录也当成被该锁锁住。',
    hint: '使用默认范围锁阻挡 INSERT 15，再与唯一等值和 RC 比较。',
  },
  content,
} satisfies Course
