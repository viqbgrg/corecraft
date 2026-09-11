## Problem · Broker 接收，消息究竟去了哪里

生产者向 exchange 发布 orders.created。orders.* 队列和 orders.# 审计队列都匹配，因而各接收一份副本。生产者确认、队列投递与应用业务效果仍然分别推进。

## Why · Exchange 负责路由，Queue 负责等待

Direct exchange 按 routing key 与 binding 完全相等匹配。Topic exchange 按点分词段匹配，* 表示一段，# 表示零或多段，并非任意字符串子串匹配。没有匹配队列且 mandatory=true 时，发布者可收到 basic.return。

Publisher confirm 说明 Broker 对该发布的处理结果。可靠存储条件取决于队列类型、持久性与消息配置，它不证明消费者已经执行。不可路由发布也可先 return 再得到 confirm。

## Mechanism · 未确认投递和应用事务

消息从 ready 进入 unacked，delivery tag 属于当前 channel。prefetch 限制尚未确认数量，帮助消费者控制在途工作。basic.ack 后 Broker 可移除投递，即使应用实际上还没完成；过早 ack 留下至多一次的丢失窗口。

处理后 ack 前断连，未确认消息重新入队，业务效果却不会回滚。应用可以用稳定 message id，在同一个本地事务中写唯一 inbox 与业务效果，再 ack。重投时查到 inbox 后跳过效果。只先写去重标记再单独写业务也有故障间隙，本模型把两者作为原子本地事务。

basic.nack(requeue=true) 可重投；不设限制会造成失败循环。本课配置了 DLX，requeue=false 将消息送 dead 队列，供后续检查，不自动修复原错误。

## Experiment · 在处理与 ack 之间断线

1. 发布默认消息并接收 confirm，检查两个队列各一份，业务效果仍为零。
2. 向 orders 消费者投递，处理业务但暂不 ack。prefetch=1 时不能继续投递。
3. 断开并重连，重新投递，redelivered=true。再次处理由 inbox 跳过，之后 ack，业务效果仍只一次。
4. routing key 改为 unmatched.created，再发布，观察 mandatory return，随后 confirm 仍可成立，达到目标。
5. 独立场景关闭 inbox，重做断连，观察业务重复；用 nack 把失败投递移至配置的死信队列。

## Conclusion · 确认方向决定能证明什么

模型只有一个消费 channel、两个业务队列和一个 DLX 目标，假设确认发布已可靠存储。省略真实 quorum queue、磁盘故障、TTL、优先级、消费者竞争与精确重投位置。

Queue 之间的副本可被不同应用独立消费，因此 inbox 以应用队列加业务 message id 为键。系统内的每个确认都应指向明确阶段，不能用一个 confirm 代替整个业务闭环。
