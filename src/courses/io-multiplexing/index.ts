import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'io-multiplexing',
  slug: 'io-multiplexing',
  title: '为什么有数据，却再也等不到事件',
  englishTitle: 'IO Multiplexing and epoll',
  level: 3,
  category: '文件与 IO',
  duration: 24,
  description: '给多个 FD 注入字节，比较阻塞、非阻塞和 select / poll / epoll，重现 ET 部分读取停滞。',
  question: '就绪通知返回之后，谁负责把缓冲里的字节读完？',
  objectives: [
    '区分阻塞调用与非阻塞 EAGAIN',
    '比较描述符扫描与就绪集合',
    '验证 LT / ET 与读至 EAGAIN 的关系',
  ],
  prerequisites: ['process', 'filesystem'],
  nextConcepts: ['socket', 'reactor'],
  concepts: [
    {
      id: 'blocking-io',
      title: '阻塞与非阻塞 IO',
      content: '阻塞 read 在暂无数据时等待指定 FD；非阻塞 read 立即返回 EAGAIN，让程序保留控制权。',
      why: '一个连接的等待不应无条件阻止程序处理其他连接。',
      relatedConcepts: ['io-multiplexing', 'socket'],
    },
    {
      id: 'io-multiplexing',
      title: 'IO 多路复用',
      content: '用一次就绪等待关注多个描述符，再由应用对就绪 FD 执行读写。',
      why: '减少逐个阻塞等待或反复忙轮询多个连接。',
      relatedConcepts: ['select-poll', 'epoll', 'reactor'],
    },
    {
      id: 'select-poll',
      title: 'select 与 poll',
      content: 'select 使用编号范围内的集合，poll 使用描述符数组；调用者提交感兴趣的集合并接收就绪信息。',
      why: '统一等待接口能表达多个 FD 的 IO 条件，集合表示影响扩展方式。',
      relatedConcepts: ['epoll', 'io-multiplexing'],
    },
    {
      id: 'epoll',
      title: 'epoll 的 LT 与 ET',
      content:
        'epoll 管理兴趣集合与就绪通知；LT 可持续报告仍就绪的 FD，ET 依赖事件变化，应结合非阻塞读取至 EAGAIN。',
      why: '就绪与通知不是同一状态，处理不完整可能让剩余数据停在缓冲中。',
      relatedConcepts: ['blocking-io', 'reactor'],
    },
  ],
  experiments: [
    {
      id: 'readiness-events',
      type: 'io-multiplexing',
      title: '多描述符接收缓冲',
      description: '控制字节到达、就绪检查、部分读取与排空。',
      question: 'ET 通知一次后只读两字节，余下字节会自动产生另一个通知吗？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: 'ET 模式返回 FD 3 的可读事件，应用只读走一部分数据。下一步应怎样处理？',
    options: [
      { id: 'a', text: '保证马上出现相同事件，直接等待即可。' },
      { id: 'b', text: '继续非阻塞读取，直到 EAGAIN；不能依赖剩余字节自动再次通知。' },
      { id: 'c', text: 'EAGAIN 表示对方已关闭连接，应立即丢弃 FD。' },
    ],
    answer: 'b',
    explanation:
      'ET 的通知可能被合并，部分读取留下的数据不保证触发新通知。EAGAIN 表示当前暂时无法继续；EOF 才是 read 返回 0，本模型没有模拟关闭事件。',
    hint: '默认到达 abcd，取事件后读 ab，再检查事件，最后循环读至 EAGAIN。',
  },
} satisfies Course
