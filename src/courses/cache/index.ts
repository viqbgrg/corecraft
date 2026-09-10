import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'cache', slug: 'cache', title: 'Cache 与局部性', englishTitle: 'Closer is Faster', level: 2, category: '计算机组成', duration: 15,
  description: '改变访问顺序，亲眼看到“更近的数据”为什么更快。',
  question: 'CPU 为什么不每次都直接读取内存？',
  objectives: ['区分 L1 Hit、L2 Hit 与 Memory Access', '观察 Cache Line 如何带来空间局部性', '比较相同数据在不同访问顺序下的成本'],
  prerequisites: ['cpu', 'memory'], nextConcepts: ['virtual-memory', 'page-cache', 'buffer-pool'],
  concepts: [
    { id: 'cache', title: 'Cache', content: '把部分数据副本保存在更靠近 CPU 的小容量存储中。', why: 'CPU 与主存的速度、容量和成本不同，需要存储层级来折中。', relatedConcepts: ['cache-line', 'locality'] },
    { id: 'cache-line', title: 'Cache Line', content: '缓存填充、替换的基本单位，包含连续的一段地址。本实验为 16 字节。', why: '相邻数据经常一起使用，一次搬运整行能够摊薄传输成本。', relatedConcepts: ['locality', 'page'] },
    { id: 'locality', title: '局部性', content: '时间局部性是很快再次访问相同数据；空间局部性是访问相邻数据。', why: '缓存只有在未来访问与已加载数据相关时才有收益。', relatedConcepts: ['page-cache', 'buffer-pool'] },
  ],
  experiments: [{ id: 'cache-hierarchy', type: 'cache', title: '存储层级实验台', description: '从 CPU 出发，跟踪每次访问的实际路径。', question: '为什么访问 0x1000 后，0x1004 常常会命中？', config: { lineSize: 16 } }],
  content,
  challenge: { question: '冷缓存中访问 0x1000 后，再访问 0x1004 命中 L1，最直接的原因是什么？', options: [{ id: 'a', text: 'CPU 预测了 0x1004，提前执行了读取。' }, { id: 'b', text: '0x1000 和 0x1004 是同一个地址。' }, { id: 'c', text: '首次访问加载了包含两个地址的整个 Cache Line。' }], answer: 'c', explanation: '本模型不包含预取器。16 B 的缓存行覆盖 0x1000–0x100F，因此四个对齐的 4 B 数据一起进入缓存。', hint: '查看 L1 行中显示的地址范围。' },
} satisfies Course
