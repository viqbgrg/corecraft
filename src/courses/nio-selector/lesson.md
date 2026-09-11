## Problem · 收到字节不等于收到消息

应用帧格式为一个长度字节加对应数量载荷。AB 的帧是 [2,65,66]，网络先送来 [2,65]。Channel 可读，但此时没有完整应用消息。

## Why · NIO 把等待与搬运分开

非阻塞 SocketChannel 注册到 Selector，interestOps 表示关心的事件，readyOps 表示本次观察到的就绪。Selector 帮一个线程等待多个连接，实际读写仍由应用调用。FileChannel 不是 SelectableChannel，不能套用同一注册流程。

## Mechanism · 保存进度，反复推进

ByteBuffer 满足 0 ≤ position ≤ limit ≤ capacity。接收时 Channel 向 position 之后写入；flip 令 limit 变为原 position、position 归零。解析完整帧才消费头与载荷；不足时保持起点。compact 搬移未消费字节至开头，将 position 设为保留长度，limit 恢复 capacity。

非阻塞 read 返回 0 可能因为暂时无字节，也可能 Buffer 没有剩余空间；对端关闭后，已到达数据读完才返回 -1。write 也可能短写或返回 0，剩余输出必须保留。

selected-key 集合不会因下一次 select 自动清空。应用处理完要移除 key；这不同于 cancel 注册或 close Channel。通常只在有待写数据时关注 OP_WRITE，写完撤销，避免一个一直可写的 socket 使选择循环空转。

## Experiment · 半帧与半次发送

1. 注册 C1，注入默认 [2,65]，执行两次 select，集合仍只有一个 key。移除 key，注册仍有效。
2. read 两字节，flip 后解析，暂时没有帧。compact 保存 [2,65]。
3. 输入 66 并注入，再 read、flip、解析，得到 AB；compact 恢复接收状态。
4. 开启 OP_WRITE，select 后 write，只写出 [2,65]。再 write 无进展；对端释放发送空间后写出 66。
5. 清空输出后撤销 OP_WRITE，达到目标。切换 C2 对比独立缓冲；试验 peer close 与空 read 的差别。

## Conclusion · 事件循环仍是有状态程序

实验仅用两个连接、十六字节 Buffer、最多十二字节载荷，不模拟网络建立、真实 Selector Provider 或增量字符解码。完整帧后才用 UTF-8 解码，省略生产协议的非法字符处理。

Selector 解决等待多个连接的问题，Buffer 和应用协议解决保留与解释字节的问题。正确循环必须同时管理就绪集合、帧进度、输出进度和连接生命周期。
