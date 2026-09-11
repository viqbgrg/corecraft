## Problem · 一次 HTTP 请求经过哪些决策

POST /orders 的 JSON quantity 是字符串 oops，Controller 需要整数。请求可以在方法执行前失败；另一次请求也可能成功执行方法，却在响应协商时失败。

## Why · Web 框架负责连接协议与方法

Spring MVC 通常运行在 Servlet 栈。Filter 属于 Servlet 请求链，DispatcherServlet 负责分派。HandlerMapping 根据路径、方法等条件寻找处理器，HandlerAdapter 负责适配其调用方式、解析参数并处理返回值。

HandlerInterceptor 提供 preHandle、postHandle、afterCompletion 等钩子，位置不同于 Servlet Filter。并不是每次请求都会执行每个钩子，前序阶段失败会改变路径。

## Mechanism · 绑定、调用和返回值约定

本课三条路由：POST /orders 用 JSON 创建订单，GET /orders/{id} 用路径变量查询，GET /hello 用查询参数构建问候视图。无法读入或转换 JSON 时生成 400；路径不存在是 404，方法不匹配是 405。

返回响应体时 HttpMessageConverter 序列化为 JSON。返回逻辑视图 greeting 时，ViewResolver 选择模板并转义模型中的名字。RestController 常等价于 Controller 加 ResponseBody 语义，不表示返回字符串一定是视图名。

Controller 抛出的 OrderNotFoundException 可由 HandlerExceptionResolver 与 ControllerAdvice 映射到 404。响应媒体类型不在 Accept 中时返回 406。已执行的业务写入不会因为之后的序列化或协商失败自动回滚，仍需正确事务和错误协议。

## Experiment · 四条真实路径

1. 默认错误 quantity，处理到返回 400，确认 Controller 调用数仍为零、订单数未变。
2. body 改为 {"quantity":3}，重新处理，得到 201 JSON，订单表新增一项。
3. 切 GET，路径 /orders/999，得到业务异常映射的 404；看见 afterCompletion，正常 postHandle 不执行。
4. 路径 /hello?name=Ada，Accept 选 text/html，渲染问候视图，达到目标。把 name 改为编码后的标签，确认输出已经转义。
5. 比较 Filter 拒绝的 401、方法不匹配 405、路径缺失 404 与 Accept 不支持 406。

## Conclusion · Web 行为需要按阶段诊断

实验不启动真实 Servlet 容器，仅有三个固定路由、简化精确媒体类型协商与模板。JSON quantity 只检查整数类型，业务范围与 Bean Validation 在 Boot 课程继续。未覆盖 Content-Type 协商、复杂参数解析、异步请求或 WebFlux。

诊断接口错误时，先确定请求到达哪个阶段，再检查参数、处理器、业务和返回值；HTTP 状态与 Controller 是否执行不是一一对应关系。
