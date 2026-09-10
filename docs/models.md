# 实验模型与教学边界

这些模型用于建立可操作、可解释的直觉。模拟周期、容量和时延不是现实硬件或网络的测量值。模型状态转移可以独立测试，页面只负责呈现状态与发送 Action。

| 模型             | 实现的机制                                                                   | 明确的边界                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Binary           | 8 位表示、逐位逻辑、加法低位与 Carry、NOT、左移                              | 仅无符号；不是补码或有符号溢出实验。当前工厂仅支持 width = 8。                                                                             |
| CPU              | MOV / ADD / STORE / LOAD / HALT；IR、PC、寄存器、ALU、数据内存；四个执行阶段 | 自定义教学指令集、16 位寄存器、按指令索引的 PC；无流水线、乱序、真实周期建模。                                                             |
| Cache            | 16 B 行，L1 4 行 / L2 8 行，直接映射，包含式 L2 驱逐与 L1 失效               | 只读，无预取、写回、关联度或多核一致性。1 / 8 / 80 模拟周期按串行路径累加。当前仅支持 lineSize = 16。                                      |
| Process / Thread | 单核轮转、时间片、阻塞与条件等待、唤醒、PC / 栈帧保存、同进程共享计数        | Blocked / Waiting 是教学分类，栈简化为一个局部计数器。每一步计数增量是原子的；没有竞态、多核或完整内核上下文。                             |
| Virtual Memory   | VPN / Offset / PFN，8 页、4 帧、256 B 页，2 项 LRU TLB，缺页重试与 FIFO 置换 | 单进程、只读、单级页表。合法页可能不驻留；不模拟非法映射、权限、脏页、真实存储延迟。                                                       |
| TCP Handshake    | 两端状态、独立 ISN、Seq / Ack、丢包、手动重传、重复 SYN、错误 ACK            | 只演示常规主动 / 被动打开；不模拟窗口、超时算法、SYN cookies、同时打开。错误 ACK 的 RST 响应可见，但 Client 对 RST 的验序 / 复位分支省略。 |
| TCP Close        | 两个 FIN、对应 ACK、半关闭数据、LAST_ACK、重传 FIN、TIME_WAIT                | 拆成典型四段；现实 ACK / FIN 可以合并。本模型在最后 ACK 送达后才允许推进教学计时，真实两端计时器独立。                                     |
| DNS              | 解析器逐级迭代、根 / TLD 转介、权威 A / NXDOMAIN、60 s 正缓存、30 s 负缓存   | 隔离 .test 域与 RFC 文档 IP。仅缓存最终记录，省略 NS / glue 缓存、CNAME、DNSSEC 与传输协议。                                               |
| HTTP             | URL、DNS、TCP、抽象 TLS 1.3、HTTP/1.1、服务端响应、同源连接复用、分层故障    | 所有数据均为本地模拟，不执行网络请求；无 HTTP/2 / HTTP/3、代理、TLS 恢复和子资源。DNS 缓存不计 TTL，TTL 见 DNS 课。                        |
| B+Tree           | 4 阶唯一键树、上下级分裂、兄弟借位、合并、根增减、叶子链表和范围扫描         | 每键抽象代表一条记录；节点容量按键数，界面最多 64 条。不等同于完整 InnoDB：无磁盘持久化、并发或事务。                                      |

## 为什么选择这些边界

一个好的实验应让用户建立一个可以解释现象的模型，而不是同时暴露所有实现细节。课程说明哪些结论可以迁移，哪些只属于本模型；新增机制前先给出一个新的、可检验的问题。

特别注意：

- Server 收到 SYN 已经表明这个 SYN 能到达。最后 ACK 确认 Server 的初始序号及前一步消息的接收，不能仅用“证明双向通信”取代具体状态解释。
- SYN / FIN 各消耗一个序列号，纯 ACK 不消耗。所有握手序列号按模 2³² 回绕。
- TLB Miss 不一定缺页；缓存映射失效不等于对应页面不在 RAM。
- HTTP 500 是收到的应用层响应，不能解释成 TCP 建连失败。
- B+Tree 内部的导航键不是额外记录；删除和借位后必须更新分隔键与叶子链表。
- Cache 对照组从冷缓存开始，包含相同地址集合、相同访问次数，使用固定种子的排列。顺序差异不会被偷偷换成数据集差异。

## 验证策略

- 单元测试覆盖边界状态、失效和恢复路径，以及独立 Session 的隔离与重置。
- B+Tree 使用六组固定种子的 64 键插入 / 删除序列，每次操作后检查容量、排序、分隔键、统一叶子深度、记录集合与链表完整性。
- Playwright 在桌面与手机视口实际操作十个实验，并验证挑战、进度持久化、无效输入、模式切换、导航与 Tutor 对话框。
- Axe 自动检查全部课程和路线页的 WCAG A / AA 规则；自动扫描不能替代完整的人工无障碍评估。
- 每次 main push 都先测试与构建，成功后才发布 Pages。

## 协议参考

- [RFC 9293 — Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293.html)
- [RFC 1034 — Domain Names: Concepts and Facilities](https://www.rfc-editor.org/rfc/rfc1034.html)
- [RFC 1035 — Domain Names: Implementation and Specification](https://www.rfc-editor.org/rfc/rfc1035.html)
- [RFC 2308 — Negative Caching of DNS Queries](https://www.rfc-editor.org/rfc/rfc2308.html)
- [RFC 9110 — HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 8446 — TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446.html)
