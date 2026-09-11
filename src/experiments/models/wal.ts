import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export interface WalPage {
  value: number
  lsn: number
}
export type WalRecord =
  | { lsn: number; tx: number; kind: 'begin' | 'commit' }
  | {
      lsn: number
      tx: number
      kind: 'update'
      page: number
      before: number
      after: number
      previousLsn: number
    }
export interface WalState {
  disk: WalPage[]
  buffer: WalPage[]
  records: WalRecord[]
  durableLsn: number
  nextTx: number
  transaction: { id: number; phase: 'begun' | 'debited' | 'credited' | 'committed'; amount: number } | null
  amount: number
  page: number
  crashed: boolean
  confirmations: number
  pageWrites: number
  redo: number
  undo: number
  walBlocked: boolean
  redoObserved: boolean
  undoObserved: boolean
  error: string | null
  log: Observation[]
}
export function initialWal(amount = 10): WalState {
  if (boundedInteger(amount, 1, 20) === null) throw new Error('Transfer amount must be 1–20')
  return {
    disk: [
      { value: 100, lsn: 0 },
      { value: 100, lsn: 0 },
    ],
    buffer: [
      { value: 100, lsn: 0 },
      { value: 100, lsn: 0 },
    ],
    records: [],
    durableLsn: 0,
    nextTx: 1,
    transaction: null,
    amount,
    page: 0,
    crashed: false,
    confirmations: 0,
    pageWrites: 0,
    redo: 0,
    undo: 0,
    walBlocked: false,
    redoObserved: false,
    undoObserved: false,
    error: null,
    log: [],
  }
}
const nextLsn = (s: WalState) => (s.records.at(-1)?.lsn ?? 0) + 1
const isActive = (s: WalState) => !!s.transaction && s.transaction.phase !== 'committed'
function appendUpdate(s: WalState, page: number, after: number): void {
  const before = s.buffer[page]!,
    lsn = nextLsn(s)
  s.records.push({
    kind: 'update',
    lsn,
    tx: s.transaction!.id,
    page,
    before: before.value,
    after,
    previousLsn: before.lsn,
  })
  s.buffer[page] = { value: after, lsn }
  s.log = addLog(
    s.log,
    `记录 UPDATE LSN ${lsn}`,
    `先记录页 ${page} 的 before=${before.value}、after=${after}，再修改缓冲页；pageLSN=${lsn}。`,
  )
}
export function recoverWal(state: WalState): WalState {
  if (!state.crashed) return state
  const s = { ...state, disk: state.disk.map((page) => ({ ...page })), error: null, redo: 0, undo: 0 }
  const committed = new Set(s.records.filter((record) => record.kind === 'commit').map((record) => record.tx))
  for (const record of s.records) {
    if (record.kind !== 'update' || !committed.has(record.tx) || s.disk[record.page]!.lsn >= record.lsn)
      continue
    s.disk[record.page] = { value: record.after, lsn: record.lsn }
    s.redo++
    s.pageWrites++
    s.log = addLog(
      s.log,
      'REDO 已提交更新',
      `事务 ${record.tx} 的 LSN ${record.lsn} 重做到页 ${record.page}，值=${record.after}。`,
      'success',
    )
  }
  for (const record of [...s.records].reverse()) {
    if (record.kind !== 'update' || committed.has(record.tx) || s.disk[record.page]!.lsn !== record.lsn)
      continue
    s.disk[record.page] = { value: record.before, lsn: record.previousLsn }
    s.undo++
    s.pageWrites++
    s.log = addLog(
      s.log,
      'UNDO 未提交更新',
      `事务 ${record.tx} 没有持久 COMMIT，撤销页 ${record.page} 的 LSN ${record.lsn}，恢复 ${record.before}。`,
      'success',
    )
  }
  s.redoObserved ||= s.redo > 0
  s.undoObserved ||= s.undo > 0
  s.buffer = s.disk.map((page) => ({ ...page }))
  s.transaction = null
  s.crashed = false
  s.log = addLog(
    s.log,
    '恢复完成',
    `本次 REDO ${s.redo} 条，UNDO ${s.undo} 条；账户总额 ${s.disk.reduce((sum, page) => sum + page.value, 0)}。`,
    'success',
  )
  return s
}
export function walTransition(state: WalState, a: ExperimentAction): WalState {
  if (a.type === 'amount' && !isActive(state)) {
    const amount = boundedInteger(a.value, 1, 20)
    return amount === null ? state : { ...state, amount }
  }
  if (a.type === 'page') {
    const page = boundedInteger(a.value, 0, 1)
    return page === null ? state : { ...state, page }
  }
  if (a.type === 'recover') return recoverWal(state)
  if (
    state.crashed ||
    !['begin', 'debit', 'credit', 'commit', 'flush-log', 'flush-page', 'crash'].includes(a.type)
  )
    return state
  const s: WalState = {
    ...state,
    disk: state.disk.map((page) => ({ ...page })),
    buffer: state.buffer.map((page) => ({ ...page })),
    records: [...state.records],
    transaction: state.transaction ? { ...state.transaction } : null,
    error: null,
  }
  let detail = ''
  if (a.type === 'begin') {
    if (isActive(s)) return state
    if (s.buffer[0]!.value < s.amount) return { ...state, error: '账户 A 余额不足，转账事务未开始。' }
    s.transaction = { id: s.nextTx++, phase: 'begun', amount: s.amount }
    s.records.push({ kind: 'begin', lsn: nextLsn(s), tx: s.transaction.id })
    detail = `开始事务 ${s.transaction.id}，准备从 A 向 B 转移 ${s.amount}。日志当前仍可能只在内存中。`
  } else if (a.type === 'debit') {
    if (s.transaction?.phase !== 'begun') return state
    appendUpdate(s, 0, s.buffer[0]!.value - s.transaction.amount)
    s.transaction.phase = 'debited'
    detail = 'A 已扣款，B 尚未入账；这是事务内部的中间状态，还不能确认提交。'
  } else if (a.type === 'credit') {
    if (s.transaction?.phase !== 'debited') return state
    appendUpdate(s, 1, s.buffer[1]!.value + s.transaction.amount)
    s.transaction.phase = 'credited'
    detail = 'B 已入账，缓冲中的转账两步完成；COMMIT 记录仍未产生。'
  } else if (a.type === 'commit') {
    if (s.transaction?.phase !== 'credited') return state
    s.records.push({ kind: 'commit', lsn: nextLsn(s), tx: s.transaction.id })
    s.durableLsn = s.records.at(-1)!.lsn
    s.transaction.phase = 'committed'
    s.confirmations++
    detail = `COMMIT 与此前日志持久到 LSN ${s.durableLsn} 后才确认成功；数据页可以仍未写回（no-force）。`
  } else if (a.type === 'flush-log') {
    s.durableLsn = s.records.at(-1)?.lsn ?? 0
    detail = `日志前缀持久到 LSN ${s.durableLsn}。单独刷 UPDATE 日志不等于存在 COMMIT。`
  } else if (a.type === 'flush-page') {
    const buffered = s.buffer[s.page]!
    if (buffered.lsn > s.durableLsn)
      return {
        ...state,
        walBlocked: true,
        error: `WAL 阻止写页：pageLSN=${buffered.lsn} 大于 durableLSN=${s.durableLsn}，必须先持久化对应日志。`,
      }
    const previous = s.disk[s.page]!
    if (previous.lsn !== buffered.lsn || previous.value !== buffered.value) {
      s.disk[s.page] = { ...buffered }
      s.pageWrites++
    }
    detail = `页 ${s.page} 写入磁盘，pageLSN=${buffered.lsn}。允许未提交页提前落盘（steal），因此恢复时可能需要 UNDO。`
  } else {
    s.buffer = []
    s.records = s.records.filter((record) => record.lsn <= s.durableLsn)
    s.transaction = null
    s.crashed = true
    detail = `模拟崩溃：丢弃缓冲页和未持久化日志，仅保留磁盘页与 LSN≤${s.durableLsn} 的日志。`
  }
  s.log = addLog(s.log, a.type, detail, a.type === 'crash' ? 'warning' : 'neutral')
  return s
}
export function presentWal(s: WalState): ExperimentView {
  const reached = s.walBlocked && s.redoObserved && s.undoObserved && !s.crashed
  return {
    scene: {
      kind: 'data',
      title: '先有可恢复的日志，再允许数据页落盘',
      tables: [
        {
          id: 'wal-pages',
          title: '两个账户所在的数据页',
          columns: ['账户 / 页', '磁盘余额', '磁盘 pageLSN', '缓冲余额', '缓冲 pageLSN'],
          rows: s.disk.map((page, i) => ({
            id: String(i),
            values: [
              `${i === 0 ? 'A' : 'B'} / ${i}`,
              page.value,
              page.lsn,
              s.buffer[i]?.value ?? '已丢失',
              s.buffer[i]?.lsn ?? '—',
            ],
          })),
        },
        {
          id: 'wal-records',
          title: '有序日志与持久化前缀',
          columns: ['LSN', '事务', '类型', '页 / before → after', '持久化'],
          rows: s.records.map((record) => ({
            id: String(record.lsn),
            values: [
              record.lsn,
              record.tx,
              record.kind.toUpperCase(),
              record.kind === 'update' ? `${record.page} / ${record.before} → ${record.after}` : '—',
              record.lsn <= s.durableLsn ? '已持久' : '仅内存',
            ],
          })),
        },
      ],
      caption:
        '单线程、事务不交错，物理 before / after 日志，steal + no-force。恢复作为不可中断的整体步骤，不实现 ARIES 分析阶段、CLR、检查点、并发恢复或恢复期间再次崩溃；不能把此算法当作完整数据库恢复器。',
    },
    metrics: [
      { label: 'durableLSN', value: s.durableLsn },
      { label: '已确认提交', value: s.confirmations },
      { label: '数据页写入次数', value: s.pageWrites },
      { label: '本次 REDO', value: s.redo },
      { label: '本次 UNDO', value: s.undo },
      { label: '磁盘账户总额', value: s.disk.reduce((sum, page) => sum + page.value, 0) },
    ],
    controls: [
      {
        id: 'amount',
        kind: 'number',
        label: '转账金额 A → B',
        value: s.amount,
        min: 1,
        max: 20,
        disabled: isActive(s) || s.crashed,
      },
      {
        id: 'page',
        kind: 'select',
        label: '准备刷新的数据页',
        value: s.page,
        options: [
          { value: '0', label: '账户 A / 页 0' },
          { value: '1', label: '账户 B / 页 1' },
        ],
      },
      {
        id: 'begin',
        kind: 'button',
        label: 'BEGIN · 开始转账',
        primary: true,
        disabled: isActive(s) || s.crashed,
      },
      {
        id: 'debit',
        kind: 'button',
        label: 'UPDATE · A 扣款',
        disabled: s.transaction?.phase !== 'begun' || s.crashed,
      },
      {
        id: 'credit',
        kind: 'button',
        label: 'UPDATE · B 入账',
        disabled: s.transaction?.phase !== 'debited' || s.crashed,
      },
      {
        id: 'commit',
        kind: 'button',
        label: 'COMMIT · 刷日志后确认',
        disabled: s.transaction?.phase !== 'credited' || s.crashed,
      },
      { id: 'flush-log', kind: 'button', label: '仅持久化日志', disabled: s.crashed },
      { id: 'flush-page', kind: 'button', label: '尝试刷写数据页', disabled: s.crashed },
      { id: 'crash', kind: 'button', label: '模拟数据库崩溃', disabled: s.crashed },
      { id: 'recover', kind: 'button', label: '根据持久日志恢复', disabled: !s.crashed },
    ],
    status: {
      title: s.error
        ? '日志必须先于数据页持久化'
        : s.crashed
          ? '等待崩溃恢复'
          : reached
            ? '已观察提交重做与未提交撤销'
            : 'COMMIT 成功不要求所有数据页立即落盘',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先扣款并尝试刷页，观察 WAL 拒绝；完成并提交后崩溃恢复，再让未提交扣款先落盘，比较 REDO 与 UNDO。',
      tone: s.error || s.crashed ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '触发一次 WAL 写页保护，并分别恢复尚未刷页的已提交转账和提前刷页的未提交扣款。', reached },
    log: s.log,
  }
}
export const walEngine: EngineFactory = (config) =>
  createSession(() => initialWal(Number(config.amount ?? 10)), walTransition, presentWal)
