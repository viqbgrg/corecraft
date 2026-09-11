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

每个工厂接收只读 config。CPU 支持初始操作数 a / b 与 arithmetic / memory 示例；Binary 和 Cache 目前固定为 8 位与 16 B 行，会拒绝不支持的尺寸，避免定义与模型悄悄不一致。流水线支持 example、mode 与 forwarding；分支预测支持 strategy、sequence 与 penalty。其他模型在各自初始函数中验证容量、模式或输入范围；课程可用空配置选择经过验证的默认例子。扩展参数时，要同时更新工厂校验、教学边界和针对性的测试。

控制台负责输入、重置、指标、日志和无障碍消息。可视化组件按数据的形状共享：TCP、DNS 使用同一种时序图，HTTP 使用流程图。不要为了统一而把不同原理塞进一个没有类型边界的巨型模型。

调度、页面置换、可靠传输、拥塞控制与各数据结构分别拥有自己的类型和状态转换。`DataScene` 只共享卡片、轨迹和带标题的表格；`GraphScene` 显示带权边、前驱和距离；树场景通过 `variant` 区分 B+Tree 的叶子记录、BST 的节点数据与堆约束，避免复用视图时误用概念标签。

排序轨迹由输入实际计算产生，单步只展示已经推进到的快照；它不是硬编码的示例动画。其他新增策略的比较也从同一输入创建独立初始状态。数组 / 链表插入比较使用当前逻辑序列；改变算法、序列或容量时清除对应运行证据，不能继承另一个问题的完成条件。

数据表示课程使用专用指令与布尔表达式解析器，不执行用户脚本。binary32 模型在内部用 BigInt 有理数处理精确舍入，公开的 ExperimentView 只暴露字符串和数值。文件系统、页缓存与 IO 模型各自维护资源引用与事件状态，仍复用 DataScene，不共享可变状态。

完整主题范围来自 `src/data/roadmap.json`。`src/data/coverage.ts` 已为 Level 0–17 的全部主题指定真实课程入口，课程组范围见 `docs/course-delivery.md`。目录测试检查主题归属、重复映射与遗漏；未来新增但未映射的主题会显示为待补齐。这份映射说明教学覆盖，各模型的实现边界另有说明。

Java 并发、NIO、Spring / Boot、Redis、消息与分布式课程分别保留独立状态机，通过相同的控制台调度线程步骤、字节传递、代理调用、消息接纳与故障恢复。它们都在浏览器中运行，不启动真实 JVM、数据库或服务集群。容量实验计算请求的排队、CPU、DB 与分配成本；可观测性实验复用该纯模拟器，从同一次运行提取指标、Trace、线程、CPU 样本和堆时序，使诊断与复测对应实际模型执行。

流水线以每个周期完成的阶段为快照，WB 中的值已写回；其周期表与寄存器视图共享同一份模型状态。分支预测把预测与揭晓拆成两个动作，只有揭晓才读取实际结果并更新计数器。两者的对照组都从相同输入与独立初始状态运行，不改变当前单步实验；修改输入会清除当前进度和对照结果。

数值输入在完整整数编辑时同步模型，空值可以作为编辑中的草稿；文本输入在提交编辑后转换。所有模型仍独立验证动作与数值范围。每个 Session 最多展示最近 60 条日志，切换学习模式不重建 Session；切换课程重新建立实验，完成记录单独保留。

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
