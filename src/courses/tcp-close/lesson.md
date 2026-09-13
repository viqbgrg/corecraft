## Problem · 对话结束，需要双方分别说完

TCP 是全双工连接。一方发完请求，另一方可能还在准备响应。如果把“我发完了”解释为“我们都发完了”，剩余数据就无法可靠送达。

## Why · 确认与关闭是两件事

收到 FIN 后，协议栈可以立即 ACK，表示已经知道对方发送结束；但本端何时发 FIN，要等应用决定不再发送。于是确认对方和关闭自己通常发生在两个时间点。

例如 Client 已发送完整请求并结束发送，Server 仍要返回处理结果。Client 关闭的是自己的**发送方向**，接收方向还需要工作。这叫半关闭；收到对方 FIN 的一端，在读完此前数据后可以读到流结束，并不因此失去自己的发送能力。

## Mechanism · 两个 FIN，各自需要 ACK

Client 发 FIN 后进入 FIN_WAIT_1；收到 ACK 后进入 FIN_WAIT_2。Server 收到 FIN 后进入 CLOSE_WAIT，仍然能发送数据。它发出自己的 FIN 后进入 LAST_ACK；Client 收到 FIN 进入 TIME_WAIT 并发 ACK；Server 收到最后 ACK 后 CLOSED。

TIME_WAIT 通常等待 2 MSL。若收到重传 FIN，会重新发送 ACK 并重新计时。MSL 是最大报文生存时间，不是由本实验规定的固定秒数。

### 两个方向分别走到结束

| 正常送达的报文            | Client 状态 | Server 状态 |
| ------------------------- | ----------- | ----------- |
| Client FIN                | FIN_WAIT_1  | CLOSE_WAIT  |
| Server ACK                | FIN_WAIT_2  | CLOSE_WAIT  |
| Server 剩余数据及数据 ACK | FIN_WAIT_2  | CLOSE_WAIT  |
| Server FIN                | TIME_WAIT   | LAST_ACK    |
| Client 最后 ACK           | TIME_WAIT   | CLOSED      |
| 等待完成                  | CLOSED      | CLOSED      |

FIN_WAIT_1 等自己的 FIN 被确认；FIN_WAIT_2 等对方也结束发送。CLOSE_WAIT 表示对方已经结束，本端还在等待应用关闭；LAST_ACK 表示本端 FIN 已发出，正在等它的确认。名字都包含“等待”，等待的事件却不同。

### FIN 也占一个序列号

本课从已建立连接开始，Client 下一个序号为 1001，Server 为 8001。Client 发 FIN 后，下一个序号变为 1002。若 Server 再发送默认 12 B 数据，这些字节使用序号 8001–8012，Client 用 Ack 8013 确认；Server 随后的 FIN 使用 Seq 8013，最后 ACK 应确认 8014。

纯 ACK 不消耗序列号，重传 FIN 也不再消耗一个新序列号。重复的是**同一个结束标记**，不是又结束了一段新数据。

### TIME_WAIT 保留什么机会

最后 ACK 丢失后，Server 仍为 LAST_ACK，会重传 FIN。Client 留在 TIME_WAIT，仍能识别这个旧 FIN 并再次确认。等待也为旧连接的报文在网络中消失留出时间，降低它们干扰后续连接的可能。

Client 不能观察到“最后 ACK 确实送到了”，否则又需要更多确认。因此现实计时由端点自己推进，并非等 Server 告知已关闭后才开始。本实验为便于完整走完流程，把计时按钮限制在最后 ACK 已送达以后。

## Experiment · 留一点数据到最后

1. 重置，保留“Server 剩余数据 / B”为 12，依次点击① Client 发送 FIN、② Server 发送 ACK。预期 Client 为 FIN_WAIT_2，Server 为 CLOSE_WAIT。
2. 点击“Server 发送剩余数据”。观察数据 Seq 8001 和自动数据 ACK 8013，“半关闭接收数据”累计为 12 B。解释为什么收到 Client FIN 后仍能完成这次发送。
3. 点击③ Server 发送 FIN，预期 Seq 8013、Client 为 TIME_WAIT、Server 为 LAST_ACK。把“最后 ACK 的传输”改为“丢失一次”，点击④ Client 发送 ACK，Server 不会变为 CLOSED。
4. 点击“Server 重传 FIN”，确认 Seq 仍为 8013；再次点击④，最后 Ack 8014 正常送达，Server 变为 CLOSED，Client 仍需等待。
5. 点击两次“推进 1 MSL”，两端最终都为 CLOSED。半关闭期间传过数据、关闭且等待完成后，本课实验目标达成。

选做：重置，把数据量改为 5，预测 Server FIN 的 Seq 为 8006，最后 ACK 为 8007，再验证。记录时把数据字节数与 FIN 占用的一位分开计算。

## Conclusion · 四段是典型过程，而不是固定定律

如果 Server 已准备好关闭，它可以把 ACK 与 FIN 合并。实验拆成四段强调两个方向的独立性，未模拟同时关闭、真实超时及全部复位分支。教学计时按钮只在最后 ACK 已送达后推进 TIME_WAIT，现实两端的计时器独立运行。

自检：CLOSE_WAIT 长时间不结束，与 TIME_WAIT 正常等待有什么不同？前者还需要本端应用结束发送并关闭，后者已经交换完结束标记，保留状态以处理最后确认和旧报文。排查时应先看端点状态及其等待事件，不能把所有“连接没有立刻消失”都归为同一个原因。

协议参考：[RFC 9293 · TCP](https://www.rfc-editor.org/rfc/rfc9293.html)。
