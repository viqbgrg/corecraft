import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'trees-heaps',
  slug: 'trees-heaps',
  title: '搜索树与堆各自保证什么',
  englishTitle: 'Search Trees and Heaps',
  level: 5,
  category: '数据结构',
  duration: 22,
  description: '维护左小右大与父不大于子的不同约束，观察插入、查找和删除。',
  question: '最小堆的根是最小值，为什么仍不能像 BST 一样查找任意键？',
  objectives: ['区分二叉树形状与排序约束', '删除 BST 的双子节点并维护大小关系', '用上浮和下沉维护最小堆'],
  prerequisites: ['array', 'binary-search'],
  nextConcepts: ['btree', 'graph'],
  concepts: [
    {
      id: 'tree',
      title: '树与二叉树',
      content: '树用父子关系组织层级，二叉树的每个节点最多两个孩子；形状本身不保证有序或平衡。',
      why: '分层组织可缩小搜索范围，也可以表达递归结构。',
      relatedConcepts: ['bst', 'heap', 'btree'],
    },
    {
      id: 'bst',
      title: '二叉搜索树',
      content: '每个节点的整个左子树键更小、整个右子树键更大。查找根据键值选择一个子树。',
      why: '借助全局大小约束排除不可能的子树。',
      relatedConcepts: ['tree', 'binary-search', 'btree'],
    },
    {
      id: 'heap',
      title: '二叉最小堆',
      content: '完全二叉树上父节点不大于子节点；根一定最小，但左右子树之间没有大小顺序。',
      why: '优先队列需要反复取得最小项，无需维护完整排序。',
      relatedConcepts: ['array', 'dijkstra', 'queue'],
    },
  ],
  experiments: [
    {
      id: 'trees-heaps-lab',
      type: 'trees-heaps',
      title: '树的约束实验台',
      description: '实际维护 BST 链接和堆数组。',
      question: '删除一个有两个孩子的 BST 节点后，用哪个键接替？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '一个最小堆的左孩子为 10、右孩子为 20，查找 25 时能排除右子树吗？',
    options: [
      { id: 'a', text: '不能只按左右顺序排除；堆只保证父子大小，不保证左子树整体小于右子树。' },
      { id: 'b', text: '可以，所有二叉树都满足左小右大。' },
      { id: 'c', text: '堆只允许查找根，其他数据已经丢失。' },
    ],
    answer: 'a',
    explanation:
      '可利用某个子树根大于目标来排除该子树，但不能使用 BST 的左右分支规则；一般任意键查找仍可能线性扫描。',
    hint: '堆的有序关系沿父子路径，不是按中序遍历得到的全序。',
  },
} satisfies Course
