import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'java-classes',
  slug: 'java-classes',
  title: '同名类为什么也会转换失败',
  englishTitle: 'ClassLoaders, Reflection and Exceptions',
  level: 8,
  category: 'Java 核心',
  duration: 25,
  description: '对照父加载器委派与独立定义，检查方法元数据，并逐帧传播反射目标异常。',
  question: '两个 demo.Counter 为什么可能不是同一种运行时类型？',
  objectives: [
    '运行时类型由二进制名称和定义加载器共同确定，发起加载者不一定是定义者。',
    '通过运行时类元数据检查并调用固定方法，查找失败与目标执行失败不同。',
    '异常沿调用栈传播，finally 执行，反射入口可包装目标异常并保留原因。',
  ],
  prerequisites: ['java-objects'],
  nextConcepts: ['java-collections', 'java-memory-model'],
  concepts: [
    {
      id: 'java-classloader',
      title: 'ClassLoader 与类型身份',
      content: '运行时类型由二进制名称和定义加载器共同确定，发起加载者不一定是定义者。',
      why: '插件隔离和公共 API 共享需要正确安排加载器边界。',
      relatedConcepts: ['java-object', 'reflection'],
    },
    {
      id: 'reflection',
      title: 'Reflection',
      content: '通过运行时类元数据检查并调用固定方法，查找失败与目标执行失败不同。',
      why: '框架能够按配置连接对象，但仍受类型和访问规则约束。',
      relatedConcepts: ['java-classloader', 'java-exception'],
    },
    {
      id: 'java-exception',
      title: '异常传播与 cause',
      content: '异常沿调用栈传播，finally 执行，反射入口可包装目标异常并保留原因。',
      why: '只看外层异常名可能遗漏真正的业务失败。',
      relatedConcepts: ['reflection', 'java-stack'],
    },
  ],
  experiments: [
    {
      id: 'java-classes-lab',
      type: 'java-classes',
      title: '定义加载器与异常调用栈',
      description: '对照父加载器委派与独立定义，检查方法元数据，并逐帧传播反射目标异常。',
      question: '异常包装以后还能定位最初的除零吗？',
      config: {},
    },
  ],
  challenge: {
    question:
      'Plugin 独立定义 demo.Counter，App 也定义同名类，Plugin 对象转换成 App 的 Counter 失败，原因是什么？',
    options: [
      {
        id: 'a',
        text: '相同类名必定是同一种类型，应该忽略异常。',
      },
      {
        id: 'b',
        text: '定义加载器不同导致运行时类型不同；应明确共享 API 的定义与委派边界。',
      },
      {
        id: 'c',
        text: '只要通过反射创建就能绕过所有类型检查。',
      },
    ],
    answer: 'b',
    explanation:
      '类型身份包含定义加载器。父优先委派可让双方使用同一个定义，独立定义则保持隔离；反射不会消除这种身份区别。',
    hint: '分别在父优先和独立定义的新场景中创建 Plugin 实例。',
  },
  content,
} satisfies Course
