import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'java-memory-model',
  slug: 'java-memory-model',
  title: '看到 ready=true，为什么仍可能读到旧数据',
  englishTitle: 'Java Memory Model and Happens-Before',
  level: 8,
  category: 'Java 核心',
  duration: 25,
  description: '构建两线程事件与同步边，枚举发布程序的允许结果，并拒绝违反 happens-before 的读取。',
  question: '把一个标志声明成 volatile，究竟增加了哪一条保证？',
  objectives: [
    'JMM 规定线程间读写可以观察哪些值，与 JVM 运行时内存区域不是同一概念。',
    '程序顺序和同步关系可以传递，使前面的写对后面的读具有可见性保证。',
    'volatile 标志的写读可以把此前普通数据写入发布给获得该同步关系的读者。',
  ],
  prerequisites: ['java-objects', 'process'],
  nextConcepts: ['volatile', 'cas', 'java-thread'],
  concepts: [
    {
      id: 'jmm',
      title: 'Java Memory Model',
      content: 'JMM 规定线程间读写可以观察哪些值，与 JVM 运行时内存区域不是同一概念。',
      why: '共享内存程序必须有可推理的可见性与顺序规则。',
      relatedConcepts: ['java-stack', 'happens-before'],
    },
    {
      id: 'happens-before',
      title: 'happens-before 顺序保证',
      content: '程序顺序和同步关系可以传递，使前面的写对后面的读具有可见性保证。',
      why: '用明确的边解释结果，而不是猜测缓存是否刷新。',
      relatedConcepts: ['jmm', 'safe-publication'],
    },
    {
      id: 'safe-publication',
      title: '安全发布',
      content: 'volatile 标志的写读可以把此前普通数据写入发布给获得该同步关系的读者。',
      why: '保证成立需要完整的发布与读取前提。',
      relatedConcepts: ['happens-before', 'volatile'],
    },
  ],
  experiments: [
    {
      id: 'java-memory-model-lab',
      type: 'java-memory-model',
      title: '两个线程与一个发布标志',
      description: '构建两线程事件与同步边，枚举发布程序的允许结果，并拒绝违反 happens-before 的读取。',
      question: '普通标志与 volatile 标志允许的结果集合有什么不同？',
      config: {},
    },
  ],
  challenge: {
    question:
      'writer 先写 data=42，再 volatile 写 ready=true；reader 读到该发布的 ready=true 后读 data，能读初始值 0 吗？',
    options: [
      {
        id: 'a',
        text: '可以，因为 data 本身不是 volatile。',
      },
      {
        id: 'b',
        text: '在本程序没有其他写入的前提下不能；两侧程序顺序与 volatile 同步边传递，保证读到 42。',
      },
      {
        id: 'c',
        text: '不能，而且因此任何 counter++ 都变成原子操作。',
      },
    ],
    answer: 'b',
    explanation:
      '保证来自具体 happens-before 链，不要求把已发布的每个字段也声明成 volatile。但 volatile 不使读、加、写组成的复合操作自动原子化。',
    hint: '查看 Wdata → Wflag → Rflag → Rdata 是否连通。',
  },
  content,
} satisfies Course
