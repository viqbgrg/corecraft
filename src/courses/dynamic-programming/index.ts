import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'dynamic-programming',
  slug: 'dynamic-programming',
  title: '眼前最优，最后也最优吗',
  englishTitle: 'Greedy and Dynamic Programming',
  level: 5,
  category: '算法',
  duration: 22,
  description: '用找零问题比较贪心选择与最优子问题，回溯真实的硬币组合。',
  question: '面额 1、3、4，凑出 6 时先拿 4 为什么会多用一枚？',
  objectives: ['用反例检验贪心选择', '定义状态、初值和转移', '从最优子问题回溯一个完整解'],
  prerequisites: ['array', 'sorting'],
  nextConcepts: ['dijkstra', 'btree'],
  concepts: [
    {
      id: 'greedy',
      title: '贪心选择',
      content: '每步做当前看来最好的选择，不回头枚举所有组合；正确性需要针对具体问题证明。',
      why: '有些问题允许简单快速的局部选择，但不能把直觉当成普遍定理。',
      relatedConcepts: ['dynamic-programming', 'dijkstra'],
    },
    {
      id: 'dynamic-programming',
      title: '动态规划',
      content: '把问题定义为可复用的子问题，保存最优值，再由更小状态构建较大状态。',
      why: '避免重复求解重叠子问题，同时比较所有合法的最后一步。',
      relatedConcepts: ['array', 'greedy'],
    },
  ],
  experiments: [
    {
      id: 'coin-change',
      type: 'optimization',
      title: '找零策略实验台',
      description: '可编辑面额与目标，支持不可达状态和方案回溯。',
      question: '贪心走不下去，是否足以证明问题无解？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '面额 3、4，目标 6。贪心取 4 后剩 2 无法继续，可以得出什么结论？',
    options: [
      { id: 'a', text: '6 无法由这些面额组成。' },
      { id: 'b', text: '只说明这条贪心路径失败；动态规划仍能找到 3+3。' },
      { id: 'c', text: '必须增加面额 1，任何算法才能求解。' },
    ],
    answer: 'b',
    explanation:
      '局部最大面额没有可行延伸，不代表其他组合不存在。DP 比较每个合法最后一枚，能发现 dp[6]=dp[3]+1=2。',
    hint: '将面额输入改为 3 4，运行两种策略，对比不可达状态与失败的局部选择。',
  },
} satisfies Course
