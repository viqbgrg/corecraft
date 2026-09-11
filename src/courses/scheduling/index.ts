import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'scheduling',
  slug: 'scheduling',
  title: '谁先拿到 CPU',
  englishTitle: 'CPU Scheduling',
  level: 3,
  category: '操作系统',
  duration: 20,
  description: '用同一组任务比较先来先服务、短作业优先和时间片轮转。',
  question: '长任务先到，后来的短任务一定要等它做完吗？',
  objectives: ['区分等待、响应和周转时间', '观察抢占与时间片的影响', '用相同任务比较四种调度策略'],
  prerequisites: ['process', 'context-switch'],
  nextConcepts: ['page-replacement', 'java-thread'],
  concepts: [
    {
      id: 'scheduling',
      title: 'CPU 调度策略',
      content:
        '从已经到达的可运行任务中选择执行者；非抢占策略要等当前 CPU burst 结束，抢占策略可在边界重新选择。',
      why: '响应、公平和平均等待是不同的目标。',
      relatedConcepts: ['thread', 'context-switch'],
    },
    {
      id: 'turnaround',
      title: '响应与周转时间',
      content: '响应=首次运行−到达，周转=完成−到达；本课没有 IO，等待=周转−执行量。',
      why: '只看吞吐量会掩盖交互请求等了多久。',
      relatedConcepts: ['scheduling'],
    },
  ],
  experiments: [
    {
      id: 'cpu-scheduling',
      type: 'scheduling',
      title: '调度策略实验台',
      description: '可编辑到达与时长的单核调度器。',
      question: 'SRTF 为什么会暂停还没做完的任务？',
      config: {},
    },
  ],
  content,
  challenge: {
    question:
      '一个任务在 t=2 到达、t=5 首次运行、t=9 完成，实际执行了 4 个时间单位。它的等待与响应时间分别是多少？',
    options: [
      { id: 'a', text: '等待 7，响应 4。' },
      { id: 'b', text: '等待 3，响应 3。' },
      { id: 'c', text: '等待 4，响应 7。' },
    ],
    answer: 'b',
    explanation:
      '周转时间为 9−2=7，减去执行量 4 得等待 3；首次运行减到达也是 5−2=3。这两个指标在被抢占的任务上不一定相同。',
    hint: '等待包含首次运行前和被抢占后的排队；响应只计算第一次拿到 CPU。',
  },
} satisfies Course
