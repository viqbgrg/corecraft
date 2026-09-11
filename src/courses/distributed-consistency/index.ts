import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'distributed-consistency',
  slug: 'distributed-consistency',
  title: '分区、一致性与收敛',
  englishTitle: 'Partitions, Consistency and Convergence',
  level: 16,
  category: '分布式系统',
  duration: 28,
  description: '把三副本拆成两个分区，比较仲裁拒绝与本地接受，再执行冲突决议和反熵修复。',
  question: '网络分区期间，每个节点都成功响应写入会带来什么代价？',
  objectives: [
    '分区时，线性一致请求需要协调，无法同时让所有非故障节点都按形式化可用性条件成功完成。',
    '本地接受可以提高分区期间响应能力，但需要冲突规则与最终通信来收敛。',
    '多数交集需要与版本查询、最大值选择和必要写回结合，不能只用 R+W>N 宣称线性一致。',
  ],
  prerequisites: ['redis-topology'],
  nextConcepts: ['raft-consensus', 'service-resilience'],
  concepts: [
    {
      id: 'cap',
      title: 'CAP 的分区取舍',
      content: '分区时，线性一致请求需要协调，无法同时让所有非故障节点都按形式化可用性条件成功完成。',
      why: '局部网络观察无法立即确定远端最新状态。',
      relatedConcepts: ['tcp-reliability'],
    },
    {
      id: 'base',
      title: 'BASE 与最终收敛',
      content: '本地接受可以提高分区期间响应能力，但需要冲突规则与最终通信来收敛。',
      why: '最终一致不是没有协议的自动结果。',
      relatedConcepts: ['redis-topology'],
    },
    {
      id: 'quorum-register',
      title: '仲裁读写与版本',
      content: '多数交集需要与版本查询、最大值选择和必要写回结合，不能只用 R+W>N 宣称线性一致。',
      why: '算式只解释集合交集，不覆盖整个读取与写入协议。',
      relatedConcepts: ['raft-consensus'],
    },
  ],
  experiments: [
    {
      id: 'distributed-consistency-lab',
      type: 'distributed-consistency',
      title: '分区、一致性与收敛',
      description: '把三副本拆成两个分区，比较仲裁拒绝与本地接受，再执行冲突决议和反熵修复。',
      question: '网络分区期间，每个节点都成功响应写入会带来什么代价？',
      config: {},
    },
  ],
  challenge: {
    question: '分区两侧都接受不同寄存器值，恢复通信后按固定规则选一个值，能说明什么？',
    options: [
      {
        id: 'a',
        text: '保证每次读都已经线性一致。',
      },
      {
        id: 'b',
        text: '系统能够按协议收敛，但可能舍弃另一侧已确认值的业务含义，需要明确冲突处理。',
      },
      {
        id: 'c',
        text: '只要网络恢复，所有值会在零时间内自动合并。',
      },
    ],
    answer: 'b',
    explanation:
      '收敛需要传播与冲突规则。选择单个胜出值不等于合并两次业务效果，也不补回分区期间缺失的实时顺序保证。',
    hint: '比较成功写入历史和修复后的单一值。',
  },
  content,
} satisfies Course
