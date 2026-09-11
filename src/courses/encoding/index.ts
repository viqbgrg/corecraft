import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'encoding',
  slug: 'encoding',
  title: '一个字符到底占几个字节',
  englishTitle: 'Unicode and UTF-8',
  level: 1,
  category: '数据表示',
  duration: 18,
  description: '把 A、中和表情编码为 UTF-8，再严格解码，区分字符、码点与字节。',
  question: 'A中🙂 为什么是 3 个标量值、4 个 UTF-16 单元、8 个字节？',
  objectives: ['区分 ASCII、Unicode 与具体编码', '识别 UTF-8 起始字节和续字节', '通过往返与非法序列验证编码'],
  prerequisites: ['binary'],
  nextConcepts: ['http', 'tcp-reliability'],
  concepts: [
    {
      id: 'unicode',
      title: 'Unicode 码点',
      content: 'Unicode 为文本元素分配码点；标量值排除代理项区间，可见字形可能由多个码点组合。',
      why: '字符身份必须与某一种存储字节布局分开。',
      relatedConcepts: ['utf8', 'binary'],
    },
    {
      id: 'utf8',
      title: 'UTF-8 与 ASCII',
      content:
        'UTF-8 用 1–4 字节编码标量值，ASCII 的 00–7F 保持单字节兼容；UTF-16 则使用一或两个 16 位代码单元。',
      why: '一致的编码规则让文本能跨存储、语言和网络还原。',
      relatedConcepts: ['unicode', 'http'],
    },
  ],
  experiments: [
    {
      id: 'utf8-roundtrip',
      type: 'encoding',
      title: '文字与字节转换台',
      description: '输入文本或十六进制字节，观察标量值、代码单元及严格解码结果。',
      question: '截断一个多字节字符时，应当悄悄显示它还是报告不完整？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '字符串 A中🙂 按 UTF-8 存储时占多少字节？',
    options: [
      { id: 'a', text: '3 字节：一个可见字符一定对应一个字节。' },
      { id: 'b', text: '4 字节：JavaScript length 就是 UTF-8 长度。' },
      { id: 'c', text: '8 字节：A 占 1、中占 3、🙂 占 4。' },
    ],
    answer: 'c',
    explanation:
      'UTF-8 字节数与 Unicode 标量值数量、UTF-16 代码单元数量分别是 8、3、4。JavaScript length 数的是 UTF-16 单元。',
    hint: '编码默认文本后，逐行把 UTF-8 字节数相加。',
  },
} satisfies Course
