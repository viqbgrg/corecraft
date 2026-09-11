import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'hash-table',
  slug: 'hash-table',
  title: '哈希碰撞后，数据藏在哪里',
  englishTitle: 'Hash Tables and Tombstones',
  level: 5,
  category: '数据结构',
  duration: 20,
  description: '沿线性探测链查找、删除和扩容，观察墓碑为什么不能直接变空。',
  question: '删除键 1，为什么可能让仍然存在的键 8 消失？',
  objectives: ['区分哈希值相同与键相同', '通过墓碑保持探测链', '扩容后重新计算所有存活键的位置'],
  prerequisites: ['array', 'linear-storage'],
  nextConcepts: ['binary-search', 'btree'],
  concepts: [
    {
      id: 'hash-table',
      title: '哈希表',
      content: '将键映射到槽位，通过额外的碰撞处理保存不同的键。',
      why: '希望在良好散列与受控负载下接近常数时间地查找和更新。',
      relatedConcepts: ['hash-collision', 'array'],
    },
    {
      id: 'hash-collision',
      title: '碰撞、探测与墓碑',
      content: '线性探测检查连续槽位；空槽可以终止查找，已删除的墓碑仍需继续探测。',
      why: '删除不能切断曾因碰撞而偏移的键的查找路径。',
      relatedConcepts: ['hash-table', 'cache'],
    },
  ],
  experiments: [
    {
      id: 'hash-probing',
      type: 'hash-table',
      title: '哈希探测实验台',
      description: '真实维护空槽、占用和删除标记。',
      question: '扩容为什么不是在数组末尾加几个空位就结束？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '容量 7，键 1 和 8 分别位于槽 1、2。删除键 1 后为什么保留墓碑？',
    options: [
      { id: 'a', text: '墓碑让查找键 8 继续探测；直接清空会错误地提前终止。' },
      { id: 'b', text: '墓碑仍保存键 1 的有效数据，因此查找 1 也应该成功。' },
      { id: 'c', text: '任何哈希碰撞都只能通过扩大内存消除。' },
    ],
    answer: 'a',
    explanation:
      '键 8 的起始哈希也为 1。空槽意味着这条探测路径从未经过后续元素，墓碑则表示曾有数据，必须继续。',
    hint: '插入 8，删除 1，再查找 8，观察探测路径 1 → 2。',
  },
} satisfies Course
