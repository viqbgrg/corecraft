import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
interface Participant {
  id: 'A' | 'B'
  value: number
  candidate: number | null
  phase: 'idle' | 'prepared' | 'committed' | 'aborted'
  log: string[]
}
export interface DistributedTxState {
  mode: '2pc' | 'saga'
  selected: 'A' | 'B'
  participants: Participant[]
  alive: boolean
  started: boolean
  decision: 'commit' | 'abort' | null
  coordinatorLog: string[]
  rejectB: boolean
  compensationDown: boolean
  sagaPhase: 'idle' | 'debit-done' | 'compensating' | 'done'
  compensated: boolean
  compensationFailures: number
  blockedSeen: boolean
  atomicSeen: boolean
  partialSeen: boolean
  sagaSeen: boolean
  error: string | null
  log: Observation[]
}
export function initialDistributedTx(): DistributedTxState {
  return {
    mode: '2pc',
    selected: 'A',
    participants: ['A', 'B'].map((id) => ({
      id: id as 'A' | 'B',
      value: 100,
      candidate: null,
      phase: 'idle',
      log: [],
    })),
    alive: true,
    started: false,
    decision: null,
    coordinatorLog: [],
    rejectB: false,
    compensationDown: false,
    sagaPhase: 'idle',
    compensated: false,
    compensationFailures: 0,
    blockedSeen: false,
    atomicSeen: false,
    partialSeen: false,
    sagaSeen: false,
    error: null,
    log: [],
  }
}
export function distributedTxTransition(state: DistributedTxState, a: ExperimentAction): DistributedTxState {
  if (a.type === 'mode' && ['2pc', 'saga'].includes(String(a.value)))
    return {
      ...initialDistributedTx(),
      mode: a.value as DistributedTxState['mode'],
      blockedSeen: state.blockedSeen,
      atomicSeen: state.atomicSeen,
      partialSeen: state.partialSeen,
      sagaSeen: state.sagaSeen,
      log: addLog(state.log, '新分布式事务场景', '两个服务余额各恢复 100，保持前一协议的观察证据。'),
    }
  if (a.type === 'selected' && ['A', 'B'].includes(String(a.value)))
    return { ...state, selected: a.value as 'A' | 'B' }
  if (['rejectB', 'compensationDown'].includes(a.type) && ['on', 'off'].includes(String(a.value)))
    return { ...state, [a.type]: a.value === 'on' }
  if (
    ![
      'begin',
      'prepare',
      'decide',
      'crash',
      'recover',
      'deliver',
      'timeout',
      'saga-forward',
      'compensate',
    ].includes(a.type)
  )
    return state
  const s = structuredClone(state),
    p = s.participants.find((p) => p.id === s.selected)!
  s.error = null
  let detail = ''
  if (s.mode === '2pc') {
    if (['saga-forward', 'compensate'].includes(a.type)) return state
    if (a.type === 'crash') {
      s.alive = false
      detail = '协调者停止，持久决定日志不丢失；已 prepared 参与者仍持有工作区和资源。'
    } else if (a.type === 'recover') {
      s.alive = true
      if (s.started && s.decision === null) {
        s.decision = 'abort'
        s.coordinatorLog.push('durable ABORT / no COMMIT on recovery')
      }
      detail = `恢复后读取持久决定 ${s.decision ?? '尚未开始'}；绝不把已持久 COMMIT 改为 ABORT。`
    } else if (a.type === 'timeout') {
      if (p.phase === 'prepared') {
        s.blockedSeen = true
        detail = `${p.id} 超时但仍 prepared，不能仅凭失联自行决定；需查询可靠决定并等待恢复。`
      } else detail = '当前参与者没有处于不确定 prepared 阶段。'
    } else {
      if (!s.alive) return { ...state, error: '协调者不可达，本动作需要等待恢复。' }
      if (a.type === 'begin') {
        if (s.started) return state
        s.started = true
        s.coordinatorLog.push('BEGIN T1')
        detail = '开始跨服务转账 20，各参与者先准备候选值。'
      } else if (a.type === 'prepare') {
        if (!s.started || s.decision) return { ...state, error: '必须已经开始且尚未作出最终决定。' }
        if (p.phase !== 'idle') return state
        if (p.id === 'B' && s.rejectB) {
          p.phase = 'aborted'
          p.log.push('VOTE NO')
          detail = 'B 拒绝准备，不存在可以 COMMIT 的全体 YES。'
        } else {
          p.candidate = p.value + (p.id === 'A' ? -20 : 20)
          p.phase = 'prepared'
          p.log.push(`durable PREPARED value=${p.candidate}`)
          detail = `${p.id} 持久保存准备状态后投 YES，候选=${p.candidate}；尚未完成事务，资源被保留。`
        }
      } else if (a.type === 'decide') {
        if (!s.started) return { ...state, error: '先开始事务。' }
        if (s.decision) return state
        s.decision = s.participants.every((p) => p.phase === 'prepared') ? 'commit' : 'abort'
        s.coordinatorLog.push(`durable ${s.decision.toUpperCase()}`)
        detail = `先持久记录 ${s.decision}，再向参与者发送决定；缺少全体 YES 时不能 COMMIT。`
      } else {
        if (!s.decision) return { ...state, error: '尚无持久决定可投递。' }
        if (s.decision === 'commit') {
          if (p.phase === 'prepared') {
            p.value = p.candidate!
            p.candidate = null
            p.phase = 'committed'
            p.log.push('COMMIT applied')
          }
        } else if (p.phase !== 'aborted') {
          p.candidate = null
          p.phase = 'aborted'
          p.log.push('ABORT applied')
        }
        s.atomicSeen ||=
          s.participants.every((p) => p.phase === 'committed') &&
          s.participants[0]!.value === 80 &&
          s.participants[1]!.value === 120
        detail = `${p.id} 幂等应用 ${s.decision}；重复通知不会重复扣款。2PC 决定最终统一结果，不自动提供跨服务任意读取的隔离。`
      }
    }
  } else {
    if (a.type === 'saga-forward') {
      if (s.sagaPhase === 'idle') {
        s.participants[0]!.value -= 20
        s.participants[0]!.log.push('local COMMIT debit T1')
        s.sagaPhase = 'debit-done'
        s.partialSeen = true
        detail = 'Saga 第一步 A 本地提交扣款，外界可以看到中间状态；没有 prepared 锁横跨整个流程。'
      } else if (s.sagaPhase === 'debit-done') {
        if (s.rejectB) {
          s.sagaPhase = 'compensating'
          detail = 'B 转入失败，需要业务定义的补偿 A；没有全局数据库自动撤销。'
        } else {
          s.participants[1]!.value += 20
          s.participants[1]!.log.push('local COMMIT credit T1')
          s.sagaPhase = 'done'
          detail = '第二步 B 本地提交，Saga 正向完成。'
        }
      } else return state
    } else if (a.type === 'compensate') {
      if (s.compensated) {
        detail = '补偿命令 T1:undoA 已执行，幂等键避免重复加回。'
      } else if (s.sagaPhase !== 'compensating')
        return { ...state, error: '只有失败后进入补偿阶段才可补偿。' }
      else if (s.compensationDown) {
        s.compensationFailures++
        detail = '补偿服务暂不可用，补偿仍待重试，中间状态不会自动消失。'
      } else {
        s.participants[0]!.value += 20
        s.participants[0]!.log.push('local COMMIT compensation T1:undoA')
        s.compensated = true
        s.sagaPhase = 'done'
        s.sagaSeen ||= s.compensationFailures > 0
        detail = '补偿重试成功，把 A 加回 20；副作用是否可补偿需要业务设计，不能保证任意动作可逆。'
      }
    } else return state
  }
  s.log = addLog(s.log, a.type, detail)
  return s
}
export function presentDistributedTx(s: DistributedTxState): ExperimentView {
  const reached = s.blockedSeen && s.atomicSeen && s.partialSeen && s.sagaSeen
  return {
    scene: {
      kind: 'data',
      title: '2PC 保存统一决定，Saga 用本地事务和业务补偿推进',
      tables: [
        {
          id: 'distributed-tx-participants',
          title: '两个独立资源服务',
          columns: ['服务', '已提交余额', '候选', '2PC 阶段', '持久记录'],
          rows: s.participants.map((p) => ({
            id: p.id,
            values: [p.id, p.value, p.candidate ?? '无', p.phase, p.log.join(' → ') || '无'],
          })),
        },
        {
          id: 'distributed-tx-coordinator',
          title: '协调者持久决定',
          columns: ['可达', '决定', '日志', 'Saga 阶段'],
          rows: [
            {
              id: 'coordinator',
              values: [
                String(s.alive),
                s.decision ?? '未决定',
                s.coordinatorLog.join(' → ') || '无',
                s.sagaPhase,
              ],
            },
          ],
        },
      ],
      caption:
        '固定跨两资源转账 20。2PC 假定参与者可持久 prepare 并保留资源，协调者先持久决定再通知；恢复无决定时选择 ABORT。Saga 固定扣款/加款与加回补偿，本地命令按 T1 幂等。无完整 XA、共识复制协调者、全局读取隔离、并发业务或任意副作用自动补偿。',
    },
    metrics: [
      { label: '当前已提交余额总和', value: s.participants.reduce((n, p) => n + p.value, 0) },
      { label: '补偿失败次数', value: s.compensationFailures },
      { label: '补偿已完成', value: String(s.compensated) },
    ],
    controls: [
      {
        id: 'mode',
        kind: 'select',
        label: '新场景跨服务协议',
        value: s.mode,
        options: [
          { value: '2pc', label: '2PC / prepare + durable decision' },
          { value: 'saga', label: 'Saga / 本地提交 + 补偿' },
        ],
      },
      {
        id: 'selected',
        kind: 'select',
        label: '当前参与者',
        value: s.selected,
        options: ['A', 'B'].map((id) => ({ value: id, label: id })),
      },
      {
        id: 'rejectB',
        kind: 'select',
        label: 'B 是否拒绝本次工作',
        value: s.rejectB ? 'on' : 'off',
        options: [
          { value: 'off', label: '可完成' },
          { value: 'on', label: '拒绝 / 失败' },
        ],
      },
      {
        id: 'compensationDown',
        kind: 'select',
        label: '补偿服务故障',
        value: s.compensationDown ? 'on' : 'off',
        options: [
          { value: 'off', label: '补偿可达' },
          { value: 'on', label: '补偿暂不可达' },
        ],
      },
      ...[
        ['begin', '2PC 开始事务'],
        ['prepare', '当前参与者 prepare 并投票'],
        ['decide', '协调者持久记录最终决定'],
        ['crash', '停止协调者'],
        ['timeout', '当前参与者等待超时'],
        ['recover', '恢复协调者并读取持久决定'],
        ['deliver', '向当前参与者重发最终决定'],
        ['saga-forward', '执行 Saga 下一步本地事务'],
        ['compensate', '执行 / 重试幂等补偿'],
      ].map(([id, label]) => ({
        id: id!,
        label: label!,
        kind: 'button' as const,
        primary: id === 'prepare',
      })),
    ],
    status: {
      title: s.error
        ? '协调前提不满足'
        : reached
          ? '不确定等待与补偿重试均有明确去向'
          : '部分故障要求保存决定或定义补偿',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '2PC 全体准备并持久 COMMIT 后停止协调者，观察超时等待，再恢复投递；新 Saga 让 B 失败并重试补偿。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '验证 2PC 的 prepared 等待与恢复后统一提交，再观察 Saga 中间状态和失败补偿的幂等重试。',
      reached,
    },
    log: s.log,
  }
}
export const distributedTxEngine: EngineFactory = () =>
  createSession(initialDistributedTx, distributedTxTransition, presentDistributedTx)
