## Problem · 快请求排在慢业务后面

C1 发送需要四个服务时隙的长请求，C2 发送只需一个时隙的 ok。两者共用一个 EventLoop。如果业务直接在循环内执行，C2 即使已到达也要等待。

## Why · Reactor 集中等待，工作仍需合理分配

Reactor 等待事件并分派处理。Netty 用 EventLoop 管理注册的 Channel，一个 Channel 的 IO 事件通常固定由关联循环处理，多个 Channel 可共享循环。ChannelPipeline 组织入站和出站 handler，避免把协议解析、业务与编码混在一个循环里。

## Mechanism · 执行上下文、引用交接和写压力

本管线为入站 Channel → 长度 Decoder → Business，返回沿出站 Encoder → Channel。真实 pipeline 的入站与出站传播方向相反，ctx.write 与 channel.write 的起点也不同；本课只保留这一固定链。

业务卸载到独立执行器后，EventLoop 可处理其他连接；业务完成后将响应提交回 EventLoop。两个业务任务可并行获得教学服务，因此 C2 短任务可先返回。

ByteBuf 使用引用计数。本课入站 handler 自动释放自己的引用；异步任务交接前 retain，任务结束再 release。遗漏 retain 时，异步执行可能看到 refCnt=0，触发无效访问；未配对 release 则可能泄漏。普通 Java 对象可达性不能替代这份所有权协议。

输出超过高水位八字节后 Channel 变为不可写。本应用随之暂停 autoRead；低于低水位三字节后恢复。Netty 的可写性变化不会自动替所有应用完成读背压，这里明确是 handler 的策略。

## Experiment · 观察另外一个连接的响应

1. 默认向 C1 提交十字节请求，耗时四。选择 C2，文本改为 ok、耗时一，再提交。
2. 运行当前事件与业务，响应顺序为 C2、C1，EventLoop 被业务占用时隙为零。两个 ByteBuf 最终引用均归零。
3. C1 响应含长度头共十一字节，超过高水位，autoRead 暂停。下游接纳全部输出，低于低水位后恢复，达到目标。
4. 重置并关闭 offload，重做两请求，观察 EventLoop 被占用与响应顺序改变。
5. 独立重置后遗漏 retain，执行一次异步任务，检查无效引用访问不会产生响应；再检查暂停期间新请求如何等待恢复。

## Conclusion · 框架没有消除容量与所有权

模型是固定管线、双连接和双任务业务执行器，不启动真实 Netty，不模拟池化分配、TLS、TCP ACK 或线程竞争。单次入站为完整帧，半包处理在 NIO 课程独立验证。

事件驱动系统仍需要限制队列、隔离耗时工作、维护对象所有权并传递背压。否则连接数量增加时，延迟和内存压力仍会集中到少数共享资源。
