import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'sorting',
  slug: 'sorting',
  title: '排序在比较什么、移动什么',
  englishTitle: 'Sorting and Stability',
  level: 5,
  category: '算法',
  duration: 30,
  description: '逐步执行插入、选择和归并排序，保留原始编号观察稳定性。',
  question: '两个元素的值相等，排序后为什么还要关心它们的先后？',
  objectives: ['分别观察比较与写入次数', '解释归并中的辅助空间', '通过原始编号验证稳定性'],
  prerequisites: ['array', 'binary-search'],
  nextConcepts: ['trees-heaps', 'dynamic-programming'],
  concepts: [
    {
      id: 'sorting',
      title: '比较排序',
      content: '通过比较键建立有序结果，不同算法在比较、移动和额外空间上做不同取舍。',
      why: '有序数据支持二分查找、范围处理与后续聚合。',
      relatedConcepts: ['binary-search', 'array'],
    },
    {
      id: 'sort-stability',
      title: '排序稳定性',
      content: '相等键的元素保持输入中的相对顺序。这里用原始编号观察，编号不参与比较。',
      why: '多字段排序或先前分组的顺序可能需要保留。',
      relatedConcepts: ['sorting', 'merge-sort'],
    },
    {
      id: 'merge-sort',
      title: '归并排序',
      content: '递归排序左右两半，再用辅助缓冲合并；相等时先取左侧即可保持稳定。',
      why: '把大排序化为较小的有序问题，并用线性合并获得 O(n log n) 比较级别。',
      relatedConcepts: ['sorting', 'array'],
    },
  ],
  experiments: [
    {
      id: 'sorting-lab',
      type: 'sorting',
      title: '排序轨迹实验台',
      description: '从用户输入真实生成比较、交换、合并轨迹。',
      question: '选择排序的一次远距离交换会改变哪些元素的相对顺序？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '要让归并排序稳定，左右两半当前元素值相等时应怎样选择？',
    options: [
      { id: 'a', text: '先取右侧，因为右侧的值更新。' },
      { id: 'b', text: '先取左侧，因为左侧同值元素在原输入中更早。' },
      { id: 'c', text: '随机选一个，不会影响稳定性。' },
    ],
    answer: 'b',
    explanation: '左右子区间内部已稳定；相等时先选左侧，可以继续保持跨区间的原始先后顺序。',
    hint: '用 2 2 1 作为输入，观察相同值下方的 #0 与 #1。',
  },
} satisfies Course
