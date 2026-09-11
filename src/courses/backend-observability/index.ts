import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'backend-observability',
  slug: 'backend-observability',
  title: '可观测性与性能故障诊断',
  englishTitle: 'Observability and Performance Diagnosis',
  level: 17,
  category: '高级 Java 后端',
  duration: 36,
  description: '从真实模拟负载提取五类证据，按 Trace 定位等待，再用单变量复测检验 SLO 改善。',
  question: 'CPU 不高、接口却很慢，下一条有价值的证据是什么？',
  objectives: [
    '指标定位范围，Trace 解释请求阶段，线程、CPU 样本和堆记录区分执行、等待与回收。',
    '保持输入和接纳量不变，修改一个假设相关因素，再验证业务结果与尾延迟。',
    '延迟预算和成功条件共同定义不达标请求，失败比例需要相同统计范围和足够样本。',
  ],
  prerequisites: ['backend-capacity', 'backend-consistency', 'boot-web'],
  nextConcepts: [],
  concepts: [
    {
      id: 'backend-observability-signals',
      title: '关联指标、Trace 与运行时证据',
      content: '指标定位范围，Trace 解释请求阶段，线程、CPU 样本和堆记录区分执行、等待与回收。',
      why: '单个信号不能独立证明根因。',
      relatedConcepts: ['backend-capacity', 'boot-web'],
    },
    {
      id: 'backend-performance-analysis',
      title: '控制变量的性能分析',
      content: '保持输入和接纳量不变，修改一个假设相关因素，再验证业务结果与尾延迟。',
      why: '只观察相关性或成功样本可能误判优化。',
      relatedConcepts: ['mysql-execution', 'jvm-gc'],
    },
    {
      id: 'backend-slo',
      title: 'SLO 与错误预算',
      content: '延迟预算和成功条件共同定义不达标请求，失败比例需要相同统计范围和足够样本。',
      why: '平均值改善不等于用户体验或可靠性达标。',
      relatedConcepts: ['service-resilience'],
    },
  ],
  experiments: [
    {
      id: 'backend-observability-lab',
      type: 'backend-observability',
      title: '可观测性与性能故障诊断',
      description: '从真实模拟负载提取五类证据，按 Trace 定位等待，再用单变量复测检验 SLO 改善。',
      question: 'CPU 不高、接口却很慢，下一条有价值的证据是什么？',
      config: {},
    },
  ],
  challenge: {
    question:
      'Trace 显示大量时间在等待 DB，线程快照是 JDBC WAITING，CPU 样本很少，下一步最有价值的验证是什么？',
    options: [
      {
        id: 'a',
        text: '直接把所有等待时间当作 JVM CPU 热点。',
      },
      {
        id: 'b',
        text: '检查 DB 执行与连接等待，提出减少查询工作的调整，再用同负载验证结果、接纳量和尾延迟。',
      },
      {
        id: 'c',
        text: '只增加 worker 并忽略数据库容量。',
      },
    ],
    answer: 'b',
    explanation:
      '线程存在不等于占用 CPU，长墙钟延迟可能来自外部等待。多种证据支持假设，控制变量复测才能检验其因果影响。',
    hint: '对照增加 worker 与索引减少真实查询工作的两次结果。',
  },
  content,
} satisfies Course
