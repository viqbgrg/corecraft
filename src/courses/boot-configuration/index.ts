import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'boot-configuration',
  slug: 'boot-configuration',
  title: '配置绑定与自动配置',
  englishTitle: 'Boot Configuration and Auto-configuration',
  level: 13,
  category: 'Spring Boot',
  duration: 28,
  description: '追踪配置优先级与类型绑定，查看条件报告，观察自动配置向用户 Bean 退让。',
  question: '引入 Starter 后，为什么目标 Bean 仍可能不存在？',
  objectives: [
    'Starter 汇集依赖，自动配置根据类路径、属性和已有 Bean 决定是否贡献定义。',
    'Environment 按来源优先级选择值，ConfigurationProperties 将字符串转换并校验为配置对象。',
  ],
  prerequisites: ['spring-container'],
  nextConcepts: ['boot-web'],
  concepts: [
    {
      id: 'boot-starter',
      title: 'Starter 与自动配置条件',
      content: 'Starter 汇集依赖，自动配置根据类路径、属性和已有 Bean 决定是否贡献定义。',
      why: '依赖存在与配置生效需要两份证据。',
      relatedConcepts: ['spring-container'],
    },
    {
      id: 'configuration-properties',
      title: '类型安全配置绑定',
      content: 'Environment 按来源优先级选择值，ConfigurationProperties 将字符串转换并校验为配置对象。',
      why: '有效值来自哪里，比只读一个配置文件更重要。',
      relatedConcepts: ['spring-container'],
    },
  ],
  experiments: [
    {
      id: 'boot-configuration-lab',
      type: 'boot-configuration',
      title: '配置绑定与自动配置',
      description: '追踪配置优先级与类型绑定，查看条件报告，观察自动配置向用户 Bean 退让。',
      question: '引入 Starter 后，为什么目标 Bean 仍可能不存在？',
      config: {},
    },
  ],
  challenge: {
    question: '用户 Configuration 已定义一个 Client，自动配置带 ConditionalOnMissingBean(Client)，会怎样？',
    options: [
      {
        id: 'a',
        text: '自动配置必须覆盖用户 Bean。',
      },
      {
        id: 'b',
        text: '自动配置退让，保留用户 Bean；Starter 仍可以存在于类路径中。',
      },
      {
        id: 'c',
        text: '整个 ApplicationContext 都必须停止启动。',
      },
    ],
    answer: 'b',
    explanation:
      '自动配置通常用于补齐缺省能力，条件不匹配可以是正常退让。应结合条件报告与用户定义判断，而非把所有未匹配都当成错误。',
    hint: '对比最终 Bean 数量与 MissingBean 条件原因。',
  },
  content,
} satisfies Course
