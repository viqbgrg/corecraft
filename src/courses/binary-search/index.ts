import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'binary-search',
  slug: 'binary-search',
  title: '二分查找怎样守住边界',
  englishTitle: 'Binary Search Invariants',
  level: 5,
  category: '算法',
  duration: 16,
  description: '在有序数组中寻找第一个不小于目标的位置，观察候选区间逐次缩小。',
  question: '中点已经等于目标，为什么还要继续向左找？',
  objectives: ['验证输入有序这一前提', '维护半开区间的不变量', '区分匹配位置与未找到时的插入点'],
  prerequisites: ['array'],
  nextConcepts: ['sorting', 'btree'],
  concepts: [
    {
      id: 'binary-search',
      title: '二分查找',
      content: '利用单调性质，每次比较排除一部分不可能的区域，将候选区间缩小约一半。',
      why: '有序输入允许用 O(log n) 次比较定位边界。',
      relatedConcepts: ['array', 'sorting'],
    },
    {
      id: 'lower-bound',
      title: '第一个不小于目标的位置',
      content: '循环保持 [0,lo) 全小于目标、[hi,n) 全不小于目标，未知区域为 [lo,hi)。',
      why: '重复键也能得到一致的左边界；目标不存在时返回插入点。',
      relatedConcepts: ['binary-search', 'btree'],
    },
  ],
  experiments: [
    {
      id: 'lower-bound-lab',
      type: 'search',
      title: '二分边界实验台',
      description: '显式显示 lo、hi、mid 与每一步排除的区域。',
      question: '什么时候能保证循环结束？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '查找第一个不小于 target 的位置，当 a[mid] 等于 target 时应怎样更新？',
    options: [
      { id: 'a', text: '立即返回 mid，不必考虑前面是否还有相同值。' },
      { id: 'b', text: '令 lo=mid，保留这个中点并重复比较。' },
      { id: 'c', text: '令 hi=mid，继续在左侧寻找更早的满足位置。' },
    ],
    answer: 'c',
    explanation: '相等只说明 mid 满足条件，并不能证明它是第一个。保留边界 hi=mid，同时缩小候选半开区间。',
    hint: '默认数组中 3 出现三次，最终 lower_bound 应为索引 1。',
  },
} satisfies Course
