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

## 当前进度 · Phase 1

十个可操作的实验已经接入统一课程框架。各课都包含 Markdown 原理解释、实验目标、观察记录、挑战题和知识关联。

| 课程                                                                            | 要回答的问题                                | 可以亲手操作什么                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| [01 Binary](https://viqbgrg.github.io/corecraft/#/learn/binary)                 | 为什么只用 0 / 1？为什么 255 + 1 会变成 0？ | 十进制 ↔ 二进制、逐位翻转、AND / OR / XOR、NOT、左移、加法与进位                      |
| [02 CPU](https://viqbgrg.github.io/corecraft/#/learn/cpu)                       | 计算结果什么时候真正写入寄存器？            | Fetch / Decode / Execute / Write Back、MOV / ADD / STORE / LOAD、PC / IR / ALU / 内存 |
| [03 Cache](https://viqbgrg.github.io/corecraft/#/learn/cache)                   | 为什么相邻地址常常更容易命中？              | L1 / L2 / RAM、缓存行填充、冲突与包含式失效、相同地址集合的顺序对照                   |
| [04 Process / Thread](https://viqbgrg.github.io/corecraft/#/learn/process)      | 一个 CPU 如何在多个执行流之间复用？         | 轮转调度、时间片、私有栈与共享内存、IO 阻塞、条件等待、唤醒                           |
| [05 Virtual Memory](https://viqbgrg.github.io/corecraft/#/learn/virtual-memory) | TLB Miss 一定意味着 Page Fault 吗？         | 地址拆分、TLB、页表、缺页载入与重试、FIFO 置换与映射失效                              |
| [06 TCP Handshake](https://viqbgrg.github.io/corecraft/#/learn/tcp-handshake)   | 最后一个 ACK 究竟确认了什么？               | 三个报文、可修改的 32 位 Seq / Ack、丢包、错误 ACK、重复 SYN 与手动重传               |
| [07 TCP Close](https://viqbgrg.github.io/corecraft/#/learn/tcp-close)           | 为什么收到 FIN 后还能继续发送数据？         | 两个方向独立关闭、半关闭传输、最后 ACK 丢失、FIN 重传、TIME_WAIT                      |
| [08 DNS](https://viqbgrg.github.io/corecraft/#/learn/dns)                       | 根不知道全部 IP，为什么还能找到答案？       | 递归 / 迭代查询、转介、正负缓存、TTL 到期、NXDOMAIN                                   |
| [09 HTTP](https://viqbgrg.github.io/corecraft/#/learn/http)                     | 请求在哪一层失败？哪些准备工作可以复用？    | DNS → TCP → TLS → HTTP → Server → Response、连接复用、分层故障、HTTP 500              |
| [10 B+Tree](https://viqbgrg.github.io/corecraft/#/learn/btree)                  | 怎样保持树矮、有序，并降低读取次数？        | 真正的插入、查找、删除、叶子 / 内部节点分裂、借位与合并、范围扫描                     |

同时已提供：

- **Learn / Experiment / Challenge**：切换模式会保留当前实验状态；正确解释并完成实验目标后，才能标记课程完成。
- **知识关系**：前置、相关、后续概念可以跳转；尚未实现的内容明确进入长期路线。
- **本地进度**：保存在当前浏览器；存储不可用时仍可学习，不需要注册。
- **AI Tutor 适配层**：Ask AI 入口可读取当前实验上下文。当前明确显示 **AI Tutor coming soon**；没有接入真实 AI API，提示由课程作者提供。
- **静态运行**：响应式界面、键盘操作、语义标签与本地字体。实验不请求真实网络或任何后端。

模型是有边界的教学抽象，例如固定大小的缓存行、教学 CPU 指令集与模拟时延。每节课都说明假设，汇总见 [模型说明](docs/models.md)。路线中其余专题均属于后续计划。

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

[ROADMAP.md](ROADMAP.md) 保存完整知识清单和阶段计划。优先交付能够解释具体问题的实验，再逐步扩展数据库与 Java 后端路线。

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

先打磨现有实验，再推进基础原理 → 数据库 / MySQL → Java / JVM / 并发 → 中间件 / 分布式系统。AI Tutor、知识图谱、实验保存与分享、国际化属于持续演进方向；后端与用户系统只在明确需要时设计。

贡献时请说明：用户原本不理解什么、实验能改变什么、怎样观察到证据，以及模型省略了什么。参见 [贡献指南](docs/contributing.md)。

## 开源协议

代码与课程内容采用 [MIT](LICENSE)，© 2026 CoreCraft contributors。

自托管的 DM Sans 与 IBM Plex Mono 字体分别遵循 [SIL Open Font License](public/licenses/dmsans-OFL.txt) 与 [SIL Open Font License](public/licenses/ibmplexmono-OFL.txt)，字体原版权声明随站点发布。
