import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'jvm-jit',
  slug: 'jvm-jit',
  title: '代码热起来后，new 的对象为什么不见了',
  englishTitle: 'JIT, Escape Analysis and Safepoints',
  level: 9,
  category: 'JVM',
  duration: 28,
  description: '预热固定方法，观察标量替换与分配计数，触发类型守卫失效，并在轮询处到达安全点。',
  question: '消除了一个不逃逸对象，为什么仍必须返回相同计算结果？',
  objectives: [
    '执行画像可以支持优化，假设失效时必须回到仍保持语义正确的执行路径。',
    '对象身份不逃逸且其他条件满足时，字段可以用标量表示而省去对象分配。',
    '线程在可识别执行状态处响应 VM 协调请求，引用映射区分对象引用与普通标量。',
  ],
  prerequisites: ['jvm-runtime', 'jvm-gc'],
  nextConcepts: ['java-thread', 'java-memory-model'],
  concepts: [
    {
      id: 'jit',
      title: 'JIT 编译与类型特化',
      content: '执行画像可以支持优化，假设失效时必须回到仍保持语义正确的执行路径。',
      why: '热路径性能依赖画像，优化不是永久无条件成立。',
      relatedConcepts: ['jvm-architecture', 'escape-analysis'],
    },
    {
      id: 'escape-analysis',
      title: '逃逸分析与标量替换',
      content: '对象身份不逃逸且其他条件满足时，字段可以用标量表示而省去对象分配。',
      why: '源码出现 new 不必对应每次真实堆分配。',
      relatedConcepts: ['java-object', 'jit'],
    },
    {
      id: 'safepoint',
      title: 'Safepoint 安全点',
      content: '线程在可识别执行状态处响应 VM 协调请求，引用映射区分对象引用与普通标量。',
      why: '发出暂停请求与所有相关线程到达安全状态有时间差。',
      relatedConcepts: ['gc-roots', 'jit'],
    },
  ],
  experiments: [
    {
      id: 'jvm-jit-lab',
      type: 'jvm-jit',
      title: '热循环、类型守卫与安全点',
      description: '预热固定方法，观察标量替换与分配计数，触发类型守卫失效，并在轮询处到达安全点。',
      question: '改用另一种接收者，为什么不能继续无条件使用旧的特化代码？',
      config: {},
    },
  ],
  challenge: {
    question: 'Point 局部对象的字段被标量替换，正确理解是什么？',
    options: [
      {
        id: 'a',
        text: '所有 Java 对象都会统一搬到栈上。',
      },
      {
        id: 'b',
        text: '在本程序的优化前提下不必创建对象身份，保留字段计算即可；对象逃逸或类型假设变化需要重新判断。',
      },
      {
        id: 'c',
        text: '消除分配后就可以改变方法返回值。',
      },
    ],
    answer: 'b',
    explanation:
      '标量替换省去对象分配，不等于通用栈上分配。JIT 优化仍受程序可观察语义约束，并用守卫、去优化等机制处理假设变化。',
    hint: '对比同一循环三条路径的结果与分配数，再改变接收者类型。',
  },
  content,
} satisfies Course
