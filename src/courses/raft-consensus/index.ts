import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'raft-consensus',
  slug: 'raft-consensus',
  title: 'Raft 任期、日志与多数提交',
  englishTitle: 'Raft Elections and Log Commitment',
  level: 16,
  category: '分布式系统',
  duration: 34,
  description: '调度 RequestVote 与 AppendEntries，隔离旧主、选出新主并修复未提交分叉。',
  question: '一个 Leader 已写本地日志，为什么仍不能向客户端确认？',
  objectives: [
    '节点每任期最多投一票，并检查候选日志的新旧；多数选出的 Leader 仍需复制日志。',
    'prevIndex/prevTerm 检查定位匹配前缀，冲突后缀可截断；当前任期条目的多数复制推进提交。',
    '提交的统一命令顺序驱动各状态机，旧任期或少数侧本地追加不代表共同决定。',
  ],
  prerequisites: ['distributed-consistency', 'wal'],
  nextConcepts: ['distributed-locks', 'distributed-transactions'],
  concepts: [
    {
      id: 'raft-election',
      title: 'Raft 任期与选举限制',
      content: '节点每任期最多投一票，并检查候选日志的新旧；多数选出的 Leader 仍需复制日志。',
      why: '选举必须保留已经提交的历史。',
      relatedConcepts: ['distributed-consistency'],
    },
    {
      id: 'raft-log',
      title: '日志匹配与提交索引',
      content: 'prevIndex/prevTerm 检查定位匹配前缀，冲突后缀可截断；当前任期条目的多数复制推进提交。',
      why: '已经提交的状态机前缀不可被新 Leader 随意覆盖。',
      relatedConcepts: ['wal'],
    },
    {
      id: 'consensus',
      title: '共识与状态机复制',
      content: '提交的统一命令顺序驱动各状态机，旧任期或少数侧本地追加不代表共同决定。',
      why: '多个节点需要对同一历史作出可靠决定。',
      relatedConcepts: ['distributed-transactions'],
    },
  ],
  experiments: [
    {
      id: 'raft-consensus-lab',
      type: 'raft-consensus',
      title: 'Raft 任期、日志与多数提交',
      description: '调度 RequestVote 与 AppendEntries，隔离旧主、选出新主并修复未提交分叉。',
      question: '一个 Leader 已写本地日志，为什么仍不能向客户端确认？',
      config: {},
    },
  ],
  challenge: {
    question: '隔离旧主 A 上的未提交值 9，与新主已提交的同位置条目冲突，恢复后应怎样？',
    options: [
      {
        id: 'a',
        text: '旧主曾经是 Leader，所以 9 必须覆盖所有节点。',
      },
      {
        id: 'b',
        text: '保留已经提交的共同前缀，按新主日志修复冲突后缀；未提交的 9 可以被丢弃。',
      },
      {
        id: 'c',
        text: '任何写过本地磁盘的日志都永远不可修改。',
      },
    ],
    answer: 'b',
    explanation:
      'Raft 保护已提交条目。仅本地持久化还未获得所需多数提交的后缀可以被替换，客户端也不应被提前告知它已完成。',
    hint: '看 proposal committed 与节点 log/commit/applied 的区别。',
  },
  content,
} satisfies Course
