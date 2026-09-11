import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'jvm-runtime',
  slug: 'jvm-runtime',
  title: '类已经加载，为什么静态字段还不是 7',
  englishTitle: 'JVM Lifecycle, Bytecode and Object Layout',
  level: 9,
  category: 'JVM',
  duration: 28,
  description: '验证一个直线字节码方法，分步加载与初始化类，运行操作数栈并比较对象头和字段对齐。',
  question: '准备阶段、类初始化、方法执行和对象分配分别修改哪一块状态？',
  objectives: [
    '加载子系统建立类型，执行引擎运行方法，堆与线程区域保留运行状态，GC 管理可回收对象。',
    'HotSpot 类元数据通常使用本地 Metaspace，Java 堆、线程栈和 PC 有不同职责与容量。',
    '对象头、实例字段、引用宽度和填充共同决定示意对象大小。',
  ],
  prerequisites: ['java-classes', 'java-objects'],
  nextConcepts: ['jvm-gc', 'jvm-jit'],
  concepts: [
    {
      id: 'jvm-architecture',
      title: 'JVM 架构与类生命周期',
      content: '加载子系统建立类型，执行引擎运行方法，堆与线程区域保留运行状态，GC 管理可回收对象。',
      why: '定位一个现象发生在加载、初始化还是执行阶段。',
      relatedConcepts: ['java-classloader', 'jit'],
    },
    {
      id: 'metaspace',
      title: 'Metaspace 与运行时区域',
      content: 'HotSpot 类元数据通常使用本地 Metaspace，Java 堆、线程栈和 PC 有不同职责与容量。',
      why: '某一区域耗尽不能简单通过增加另一区域容量解决。',
      relatedConcepts: ['java-stack', 'gc-roots'],
    },
    {
      id: 'object-layout',
      title: '对象布局与对齐',
      content: '对象头、实例字段、引用宽度和填充共同决定示意对象大小。',
      why: '源码字段大小之和不等于对象总占用。',
      relatedConcepts: ['java-object', 'metaspace'],
    },
  ],
  experiments: [
    {
      id: 'jvm-runtime-lab',
      type: 'jvm-runtime',
      title: '类型栈、静态状态与内存区域',
      description: '验证一个直线字节码方法，分步加载与初始化类，运行操作数栈并比较对象头和字段对齐。',
      question: '普通静态 seed=7 在准备时与初始化后分别是什么值？',
      config: {},
    },
  ],
  challenge: {
    question:
      '普通静态 int seed 的初始化语句为 seed=7。本课 prepare 后、initialize 后和 sum() 返回分别是什么？',
    options: [
      {
        id: 'a',
        text: 'prepare 就运行所有构造器，seed 永远没有默认值。',
      },
      {
        id: 'b',
        text: 'prepare 时为 0，initialize 后为 7；sum 再通过操作数栈计算 7 加输入值。',
      },
      {
        id: 'c',
        text: '只有分配实例对象时才能准备静态字段。',
      },
    ],
    answer: 'b',
    explanation:
      '普通静态字段准备默认值与执行类初始化代码是不同阶段。ConstantValue 常量、延迟解析等还有额外规则，本课已经明确排除或固定。',
    hint: '在每个阶段观察 seed 卡片，再逐条运行 getstatic、bipush 和 iadd。',
  },
  content,
} satisfies Course
