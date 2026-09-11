import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'spring-mvc',
  slug: 'spring-mvc',
  title: 'MVC 请求分派与响应处理',
  englishTitle: 'Spring MVC Request Dispatch',
  level: 12,
  category: 'Spring',
  duration: 28,
  description: '跟踪 Filter、映射、参数绑定、Controller、异常解析、JSON 与视图渲染。',
  question: 'Controller 没执行，请求为什么已经返回 400？',
  objectives: [
    '映射找到处理器，适配器完成参数解析和调用；失败可能发生在 Controller 之前。',
    '响应体通过消息转换器序列化，逻辑视图经 ViewResolver 渲染，异常解析器可生成错误响应。',
  ],
  prerequisites: ['spring-container', 'http'],
  nextConcepts: ['spring-transactions'],
  concepts: [
    {
      id: 'spring-dispatcher',
      title: 'DispatcherServlet 与 HandlerAdapter',
      content: '映射找到处理器，适配器完成参数解析和调用；失败可能发生在 Controller 之前。',
      why: '请求入口不是直接调用一个 Java 方法。',
      relatedConcepts: ['http', 'spring-container'],
    },
    {
      id: 'mvc-return',
      title: '消息转换与视图解析',
      content: '响应体通过消息转换器序列化，逻辑视图经 ViewResolver 渲染，异常解析器可生成错误响应。',
      why: '同一控制器返回值需要按约定解释。',
      relatedConcepts: ['java-classes'],
    },
  ],
  experiments: [
    {
      id: 'spring-mvc-lab',
      type: 'spring-mvc',
      title: 'MVC 请求分派与响应处理',
      description: '跟踪 Filter、映射、参数绑定、Controller、异常解析、JSON 与视图渲染。',
      question: 'Controller 没执行，请求为什么已经返回 400？',
      config: {},
    },
  ],
  challenge: {
    question: 'POST /orders 的 quantity 无法转换为要求的整数，此时可能怎样？',
    options: [
      {
        id: 'a',
        text: 'Controller 一定已执行并成功写入订单。',
      },
      {
        id: 'b',
        text: '参数解析阶段返回 400，Controller 没被调用，订单没有创建。',
      },
      {
        id: 'c',
        text: 'DispatcherServlet 会把任意字符串默认为 0。',
      },
    ],
    answer: 'b',
    explanation:
      '参数绑定和消息转换由 HandlerAdapter 及相关解析器在调用方法前完成。这里 JSON 类型不满足参数要求，因此异常解析生成 400，业务方法尚未运行。',
    hint: '比较响应状态、Controller 调用次数与订单表。',
  },
  content,
} satisfies Course
