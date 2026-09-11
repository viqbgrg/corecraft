## Problem · Counter cannot be cast to Counter

插件和宿主都能找到名为 demo.Counter 的类，强制转换却抛出 ClassCastException。类名没拼错，问题可能在加载器。

另一个常见困惑是反射调用只报 InvocationTargetException。要定位故障，需要沿 cause 找到目标方法最初抛出的异常。

## Why · 动态扩展仍需要类型边界

ClassLoader 把类的二进制定义带入运行时。父优先委派是一种常用策略，使子加载器复用公共类型；它不是 JVM 强制所有用户加载器都必须采用的唯一算法。插件也可独立定义自己的类，但共享接口若被重复定义，类型互操作会失败。

Reflection 基于 Class 元数据查询构造器、字段与方法，常用于框架组装。它不等于禁用访问检查或类型规则。Java 模块和访问控制仍会限制反射能力，本课只开放两个 public 方法。

## Mechanism · 加载、初始化与调用分阶段

本课的 App 可定义 demo.Counter，Plugin 的父加载器是 App。父优先时 Plugin 请求解析到 `App::demo.Counter`；独立定义场景得到 `Plugin::demo.Counter`。已加载类不会因为一个选项后来改变就更换身份，所以切换委派规则会创建全新场景。

`loadClass` 在这里只加载，不触发类初始化。首次创建实例是主动使用，执行一次类初始化，再调用实例构造过程。类元数据中的 increment(int)、divide(int) 可以被检查，检查不等于执行。

反射调用 divide(0) 时，目标帧先抛出 ArithmeticException。目标方法 finally 正常执行并弹栈；Method.invoke 把目标异常包装为 InvocationTargetException，cause 保留原异常；main 的 catch 捕获包装异常后继续。若方法名不存在，getMethod 阶段就抛 NoSuchMethodException，根本没有进入目标方法。

Exception、RuntimeException 与 Error 有不同 API 和检查语义。编译器要求处理或声明受检异常；非受检异常不要求同样的声明，但同样会沿栈传播。catch 应根据可以恢复的边界处理。finally 常用于清理，但进程终止等情况不能保证执行；若 finally 自己抛错或返回，也可能改变原结果。本模型固定 finally 正常完成。

## Experiment · 先看类型，再沿栈找原因

1. 选择 Plugin，保持父优先。仅加载、检查元数据，确认 Class 未初始化。
2. 创建 Counter 实例，转换为 App 的 Counter，转换成功；多次创建仍只初始化一次。
3. 把规则切换为独立定义，新建 Plugin 实例，再转换，观察两个定义类与 ClassCastException。
4. 保持 divide 方法和参数 0，执行 Method.invoke。栈出现 main、Method.invoke、Counter.divide。
5. 连续三次传播异常，分别观察 finally、包装与 main 捕获。外层异常与 cause 都可见，完成目标。
6. 改成不存在的方法验证查找失败；再用 divide(3) 验证整数除法正常返回 3。

## Conclusion · 动态不代表没有规则

模型不解析 .class、不执行任意方法、省略模块访问、链接约束、验证器和完整类初始化失败语义。异常清理没有模拟 suppressed 列表；真实 try-with-resources 会按逆序关闭资源，并在合适情况下保留关闭异常为 suppressed。

定位实际问题时，记录类名与定义加载器，并展开异常 cause 链。仅打印最外层类名通常不足以解释这两类故障。
