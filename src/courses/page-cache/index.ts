import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'page-cache',
  slug: 'page-cache',
  title: '改了映射内存，文件就落盘了吗',
  englishTitle: 'Page Cache and mmap',
  level: 3,
  category: '文件与 IO',
  duration: 24,
  description: '让两个进程共享文件页，再进行私有写时复制，比较可见性、缺页与持久化。',
  question: '一次 mmap 缺页为什么可以完全不读磁盘？',
  objectives: [
    '区分建立映射、驻留页与 Page Cache',
    '验证 MAP_SHARED 与 MAP_PRIVATE 的写入行为',
    '观察脏页写回、淘汰与重启丢失',
  ],
  prerequisites: ['filesystem', 'virtual-memory'],
  nextConcepts: ['io-multiplexing', 'buffer-pool'],
  concepts: [
    {
      id: 'page-cache',
      title: '文件 Page Cache',
      content: '内核以文件页缓存数据；普通读取和文件映射可以复用同一文件页，脏页需要写回。',
      why: '减少重复磁盘访问，同时把可见性与持久化解耦。',
      relatedConcepts: ['mmap', 'file', 'buffer-pool'],
    },
    {
      id: 'mmap',
      title: '文件映射',
      content: '建立虚拟地址范围与文件偏移的关系；访问时再解析驻留状态，缺页可能复用已经缓存的页。',
      why: '程序可以通过内存访问文件内容，但仍需要处理缺页和同步边界。',
      relatedConcepts: ['page-cache', 'page-fault', 'copy-on-write'],
    },
    {
      id: 'copy-on-write',
      title: '私有写时复制',
      content: 'MAP_PRIVATE 首次写入时为该进程建立私有副本，后续私有修改不写回文件。',
      why: '共享初始读取资源，同时隔离进程对内容的修改。',
      relatedConcepts: ['mmap', 'virtual-memory'],
    },
  ],
  experiments: [
    {
      id: 'file-page-cache',
      type: 'page-cache',
      title: '文件页与两个映射进程',
      description: '操作映射、普通读、共享写、私有写、同步与模拟重启。',
      question: 'Q 看到 P 的值变成 99，磁盘上的值一定也是 99 吗？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: 'P 通过 MAP_SHARED 写入 99，Q 已经读到 99，但没有发生写回。能得出什么结论？',
    options: [
      { id: 'a', text: '99 已经持久化，立即断电也必然保留。' },
      { id: 'b', text: '共享内存中的修改已可见；持久化还需要相应写回和同步语义。' },
      { id: 'c', text: '只要使用 mmap，就不会发生缺页。' },
    ],
    answer: 'b',
    explanation:
      '可见性与持久化是不同条件。本实验中磁盘列仍可保留旧值，直到 fsync、共享映射 msync 或脏页回收写回。',
    hint: 'P 写入后让 Q 读取，然后对照磁盘值、缓存值和脏页状态。',
  },
} satisfies Course
