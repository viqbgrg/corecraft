# CoreCraft Roadmap

> Learn Computer Science by Building & Experimenting.
>
> Level 0–17 的全部路线主题已由 81 节可操作课程覆盖。下面记录课程范围、已完成阶段与后续产品计划。

## 交付阶段

目前已有 81 个可操作实验，课程入口见 [README](README.md#当前课程)，各组范围与验收依据见 [交付清单](docs/course-delivery.md)。统一课程模型、Learn / Experiment / Challenge、前后置概念、本地完成记录及 AI Tutor 接口均已建立。课程范围已经交付；真实 AI API、实验分享等产品能力继续独立规划。

- **Phase 1 · 互动学习原型（已完成）**：Binary、CPU、Cache、Process / Thread、Virtual Memory、TCP 三次握手、TCP 四次挥手、DNS、HTTP Lifecycle、B+Tree。统一课程模型、实验引擎、三种学习模式、知识关联、AI Tutor 适配层、静态部署。
- **Phase 2 · 深化基础（已完成）**：流水线、分支预测、CPU 调度、页面置换、TCP 可靠传输与拥塞控制；数组与链表、栈 / 队列 / 双端队列、哈希表、二分查找、排序、BST / 堆、图算法、贪心与动态规划。
- **Phase 3 · 数据与 Java（已完成）**：数据库原理、MySQL、Java 核心、JVM、并发、IO / NIO。
- **Phase 4 · 后端体系（已完成）**：Spring、Spring Boot、Redis、消息队列、分布式系统、高性能与故障排查。
- **跨阶段演进**：基于实验上下文的 AI Tutor、知识图谱、实验保存与分享、无障碍完善、国际化。后端与用户系统仅在明确需求后再设计。

## 完整学习路线

计算机基础 → 计算机组成原理 → 操作系统 → 计算机网络 → 数据结构与算法 → 数据库原理 → MySQL → Java 核心 → JVM → Java 并发 → Java IO / NIO → Spring / Spring Boot → Redis → 消息队列 → 分布式系统 → 高性能 / 高并发 → 高级 Java 后端开发。

以下清单保留完整知识范围。全部勾选主题均有对应的开放课程；映射保存在 `src/data/coverage.ts`，路线页可直接跳转。课程覆盖以正文、可操作机制与测试为依据，每课同时说明模型假设和省略的现实实现。

## Level 0：学习方法

先建立模型，再用实验检验自己的解释。

### 思维工具

- [x] 什么是计算机
- [x] 抽象与建模
- [x] 状态
- [x] 数据
- [x] 指令
- [x] 程序
- [x] 从问题到机制

## Level 1：计算机基础

从可靠的两种状态，走向数据的表示与逻辑。

### 数制与数据

- [x] 二进制
- [x] 十六进制
- [x] 位与字节
- [x] 有符号数
- [x] 补码
- [x] 浮点数
- [x] 字符编码
- [x] ASCII
- [x] Unicode
- [x] UTF-8

### 基本逻辑

- [x] AND
- [x] OR
- [x] NOT
- [x] XOR
- [x] 布尔代数
- [x] 逻辑门

### 互动实验方向

- 二进制与位操作
- 二进制加法与溢出

## Level 2：计算机组成原理

观察指令怎样执行，数据怎样在存储层级中流动。

### 组成与执行

- [x] CPU
- [x] ALU
- [x] Register
- [x] Program Counter
- [x] Instruction
- [x] Instruction Fetch
- [x] Decode
- [x] Execute
- [x] Memory
- [x] Bus
- [x] Cache
- [x] Cache Line
- [x] Locality
- [x] Branch Prediction
- [x] Pipeline
- [x] Interrupt
- [x] DMA

### 互动实验方向

- CPU 执行指令
- 寄存器变化
- Cache 命中 / 未命中
- 指令流水线
- 分支预测

## Level 3：操作系统

理解有限的 CPU 与内存怎样被多个程序共同使用。

### 进程

- [x] Process
- [x] PCB
- [x] Process State
- [x] Context Switch

### 线程

- [x] Thread
- [x] User Thread
- [x] Kernel Thread
- [x] Thread Scheduling
- [x] Context Switch

### 内存

- [x] Virtual Memory
- [x] Page
- [x] Page Table
- [x] TLB
- [x] Page Fault
- [x] mmap

### 文件系统

- [x] File
- [x] inode
- [x] Directory
- [x] Block
- [x] Page Cache

### IO

- [x] Blocking IO
- [x] Non-blocking IO
- [x] IO Multiplexing
- [x] select
- [x] poll
- [x] epoll

### 互动实验方向

- 进程状态转换
- CPU 调度
- 虚拟地址转换
- Page Fault
- epoll Reactor 模型

## Level 4：计算机网络

从不可靠的传输，理解可靠连接与分层协议。

### 网络基础

- [x] OSI
- [x] TCP/IP
- [x] Ethernet
- [x] ARP
- [x] IP
- [x] TCP
- [x] UDP
- [x] DNS
- [x] HTTP
- [x] HTTPS
- [x] TLS
- [x] Socket

### TCP

- [x] 三次握手
- [x] 四次挥手
- [x] Sequence Number
- [x] ACK
- [x] Sliding Window
- [x] Flow Control
- [x] Congestion Control
- [x] Retransmission
- [x] TIME_WAIT

### 互动实验方向

- TCP 三次握手
- TCP 四次挥手
- Sequence / ACK
- 丢包与重传
- 滑动窗口
- DNS 查询
- HTTP 请求生命周期

## Level 5：数据结构与算法

通过可视化理解数据结构为什么这样设计，而不只是刷题。

### 数据结构

- [x] Array
- [x] Linked List
- [x] Stack
- [x] Queue
- [x] Deque
- [x] Hash Table
- [x] Tree
- [x] Binary Tree
- [x] BST
- [x] Heap
- [x] B Tree
- [x] B+ Tree
- [x] Graph

### 算法

- [x] Binary Search
- [x] Sorting
- [x] BFS
- [x] DFS
- [x] Dijkstra
- [x] Dynamic Programming
- [x] Greedy

### 互动实验方向

- B+Tree 插入 / 查找 / 删除
- 节点分裂 / 合并
- 范围查询与叶子链表

## Level 6：数据库原理

理解数据如何被组织、持久化与并发访问。

### 数据库机制

- [x] Database
- [x] Table
- [x] Record
- [x] Page
- [x] Index
- [x] B+Tree
- [x] Buffer Pool
- [x] WAL
- [x] Redo Log
- [x] Undo Log
- [x] Transaction
- [x] ACID
- [x] Isolation
- [x] Lock
- [x] MVCC
- [x] Query Optimizer

## Level 7：MySQL

从 InnoDB 的机制，解释 SQL 的执行与代价。

### InnoDB 与索引

- [x] InnoDB
- [x] Clustered Index
- [x] Secondary Index
- [x] B+Tree
- [x] Buffer Pool
- [x] Redo Log
- [x] Undo Log
- [x] Binlog

### 并发与事务

- [x] MVCC
- [x] Read View
- [x] Transaction Isolation
- [x] Lock
- [x] Gap Lock
- [x] Next-Key Lock

### 查询执行

- [x] EXPLAIN
- [x] Optimizer
- [x] Cost Model
- [x] Join
- [x] GROUP BY
- [x] ORDER BY
- [x] Filesort

### 互动实验方向

- B+Tree 查找
- Buffer Pool
- Redo Log
- Undo Log
- MVCC
- Read View
- EXPLAIN
- Join 执行
- Optimizer Cost

## Level 8：Java 核心

用底层模型理解 Java 对象、类型与运行。

### 核心知识

- [x] Java Memory Model
- [x] Object
- [x] Reference
- [x] Heap
- [x] Stack
- [x] Method Area
- [x] Class
- [x] ClassLoader
- [x] Reflection
- [x] Exception
- [x] Generic
- [x] Collection
- [x] IO
- [x] NIO

## Level 9：JVM

让类加载、内存分配、垃圾回收和运行优化变得可观察。

### 运行时与内存

- [x] JVM Architecture
- [x] Class Loading
- [x] Runtime Data Area
- [x] Heap
- [x] Stack
- [x] Metaspace
- [x] Object Layout

### 回收与优化

- [x] GC Roots
- [x] Reachability
- [x] Minor GC
- [x] Major GC
- [x] Full GC
- [x] G1
- [x] ZGC
- [x] JIT
- [x] Escape Analysis
- [x] Safepoint

### 互动实验方向

- ClassLoader
- 对象创建
- 对象引用
- GC Roots
- GC
- Heap
- Stack
- JIT

## Level 10：Java 并发

从可见性、原子性与调度，构建正确的并发程序。

### 并发机制

- [x] Thread
- [x] synchronized
- [x] volatile
- [x] CAS
- [x] Atomic
- [x] AQS
- [x] ReentrantLock
- [x] Condition
- [x] CountDownLatch
- [x] Semaphore
- [x] ThreadPool
- [x] BlockingQueue
- [x] ConcurrentHashMap
- [x] ForkJoinPool
- [x] CompletableFuture

### 互动实验方向

- volatile
- CAS
- synchronized
- ReentrantLock
- AQS
- ThreadPool
- Producer / Consumer
- CompletableFuture

## Level 11：Java IO / NIO

跟踪数据与线程，理解阻塞和事件驱动的取舍。

### IO 模型

- [x] File IO
- [x] Stream
- [x] Buffer
- [x] Channel
- [x] Selector
- [x] Reactor
- [x] Netty

## Level 12：Spring

不只是学习 Spring 怎么用，而是解释 Spring 为什么这样设计。

### 容器与框架

- [x] IoC
- [x] DI
- [x] Bean
- [x] BeanFactory
- [x] ApplicationContext
- [x] AOP
- [x] Proxy
- [x] Transaction
- [x] Spring MVC

## Level 13：Spring Boot

理解约定、自动配置与可观测应用的边界。

### 自动配置与应用

- [x] Auto Configuration
- [x] Starter
- [x] Configuration
- [x] Web
- [x] Validation
- [x] Actuator
- [x] Configuration Properties

## Level 14：Redis

从数据结构与持久化，走向缓存和可用性设计。

### 数据结构

- [x] Redis 数据结构
- [x] String
- [x] List
- [x] Hash
- [x] Set
- [x] ZSet
- [x] Skip List

### 存储与高可用

- [x] Expiration
- [x] Eviction
- [x] Persistence
- [x] RDB
- [x] AOF
- [x] Replication
- [x] Sentinel
- [x] Cluster

## Level 15：消息队列

理解解耦、顺序、重试和消息投递语义。

### 消息模型

- [x] Producer
- [x] Consumer
- [x] Broker
- [x] Topic
- [x] Partition
- [x] Offset
- [x] Consumer Group
- [x] At-least-once
- [x] At-most-once
- [x] Exactly-once
- [x] Kafka
- [x] RabbitMQ

## Level 16：分布式系统

在网络延迟和部分故障下，建立可推理的系统模型。

### 一致性与协调

- [x] CAP
- [x] BASE
- [x] Consistency
- [x] Availability
- [x] Partition Tolerance
- [x] Distributed Lock
- [x] Distributed Transaction
- [x] Consensus
- [x] Raft

### 韧性与治理

- [x] Service Discovery
- [x] Load Balancing
- [x] Retry
- [x] Timeout
- [x] Circuit Breaker
- [x] Rate Limiting

## Level 17：高级 Java 后端

用完整的计算机模型分析性能、可靠性和真实故障。

### 工程实践

- [x] 高并发
- [x] 高性能
- [x] 缓存
- [x] 数据库优化
- [x] JVM 调优
- [x] GC 调优
- [x] 线程池设计
- [x] 异步化
- [x] 分布式缓存
- [x] 分布式锁
- [x] MQ
- [x] 分布式事务
- [x] 微服务
- [x] 可观测性
- [x] 性能分析
- [x] 故障排查

## 一个实验的完成标准

- 提出一个值得验证的问题，并说明机制要解决什么。
- 用户能改变输入或步骤，并观察可解释的状态变化。
- 原理模型与展示组件独立；状态边界有针对性测试。
- 明确教学模型的假设和省略部分。
- Learn → Experiment → Challenge 形成闭环，并能进入前置或后续知识。
- 生产构建通过，GitHub Pages 可运行。
