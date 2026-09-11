import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'spring-container',
  slug: 'spring-container',
  title: '容器、依赖注入与 Bean 生命周期',
  englishTitle: 'Spring Containers and Dependency Injection',
  level: 12,
  category: 'Spring',
  duration: 28,
  description: '注册定义并解析对象图，解决候选歧义，比较 singleton、prototype 与循环依赖。',
  question: '注册一个 BeanDefinition，是否已经创建了 Bean？',
  objectives: [
    '容器从定义解析依赖并构建对象图，把创建与装配职责从业务对象中移出。',
    'getBean 根据定义与缓存获取对象；prototype 每次请求创建，singleton 重用同一身份。',
    'refresh 可预实例化非 lazy 单例并提供环境和事件等能力；close 管理单例销毁。',
  ],
  prerequisites: ['java-objects', 'java-classes'],
  nextConcepts: ['spring-transactions', 'spring-mvc'],
  concepts: [
    {
      id: 'ioc',
      title: 'IoC 与依赖注入',
      content: '容器从定义解析依赖并构建对象图，把创建与装配职责从业务对象中移出。',
      why: '业务应通过明确依赖表达合作关系。',
      relatedConcepts: ['java-objects'],
    },
    {
      id: 'bean-factory',
      title: 'BeanFactory 与 Bean 作用域',
      content: 'getBean 根据定义与缓存获取对象；prototype 每次请求创建，singleton 重用同一身份。',
      why: '作用域约束创建频率，不直接保证线程安全。',
      relatedConcepts: ['java-classes'],
    },
    {
      id: 'application-context',
      title: 'ApplicationContext 与生命周期',
      content: 'refresh 可预实例化非 lazy 单例并提供环境和事件等能力；close 管理单例销毁。',
      why: '注册、创建、初始化与销毁具有不同边界。',
      relatedConcepts: ['spring-transactions'],
    },
  ],
  experiments: [
    {
      id: 'spring-container-lab',
      type: 'spring-container',
      title: '容器、依赖注入与 Bean 生命周期',
      description: '注册定义并解析对象图，解决候选歧义，比较 singleton、prototype 与循环依赖。',
      question: '注册一个 BeanDefinition，是否已经创建了 Bean？',
      config: {},
    },
  ],
  challenge: {
    question:
      'singleton Controller 构造时注入一个 prototype Service，之后多次获取同一个 Controller，会怎样？',
    options: [
      {
        id: 'a',
        text: '每调用一次 Controller 方法都会自动换一个 Service。',
      },
      {
        id: 'b',
        text: 'Controller 持有最初注入的 Service；prototype 的重新创建发生在新的容器获取请求上。',
      },
      {
        id: 'c',
        text: 'prototype Bean 不会执行初始化。',
      },
    ],
    answer: 'b',
    explanation:
      'scope 控制容器创建语义，不会自动把普通对象引用变成每次调用动态查找。每次方法调用需要新实例时，应另行使用 Provider、查找或合适的代理方案。',
    hint: '对比显式 getBean(service) 与只重复 getBean(controller)。',
  },
  content,
} satisfies Course
