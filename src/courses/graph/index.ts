import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'graph',
  slug: 'graph',
  title: '从遍历走向最短路径',
  englishTitle: 'BFS, DFS and Dijkstra',
  level: 5,
  category: '算法',
  duration: 30,
  description: '修改图的边与方向，观察队列、栈和最小距离选择如何改变路径。',
  question: '经过的边最少，路径的总权重就一定最小吗？',
  objectives: ['用队列和栈解释 BFS 与 DFS', '按非负权重执行 Dijkstra 松弛', '处理环、方向和不可达顶点'],
  prerequisites: ['queue', 'stack', 'heap'],
  nextConcepts: ['dynamic-programming', 'dns'],
  concepts: [
    {
      id: 'graph',
      title: '图、顶点与边',
      content: '顶点表示对象，边表示关系；方向和权重是额外的语义，不能从图形距离推断。',
      why: '网络、依赖和可达性通常无法限制为树形结构。',
      relatedConcepts: ['tree', 'bfs', 'dfs'],
    },
    {
      id: 'bfs',
      title: '广度优先搜索',
      content: '队列逐层扩展，首次发现时记录父节点；无权或等权图中得到最少边数的路径。',
      why: '同时扩展同一距离层，避免先沿很长的分支绕远路。',
      relatedConcepts: ['queue', 'graph'],
    },
    {
      id: 'dfs',
      title: '深度优先搜索',
      content: '栈或递归沿一个分支深入，不能继续后回退；已访问标记避免环导致无限重复。',
      why: '适合系统探索可达结构、回溯与依赖关系。',
      relatedConcepts: ['stack', 'graph'],
    },
    {
      id: 'dijkstra',
      title: 'Dijkstra 最短路径',
      content: '每次确定暂定距离最小的未访问顶点，再松弛出边；需要边权非负。',
      why: '边权不同，FIFO 的发现顺序不再保证路径权重最小。',
      relatedConcepts: ['heap', 'bfs', 'dynamic-programming'],
    },
  ],
  experiments: [
    {
      id: 'graph-paths',
      type: 'graph',
      title: '图与路径实验台',
      description: '六个顶点的可编辑加权图，支持有向和无向。',
      question: '先发现的距离为什么还可能被更短路径替换？',
      config: {},
    },
  ],
  content,
  challenge: {
    question: '默认图从 A 到 F，BFS 路径权重为 9，Dijkstra 为 8。为什么 BFS 没有找到权重 8 的路径？',
    options: [
      { id: 'a', text: 'BFS 用队列，因此不能访问带权边的顶点。' },
      { id: 'b', text: 'BFS 优化的是边数；权重为 8 的路径经过更多条边。' },
      { id: 'c', text: 'Dijkstra 总是选择第一条看见的路径，所以结果偶然更好。' },
    ],
    answer: 'b',
    explanation: 'A→B→C→F 有 3 条边、权重 9；A→D→B→C→F 有 4 条边、权重 8。最少跳数与最小权重是不同目标。',
    hint: '对比两条绿色路径，分别数边并相加权重；图上的线段长度不参与计算。',
  },
} satisfies Course
