import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'signed-number',
  slug: 'signed-number',
  title: '为什么 127 加 1 会变成负数',
  englishTitle: 'Two’s Complement and Overflow',
  level: 1,
  category: '数据表示',
  duration: 18,
  description: '逐位计算补码加减法，用边界反例区分无符号进位与有符号溢出。',
  question: '最高位进位为 0，为什么结果仍然可能溢出？',
  objectives: ['按位权解释补码', '用同一个加法器执行加法与减法', '分别判断 Carry 和 Overflow'],
  prerequisites: ['binary'],
  nextConcepts: ['floating-point', 'cpu'],
  concepts: [
    {
      id: 'signed-number',
      title: '有符号数与补码',
      content: 'n 位补码最高位权重为 −2^(n−1)，其余位为正权，范围为 −2^(n−1) 到 2^(n−1)−1。',
      why: '在固定比特数内表示正负整数，并复用模 2^n 加法。',
      relatedConcepts: ['binary', 'signed-overflow'],
    },
    {
      id: 'signed-overflow',
      title: '进位与有符号溢出',
      content:
        'Carry 是最高位向外的进位；Overflow 是数学结果超出有符号范围，等于最高位进位输入与输出的异或。',
      why: '相同结果位可以有不同解释，必须按数值语义判断越界。',
      relatedConcepts: ['signed-number', 'cpu'],
    },
  ],
  experiments: [
    {
      id: 'signed-arithmetic',
      type: 'signed-number',
      title: '补码加法器',
      description: '切换 4 / 8 位与加减法，跟踪每一位的进位。',
      question: '−1 + 1 与最大正数 + 1 的两个标志为何不同？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '8 位补码中 127 + 1 得到 10000000。正确判断是什么？',
    options: [
      { id: 'a', text: 'Carry=0、Overflow=1；结果按补码解释为 −128。' },
      { id: 'b', text: 'Carry=1、Overflow=1；最高位为 1 就代表进位。' },
      { id: 'c', text: 'Carry=0、Overflow=0；没有向外进位就没有溢出。' },
    ],
    answer: 'a',
    explanation:
      '进入符号位的进位为 1，离开符号位为 0，因此 Overflow=1。保留的最高位是结果的一部分，不是 Carry。',
    hint: '完成默认逐位计算，比较最后一行的进位输入和进位输出。',
  },
} satisfies Course
