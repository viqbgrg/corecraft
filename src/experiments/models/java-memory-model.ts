import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'

export type PublicationMode = 'plain' | 'volatile'
export interface HBEdge {
  from: string
  to: string
  reason: string
}
export interface LitmusOutcome {
  flag: boolean
  data: number | null
  witnesses: string[]
}
export interface JmmState {
  mode: PublicationMode
  source: 'initial' | 'writer'
  dataWritten: boolean
  flagWritten: boolean
  flagRead: boolean | null
  dataRead: number | null
  events: string[]
  edges: HBEdge[]
  unsafeObserved: boolean
  prevented: boolean
  acquired: boolean
  compared: boolean
  error: string | null
  log: Observation[]
}
export function happensBefore(edges: HBEdge[], from: string, to: string): boolean {
  const pending = [from],
    seen = new Set<string>()
  while (pending.length) {
    const node = pending.pop()!
    if (node === to) return true
    if (seen.has(node)) continue
    seen.add(node)
    pending.push(...edges.filter((edge) => edge.from === node).map((edge) => edge.to))
  }
  return false
}
export function publicationEdges(mode: PublicationMode, readPublishedFlag: boolean): HBEdge[] {
  const edges = [
    { from: 'Wdata', to: 'Wflag', reason: 'writer 程序顺序' },
    { from: 'Rflag', to: 'Rdata', reason: 'reader 程序顺序' },
  ]
  if (mode === 'volatile' && readPublishedFlag)
    edges.push({ from: 'Wflag', to: 'Rflag', reason: 'volatile 写 → 读取该发布的读' })
  return edges
}
/** Enumerates writer/reader interleavings and legal data read sources for this one-write litmus. */
export function publicationOutcomes(mode: PublicationMode): LitmusOutcome[] {
  const schedules: string[][] = []
  function interleave(w: string[], r: string[], prefix: string[]) {
    if (!w.length && !r.length) {
      schedules.push(prefix)
      return
    }
    if (w.length) interleave(w.slice(1), r, [...prefix, w[0]!])
    if (r.length) interleave(w, r.slice(1), [...prefix, r[0]!])
  }
  interleave(['Wdata', 'Wflag'], ['Rflag', 'Rdata'], [])
  const results = new Map<string, LitmusOutcome>()
  for (const schedule of schedules) {
    const flag = schedule.indexOf('Wflag') < schedule.indexOf('Rflag')
    const data: (number | null)[] = !flag
      ? [null]
      : happensBefore(publicationEdges(mode, flag), 'Wdata', 'Rdata')
        ? [42]
        : [0, 42]
    for (const value of data) {
      const key = `${flag}/${value}`,
        previous = results.get(key) ?? { flag, data: value, witnesses: [] }
      previous.witnesses.push(schedule.join(' → ') + (flag ? `，读 data=${value}` : '，跳过 data 读取'))
      results.set(key, previous)
    }
  }
  return [...results.values()]
}
export function initialJmm(mode: PublicationMode = 'plain'): JmmState {
  return {
    mode,
    source: 'initial',
    dataWritten: false,
    flagWritten: false,
    flagRead: null,
    dataRead: null,
    events: [],
    edges: [],
    unsafeObserved: false,
    prevented: false,
    acquired: false,
    compared: false,
    error: null,
    log: [],
  }
}
export function jmmTransition(s: JmmState, a: ExperimentAction): JmmState {
  if (a.type === 'mode' && ['plain', 'volatile'].includes(String(a.value)))
    return {
      ...initialJmm(a.value as PublicationMode),
      unsafeObserved: s.unsafeObserved,
      prevented: s.prevented,
      acquired: s.acquired,
      compared: s.compared,
      log: addLog(
        s.log,
        '重新运行发布场景',
        '清空两线程执行状态，保留已观察证据。模式决定 flag 的写读能否建立同步边。',
      ),
    }
  if (a.type === 'source' && ['initial', 'writer'].includes(String(a.value)))
    return { ...s, source: a.value as JmmState['source'], error: null }
  if (a.type === 'compare')
    return {
      ...s,
      compared: true,
      error: null,
      log: addLog(
        s.log,
        '枚举小程序的结果',
        '枚举保持线程内顺序的交错，并检查数据读取来源。见证数量不是概率，不预测具体机器出现哪一种结果。',
      ),
    }
  if (a.type === 'write-data' && !s.dataWritten)
    return {
      ...s,
      dataWritten: true,
      events: [...s.events, 'Wdata'],
      error: null,
      log: addLog(
        s.log,
        'writer：data = 42',
        '普通数据写入已发生；这一步没有向 reader 建立跨线程 happens-before。',
      ),
    }
  if (a.type === 'write-flag' && s.dataWritten && !s.flagWritten)
    return {
      ...s,
      flagWritten: true,
      events: [...s.events, 'Wflag'],
      edges: [...s.edges, { from: 'Wdata', to: 'Wflag', reason: 'writer 程序顺序' }],
      error: null,
      log: addLog(
        s.log,
        `writer：${s.mode} ready = true`,
        s.mode === 'volatile'
          ? '释放发布；稍后读取该 volatile 发布的线程会获得之前的数据写入。'
          : '普通 flag 写不是同步操作，读到 true 不自动建立 happens-before。',
      ),
    }
  if (a.type === 'read-flag' && s.flagRead === null) {
    const flagRead = s.flagWritten,
      edge = { from: 'Wflag', to: 'Rflag', reason: 'volatile synchronizes-with' }
    return {
      ...s,
      flagRead,
      events: [...s.events, 'Rflag'],
      edges: s.mode === 'volatile' && flagRead ? [...s.edges, edge] : s.edges,
      error: null,
      log: addLog(
        s.log,
        `reader：ready → ${flagRead}`,
        flagRead
          ? '本次选择看到 writer 的 ready=true，继续读取 data。'
          : '尚未看到发布，if 分支不进入，不读取 data；这不等于 data 的值为零。',
      ),
    }
  }
  if (a.type === 'read-data' && s.flagRead === true && s.dataRead === null) {
    const edges = [...s.edges, { from: 'Rflag', to: 'Rdata', reason: 'reader 程序顺序' }],
      ordered = happensBefore(edges, 'Wdata', 'Rdata')
    if (s.source === 'initial' && ordered)
      return {
        ...s,
        prevented: true,
        error:
          '这个读取不合法：Wdata → Wflag → Rflag → Rdata 已建立 happens-before，不能再选被覆盖的初始值 0。',
      }
    const dataRead = s.source === 'writer' ? 42 : 0
    return {
      ...s,
      dataRead,
      edges,
      events: [...s.events, 'Rdata'],
      unsafeObserved: s.unsafeObserved || (s.mode === 'plain' && dataRead === 0),
      acquired: s.acquired || (s.mode === 'volatile' && dataRead === 42),
      error: null,
      log: addLog(
        s.log,
        `reader：data → ${dataRead}`,
        ordered
          ? 'volatile 同步边与两侧程序顺序传递，保证本程序读取已发布的 data=42。'
          : `没有跨线程 happens-before；本次选择${dataRead === 0 ? '初始写入 0 的合法旧值见证' : 'writer 的 42'}。这不是声称每次运行必然如此。`,
        ordered ? 'success' : 'warning',
      ),
    }
  }
  return s
}
export function presentJmm(s: JmmState): ExperimentView {
  const reached = s.unsafeObserved && s.prevented && s.acquired && s.compared
  const descriptions: Record<string, string> = {
    Wdata: 'writer 普通写 data=42',
    Wflag: `writer ${s.mode} 写 ready=true`,
    Rflag: `reader 读 ready=${s.flagRead}`,
    Rdata: `reader 读 data=${s.dataRead}`,
  }
  return {
    scene: {
      kind: 'data',
      title: '用 happens-before 图约束可见值',
      cards: [
        {
          id: 'writer',
          label: 'writer 程序',
          value: 'data = 42; ready = true',
          detail: '同一线程内先写数据，再写标志',
        },
        {
          id: 'reader',
          label: 'reader 程序',
          value: 'if (ready) result = data',
          detail: '读取标志后才决定是否读取数据',
        },
      ],
      tables: [
        {
          id: 'jmm-events',
          title: '已安排的事件 / 点击顺序不是普通变量的可见性保证',
          columns: ['事件', '操作'],
          rows: s.events.map((id) => ({ id, values: [id, descriptions[id]!] })),
        },
        {
          id: 'jmm-edges',
          title: '已建立的程序顺序与同步边',
          columns: ['起点', '终点', '依据'],
          rows: s.edges.map((edge, i) => ({ id: String(i), values: [edge.from, edge.to, edge.reason] })),
        },
        {
          id: 'jmm-outcomes',
          title: '两个模式的有限枚举结果 / 见证不是概率',
          columns: ['flag 模式', '读到 ready', '读到 data', '一种见证'],
          rows: s.compared
            ? (['plain', 'volatile'] as const).flatMap((mode) =>
                publicationOutcomes(mode).map((outcome, i) => ({
                  id: `${mode}-${i}`,
                  values: [mode, String(outcome.flag), outcome.data ?? '未执行读取', outcome.witnesses[0]!],
                  tone: outcome.flag && outcome.data === 0 ? 'warning' : 'neutral',
                })),
              )
            : [],
        },
      ],
      caption:
        'JMM 发布 litmus 的允许结果模型，不模拟 CPU 缓存或完整 JMM。单次写入、无额外同步；交互选择可见值作为见证，不表示硬件概率。volatile 保证满足前提的发布可见性，不把复合操作变成原子操作；本课没有循环、自旋优化或多个竞争写入。',
    },
    metrics: [
      { label: 'ready 的声明', value: s.mode },
      { label: 'reader 的 ready', value: s.flagRead === null ? '未读' : String(s.flagRead) },
      { label: 'reader 的 data', value: s.dataRead ?? '未读' },
      {
        label: '跨线程同步边',
        value: s.edges.filter((edge) => edge.from === 'Wflag' && edge.to === 'Rflag').length,
      },
    ],
    controls: [
      {
        id: 'mode',
        kind: 'select',
        label: 'ready 的内存语义 / 重开场景',
        value: s.mode,
        options: [
          { value: 'plain', label: '普通 boolean / 数据竞争' },
          { value: 'volatile', label: 'volatile boolean / 发布与获取' },
        ],
      },
      {
        id: 'source',
        kind: 'select',
        label: '尝试选择的 data 写入来源',
        value: s.source,
        options: [
          { value: 'initial', label: '初始写入 0' },
          { value: 'writer', label: 'writer 写入 42' },
        ],
      },
      {
        id: 'write-data',
        kind: 'button',
        label: 'writer · data = 42',
        primary: true,
        disabled: s.dataWritten,
      },
      {
        id: 'write-flag',
        kind: 'button',
        label: 'writer · ready = true',
        disabled: !s.dataWritten || s.flagWritten,
      },
      { id: 'read-flag', kind: 'button', label: 'reader · 读取 ready', disabled: s.flagRead !== null },
      {
        id: 'read-data',
        kind: 'button',
        label: 'reader · 尝试读取 data',
        disabled: s.flagRead !== true || s.dataRead !== null,
      },
      { id: 'compare', kind: 'button', label: '枚举普通与 volatile 发布结果' },
    ],
    status: {
      title: s.error
        ? '这个读取违反 happens-before'
        : reached
          ? '可见性来自具体的同步关系'
          : '看到标志，还要检查是否建立发布关系',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '普通模式依次写数据、写标志、读标志，再尝试读旧值；改用 volatile 重做并查看为什么旧值被拒绝。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '观察普通发布允许的旧值，再验证 volatile 禁止旧值、允许 42，并比较两种模式的结果集合。',
      reached,
    },
    log: s.log,
  }
}
export const jmmEngine: EngineFactory = () => createSession(initialJmm, jmmTransition, presentJmm)
