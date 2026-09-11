import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'jvm-gc',
  slug: 'jvm-gc',
  title: '对象彼此引用，为什么仍会被回收',
  englishTitle: 'GC Roots, Generations and Reachability',
  level: 9,
  category: 'JVM',
  duration: 28,
  description: '修改真实对象图，沿根和跨代引用标记，回收不可达环，观察年龄、晋升及不同回收范围。',
  question: '只回收年轻代时，怎样避免误删仍被老对象引用的年轻对象？',
  objectives: [
    '从活跃根沿强引用可达的对象需要保留，互相引用的孤立环仍可回收。',
    '只回收一代时，需要保留来自未回收代的入边，写屏障维护跨代引用信息。',
    '回收范围、晋升条件和术语含义由实现决定；本课显式区分年轻、老代和全堆。',
  ],
  prerequisites: ['jvm-runtime', 'java-objects'],
  nextConcepts: ['jvm-collectors', 'jvm-jit'],
  concepts: [
    {
      id: 'gc-roots',
      title: 'GC Roots 与强可达性',
      content: '从活跃根沿强引用可达的对象需要保留，互相引用的孤立环仍可回收。',
      why: '引用计数直觉不能完整解释追踪式垃圾回收。',
      relatedConcepts: ['java-reference', 'reachability'],
    },
    {
      id: 'reachability',
      title: '分代边界与记忆集合',
      content: '只回收一代时，需要保留来自未回收代的入边，写屏障维护跨代引用信息。',
      why: '避免每次年轻代回收扫描所有老对象，同时保持正确性。',
      relatedConcepts: ['gc-roots', 'g1'],
    },
    {
      id: 'gc-generations',
      title: 'Minor、Major 与 Full GC',
      content: '回收范围、晋升条件和术语含义由实现决定；本课显式区分年轻、老代和全堆。',
      why: '判断日志中的回收事件不能只看一个名称。',
      relatedConcepts: ['reachability', 'jvm-collectors'],
    },
  ],
  experiments: [
    {
      id: 'jvm-gc-lab',
      type: 'jvm-gc',
      title: '根、跨代边与不可达环',
      description: '修改真实对象图，沿根和跨代引用标记，回收不可达环，观察年龄、晋升及不同回收范围。',
      question: 'O4 和 O5 只互相引用、没有从根到它们的路径，能保留吗？',
      config: {},
    },
  ],
  challenge: {
    question: '年轻代回收时，老对象 O1 通过字段指向年轻对象 O2，O2 又指向 O3，正确做法是什么？',
    options: [
      {
        id: 'a',
        text: '只看直接指向年轻代的栈根，因此回收 O2 和 O3。',
      },
      {
        id: 'b',
        text: '把 old→young 记忆集合中的入边作为边界根，再遍历 O2 到 O3 的年轻引用。',
      },
      {
        id: 'c',
        text: '只要年轻对象达到某个年龄，就可以忽略所有引用。',
      },
    ],
    answer: 'b',
    explanation:
      '年轻代回收不能假定所有老对象都会一起重新判活；来自保留区域的引用必须被考虑。记忆集合与写屏障帮助实现这个边界。',
    hint: '查看初始 O1→O2 的记忆集合，并逐步推进标记前沿。',
  },
  content,
} satisfies Course
