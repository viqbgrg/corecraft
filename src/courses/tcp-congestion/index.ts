import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'tcp-congestion',
  slug: 'tcp-congestion',
  title: '发送得快，为什么反而更慢',
  englishTitle: 'TCP Congestion Control',
  level: 4,
  category: '计算机网络',
  duration: 20,
  description: '用 ACK、重复 ACK 和超时驱动 Reno 的窗口变化。',
  question: '接收端有空间，发送方为什么仍然要限制在途数据？',
  objectives: ['区分 cwnd 与 rwnd 的责任', '观察慢启动和拥塞避免的增长', '比较快速恢复与超时后的退让'],
  prerequisites: ['tcp-reliability', 'retransmission'],
  nextConcepts: ['http', 'dns'],
  concepts: [
    {
      id: 'tcp-congestion',
      title: '拥塞控制',
      content: '发送方根据确认与丢包调整拥塞窗口，探测路径能够承受的在途量。',
      why: '中间路由器和链路也有有限队列，接收端有空位不等于网络有余量。',
      relatedConcepts: ['flow-control', 'sliding-window'],
    },
    {
      id: 'slow-start',
      title: '慢启动与拥塞避免',
      content: '慢启动每个新 ACK 增加约一个 MSS；到阈值后改为每 RTT 约增加一个 MSS 的拥塞避免。',
      why: '先探测，再逐渐逼近容量，遇到丢包后退让。',
      relatedConcepts: ['tcp-congestion', 'retransmission'],
    },
  ],
  experiments: [
    {
      id: 'reno-window',
      type: 'tcp-congestion',
      title: 'Reno 拥塞窗口实验台',
      description: '按 ACK 事件计算窗口与阈值。',
      question: '三个重复 ACK 与 RTO 超时为何采用不同反应？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: 'cwnd 很大，但 rwnd 只允许 4 MSS 在途。发生丢包时，Reno 应用哪个量计算 ssthresh？',
    options: [
      { id: 'a', text: '只看 cwnd，接收窗口不会影响阈值。' },
      { id: 'b', text: '根据实际 FlightSize，取 max(FlightSize/2, 2 MSS)。' },
      { id: 'c', text: '始终把 ssthresh 设为接收端的全部内存。' },
    ],
    answer: 'b',
    explanation: '拥塞反应基于实际在途数据量；cwnd 是允许量，受 rwnd 限制时并不等于 FlightSize。',
    hint: '把 rwnd 改为 4，增长 cwnd 后再发送一轮并注入重复 ACK。',
  },
} satisfies Course
