## Problem · 发出消息，不等于对方收到

网络中的报文可能丢失或重复。Server 收到 SYN，已经知道 Client 的这条消息能到达，但还不知道 Client 是否收到自己的 SYN+ACK。最后的 ACK 确认的是 **Server 的初始序号**，不能把三次握手简化成一句“证明能互相收发”。

## Why · 连接需要同步两个方向的初始序号

每个方向都有独立的序号空间。握手让双方分别发送 SYN，并确认对方的 SYN；结合状态、序号和超时规则，也能处理延迟到达的旧连接尝试。

TCP 提供有序的可靠字节流，序号用来标识字节流中的位置，确认号表示“下一项期望收到的位置”。双方都需要给自己的发送方向选一个起点，称为初始序号 ISN。Client 不能替 Server 决定它的发送起点。

**ACK 标志**表示确认号字段有效，**Ack 数值**表示确认到哪里。仅仅看到一个标有 ACK 的报文，还要检查它确认的序号是否处于期望范围。

## Mechanism · SYN → SYN+ACK → ACK

Client 发出 Seq = x 的 SYN，进入 SYN_SENT。Server 收到后进入 SYN_RCVD，发送 Seq = y、Ack = x + 1。Client 验证后进入 ESTABLISHED，回复 Seq = x + 1、Ack = y + 1。Server 收到有效确认后才进入 ESTABLISHED。

SYN 占一个序列号，纯 ACK 不占；32 位序列号会回绕。真实协议栈自动发送报文，实验故意拆成手动操作，以暴露中间状态。

### 用默认数值推一遍

Client 的 ISN 为 1000，Server 的 ISN 为 8000。下表是报文正常送达后的状态：

| 报文                     | Seq / Ack          | Client / Server           |
| ------------------------ | ------------------ | ------------------------- |
| Client → Server：SYN     | Seq 1000           | SYN_SENT / SYN_RCVD       |
| Server → Client：SYN+ACK | Seq 8000，Ack 1001 | ESTABLISHED / SYN_RCVD    |
| Client → Server：ACK     | Seq 1001，Ack 8001 | ESTABLISHED / ESTABLISHED |

第二个报文一边用 Ack 1001 确认 Client 的 SYN，一边用 Seq 8000 提出 Server 的起点；第三个报文再确认 Server 的 SYN。两个方向的确认可以合在同一个报文里，因而通常是三次交换。

SYN 虽然没有应用数据，也占一个序列号，以便被确认和重传。纯 ACK 不占序列号，所以最终 ACK 不会再要求“第四次 ACK 来确认 ACK”。如果最后一次确认丢失，Server 可以重传尚未得到确认的 SYN+ACK，Client 再回复 ACK。

### 一条连接，两份本地认识

发出报文时，发送端可以改变自己的状态；只有报文送达，接收端才获得新证据。因此最后 ACK 丢失时，Client 已经 ESTABLISHED，而 Server 仍是 SYN_RCVD。这种暂时不一致来自消息丢失，并不意味着某一端能够直接读取另一端的状态。

重传使用原 SYN 的序号，重复报文不代表一条新连接。本模型在半连接阶段识别相同初始序号的重复 SYN，保留原半连接；现实协议还需要结合连接标识、序号窗口和状态处理更多情况。

## Experiment · 把“不可靠”放进模型

1. 重置，保留初始 Seq 1000 / 8000，依次点击“发送 SYN”“发送 SYN+ACK”。对照上表，此时 Client 已建立，Server 仍为 SYN_RCVD。
2. 把“下一次发送”设为“模拟丢包（仅一次）”，再点击“发送 ACK”。观察丢失标记，确认两端状态没有同时变成 ESTABLISHED；丢包选项随后会恢复正常。
3. 点击“重传 SYN+ACK”，检查它仍使用 Seq 8000、Ack 1001；再“发送 ACK”，确认 Server 收到 Ack 8001 后才建立连接。一次故障与恢复都完成，本课实验目标达成。
4. 选做：重置并发送前两段，将“最后 ACK 的确认号”改成 8000，发送后观察拒绝记录。改回 8001 再发送，比较“第三条消息到了”和“有效确认到了”的区别。
5. 另一次重置后发送 SYN，再“注入重复 SYN”。观察 Server 仍保留同一个半连接；继续 SYN+ACK、ACK 完成握手。
6. 选做边界：重置，把 Server 初始 Seq 设为 4294967295。预期确认号回绕为 0，而不是变成 4294967296；按正常过程验证。

记录每条报文的 **方向、Seq、Ack、是否送达、两端状态**。单看箭头数量不能判断连接是否成功，单看 Client 的状态也不能替 Server 作结论。

## Conclusion · 必须是有效确认，而不只是第三条消息

本模型展示常规主动 / 被动打开，不覆盖同时打开、SYN cookies、窗口、RTO 与所有 TCP 边界状态。错误 ACK 展示 Server 的 RST 响应，但省略接收方对 RST 的验序与复位处理，以便继续调整实验。

自检：收到 SYN+ACK 后，Client 为什么还要发 ACK？因为 Server 的初始序号尚未得到对端确认。真实协议栈也可能用携带数据的 ACK 完成这一步，本实验用纯 ACK 单独显示确认责任。

后续可靠传输课程会把序号从 SYN 扩展到数据字节，进一步解释累计确认、乱序、重传和接收窗口。

协议参考：[RFC 9293 · TCP](https://www.rfc-editor.org/rfc/rfc9293.html)。
