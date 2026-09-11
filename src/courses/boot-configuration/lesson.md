## Problem · 配置文件写了，运行值却不同

基础文件设置超时 1500ms，prod 文件设置 500ms，命令行设置 1s。最终值由哪些来源参与以及优先级决定，不能只看其中一个文件。

## Why · 约定需要可解释的覆盖规则

Spring Boot Starter 聚合一组相容依赖，通常不直接替你创建每个对象。自动配置候选结合条件决定是否注册 Bean。用户自己的 @Configuration 和 @Bean 可以提供明确配置，使默认方案退让。

ConfigurationProperties 将一组属性绑定为类型对象，适合集中校验和注入。Environment 保存多来源属性；@Value 和直接查询属性也存在，但不替代完整的类型安全配置建模。

## Mechanism · 属性来源、类型转换和条件报告

本课从低到高合并：代码默认、application.properties、profile 文件、环境变量、命令行。真实 Boot 还有测试属性、配置导入和其他来源，本课不是完整优先级表。

规范键 app.client.pool-size 的环境形式在本课为 APP_CLIENT_POOLSIZE：点改下划线、横线移除、大写。仅实现列出的 relaxed binding 别名。timeout 支持整数 ms / s，pool-size、port 转为整数，enabled 转为布尔，然后执行范围校验。绑定失败阻止启动，不能用非法配置创建客户端。

客户端自动配置需要类路径中有 HttpClient、enabled=true，并且用户未声明 Client。三个条件都满足才创建自动 Bean。用户 Client 存在时 MissingBean 不匹配，最终保留一个用户 Bean；这是正常退让。缺类或属性关闭则可能完全没有 Client。

## Experiment · 从失败到可解释启动

1. 默认环境 pool-size=oops，启动失败，检查绑定原因，Bean 数为零。
2. 环境改为 APP_CLIENT_POOLSIZE=6;APP_CLIENT_TIMEOUT=750ms，再启动。pool=6，超时由命令行胜出为 1000ms，自动 Bean 创建。
3. 声明用户 Client 再启动，MissingBean 条件失败，保留用户 Bean，达到目标。
4. 移除 Starter 或将 enabled=false，观察类路径和属性条件分别阻止自动创建。
5. 改输入后先检查旧绑定仍保持，只有再次启动才重新应用；普通 ConfigurationProperties 不是自动热更新协议。

## Conclusion · 诊断应留下来源与原因

固定客户端示例不加载真实 JAR，不实现配置导入、完整绑定器、条件评估时序或热刷新。这里的 prod 只是教学 profile 名称，不涉及任何部署。

自动配置问题应核对依赖、有效属性、类型绑定、条件报告与最终 Bean 定义。通过这些证据，可以区分缺依赖、值被覆盖、校验失败和正常用户配置退让。
