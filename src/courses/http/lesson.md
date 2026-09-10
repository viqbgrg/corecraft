## Problem · 一次请求，包含不同的问题

名字要转换成地址，传输需要连接，身份与内容需要保护，应用还要处理业务。只有把这些职责分开，才能解释一次等待或失败发生在哪里。

## Why · 分层让职责可以组合

DNS 解决“去哪里”，TCP 提供可靠字节流，TLS 为字节流提供安全保护，HTTP 表达应用请求与响应。一次 HTTP 500 与一次 TCP 超时发生在不同层，排查方向也不同。

## Mechanism · 从 URL 到应用数据

本模型采用 HTTP/1.1 over TCP。HTTPS 经历 DNS → TCP → TLS → HTTP → Server → Response；http:// 跳过 TLS。TLS 用抽象的 1.3 完整握手表示。

同源存活连接能复用 TCP 和 TLS，甚至不需要重新解析 DNS。只有 DNS 缓存则仍需建立新连接。模型将连接按 origin 隔离，不会把其他站点的连接随便拿来用。

## Experiment · 找出可以省去的工作

1. 完成第一次 HTTPS 请求，再发一次，观察 Keep-Alive 跳过哪些步骤。
2. 关闭连接池，保留 DNS 缓存，再比较一次。
3. 把 URL 改为 http://corecraft.test/hello，观察 TLS 为什么跳过。
4. 分别注入 DNS、TCP、TLS 故障与 Server 500，观察前者停止后续层，后者仍返回 HTTP 响应。

## Conclusion · 耗时来自路径，也来自每层工作

所有数据与毫秒都是教学模拟，不执行 fetch、真实 DNS 或真实 TLS。DNS 缓存在本课中不计 TTL（TTL 见 DNS 课）；省略 HTTP/2、多路复用、HTTP/3、TLS 会话恢复、代理和子资源加载。每一层都是后续实验的入口。
