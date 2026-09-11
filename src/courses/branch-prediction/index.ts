import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'branch-prediction',
  slug: 'branch-prediction',
  title: 'CPU 怎样预测分支',
  englishTitle: 'Branch Prediction',
  level: 2,
  category: '计算机组成',
  duration: 16,
  description: '从一次循环退出，理解 1 位历史和 2 位饱和计数器的取舍。',
  question: '还不知道 if 的结果，CPU 应该从哪里继续取指？',
  objectives: [
    '区分预测方向、实际结果与训练时机',
    '观察 2 位计数器怎样保留历史倾向',
    '用相同序列比较误判和额外周期',
  ],
  prerequisites: ['pipeline', 'instruction', 'binary'],
  nextConcepts: ['cache', 'process'],
  concepts: [
    {
      id: 'branch-prediction',
      title: '分支预测',
      content: '在条件结果尚未计算出来时，预测下一步沿跳转方向还是顺序方向取指。',
      why: '等待每个分支完成会让流水线前端闲置；预测让取指继续推进。',
      relatedConcepts: ['pipeline', 'branch-recovery'],
    },
    {
      id: 'saturating-counter',
      title: '2 位饱和计数器',
      content: '00 / 01 预测不跳转，10 / 11 预测跳转；实际跳转加一，不跳转减一，到边界后保持。',
      why: '单次反例不一定代表规律改变，保留倾向可以减少循环出口带来的反复误判。',
      relatedConcepts: ['binary', 'branch-prediction'],
    },
    {
      id: 'branch-recovery',
      title: '预测失败与恢复',
      content: '实际结果与预测不符时，放弃错误路径上的工作，从正确方向继续。',
      why: '预测可以错，程序可见的结果必须正确；恢复需要时间。',
      relatedConcepts: ['pipeline', 'instruction'],
    },
  ],
  experiments: [
    {
      id: 'branch-direction-predictor',
      type: 'branch-prediction',
      title: '分支预测实验台',
      description: '先预测，再揭晓，逐次观察计数器与误判代价。',
      question: '循环结尾的一次 N，为什么不一定改变下一次预测方向？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '2 位预测器处于 11（强跳转），遇到一次实际不跳转 N 后，下一次预测是什么？',
    options: [
      { id: 'a', text: '仍预测跳转：状态只减到 10（弱跳转）。' },
      { id: 'b', text: '预测不跳转：任何一次反例都会完全翻转方向。' },
      { id: 'c', text: '停止预测：错误只能靠重置修复。' },
    ],
    answer: 'a',
    explanation:
      '2 位计数器区分强弱倾向。11 遇到 N 变为 10；再遇到 N 才降到 01 并预测不跳转。这种迟滞对循环有用，却不保证适合所有模式。',
    hint: '在默认循环的第 5 次分支前后，观察 11 → 10，再预测第 6 次的 T。',
  },
} satisfies Course
