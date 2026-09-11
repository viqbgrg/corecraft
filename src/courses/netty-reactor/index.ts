import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'netty-reactor',
  slug: 'netty-reactor',
  title: 'Reactor 与 Netty 管线',
  englishTitle: 'Reactor Loops and Netty Pipelines',
  level: 11,
  category: 'Java IO / NIO',
  duration: 28,
  description: '让长短请求共享事件循环，比较业务卸载、ByteBuf 引用交接与高低水位背压。',
  question: '一个连接做耗时工作，为什么另一个连接也会变慢？',
  objectives: [
    '一个 EventLoop 串行调度多个 Channel；耗时业务占住它会推迟其他连接事件。',
    '入站解码、业务与出站编码有方向和上下文；异步交接 ByteBuf 需要保持有效引用。',
    '高低水位改变 Channel 可写性，应用可联动 autoRead，排空后恢复接收。',
  ],
  prerequisites: ['nio-selector', 'java-executors'],
  nextConcepts: ['java-futures'],
  concepts: [
    {
      id: 'reactor',
      title: 'Reactor 事件循环',
      content: '一个 EventLoop 串行调度多个 Channel；耗时业务占住它会推迟其他连接事件。',
      why: '连接多不等于每连接都有独占线程。',
      relatedConcepts: ['nio-selector', 'java-executors'],
    },
    {
      id: 'netty-pipeline',
      title: 'Netty 管线与引用所有权',
      content: '入站解码、业务与出站编码有方向和上下文；异步交接 ByteBuf 需要保持有效引用。',
      why: '任务还没执行，入站 handler 可能已经释放自己的引用。',
      relatedConcepts: ['java-futures'],
    },
    {
      id: 'netty-watermark',
      title: '待写水位与应用背压',
      content: '高低水位改变 Channel 可写性，应用可联动 autoRead，排空后恢复接收。',
      why: '写入过快需要把压力反馈给上游。',
      relatedConcepts: ['nio-selector'],
    },
  ],
  experiments: [
    {
      id: 'netty-reactor-lab',
      type: 'netty-reactor',
      title: 'Reactor 与 Netty 管线',
      description: '让长短请求共享事件循环，比较业务卸载、ByteBuf 引用交接与高低水位背压。',
      question: '一个连接做耗时工作，为什么另一个连接也会变慢？',
      config: {},
    },
  ],
  challenge: {
    question: '自动释放入站 ByteBuf 的 handler 把消息交给稍后执行的任务，正确做法是什么？',
    options: [
      {
        id: 'a',
        text: '保留必要引用，任务完成后配对释放；否则回调可能访问已释放的缓冲。',
      },
      {
        id: 'b',
        text: '只要代码是异步的，引用计数就自动增加。',
      },
      {
        id: 'c',
        text: '任何 retain 都不需要再 release。',
      },
    ],
    answer: 'a',
    explanation:
      '异步交接必须维护所有权。入站 handler 释放自己的引用后，另一个任务需要仍拥有有效引用；完成后释放，才能避免提前回收和泄漏。',
    hint: '关闭 retain 后执行同一请求，检查 refCnt 与异常。',
  },
  content,
} satisfies Course
