import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'java-file-io',
  slug: 'java-file-io',
  title: '文件流、缓冲与持久化',
  englishTitle: 'File Streams, Buffering and Durability',
  level: 11,
  category: 'Java IO / NIO',
  duration: 28,
  description: '逐字节复制真实 UTF-8 文件，比较 read 调用数，并在断电前后检验 flush 与 force。',
  question: 'flush 返回，为什么断电后仍可能没有完整文件？',
  objectives: [
    'InputStream.read 返回 0–255 的字节或 -1；缓冲改变底层调用粒度，不改变字节序列。',
    'flush 使用户态缓冲交给下一层，force 作用于内核已接收的文件页；顺序影响恢复结果。',
  ],
  prerequisites: ['java-io-apis', 'page-cache'],
  nextConcepts: ['nio-selector'],
  concepts: [
    {
      id: 'file-stream',
      title: 'File IO 与字节流',
      content: 'InputStream.read 返回 0–255 的字节或 -1；缓冲改变底层调用粒度，不改变字节序列。',
      why: '字节、字符与 EOF 必须分开。',
      relatedConcepts: ['java-io-apis', 'encoding'],
    },
    {
      id: 'stream-durability',
      title: '流缓冲与稳定存储',
      content: 'flush 使用户态缓冲交给下一层，force 作用于内核已接收的文件页；顺序影响恢复结果。',
      why: '应用写完和持久化不是同一时点。',
      relatedConcepts: ['page-cache', 'filesystem'],
    },
  ],
  experiments: [
    {
      id: 'java-file-io-lab',
      type: 'java-file-io',
      title: '文件流、缓冲与持久化',
      description: '逐字节复制真实 UTF-8 文件，比较 read 调用数，并在断电前后检验 flush 与 force。',
      question: 'flush 返回，为什么断电后仍可能没有完整文件？',
      config: {},
    },
  ],
  challenge: {
    question: 'BufferedOutputStream 仍有两个字节没 flush，先对文件 force 能保证什么？',
    options: [
      {
        id: 'a',
        text: '这两个字节也一定稳定写入，因为它们已经在 Java 内存里。',
      },
      {
        id: 'b',
        text: 'force 只能持久化文件层已接收的数据；仍在流缓冲里的两个字节需要先 flush。',
      },
      {
        id: 'c',
        text: 'close 从来不会刷新输出缓冲。',
      },
    ],
    answer: 'b',
    explanation:
      '用户态输出缓冲不属于 FileChannel 已接收的文件内容。先 flush 再 force 才能把本次完整输出纳入对应持久化请求。',
    hint: '观察 outputBuffer、Page Cache、稳定文件三个位置。',
  },
  content,
} satisfies Course
