# 架构与扩展

## 数据流

```text
Course (metadata + Markdown + concepts + challenge)
  → ExperimentDefinition (type + config)
  → Engine registry → Session (pure state transition + presentation)
  → ExperimentView (scene + controls + metrics + observations + goal)
  → shared ExperimentWorkbench → scene components
```

Vue 组件不执行协议或数据结构算法。模型位于 `src/experiments/models/`，只依赖 TypeScript 类型和纯函数工具。它们可以在 Node 中测试，也能被其他前端复用。实验通过统一 Action 驱动，视图读取规范化的状态、控制项、指标、观察记录与目标。

控制台负责输入、重置、指标、日志和无障碍消息。可视化组件按数据的形状共享：TCP、DNS 使用同一种时序图，HTTP 使用流程图。不要为了统一而把不同原理塞进一个没有类型边界的巨型模型。

## 添加一课

1. 在 `src/courses/<slug>/lesson.md` 写 Problem → Why → Mechanism → Experiment → Conclusion。
2. 新建 `index.ts`，提供 Course 元数据、知识关系、实验定义和有解释的 Challenge。
3. 在课程索引中注册。需要新机制时，为模型实现 initial / transition / present，并注册工厂。
4. 尽量复用已有场景；新图形只读取 scene 数据并发出 Action。
5. 测试关键不变量与故障路径；更新路线、模型假设和 README。
6. 执行 `npm test`、`npm run build` 与受影响的浏览器测试。

## 学习状态

使用小型 Vue composable 维护当前浏览器的课程完成记录，无需 Pinia。只有完成实验目标且正确回答挑战后才能标记完成。localStorage 不可用时仍能学习，状态退化为会话内保存。没有登录、跟踪、远端存储或跨设备同步。

## AI Tutor

`src/types/tutor.ts` 定义 TutorProvider、TutorRequest、TutorContext 与 TutorResponse。上下文包含课程、概念、学习模式、实验指标和操作记录。当前 provider 明确返回 coming soon，不发送网络请求，不模拟生成式 AI。

未来的 Explain / Ask / Analyze / Hint / Generate / Recommend 能力通过独立适配层接入。浏览器公开构建产物不能保管服务端密钥；真实服务的认证、费用与隐私边界届时独立设计。

## 静态托管

Vite base 为 `/corecraft/`；Vue Router 使用 hash history，刷新深链接无需服务器回退。GitHub Actions 从 main 安装锁定依赖、测试、构建，再通过官方 Pages action 发布 dist。生产站点不需要任何后端。
