import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'java-io-apis',
  slug: 'java-io-apis',
  title: '同一个 read，返回的单位为什么不同',
  englishTitle: 'Java Streams, Readers and NIO Buffers',
  level: 8,
  category: 'Java 核心',
  duration: 25,
  description: '读取同一份 UTF-8 文件，比较字节流、字符 Reader 与 FileChannel / ByteBuffer 的返回值和位置。',
  question: '字符串 A中🙂B 为什么有 9 个 UTF-8 字节，却只有 5 个 Java char？',
  objectives: [
    'InputStream 处理字节，Reader 按字符解码后返回 UTF-16 单元，必须明确字符集。',
    'Channel 在 position 与 limit 限定的剩余范围内传输，调用者管理 Buffer 边界。',
    'EOF、Buffer 满、输入已关闭分别有不同返回值或异常，close 不抹掉已复制的数据。',
  ],
  prerequisites: ['encoding', 'filesystem', 'java-objects'],
  nextConcepts: ['reactor', 'io-multiplexing'],
  concepts: [
    {
      id: 'java-io',
      title: 'Java IO 与 Reader',
      content: 'InputStream 处理字节，Reader 按字符解码后返回 UTF-16 单元，必须明确字符集。',
      why: '错误单位和默认字符集容易导致截断或乱码。',
      relatedConcepts: ['encoding', 'filesystem'],
    },
    {
      id: 'java-nio',
      title: 'NIO Buffer 与 Channel',
      content: 'Channel 在 position 与 limit 限定的剩余范围内传输，调用者管理 Buffer 边界。',
      why: '读取、处理与复用缓冲区需要显式的状态转换。',
      relatedConcepts: ['java-io', 'page-cache'],
    },
    {
      id: 'java-io-lifecycle',
      title: 'IO 资源生命周期',
      content: 'EOF、Buffer 满、输入已关闭分别有不同返回值或异常，close 不抹掉已复制的数据。',
      why: '正确循环需要处理每一种结束与暂停条件。',
      relatedConcepts: ['java-nio', 'io-multiplexing'],
    },
  ],
  experiments: [
    {
      id: 'java-io-apis-lab',
      type: 'java-io-apis',
      title: '相同文件的三个独立输入',
      description:
        '读取同一份 UTF-8 文件，比较字节流、字符 Reader 与 FileChannel / ByteBuffer 的返回值和位置。',
      question: 'ByteBuffer 满时 read 返回 0，能当成文件结束吗？',
      config: {},
    },
  ],
  challenge: {
    question: 'FileChannel.read(buffer) 返回 0，且 buffer 没有 remaining，正确解释是什么？',
    options: [
      {
        id: 'a',
        text: '文件必定已结束，应永久停止读取。',
      },
      {
        id: 'b',
        text: '当前 Buffer 没有空间；应按处理流程 flip、消费和 compact 或 clear，再继续读取，EOF 用 −1 判断。',
      },
      {
        id: 'c',
        text: 'NIO 的所有文件通道都可以注册 Selector 等待就绪。',
      },
    ],
    answer: 'b',
    explanation:
      '容量边界与文件末尾是不同状态。FileChannel 是 NIO API，但不是可选择的 SocketChannel，也不支持以同样方式注册 Selector。',
    hint: '先把 Buffer 填满，再读一次，接着 flip 后消费。',
  },
  content,
} satisfies Course
