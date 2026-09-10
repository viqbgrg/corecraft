import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'binary', slug: 'binary', title: '二进制与位运算', englishTitle: 'Binary & Bits', level: 1, category: '计算机基础', duration: 12,
  description: '从翻转一个比特开始，认识计算机表达世界的方式。',
  question: '为什么计算机偏爱 0 和 1，而不是我们熟悉的十进制？',
  objectives: ['用位权解释二进制，而非背转换公式', '操作 AND、OR、XOR 并观察每一位', '亲手制造溢出，理解有限位宽'],
  prerequisites: [], nextConcepts: ['cpu', 'instruction', 'signed-number'],
  concepts: [
    { id: 'binary', title: '二进制', content: '位置从右向左依次代表 1、2、4、8……。某一位为 1，就把这一位的权重计入总和。', why: '用两种容易区分的物理状态编码，能为噪声留下余地，电路也更容易组合。', relatedConcepts: ['bit', 'logic'] },
    { id: 'bit', title: '位与字节', content: 'bit 是一个二进制位，8 bit 构成 1 byte。8 位无符号数有 256 种状态，对应 0–255。', why: '有限的存储单元决定了可以表达多少种状态。', relatedConcepts: ['overflow', 'memory'] },
    { id: 'logic', title: '位运算', content: 'AND 两位都为 1 才输出 1；OR 至少一个为 1；XOR 两位不同时为 1。', why: '逻辑门组合后能够做判断、选择和算术。', relatedConcepts: ['alu'] },
    { id: 'overflow', title: '无符号溢出', content: '超出位宽的进位不在存储结果中。8 位加法的结果等于完整和对 256 取模。', why: '硬件寄存器只有固定数量的位，不会随着数值增长自动变长。', relatedConcepts: ['register', 'signed-number'] },
  ],
  experiments: [{ id: 'binary-playground', type: 'binary', title: '比特实验台', description: '每一位都是开关，试着改变输入，发现结果。', question: '255 + 1 为什么会得到 0？', config: { width: 8 } }],
  content,
  challenge: {
    question: '把 A 设为 255，B 设为 1，进行 8 位无符号加法。为什么结果区只剩下 0？',
    options: [{ id: 'a', text: '二进制不能表达 256，所以计算失败了。' }, { id: 'b', text: '完整结果是 1 00000000，但寄存器只保留低 8 位。' }, { id: 'c', text: '加法会自动把两个相同的位全部删除。' }],
    answer: 'b', explanation: '256 可以用 9 位二进制表示。限制来自 8 位寄存器，不是二进制本身；结果为 0，Carry 为 1。', hint: '看看进位 Carry，再数一数 256 的二进制需要几位。',
  },
} satisfies Course
