import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'tcp-handshake',
  slug: 'tcp-handshake',
  title: 'TCP 三次握手',
  englishTitle: 'A Reliable Beginning',
  level: 4,
  category: '网络与协议',
  duration: 18,
  description: '亲手发送每一个报文，在不可靠的网络上建立共同认知。',
  question: 'Server 已经收到 SYN，为什么还需要最后一次 ACK？',
  objectives: [
    '观察两端各自维护的连接状态',
    '跟踪 Seq、Ack 与初始序号同步',
    '通过丢包和错误 ACK 理解最后一次确认',
  ],
  prerequisites: ['binary', 'process'],
  nextConcepts: ['tcp-close', 'dns', 'http'],
  concepts: [
    {
      id: 'tcp',
      title: 'TCP 连接',
      content: '两端分别维护状态与序号空间，可靠传输由这些状态协作完成。',
      why: '网络会丢失、延迟、重复报文，两端不能只凭“发送了”就相信对方已收到。',
      relatedConcepts: ['sequence', 'retransmission'],
    },
    {
      id: 'sequence',
      title: 'Sequence / ACK',
      content: 'Seq 标识序列空间的位置，Ack 表示下一次期望收到的序号；SYN 和 FIN 各消耗一个序号。',
      why: '接收方需要辨别新旧数据、顺序和重复报文，并确认已收到的范围。',
      relatedConcepts: ['tcp', 'tcp-close'],
    },
    {
      id: 'retransmission',
      title: '丢包与重传',
      content: '未获得确认时重发相同的序号内容，而不是为同一份内容分配新序号。',
      why: '发送不代表送达，只有接收方的有效反馈才能推进可靠协议。',
      relatedConcepts: ['time-wait', 'sequence'],
    },
  ],
  challenge: {
    question: 'Client 收到 SYN+ACK，但最后的 ACK 在路上丢失。此时哪种状态组合正确？',
    options: [
      {
        id: 'a',
        text: 'Client ESTABLISHED，Server SYN_RCVD。',
      },
      {
        id: 'b',
        text: '两端都 ESTABLISHED，因为总共点过三个按钮。',
      },
      {
        id: 'c',
        text: 'Client CLOSED，Server LISTEN。',
      },
    ],
    answer: 'a',
    explanation:
      'Client 已收到对自身 SYN 的确认与 Server 的初始序号；Server 仍没有收到对自身 SYN 的有效确认，所以留在 SYN_RCVD。',
    hint: '将“下一次发送”改为丢包，再点击发送 ACK，分别读两端状态。',
  },
  experiments: [
    {
      id: 'tcp-handshake-lab',
      type: 'tcp-handshake',
      title: 'TCP 握手实验台',
      description: '手动控制报文和故障，观察 Client / Server。',
      question: '丢掉最后的 ACK，哪一端还停在半连接状态？',
      config: {},
    },
  ],
  content,
} satisfies Course
