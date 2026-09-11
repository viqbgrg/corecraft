## Problem · 9、5 和 4 都可以是同一文字的长度

文件内容 A中🙂B 使用 UTF-8，字节数为 1+3+4+1=9。Java String 使用 UTF-16 单元，长度为 1+1+2+1=5。Unicode 标量值则有四个。

InputStream、Reader 和 Channel 面向不同单位，不能把 read 返回值都理解为“读了几个可见字符”。

## Why · 数据、解码和缓冲各有接口

File IO 获得字节。InputStream.read() 的单字节形式用 int 返回 0–255，−1 表示 EOF；批量 read(byte[]) 返回实际字节数，可能少于请求数量。Reader 在指定字符集下解码，批量 read(char[]) 返回 Java char 数。

InputStreamReader 是字节到字符的桥梁；使用显式 UTF-8 可以避免不同运行环境默认字符集造成歧义。BufferedInputStream / BufferedReader 等包装类减少下层调用，不改变逻辑数据内容。短读不等于 EOF，调用次数也不等于真实磁盘访问次数。

## Mechanism · NIO 显式保存位置边界

ByteBuffer 有 capacity、position 与 limit，并维持 `0 <= position <= limit <= capacity`。Channel.read 把字节写入 remaining 范围并推进 position；flip 把 limit 设为旧 position，再令 position=0，使程序读取刚写入的区间。

消费部分字节后，compact 把未读后缀移到开头，position 指向保留数据末尾，limit 恢复 capacity，方便下一次追加。clear 只重置位置边界，不清零底层字节，也不替你保留未读数据。Buffer 没有神奇的“自动读写模式”，在错误边界下 get 可能读到旧槽位。

本课使用 FileChannel 的阻塞文件读取语义。NIO 是接口家族，不等于每种 IO 都非阻塞；FileChannel 不是 SelectableChannel，SocketChannel 才有相应非阻塞注册机制。后续 NIO / Reactor 课继续跟踪网络就绪与线程调度。

## Experiment · 先观察单位，再切换 Buffer

1. 默认文字 A中🙂B，每次最多 2 单元。读取 InputStream，返回 A 的 41 和“中”的首字节 E4，说明一次 read 可以切开编码。
2. 切换 Reader，读取两个 char，得到 0041、4E2D；之后的代理对也可能在容量 1 时跨两次读取。
3. 切换 FileChannel，read 将两个字节写入 Buffer，position=2。执行 flip，再 get 消费它们。
4. 点击独立运行三个 API 到 EOF，Stream / Channel 输出九字节，Reader 输出五个 UTF-16 单元，完成目标。
5. 重开输入，把批量设为 4。Channel 填满后再 read，返回 0；flip、只消费一个字节、compact，观察三字节前移且被保留。
6. close 后再次 read，看到 IOException 或 ClosedChannelException；已写入 Buffer 的字节仍可 get。空文件第一次有效读取返回 −1。

## Conclusion · 接口返回值必须结合状态解释

本模型用内存文件重现 API 语义，不启动 JVM 或真实文件 IO。Reader 预先得到等价 UTF-16 序列，省略内部解码器的预读、替代错误策略与成本；输入只接受合法 Unicode，严格字节解码边界见编码课。

现实 Java 可用 try-with-resources 管理关闭；它不替代正确的短读循环、解码与 Buffer 边界。把每次 read 的单位、剩余范围与 EOF 条件写清楚，再讨论吞吐和线程模型。
