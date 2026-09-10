import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'btree',
  slug: 'btree',
  title: 'B+Tree 与索引',
  englishTitle: 'Built for Fewer Reads',
  level: 5,
  category: '数据结构',
  duration: 20,
  description: '亲手插入、查找、删除，看一棵树怎样始终保持平衡。',
  question: '数据库索引为什么偏爱一棵“矮而宽”的树？',
  objectives: [
    '沿分隔键找到真正保存记录的叶子',
    '触发叶子与内部节点分裂',
    '通过借位、合并与叶子链表保持有序',
  ],
  prerequisites: ['memory', 'locality'],
  nextConcepts: ['index', 'clustered-index', 'buffer-pool'],
  concepts: [
    {
      id: 'btree',
      title: 'B+Tree',
      content: '多路平衡搜索树，内部节点只导航，记录保存在同一深度的叶子中。',
      why: '每个节点容纳多个键，能用较少层数覆盖大量记录，减少按页读取的次数。',
      relatedConcepts: ['tree-split', 'leaf-link', 'index'],
    },
    {
      id: 'tree-split',
      title: '分裂、借位与合并',
      content: '节点满时分裂，节点不足时优先向兄弟借位，否则合并；变化可以传播到根。',
      why: '插入与删除不能破坏容量约束和所有叶子同层的不变量。',
      relatedConcepts: ['btree', 'clustered-index'],
    },
    {
      id: 'leaf-link',
      title: '叶子链表',
      content: '相邻叶子按键的顺序连接。定位范围起点后，可以沿叶子继续读取。',
      why: '范围查询不必为每个键重复从根走一遍。',
      relatedConcepts: ['btree', 'locality'],
    },
  ],
  challenge: {
    question: '查找 30 时，根的分隔键中已经有 30，为什么还要继续走到叶子？',
    options: [
      {
        id: 'a',
        text: '内部的 30 是导航边界，数据记录仍保存在叶子。',
      },
      {
        id: 'b',
        text: '每个内部键和叶子键都代表两条不同数据。',
      },
      {
        id: 'c',
        text: 'B+Tree 无法从内部节点比较键。',
      },
    ],
    answer: 'a',
    explanation:
      '本模型的每个分隔键等于右子树的最小键，等于分隔键时往右走。内部出现相同数值，是导航副本，不是重复记录。',
    hint: '搜索一个出现在根里的键，观察高亮路径的最后一个节点。',
  },
  experiments: [
    {
      id: 'btree-index-lab',
      type: 'btree',
      title: 'B+Tree 索引实验台',
      description: '真实维护树结构，观察每一次调整的原因。',
      question: '删除叶子里的记录后，父节点的导航键该怎么办？',
      config: {},
    },
  ],
  content,
} satisfies Course
