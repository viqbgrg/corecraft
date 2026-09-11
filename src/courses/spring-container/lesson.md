## Problem · 对象应该由谁组装

Controller 需要 Service，Service 需要 Repo。如果每个对象都自己 new 下层实现，切换实现与统一管理生命周期会分散到业务代码中。IoC 将装配控制交给容器，DI 通过构造器或属性传入依赖。

## Why · 先描述依赖，再创建实例

BeanDefinition 保存类型、作用域与依赖等元数据。注册定义不一定立即创建实例。BeanFactory 提供基本的 Bean 获取和管理；ApplicationContext 在此基础上提供环境、事件、资源等能力，refresh 通常预实例化非 lazy singleton。

Bean 只是受容器管理的对象，并不天然线程安全。singleton 是一个容器中相应定义的共享实例，不等于整个 JVM 只能存在一个。

## Mechanism · 候选、身份与生命周期

本图有 memoryRepo 与 jdbcRepo 两个 Repo 候选。按类型注入不能唯一决定时，抛出歧义错误；Qualifier 缩小候选范围。实际 Spring 还支持 @Primary 等规则，本模型只显式执行 qualifier 过滤。

容器先解析构造依赖，再实例化、注入属性、调用初始化和后处理，将单例加入缓存。BeanPostProcessor 可改变最终暴露对象，例如生成代理；本课后处理仅记录已执行，代理机制在下一课单独验证。

prototype 每次显式 getBean 创建新实例，但注入进 singleton 后是普通固定引用，不会自动每次调用更换。容器会初始化 prototype，通常不统一管理其后续销毁。

构造器循环在对象尚不存在时互相请求，无法靠提前暴露解决。允许属性注入提前暴露的 singleton 可以在部分条件下接通循环；这不保证所有循环都可解，涉及代理、原型或初始化顺序时仍有风险。

## Experiment · 看见对象身份而非只看名字

1. 注册定义，确认没有对象。getBean(controller)，观察两个 Repo 候选导致失败。
2. 指定 memoryRepo qualifier，新容器重新注册、refresh；观察依赖先后与生命周期回调。
3. 连续两次 getBean(controller)，返回同一对象身份。
4. Service 作用域改为 prototype，重新注册，目标选择 service，连续获取两次，得到不同身份但共享单例 Repo。
5. 关闭容器，检查 Repo 被销毁，prototype Service 仍由调用者负责，达到目标。
6. 独立场景启用 Service / Audit 循环。构造器注入失败；属性注入还需要允许提前暴露，并且只适用本课的单例条件。

## Conclusion · 容器配置就是可检查的依赖图

固定图不模拟完整扫描、FactoryBean、早期代理或完整 refresh 失败清理。失败解析会在教学状态中原子撤销本次候选对象，保留错误路径；真实初始化若产生外部副作用，未必能如此撤销。

理解装配、作用域和生命周期后，才能解释“为什么找不到 Bean”“为什么拿到同一个实例”“为什么循环依赖失败”，以及初始化与销毁分别该承担什么责任。
