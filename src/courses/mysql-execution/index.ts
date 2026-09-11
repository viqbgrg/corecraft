import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'mysql-execution',
  slug: 'mysql-execution',
  title: '同一条 SQL，三种连接会做多少工作',
  englishTitle: 'MySQL Join, Aggregation and Filesort',
  level: 7,
  category: 'MySQL',
  duration: 25,
  description: '对真实小表执行过滤、三种 Join、分组、排序和 LIMIT，分开观察估计与实际操作。',
  question: 'EXPLAIN 的行数、实际结果组数和 Filesort 落盘次数是同一件事吗？',
  objectives: [
    '候选计划用估计基数和成本参数选路，实际执行才产生记录与操作计数。',
    'Nested Loop 比较两侧键，索引连接按键查找，Hash Join 构建后探测。',
    '按分组键累加聚合状态，输入多行可缩成少数组。',
    '不能利用索引顺序时执行额外排序；内存不足才可能生成外排段。',
  ],
  prerequisites: ['query-optimizer', 'innodb-indexes', 'innodb-locks'],
  nextConcepts: ['jmm'],
  concepts: [
    {
      id: 'explain',
      title: 'EXPLAIN 与成本模型',
      content: '候选计划用估计基数和成本参数选路，实际执行才产生记录与操作计数。',
      why: '正确计划也可能因估计偏差付出较多工作。',
      relatedConcepts: ['query-optimizer', 'join'],
    },
    {
      id: 'join',
      title: '连接算子',
      content: 'Nested Loop 比较两侧键，索引连接按键查找，Hash Join 构建后探测。',
      why: '相同关系结果可由不同访问算法获得。',
      relatedConcepts: ['explain', 'group-by'],
    },
    {
      id: 'group-by',
      title: 'GROUP BY',
      content: '按分组键累加聚合状态，输入多行可缩成少数组。',
      why: '聚合改变后续排序的行数与语义。',
      relatedConcepts: ['join', 'filesort'],
    },
    {
      id: 'filesort',
      title: 'ORDER BY 与 Filesort',
      content: '不能利用索引顺序时执行额外排序；内存不足才可能生成外排段。',
      why: 'Filesort 名字不能单独证明产生了磁盘 IO。',
      relatedConcepts: ['group-by', 'explain'],
    },
  ],
  experiments: [
    {
      id: 'mysql-execution-lab',
      type: 'mysql-execution',
      title: '三个 Join 与一条算子管线',
      description: '对真实小表执行过滤、三种 Join、分组、排序和 LIMIT，分开观察估计与实际操作。',
      question: '改变排序容量，为什么计划仍有 Filesort 却不再模拟落盘？',
      config: {},
    },
  ],
  challenge: {
    question: '把每段排序容量从 2 组提高到 6 组，三组聚合结果仍需 Filesort，但不再模拟落盘，说明什么？',
    options: [
      {
        id: 'a',
        text: '只要有 Filesort 就必定写真实磁盘。',
      },
      {
        id: 'b',
        text: 'Filesort 表示额外排序，是否落盘还取决于结果规模、可用内存与具体算法。',
      },
      {
        id: 'c',
        text: 'GROUP BY 自动保证所有查询都按 SUM 降序。',
      },
    ],
    answer: 'b',
    explanation:
      'GROUP BY 产生组，ORDER BY 定义顺序。排序可以全部在内存完成；这个实验通过真实排序段生成与归并来区分两种情况。',
    hint: '固定过滤条件，提高排序容量后重新执行。',
  },
  content,
} satisfies Course
