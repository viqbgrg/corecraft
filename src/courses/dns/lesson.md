## Problem · 不能让一个服务器记住所有名字

互联网的名字由不同组织维护，记录会改变，查询也很多。既要分散管理，还要让任何查询者找到负责这个名字的人。

## Why · 管理权逐层委派

DNS 的树形命名空间把职责拆开：根知道顶级域的服务器，顶级域知道下一级权威服务器，权威服务器维护最终记录。**转介告诉你应该问谁，不一定直接给目标 IP。**

## Mechanism · 递归解析器代你完成迭代

Browser / Stub 把请求交给 Local DNS（本课指递归解析器）。递归解析器分别询问 Root、TLD、Authoritative，并跟随转介；根不会替浏览器直接去问所有下游。

有效缓存让解析器跳过上游查询。TTL 到期需要刷新。NXDOMAIN 表示名称不存在，也能按权威的负缓存信息暂存。

## Experiment · 相同问题，不同路径

1. 点击每一步完成一次冷查询，观察实际请求发起者。
2. 再查同一个域名，两步就能完成：应用请求、缓存响应。
3. 推进两次 30 s，令 60 s TTL 到期，再查一次。
4. 切换到 missing.corecraft.test，观察 NXDOMAIN 与 30 s 负缓存。

## Conclusion · 缓存与委派一起支撑规模

这里使用隔离的 .test 教学域与文档示例地址，不进行真实 DNS 请求。只缓存最终记录，省略 NS / glue 缓存、CNAME、DNSSEC、浏览器和 OS 的独立缓存，以及 UDP / TCP 传输细节。

参考：[RFC 1034](https://www.rfc-editor.org/rfc/rfc1034.html)、[RFC 2308](https://www.rfc-editor.org/rfc/rfc2308.html)。
