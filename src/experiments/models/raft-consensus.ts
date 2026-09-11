import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
type Id = 'A' | 'B' | 'C'
interface Entry {
  id: string
  term: number
  value: number | null
}
interface RaftNode {
  id: Id
  term: number
  votedFor: Id | null
  role: 'follower' | 'candidate' | 'leader'
  votes: Id[]
  log: Entry[]
  commit: number
  applied: number
  value: number
  next: Record<Id, number>
  match: Record<Id, number>
}
type Message = { from: Id; to: Id; term: number } & (
  | { kind: 'request-vote'; lastTerm: number; lastIndex: number }
  | { kind: 'vote'; granted: boolean }
  | { kind: 'append'; prevIndex: number; prevTerm: number; entries: Entry[]; leaderCommit: number }
  | { kind: 'appended'; success: boolean; match: number }
)
export interface RaftState {
  nodes: RaftNode[]
  selected: Id
  isolated: Id | 'none'
  value: number
  messages: Message[]
  proposals: { id: string; value: number; committed: boolean }[]
  serial: number
  elections: number
  dropped: number
  minoritySeen: boolean
  repaired: boolean
  error: string | null
  log: Observation[]
}
const ids: Id[] = ['A', 'B', 'C']
export function initialRaft(): RaftState {
  return {
    nodes: ids.map((id) => ({
      id,
      term: 0,
      votedFor: null,
      role: 'follower',
      votes: [],
      log: [],
      commit: 0,
      applied: 0,
      value: 0,
      next: { A: 1, B: 1, C: 1 },
      match: { A: 0, B: 0, C: 0 },
    })),
    selected: 'A',
    isolated: 'none',
    value: 5,
    messages: [],
    proposals: [],
    serial: 1,
    elections: 0,
    dropped: 0,
    minoritySeen: false,
    repaired: false,
    error: null,
    log: [],
  }
}
const getNode = (s: RaftState, id: Id) => s.nodes.find((n) => n.id === id)!
const connected = (s: RaftState, a: Id, b: Id) =>
  s.isolated === 'none' || (a === s.isolated) === (b === s.isolated)
const lastTerm = (n: RaftNode) => n.log.at(-1)?.term ?? 0
function applyCommitted(s: RaftState, n: RaftNode) {
  while (n.applied < n.commit) {
    const entry = n.log[n.applied++]!
    if (entry.value !== null) n.value = entry.value
    const proposal = s.proposals.find((p) => p.id === entry.id)
    if (proposal) proposal.committed = true
  }
}
function appendMessage(s: RaftState, leader: RaftNode, to: Id) {
  const next = leader.next[to],
    prev = next - 1
  s.messages.push({
    kind: 'append',
    from: leader.id,
    to,
    term: leader.term,
    prevIndex: prev,
    prevTerm: prev ? leader.log[prev - 1]!.term : 0,
    entries: structuredClone(leader.log.slice(next - 1)),
    leaderCommit: leader.commit,
  })
}
function broadcast(s: RaftState, n: RaftNode) {
  for (const id of ids) if (id !== n.id) appendMessage(s, n, id)
}
function advanceCommit(s: RaftState, n: RaftNode) {
  const old = n.commit
  n.match[n.id] = n.log.length
  for (let index = n.log.length; index > n.commit; index--)
    if (n.log[index - 1]!.term === n.term && ids.filter((id) => n.match[id] >= index).length >= 2) {
      n.commit = index
      applyCommitted(s, n)
      break
    }
  if (n.commit > old) broadcast(s, n)
}
function becomeLeader(s: RaftState, n: RaftNode) {
  n.role = 'leader'
  s.elections++
  for (const id of ids) {
    n.next[id] = n.log.length + 1
    n.match[id] = id === n.id ? n.log.length : 0
  }
  n.log.push({ id: `noop-${n.id}-${n.term}`, term: n.term, value: null })
  n.match[n.id] = n.log.length
  broadcast(s, n)
  s.log = addLog(
    s.log,
    '多数选出 Leader',
    `${n.id} 在 term ${n.term} 获得多数票，追加当前任期 no-op；当前任期多数提交可带动此前匹配前缀提交。`,
  )
}
function stepDown(n: RaftNode, term: number) {
  if (term > n.term) {
    n.term = term
    n.votedFor = null
  }
  n.role = 'follower'
  n.votes = []
}
function deliver(s: RaftState) {
  const m = s.messages.shift()
  if (!m) return
  if (!connected(s, m.from, m.to)) {
    s.dropped++
    return
  }
  const n = getNode(s, m.to)
  if (m.term > n.term) stepDown(n, m.term)
  if (m.kind === 'request-vote') {
    const current = m.term === n.term,
      upToDate = m.lastTerm > lastTerm(n) || (m.lastTerm === lastTerm(n) && m.lastIndex >= n.log.length),
      granted = current && upToDate && (n.votedFor === null || n.votedFor === m.from)
    if (granted) n.votedFor = m.from
    s.messages.push({ kind: 'vote', from: n.id, to: m.from, term: n.term, granted })
  } else if (m.kind === 'vote') {
    if (m.term === n.term && n.role === 'candidate' && m.granted) {
      if (!n.votes.includes(m.from)) n.votes.push(m.from)
      if (n.votes.length >= 2) becomeLeader(s, n)
    }
  } else if (m.kind === 'append') {
    if (m.term < n.term) {
      s.messages.push({ kind: 'appended', from: n.id, to: m.from, term: n.term, success: false, match: 0 })
      return
    }
    stepDown(n, m.term)
    if (m.prevIndex > n.log.length || (m.prevIndex > 0 && n.log[m.prevIndex - 1]!.term !== m.prevTerm)) {
      s.messages.push({ kind: 'appended', from: n.id, to: m.from, term: n.term, success: false, match: 0 })
      return
    }
    for (let i = 0; i < m.entries.length; i++) {
      const at = m.prevIndex + i,
        entry = m.entries[i]!
      if (n.log[at] && n.log[at]!.term !== entry.term) {
        if (at < n.commit) throw new Error('Raft attempted to overwrite a committed entry')
        s.repaired ||= n.log.slice(at).some((e) => e.value !== null)
        n.log = n.log.slice(0, at)
      }
      if (!n.log[at]) n.log.push({ ...entry })
    }
    const match = m.prevIndex + m.entries.length
    n.commit = Math.max(n.commit, Math.min(m.leaderCommit, match))
    applyCommitted(s, n)
    s.messages.push({ kind: 'appended', from: n.id, to: m.from, term: n.term, success: true, match })
  } else if (n.role === 'leader' && m.term === n.term) {
    if (m.success) {
      n.match[m.from] = Math.max(n.match[m.from], m.match)
      n.next[m.from] = Math.max(n.next[m.from], m.match + 1)
      advanceCommit(s, n)
      if (n.next[m.from] <= n.log.length) appendMessage(s, n, m.from)
    } else {
      n.next[m.from] = Math.max(n.match[m.from] + 1, n.next[m.from] - 1, 1)
      appendMessage(s, n, m.from)
    }
  }
}
export function raftTransition(state: RaftState, a: ExperimentAction): RaftState {
  if (a.type === 'selected' && ids.includes(a.value as Id)) return { ...state, selected: a.value as Id }
  if (a.type === 'isolated' && ['none', ...ids].includes(String(a.value)))
    return { ...state, isolated: a.value as RaftState['isolated'] }
  if (a.type === 'value') {
    const n = boundedInteger(a.value, 0, 99)
    return n === null ? state : { ...state, value: n }
  }
  if (!['timeout', 'propose', 'heartbeat', 'deliver', 'drain'].includes(a.type)) return state
  const s = structuredClone(state),
    n = getNode(s, s.selected)
  s.error = null
  if (a.type === 'timeout') {
    if (n.role === 'leader')
      return { ...state, error: 'Leader 发送心跳；本课选举超时用于 follower / candidate。' }
    n.term++
    n.role = 'candidate'
    n.votedFor = n.id
    n.votes = [n.id]
    for (const id of ids)
      if (id !== n.id)
        s.messages.push({
          kind: 'request-vote',
          from: n.id,
          to: id,
          term: n.term,
          lastTerm: lastTerm(n),
          lastIndex: n.log.length,
        })
    s.log = addLog(
      s.log,
      '选举超时',
      `${n.id} 增加到 term=${n.term}，持久记录投给自己，并发送带最后日志 term/index 的 RequestVote。`,
    )
  } else if (a.type === 'propose') {
    if (n.role !== 'leader') return { ...state, error: '当前节点不是 Leader，不能接收此教学写提案。' }
    if (n.log.length >= 32) return { ...state, error: '教学日志最多 32 条。' }
    const entry = { id: `${n.id}-${n.term}-${s.serial++}`, term: n.term, value: s.value }
    n.log.push(entry)
    s.proposals.push({ id: entry.id, value: s.value, committed: false })
    n.match[n.id] = n.log.length
    s.minoritySeen ||= ids.filter((id) => connected(s, n.id, id)).length < 2
    broadcast(s, n)
    s.log = addLog(
      s.log,
      '追加未提交提案',
      `${n.id} 只写本地日志还不能确认 value=${s.value}；需要当前任期条目的多数复制。`,
    )
  } else if (a.type === 'heartbeat') {
    if (n.role !== 'leader') return { ...state, error: '当前节点不是 Leader。' }
    broadcast(s, n)
  } else if (a.type === 'deliver') deliver(s)
  else {
    let budget = 600
    while (s.messages.length && budget-- > 0) deliver(s)
    if (s.messages.length) s.error = '消息调度预算用尽，请继续单步检查。'
  }
  return s
}
export function presentRaft(s: RaftState): ExperimentView {
  const same = s.nodes.every(
      (n) =>
        n.commit === s.nodes[0]!.commit &&
        n.log.map((e) => e.id).join(',') === s.nodes[0]!.log.map((e) => e.id).join(','),
    ),
    reached =
      s.elections >= 2 &&
      s.minoritySeen &&
      s.repaired &&
      same &&
      s.proposals.filter((p) => p.committed).length >= 2 &&
      s.nodes.every((n) => n.applied === n.commit)
  return {
    scene: {
      kind: 'data',
      title: 'Raft 用任期、投票、日志匹配与多数提交维护一个历史',
      tables: [
        {
          id: 'raft-nodes',
          title: '节点的持久任期 / 投票与状态机',
          columns: ['节点', 'role / term', 'votedFor', 'commit / applied', '状态机值'],
          nowrapColumns: [2],
          rows: s.nodes.map((n) => ({
            id: n.id,
            values: [
              n.id,
              `${n.role} / ${n.term}`,
              n.votedFor ?? '无',
              `${n.commit} / ${n.applied}`,
              n.value,
            ],
          })),
        },
        {
          id: 'raft-logs',
          title: '日志从 index 1 开始',
          columns: ['节点', 'index', 'term', '值', '已提交'],
          rows: s.nodes.flatMap((n) =>
            n.log.map((e, i) => ({
              id: `${n.id}:${i}`,
              values: [n.id, i + 1, e.term, e.value ?? 'no-op', String(i < n.commit)],
            })),
          ),
        },
        {
          id: 'raft-messages',
          title: '待投递 RPC 队列',
          columns: ['from → to', 'RPC', 'term'],
          rows: s.messages.map((m, i) => ({
            id: String(i),
            values: [`${m.from} → ${m.to}`, m.kind, m.term],
          })),
        },
        {
          id: 'raft-proposals',
          title: '客户端提案 / 只有已提交才可确认',
          columns: ['提案', '值', '已提交'],
          rows: s.proposals.map((p) => ({ id: p.id, values: [p.id, p.value, String(p.committed)] })),
        },
      ],
      caption:
        '三节点、固定成员、非拜占庭、可靠持久 term/vote/log，用户调度超时与 RPC；隔离链路丢弃跨分区消息。实现日志新旧投票、prevIndex/prevTerm 检查、冲突截断、next/match 回退与当前任期多数提交，Leader 自动追加 no-op。省略真实时钟、节点掉电、快照、成员变更和线性一致读协议；普通节点本地 value 不是 ReadIndex 读取保证。',
    },
    metrics: [
      { label: '选出 Leader 次数', value: s.elections },
      { label: '分区丢弃 RPC 数', value: s.dropped },
      { label: '已提交业务提案数', value: s.proposals.filter((p) => p.committed).length },
    ],
    controls: [
      {
        id: 'selected',
        kind: 'select',
        label: '当前 Raft 节点',
        value: s.selected,
        options: ids.map((id) => ({ value: id, label: id })),
      },
      {
        id: 'isolated',
        kind: 'select',
        label: '隔离哪个节点',
        value: s.isolated,
        options: ['none', ...ids].map((id) => ({ value: id, label: id === 'none' ? '全部连通' : id })),
      },
      { id: 'value', kind: 'number', label: '新提案寄存器值', value: s.value, min: 0, max: 99 },
      ...[
        ['timeout', '触发当前节点选举超时'],
        ['propose', 'Leader 追加业务提案'],
        ['heartbeat', 'Leader 发送日志 / 心跳'],
        ['deliver', '投递队首一个 RPC'],
        ['drain', '投递当前全部可达 RPC'],
      ].map(([id, label]) => ({
        id: id!,
        label: label!,
        kind: 'button' as const,
        primary: id === 'deliver',
      })),
    ],
    status: {
      title: s.error
        ? '节点或消息条件未满足'
        : reached
          ? '已提交前缀保留，旧主未提交分叉被修复'
          : '能追加本地日志，不等于能提交',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先选 A 并提交 5；隔离 A 追加 9，B/C 选新主并提交 7，恢复后同步旧 A。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '跨两次选举保留已提交值，阻止孤立旧主提交，并在恢复后截断它的未提交分叉。', reached },
    log: s.log,
  }
}
export const raftEngine: EngineFactory = () => createSession(initialRaft, raftTransition, presentRaft)
