import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'floating-point',
  slug: 'floating-point',
  title: '为什么加了 1，结果没有变化',
  englishTitle: 'Floating Point and Rounding',
  level: 1,
  category: '数据表示',
  duration: 22,
  description: '拆解 IEEE 754 binary32，比较十进制精确值、二进制编码与舍入误差。',
  question: '0.1 的误差从哪里来，大整数附近的间距为什么更大？',
  objectives: ['区分符号、指数与小数域', '观察最近偶数舍入和有效精度', '识别正规数、次正规数、零与特殊值'],
  prerequisites: ['binary', 'signed-number'],
  nextConcepts: ['cpu', 'encoding'],
  concepts: [
    {
      id: 'floating-point',
      title: '浮点表示',
      content: 'binary32 用 1 位符号、8 位指数、23 位小数域表示缩放后的有效数字；正规数隐含一个前导 1。',
      why: '有限比特可以覆盖很大数值范围，代价是相邻可表示数间距随量级变化。',
      relatedConcepts: ['float-rounding', 'binary'],
    },
    {
      id: 'float-rounding',
      title: '舍入与有效精度',
      content: '精确值落在两个可表示数之间时取最近值，恰好中点选择有效数字末位为偶数的一侧。',
      why: '十进制输入和算术结果都可能无法精确装入有限二进制位。',
      relatedConcepts: ['floating-point', 'signed-number'],
    },
  ],
  experiments: [
    {
      id: 'float32-lab',
      type: 'floating-point',
      title: 'binary32 编码与舍入',
      description: '用精确有理数求参考值，直接舍入到 32 位浮点并显示误差。',
      question: '16777216 与它的下一个可表示数相差多少？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: 'binary32 中 16777216 + 1 为什么仍然是 16777216？',
    options: [
      { id: 'a', text: '发生指数溢出，因此加法被忽略。' },
      { id: 'b', text: '该区间相邻浮点数间距为 2，结果在中点，最近偶数舍入选中了 16777216。' },
      { id: 'c', text: '所有大于一千万的整数都不能表示。' },
    ],
    answer: 'b',
    explanation:
      '2^24 的后一个 binary32 数为 2^24+2。精确和 2^24+1 位于中点，前者有效数字最低位为偶数。这是精度舍入，并未接近指数溢出。',
    hint: '比较 16777216+1 与 16777216+2 的编码和结果。',
  },
} satisfies Course
