import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'cpu', slug: 'cpu', title: 'CPU 如何执行指令', englishTitle: 'Inside the CPU', level: 2, category: '计算机组成', duration: 15,
  description: '跟随一条 ADD 指令，看数据如何变成一次真实的计算。',
  question: '程序里的一行 ADD，究竟让 CPU 内部发生了什么？',
  objectives: ['区分取指、译码、执行和写回', '观察 PC 与寄存器改变的时机', '跟踪寄存器与内存间的数据流'],
  prerequisites: ['binary', 'logic'], nextConcepts: ['cache', 'process', 'pipeline'],
  concepts: [
    { id: 'cpu', title: 'CPU', content: '按指令改变机器状态的执行单元。', why: '把操作规则编码成程序，就能让同一套硬件执行不同任务。', relatedConcepts: ['instruction', 'register'] },
    { id: 'instruction', title: '指令与 PC', content: '指令描述操作；PC 保存下一条要取的指令位置。', why: '必须记住执行到了哪里，程序才有顺序和控制流。', relatedConcepts: ['process', 'pipeline'] },
    { id: 'register', title: '寄存器', content: 'CPU 内部保存当前操作数与结果的小型存储。', why: '执行时反复访问主存的代价太高，需要就近保存状态。', relatedConcepts: ['memory', 'cache'] },
    { id: 'alu', title: 'ALU', content: '算术逻辑单元，对操作数执行加法或逻辑运算。', why: '计算结果需要专门的组合电路产生，再在指定阶段写入状态。', relatedConcepts: ['logic', 'register'] },
    { id: 'memory', title: '内存', content: '通过地址读取和写入数据；本模型将指令内存与数据内存分开展示。', why: '寄存器容量有限，程序还需要更大的存储空间。', relatedConcepts: ['cache', 'virtual-memory'] },
  ],
  experiments: [{ id: 'cpu-stepper', type: 'cpu', title: '指令执行实验台', description: '一步一状态，观察 PC、IR、ALU、寄存器与内存。', question: 'ADD 执行后，R1 会立刻改变吗？', config: { a: 10 } }],
  content,
  challenge: { question: 'ADD 已经完成 Execute，ALU 显示 30，但 R1 仍是 10。这是为什么？', options: [{ id: 'a', text: '结果暂存在执行单元，Write Back 才更新 R1。' }, { id: 'b', text: 'CPU 算错了，需要重新 Fetch。' }, { id: 'c', text: 'PC 指向下一条指令，表示这条指令已经全部完成。' }], answer: 'a', explanation: '计算结果与提交结果是两次状态变化。PC 可以在取指后前进，而当前指令仍在译码或执行。', hint: '再执行一次微步骤，比较 ALU 与寄存器。' },
} satisfies Course
