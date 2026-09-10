## Problem · 发出消息，不等于对方收到

网络中的报文可能丢失或重复。Server 收到 SYN，已经知道 Client 的这条消息能到达，但还不知道 Client 是否收到自己的 SYN+ACK。最后的 ACK 确认的是 **Server 的初始序号**，不能把三次握手简化成一句“证明能互相收发”。

## Why · 连接需要同步两个方向的初始序号

每个方向都有独立的序号空间。握手让双方分别发送 SYN，并确认对方的 SYN；结合状态、序号和超时规则，也能处理延迟到达的旧连接尝试。

## Mechanism · SYN → SYN+ACK → ACK

Client 发出 Seq = x 的 SYN，进入 SYN_SENT。Server 收到后进入 SYN_RCVD，发送 Seq = y、Ack = x + 1。Client 验证后进入 ESTABLISHED，回复 Seq = x + 1、Ack = y + 1。Server 收到有效确认后才进入 ESTABLISHED。

SYN 占一个序列号，纯 ACK 不占；32 位序列号会回绕。真实协议栈自动发送报文，实验故意拆成手动操作，以暴露中间状态。

## Experiment · 把“不可靠”放进模型

1. 正常发送 SYN 与 SYN+ACK，观察两端状态为什么暂时不同。
2. 丢失最后 ACK，再手动重传 SYN+ACK 和 ACK。
3. 重置后把最终 Ack 改成错误值，观察拒绝；再改回期望值。
4. 在半连接阶段注入重复 SYN，观察为何不重复建立连接。

## Conclusion · 必须是有效确认，而不只是第三条消息

本模型展示常规主动 / 被动打开，不覆盖同时打开、SYN cookies、窗口、RTO 与所有 TCP 边界状态。错误 ACK 展示 Server 的 RST 响应，但省略接收方对 RST 的验序与复位处理，以便继续调整实验。

协议参考：[RFC 9293 · TCP](https://www.rfc-editor.org/rfc/rfc9293.html)。
