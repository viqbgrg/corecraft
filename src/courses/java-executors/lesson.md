## Problem · 提交快于服务，工作放在哪里

默认两个核心线程、最多三个线程、队列容量二，每任务需要三个教学服务时隙。六个任务瞬间到达，既不可能无限排队，也不会全部立即运行。

## Why · 线程池是资源和接纳协议

ThreadPoolExecutor 管理 worker、BlockingQueue、拒绝策略和生命周期。队列的 put 可以阻塞，但 execute 的接纳路径通常尝试 offer，并不会自动替提交者等待空间。无界队列常使 maximumPoolSize 难以发挥预想效果，还可能积累内存与延迟。

## Mechanism · 顺序、背压与关闭

worker 数少于 corePoolSize 时先创建核心 worker。否则尝试排队；队列拒绝后才尝试创建非核心 worker，达到 maximumPoolSize 后触发拒绝策略。真实实现还有关闭状态并发重检，本模型将每次提交作为一个确定步骤。

AbortPolicy 抛出 RejectedExecutionException。CallerRunsPolicy 在仍运行的池达到边界时让提交线程执行，降低其继续提交速度；调用尚未返回时，不能把该 caller 画成又提交另一个任务。池已关闭时 CallerRunsPolicy 不再执行这些任务，需要调用者设计关闭期处理。

shutdown 停止接纳并排空任务；shutdownNow 返回排队但未开始的任务，向 pool worker 请求 interrupt。忽略中断的任务可能继续。CallerRuns 中的工作在外部提交线程上，不属于 worker，shutdownNow 不会因此中断它；pool 终止也不证明外部 caller 工作结束。

## Experiment · 从突发到正常关闭

1. 默认突发六任务。1、2 创建核心 worker，3、4 排队，5 创建第三个 worker，6 被拒绝。
2. 改为 CallerRunsPolicy，再提交一个任务。任务 7 在 caller 运行，提交按钮暂不可用。
3. 逐时隙观察任务完成与 FIFO 队列出队；运行至所有已接纳任务结束，再 shutdown，达到目标。也可先 shutdown 再排空。
4. 重开场景，把队列容量改为 0。空闲 worker 可直接接收任务，没有存储空间；无可用接收者时扩展或拒绝。
5. 对照协作和忽略中断的任务，执行 shutdownNow，检查 returned、interrupted、completed 的差别。

## Conclusion · 参数不替代容量分析

本课最多四个 worker、三十二条任务，服务时隙是确定工作量，不等于真实 CPU 时间或吞吐基准。省略 keepAlive、动态扩缩、任务运行异常与操作系统竞争。

线程池大小应结合 CPU、阻塞比例、下游容量、队列等待预算与拒绝反馈。保留任务去向和排队时长，才能判断“提交成功”是否真的等于业务成功。
