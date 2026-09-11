import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'java-objects',
  slug: 'java-objects',
  title: '改了对象，为什么没改调用者的引用',
  englishTitle: 'Java Objects, References and Frames',
  level: 8,
  category: 'Java 核心',
  duration: 25,
  description: '在堆与方法栈之间复制引用、修改共享字段、重绑参数，观察对象身份与可达性。',
  question: 'change(a) 中的 p.value=20 与 p=new Box(30)，为什么影响范围不同？',
  objectives: [
    '每个对象有身份和实例字段，Class 元数据描述字段与方法。',
    '赋值和传参复制引用值，多个变量可以指向同一个对象。',
    '栈帧保留方法的局部状态，堆保存共享对象，方法区承担类元数据的逻辑职责。',
  ],
  prerequisites: ['process', 'virtual-memory'],
  nextConcepts: ['java-classes', 'java-memory-model'],
  concepts: [
    {
      id: 'java-object',
      title: 'Java 对象与 Class',
      content: '每个对象有身份和实例字段，Class 元数据描述字段与方法。',
      why: '相同字段值不代表同一个对象。',
      relatedConcepts: ['java-reference', 'java-classes'],
    },
    {
      id: 'java-reference',
      title: '引用与按值传参',
      content: '赋值和传参复制引用值，多个变量可以指向同一个对象。',
      why: '区分修改被引用对象与替换某个局部变量。',
      relatedConcepts: ['java-object', 'java-stack'],
    },
    {
      id: 'java-stack',
      title: '堆、栈与方法区',
      content: '栈帧保留方法的局部状态，堆保存共享对象，方法区承担类元数据的逻辑职责。',
      why: '对象生命周期不能简单等同于创建它的方法调用。',
      relatedConcepts: ['java-object', 'java-memory-model'],
    },
  ],
  experiments: [
    {
      id: 'java-objects-lab',
      type: 'java-objects',
      title: '引用槽位与对象身份',
      description: '在堆与方法栈之间复制引用、修改共享字段、重绑参数，观察对象身份与可达性。',
      question: '参数 p 改指另一个对象后，a 会一起改指吗？',
      config: {},
    },
  ],
  challenge: {
    question:
      'main 的 a 与 b 都指向 O1，change(a) 先执行 p.value=20，再执行 p=new Box(30)。返回后 a 指向什么？',
    options: [
      {
        id: 'a',
        text: '新的 Box(30)，因为 Java 按引用传参。',
      },
      {
        id: 'b',
        text: '仍指向 O1，O1.value 已变为 20；参数 p 的重新赋值不改写 a 的栈槽。',
      },
      {
        id: 'c',
        text: 'null，因为被调用方法的栈帧已经弹出。',
      },
    ],
    answer: 'b',
    explanation:
      'Java 按值传递参数，引用本身也是一个值。修改 O1 的字段对别名可见，重绑 p 只改变 change 的局部变量。',
    hint: '对照 main 与 change 两个栈帧中的引用编号。',
  },
  content,
} satisfies Course
