import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'pipeline',
  slug: 'pipeline',
  title: '指令怎样重叠执行',
  englishTitle: 'Instruction Pipeline',
  level: 2,
  category: '计算机组成',
  duration: 18,
  description: '逐周期观察五级流水线，找到数据依赖造成的停顿。',
  question: '每条指令都要经过五个阶段，为什么四条指令可以少于二十个周期完成？',
  objectives: [
    '区分单条指令延迟与整体吞吐量',
    '观察数据依赖如何冻结前端并插入气泡',
    '对比转发能消除和不能消除的等待',
  ],
  prerequisites: ['cpu', 'register'],
  nextConcepts: ['branch-prediction', 'cache'],
  concepts: [
    {
      id: 'pipeline',
      title: '指令流水线',
      content: '让不同指令同时使用不同阶段；理想情况下，每个周期都能完成一条已经进入流水线的指令。',
      why: '一条指令访存时，取指和执行部件不必一直闲着。',
      relatedConcepts: ['instruction', 'data-hazard', 'branch-prediction'],
    },
    {
      id: 'data-hazard',
      title: '数据冒险与停顿',
      content: '较新的指令要读取较早指令尚未提供的结果；暂停 IF / ID，同时让较早指令继续完成。',
      why: '读取旧值会算错，全部暂停又会让生产者无法完成。',
      relatedConcepts: ['register', 'forwarding'],
    },
    {
      id: 'forwarding',
      title: '数据转发',
      content: '把流水线中已有的结果直接送给执行单元，不必等待寄存器写回。',
      why: '计算结束与写回之间存在时间差，可以提前使用已生成的数据。',
      relatedConcepts: ['alu', 'data-hazard', 'cache'],
    },
  ],
  experiments: [
    {
      id: 'five-stage-pipeline',
      type: 'pipeline',
      title: '五级流水线实验台',
      description: '在同一程序上对比顺序执行、数据停顿与转发。',
      question: '打开转发后，LOAD 后紧接的 ADD 为什么仍要等一个周期？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '转发已经开启，LOAD 后紧接的 ADD 仍停顿一个周期，原因是什么？',
    options: [
      { id: 'a', text: 'LOAD 的数据要到 MEM 结束才产生，紧接的 ADD 在此前就需要它。' },
      { id: 'b', text: '转发永远不能把 LOAD 读出的数据交给后面的指令。' },
      { id: 'c', text: '流水线保证每个周期完成一条指令，因此这个停顿是模型出错。' },
    ],
    answer: 'a',
    explanation:
      '转发能提前传递已经产生的结果，不能提前创造尚未读到的数据。停顿后，ADD 才能使用上一个周期 MEM 得到的值。',
    hint: '比较周期 4 的 LOAD / MEM 与 ADD / ID，再推进到周期 5。',
  },
} satisfies Course
