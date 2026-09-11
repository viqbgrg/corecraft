import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'logic',
  slug: 'logic',
  title: '怎样证明两段逻辑真的相同',
  englishTitle: 'Boolean Algebra and Logic Gates',
  level: 1,
  category: '基本逻辑',
  duration: 18,
  description: '逐门计算布尔表达式，穷举真值表，用一个反例推翻错误的等价猜想。',
  question: '!(A & B) 为什么等于 !A | !B，而不是 !A & !B？',
  objectives: ['用逻辑门组合布尔函数', '理解德摩根定律和优先级', '区分一个样例与完整真值表证明'],
  prerequisites: ['binary', 'abstraction'],
  nextConcepts: ['cpu', 'signed-number'],
  concepts: [
    {
      id: 'boolean-algebra',
      title: '布尔代数',
      content: '在 0 / 1 上定义 AND、OR、NOT 等运算，可用交换、结合、分配与德摩根规则变换表达式。',
      why: '保留功能的代数变换可以简化条件判断和组合逻辑。',
      relatedConcepts: ['logic-gate', 'binary'],
    },
    {
      id: 'logic-gate',
      title: '逻辑门与真值表',
      content: '理想逻辑门将输入位映射为输出位；真值表枚举函数的全部输入组合。',
      why: '让电路功能可以按节点计算，并以穷举或反例检查等价性。',
      relatedConcepts: ['boolean-algebra', 'cpu'],
    },
  ],
  experiments: [
    {
      id: 'boolean-functions',
      type: 'logic',
      title: '布尔函数验证台',
      description: '编辑两个表达式，观察逐门输入来源与八行真值表。',
      question: '只验证 A=B=0，能证明两个函数等价吗？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '两个三变量布尔函数在某一组输入上相同，能说明什么？',
    options: [
      { id: 'a', text: '已经证明等价，其余输入不需要检查。' },
      { id: 'b', text: '只能说明该组输入一致；完整八行都相同才构成这两个三变量函数的穷举证明。' },
      { id: 'c', text: '只要表达式写法不同，函数一定不同。' },
    ],
    answer: 'b',
    explanation:
      '等价要求对所有输入输出一致。三变量共有 2³=8 组；一个输出不同的反例足以否定等价，单个相同样例则不足以证明。',
    hint: '将右式改为 !A & !B，穷举后代入第一个反例。',
  },
} satisfies Course
