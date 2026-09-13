import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'linear-storage',
  slug: 'linear-storage',
  title: '数组与链表怎样定位数据',
  englishTitle: 'Arrays and Linked Lists',
  level: 5,
  category: '数据结构',
  duration: 25,
  description: '把逻辑顺序与物理位置分开，比较搬移元素和修改链接。',
  question: '链表插入只改两个链接，为什么按索引插入仍可能很慢？',
  objectives: ['区分索引位置与节点链接', '观察插入删除如何维护顺序', '把定位成本与修改成本分开计算'],
  prerequisites: ['memory', 'cache'],
  nextConcepts: ['stack-queue', 'binary-search', 'hash-table'],
  concepts: [
    {
      id: 'array',
      title: '数组与连续槽位',
      content: '等长元素连续存放，可用 base + index × size 直接计算位置。中间插入需要为后缀腾出位置。',
      why: '连续存储支持直接定位和较好的空间局部性。',
      relatedConcepts: ['locality', 'binary-search'],
    },
    {
      id: 'linked-list',
      title: '单链表与前驱',
      content: '节点保存数据和 next，逻辑顺序由链接决定。按索引查找必须沿链接走到目标。',
      why: '已有前驱引用时，可只改少量链接完成插入而不搬移整个后缀。',
      relatedConcepts: ['array', 'stack-queue'],
    },
  ],
  experiments: [
    {
      id: 'linear-storage-lab',
      type: 'linear-storage',
      title: '线性存储实验台',
      description: '真正插入、删除和读取数组或单链表。',
      question: '索引越靠后，两种结构的代价怎样变化？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '给定一个单链表的头引用，要在索引 k 处插入，整体时间复杂度通常是什么？',
    options: [
      { id: 'a', text: '总是 O(1)，因为只需要修改两个链接。' },
      { id: 'b', text: 'O(k)：先遍历找到前驱，再用 O(1) 修改链接。' },
      { id: 'c', text: 'O(n²)，因为链表不能保存前驱。' },
    ],
    answer: 'b',
    explanation: 'O(1) 描述的是已经定位前驱后的链接操作。仅有头引用时，按索引定位仍需要遍历。',
    hint: '把操作索引改为 3，比较单链表的节点访问数与链接写入数。',
  },
} satisfies Course
