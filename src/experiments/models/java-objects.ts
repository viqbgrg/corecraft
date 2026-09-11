import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export interface JavaBox {
  id: number
  className: 'Box'
  value: number
}
export interface JavaFrame {
  name: 'main' | 'change'
  refs: Record<string, number | null>
  callerArgument?: number
}
export interface JavaObjectsState {
  heap: JavaBox[]
  stack: JavaFrame[]
  nextId: number
  value: number
  selected: string
  sharedMutation: boolean
  localRebind: boolean
  returned: boolean
  error: string | null
  log: Observation[]
}
export function initialJavaObjects(): JavaObjectsState {
  return {
    heap: [],
    stack: [{ name: 'main', refs: { a: null, b: null } }],
    nextId: 1,
    value: 10,
    selected: 'a',
    sharedMutation: false,
    localRebind: false,
    returned: false,
    error: null,
    log: [],
  }
}
export function reachableBoxes(s: JavaObjectsState): number[] {
  return [
    ...new Set(
      s.stack.flatMap((frame) => Object.values(frame.refs)).filter((id): id is number => id !== null),
    ),
  ]
}
export function objectsTransition(state: JavaObjectsState, a: ExperimentAction): JavaObjectsState {
  if (a.type === 'value') {
    const value = boundedInteger(a.value, -99, 999)
    return value === null ? state : { ...state, value, error: null }
  }
  if (a.type === 'selected' && ['a', 'b', ...(state.stack.length > 1 ? ['p'] : [])].includes(String(a.value)))
    return { ...state, selected: String(a.value), error: null }
  if (!['allocate', 'alias', 'call', 'mutate', 'rebind', 'return', 'clear'].includes(a.type)) return state
  const s = structuredClone(state),
    main = s.stack[0]!,
    frame = s.selected === 'p' ? s.stack.at(-1)! : main
  const allocate = () => {
    const id = s.nextId++
    s.heap.push({ id, className: 'Box', value: s.value })
    return id
  }
  const fail = (error: string) => ({ ...state, error })
  s.error = null
  let detail = ''
  if (a.type === 'allocate') {
    if (s.stack.length > 1) return fail('先返回 main，再重新分配调用者的 a。')
    if (s.heap.length >= 12) return fail('教学堆最多 12 个对象；重置实验后可继续。')
    main.refs.a = allocate()
    s.selected = 'a'
    detail = `new Box(${s.value}) 分配 O${main.refs.a}，a 保存引用值；对象字段不在变量 a 的栈槽中。`
  } else if (a.type === 'alias') {
    if (s.stack.length > 1) return fail('main 暂停在调用处；返回后才能执行 b = a。')
    main.refs.b = main.refs.a!
    detail = `b = a 复制引用 ${main.refs.a === null ? 'null' : `O${main.refs.a}`}，没有复制 Box 对象。`
  } else if (a.type === 'call') {
    if (s.stack.length > 1) return state
    s.stack.push({ name: 'change', refs: { p: main.refs.a! }, callerArgument: main.refs.a ?? undefined })
    s.selected = 'p'
    detail = `调用 change(a)，新栈帧 p 接收引用值 ${main.refs.a === null ? 'null' : `O${main.refs.a}`} 的副本；main 帧暂停但仍保留。`
  } else if (a.type === 'mutate') {
    if (s.stack.length > 1 && s.selected !== 'p')
      return fail('change 执行期间只能通过它的参数 p 访问对象；main 栈帧尚未恢复。')
    const id = frame.refs[s.selected],
      box = s.heap.find((box) => box.id === id)
    if (!box) return fail(`${s.selected} 为 null，读取字段会抛出 NullPointerException；堆没有被修改。`)
    const before = box.value
    box.value = s.value
    s.sharedMutation ||= main.refs.a === id && main.refs.b === id && before !== s.value
    detail = `${s.selected}.value = ${s.value} 修改 O${id} 的字段（之前 ${before}）。指向同一对象的引用都能在顺序执行中观察到它。`
  } else if (a.type === 'rebind') {
    if (s.stack.length < 2) return fail('先调用 change(a)，才能修改参数 p 的绑定。')
    if (s.heap.length >= 12) return fail('教学堆最多 12 个对象；重置实验后可继续。')
    const helper = s.stack[1]!,
      caller = main.refs.a
    helper.refs.p = allocate()
    s.selected = 'p'
    s.localRebind ||= caller !== null && caller === helper.callerArgument && helper.refs.p !== caller
    detail = `p = new Box(${s.value}) 只改 change 帧的局部引用为 O${helper.refs.p}；main.a 仍为 ${caller === null ? 'null' : `O${caller}`}。`
  } else if (a.type === 'return') {
    if (s.stack.length < 2) return state
    s.stack.pop()
    s.selected = 'a'
    s.returned ||= s.localRebind
    detail = 'change 返回，栈帧与局部参数 p 消失。堆对象是否可回收由可达性决定，不由方法返回直接删除。'
  } else {
    if (s.stack.length > 1 && s.selected !== 'p')
      return fail('main 正在等待 change 返回，不能修改它的局部变量。')
    frame.refs[s.selected] = null
    detail = `${s.selected} = null 只移除这一条引用。其他引用仍可保持对象可达；此处没有执行 GC。`
  }
  s.log = addLog(s.log, a.type, detail)
  return s
}
export function presentJavaObjects(s: JavaObjectsState): ExperimentView {
  const reached = s.sharedMutation && s.localRebind && s.returned,
    reachable = reachableBoxes(s),
    helper = s.stack.length > 1
  return {
    scene: {
      kind: 'data',
      title: '栈帧保存局部引用，堆对象可以被多个引用共享',
      tables: [
        {
          id: 'java-class-metadata',
          title: '共享的类元数据 / Method Area 的逻辑职责',
          columns: ['Class', '实例字段', '方法'],
          rows: [{ id: 'Box', values: ['Box', 'int value', '构造器 Box(int)、change(Box) 为教学调用'] }],
        },
        {
          id: 'java-stack',
          title: '当前线程栈 / 顶层帧最后进入',
          columns: ['栈帧', '局部变量', '引用值', '解引用字段'],
          rows: s.stack.flatMap((frame) =>
            Object.entries(frame.refs).map(([name, ref]) => ({
              id: `${frame.name}-${name}`,
              values: [
                frame.name,
                name,
                ref === null ? 'null' : `O${ref}`,
                ref === null ? '不可解引用' : s.heap.find((box) => box.id === ref)!.value,
              ],
            })),
          ),
        },
        {
          id: 'java-heap',
          title: '堆中的对象 / 尚未执行 GC',
          columns: ['对象身份', 'Class', 'value', '从栈可达'],
          rows: s.heap.map((box) => ({
            id: String(box.id),
            values: [
              `O${box.id}`,
              box.className,
              box.value,
              reachable.includes(box.id) ? '是' : '否 / 可供 GC 判断',
            ],
            tone: reachable.includes(box.id) ? 'neutral' : 'warning',
          })),
        },
      ],
      caption:
        '顺序 Java 引用语义模型，不执行 Java 字节码。对象身份用编号，不代表物理地址；忽略继承、字段引用、JIT 标量替换和完整 GC。Method Area 是规范层的逻辑区域，HotSpot 的实际元数据和 Class 对象布局在 JVM 课展开。',
    },
    metrics: [
      { label: '当前执行方法', value: s.stack.at(-1)!.name },
      { label: '栈帧数', value: s.stack.length },
      { label: '已分配 Box', value: s.heap.length },
      { label: '栈可达 Box', value: reachable.length },
    ],
    controls: [
      { id: 'value', kind: 'number', label: 'Box 字段新值', value: s.value, min: -99, max: 999 },
      {
        id: 'selected',
        kind: 'select',
        label: '操作的引用变量',
        value: s.selected,
        options: ['a', 'b', ...(helper ? ['p'] : [])].map((name) => ({ value: name, label: name })),
      },
      { id: 'allocate', kind: 'button', label: 'main · a = new Box(value)', primary: true, disabled: helper },
      { id: 'alias', kind: 'button', label: 'main · b = a', disabled: helper },
      { id: 'call', kind: 'button', label: '调用 change(a) · 参数复制', disabled: helper },
      { id: 'mutate', kind: 'button', label: '通过引用修改对象字段' },
      { id: 'rebind', kind: 'button', label: 'change · p = new Box(value)', disabled: !helper },
      { id: 'return', kind: 'button', label: 'change 返回并弹出栈帧', disabled: !helper },
      { id: 'clear', kind: 'button', label: '当前引用赋为 null' },
    ],
    status: {
      title: s.error
        ? '引用操作不能完成'
        : reached
          ? '复制引用与复制对象产生不同结果'
          : 'Java 参数按值传递，值也可以是引用',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先分配 Box 并执行 b=a，再调用 change(a)，修改字段后重绑参数，观察调用者。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '让 a / b 观察到同一次字段修改，再只重绑方法参数并返回，证明调用者引用未被替换。',
      reached,
    },
    log: s.log,
  }
}
export const objectsEngine: EngineFactory = () =>
  createSession(initialJavaObjects, objectsTransition, presentJavaObjects)
