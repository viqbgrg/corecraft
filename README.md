# CoreCraft

**Learn Computer Science by Building & Experimenting.**

**通过互动实验理解计算机原理，从计算机基础一路学习到高级 Java 开发。**

[在线实验室](https://viqbgrg.github.io/corecraft/) · [完整学习路线](ROADMAP.md) · [项目文档](docs/README.md) · [参与贡献](docs/contributing.md)

[![Deploy GitHub Pages](https://github.com/viqbgrg/corecraft/actions/workflows/deploy.yml/badge.svg)](https://github.com/viqbgrg/corecraft/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

CoreCraft is an interactive computer science learning platform.

CoreCraft 让你通过改变一个可视化模型的输入与步骤，观察计算机内部发生的状态变化。这里的课程从一个问题开始，通过原理解释、可操作实验和挑战，帮助你建立自己的计算机模型。

> Don't just learn what.
> Understand why.
> Don't just read.
> Experiment.
> Don't just memorize.
> Build a mental model.

> 不只是知道是什么。更重要的是理解为什么。
> 不只是阅读。而是亲手实验。
> 不只是记忆。而是建立自己的计算机模型。

## 核心理念

**Problem → Why → Mechanism → Experiment → Conclusion**

每个实验必须回答一个问题：机制要解决什么、没有它会怎样、用户怎样验证自己的猜想。点击产生可解释的状态转换，结论有可观察的证据。

比如，让最后一个 ACK 丢失，观察为什么 Client 是 ESTABLISHED，而 Server 仍是 SYN_RCVD；再重传，直到双方的状态一致。

## 当前课程

81 节可操作课程已覆盖 Level 0–17 的全部路线主题，从学习方法、计算机基础、操作系统、网络与算法，延伸到数据库、MySQL、Java / JVM / 并发 / NIO、Spring / Boot、Redis、消息队列、分布式系统及后端性能与故障诊断。每课包含 Markdown 原理解释、实验目标、观察记录、挑战题和知识关联。

| 课程                                                                                                              | 可以亲手操作什么                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [01 Computation and Mental Models](https://viqbgrg.github.io/corecraft/#/learn/modeling)                          | 可编辑程序、状态预测、跳转循环、输出与停机                                             |
| [02 Binary & Bits](https://viqbgrg.github.io/corecraft/#/learn/binary)                                            | 二进制、位操作、加法进位与十六进制表示                                                 |
| [03 Two’s Complement and Overflow](https://viqbgrg.github.io/corecraft/#/learn/signed-number)                     | 补码逐位加减、Carry 与 Overflow 的边界反例                                             |
| [04 Floating Point and Rounding](https://viqbgrg.github.io/corecraft/#/learn/floating-point)                      | 精确有理数舍入、binary32 编码、次正规数与误差                                          |
| [05 Unicode and UTF-8](https://viqbgrg.github.io/corecraft/#/learn/encoding)                                      | Unicode 标量值、UTF-8 编解码、非法序列与往返                                           |
| [06 Boolean Algebra and Logic Gates](https://viqbgrg.github.io/corecraft/#/learn/logic)                           | 布尔表达式、逻辑门、真值表与自动反例                                                   |
| [07 Inside the CPU](https://viqbgrg.github.io/corecraft/#/learn/cpu)                                              | 取指、译码、执行、写回、寄存器与内存                                                   |
| [08 Instruction Pipeline](https://viqbgrg.github.io/corecraft/#/learn/pipeline)                                   | 五级流水线、RAW 停顿、转发与 load-use 气泡                                             |
| [09 Branch Prediction](https://viqbgrg.github.io/corecraft/#/learn/branch-prediction)                             | 静态、1 位与 2 位预测器，先预测后训练                                                  |
| [10 Closer is Faster](https://viqbgrg.github.io/corecraft/#/learn/cache)                                          | 缓存行填充、包含式失效、相同地址集合对照                                               |
| [11 Bus, Interrupts and DMA](https://viqbgrg.github.io/corecraft/#/learn/interrupt-dma)                           | 设备到达、PIO / DMA、保存恢复与同工作量对照                                            |
| [12 Sharing the CPU](https://viqbgrg.github.io/corecraft/#/learn/process)                                         | 运行状态、私有栈、共享内存、阻塞与唤醒                                                 |
| [13 CPU Scheduling](https://viqbgrg.github.io/corecraft/#/learn/scheduling)                                       | 自定义任务，FCFS / SJF / SRTF / RR 与等待、响应、周转                                  |
| [14 An Address, Translated](https://viqbgrg.github.io/corecraft/#/learn/virtual-memory)                           | VPN / Offset / PFN、TLB、页表与缺页重试                                                |
| [15 Page Replacement](https://viqbgrg.github.io/corecraft/#/learn/page-replacement)                               | FIFO / LRU / Clock / OPT、引用位与 Belady 异常                                         |
| [16 Files, Inodes and Directories](https://viqbgrg.github.io/corecraft/#/learn/filesystem)                        | 目录、inode、硬链接、打开 FD、偏移与块回收                                             |
| [17 Page Cache and mmap](https://viqbgrg.github.io/corecraft/#/learn/page-cache)                                  | 共享文件页、惰性 mmap、COW、脏页写回与重启                                             |
| [18 IO Multiplexing and epoll](https://viqbgrg.github.io/corecraft/#/learn/io-multiplexing)                       | 阻塞 / 非阻塞、select / poll / epoll、LT / ET 与 EAGAIN                                |
| [19 Network Layers, ARP and Sockets](https://viqbgrg.github.io/corecraft/#/learn/network-layers)                  | 子网与下一跳、ARP、逐跳 MAC / TTL、UDP 与 Socket                                       |
| [20 A Reliable Beginning](https://viqbgrg.github.io/corecraft/#/learn/tcp-handshake)                              | 32 位 Seq / Ack、丢包、错误 ACK、重复 SYN                                              |
| [21 Closing Both Directions](https://viqbgrg.github.io/corecraft/#/learn/tcp-close)                               | 半关闭、FIN 重传、最后 ACK 丢失与 TIME_WAIT                                            |
| [22 Reliable TCP Transfer](https://viqbgrg.github.io/corecraft/#/learn/tcp-reliability)                           | 累计 ACK、乱序缓冲、RTO、去重与接收窗口更新                                            |
| [23 TCP Congestion Control](https://viqbgrg.github.io/corecraft/#/learn/tcp-congestion)                           | Reno 慢启动、拥塞避免、快速恢复与超时退让                                              |
| [24 Finding the Right Address](https://viqbgrg.github.io/corecraft/#/learn/dns)                                   | 递归与迭代、转介、正负缓存、TTL 与 NXDOMAIN                                            |
| [25 From URL to Response](https://viqbgrg.github.io/corecraft/#/learn/http)                                       | 分层故障、连接复用与 HTTP 500                                                          |
| [26 TLS Identity and Key Establishment](https://viqbgrg.github.io/corecraft/#/learn/tls)                          | 玩具 DH 计算、证书条件、握手绑定与失败阻断                                             |
| [27 Arrays and Linked Lists](https://viqbgrg.github.io/corecraft/#/learn/linear-storage)                          | 真实增删、head / next、定位与修改成本对照                                              |
| [28 Stacks, Queues and Deques](https://viqbgrg.github.io/corecraft/#/learn/stack-queue)                           | LIFO / FIFO、双端操作、环形缓冲的满空与复用                                            |
| [29 Hash Tables and Tombstones](https://viqbgrg.github.io/corecraft/#/learn/hash-table)                           | 线性探测、墓碑、更新、扩容与重新散列                                                   |
| [30 Binary Search Invariants](https://viqbgrg.github.io/corecraft/#/learn/binary-search)                          | lower_bound、重复键、半开区间和插入位置                                                |
| [31 Sorting and Stability](https://viqbgrg.github.io/corecraft/#/learn/sorting)                                   | 插入 / 选择 / 归并排序、稳定性与操作计数                                               |
| [32 Search Trees and Heaps](https://viqbgrg.github.io/corecraft/#/learn/trees-heaps)                              | 双子节点删除、堆上浮 / 下沉与不同顺序约束                                              |
| [33 Built for Fewer Reads](https://viqbgrg.github.io/corecraft/#/learn/btree)                                     | 插入、查找、删除、分裂、借位、合并与范围扫描                                           |
| [34 BFS, DFS and Dijkstra](https://viqbgrg.github.io/corecraft/#/learn/graph)                                     | 可编辑加权图、BFS / DFS / Dijkstra、不可达与路径回溯                                   |
| [35 Greedy and Dynamic Programming](https://viqbgrg.github.io/corecraft/#/learn/dynamic-programming)              | 找零反例、最优子问题、不可达状态与方案回溯                                             |
| [36 Database Pages and Buffer Pool](https://viqbgrg.github.io/corecraft/#/learn/database-pages)                   | 记录与页布局、主键约束、pin、脏页与写回                                                |
| [37 WAL, Redo and Undo](https://viqbgrg.github.io/corecraft/#/learn/wal)                                          | 日志持久前缀、WAL 写页保护、提交重做与未提交撤销                                       |
| [38 Transactions, Isolation and MVCC](https://viqbgrg.github.io/corecraft/#/learn/transactions)                   | 双会话读写、快照与当前读、行锁、回滚与死锁                                             |
| [39 Indexes and Query Optimization](https://viqbgrg.github.io/corecraft/#/learn/query-optimizer)                  | 真实 B+Tree / 扫描、RID、成本估计、过时统计与 ANALYZE                                  |
| [40 InnoDB Clustered and Secondary Indexes](https://viqbgrg.github.io/corecraft/#/learn/innodb-indexes)           | 两棵真实 B+Tree、聚簇记录、二级主键与覆盖回表                                          |
| [41 InnoDB Commit and Binlog Recovery](https://viqbgrg.github.io/corecraft/#/learn/innodb-commit)                 | 内部两阶段提交、崩溃决定、Binlog 复制与客户端确认                                      |
| [42 InnoDB Read View and Undo Versions](https://viqbgrg.github.io/corecraft/#/learn/innodb-read-view)             | 可见性边界、冻结活跃集合、Undo 版本链与 Purge                                          |
| [43 InnoDB Record, Gap and Next-Key Locks](https://viqbgrg.github.io/corecraft/#/learn/innodb-locks)              | 锁区间、RR / RC、唯一等值、等待与原语句重试                                            |
| [44 MySQL Join, Aggregation and Filesort](https://viqbgrg.github.io/corecraft/#/learn/mysql-execution)            | 三种真实 Join、分组、排序、LIMIT 与成本对照                                            |
| [45 Java Objects, References and Frames](https://viqbgrg.github.io/corecraft/#/learn/java-objects)                | 对象身份、引用别名、参数复制、栈帧与可达性                                             |
| [46 ClassLoaders, Reflection and Exceptions](https://viqbgrg.github.io/corecraft/#/learn/java-classes)            | 父委派 / 独立定义、类型转换、反射调用与异常栈                                          |
| [47 Java Generics and Collections](https://viqbgrg.github.io/corecraft/#/learn/java-collections)                  | List 扩容、Map 碰撞、Set 去重、泛型污染与迭代器                                        |
| [48 Java Memory Model and Happens-Before](https://viqbgrg.github.io/corecraft/#/learn/java-memory-model)          | 发布程序、同步边传递、允许的读值与有限结果枚举                                         |
| [49 Java Streams, Readers and NIO Buffers](https://viqbgrg.github.io/corecraft/#/learn/java-io-apis)              | 字节 / char、EOF、Buffer 位置、flip / compact 与关闭                                   |
| [50 JVM Lifecycle, Bytecode and Object Layout](https://viqbgrg.github.io/corecraft/#/learn/jvm-runtime)           | 类型验证、类初始化、操作数栈、对象头与对齐                                             |
| [51 GC Roots, Generations and Reachability](https://viqbgrg.github.io/corecraft/#/learn/jvm-gc)                   | 引用图、记忆集合、不可达环、晋升与回收范围                                             |
| [52 G1 Regions and ZGC Relocation Barriers](https://viqbgrg.github.io/corecraft/#/learn/jvm-collectors)           | 区域收益、真实搬迁、转发表与加载屏障修复                                               |
| [53 JIT, Escape Analysis and Safepoints](https://viqbgrg.github.io/corecraft/#/learn/jvm-jit)                     | 预热、标量替换、逃逸、类型守卫与安全点轮询                                             |
| [54 Java Threads, Volatile and CAS](https://viqbgrg.github.io/corecraft/#/learn/java-atomics)                     | 交错执行两个线程的自增，用 CAS 重试修复丢失更新，并通过版本识别 ABA。                  |
| [55 Monitors, AQS and Conditions](https://viqbgrg.github.io/corecraft/#/learn/java-locks)                         | 分开观察锁所有权、同步队列和条件集合，验证重入计数、通知与谓词重检。                   |
| [56 CountDownLatch and Semaphore](https://viqbgrg.github.io/corecraft/#/learn/java-coordination)                  | 等待三份结果发布，再用两个可复用许可调度三项资源任务，试验过量释放。                   |
| [57 Thread Pools, Queues and Backpressure](https://viqbgrg.github.io/corecraft/#/learn/java-executors)            | 突发提交任务，检查核心线程、队列、非核心线程、拒绝策略与关闭时的任务去向。             |
| [58 ConcurrentHashMap and Forwarding](https://viqbgrg.github.io/corecraft/#/learn/java-concurrent-map)            | 交错更新同键、碰撞键与不同桶，逐桶迁移并沿 Forwarding 读取已提交值。                   |
| [59 ForkJoin and CompletableFuture](https://viqbgrg.github.io/corecraft/#/learn/java-futures)                     | 分解真实求和任务，窃取分支并归并结果，比较 Future 正常、失败、恢复与取消。             |
| [60 File Streams, Buffering and Durability](https://viqbgrg.github.io/corecraft/#/learn/java-file-io)             | 逐字节复制真实 UTF-8 文件，比较 read 调用数，并在断电前后检验 flush 与 force。         |
| [61 NIO Channels, Selectors and Partial Frames](https://viqbgrg.github.io/corecraft/#/learn/nio-selector)         | 注册非阻塞连接，保留 selected keys 和 Buffer 半包，分次写回并管理 OP_WRITE。           |
| [62 Reactor Loops and Netty Pipelines](https://viqbgrg.github.io/corecraft/#/learn/netty-reactor)                 | 让长短请求共享事件循环，比较业务卸载、ByteBuf 引用交接与高低水位背压。                 |
| [63 Spring Containers and Dependency Injection](https://viqbgrg.github.io/corecraft/#/learn/spring-container)     | 注册定义并解析对象图，解决候选歧义，比较 singleton、prototype 与循环依赖。             |
| [64 Spring AOP Proxies and Transactions](https://viqbgrg.github.io/corecraft/#/learn/spring-transactions)         | 逐步转账并观察已提交余额，比较自调用、代理、异常规则与事务传播。                       |
| [65 Spring MVC Request Dispatch](https://viqbgrg.github.io/corecraft/#/learn/spring-mvc)                          | 跟踪 Filter、映射、参数绑定、Controller、异常解析、JSON 与视图渲染。                   |
| [66 Boot Configuration and Auto-configuration](https://viqbgrg.github.io/corecraft/#/learn/boot-configuration)    | 追踪配置优先级与类型绑定，查看条件报告，观察自动配置向用户 Bean 退让。                 |
| [67 Boot Web Validation and Actuator](https://viqbgrg.github.io/corecraft/#/learn/boot-web)                       | 校验订单输入，比较 DB 故障下的存活与就绪，再显式暴露并授权请求指标。                   |
| [68 Redis Values and Skip Lists](https://viqbgrg.github.io/corecraft/#/learn/redis-structures)                    | 执行计数、列表、Hash、Set 与 ZSet 命令，观察真实跳表指针随分数更新重新连接。           |
| [69 Redis Expiration and Eviction](https://viqbgrg.github.io/corecraft/#/learn/redis-expiration)                  | 推进 TTL 时钟，比较驻留与逻辑有效性，再用不同容量策略拒绝或淘汰键。                    |
| [70 Redis RDB and AOF Recovery](https://viqbgrg.github.io/corecraft/#/learn/redis-persistence)                    | 在快照和日志同步之间插入写入与断电，检验已确认写入的恢复，并重写 AOF。                 |
| [71 Redis Replication, Sentinel and Cluster](https://viqbgrg.github.io/corecraft/#/learn/redis-topology)          | 观察异步复制与旧主分叉，执行多数授权切换，再处理 Cluster 的 ASK 与 MOVED。             |
| [72 Kafka Logs and Delivery Semantics](https://viqbgrg.github.io/corecraft/#/learn/kafka-delivery)                | 写入分区日志并操控消费 offset，在崩溃与重试中比较重复、丢失和事务输出。                |
| [73 RabbitMQ Routing and Acknowledgments](https://viqbgrg.github.io/corecraft/#/learn/rabbitmq-delivery)          | 路由消息到多个队列，观察 prefetch、unacked 重投、inbox 去重、mandatory return 与死信。 |
| [74 Partitions, Consistency and Convergence](https://viqbgrg.github.io/corecraft/#/learn/distributed-consistency) | 把三副本拆成两个分区，比较仲裁拒绝与本地接受，再执行冲突决议和反熵修复。               |
| [75 Raft Elections and Log Commitment](https://viqbgrg.github.io/corecraft/#/learn/raft-consensus)                | 调度 RequestVote 与 AppendEntries，隔离旧主、选出新主并修复未提交分叉。                |
| [76 Distributed Leases and Fencing](https://viqbgrg.github.io/corecraft/#/learn/distributed-locks)                | 暂停旧持有者直到租约过期，让新持有者写入，再用资源端 token 检查拒绝旧请求。            |
| [77 Two-phase Commit and Sagas](https://viqbgrg.github.io/corecraft/#/learn/distributed-transactions)             | 持久记录跨资源决定，观察 prepared 超时等待，再比较 Saga 的中间状态与补偿重试。         |
| [78 Discovery, Retries and Resilience](https://viqbgrg.github.io/corecraft/#/learn/service-resilience)            | 更新发现快照并调度突发请求，跟踪超时后迟到的执行、退避、熔断、令牌桶与幂等。           |
| [79 Backend Capacity and Performance Tuning](https://viqbgrg.github.io/corecraft/#/learn/backend-capacity)        | 用同一负载比较线程、DB、索引、缓存、异步等待、对象分配与 GC 的实际成本。               |
| [80 Caches, Outbox and Service Consistency](https://viqbgrg.github.io/corecraft/#/learn/backend-consistency)      | 复现旧缓存回填和数据库/MQ 双写间隙，使用事务 outbox、relay 租约和 inbox 恢复重复投递。 |
| [81 Observability and Performance Diagnosis](https://viqbgrg.github.io/corecraft/#/learn/backend-observability)   | 从真实模拟负载提取五类证据，按 Trace 定位等待，再用单变量复测检验 SLO 改善。           |

同时已提供：

- **Learn / Experiment / Challenge**：切换模式会保留当前实验状态；正确解释并完成实验目标后，才能标记课程完成。
- **知识关系**：前置、相关、后续概念可以跳转；路线页的全部主题均有对应课程入口。
- **本地进度**：保存在当前浏览器；存储不可用时仍可学习，不需要注册。
- **AI Tutor 适配层**：Ask AI 入口可读取当前实验上下文。当前明确显示 **AI Tutor coming soon**；没有接入真实 AI API，提示由课程作者提供。
- **静态运行**：响应式界面、键盘操作、语义标签与本地字体。实验不请求真实网络或任何后端。

模型是有边界的教学抽象，例如固定大小的缓存行、教学 CPU 指令集与模拟时延。每节课都说明假设，汇总见 [模型说明](docs/models.md)。Level 0–17 课程已全部交付，逐项范围与验收依据见 [课程交付清单](docs/course-delivery.md)。

## 完整学习路线

```text
Level 0   学习方法：抽象、状态、数据、指令、从问题到机制
Level 1   计算机基础：数制、数据表示、字符编码、基本逻辑
Level 2   计算机组成原理：CPU、Cache、流水线、分支预测
Level 3   操作系统：进程、线程、内存、文件系统、IO
Level 4   计算机网络：TCP/IP、DNS、HTTP、TLS、Socket
Level 5   数据结构与算法：结构设计、查找、排序、图、动态规划
Level 6   数据库原理：索引、日志、事务、锁、MVCC、优化器
Level 7   MySQL：InnoDB、索引、事务、执行计划与查询优化
Level 8   Java 核心：对象、类型、集合、反射、异常
Level 9   JVM：类加载、运行时内存、GC、JIT
Level 10  Java 并发：JMM、volatile、CAS、AQS、线程池
Level 11  Java IO / NIO：Buffer、Channel、Selector、Reactor、Netty
Level 12  Spring：IoC、DI、AOP、事务、MVC
Level 13  Spring Boot：自动配置、Starter、Actuator
Level 14  Redis：数据结构、缓存策略、持久化、复制、集群
Level 15  消息队列：投递语义、Kafka、RabbitMQ
Level 16  分布式系统：一致性、共识、容错、限流
Level 17  高级 Java 后端：高性能、高并发、可观测性、故障排查
```

[ROADMAP.md](ROADMAP.md) 保存完整知识清单、课程覆盖与后续产品计划。课程按具体问题组织，可以沿路线学习，也可以从一个实验进入相关知识。

## 本地运行

需要 **Node.js 24** 与 npm。

```sh
git clone https://github.com/viqbgrg/corecraft.git
cd corecraft
npm ci
npm run dev
```

访问终端显示的地址，默认是 `http://localhost:5173/corecraft/`。

```sh
npm test                  # 纯模型、状态边界、树结构与课程完整性
npm run build             # strict 类型检查 + Vite 生产构建
npm run preview           # 预览 dist
npx playwright install chromium --only-shell
npm run test:e2e           # 构建后验证桌面、手机和自动无障碍检查
```

没有后端、登录、数据库、环境密钥或运行时 AI 依赖。离线使用可将构建产物交给本地静态服务器；当前没有安装式 PWA 或离线缓存服务。

## 工程结构

Vue 3 + TypeScript strict + Vite + Vue Router + 原生 CSS / SVG。小型本地进度状态使用 Vue composable，未引入 UI 框架或全局状态库。

```text
src/
  courses/<slug>/         Course 元数据 + Markdown 正文
  types/                 Course / Concept / Experiment / Tutor 契约
  experiments/
    core/                框架无关的 Session 与状态工具
    models/              独立实验模型：initial → transition → present
    structures/          真正的 B+Tree 数据结构
    scenes/              根据 Scene 数据渲染的可复用可视化
    registry.ts          实验类型 → 引擎工厂
    ExperimentWorkbench.vue  统一输入、指标、目标与观察记录
  components/            基础 UI、Markdown、概念链接、Tutor 对话框
  composables/           本地学习进度
  data/                  完整路线与知识引用
  services/              AI Tutor 独立适配层
  layouts/ router/ views/
docs/                    架构、模型边界与贡献文档
tests/                   模型不变量与浏览器操作验证
```

详见 [架构与课程扩展](docs/architecture.md)。新增课程无需复制整个页面；新实验复用控制台和适合其数据的场景组件。

## GitHub Pages 自动部署

网站：**https://viqbgrg.github.io/corecraft/**

```text
push main
  → GitHub Actions
  → npm ci
  → 模型测试 + strict 类型检查 + 生产构建
  → 桌面 / 手机浏览器测试与自动无障碍检查
  → 上传 dist 并部署 GitHub Pages
```

工作流为 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)。Pull request 只测试和构建，main 才发布。仓库 Pages 的构建方式设置为 GitHub Actions，使用工作流的短期 GITHUB_TOKEN 与 OIDC 权限，不保存个人 token。

Vite `base` 为 `/corecraft/`，Vue Router 使用 hash history，因此 `#/learn/tcp-handshake` 等深链接刷新不会依赖服务器回退。Fork 到另一个用户名、保持仓库名 `corecraft` 时，地址为 `https://<username>.github.io/corecraft/`；如果更改仓库名，需要相应修改 Vite base。

## Roadmap 与贡献

继续补齐完整路线：数据库 / MySQL → Java / JVM / 并发 → 中间件 / 分布式系统。AI Tutor、知识图谱、实验保存与分享、国际化属于持续演进方向；后端与用户系统只在明确需要时设计。

贡献时请说明：用户原本不理解什么、实验能改变什么、怎样观察到证据，以及模型省略了什么。参见 [贡献指南](docs/contributing.md)。

## 开源协议

代码与课程内容采用 [MIT](LICENSE)，© 2026 CoreCraft contributors。

自托管的 DM Sans 与 IBM Plex Mono 字体分别遵循 [SIL Open Font License](public/licenses/dmsans-OFL.txt) 与 [SIL Open Font License](public/licenses/ibmplexmono-OFL.txt)，字体原版权声明随站点发布。
