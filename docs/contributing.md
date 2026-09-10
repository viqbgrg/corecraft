# 贡献指南

欢迎把一个难理解的计算机原理，变成能亲手验证的实验。

## 先提问题

描述用户的困惑、已有错误直觉、机制解决的问题，以及用户通过什么操作能够看到证据。例如：让最后一个 ACK 丢失，观察两端的 TCP 状态为什么不同。

## 再设计模型

- 写清输入、状态、可执行动作、不变量和模型的边界。
- 不用随机动画代替状态转换；不硬编码预设答案来伪装算法。
- 课程正文用 Markdown，数据用 Course / Concept / ExperimentDefinition。
- 原理算法与 Vue 展示分离，优先共享已有控制台与可视化。
- 复杂模型测试成功路径、失败路径和状态不变量；样式改动用浏览器检查。
- 保证键盘操作、语义标签、窄屏可用和减少动态效果偏好。

## 本地开发

需要 Node.js 24 和 npm。

```sh
npm ci
npm run dev
npm test
npm run format:check
npm run build
npm run test:e2e
```

浏览器测试首次运行前执行 `npx playwright install chromium --only-shell`。提交信息用英文，例如 `feat: add page replacement experiment`。贡献以 MIT 许可证发布。请勿在代码、提交或 issue 中放入 token、密钥和个人数据。

使用 `npm run format` 统一格式；CI 会检查格式、模型、类型与浏览器行为。依赖锁定到公开 npm registry，项目配置不包含认证信息。
