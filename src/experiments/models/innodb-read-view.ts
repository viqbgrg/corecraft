import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export interface ReadView {
  creator: number
  activeIds: number[]
  upLimit: number
  lowLimit: number
}
export interface UndoVersion {
  id: number
  tx: number
  value: number
  undo: number | null
}
export interface ViewTransaction {
  slot: 'T1' | 'T2' | 'T3'
  id: number
  status: 'active' | 'committed' | 'aborted'
  isolation: 'rc' | 'rr'
  view: ReadView | null
}
export type VisibilityReason =
  'own' | 'before-upper' | 'after-lower' | 'active-at-snapshot' | 'committed-before-snapshot'
export interface ReadViewState {
  versions: UndoVersion[]
  transactions: ViewTransaction[]
  committedIds: number[]
  nextTx: number
  nextVersion: number
  selected: ViewTransaction['slot']
  isolation: 'rc' | 'rr'
  value: number
  lastRead: number | null
  lastView: ReadView | null
  trace: { id: number; tx: number; value: number; visible: boolean; reason: VisibilityReason }[]
  activeExcluded: boolean
  futureExcluded: boolean
  purgeGuarded: boolean
  purged: number
  releasedAndPurged: boolean
  error: string | null
  log: Observation[]
}
const reasons: Record<VisibilityReason, string> = {
  own: '本事务写入，自己可见',
  'before-upper': 'trx_id < m_up_limit_id，快照前已完成',
  'after-lower': 'trx_id ≥ m_low_limit_id，快照之后才分配',
  'active-at-snapshot': 'trx_id 在 m_ids 中，创建快照时仍活跃',
  'committed-before-snapshot': '边界之间且不在 m_ids，创建快照前已提交',
}
export function versionVisibility(
  tx: number,
  view: ReadView,
): { visible: boolean; reason: VisibilityReason } {
  if (tx === view.creator) return { visible: true, reason: 'own' }
  if (tx < view.upLimit) return { visible: true, reason: 'before-upper' }
  if (tx >= view.lowLimit) return { visible: false, reason: 'after-lower' }
  if (view.activeIds.includes(tx)) return { visible: false, reason: 'active-at-snapshot' }
  return { visible: true, reason: 'committed-before-snapshot' }
}
export function initialReadView(isolation: 'rc' | 'rr' = 'rr'): ReadViewState {
  if (!['rc', 'rr'].includes(isolation)) throw new Error('Read View model supports RC and RR')
  return {
    versions: [{ id: 0, tx: 0, value: 10, undo: null }],
    transactions: [],
    committedIds: [0],
    nextTx: 1,
    nextVersion: 1,
    selected: 'T1',
    isolation,
    value: 20,
    lastRead: null,
    lastView: null,
    trace: [],
    activeExcluded: false,
    futureExcluded: false,
    purgeGuarded: false,
    purged: 0,
    releasedAndPurged: false,
    error: null,
    log: [],
  }
}
export function createReadView(s: ReadViewState, creator: number): ReadView {
  const activeIds = s.transactions
    .filter((tx) => tx.status === 'active')
    .map((tx) => tx.id)
    .sort((a, b) => a - b)
  return { creator, activeIds, upLimit: activeIds[0] ?? s.nextTx, lowLimit: s.nextTx }
}
function readVersion(s: ReadViewState, view: ReadView): number {
  return s.versions.findIndex((version) => versionVisibility(version.tx, view).visible)
}
export function readViewTransition(state: ReadViewState, a: ExperimentAction): ReadViewState {
  if (a.type === 'selected' && ['T1', 'T2', 'T3'].includes(String(a.value)))
    return { ...state, selected: a.value as ReadViewState['selected'], error: null }
  if (a.type === 'isolation' && ['rc', 'rr'].includes(String(a.value)))
    return { ...state, isolation: a.value as ReadViewState['isolation'] }
  if (a.type === 'value') {
    const value = boundedInteger(a.value, 0, 200)
    return value === null ? state : { ...state, value, error: null }
  }
  if (!['begin', 'read', 'write', 'commit', 'rollback', 'purge'].includes(a.type)) return state
  const s: ReadViewState = {
    ...state,
    versions: state.versions.map((version) => ({ ...version })),
    transactions: state.transactions.map((tx) => ({
      ...tx,
      view: tx.view ? { ...tx.view, activeIds: [...tx.view.activeIds] } : null,
    })),
    committedIds: [...state.committedIds],
    trace: [...state.trace],
    error: null,
  }
  let tx = s.transactions.find((tx) => tx.slot === s.selected),
    detail = ''
  if (a.type === 'begin') {
    if (tx?.status === 'active') return state
    tx = { slot: s.selected, id: s.nextTx++, status: 'active', isolation: s.isolation, view: null }
    s.transactions = s.transactions.filter((entry) => entry.slot !== s.selected)
    s.transactions.push(tx)
    detail = `${s.selected} 获得教学事务 ID ${tx.id}，隔离 ${tx.isolation.toUpperCase()}。尚未创建 Read View。`
  } else if (a.type === 'purge') {
    const latestCommitted = s.versions.findIndex((version) => s.committedIds.includes(version.tx))
    const held = s.transactions.filter((tx) => tx.status === 'active' && tx.isolation === 'rr' && tx.view)
    let keepThrough = latestCommitted
    for (const reader of held) keepThrough = Math.max(keepThrough, readVersion(s, reader.view!))
    if (keepThrough < 0) throw new Error('The model must retain a committed base version')
    s.purgeGuarded ||= keepThrough > latestCommitted
    const removed = s.versions.length - keepThrough - 1
    s.versions = s.versions.slice(0, keepThrough + 1)
    s.versions[s.versions.length - 1]!.undo = null
    s.purged += removed
    s.releasedAndPurged ||= removed > 0 && s.purgeGuarded && held.length === 0
    detail = `保留到版本 V${s.versions.at(-1)!.id}，本次回收 ${removed} 个更旧版本。${keepThrough > latestCommitted ? '活跃 RR Read View 仍需要旧值，不能越过它回收。' : '没有更早的活跃视图需要被保留的旧版本。'} 活跃写入的回滚基线也要保留。`
  } else {
    if (!tx || tx.status !== 'active') return { ...state, error: '先在当前会话 BEGIN。' }
    if (a.type === 'read') {
      if (tx.isolation === 'rc' || !tx.view) tx.view = createReadView(s, tx.id)
      const view = tx.view,
        index = readVersion(s, view)
      if (index < 0) throw new Error('No visible version: purge violated an active read view')
      s.lastView = { ...view, activeIds: [...view.activeIds] }
      s.trace = s.versions.slice(0, index + 1).map((version) => ({
        id: version.id,
        tx: version.tx,
        value: version.value,
        ...versionVisibility(version.tx, view),
      }))
      s.lastRead = s.versions[index]!.value
      s.activeExcluded ||= s.trace.some((entry) => entry.reason === 'active-at-snapshot')
      s.futureExcluded ||= s.trace.some((entry) => entry.reason === 'after-lower')
      detail = `${tx.slot} / Tx ${tx.id} 沿 Undo 链读到 ${s.lastRead}。${tx.isolation === 'rr' ? '这个 Read View 保留到事务结束。' : 'RC 本次语句的视图在读完后不再阻挡 purge，下一次读会新建。'}`
    } else if (a.type === 'write') {
      const owner = s.transactions.find(
        (other) =>
          other.status === 'active' &&
          other.id !== tx!.id &&
          s.versions.some((version) => version.tx === other.id),
      )
      if (owner)
        return { ...state, error: `事务 ${owner.id} 仍持有本行写锁，本次修改未执行；它结束后再重试。` }
      const previous = s.versions[0]!
      s.versions.unshift({ id: s.nextVersion++, tx: tx.id, value: s.value, undo: previous.id })
      detail = `Tx ${tx.id} 写入 ${s.value}，新行版本指向 V${previous.id} 的旧值。新版本尚未提交，自己的读取仍可见。`
    } else {
      if (a.type === 'commit') {
        tx.status = 'committed'
        s.committedIds.push(tx.id)
        detail = `Tx ${tx.id} 提交；其他事务已经创建的 m_ids 与边界不会因此改写。`
      } else {
        tx.status = 'aborted'
        s.versions = s.versions.filter((version) => version.tx !== tx!.id)
        detail = `Tx ${tx.id} 回滚，移除自己的未提交版本，恢复前一版本。`
      }
      tx.view = null
      detail += ' 本事务不再持有 Read View。'
    }
  }
  s.log = addLog(s.log, a.type, detail, 'neutral')
  return s
}
export function presentReadView(s: ReadViewState): ExperimentView {
  const tx = s.transactions.find((entry) => entry.slot === s.selected),
    active = tx?.status === 'active',
    held = s.transactions.filter((tx) => tx.status === 'active' && tx.isolation === 'rr' && tx.view).length
  const reached = s.activeExcluded && s.futureExcluded && s.purgeGuarded && s.releasedAndPurged
  return {
    scene: {
      kind: 'data',
      title: 'Read View 固定的是可见性判断，不是某个最新值',
      cards: [
        { id: 'creator', label: '最近读取的 creator_trx_id', value: s.lastView?.creator ?? '—' },
        { id: 'up', label: 'm_up_limit_id / 最小活跃 ID', value: s.lastView?.upLimit ?? '—' },
        { id: 'low', label: 'm_low_limit_id / 当时下一个 ID', value: s.lastView?.lowLimit ?? '—' },
        { id: 'ids', label: '快照创建时的 m_ids', value: s.lastView?.activeIds.join(', ') ?? '—' },
      ],
      tables: [
        {
          id: 'read-view-transactions',
          title: '会话与保留的视图',
          columns: ['会话', 'trx_id', '状态', '隔离', 'Read View'],
          rows: s.transactions.map((tx) => ({
            id: String(tx.id),
            values: [
              tx.slot,
              tx.id,
              tx.status,
              tx.isolation.toUpperCase(),
              tx.view
                ? tx.isolation === 'rr' && tx.status === 'active'
                  ? `保留：up=${tx.view.upLimit}, low=${tx.view.lowLimit}, ids=[${tx.view.activeIds.join(',')}]`
                  : '最近语句的视图已释放'
                : '无',
            ],
          })),
        },
        {
          id: 'undo-version-chain',
          title: '行版本与 Undo 指针 / 最新在前',
          columns: ['版本', '值', 'DB_TRX_ID', 'ROLL_PTR 示意', '写入状态'],
          rows: s.versions.map((version) => ({
            id: String(version.id),
            values: [
              `V${version.id}`,
              version.value,
              version.tx,
              version.undo === null ? '链尾' : `V${version.undo}`,
              s.committedIds.includes(version.tx) ? '已提交' : '未提交',
            ],
          })),
        },
        {
          id: 'read-view-trace',
          title: '最近一次沿版本链的实际可见性判断',
          columns: ['版本', 'trx_id', '值', '可见', '判定依据'],
          rows: s.trace.map((entry) => ({
            id: String(entry.id),
            values: [
              `V${entry.id}`,
              entry.tx,
              entry.value,
              entry.visible ? '是' : '否',
              reasons[entry.reason],
            ],
            tone: entry.visible ? 'success' : 'neutral',
          })),
        },
      ],
      caption:
        '单行、三会话的 InnoDB 风格模型；为便于观察，所有 BEGIN 都分配事务 ID，m_ids 包含当前活跃教学事务。真实 InnoDB 对只读事务有优化。purge 按这一行所需的完整版本链前缀保留，不模拟全局 Undo 页、History List 或后台线程调度。',
    },
    metrics: [
      { label: '最近快照读值', value: s.lastRead ?? '—' },
      { label: '当前行版本数', value: s.versions.length },
      { label: '保留中的 RR 视图', value: held },
      { label: '累计清理旧版本', value: s.purged },
    ],
    controls: [
      {
        id: 'selected',
        kind: 'select',
        label: 'Read View 会话',
        value: s.selected,
        options: ['T1', 'T2', 'T3'].map((slot) => ({ value: slot, label: slot })),
      },
      {
        id: 'isolation',
        kind: 'select',
        label: '新事务 Read View 策略',
        value: s.isolation,
        options: [
          { value: 'rr', label: 'RR / 复用首次普通读视图' },
          { value: 'rc', label: 'RC / 每次普通读新视图' },
        ],
      },
      { id: 'value', kind: 'number', label: '新行版本的值', value: s.value, min: 0, max: 200 },
      { id: 'begin', kind: 'button', label: 'BEGIN · 分配教学事务 ID', primary: true, disabled: active },
      { id: 'read', kind: 'button', label: '普通一致性读 / 遍历 Undo', disabled: !active },
      { id: 'write', kind: 'button', label: '写入一个新行版本', disabled: !active },
      { id: 'commit', kind: 'button', label: 'COMMIT · 结束当前事务', disabled: !active },
      { id: 'rollback', kind: 'button', label: 'ROLLBACK · 移除本事务版本', disabled: !active },
      { id: 'purge', kind: 'button', label: 'Purge · 尝试清理旧版本' },
    ],
    status: {
      title: s.error
        ? '当前行仍有冲突写入'
        : reached
          ? '旧快照结束后才能推进版本回收'
          : '事务后来提交，不会修改已有 Read View',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先让 T2 写但不提交，再让 T1 创建快照；随后提交 T2，并由 T3 写新版本，检查 T1 怎样跳过两种不可见版本。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '跳过创建视图时仍活跃的事务和之后的新事务，观察旧快照阻挡 purge，再结束快照并清理版本。',
      reached,
    },
    log: s.log,
  }
}
export const readViewEngine: EngineFactory = (config) =>
  createSession(
    () => initialReadView((config.isolation ?? 'rr') as 'rc' | 'rr'),
    readViewTransition,
    presentReadView,
  )
