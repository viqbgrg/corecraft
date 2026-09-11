import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'modeling',
  slug: 'modeling',
  title: '怎样用一个小模型理解计算机',
  englishTitle: 'Computation and Mental Models',
  level: 0,
  category: '学习方法',
  duration: 18,
  description: '编写一个倒数程序，预测状态变化，用实际输出检验自己的解释。',
  question: '只有输入、一个寄存器和几条规则，怎样组成一个会计算的机器？',
  objectives: ['区分数据、指令、程序与运行状态', '用状态转换解释计算', '提出预测并用反例修正模型'],
  prerequisites: [],
  nextConcepts: ['binary', 'cpu'],
  concepts: [
    {
      id: 'computation',
      title: '计算机与计算',
      content: '计算机按照可执行的规则处理表示出来的数据；输入与当前状态共同决定下一步。',
      why: '把外部表现拆成可检查的规则，才能解释结果如何产生。',
      relatedConcepts: ['machine-state', 'program'],
    },
    {
      id: 'abstraction',
      title: '抽象与建模',
      content: '为回答一个问题，保留相关状态和规则，省略暂时无关的细节，并写明边界。',
      why: '能预测现象的简单模型比无从检验的类比更有用。',
      relatedConcepts: ['machine-state', 'cpu'],
    },
    {
      id: 'machine-state',
      title: '状态与数据',
      content: '数据是被处理的值；状态是足以决定后续行为的信息集合，包括 ACC、PC、输入与输出。',
      why: '相同程序在不同输入或位置上会走向不同的下一步。',
      relatedConcepts: ['program', 'binary'],
    },
    {
      id: 'program',
      title: '指令与程序',
      content: '指令定义一次状态转换；程序组织这些指令，并通过跳转决定执行次序。',
      why: '一段静态规则可以产生反复执行的动态过程。',
      relatedConcepts: ['machine-state', 'cpu'],
    },
  ],
  experiments: [
    {
      id: 'predict-machine',
      type: 'modeling',
      title: '可预测的小机器',
      description: '编辑指令、输入与下一步预测，观察 ACC、PC 和输出流。',
      question: '循环改变了数据，还是改变了下一条指令的位置？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '默认程序输入 3。执行 OUT 后，为什么还需要 SUB 1 和 JNZ 1？',
    options: [
      { id: 'a', text: 'OUT 会自动把输入减一并重新开始。' },
      { id: 'b', text: 'SUB 改变 ACC，JNZ 根据新状态决定是否回到输出指令。' },
      { id: 'c', text: 'JNZ 每次都跳转，ACC 不影响控制流。' },
    ],
    answer: 'b',
    explanation:
      'OUT 只追加当前 ACC。SUB 1 产生 2、1、0，JNZ 在非零时跳回行 1，零时顺序进入 HALT。数据变化与控制流共同使程序停机。',
    hint: '观察 ACC=1 时执行 SUB 1，然后预测 JNZ 的下一条指令位置。',
  },
} satisfies Course
