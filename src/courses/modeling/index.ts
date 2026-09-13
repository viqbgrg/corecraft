import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'modeling',
  slug: 'modeling',
  title: '怎样用一个小模型理解计算机',
  englishTitle: 'Computation and Mental Models',
  level: 0,
  category: '学习方法',
  duration: 12,
  description: '从“输入 3，加上 2，得到 5”开始，认识计算机如何按步骤处理信息。',
  question: '输入一个数字，给出一条规则，结果是怎样一步步产生的？',
  objectives: [
    '认识输入、处理、暂存与输出',
    '用一个简单例子区分数据、状态与程序',
    '先预测，再操作，用观察检查自己的解释',
  ],
  prerequisites: [],
  nextConcepts: ['binary'],
  concepts: [
    {
      id: 'computation',
      title: '计算机与计算',
      content:
        '计算机接收信息，按照程序处理，保存需要的信息，再把结果输出。加法、整理文字和处理图片都是处理信息的例子。',
      why: '先认识计算机做什么，再逐步了解里面的部件怎样完成这些工作。',
      relatedConcepts: ['machine-state', 'program'],
    },
    {
      id: 'abstraction',
      title: '抽象与建模',
      content: '用一个更简单、能操作的例子研究问题。本课只保留输入、处理步骤、当前记住的数和输出。',
      why: '一次只关注少量细节，就能先解释一个过程，再慢慢增加内容。',
      relatedConcepts: ['machine-state', 'computation'],
    },
    {
      id: 'machine-state',
      title: '状态与数据',
      content:
        '数据是被处理的信息，例如输入的 3 和算出的 5。状态描述“现在是什么情况”，例如当前记住的数、做到哪一步、结果是否已经显示。',
      why: '记下中间结果和做到的位置，才能接着完成后面的步骤。',
      relatedConcepts: ['program', 'computation'],
    },
    {
      id: 'program',
      title: '指令与程序',
      content:
        '可以先把指令理解为一个明确的操作，把程序理解为组织好的一组操作步骤。本课用中文列出“读入、加 2、显示”，帮助我们理解它们的作用。',
      why: '规则保持不变，也能处理不同的输入；改变规则，就能完成不同的计算。',
      relatedConcepts: ['machine-state', 'abstraction'],
    },
  ],
  experiments: [
    {
      id: 'predict-machine',
      type: 'modeling',
      title: '从输入到输出的小机器',
      description: '选择一个数字和一条规则，逐步观察中间过程，再预测下一步。',
      question: '输入没变时，当前记住的数和输出会在什么时候改变？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '规则保持“加 2”，输入从 3 改为 4，为什么输出从 5 变成了 6？',
    options: [
      { id: 'a', text: '每换一个输入，小机器就会自动改写处理规则。' },
      { id: 'b', text: '输入数据变了，程序仍按同一条加 2 规则处理。' },
      { id: 'c', text: '输出与输入无关，只是按次数显示预先存好的答案。' },
    ],
    answer: 'b',
    explanation:
      '数据是这次交给机器处理的数字，程序是处理它的步骤。同样执行“读入、加 2、显示”，输入 3 得到 5，输入 4 就得到 6；改变输入不需要改写程序。',
    hint: '把同一条“加 2”规则分别应用到 3 和 4，再看看实验中的步骤有没有变化。',
  },
} satisfies Course
