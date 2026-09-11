## Problem · 非法输入和外部故障不能用同一个判断处理

订单 email 无效、quantity=0、地址城市为空，应该在业务写入前拒绝。DB 暂不可用时，有效订单也可能不能处理，但进程和 HTTP 服务器仍然活着。

## Why · Boot 集成多种能力，应用仍需配置

Servlet Web starter 提供嵌入式服务器与 MVC 集成。Bean Validation 需要 provider 和适用入口，例如 @Valid 请求体；Actuator 提供健康、指标等管理能力。这些依赖与默认配置随版本而异，不能认为引入一个 Web starter 就自动拥有所有功能。

## Mechanism · 约束、健康与访问策略

JSON 先绑定类型，quantity 字符串不能当成本课要求的整数。之后检查 email、@Min(1)，地址对象的 @NotNull，以及 @Valid 级联到 city 的 @NotBlank。@Valid 本身不会拒绝 null，空对象引用需要另一个约束。仅写约束注解但未接通 provider 与入口不会自动验证。

本应用 readiness 显式纳入 DB，故障时返回 503 / DOWN；liveness 不依赖 DB，仍返回 UP。实际 Boot readiness 默认不一定包含外部依赖，应根据共享依赖和导流后果选择分组。

metrics 未暴露时是 404；显式暴露后仍要通过本应用 operator 访问策略，否则 403。这里的权限是课程应用配置，不是宣称 Boot 的统一默认规则。HTTP 请求按 uri 模板、status 等有限标签计数，避免把用户 ID 作为标签造成无界基数。

## Experiment · 分别验证每个边界

1. 启动应用，提交默认无效订单，得到三个约束错误，订单数仍为零。
2. 使用 {"email":"ada@example.test","quantity":2,"address":{"city":"杭州"}}，提交得到 201。
3. 让 DB 不可用，请求 readiness 得到 503，再请求 liveness 得到 200，进程无需因为此项依赖故障而立刻重启。
4. 请求 metrics，先看到 404；显式暴露后匿名请求为 403；选择 operator 后返回指标，达到目标。
5. 关闭级联检查，比较空 city 与 null address；停止应用后请求是连接失败，没有虚构 HTTP 响应。

## Conclusion · 管理能力也需要明确契约

本课不启动真实服务器，邮箱使用有限教学正则，时长采用确定教学时隙。指标读取展示请求完成前的快照，读取本身随后也进入计数。没有实现完整 Micrometer 聚合、直方图、认证体系或部署探针。

校验保护输入，探针指导运行决策，指标记录行为，授权限制管理访问。理解它们的职责，才能给出可诊断且可恢复的应用行为。
