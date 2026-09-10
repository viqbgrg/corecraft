# CoreCraft Roadmap

> Learn Computer Science by Building & Experimenting.
>
> 这是一条长期路线，不是当前已经完成的课程列表。第一阶段聚焦十个真实可操作的实验。

## 交付阶段

- **Phase 1 · 互动学习原型**：Binary、CPU、Cache、Process / Thread、Virtual Memory、TCP 三次握手、TCP 四次挥手、DNS、HTTP Lifecycle、B+Tree。统一课程模型、实验引擎、三种学习模式、知识关联、AI Tutor 适配层、静态部署。
- **Phase 2 · 深化基础**：流水线、分支预测、调度算法、页面置换、TCP 重传与拥塞控制、数据结构与算法。优先增加能回答具体问题的实验。
- **Phase 3 · 数据与 Java**：数据库原理、MySQL、Java 核心、JVM、并发、IO / NIO。
- **Phase 4 · 后端体系**：Spring、Spring Boot、Redis、消息队列、分布式系统、高性能与故障排查。
- **跨阶段演进**：基于实验上下文的 AI Tutor、知识图谱、实验保存与分享、无障碍完善、国际化。后端与用户系统仅在明确需求后再设计。

## 完整学习路线

计算机基础 → 计算机组成原理 → 操作系统 → 计算机网络 → 数据结构与算法 → 数据库原理 → MySQL → Java 核心 → JVM → Java 并发 → Java IO / NIO → Spring / Spring Boot → Redis → 消息队列 → 分布式系统 → 高性能 / 高并发 → 高级 Java 后端开发。

以下清单是知识覆盖目标；未勾选不代表该知识完全未在实验中出现。交付状态以 README 的实验表为准。

## Level 0：学习方法

先建立模型，再用实验检验自己的解释。

### 思维工具

- [ ] 什么是计算机
- [ ] 抽象与建模
- [ ] 状态
- [ ] 数据
- [ ] 指令
- [ ] 程序
- [ ] 从问题到机制

## Level 1：计算机基础

从可靠的两种状态，走向数据的表示与逻辑。

### 数制与数据

- [ ] 二进制
- [ ] 十六进制
- [ ] 位与字节
- [ ] 有符号数
- [ ] 补码
- [ ] 浮点数
- [ ] 字符编码
- [ ] ASCII
- [ ] Unicode
- [ ] UTF-8

### 基本逻辑

- [ ] AND
- [ ] OR
- [ ] NOT
- [ ] XOR
- [ ] 布尔代数
- [ ] 逻辑门

### 互动实验方向

- 二进制与位操作
- 二进制加法与溢出

## Level 2：计算机组成原理

观察指令怎样执行，数据怎样在存储层级中流动。

### 组成与执行

- [ ] CPU
- [ ] ALU
- [ ] Register
- [ ] Program Counter
- [ ] Instruction
- [ ] Instruction Fetch
- [ ] Decode
- [ ] Execute
- [ ] Memory
- [ ] Bus
- [ ] Cache
- [ ] Cache Line
- [ ] Locality
- [ ] Branch Prediction
- [ ] Pipeline
- [ ] Interrupt
- [ ] DMA

### 互动实验方向

- CPU 执行指令
- 寄存器变化
- Cache 命中 / 未命中
- 指令流水线
- 分支预测

## Level 3：操作系统

理解有限的 CPU 与内存怎样被多个程序共同使用。

### 进程

- [ ] Process
- [ ] PCB
- [ ] Process State
- [ ] Context Switch

### 线程

- [ ] Thread
- [ ] User Thread
- [ ] Kernel Thread
- [ ] Thread Scheduling
- [ ] Context Switch

### 内存

- [ ] Virtual Memory
- [ ] Page
- [ ] Page Table
- [ ] TLB
- [ ] Page Fault
- [ ] mmap

### 文件系统

- [ ] File
- [ ] inode
- [ ] Directory
- [ ] Block
- [ ] Page Cache

### IO

- [ ] Blocking IO
- [ ] Non-blocking IO
- [ ] IO Multiplexing
- [ ] select
- [ ] poll
- [ ] epoll

### 互动实验方向

- 进程状态转换
- CPU 调度
- 虚拟地址转换
- Page Fault
- epoll Reactor 模型

## Level 4：计算机网络

从不可靠的传输，理解可靠连接与分层协议。

### 网络基础

- [ ] OSI
- [ ] TCP/IP
- [ ] Ethernet
- [ ] ARP
- [ ] IP
- [ ] TCP
- [ ] UDP
- [ ] DNS
- [ ] HTTP
- [ ] HTTPS
- [ ] TLS
- [ ] Socket

### TCP

- [ ] 三次握手
- [ ] 四次挥手
- [ ] Sequence Number
- [ ] ACK
- [ ] Sliding Window
- [ ] Flow Control
- [ ] Congestion Control
- [ ] Retransmission
- [ ] TIME_WAIT

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

- [ ] Array
- [ ] Linked List
- [ ] Stack
- [ ] Queue
- [ ] Deque
- [ ] Hash Table
- [ ] Tree
- [ ] Binary Tree
- [ ] BST
- [ ] Heap
- [ ] B Tree
- [ ] B+ Tree
- [ ] Graph

### 算法

- [ ] Binary Search
- [ ] Sorting
- [ ] BFS
- [ ] DFS
- [ ] Dijkstra
- [ ] Dynamic Programming
- [ ] Greedy

### 互动实验方向

- B+Tree 插入 / 查找 / 删除
- 节点分裂 / 合并
- 范围查询与叶子链表

## Level 6：数据库原理

理解数据如何被组织、持久化与并发访问。

### 数据库机制

- [ ] Database
- [ ] Table
- [ ] Record
- [ ] Page
- [ ] Index
- [ ] B+Tree
- [ ] Buffer Pool
- [ ] WAL
- [ ] Redo Log
- [ ] Undo Log
- [ ] Transaction
- [ ] ACID
- [ ] Isolation
- [ ] Lock
- [ ] MVCC
- [ ] Query Optimizer

## Level 7：MySQL

从 InnoDB 的机制，解释 SQL 的执行与代价。

### InnoDB 与索引

- [ ] InnoDB
- [ ] Clustered Index
- [ ] Secondary Index
- [ ] B+Tree
- [ ] Buffer Pool
- [ ] Redo Log
- [ ] Undo Log
- [ ] Binlog

### 并发与事务

- [ ] MVCC
- [ ] Read View
- [ ] Transaction Isolation
- [ ] Lock
- [ ] Gap Lock
- [ ] Next-Key Lock

### 查询执行

- [ ] EXPLAIN
- [ ] Optimizer
- [ ] Cost Model
- [ ] Join
- [ ] GROUP BY
- [ ] ORDER BY
- [ ] Filesort

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

- [ ] Java Memory Model
- [ ] Object
- [ ] Reference
- [ ] Heap
- [ ] Stack
- [ ] Method Area
- [ ] Class
- [ ] ClassLoader
- [ ] Reflection
- [ ] Exception
- [ ] Generic
- [ ] Collection
- [ ] IO
- [ ] NIO

## Level 9：JVM

让类加载、内存分配、垃圾回收和运行优化变得可观察。

### 运行时与内存

- [ ] JVM Architecture
- [ ] Class Loading
- [ ] Runtime Data Area
- [ ] Heap
- [ ] Stack
- [ ] Metaspace
- [ ] Object Layout

### 回收与优化

- [ ] GC Roots
- [ ] Reachability
- [ ] Minor GC
- [ ] Major GC
- [ ] Full GC
- [ ] G1
- [ ] ZGC
- [ ] JIT
- [ ] Escape Analysis
- [ ] Safepoint

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

- [ ] Thread
- [ ] synchronized
- [ ] volatile
- [ ] CAS
- [ ] Atomic
- [ ] AQS
- [ ] ReentrantLock
- [ ] Condition
- [ ] CountDownLatch
- [ ] Semaphore
- [ ] ThreadPool
- [ ] BlockingQueue
- [ ] ConcurrentHashMap
- [ ] ForkJoinPool
- [ ] CompletableFuture

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

- [ ] File IO
- [ ] Stream
- [ ] Buffer
- [ ] Channel
- [ ] Selector
- [ ] Reactor
- [ ] Netty

## Level 12：Spring

不只是学习 Spring 怎么用，而是解释 Spring 为什么这样设计。

### 容器与框架

- [ ] IoC
- [ ] DI
- [ ] Bean
- [ ] BeanFactory
- [ ] ApplicationContext
- [ ] AOP
- [ ] Proxy
- [ ] Transaction
- [ ] Spring MVC

## Level 13：Spring Boot

理解约定、自动配置与可观测应用的边界。

### 自动配置与应用

- [ ] Auto Configuration
- [ ] Starter
- [ ] Configuration
- [ ] Web
- [ ] Validation
- [ ] Actuator
- [ ] Configuration Properties

## Level 14：Redis

从数据结构与持久化，走向缓存和可用性设计。

### 数据结构

- [ ] Redis 数据结构
- [ ] String
- [ ] List
- [ ] Hash
- [ ] Set
- [ ] ZSet
- [ ] Skip List

### 存储与高可用

- [ ] Expiration
- [ ] Eviction
- [ ] Persistence
- [ ] RDB
- [ ] AOF
- [ ] Replication
- [ ] Sentinel
- [ ] Cluster

## Level 15：消息队列

理解解耦、顺序、重试和消息投递语义。

### 消息模型

- [ ] Producer
- [ ] Consumer
- [ ] Broker
- [ ] Topic
- [ ] Partition
- [ ] Offset
- [ ] Consumer Group
- [ ] At-least-once
- [ ] At-most-once
- [ ] Exactly-once
- [ ] Kafka
- [ ] RabbitMQ

## Level 16：分布式系统

在网络延迟和部分故障下，建立可推理的系统模型。

### 一致性与协调

- [ ] CAP
- [ ] BASE
- [ ] Consistency
- [ ] Availability
- [ ] Partition Tolerance
- [ ] Distributed Lock
- [ ] Distributed Transaction
- [ ] Consensus
- [ ] Raft

### 韧性与治理

- [ ] Service Discovery
- [ ] Load Balancing
- [ ] Retry
- [ ] Timeout
- [ ] Circuit Breaker
- [ ] Rate Limiting

## Level 17：高级 Java 后端

用完整的计算机模型分析性能、可靠性和真实故障。

### 工程实践

- [ ] 高并发
- [ ] 高性能
- [ ] 缓存
- [ ] 数据库优化
- [ ] JVM 调优
- [ ] GC 调优
- [ ] 线程池设计
- [ ] 异步化
- [ ] 分布式缓存
- [ ] 分布式锁
- [ ] MQ
- [ ] 分布式事务
- [ ] 微服务
- [ ] 可观测性
- [ ] 性能分析
- [ ] 故障排查

## 一个实验的完成标准

- 提出一个值得验证的问题，并说明机制要解决什么。
- 用户能改变输入或步骤，并观察可解释的状态变化。
- 原理模型与展示组件独立；状态边界有针对性测试。
- 明确教学模型的假设和省略部分。
- Learn → Experiment → Challenge 形成闭环，并能进入前置或后续知识。
- 生产构建通过，GitHub Pages 可运行。
