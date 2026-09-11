# 完整课程交付清单

[Level 0–17 完整路线](../ROADMAP.md) 的课程范围已经交付。这里记录课程开发状态，与浏览器中学习者自己的完成记录分开。

## 已交付

目前 81 节课程均有独立实验会话、Markdown 原理、可编辑输入或状态操作、实验目标、挑战解释及知识跳转，覆盖 Level 0–17 的全部路线主题。

- [x] 第一阶段十课：Binary、CPU、Cache、Process / Thread、Virtual Memory、TCP Handshake、TCP Close、DNS、HTTP、B+Tree。
- [x] 流水线与分支预测：周期 / 状态轨迹、相同输入对照。
- [x] CPU 调度：FCFS、SJF、SRTF、RR，任务到达、抢占、响应与等待。
- [x] 页面置换：FIFO、LRU、Clock、OPT，Belady 异常与独立对照。
- [x] TCP 可靠传输：累计确认、乱序缓冲、重传去重、接收窗口更新。
- [x] TCP 拥塞控制：Reno、慢启动、拥塞避免、快速恢复、超时。
- [x] 线性结构：Array / Linked List、Stack / Queue / Deque、环形缓冲。
- [x] Hash Table：碰撞、线性探测、墓碑、重新散列。
- [x] Binary Search：有序前提、lower_bound、区间不变量。
- [x] Sorting：插入、选择、归并、稳定性与真实操作计数。
- [x] Tree / Binary Tree / BST / Heap；B Tree 与 B+Tree 的记录布局区别。
- [x] Graph：BFS、DFS、Dijkstra、方向、零权边、不可达与路径回溯。
- [x] Dynamic Programming / Greedy：无限硬币找零、反例、不可达、解的回溯。

- [x] Level 0 学习方法：数据、状态、指令、程序、抽象、预测与模型边界。
- [x] 数据表示：补码与有符号溢出；binary32 浮点舍入；ASCII / Unicode / UTF-8；布尔代数与逻辑门。
- [x] 设备协作：Bus、Interrupt、PIO 与 DMA，同输入的 CPU / 总线成本对比。
- [x] 文件系统：目录、inode、硬链接、FD、偏移、unlink 生命周期与块分配。
- [x] 文件页：Page Cache、惰性 mmap、MAP_SHARED、MAP_PRIVATE / COW、脏页写回。
- [x] IO：阻塞、非阻塞、select / poll / epoll、LT / ET 与读至 EAGAIN。
- [x] 网络分层：OSI / TCP-IP、Ethernet / ARP / IP、UDP / Socket，逐跳封装与错误定位。
- [x] TLS：玩具 DH 共享值、证书条件、握手绑定、Finished 与认证失败阻断。

- [x] 数据库存储：Database / Table / Record / Page、主键约束、Buffer Pool、pin 与脏页写回。
- [x] 日志恢复：WAL、LSN、Redo / Undo、steal / no-force、提交与崩溃时点。
- [x] 事务并发：ACID、四种隔离规则、MVCC、当前读、行锁、等待环与回滚。
- [x] 查询优化：真实 B+Tree 复合键与 RID、堆表扫描、成本估计、实际对照与统计更新。

- [x] MySQL：聚簇 / 二级索引与覆盖；Redo / Binlog 内部提交协调与复制；Read View / Undo / Purge；记录 / 间隙 / Next-Key 锁；三种 Join、聚合、排序与成本。

- [x] Java 核心：对象 / 引用 / 栈帧；加载器身份 / 反射 / 异常传播；泛型 / 集合；JMM 发布与 happens-before；Stream / Reader / FileChannel 与 Buffer API。

- [x] JVM：类生命周期、字节码验证 / 执行、运行时区域、对象布局；GC Roots / 可达性 / 分代回收；G1 区域与 ZGC 搬迁屏障侧面；JIT / 逃逸分析 / Safepoint。

- [x] Java 并发：Thread / volatile / CAS 与版本；Monitor / AQS / 可重入锁 / Condition；Latch / Semaphore；线程池接纳、队列与背压；ConcurrentHashMap / Forwarding；ForkJoin 与 Future 依赖、异常和取消。

- [x] Java IO / NIO：真实字节复制与缓冲、flush / force；半包 Buffer、Selector keys / interestOps、部分写；Reactor 业务卸载、Netty 管线、ByteBuf 引用与背压。
- [x] Spring：容器定义、依赖解析、作用域与生命周期；AOP 代理边界、异常回滚、事务传播；MVC 绑定、调用、异常处理与渲染。
- [x] Spring Boot：配置优先级、类型绑定、Starter、条件报告与自动配置退让；Web 校验、Actuator、健康分组、指标暴露与授权。
- [x] Redis：五类值与真实跳表；过期回收与容量淘汰；RDB / AOF 持久化恢复；异步复制、Sentinel 切换与 Cluster 单槽迁移。
- [x] 消息队列：Kafka 分区、消费组、offset 与三种投递语义；RabbitMQ 路由、confirm / return / ack、prefetch、重投、inbox 与死信。
- [x] 分布式系统：分区下的一致性与可用性、仲裁与修复；Raft 选举与日志提交；租约与 fencing；2PC 与 Saga；服务发现、负载均衡、重试、超时、熔断与限流。
- [x] 高级 Java 后端：同负载容量分析、索引与缓存、线程 / 连接 / 堆约束、异步化与 GC；缓存回填、outbox / inbox 与服务边界；指标 / Trace / 线程 / profile / 堆联合诊断与单变量复测。

## 后续产品演进

本次课程范围已无待交付分组。AI Tutor、知识图谱、实验保存分享、国际化和用户系统属于后续产品能力。当前 Tutor 明确为本地适配层，未接真实 AI API。

## 验收依据

课程入口见 [README](../README.md#当前课程)，主题与课程映射见 `src/data/coverage.ts`，模型假设见 [models.md](models.md)。验证必须覆盖实际算法、状态边界和学习闭环，不能只看文件存在或勾选数量。

验收运行 `npm test`、`npm run build`、`npm run test:e2e` 与 `npm run format:check`。模型测试核对算法、不变量、输入约束与故障恢复；桌面和手机浏览器测试实际完成课程实验与挑战，并检查溢出和自动无障碍规则。课程新增或模型改变后更新有针对性的单元与浏览器测试；纯文案和可逆样式调整不需要机械添加测试。
