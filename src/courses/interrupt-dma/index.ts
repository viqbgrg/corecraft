import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'interrupt-dma',
  slug: 'interrupt-dma',
  title: '设备搬数据时，CPU 在忙什么',
  englishTitle: 'Bus, Interrupts and DMA',
  level: 2,
  category: '计算机组成',
  duration: 22,
  description: '在相同到达时间与后台任务下，比较忙轮询、中断搬运与 DMA 的 CPU 和总线开销。',
  question: 'DMA 不用 CPU 逐字节复制，是否意味着数据不再占用总线？',
  objectives: [
    '区分等待通知、数据搬运与总线传输',
    '观察中断入口保存和返回恢复',
    '用相同工作量比较轮询、PIO 与 DMA',
  ],
  prerequisites: ['cpu', 'memory'],
  nextConcepts: ['process', 'filesystem', 'io-multiplexing'],
  concepts: [
    {
      id: 'bus',
      title: '总线与数据传输',
      content: '设备、CPU 与内存通过互连交换地址、控制和数据；传输者改变不代表带宽消耗消失。',
      why: 'CPU 占用和内存 / IO 带宽可能分别成为瓶颈。',
      relatedConcepts: ['dma', 'cache'],
    },
    {
      id: 'interrupt',
      title: '中断与上下文恢复',
      content: '设备通过事件请求 CPU 处理；CPU 保存被打断的执行信息，进入处理程序，完成后恢复继续。',
      why: '避免一直忙等外设，但通知与处理仍有成本。',
      relatedConcepts: ['process', 'dma'],
    },
    {
      id: 'dma',
      title: '直接内存访问',
      content: 'CPU 设置传输描述，DMA 控制器搬运设备与内存之间的数据，完成后通知 CPU。',
      why: '减少逐字节搬运占用的 CPU 指令，同时仍使用共享互连。',
      relatedConcepts: ['bus', 'interrupt', 'page-cache'],
    },
  ],
  experiments: [
    {
      id: 'device-transfer',
      type: 'interrupt-dma',
      title: '设备传输时间线',
      description: '设置字节数、到达间隔与后台指令数，逐时隙观察 CPU 与总线。',
      question: '中断驱动的 PIO 与 DMA，究竟是谁搬运每个字节？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '本实验中 DMA 传输 6 字节时，CPU 搬运字节数为 0。这意味着什么？',
    options: [
      { id: 'a', text: '总线也不再传输任何字节。' },
      { id: 'b', text: '数据由 DMA 控制器搬运，仍使用总线；CPU 还需设置传输并处理完成通知。' },
      { id: 'c', text: '中断与 DMA 相同，所以中断处理程序也从不复制数据。' },
    ],
    answer: 'b',
    explanation:
      'DMA 消除的是本模型中逐字节 PIO 的 CPU 占用，不是数据移动。对照表三种方式都传输 6 字节，DMA 仍有设置与完成中断开销。',
    hint: '比较 CPU 搬运、总线字节与设置 + 中断开销这三列。',
  },
} satisfies Course
