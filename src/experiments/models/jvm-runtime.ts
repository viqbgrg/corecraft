import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type ClassPhase =
  'unloaded' | 'loaded' | 'verified' | 'prepared' | 'resolved' | 'initialized' | 'erroneous'
export interface LayoutSegment {
  name: string
  offset: number
  bytes: number
  alignment: number
}
export interface ObjectLayout {
  segments: LayoutSegment[]
  size: number
}
export interface RuntimeFrame {
  pc: number
  stack: number[]
  local: number | null
  returned: number | null
}
export interface JvmRuntimeState {
  phase: ClassPhase
  program: 'valid' | 'bad-return'
  dependency: boolean
  initFails: boolean
  input: number
  profile: 'compressed' | 'wide'
  ints: number
  refs: number
  staticSeed: number | null
  initCount: number
  metadataBytes: number
  frame: RuntimeFrame | null
  heap: { id: number; offset: number; size: number }[]
  verification: string[]
  comparison: { profile: string; layout: ObjectLayout }[]
  preparedZero: boolean
  executed: boolean
  error: string | null
  log: Observation[]
}
export function objectLayout(ints: number, refs: number, compressed: boolean): ObjectLayout {
  const segments: LayoutSegment[] = [],
    pointer = compressed ? 4 : 8
  let offset = 0
  const put = (name: string, bytes: number, alignment: number) => {
    const pad = (alignment - (offset % alignment)) % alignment
    if (pad) {
      segments.push({ name: '字段对齐填充', offset, bytes: pad, alignment: 1 })
      offset += pad
    }
    segments.push({ name, offset, bytes, alignment })
    offset += bytes
  }
  put('Mark Word', 8, 8)
  put('Klass 指针', pointer, pointer)
  for (let i = 0; i < ints; i++) put(`int field${i}`, 4, 4)
  for (let i = 0; i < refs; i++) put(`reference ref${i}`, pointer, pointer)
  const padding = (8 - (offset % 8)) % 8
  if (padding) {
    segments.push({ name: '对象尾部对齐', offset, bytes: padding, alignment: 1 })
    offset += padding
  }
  return { segments, size: offset }
}
export function runtimeProgram(s: Pick<JvmRuntimeState, 'input' | 'program'>): string[] {
  return [
    'getstatic seed:I',
    `bipush ${s.input}`,
    'iadd',
    'istore_0',
    'iload_0',
    s.program === 'valid' ? 'ireturn' : 'areturn',
  ]
}
export function verifyRuntimeProgram(program: string[]): {
  valid: boolean
  trace: string[]
  reason: string | null
} {
  const stack: ('int' | 'ref')[] = [],
    trace: string[] = []
  let local: 'int' | null = null,
    returned = false
  try {
    const pop = (expected: 'int' | 'ref') => {
      const actual = stack.pop()
      if (actual !== expected) throw new Error(`需要 ${expected}，栈顶为 ${actual ?? '空栈'}`)
    }
    for (const [pc, instruction] of program.entries()) {
      if (returned) throw new Error('本直线方法不允许 return 之后继续执行')
      if (instruction === 'getstatic seed:I' || /^bipush -?\d+$/.test(instruction)) stack.push('int')
      else if (instruction === 'iadd') {
        pop('int')
        pop('int')
        stack.push('int')
      } else if (instruction === 'istore_0') {
        pop('int')
        local = 'int'
      } else if (instruction === 'iload_0') {
        if (local !== 'int') throw new Error('局部变量 0 尚未初始化为 int')
        stack.push('int')
      } else if (instruction === 'ireturn') {
        pop('int')
        if (stack.length) throw new Error('教学方法返回时必须清空操作数栈')
        returned = true
      } else if (instruction === 'areturn') {
        pop('ref')
        throw new Error('方法描述符返回 int，不能 areturn')
      } else throw new Error('不支持的教学指令')
      trace.push(`${pc}: ${instruction} → 类型栈 [${stack.join(', ')}]`)
    }
    if (!returned) throw new Error('方法缺少返回')
    return { valid: true, trace, reason: null }
  } catch (error) {
    return { valid: false, trace, reason: error instanceof Error ? error.message : '类型验证失败' }
  }
}
export function initialJvmRuntime(): JvmRuntimeState {
  return {
    phase: 'unloaded',
    program: 'valid',
    dependency: true,
    initFails: false,
    input: 5,
    profile: 'compressed',
    ints: 1,
    refs: 1,
    staticSeed: null,
    initCount: 0,
    metadataBytes: 0,
    frame: null,
    heap: [],
    verification: [],
    comparison: [],
    preparedZero: false,
    executed: false,
    error: null,
    log: [],
  }
}
export function runtimeTransition(state: JvmRuntimeState, a: ExperimentAction): JvmRuntimeState {
  if (state.phase === 'unloaded') {
    if (a.type === 'program' && ['valid', 'bad-return'].includes(String(a.value)))
      return { ...state, program: a.value as JvmRuntimeState['program'], error: null }
    if (a.type === 'profile' && ['compressed', 'wide'].includes(String(a.value)))
      return { ...state, profile: a.value as JvmRuntimeState['profile'], error: null }
    if (['dependency', 'initFails'].includes(a.type) && ['yes', 'no'].includes(String(a.value)))
      return { ...state, [a.type]: a.value === 'yes', error: null }
    if (['input', 'ints', 'refs'].includes(a.type)) {
      const value = boundedInteger(
        a.value,
        a.type === 'input' ? -100 : a.type === 'ints' ? 1 : 0,
        a.type === 'input' ? 100 : 4,
      )
      return value === null ? state : { ...state, [a.type]: value, error: null }
    }
  }
  if (a.type === 'compare-layout')
    return {
      ...state,
      comparison: [
        { profile: '压缩引用 + 压缩 Klass', layout: objectLayout(state.ints, state.refs, true) },
        { profile: '宽引用 + 宽 Klass', layout: objectLayout(state.ints, state.refs, false) },
      ],
      log: addLog(
        state.log,
        '同字段的布局对照',
        '两个示意配置都使用 8 字节对象对齐；压缩普通引用与压缩类指针在真实 VM 中是可分别配置的机制。',
      ),
    }
  if (
    !['load', 'verify', 'prepare', 'resolve', 'initialize', 'allocate', 'start', 'step', 'run'].includes(
      a.type,
    )
  )
    return state
  const s = structuredClone(state)
  s.error = null
  let detail = ''
  if (a.type === 'load' && s.phase === 'unloaded') {
    s.phase = 'loaded'
    s.metadataBytes = 64
    detail = '读取固定教学类定义，建立方法和字段元数据；Metaspace 示意占用 64 B，静态 seed 尚未准备。'
  } else if (a.type === 'verify' && s.phase === 'loaded') {
    const verified = verifyRuntimeProgram(runtimeProgram(s))
    s.verification = verified.trace
    if (!verified.valid) {
      s.error = `VerifyError：${verified.reason}`
      detail = s.error
    } else {
      s.phase = 'verified'
      detail = '直线方法的操作数类型、局部变量与返回类型验证通过；尚未运行方法。'
    }
  } else if (a.type === 'prepare' && s.phase === 'verified') {
    s.staticSeed = 0
    s.phase = 'prepared'
    s.preparedZero = true
    detail =
      '准备阶段为普通静态 int seed 建立默认值 0；源码中的 seed=7 留到类初始化。ConstantValue 常量有不同规则，本课不使用它。'
  } else if (a.type === 'resolve' && s.phase === 'prepared') {
    if (!s.dependency) {
      s.error = 'NoClassDefFoundError：教学常量池中的 Box 依赖无法解析。'
      detail = s.error
    } else {
      s.phase = 'resolved'
      detail = '把教学常量池中的符号引用解析到固定字段与 Box 类。这里选择提前解析，真实 JVM 可以延迟解析。'
    }
  } else if (a.type === 'initialize' && ['resolved', 'initialized', 'erroneous'].includes(s.phase)) {
    if (s.phase === 'erroneous') {
      s.error = 'NoClassDefFoundError：类此前初始化失败，当前 ClassLoader 中不能再次正常初始化。'
      detail = s.error
    } else if (s.phase === 'initialized') detail = '这个类已经成功初始化，不再次执行静态初始化器。'
    else {
      s.initCount++
      if (s.initFails) {
        s.phase = 'erroneous'
        s.error = 'ExceptionInInitializerError：静态初始化器抛出异常，类进入错误状态。'
        detail = s.error
      } else {
        s.staticSeed = 7
        s.phase = 'initialized'
        detail = '<clinit> 将 seed 写为 7；类初始化完成，后续主动使用不重复执行它。'
      }
    }
  } else if (a.type === 'allocate' && s.phase === 'initialized') {
    const layout = objectLayout(s.ints, s.refs, s.profile === 'compressed'),
      offset = s.heap.reduce((sum, object) => sum + object.size, 0)
    if (offset + layout.size > 128) {
      s.error = 'OutOfMemoryError：128 B 教学堆没有足够空间；栈与 Metaspace 是另行管理的区域。'
      detail = s.error
    } else {
      s.heap.push({ id: s.heap.length + 1, offset, size: layout.size })
      detail = `在教学堆偏移 ${offset} 分配 ${layout.size} B 对象；引用字段默认为 null，int 字段默认为 0。`
    }
  } else if (['start', 'step', 'run'].includes(a.type) && s.phase === 'initialized') {
    if (a.type === 'start') {
      if (s.frame && s.frame.returned === null) return state
      s.frame = { pc: 0, stack: [], local: null, returned: null }
      detail = '创建 sum() 栈帧：PC=0，操作数栈为空，局部变量 0 未赋值。'
    } else {
      s.frame ??= { pc: 0, stack: [], local: null, returned: null }
      if (s.frame.returned !== null) return state
      const frame = s.frame,
        code = runtimeProgram(s),
        budget = a.type === 'run' ? code.length : 1
      for (let i = 0; i < budget && frame.returned === null; i++) {
        const instruction = code[frame.pc++]!
        if (instruction.startsWith('getstatic')) frame.stack.push(s.staticSeed!)
        else if (instruction.startsWith('bipush')) frame.stack.push(s.input)
        else if (instruction === 'iadd') {
          const right = frame.stack.pop()!,
            left = frame.stack.pop()!
          frame.stack.push((left + right) | 0)
        } else if (instruction === 'istore_0') frame.local = frame.stack.pop()!
        else if (instruction === 'iload_0') frame.stack.push(frame.local!)
        else {
          frame.returned = frame.stack.pop()!
          s.executed = true
        }
        detail = `${instruction}：PC=${frame.pc}，操作数=[${frame.stack.join(', ')}]，local0=${frame.local ?? '未初始化'}${frame.returned === null ? '' : `；返回 ${frame.returned}，活动帧结束`}。`
        s.log = addLog(s.log, '执行字节码', detail)
      }
      return s
    }
  } else return state
  s.log = addLog(s.log, a.type, detail, s.error ? 'warning' : 'neutral')
  return s
}
export function presentJvmRuntime(s: JvmRuntimeState): ExperimentView {
  const layout = objectLayout(s.ints, s.refs, s.profile === 'compressed'),
    used = s.heap.reduce((sum, object) => sum + object.size, 0),
    reached = s.preparedZero && s.executed && s.heap.length > 0 && s.comparison.length === 2,
    configurable = s.phase === 'unloaded'
  return {
    scene: {
      kind: 'data',
      title: '类生命周期与运行时区域分别推进',
      cards: [
        { id: 'class', label: '类阶段', value: s.phase },
        { id: 'static', label: '普通静态字段 seed', value: s.staticSeed ?? '尚未准备' },
        {
          id: 'stack',
          label: 'sum() 操作数栈',
          value: `[${s.frame?.stack.join(', ') ?? ''}]`,
          detail:
            s.frame?.returned !== null && s.frame ? '保留的是已返回帧的观察快照' : '线程私有的方法执行状态',
        },
      ],
      tables: [
        {
          id: 'jvm-bytecode',
          title: 'int sum() / 固定直线方法',
          columns: ['PC', '字节码', '执行位置'],
          rows: runtimeProgram(s).map((instruction, i) => ({
            id: String(i),
            values: [i, instruction, s.frame?.pc === i && s.frame.returned === null ? '下一条' : ''],
            tone: s.frame?.pc === i ? 'success' : 'neutral',
          })),
        },
        {
          id: 'jvm-verifier',
          title: '验证器的类型栈证据',
          columns: ['检查步骤'],
          rows: s.verification.map((detail, i) => ({ id: String(i), values: [detail] })),
        },
        {
          id: 'jvm-layout',
          title: `经典 64 位对象布局示意 / ${layout.size} B`,
          columns: ['片段', '起始偏移', '长度', '对齐'],
          rows: layout.segments.map((segment, i) => ({
            id: String(i),
            values: [segment.name, segment.offset, segment.bytes, segment.alignment],
          })),
        },
        {
          id: 'jvm-heap',
          title: 'Java Heap / 与类元数据分离',
          columns: ['对象', '偏移', '占用字节'],
          rows: s.heap.map((object) => ({
            id: String(object.id),
            values: [`O${object.id}`, object.offset, object.size],
          })),
        },
        {
          id: 'jvm-layout-comparison',
          title: '相同字段与对齐，不同引用配置',
          columns: ['配置', '对象总字节'],
          rows: s.comparison.map((entry, i) => ({
            id: String(i),
            values: [entry.profile, entry.layout.size],
          })),
        },
      ],
      caption:
        '教学类加载器和直线字节码子集，不解析 .class，验证器不是完整 JVMS 验证器。Metaspace 64 B 与 Heap 128 B 是示意容量。经典 64 位 Mark / Klass 头、声明次序字段布局、8 B 对齐；不涵盖 compact object headers、真实字段重排、TLAB 或所有 VM。静态值单独展示，不声称其物理存储位于 Metaspace。',
    },
    metrics: [
      { label: 'Metaspace 元数据示意', value: s.metadataBytes, unit: 'B' },
      { label: 'Heap 已用 / 容量', value: `${used} / 128 B` },
      { label: '当前 PC', value: s.frame?.pc ?? '未调用' },
      { label: '方法返回值', value: s.frame?.returned ?? '未返回' },
      { label: '类初始化尝试次数', value: s.initCount },
    ],
    controls: [
      {
        id: 'program',
        kind: 'select',
        label: '待验证的 sum 字节码',
        value: s.program,
        disabled: !configurable,
        options: [
          { value: 'valid', label: '正确 int 返回' },
          { value: 'bad-return', label: '错误 areturn / 引用返回' },
        ],
      },
      {
        id: 'input',
        kind: 'number',
        label: 'bipush 加数',
        value: s.input,
        min: -100,
        max: 100,
        disabled: !configurable,
      },
      {
        id: 'dependency',
        kind: 'select',
        label: 'Box 依赖可解析',
        value: s.dependency ? 'yes' : 'no',
        disabled: !configurable,
        options: [
          { value: 'yes', label: '存在' },
          { value: 'no', label: '缺失' },
        ],
      },
      {
        id: 'initFails',
        kind: 'select',
        label: '静态初始化器抛错',
        value: s.initFails ? 'yes' : 'no',
        disabled: !configurable,
        options: [
          { value: 'no', label: '正常 seed=7' },
          { value: 'yes', label: '抛出异常' },
        ],
      },
      {
        id: 'profile',
        kind: 'select',
        label: '对象布局示意配置',
        value: s.profile,
        disabled: !configurable,
        options: [
          { value: 'compressed', label: '普通引用与 Klass 指针均压缩' },
          { value: 'wide', label: '两种引用都采用宽指针' },
        ],
      },
      {
        id: 'ints',
        kind: 'number',
        label: 'int 字段数',
        value: s.ints,
        min: 1,
        max: 4,
        disabled: !configurable,
      },
      {
        id: 'refs',
        kind: 'number',
        label: '引用字段数',
        value: s.refs,
        min: 0,
        max: 4,
        disabled: !configurable,
      },
      {
        id: 'load',
        kind: 'button',
        label: '加载教学类元数据',
        primary: true,
        disabled: s.phase !== 'unloaded',
      },
      { id: 'verify', kind: 'button', label: '验证字节码类型', disabled: s.phase !== 'loaded' },
      { id: 'prepare', kind: 'button', label: '准备静态字段默认值', disabled: s.phase !== 'verified' },
      { id: 'resolve', kind: 'button', label: '解析常量池依赖', disabled: s.phase !== 'prepared' },
      {
        id: 'initialize',
        kind: 'button',
        label: '主动使用 / 初始化类',
        disabled: !['resolved', 'initialized', 'erroneous'].includes(s.phase),
      },
      {
        id: 'allocate',
        kind: 'button',
        label: '在 Java 堆分配一个对象',
        disabled: s.phase !== 'initialized',
      },
      {
        id: 'start',
        kind: 'button',
        label: '创建 sum 方法栈帧',
        disabled: s.phase !== 'initialized' || (!!s.frame && s.frame.returned === null),
      },
      {
        id: 'step',
        kind: 'button',
        label: '解释执行一条字节码',
        disabled: s.phase !== 'initialized' || (!!s.frame && s.frame.returned !== null),
      },
      {
        id: 'run',
        kind: 'button',
        label: '解释执行到方法返回',
        disabled: s.phase !== 'initialized' || (!!s.frame && s.frame.returned !== null),
      },
      { id: 'compare-layout', kind: 'button', label: '对比相同字段的两种对象布局' },
    ],
    status: {
      title: s.error
        ? 'JVM 阶段报告错误'
        : reached
          ? '准备、初始化、执行与分配有各自状态'
          : '从类的类型信息开始，再进入执行引擎',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '依次加载、验证、准备、解析与初始化，分配对象并运行 sum，最后比较对象头与字段布局。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '观察准备时的 0 与初始化后的 7，执行 sum 返回结果、分配对象，并比较两种引用布局。',
      reached,
    },
    log: s.log,
  }
}
export const runtimeEngine: EngineFactory = () =>
  createSession(initialJvmRuntime, runtimeTransition, presentJvmRuntime)
