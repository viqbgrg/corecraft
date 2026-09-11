## Problem · 声明与实际对象可以被错误代码分离

`List<String>` 的正常使用不应加入 Integer。但遗留 raw List 或未检查转换可能绕过编译期约束，造成读取时 ClassCastException。

与此同时，ArrayList 的一次 add 可能复制整个已有数组，HashMap 的两个不同键也可能进入同一桶。类型安全和结构成本需要分开观察。

## Why · 接口先承诺语义，结构再决定成本

Collection 表达元素集合族。List 有顺序、位置和重复项；Set 不保留相等的重复元素；Map 独立于 Collection，关联唯一键与值。ArrayList 是引用数组，HashSet 常借助 HashMap 的键实现去重。这里的 String 比较稳定，现实可变对象作为键时，修改影响 equals / hashCode 的字段会破坏查找假设。

Java 泛型主要提供编译期类型检查，类型参数通常不能是 int 等原始类型，需使用 Integer 等包装类。`List<Integer>` 也不是 `List<Number>` 的子类型；读取生产者与写入消费者可用有界通配符表达。类型擦除不是删除所有泛型信息，反射仍可能读到声明中的签名元数据，但普通容器对象不会对每次 raw 写入自动执行完整元素类型校验。

## Mechanism · 三种结构与两个检查时点

ArrayList 从容量 2 开始，空间耗尽时按约 1.5 倍增长并复制已有引用；size 与 capacity 不同。删除下标需要搬移后缀，通常不自动缩容。

HashMap 计算 Java String.hashCode，做高低位扰动，再按 2 的幂容量定位桶。同 hash 不代表 equals：Aa 与 BB 的 hashCode 都为 2112，仍是两个键。桶内链式比较处理碰撞，超过 0.75 负载阈值时容量翻倍并重分布。相同键再次 put 只替换值。HashSet 使用对应键与 PRESENT 标记，因此重复 add 不增加 size。

带泛型检查的调用点拒绝 Integer 写入 String 容器。raw 写入允许存入对象，但读取到 String 变量时需要转换。迭代器记录 modCount，容器外结构修改后 next 报错；替换现有 Map 值或 Set 重复 add 不构成结构修改。

## Experiment · 扩容、碰撞、污染

1. 默认 ArrayList 连续添加三项，观察容量 2→3，复制两条引用。
2. 把类型设为 Integer、值设为 7，普通写入被拒绝。
3. 改成 raw 调用点，再写入；选择下标 3 读取，得到 ClassCastException。
4. 切换 HashMap、类型改回 String，分别写键 Aa 与 BB。一个桶中保留两项，完成目标。
5. 多加不同键观察扩容，按键读取仍返回对应值。切换 Set 重复添加同一字符串，size 不变。
6. 建立迭代器后添加新键，再 next；对比只替换现有 Map 值的情况。不要用 ConcurrentModificationException 是否出现推断线程安全。

## Conclusion · 运行时错误常来自更早的未检查操作

这是最多 16 项的非并发容器模型，使用链式桶，没有实现 HashMap 红黑树化、null 键值、自动缩容或每个 JDK 版本的细节。迭代顺序只是当前桶布局，不是 HashMap API 的稳定顺序承诺。

遇到类型转换失败，回溯对象被写入的位置；评估集合性能，核对访问模式、容量与碰撞。它们分别属于类型规则和存储机制。
