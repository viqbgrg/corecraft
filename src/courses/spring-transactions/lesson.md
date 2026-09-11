## Problem · 注解存在，扣款为什么没撤销

A=100、B=50，转账二十先扣 A 再加 B。如果扣款后抛异常，希望两步都不生效。方法上的 @Transactional 表达声明，但执行是否进入事务拦截器取决于调用路径和配置。

## Why · 横切逻辑需要包围正确调用

AOP 将日志、事务等横切逻辑放在 advice 中，通过 pointcut 选择连接点。Spring 常用 JDK 接口代理或基于子类的代理。JDK 代理通过接口委派，子类代理覆盖可拦截方法；final/private 等限制不能随意套用于两种方式，AspectJ weaving 又有不同边界。

本课只模拟普通代理式方法调用。外部持有代理并调用时进入拦截链；直接 new 目标，或非事务外层执行 this.transfer，调用没有再次经过代理，因此内部注解不会自动新建事务。

## Mechanism · 业务工作区与完成规则

代理进入后建立事务工作区，debit 和 credit 修改候选余额，方法正常返回后提交。默认 Spring 声明式回滚规则通常对 RuntimeException 和 Error 回滚，对 checked exception 不自动回滚，可用 rollbackFor 等覆盖。实验运行时异常路径只实现 RuntimeException，不模拟 Error。

自调用没有事务时，每个教学数据库写入独立自动提交。扣 A 后失败就留下 A=80、B=50。通过代理时同样失败可以撤销工作区，保持 100、50。

另一个代理的 REQUIRED 内层参加当前事务，失败可标记 rollback-only；外层 catch 并继续加款，仍在最后回滚并报 UnexpectedRollbackException。REQUIRES_NEW 暂停外层并使用独立事务，本例提交审计；之后外层失败，审计仍保留。实际还需考虑额外连接占用。

## Experiment · 同样转账，边界不同

1. 选择非事务外层 this 自调用，debit 后 RuntimeException，运行结束，余额为 80、50，总和减少。
2. 重开相同余额，切为外部代理调用，保持运行时异常，结束后恢复 100、50。
3. 重开，选择正常完成，结束后为 80、70，总和守恒，达到目标。
4. 对照 checked exception 默认规则和显式 rollbackFor，观察异常相同而提交结果不同。
5. REQUIRED 失败被 catch 后仍回滚；REQUIRES_NEW 审计提交后再让外层失败，观察独立行仍存在。

## Conclusion · 事务承诺必须落到资源上

固定单资源事务不模拟实际隔离级别、数据库连接、完整切面排序、线程上下文传播、AspectJ 或多资源协调。事务通常绑定当前线程与资源，随意异步切线程也不能假定继续共享同一事务。

分析事务问题时，依次核对调用经过哪个代理、参与哪份事务、异常适用什么规则、最终哪些资源提交。只看注解或只看异常文本都不够。
