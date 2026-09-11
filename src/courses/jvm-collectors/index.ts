import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'jvm-collectors',
  slug: 'jvm-collectors',
  title: '对象已经搬家，旧引用怎样继续工作',
  englishTitle: 'G1 Regions and ZGC Relocation Barriers',
  level: 9,
  category: 'JVM',
  duration: 28,
  description: '根据存活与垃圾选择区域，移动对象并建立转发表，比较停顿内修复和加载时修复引用。',
  question: '应用里还有旧地址，怎样保证读取的仍是原来的对象？',
  objectives: [
    'G1 将堆分区，结合存活统计选择回收集合，并在疏散中移动存活对象和维护引用。',
    '并发搬迁需要协议让应用安全处理尚未修复的旧引用，加载屏障可参与地址重映射。',
    '旧地址映射到新地址，修复引用后对象的逻辑身份和值保持不变。',
  ],
  prerequisites: ['jvm-gc', 'jvm-runtime'],
  nextConcepts: ['jvm-jit', 'java-memory-model'],
  concepts: [
    {
      id: 'g1',
      title: 'G1 区域与回收收益',
      content: 'G1 将堆分区，结合存活统计选择回收集合，并在疏散中移动存活对象和维护引用。',
      why: '回收垃圾多且复制存活少的区域有不同收益。',
      relatedConcepts: ['gc-generations', 'reachability'],
    },
    {
      id: 'zgc',
      title: 'ZGC 搬迁与屏障',
      content: '并发搬迁需要协议让应用安全处理尚未修复的旧引用，加载屏障可参与地址重映射。',
      why: '减少长时间停顿需要把部分协调工作分布到访问路径。',
      relatedConcepts: ['g1', 'relocation-forwarding'],
    },
    {
      id: 'relocation-forwarding',
      title: '转发表与对象身份',
      content: '旧地址映射到新地址，修复引用后对象的逻辑身份和值保持不变。',
      why: '改变物理位置不能破坏 Java 引用语义。',
      relatedConcepts: ['java-reference', 'gc-roots'],
    },
  ],
  experiments: [
    {
      id: 'jvm-collectors-lab',
      type: 'jvm-collectors',
      title: '相同对象图的搬迁对照',
      description: '根据存活与垃圾选择区域，移动对象并建立转发表，比较停顿内修复和加载时修复引用。',
      question: '为什么关闭加载屏障的教学尝试会被拒绝？',
      config: {},
    },
  ],
  challenge: {
    question: '搬迁后 O1 的字段仍保存旧地址 1:0，转发表记录 1:0→3:0。ZGC 风格加载如何保证语义？',
    options: [
      {
        id: 'a',
        text: '旧地址自动变成新对象，直接读取即可。',
      },
      {
        id: 'b',
        text: '通过屏障解析转发关系，读取同一个对象并按协议修复引用；旧地址不能随意复用。',
      },
      {
        id: 'c',
        text: '只要标记为并发 GC，就完全不需要暂停或任何屏障。',
      },
    ],
    answer: 'b',
    explanation:
      '并发搬迁需要地址与访问协议共同保证正确性。本模型展示一次加载修复；真实 ZGC 还有指针元信息、更多屏障及回收阶段约束。',
    hint: '先尝试跳过屏障，再恢复屏障观察字段地址与读取值。',
  },
  content,
} satisfies Course
