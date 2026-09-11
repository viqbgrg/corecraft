import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
export interface SpringTxState {
  path: 'proxy' | 'self' | 'direct'
  failure: 'none' | 'runtime' | 'checked'
  checkedRollback: boolean
  propagation: 'plain' | 'required' | 'requires-new'
  amount: number
  balances: number[]
  before: number[]
  pending: number[] | null
  phase: 'idle' | 'debit' | 'inner' | 'credit' | 'finish' | 'done'
  rollbackOnly: boolean
  auditRows: number
  advice: string[]
  result: string
  partialSeen: boolean
  rollbackSeen: boolean
  successSeen: boolean
  error: string | null
  log: Observation[]
}
export function initialSpringTx(): SpringTxState {
  return {
    path: 'proxy',
    failure: 'none',
    checkedRollback: false,
    propagation: 'plain',
    amount: 20,
    balances: [100, 50],
    before: [100, 50],
    pending: null,
    phase: 'idle',
    rollbackOnly: false,
    auditRows: 0,
    advice: [],
    result: '尚未调用',
    partialSeen: false,
    rollbackSeen: false,
    successSeen: false,
    error: null,
    log: [],
  }
}
function finishTx(s: SpringTxState, failure: 'none' | 'runtime' | 'checked') {
  const transactional = s.pending !== null,
    rollback =
      transactional &&
      (s.rollbackOnly || failure === 'runtime' || (failure === 'checked' && s.checkedRollback))
  if (transactional) {
    if (!rollback) s.balances = [...s.pending!]
    s.advice.push(rollback ? 'TransactionInterceptor: rollback' : 'TransactionInterceptor: commit')
    s.pending = null
  }
  s.result = s.rollbackOnly
    ? 'UnexpectedRollbackException'
    : failure === 'runtime'
      ? 'RuntimeException'
      : failure === 'checked'
        ? 'CheckedException'
        : 'return success'
  s.phase = 'done'
  s.partialSeen ||=
    !transactional &&
    failure !== 'none' &&
    s.balances[0] === s.before[0]! - s.amount &&
    s.balances[1] === s.before[1]
  s.rollbackSeen ||= rollback && s.balances.join(',') === s.before.join(',')
  s.successSeen ||=
    transactional &&
    failure === 'none' &&
    !s.rollbackOnly &&
    s.balances[0] === s.before[0]! - s.amount &&
    s.balances[1] === s.before[1]! + s.amount
  if (transactional) s.advice.push('Around advice: finally / 记录调用结果')
  s.log = addLog(
    s.log,
    '调用结束',
    `${s.result}；数据库 A=${s.balances[0]} B=${s.balances[1]}，独立审计行=${s.auditRows}。${rollback ? '当前事务工作区已撤销。' : transactional ? '当前事务工作区已提交。' : '没有代理事务边界，已执行的写入不会自动撤销。'}`,
    failure === 'none' && !s.rollbackOnly ? 'success' : 'warning',
  )
}
function stepTx(s: SpringTxState) {
  if (s.phase === 'idle' || s.phase === 'done') return
  const rows = s.pending ?? s.balances
  if (s.phase === 'debit') {
    rows[0]! -= s.amount
    s.phase = 'inner'
    s.log = addLog(
      s.log,
      '业务 debit',
      `A 减去 ${s.amount}，写入${s.pending ? '事务工作区' : '独立自动提交'}。`,
    )
  } else if (s.phase === 'inner') {
    if (s.pending && s.propagation === 'required') {
      s.rollbackOnly = true
      s.advice.push('inner REQUIRED: join → RuntimeException → rollbackOnly')
      s.phase = 'credit'
      s.log = addLog(
        s.log,
        '外层捕获内层异常',
        '内层 REQUIRED 参加同一物理事务，已标记 rollback-only；catch 不会清除此标志。',
        'warning',
      )
    } else {
      if (s.pending && s.propagation === 'requires-new') {
        s.auditRows++
        s.advice.push('suspend outer → REQUIRES_NEW audit commit → resume outer')
      }
      if (s.failure !== 'none') finishTx(s, s.failure)
      else s.phase = 'credit'
    }
  } else if (s.phase === 'credit') {
    rows[1]! += s.amount
    s.phase = 'finish'
    s.log = addLog(s.log, '业务 credit', `B 增加 ${s.amount}，还需要经过方法返回与事务完成。`)
  } else finishTx(s, 'none')
}
export function springTxTransition(state: SpringTxState, a: ExperimentAction): SpringTxState {
  const choices: Record<string, string[]> = {
    path: ['proxy', 'self', 'direct'],
    failure: ['none', 'runtime', 'checked'],
    propagation: ['plain', 'required', 'requires-new'],
  }
  if (choices[a.type]?.includes(String(a.value)) && ['idle', 'done'].includes(state.phase))
    return { ...state, [a.type]: a.value }
  if (a.type === 'checkedRollback' && ['on', 'off'].includes(String(a.value)) && state.phase === 'idle')
    return { ...state, checkedRollback: a.value === 'on' }
  if (a.type === 'amount' && state.phase === 'idle') {
    const n = boundedInteger(a.value, 1, 100)
    return n === null ? state : { ...state, amount: n }
  }
  if (!['new', 'enter', 'step', 'run'].includes(a.type)) return state
  if (a.type === 'new')
    return {
      ...initialSpringTx(),
      path: state.path,
      failure: state.failure,
      propagation: state.propagation,
      checkedRollback: state.checkedRollback,
      amount: state.amount,
      partialSeen: state.partialSeen,
      rollbackSeen: state.rollbackSeen,
      successSeen: state.successSeen,
      log: addLog(state.log, '重开同输入转账', '余额恢复为 100 / 50、审计清空，保留各路径已观察证据。'),
    }
  const s = structuredClone(state)
  s.error = null
  if (a.type === 'enter') {
    if (s.phase !== 'idle') return { ...state, error: '当前试验已开始，请先完成或重开。' }
    if (s.amount > s.balances[0]!) return { ...state, error: '余额不足。' }
    s.before = [...s.balances]
    s.phase = 'debit'
    s.advice =
      s.path === 'proxy'
        ? ['外部调用 → Proxy', 'Around advice: before', 'TransactionInterceptor: begin']
        : s.path === 'self'
          ? ['外部非事务方法 → this.transfer', '自调用未经过代理']
          : ['直接 new / 目标对象调用']
    if (s.path === 'proxy') s.pending = [...s.balances]
    s.log = addLog(s.log, '进入业务方法', s.advice.join(' → '))
  } else if (a.type === 'step') stepTx(s)
  else {
    if (s.phase === 'idle') {
      const entered = springTxTransition(s, { type: 'enter' })
      return entered.phase === 'idle' ? entered : springTxTransition(entered, { type: 'run' })
    }
    for (let i = 0; i < 8 && s.phase !== 'done'; i++) stepTx(s)
  }
  return s
}
export function presentSpringTx(s: SpringTxState): ExperimentView {
  const reached = s.partialSeen && s.rollbackSeen && s.successSeen
  return {
    scene: {
      kind: 'data',
      title: 'AOP 代理包围调用，事务工作区决定提交或回滚',
      sequence: s.advice.map((value, i) => ({ label: String(i + 1), value })),
      tables: [
        {
          id: 'spring-tx-balances',
          title: '数据库与当前事务工作区',
          columns: ['账户', '已提交余额', '当前事务候选'],
          rows: ['A', 'B'].map((name, i) => ({
            id: name,
            values: [name, s.balances[i]!, s.pending?.[i] ?? '无事务'],
          })),
        },
        {
          id: 'spring-tx-context',
          title: '事务范围',
          columns: ['阶段', 'rollback-only', '独立审计行', '调用结果'],
          rows: [{ id: 'tx', values: [s.phase, String(s.rollbackOnly), s.auditRows, s.result] }],
        },
      ],
      caption:
        '代理式 Spring AOP 的单资源事务教学，固定转账和审计；直接调用及 this 自调用不穿过代理。REQUIRED 内层场景固定抛运行时异常并由外层 catch，REQUIRES_NEW 审计用独立事务提交。省略真实数据库隔离、切面排序配置、异步上下文、AspectJ weaving、多资源协调与连接池容量。',
    },
    metrics: [
      { label: '已提交余额总和', value: s.balances[0]! + s.balances[1]! },
      { label: '转账结果', value: s.result },
      { label: '独立审计记录数', value: s.auditRows },
    ],
    controls: [
      {
        id: 'path',
        kind: 'select',
        label: '调用进入路径',
        value: s.path,
        disabled: !['idle', 'done'].includes(s.phase),
        options: [
          { value: 'proxy', label: '外部 → Spring Proxy' },
          { value: 'self', label: '非事务外层 → this.transfer' },
          { value: 'direct', label: '直接调用目标对象' },
        ],
      },
      {
        id: 'failure',
        kind: 'select',
        label: 'debit 后的业务结果',
        value: s.failure,
        disabled: !['idle', 'done'].includes(s.phase),
        options: [
          { value: 'none', label: '继续正常转账' },
          { value: 'runtime', label: '抛 RuntimeException' },
          { value: 'checked', label: '抛 checked exception' },
        ],
      },
      {
        id: 'checkedRollback',
        kind: 'select',
        label: '显式为 checked exception 回滚',
        value: s.checkedRollback ? 'on' : 'off',
        disabled: s.phase !== 'idle',
        options: [
          { value: 'off', label: '使用默认规则' },
          { value: 'on', label: 'rollbackFor = 对应异常' },
        ],
      },
      {
        id: 'propagation',
        kind: 'select',
        label: '经另一个代理的内层调用',
        value: s.propagation,
        disabled: !['idle', 'done'].includes(s.phase),
        options: [
          { value: 'plain', label: '无嵌套调用' },
          { value: 'required', label: 'REQUIRED 失败被外层 catch' },
          { value: 'requires-new', label: 'REQUIRES_NEW 提交审计' },
        ],
      },
      {
        id: 'amount',
        kind: 'number',
        label: '转账金额',
        value: s.amount,
        min: 1,
        max: 100,
        disabled: s.phase !== 'idle',
      },
      ...[
        ['new', '重开相同余额的转账'],
        ['enter', '进入调用并建立适用的事务'],
        ['step', '执行下一个业务 / 事务步骤'],
        ['run', '运行当前转账到返回'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'step' })),
    ],
    status: {
      title: s.error
        ? '转账暂不能执行'
        : reached
          ? '代理边界决定回滚是否存在'
          : '注解只有经过适用拦截器才生效',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '对照 this 自调用失败、代理调用失败与代理正常完成，检查两个账户实际余额。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '复现自调用失败的部分提交，再验证代理回滚与正常原子转账。', reached },
    log: s.log,
  }
}
export const springTxEngine: EngineFactory = () =>
  createSession(initialSpringTx, springTxTransition, presentSpringTx)
