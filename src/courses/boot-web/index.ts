import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'boot-web',
  slug: 'boot-web',
  title: 'Web 校验与 Actuator',
  englishTitle: 'Boot Web Validation and Actuator',
  level: 13,
  category: 'Spring Boot',
  duration: 28,
  description: '校验订单输入，比较 DB 故障下的存活与就绪，再显式暴露并授权请求指标。',
  question: 'DB 不可用时，为什么不应直接把进程判断为不存活？',
  objectives: [
    '类型绑定先于约束校验；嵌套 @Valid 与 @NotNull 分别控制级联和空值约束。',
    '管理端点需要明确暴露与访问策略；liveness、readiness 表达不同的运行条件。',
    '完成请求按有限 uri/status 标签记录指标，错误响应也属于实际请求结果。',
  ],
  prerequisites: ['spring-mvc', 'boot-configuration'],
  nextConcepts: ['java-executors'],
  concepts: [
    {
      id: 'boot-validation',
      title: '绑定与 Bean Validation',
      content: '类型绑定先于约束校验；嵌套 @Valid 与 @NotNull 分别控制级联和空值约束。',
      why: '注解、provider 与调用入口都需要接通。',
      relatedConcepts: ['spring-mvc'],
    },
    {
      id: 'boot-actuator',
      title: 'Actuator 暴露与健康分组',
      content: '管理端点需要明确暴露与访问策略；liveness、readiness 表达不同的运行条件。',
      why: '重启进程与暂不接流量是不同恢复动作。',
      relatedConcepts: ['boot-configuration'],
    },
    {
      id: 'boot-web-app',
      title: '可观测的 Web 应用',
      content: '完成请求按有限 uri/status 标签记录指标，错误响应也属于实际请求结果。',
      why: '总请求量和成功业务量不能混为一谈。',
      relatedConcepts: ['http'],
    },
  ],
  experiments: [
    {
      id: 'boot-web-lab',
      type: 'boot-web',
      title: 'Web 校验与 Actuator',
      description: '校验订单输入，比较 DB 故障下的存活与就绪，再显式暴露并授权请求指标。',
      question: 'DB 不可用时，为什么不应直接把进程判断为不存活？',
      config: {},
    },
  ],
  challenge: {
    question: '本应用把 DB 纳入 readiness，但 liveness 只反映进程存活。DB 故障时应该观察到什么？',
    options: [
      {
        id: 'a',
        text: 'readiness 可以 DOWN，liveness 仍 UP；这支持停止导流而不因外部故障不断重启进程。',
      },
      {
        id: 'b',
        text: '所有探针必须同时返回 500。',
      },
      {
        id: 'c',
        text: '暴露 Actuator 就自动允许任何人读取所有端点。',
      },
    ],
    answer: 'a',
    explanation:
      '健康分组对应不同恢复决策。外部依赖短暂失败通常不证明进程无法恢复；探针内容、HTTP 映射、端点暴露和权限均需显式配置。',
    hint: '分别请求 readiness、liveness 和未暴露的 metrics。',
  },
  content,
} satisfies Course
