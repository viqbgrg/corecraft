## Problem · 计数、队列、字段和排名需要不同操作

计数器要原子自增，工作列表需要从一端入另一端出，用户资料需要按字段修改，标签要去重，排行榜要按分数定位。Redis 在键下面提供不同的值类型与命令契约。

## Why · 逻辑类型与物理编码分开

String 保存字节内容，也支持满足条件的整数运算；List 是有序序列；Hash 是字段到值的映射；Set 是无序唯一成员集合；ZSet 为唯一成员关联分数并保持排序。

这些是用户可依赖的逻辑能力。真实 Redis 根据类型、长度与版本使用不同编码，例如 listpack、quicklist、字典或跳表，不能把每个 ZSet 都画成永远相同的底层结构。

## Mechanism · 返回值也属于协议

INCR 将合法有符号 64 位整数增加一，超范围或非整数拒绝。LPUSH 从左入，RPOP 从右出可组成 FIFO；最后一项弹出后空 List 键消失。HSET 的默认返回值是新增字段数，覆盖原字段不增加数量。SADD 已有成员返回零，Set 不承诺排序。

本课 ZSet 用四层真实跳表：底层包含全部成员，上层跳过部分节点。从高层沿 score/member 顺序前进，遇到不能越过的节点后下降，收集前驱并接入新节点。固定种子生成层高，便于重现实验。修改分数先脱开旧链接，再接到新位置，成员身份仍唯一。

Redis 同分成员按字节序排序。本模型将 member 限制为 ASCII 字母数字以消除 locale 比较歧义。SET 可以整体覆盖原键为 String，其他类型命令遇到错误类型返回 WRONGTYPE。

## Experiment · 一组命令检验五类值

1. SET counter 5，再 INCR，返回 6。
2. LPUSH jobs A，再 LPUSH jobs B，RPOP 返回 A，剩余 B。
3. HSET user name Ada，再 HGET，读到 Ada。
4. 对 tags 连续 SADD java 两次，返回 1、0，成员不重复。
5. 对 rank 执行 ZADD：Alice:10、Bob:5、Carol:10。ZRANGE 得到 Bob、Alice、Carol。
6. 将 Alice 更新到 3，再 ZRANGE，得到 Alice、Bob、Carol，观察指针变化并达到目标。

## Conclusion · 先选契约，再看编码

键空间、成员数量与文本长度有教学上限。跳表搜索真实维护链接，但节点元数据查找使用 JavaScript 结构，不以实际 JS 耗时声称 Redis 性能。省略跳表跨度、排名复杂度优化和真实内存编码切换。

根据计数、顺序、字段、唯一性、排序和范围需要选类型，再验证命令返回值与边界；不要只因为都能存字符串就忽略操作契约。
