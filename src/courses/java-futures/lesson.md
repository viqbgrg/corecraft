## Problem · 分开计算，什么时候可以相加

默认数组 [1,2,3,4,5,6,7,8] 需要求和，再乘二，与远端值 10 相加。求和可分治，乘二依赖求和，组合还依赖远端。依赖关系不等于线程创建规则。

## Why · 任务与结果分开表达

ForkJoinPool 适合可分解任务，通过工作窃取让空闲 worker 帮忙执行分支。CompletableFuture 表达尚未完成的值以及完成后的动作，支持 thenApply、thenCombine、异常处理与 Async 变体。Future 本身不是一个线程。

## Mechanism · 队列、归并和回调上下文

本课两个 worker 各有 deque，owner 从队尾取最新任务，thief 从另一队首取最旧任务。区间超过叶阈值就拆分，叶任务真实相加；两个子结果都完成后才归并父结果。父任务等待不表示它一直独占 worker。

sum → double 的依赖计算乘二。remote 独立完成为 10 或 RemoteException。未恢复时正常 combine 回调跳过，join 报 CompletionException 并展示原因；添加 exceptionally 时将远端失败恢复为 0，组合重新成为成功值。

Async 回调入显式教学执行器队列。非 Async 演示由完成线程执行的合法路径；真实实现也可能由其他参与完成的调用者执行，不能承诺某个固定线程。未显式传执行器的 Async 通常使用 commonPool，实验为便于观察共用两个 worker。

cancel(true) 使组合 future 取消，不保证中断底层工作，也不回滚副作用。重建依赖链创建独立的新一轮，复用已经算好的 sum，移除旧链展示中的排队回调，防止旧任务污染新结果。

## Experiment · 同一求和，三种组合结局

1. W1 执行一步分解根任务，切换 W2 执行一步，窃取最旧分支。
2. 运行所有可执行任务，sum=36、double=72。远端未完成，组合仍 pending；此时 join 需要等待。
3. 完成远端 source，运行回调并 join，得到 82。
4. 选择远端失败，重建依赖链，完成远端、运行、join，看到 CompletionException(cause=RemoteException)。
5. 开启异常恢复，并选择非 Async，重建、完成远端、join，得到 72，观察 caller 执行恢复与组合，达到目标。
6. 重开实验后取消组合结果，继续运行求和；再改整数序列和叶阈值，检查拆分形状与实际结果变化。

## Conclusion · 异步化仍需要执行容量和错误协议

本模型不启动真实线程，不模拟 ForkJoin 线程补偿、阻塞管理或全部 ForkJoinTask 异常规则。run 只运行当前可执行工作，远端 pending 时会停下，不虚构外部完成。

合理的异步设计需要执行器容量、结果依赖、超时、异常恢复和资源取消配合；只给调用链加 Async 不会自动获得更高吞吐。
