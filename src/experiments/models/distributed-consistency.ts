import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
interface Register {
  node: string
  version: number
  writer: string
  value: number
}
export interface ConsistencyState {
  mode: 'quorum' | 'local'
  split: boolean
  selected: string
  value: number
  replicas: Register[]
  reads: { node: string; value: number; version: string }[]
  acks: Register[]
  rejected: number
  cpSeen: boolean
  apSeen: boolean
  conflictSeen: boolean
  converged: boolean
  error: string | null
  log: Observation[]
}
export function initialConsistency(): ConsistencyState {
  return {
    mode: 'quorum',
    split: false,
    selected: 'A',
    value: 1,
    replicas: ['A', 'B', 'C'].map((node) => ({ node, version: 0, writer: '', value: 0 })),
    reads: [],
    acks: [],
    rejected: 0,
    cpSeen: false,
    apSeen: false,
    conflictSeen: false,
    converged: false,
    error: null,
    log: [],
  }
}
const order = (a: Register, b: Register) =>
  a.version - b.version || (a.writer < b.writer ? -1 : a.writer > b.writer ? 1 : 0)
function peers(s: ConsistencyState, node: string) {
  return s.replicas.filter((r) => !s.split || (r.node === 'A') === (node === 'A'))
}
export function consistencyTransition(state: ConsistencyState, a: ExperimentAction): ConsistencyState {
  if (a.type === 'selected' && ['A', 'B', 'C'].includes(String(a.value)))
    return { ...state, selected: String(a.value) }
  if (a.type === 'value') {
    const value = boundedInteger(a.value, 0, 99)
    return value === null ? state : { ...state, value }
  }
  if (a.type === 'mode' && ['quorum', 'local'].includes(String(a.value)))
    return {
      ...initialConsistency(),
      mode: a.value as ConsistencyState['mode'],
      cpSeen: state.cpSeen,
      apSeen: state.apSeen,
      conflictSeen: state.conflictSeen,
      converged: state.converged,
      log: addLog(state.log, '新一致性协议', '重新建立同样的三副本寄存器，保留协议对照证据。'),
    }
  if (!['partition', 'heal', 'read', 'write', 'repair'].includes(a.type)) return state
  const s = structuredClone(state)
  s.error = null
  let detail = ''
  if (a.type === 'partition') {
    s.split = true
    detail = 'A 与 B/C 之间双向消息不通，各分区内节点仍能响应客户端。'
  } else if (a.type === 'heal') {
    s.split = false
    detail = '网络恢复；修复需要通信，链路恢复本身不把数据立即变得相同。'
  } else if (a.type === 'repair') {
    if (s.split) return { ...state, error: '此教学修复要求三节点重新连通。' }
    const winner = [...s.replicas].sort(order).at(-1)!
    for (const r of s.replicas)
      Object.assign(r, { version: winner.version, writer: winner.writer, value: winner.value })
    s.converged ||= s.mode === 'local' && s.conflictSeen
    s.apSeen ||=
      s.mode === 'local' && s.acks.some((a) => a.node === 'A') && s.acks.some((a) => a.node !== 'A')
    detail = `反熵采用最大 (逻辑版本, writer) 收敛到 ${winner.value}；这可能舍弃另一分区已确认的寄存器值，不是自动合并业务含义。`
  } else {
    const reachable = peers(s, s.selected),
      local = s.replicas.find((r) => r.node === s.selected)!
    if (s.mode === 'quorum' && reachable.length < 2) {
      s.rejected++
      s.cpSeen = true
      s.error = '不能联系 2/3 仲裁，当前请求无法按该一致性协议成功；分区期间牺牲这部分可用性。'
      s.log = addLog(s.log, '仲裁不足', s.error, 'warning')
      return s
    }
    if (a.type === 'write') {
      const base = s.mode === 'quorum' ? [...reachable].sort(order).at(-1)! : local,
        newValue = { version: base.version + 1, writer: s.selected, value: s.value }
      const targets = s.mode === 'quorum' ? reachable : [local]
      for (const target of targets) Object.assign(target, newValue)
      s.acks.push({ node: s.selected, ...newValue })
      s.conflictSeen ||=
        s.mode === 'local' &&
        s.split &&
        new Set(s.replicas.filter((r) => r.version > 0).map((r) => r.value)).size > 1
      detail = `${s.selected} 写 ${s.value}，版本=(${newValue.version},${newValue.writer})，${targets.length} 个副本保存后返回。`
    } else {
      const latest = s.mode === 'quorum' ? [...reachable].sort(order).at(-1)! : local
      const snapshot = { version: latest.version, writer: latest.writer, value: latest.value }
      if (s.mode === 'quorum')
        for (const target of reachable) if (order(target, latest) < 0) Object.assign(target, snapshot)
      s.reads.push({
        node: s.selected,
        value: snapshot.value,
        version: `${snapshot.version}/${snapshot.writer}`,
      })
      detail = `读取 ${snapshot.value}。${s.mode === 'quorum' ? '查询多数的最大版本，并在返回前向多数回写；不是只依赖 R+W>N 这个算式。' : '只读取本地副本，可能尚未看到另一节点已确认的写入。'}`
    }
  }
  s.log = addLog(s.log, a.type, detail)
  return s
}
export function presentConsistency(s: ConsistencyState): ExperimentView {
  const reached = s.cpSeen && s.apSeen && s.conflictSeen && s.converged
  return {
    scene: {
      kind: 'data',
      title: '网络分区让跨节点协调的等待成为可观察的代价',
      tables: [
        {
          id: 'consistency-replicas',
          title: '三副本单寄存器',
          columns: ['节点', '逻辑版本 / writer', '值', '可通信节点'],
          rows: s.replicas.map((r) => ({
            id: r.node,
            values: [
              r.node,
              `${r.version}/${r.writer || '初始'}`,
              r.value,
              peers(s, r.node)
                .map((p) => p.node)
                .join(', '),
            ],
          })),
        },
        {
          id: 'consistency-acks',
          title: '已经返回成功的写入',
          columns: ['入口', '版本', '值'],
          rows: s.acks.map((r, i) => ({
            id: String(i),
            values: [r.node, `${r.version}/${r.writer}`, r.value],
          })),
        },
        {
          id: 'consistency-reads',
          title: '实际读值',
          columns: ['入口', '版本', '值'],
          rows: s.reads.map((r, i) => ({ id: String(i), values: [r.node, r.version, r.value] })),
        },
      ],
      caption:
        '三副本单寄存器，quorum 为 ABD 思路的查询版本 + 多数写回，操作在每次点击内完成，无并发进行中的 RPC。local 协议用本地逻辑版本与 writer 冲突决议，不代表可靠物理时钟 LWW 或 CRDT。CAP 中一致性指线性一致，可用性是非故障节点请求最终成功的形式条件，不等于 SLA 百分比；分区容忍是故障前提。',
    },
    metrics: [
      { label: '仲裁不足请求数', value: s.rejected },
      { label: '已确认写入数', value: s.acks.length },
      { label: '当前不同值数量', value: new Set(s.replicas.map((r) => r.value)).size },
    ],
    controls: [
      {
        id: 'mode',
        kind: 'select',
        label: '新场景的一致性协议',
        value: s.mode,
        options: [
          { value: 'quorum', label: '多数查询 / 写回协议' },
          { value: 'local', label: '本地接受 / 之后反熵收敛' },
        ],
      },
      {
        id: 'selected',
        kind: 'select',
        label: '客户端接入节点',
        value: s.selected,
        options: ['A', 'B', 'C'].map((id) => ({ value: id, label: id })),
      },
      { id: 'value', kind: 'number', label: '写入的寄存器值', value: s.value, min: 0, max: 99 },
      ...[
        ['partition', '制造 A | B,C 网络分区'],
        ['write', '按当前协议执行写入'],
        ['read', '按当前协议执行读取'],
        ['heal', '恢复网络通信'],
        ['repair', '执行全组反熵修复'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'write' })),
    ],
    status: {
      title: s.error
        ? '此请求无法满足协议条件'
        : reached
          ? '分区中的取舍与恢复后的收敛已有证据'
          : '选择协议需要说明成功条件和冲突规则',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '多数协议下隔离 A 并尝试写；再新建本地协议场景，让两侧分别写不同值，恢复并修复。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '观察少数侧仲裁拒绝、本地协议两侧成功与冲突，再恢复通信并按明确规则收敛。', reached },
    log: s.log,
  }
}
export const consistencyEngine: EngineFactory = () =>
  createSession(initialConsistency, consistencyTransition, presentConsistency)
