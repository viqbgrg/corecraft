import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'spring-transactions',
  slug: 'spring-transactions',
  title: 'AOP 代理与事务边界',
  englishTitle: 'Spring AOP Proxies and Transactions',
  level: 12,
  category: 'Spring',
  duration: 28,
  description: '逐步转账并观察已提交余额，比较自调用、代理、异常规则与事务传播。',
  question: '方法上有事务注解，为什么自调用失败后仍可能扣款？',
  objectives: [
    'Spring 代理在外部经过代理的调用周围执行 advice；普通 this 自调用不会重新穿过代理。',
    '事务拦截器根据传播与回滚规则处理当前资源工作区，业务抛异常不总等于回滚。',
    'REQUIRED 可共享 rollback-only 状态，REQUIRES_NEW 使用独立事务，其提交不随外层回滚撤销。',
  ],
  prerequisites: ['spring-container', 'transactions'],
  nextConcepts: ['spring-mvc'],
  concepts: [
    {
      id: 'spring-proxy',
      title: 'AOP 与代理调用',
      content: 'Spring 代理在外部经过代理的调用周围执行 advice；普通 this 自调用不会重新穿过代理。',
      why: '注解元数据需要适用拦截器才能影响执行。',
      relatedConcepts: ['spring-container'],
    },
    {
      id: 'spring-transaction',
      title: '声明式事务的提交与回滚',
      content: '事务拦截器根据传播与回滚规则处理当前资源工作区，业务抛异常不总等于回滚。',
      why: '调用结果和资源事务结果要分开核对。',
      relatedConcepts: ['transactions'],
    },
    {
      id: 'spring-propagation',
      title: 'REQUIRED 与 REQUIRES_NEW',
      content: 'REQUIRED 可共享 rollback-only 状态，REQUIRES_NEW 使用独立事务，其提交不随外层回滚撤销。',
      why: '内外层逻辑方法不一定对应独立物理事务。',
      relatedConcepts: ['java-classes'],
    },
  ],
  experiments: [
    {
      id: 'spring-transactions-lab',
      type: 'spring-transactions',
      title: 'AOP 代理与事务边界',
      description: '逐步转账并观察已提交余额，比较自调用、代理、异常规则与事务传播。',
      question: '方法上有事务注解，为什么自调用失败后仍可能扣款？',
      config: {},
    },
  ],
  challenge: {
    question: '内层 REQUIRED 抛运行时异常，外层 catch 后继续并正常返回，为什么仍可能失败？',
    options: [
      {
        id: 'a',
        text: 'catch 自动取消事务管理，所有数据立即保存。',
      },
      {
        id: 'b',
        text: '共享事务可能已被标记 rollback-only，外层提交时回滚并报 UnexpectedRollbackException。',
      },
      {
        id: 'c',
        text: 'REQUIRED 总会创建一个与外层无关的新事务。',
      },
    ],
    answer: 'b',
    explanation:
      '逻辑调用层次不改变共享物理事务的 rollback-only 状态。外层 catch 只是处理 Java 异常，不会清除事务已经作出的回滚决定。',
    hint: '查看内层失败后的 rollback-only 标志。',
  },
  content,
} satisfies Course
