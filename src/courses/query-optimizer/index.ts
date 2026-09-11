import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'query-optimizer',
  slug: 'query-optimizer',
  title: '有索引，为什么还会选择全表扫描',
  englishTitle: 'Indexes and Query Optimization',
  level: 6,
  category: '查询执行',
  duration: 24,
  description: '用真实 B+Tree 范围路径与堆表扫描执行同一条件，观察选择率、取记录成本和过时统计。',
  question: '优化器估计只返回一行，实际返回十八行，会付出什么额外代价？',
  objectives: [
    '沿索引叶项的 RID 取回数据记录',
    '用相同查询比较估计与实际工作量',
    '理解统计信息和物理布局如何影响选择',
  ],
  prerequisites: ['btree', 'database-pages'],
  nextConcepts: ['clustered-index', 'buffer-pool'],
  concepts: [
    {
      id: 'index',
      title: '数据库索引',
      content: '用额外的有序或散列结构定位记录，索引命中后可能仍需访问数据页取得未覆盖字段。',
      why: '选择性高的条件可以跳过大量无关记录，但索引维护与访问也有成本。',
      relatedConcepts: ['btree', 'database-page', 'query-optimizer'],
    },
    {
      id: 'query-optimizer',
      title: '查询优化器',
      content: '根据候选路径、统计信息和成本参数估价，选择预计较便宜的执行方式。',
      why: '同一个查询存在多种正确执行路径，数据分布会改变它们的代价。',
      relatedConcepts: ['index', 'query-statistics'],
    },
    {
      id: 'query-statistics',
      title: '统计信息与选择率',
      content: '结果行数、分布与数据页相关性影响访问成本；估计可能因采样、过时或相关性而失准。',
      why: '代价模型只能基于已掌握的信息做选择，计划正确性与性能优劣是两回事。',
      relatedConcepts: ['query-optimizer', 'index'],
    },
  ],
  experiments: [
    {
      id: 'cost-based-access',
      type: 'query-optimizer',
      title: '两条真实访问路径',
      description: '逐步执行扫描或 B+Tree 范围查找，修改随机读成本并更新统计。',
      question: 'EXPLAIN 的估计行数与实际执行返回行数相同吗？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '过时统计预计 category=1 只有 1 行，实际有 18 行，索引路径实际比扫描贵。这说明什么？',
    options: [
      { id: 'a', text: 'B+Tree 查找算法已经返回了错误记录。' },
      { id: 'b', text: '成本估计偏离实际分布；应更新统计并比较实际工作量，索引存在不保证必须使用。' },
      { id: 'c', text: '给同一列再创建一个相同索引就一定更快。' },
    ],
    answer: 'b',
    explanation:
      '两条路径返回相同记录集合，差别在读了多少索引叶页和数据页。统计更新能改善当前实例的选择，但不能保证任意复杂查询都得到现实中的最优计划。',
    hint: '先执行默认计划和两路径对照，再 ANALYZE，比较新的估计选择。',
  },
} satisfies Course
