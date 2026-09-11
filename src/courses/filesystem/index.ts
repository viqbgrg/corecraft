import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'filesystem',
  slug: 'filesystem',
  title: '文件删了，为什么还能继续读取',
  englishTitle: 'Files, Inodes and Directories',
  level: 3,
  category: '文件与 IO',
  duration: 22,
  description: '建立硬链接、打开文件、删除所有名称，跟踪 inode 引用与磁盘块回收。',
  question: '文件名、inode 和文件描述符分别指向什么？',
  objectives: [
    '沿目录项找到 inode 和数据块',
    '区分硬链接数与打开引用数',
    '验证 unlink、read、close 的不同作用',
  ],
  prerequisites: ['process', 'memory'],
  nextConcepts: ['page-cache', 'io-multiplexing'],
  concepts: [
    {
      id: 'file',
      title: '文件与文件描述符',
      content: '文件组织持久数据；进程通过打开得到的 FD 操作一个已打开的文件对象，并维护读取偏移。',
      why: '后续 IO 不必反复按名称查找，也能独立跟踪读取位置。',
      relatedConcepts: ['inode', 'page-cache'],
    },
    {
      id: 'inode',
      title: 'inode 与链接数',
      content: 'inode 保存文件元数据和块映射；多个硬链接可引用同一个 inode，打开引用也会延长对象生命周期。',
      why: '名称与对象分离后，改名或删除名称不必立刻销毁正在使用的数据。',
      relatedConcepts: ['directory', 'file'],
    },
    {
      id: 'directory',
      title: '目录项',
      content: '目录把文件名映射到 inode；unlink 删除一个名字与对象的关联。',
      why: '名字用于查找，数据对象由独立身份与引用关系管理。',
      relatedConcepts: ['inode', 'file-block'],
    },
    {
      id: 'file-block',
      title: '文件数据块',
      content: '文件字节按块分配，inode 记录逻辑内容使用的物理块；文件长度与分配空间不必相等。',
      why: '固定分配单位简化空间管理，但可能产生内部碎片。',
      relatedConcepts: ['inode', 'page-cache'],
    },
  ],
  experiments: [
    {
      id: 'inode-lifetime',
      type: 'filesystem',
      title: '小型 inode 文件系统',
      description: '操作目录、硬链接、FD、偏移与 12 个数据块。',
      question: 'nlink=0 时，是否一定能立刻释放数据块？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '文件的全部名字已被 unlink，但还有一个打开的 FD。此时会怎样？',
    options: [
      { id: 'a', text: 'FD 立即失效，任何读取都会失败。' },
      { id: 'b', text: '名字无法再查到，但 FD 仍引用 inode；最后一个打开引用关闭后才能回收。' },
      { id: 'c', text: '内核必须给这个文件自动创建一个新名字。' },
    ],
    answer: 'b',
    explanation:
      '目录链接数与打开引用是两种生命周期条件。unlink 移除名字，不撤销已有 FD；只有两种引用都消失时，本模型才释放 inode 与数据块。',
    hint: '先 open note，创建 copy，再删掉 note 和 copy，通过原 FD 读出 ABCD。',
  },
} satisfies Course
