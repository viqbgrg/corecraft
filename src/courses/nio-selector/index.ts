import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'nio-selector',
  slug: 'nio-selector',
  title: 'Channel、Selector 与半包',
  englishTitle: 'NIO Channels, Selectors and Partial Frames',
  level: 11,
  category: 'Java IO / NIO',
  duration: 28,
  description: '注册非阻塞连接，保留 selected keys 和 Buffer 半包，分次写回并管理 OP_WRITE。',
  question: '一次 READ 就绪，为什么仍不能解出完整消息？',
  objectives: [
    'flip 切换已写区域供解析，compact 保存未消费字节并恢复接收位置。',
    '非阻塞 read 或 write 可以只搬运部分字节，零表示本次无进展，-1 表示读取 EOF。',
    '就绪 key 保留至应用移除；OP_WRITE 应随待写数据变化管理，避免空转。',
  ],
  prerequisites: ['java-file-io', 'io-multiplexing'],
  nextConcepts: ['netty-reactor'],
  concepts: [
    {
      id: 'nio-buffer',
      title: 'Buffer 的位置与未消费数据',
      content: 'flip 切换已写区域供解析，compact 保存未消费字节并恢复接收位置。',
      why: 'TCP 字节边界与应用帧边界不同。',
      relatedConcepts: ['java-io-apis'],
    },
    {
      id: 'nio-channel',
      title: 'Channel 的短传输',
      content: '非阻塞 read 或 write 可以只搬运部分字节，零表示本次无进展，-1 表示读取 EOF。',
      why: '事件驱动仍需要维护传输进度。',
      relatedConcepts: ['tcp-reliability'],
    },
    {
      id: 'nio-selector-key',
      title: 'Selector 与兴趣集合',
      content: '就绪 key 保留至应用移除；OP_WRITE 应随待写数据变化管理，避免空转。',
      why: '通知不是自动读取，也不是一次性注册。',
      relatedConcepts: ['io-multiplexing', 'reactor'],
    },
  ],
  experiments: [
    {
      id: 'nio-selector-lab',
      type: 'nio-selector',
      title: 'Channel、Selector 与半包',
      description: '注册非阻塞连接，保留 selected keys 和 Buffer 半包，分次写回并管理 OP_WRITE。',
      question: '一次 READ 就绪，为什么仍不能解出完整消息？',
      config: {},
    },
  ],
  challenge: {
    question: '收到 [2,65]，协议第一个字节是载荷长度，解析不足时应怎样继续？',
    options: [
      {
        id: 'a',
        text: '把 65 当成完整消息，清空 Buffer。',
      },
      {
        id: 'b',
        text: '保留长度头和已有载荷，compact 后继续接收 66，才能解出 AB。',
      },
      {
        id: 'c',
        text: 'Selector 会自动补足缺少字节并移动 position。',
      },
    ],
    answer: 'b',
    explanation:
      '长度 2 需要两个载荷字节。当前只有 A，compact 保留未消费的 [2,65]，下次追加 B 后才组成完整帧。',
    hint: '检查 compact 前后 position、limit 和未消费字节。',
  },
  content,
} satisfies Course
