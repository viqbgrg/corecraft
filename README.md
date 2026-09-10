# CoreCraft

**Learn Computer Science by Building & Experimenting.**

通过互动实验理解计算机原理，从计算机基础一路学习到高级 Java 开发。

CoreCraft is an interactive computer science learning platform.

> Don't just learn what. Understand why.
> Don't just read. Experiment.
> Don't just memorize. Build a mental model.

不只是知道是什么。更重要的是理解为什么。
不只是阅读。而是亲手实验。
不只是记忆。而是建立自己的计算机模型。

## 核心理念

每节课围绕 Problem → Why → Mechanism → Experiment → Conclusion 展开。实验必须回答一个问题，操作必须产生可解释的状态变化。

## 当前进度

第一阶段开发中：课程与概念类型、独立实验 Session 接口、TutorProvider 适配层、完整路线与贡献文档已建立。首批计划实现 Binary、CPU、Cache、Process / Thread、Virtual Memory、TCP Handshake、TCP Close、DNS、HTTP Lifecycle、B+Tree。

## 完整学习路线与 Roadmap

计算机基础 → 计算机组成原理 → 操作系统 → 计算机网络 → 数据结构与算法 → 数据库原理 → MySQL → Java 核心 → JVM → Java 并发 → Java IO / NIO → Spring / Spring Boot → Redis → 消息队列 → 分布式系统 → 高性能 / 高并发 → 高级 Java 后端开发。

[ROADMAP.md](ROADMAP.md) 记录 Level 0–17 的全部目标。路线中的计划不表示已有课程。

## 本地运行

需要 Node.js 24。

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

## GitHub Pages

目标地址：<https://viqbgrg.github.io/corecraft/>。部署验证完成后更新状态。Vite base 为 `/corecraft/`，采用 hash 路由。

## 架构与贡献

Vue 3 + TypeScript strict + Vite + Vue Router + 原生 CSS / SVG，无后端。课程 Markdown、实验模型与基础 UI 分离。

参见 [架构文档](docs/architecture.md) 与 [贡献指南](docs/contributing.md)。

## 开源协议

[MIT](LICENSE) © CoreCraft contributors
