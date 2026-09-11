import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'java-collections',
  slug: 'java-collections',
  title: '泛型是 String，为什么读取仍会类型错误',
  englishTitle: 'Java Generics and Collections',
  level: 8,
  category: 'Java 核心',
  duration: 25,
  description: '执行 ArrayList 增长、HashMap 碰撞与扩容、HashSet 去重，再观察 raw 类型污染与迭代器失效。',
  question: 'List<String> 为什么不能替代运行时类型检查？',
  objectives: [
    '泛型在编译期约束使用，擦除后调用点仍可插入必要的类型转换。',
    'List 保留位置与重复项，Set 去重，Map 按键关联值且不继承 Collection。',
    '普通集合迭代器可检查结构修改计数，fail-fast 只是尽力发现误用。',
  ],
  prerequisites: ['java-objects', 'hash-table', 'linear-storage'],
  nextConcepts: ['java-memory-model', 'java-thread'],
  concepts: [
    {
      id: 'java-generics',
      title: '泛型与擦除',
      content: '泛型在编译期约束使用，擦除后调用点仍可插入必要的类型转换。',
      why: '避免正常代码污染容器，同时理解 raw 调用遗留的风险。',
      relatedConcepts: ['java-object', 'java-collection'],
    },
    {
      id: 'java-collection',
      title: 'Collection 与 Map',
      content: 'List 保留位置与重复项，Set 去重，Map 按键关联值且不继承 Collection。',
      why: '接口语义决定正确性，具体结构决定访问与修改成本。',
      relatedConcepts: ['linear-storage', 'hash-table'],
    },
    {
      id: 'java-iterator',
      title: 'Iterator 与结构修改',
      content: '普通集合迭代器可检查结构修改计数，fail-fast 只是尽力发现误用。',
      why: '迭代错误检查不能当作并发协调机制。',
      relatedConcepts: ['java-collection', 'java-memory-model'],
    },
  ],
  experiments: [
    {
      id: 'java-collections-lab',
      type: 'java-collections',
      title: '类型检查与真实集合结构',
      description: '执行 ArrayList 增长、HashMap 碰撞与扩容、HashSet 去重，再观察 raw 类型污染与迭代器失效。',
      question: 'Aa 与 BB 的 hashCode 相同，Map 会丢失一个键吗？',
      config: {},
    },
  ],
  challenge: {
    question: 'raw 引用把 Integer 放入 List<String>，随后以 String 读取，最准确的解释是什么？',
    options: [
      {
        id: 'a',
        text: '泛型会把 Integer 自动转换为 String。',
      },
      {
        id: 'b',
        text: '未检查写入造成堆污染，读取调用点的 String 转换发现类型不匹配并抛 ClassCastException。',
      },
      {
        id: 'c',
        text: 'HashMap 的碰撞必然破坏所有泛型。',
      },
    ],
    answer: 'b',
    explanation:
      '擦除后的对象存储能容纳不同运行时类型，但正常泛型代码会在编译期约束写入。raw 绕过检查后，失败可能延后到读取发生。',
    hint: '先观察有泛型检查的插入被拒绝，再通过 raw 插入并读取同一位置。',
  },
  content,
} satisfies Course
