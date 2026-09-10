## Problem · 对话结束，需要双方分别说完

TCP 是全双工连接。一方发完请求，另一方可能还在准备响应。如果把“我发完了”解释为“我们都发完了”，剩余数据就无法可靠送达。

## Why · 确认与关闭是两件事

收到 FIN 后，协议栈可以立即 ACK，表示已经知道对方发送结束；但本端何时发 FIN，要等应用决定不再发送。于是确认对方和关闭自己通常发生在两个时间点。

## Mechanism · 两个 FIN，各自需要 ACK

Client 发 FIN 后进入 FIN_WAIT_1；收到 ACK 后进入 FIN_WAIT_2。Server 收到 FIN 后进入 CLOSE_WAIT，仍然能发送数据。它发出自己的 FIN 后进入 LAST_ACK；Client 收到 FIN 进入 TIME_WAIT 并发 ACK；Server 收到最后 ACK 后 CLOSED。

TIME_WAIT 通常等待 2 MSL。若收到重传 FIN，会重新发送 ACK 并重新计时。MSL 是最大报文生存时间，不是由本实验规定的固定秒数。

## Experiment · 留一点数据到最后

1. 发 Client FIN，再发 Server ACK。
2. 在 CLOSE_WAIT 发送剩余数据，观察 Seq 随字节数增长。
3. 发送 Server FIN，模拟最后 ACK 丢失，重传 FIN 并再次确认。
4. 在确认送达后推进两个 MSL 单位，观察 TIME_WAIT 结束。

## Conclusion · 四段是典型过程，而不是固定定律

如果 Server 已准备好关闭，它可以把 ACK 与 FIN 合并。实验拆成四段强调两个方向的独立性，未模拟同时关闭、真实超时及全部复位分支。教学计时按钮只在最后 ACK 已送达后推进 TIME_WAIT，现实两端的计时器独立运行。

协议参考：[RFC 9293 · TCP](https://www.rfc-editor.org/rfc/rfc9293.html)。
