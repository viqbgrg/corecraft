## Problem · 共享变量不是按屏幕点击顺序自动同步

writer 执行 `data = 42; ready = true;`，reader 执行 `if (ready) result = data;`。两个变量都普通时，reader 观察到 ready=true 后仍可能读到初始 data=0。

这里的“可能”是语言内存模型允许的结果，不是承诺每次运行都出现，也不是把某个 CPU Cache 的动画当作规范。

## Why · JMM 给并发程序可移植的规则

Java Memory Model 规定跨线程读写的顺序与可见性约束。它不同于讲 Heap、Stack、Metaspace 的内存区域模型。编译器优化、处理器执行和缓存协作都必须满足 JMM，但规范不要求开发者通过某个特定的缓存刷新步骤理解正确性。

没有足够同步的冲突访问形成数据竞争。程序可能在测试机器上长期看似正确，仍缺少可移植保证。正确同步让允许的结果受到明确约束。

## Mechanism · 用边与传递性判断

一个线程中的程序顺序给出 Wdata→Wflag，另一个线程给出 Rflag→Rdata。普通标志读到 true，只建立读值来源的观察，不会自动连接两条 happens-before 链。

把 ready 声明为 volatile，读者获得 writer 的 volatile 发布后，Wflag→Rflag 是同步关系；传递得到 Wdata→Rdata。本小程序只有初始写入和 writer 写入，reader 此时不能选择已被该写覆盖的初始值。

JMM 还包含监视器释放与后续获取、Thread.start 之前动作到被启动线程、线程终止与成功 join 等关系。final 字段的正确构造与发布也有专门规则，不能拿来为构造期间逸出的任意可变状态背书。后续并发课程实际操作锁、CAS 与线程任务。

本课枚举保持每个线程程序顺序的交错，并检查候选数据来源。普通模式结果包括未进入分支、进入后读 0、进入后读 42；volatile 模式保留未进入分支和读 42。见证数量不是概率。

## Experiment · 尝试一个被规范禁止的读值

1. 普通模式依次执行 writer 写 data、写 ready，reader 读 ready。
2. 保持 data 来源为初始 0，尝试读取。模型接受这个数据竞争下的旧值见证。
3. 切换为 volatile，执行相同步骤，再尝试读 0。模型拒绝它，并显示完整的 happens-before 链。
4. 把来源改为 writer 的 42，读取成功。枚举两模式结果，完成目标。
5. 重开场景后让 reader 先读 ready=false，观察 data 显示“未读”，它和“读到了 0”不是同一结果。

## Conclusion · 可见性和原子性仍要分别证明

模型仅覆盖一次写入的发布程序，没有循环、多个写者、乱序指令、完整 causality 约束或概率估计。禁止某个见证来自规则检查，不是使用浏览器线程实测 Java 行为。

volatile 能提供相应可见性与有序性，不能单独使 counter++ 的读取、计算、写回成为一个原子动作。继续学习 CAS 与锁时，仍要明确复合操作的线性化位置与冲突行为。
