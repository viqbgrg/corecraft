import type { Course } from '../../types/course'
import content from './lesson.md?raw'
export default {
  id: 'innodb-indexes',
  slug: 'innodb-indexes',
  title: '命中二级索引，为什么还要回表',
  englishTitle: 'InnoDB Clustered and Secondary Indexes',
  level: 7,
  category: 'MySQL',
  duration: 25,
  description: '操作两棵真实 B+Tree，沿二级叶项中的主键取完整行，再比较覆盖字段与索引维护。',
  question: '索引里明明有记录，为什么读取 amount 仍会访问另一棵树？',
  objectives: [
    'InnoDB 负责行存储、索引、事务与恢复；Server 层负责 SQL 与 Binlog。',
    '主键 B+Tree 的叶项关联完整记录，内部节点用于导航。',
    '二级叶项包含索引列与主键；需要额外字段时再查聚簇树。',
  ],
  prerequisites: ['btree', 'query-optimizer'],
  nextConcepts: ['innodb-commit'],
  concepts: [
    {
      id: 'innodb',
      title: 'InnoDB 存储引擎',
      content: 'InnoDB 负责行存储、索引、事务与恢复；Server 层负责 SQL 与 Binlog。',
      why: '存储布局和 SQL 执行计划共同决定查询的实际访问。',
      relatedConcepts: ['database-pages', 'innodb-commit'],
    },
    {
      id: 'clustered-index',
      title: '聚簇索引',
      content: '主键 B+Tree 的叶项关联完整记录，内部节点用于导航。',
      why: '主键查询能直接定位整行；表的数据组织依赖这个索引。',
      relatedConcepts: ['btree', 'secondary-index'],
    },
    {
      id: 'secondary-index',
      title: '二级索引与覆盖查询',
      content: '二级叶项包含索引列与主键；需要额外字段时再查聚簇树。',
      why: '主键大小与投影字段影响二级索引体积和回表成本。',
      relatedConcepts: ['clustered-index', 'query-optimizer'],
    },
  ],
  experiments: [
    {
      id: 'innodb-indexes-lab',
      type: 'innodb-indexes',
      title: '两棵索引与一张表',
      description: '操作两棵真实 B+Tree，沿二级叶项中的主键取完整行，再比较覆盖字段与索引维护。',
      question: '相同 region 条件，只查 id 与 region 会改变回表次数吗？',
      config: {},
    },
  ],
  challenge: {
    question: '在本模型中，SELECT id, region WHERE region=1 与读取 amount 的区别是什么？',
    options: [
      {
        id: 'a',
        text: '覆盖查询改变了符合条件的记录集合。',
      },
      {
        id: 'b',
        text: '两者匹配相同主键，但 amount 不在二级叶项中，读取它需要按主键回表。',
      },
      {
        id: 'c',
        text: '所有二级索引查询都只需访问一次磁盘。',
      },
    ],
    answer: 'b',
    explanation:
      '二级叶项携带主键，不是完整业务记录。覆盖投影能省去本模型中的聚簇查找；缓存命中、页布局和现实 MVCC 检查仍会影响真实访问。',
    hint: '先执行主键查询，再执行二级查询，最后比较两种字段投影。',
  },
  content,
} satisfies Course
