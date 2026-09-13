import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'page-replacement',
  slug: 'page-replacement',
  title: '内存满了，淘汰哪一页',
  englishTitle: 'Page Replacement',
  level: 3,
  category: '操作系统',
  duration: 25,
  description: '观察 FIFO、LRU、Clock 与最优策略如何选择牺牲页。',
  question: '多给一个物理帧，缺页次数一定减少吗？',
  objectives: ['区分进入顺序与使用顺序', '逐次观察引用位与 Clock 指针', '用同一序列验证 Belady 异常'],
  prerequisites: ['virtual-memory', 'page-fault'],
  nextConcepts: ['cache', 'buffer-pool'],
  concepts: [
    {
      id: 'page-replacement',
      title: '页面置换',
      content: '当可用帧不足，必须挑一个驻留页离开内存，再放入当前需要的页。',
      why: '有限的物理内存不能同时容纳所有可访问的虚拟页。',
      relatedConcepts: ['page', 'page-fault'],
    },
    {
      id: 'lru',
      title: '最近最少使用',
      content: '用最近访问时间推测下一次使用；命中也会改变使用顺序。',
      why: '程序经常重复访问近期数据，但这是局部性的启发式而非预知未来。',
      relatedConcepts: ['cache', 'page-replacement'],
    },
    {
      id: 'clock',
      title: 'Clock 与引用位',
      content: '指针遇到引用位 1 时清零并继续，遇到 0 时替换，近似记录近期访问。',
      why: '精确 LRU 的维护可能较昂贵，第二次机会降低元数据更新成本。',
      relatedConcepts: ['lru', 'page'],
    },
  ],
  experiments: [
    {
      id: 'page-replacement-lab',
      type: 'page-replacement',
      title: '页面置换实验台',
      description: '输入访问序列与帧数，比较四种策略。',
      question: 'FIFO 为什么可能出现更多内存、更多缺页？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '默认序列在 FIFO 下，3 帧缺页 9 次，4 帧缺页 10 次。应怎样解释？',
    options: [
      { id: 'a', text: 'FIFO 的驻留集合不保证随容量包含，所以可能发生 Belady 异常。' },
      { id: 'b', text: '物理内存越大，任何策略都会增加缺页。' },
      { id: 'c', text: '只要是合法虚拟地址，就不该发生缺页。' },
    ],
    answer: 'a',
    explanation: '容量改变会改变 FIFO 的淘汰顺序。LRU 的栈包含性质避免这种异常，但 FIFO 不具备该性质。',
    hint: '比较第 7 次访问页 5 之后的帧内容，继续跟踪页 1、2、3、4。',
  },
} satisfies Course
