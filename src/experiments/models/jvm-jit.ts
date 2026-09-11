import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type PointShape = 'Point' | 'ColoredPoint'
export interface PointObject {
  id: number
  x: number
  y: number
  shape: PointShape
}
export interface JitResult {
  label: string
  result: number
  allocations: number
  fieldReads: number
  fieldWrites: number
}
export interface JitFrame {
  index: number
  total: number
  count: number
  shape: PointShape
  compiled: boolean
  scalar: boolean
  deopt: boolean
  paused: boolean
  localRoot: number | null
  scalarFields: { x: number; y: number } | null
  allocations: number
  fieldReads: number
  fieldWrites: number
  polls: number
}
export interface JitState {
  count: number
  shape: PointShape
  escaping: boolean
  pollEvery: number
  calls: number
  profile: PointShape[]
  compiledFor: PointShape | null
  frame: JitFrame | null
  heap: PointObject[]
  escaped: number[]
  nextId: number
  safepointRequested: boolean
  pollRoots: number[]
  last: JitResult | null
  comparison: JitResult[]
  optimizedObserved: boolean
  deoptCompleted: boolean
  safepointObserved: boolean
  deopts: number
  error: string | null
  log: Observation[]
}
const contribution = (shape: PointShape, x: number, y: number) => x + y + (shape === 'ColoredPoint' ? 10 : 0)
export function evaluatePoints(
  count: number,
  shape: PointShape,
  compiled: boolean,
  escaping: boolean,
): JitResult {
  let result = 0,
    allocations = 0,
    fieldReads = 0,
    fieldWrites = 0
  const escaped: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    if (compiled && !escaping) result += contribution(shape, i, 1)
    else {
      const point = { x: i, y: 1 }
      allocations++
      fieldWrites += 2
      if (escaping) escaped.push(point)
      result += contribution(shape, point.x, point.y)
      fieldReads += 2
    }
  }
  return {
    label: compiled ? (escaping ? '已编译 / 对象逃逸' : '已编译 / 标量替换') : '解释执行 / 局部对象',
    result,
    allocations,
    fieldReads,
    fieldWrites,
  }
}
export function initialJit(): JitState {
  return {
    count: 5,
    shape: 'Point',
    escaping: false,
    pollEvery: 3,
    calls: 0,
    profile: [],
    compiledFor: null,
    frame: null,
    heap: [],
    escaped: [],
    nextId: 1,
    safepointRequested: false,
    pollRoots: [],
    last: null,
    comparison: [],
    optimizedObserved: false,
    deoptCompleted: false,
    safepointObserved: false,
    deopts: 0,
    error: null,
    log: [],
  }
}
function completeCall(s: JitState): JitState {
  const frame = s.frame!
  s.calls++
  s.profile = [...new Set([...s.profile, frame.shape])]
  s.last = {
    label: frame.compiled
      ? frame.scalar
        ? '已编译 / 标量替换'
        : '已编译 / 保留对象'
      : frame.deopt
        ? '类型守卫失败后解释执行'
        : '解释执行',
    result: frame.total,
    allocations: frame.allocations,
    fieldReads: frame.fieldReads,
    fieldWrites: frame.fieldWrites,
  }
  s.optimizedObserved ||= frame.scalar && frame.allocations === 0
  s.deoptCompleted ||= frame.deopt
  if (s.calls >= 3 && s.profile.length === 1) s.compiledFor = s.profile[0]!
  s.frame = null
  s.safepointRequested = false
  s.log = addLog(
    s.log,
    '调用返回',
    `${s.last.label}：结果 ${s.last.result}，分配 ${s.last.allocations} 个对象。${s.compiledFor ? `已有针对 ${s.compiledFor} 的教学优化代码。` : s.profile.length > 1 ? '类型画像已有多种接收者，本简化编译器不再做单类型特化。' : '继续收集类型画像。'}`,
    'success',
  )
  return s
}
export function jitTransition(state: JitState, a: ExperimentAction): JitState {
  if (!state.frame) {
    if (a.type === 'count' || a.type === 'pollEvery') {
      const value = boundedInteger(a.value, 1, a.type === 'count' ? 20 : 5)
      return value === null ? state : { ...state, [a.type]: value, comparison: [], error: null }
    }
    if (a.type === 'shape' && ['Point', 'ColoredPoint'].includes(String(a.value)))
      return { ...state, shape: a.value as PointShape, comparison: [], error: null }
    if (a.type === 'escaping' && ['local', 'escape'].includes(String(a.value)))
      return {
        ...state,
        escaping: a.value === 'escape',
        compiledFor: null,
        profile: [],
        calls: 0,
        comparison: [],
        error: null,
        log: addLog(
          state.log,
          '改变对象使用方式',
          '修改了程序是否向共享集合发布对象，清除旧编译画像；已有观察证据保留。',
        ),
      }
  }
  if (a.type === 'compare')
    return {
      ...state,
      comparison: [
        evaluatePoints(state.count, state.shape, false, false),
        evaluatePoints(state.count, state.shape, true, false),
        evaluatePoints(state.count, state.shape, true, true),
      ],
      error: null,
      log: addLog(
        state.log,
        '相同输入的执行对照',
        '三组循环次数与接收者行为相同；局部对象可标量替换，发布到共享集合的对象必须保留身份。这里比较逻辑分配，不估算真实纳秒。',
      ),
    }
  if (a.type === 'run') {
    let s = state
    for (let budget = 0; budget < state.count + 2 && s.frame && !s.frame.paused; budget++)
      s = jitTransition(s, { type: 'step' })
    return s
  }
  if (!['begin', 'step', 'request', 'resume'].includes(a.type)) return state
  const s = structuredClone(state)
  s.error = null
  if (a.type === 'begin') {
    if (s.frame) return state
    const deopt = s.compiledFor !== null && s.compiledFor !== s.shape,
      compiled = s.compiledFor === s.shape
    if (s.heap.length + (compiled && !s.escaping ? 0 : s.count) > 200)
      return { ...state, error: '教学分配轨迹最多保留 200 个对象，请重置；本课不执行实际垃圾回收。' }
    if (deopt) {
      s.deopts++
      s.compiledFor = null
      s.profile = [...new Set([...s.profile, s.shape])]
    }
    s.frame = {
      index: 0,
      total: 0,
      count: s.count,
      shape: s.shape,
      compiled,
      scalar: compiled && !s.escaping,
      deopt,
      paused: false,
      localRoot: null,
      scalarFields: null,
      allocations: 0,
      fieldReads: 0,
      fieldWrites: 0,
      polls: 0,
    }
    s.pollRoots = []
    s.safepointRequested = false
    s.log = addLog(
      s.log,
      deopt ? '接收者守卫失败' : '开始一次调用',
      deopt
        ? `代码原先只对另一接收者类型特化，当前为 ${s.shape}；在入口退回解释执行，保留正确语义。`
        : `${compiled ? '优化代码' : '解释器'}执行 ${s.count} 次循环，${compiled && !s.escaping ? 'x / y 用标量表示，不创建 Point 身份' : '保留每次 new 的对象'}。`,
      deopt ? 'warning' : 'neutral',
    )
    return s
  }
  if (!s.frame) return state
  if (a.type === 'request') {
    s.safepointRequested = true
    s.log = addLog(
      s.log,
      'VM 请求安全点',
      '请求已发出，执行线程在下一个教学轮询点检查它；发出请求不等于所有线程已经停下。',
    )
    return s
  }
  if (a.type === 'resume') {
    if (!s.frame.paused) return state
    s.frame.paused = false
    s.safepointRequested = false
    s.log = addLog(s.log, 'VM 恢复执行', '检查活动帧后结束本次安全点操作，继续循环；本课不在此执行 GC。')
    return s
  }
  const frame = s.frame
  if (frame.paused) return { ...state, error: '线程已在安全点暂停，先让 VM 恢复执行。' }
  if (frame.index === frame.count) return completeCall(s)
  const x = frame.index,
    y = 1
  if (frame.scalar) {
    frame.scalarFields = { x, y }
    frame.localRoot = null
    frame.total += contribution(frame.shape, x, y)
  } else {
    const object = { id: s.nextId++, x, y, shape: frame.shape }
    s.heap.push(object)
    frame.localRoot = object.id
    frame.allocations++
    frame.fieldWrites += 2
    frame.fieldReads += 2
    if (s.escaping) s.escaped.push(object.id)
    frame.total += contribution(object.shape, object.x, object.y)
  }
  frame.index++
  const poll = frame.index % s.pollEvery === 0 || frame.index === frame.count
  if (poll) {
    frame.polls++
    if (s.safepointRequested) {
      frame.paused = true
      s.safepointObserved = true
      s.pollRoots = frame.localRoot === null ? [] : [frame.localRoot]
      s.log = addLog(
        s.log,
        '到达教学安全点',
        `循环完成 ${frame.index}/${frame.count}；本帧引用映射 [${s.pollRoots.map((id) => `O${id}`).join(', ') || '空'}]，整数标量不是对象引用。`,
        'warning',
      )
      return s
    }
  }
  s.log = addLog(
    s.log,
    '循环执行一步',
    `i=${x}，累加结果=${frame.total}，已分配=${frame.allocations}${poll ? '；已轮询，无待处理安全点请求' : '；尚未到下一个轮询点'}。`,
  )
  return frame.index === frame.count ? completeCall(s) : s
}
export function presentJit(s: JitState): ExperimentView {
  const reached = s.optimizedObserved && s.deoptCompleted && s.safepointObserved && s.comparison.length === 3
  return {
    scene: {
      kind: 'data',
      title: '优化可以改变分配方式，但必须保持程序结果',
      cards: [
        {
          id: 'program',
          label: '固定循环模板',
          value: 'new Point(i, 1) → value() → sum',
          detail: s.escaping ? '每个新对象都加入共享集合，身份逃逸' : '对象只在当前迭代使用，字段可变成标量',
        },
        {
          id: 'compiled',
          label: '当前单类型特化',
          value: s.compiledFor ?? '尚无优化代码',
          detail: `已观察类型：${s.profile.join(', ') || '无'}；3 次调用后尝试教学编译`,
        },
        {
          id: 'pause',
          label: '安全点状态',
          value: s.frame?.paused ? '已到达并暂停' : s.safepointRequested ? '等待线程轮询' : '未请求',
        },
      ],
      tables: [
        {
          id: 'jit-active-frame',
          title: '活动循环帧 / 引用与标量分开',
          columns: ['循环位置', '累加值', '局部引用', '标量字段', '轮询次数'],
          rows: s.frame
            ? [
                {
                  id: 'frame',
                  values: [
                    `${s.frame.index}/${s.frame.count}`,
                    s.frame.total,
                    s.frame.localRoot === null ? '无对象引用' : `O${s.frame.localRoot}`,
                    s.frame.scalarFields
                      ? `x=${s.frame.scalarFields.x}, y=${s.frame.scalarFields.y}`
                      : '未标量替换',
                    s.frame.polls,
                  ],
                },
              ]
            : [],
        },
        {
          id: 'jit-allocations',
          title: '最近 12 个实际保留的分配轨迹 / 不表示都仍存活',
          columns: ['身份', '类型', 'x', 'y', '发布到共享集合'],
          rows: s.heap.slice(-12).map((object) => ({
            id: String(object.id),
            values: [
              `O${object.id}`,
              object.shape,
              object.x,
              object.y,
              s.escaped.includes(object.id) ? '是' : '否',
            ],
          })),
        },
        {
          id: 'jit-last-call',
          title: '最近完成的调用',
          columns: ['路径', '返回值', '分配', '字段读取', '字段写入'],
          rows: s.last
            ? [
                {
                  id: 'last',
                  values: [
                    s.last.label,
                    s.last.result,
                    s.last.allocations,
                    s.last.fieldReads,
                    s.last.fieldWrites,
                  ],
                },
              ]
            : [],
        },
        {
          id: 'jit-comparison',
          title: '相同输入下分别执行解释 / 标量 / 逃逸三组',
          columns: ['路径', '结果', '分配', '字段读取', '字段写入'],
          rows: s.comparison.map((entry, i) => ({
            id: String(i),
            values: [entry.label, entry.result, entry.allocations, entry.fieldReads, entry.fieldWrites],
          })),
        },
      ],
      caption:
        'JIT / 逃逸分析的固定程序模型，不运行 HotSpot 编译器、不测真实时延。3 次阈值、轮询间隔和单类型策略是教学参数。标量替换不等于一般的“对象搬到栈”；类型失效在入口去优化，不模拟在栈替换或物化中途对象。Safepoint 仅一个线程，引用映射示意不替代完整 OopMap / GC Roots。',
    },
    metrics: [
      { label: '当前画像中的完成调用', value: s.calls },
      { label: '累计对象分配', value: s.heap.length },
      { label: '类型守卫失效次数', value: s.deopts },
      { label: '最近方法结果', value: s.last?.result ?? '未返回' },
      { label: '安全点帧引用数量', value: s.pollRoots.length },
    ],
    controls: [
      {
        id: 'count',
        kind: 'number',
        label: '每次调用循环次数',
        value: s.count,
        min: 1,
        max: 20,
        disabled: !!s.frame,
      },
      {
        id: 'shape',
        kind: 'select',
        label: '本次接收者类型',
        value: s.shape,
        disabled: !!s.frame,
        options: [
          { value: 'Point', label: 'Point / value=x+y' },
          { value: 'ColoredPoint', label: 'ColoredPoint / value=x+y+10' },
        ],
      },
      {
        id: 'escaping',
        kind: 'select',
        label: '对象身份是否逃逸 / 重建画像',
        value: s.escaping ? 'escape' : 'local',
        disabled: !!s.frame,
        options: [
          { value: 'local', label: '仅当前迭代使用' },
          { value: 'escape', label: '发布到共享集合' },
        ],
      },
      {
        id: 'pollEvery',
        kind: 'number',
        label: '教学循环轮询间隔',
        value: s.pollEvery,
        min: 1,
        max: 5,
        disabled: !!s.frame,
      },
      { id: 'begin', kind: 'button', label: '开始一次方法调用', primary: true, disabled: !!s.frame },
      { id: 'step', kind: 'button', label: '执行一次循环迭代', disabled: !s.frame || s.frame.paused },
      { id: 'run', kind: 'button', label: '运行到返回或安全点', disabled: !s.frame || s.frame.paused },
      {
        id: 'request',
        kind: 'button',
        label: 'VM 请求 Safepoint',
        disabled: !s.frame || s.safepointRequested,
      },
      { id: 'resume', kind: 'button', label: 'VM 恢复安全点中的线程', disabled: !s.frame?.paused },
      { id: 'compare', kind: 'button', label: '对比相同输入的分配工作量' },
    ],
    status: {
      title: s.error
        ? '当前执行状态不能继续'
        : reached
          ? '优化的收益与失效边界都可观察'
          : '预热得到画像，优化代码仍保留正确性守卫',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先完成三次 Point 调用，再执行优化调用；期间请求安全点并恢复，随后改用 ColoredPoint 触发去优化。',
      tone: s.error || s.frame?.paused ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '预热后观察零对象分配，在轮询处到达安全点，再改变接收者触发去优化并核对三组结果。',
      reached,
    },
    log: s.log,
  }
}
export const jitEngine: EngineFactory = () => createSession(initialJit, jitTransition, presentJit)
