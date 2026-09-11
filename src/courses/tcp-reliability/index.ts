import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'tcp-reliability',
  slug: 'tcp-reliability',
  title: '丢失的数据如何补回来',
  englishTitle: 'Reliable TCP Transfer',
  level: 4,
  category: '计算机网络',
  duration: 22,
  description: '亲手丢掉数据或 ACK，观察累计确认、滑动窗口与接收缓冲。',
  question: '后面的段已经到了，ACK 为什么仍然停在原处？',
  objectives: ['用字节序号解释累计 ACK', '区分数据丢失和 ACK 丢失', '通过应用读取与窗口更新恢复发送'],
  prerequisites: ['tcp', 'sequence'],
  nextConcepts: ['tcp-congestion', 'tcp-close'],
  concepts: [
    {
      id: 'retransmission',
      title: '丢包与重传',
      content: '没有及时收到确认时，发送方重新发送尚未确认的字节；接收方按序号消除重复。',
      why: '数据和确认都可能丢失，不能假定没收到确认就代表对端没收到数据。',
      relatedConcepts: ['sequence', 'tcp-reliability'],
    },
    {
      id: 'sliding-window',
      title: '滑动窗口',
      content: '发送方保留已发送未确认的区间，同时允许窗口内的新字节在前一段 ACK 返回前发送。',
      why: '逐段等待确认会闲置带宽，而无限发送会压垮接收端。',
      relatedConcepts: ['flow-control', 'tcp-congestion'],
    },
    {
      id: 'flow-control',
      title: '接收窗口与流量控制',
      content: '应用读取释放缓冲空间；发送方需要收到窗口更新，才能知道可以继续发送。',
      why: '接收端内存与应用处理速度有限。',
      relatedConcepts: ['sliding-window', 'socket'],
    },
  ],
  experiments: [
    {
      id: 'tcp-byte-stream',
      type: 'tcp-reliability',
      title: '可靠字节流实验台',
      description: '分开发送数据、确认、应用读取和 RTO 重传。',
      question: '重复的数据会不会再次交给应用？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '接收端收到了 Seq=1001、Len=100 的段，但 ACK=1101 丢了。重传该段后应怎样处理？',
    options: [
      { id: 'a', text: '再次把这 100 字节交给应用，因为这是一个新报文。' },
      { id: 'b', text: '把累计 ACK 改成 1201，给重传分配新序号。' },
      { id: 'c', text: '按原序号识别重复，保留累计 ACK=1101，不重复交付。' },
    ],
    answer: 'c',
    explanation:
      'TCP 可靠性针对字节流。相同序号区间不是新字节；ACK 丢失可以造成重复传输，但不应造成重复应用数据。',
    hint: '丢失一个 ACK，再触发 RTO，比较发送次数和应用读取字节数。',
  },
} satisfies Course
