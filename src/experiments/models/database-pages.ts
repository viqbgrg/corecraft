import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export interface DatabaseRow {
  id: number
  score: number
  group: number
}
export interface BufferFrame {
  page: number
  rows: DatabaseRow[]
  dirty: boolean
  pins: number
  used: number
}
export interface DatabasePageState {
  disk: DatabaseRow[][]
  frames: BufferFrame[]
  capacity: number
  clock: number
  selectedPage: number
  id: number
  score: number
  group: number
  reads: number
  writes: number
  hits: number
  pinBlocked: boolean
  changedWritten: boolean
  result: string
  error: string | null
  log: Observation[]
}
const copyRows = (rows: DatabaseRow[]) => rows.map((row) => ({ ...row }))
export function initialDatabasePages(capacity = 2): DatabasePageState {
  if (boundedInteger(capacity, 1, 3) === null) throw new Error('Buffer Pool capacity must be 1–3 frames')
  return {
    disk: Array.from({ length: 6 }, (_, page) =>
      page < 3
        ? Array.from({ length: 3 }, (_, slot) => {
            const id = page * 3 + slot + 1
            return { id, score: 50 + id * 5, group: ((id - 1) % 3) + 1 }
          })
        : [],
    ),
    frames: [],
    capacity,
    clock: 0,
    selectedPage: 0,
    id: 10,
    score: 88,
    group: 1,
    reads: 0,
    writes: 0,
    hits: 0,
    pinBlocked: false,
    changedWritten: false,
    result: '—',
    error: null,
    log: [],
  }
}
export const logicalPage = (s: DatabasePageState, page: number) =>
  s.frames.find((frame) => frame.page === page)?.rows ?? s.disk[page]!
function flushFrame(s: DatabasePageState, frame: BufferFrame): void {
  if (!frame.dirty) return
  if (JSON.stringify(s.disk[frame.page]) !== JSON.stringify(frame.rows)) s.changedWritten = true
  s.disk[frame.page] = copyRows(frame.rows)
  frame.dirty = false
  s.writes++
  s.log = addLog(s.log, '写回数据页', `页 ${frame.page} 的完整内容写入磁盘，dirty 清除。`, 'success')
}
function fetchPage(s: DatabasePageState, page: number): BufferFrame | null {
  const cached = s.frames.find((frame) => frame.page === page)
  if (cached) {
    s.hits++
    cached.used = ++s.clock
    return cached
  }
  if (s.frames.length === s.capacity) {
    const victim = s.frames.filter((frame) => frame.pins === 0).sort((a, b) => a.used - b.used)[0]
    if (!victim) {
      s.pinBlocked = true
      s.error = '所有缓冲帧都被 pin，不能回收；先释放一个使用引用再重试。'
      return null
    }
    flushFrame(s, victim)
    s.frames = s.frames.filter((frame) => frame.page !== victim.page)
    s.log = addLog(s.log, '回收缓冲帧', `未被 pin 的 LRU 页 ${victim.page} 被替换。`)
  }
  const frame = { page, rows: copyRows(s.disk[page]!), dirty: false, pins: 0, used: ++s.clock }
  s.frames.push(frame)
  s.reads++
  s.log = addLog(
    s.log,
    '读取整个数据页',
    `读取磁盘页 ${page}，${frame.rows.length} 条记录同时进入 Buffer Pool。`,
  )
  return frame
}
export function databasePagesTransition(state: DatabasePageState, a: ExperimentAction): DatabasePageState {
  const bounds: Record<string, [number, number]> = {
    page: [0, 5],
    id: [1, 99],
    score: [0, 100],
    group: [1, 3],
    capacity: [1, 3],
  }
  if (Object.hasOwn(bounds, a.type)) {
    const value = boundedInteger(a.value, ...bounds[a.type]!)
    if (value === null) return state
    return a.type === 'capacity'
      ? initialDatabasePages(value)
      : { ...state, [a.type === 'page' ? 'selectedPage' : a.type]: value, error: null }
  }
  if (!['read', 'pin', 'unpin', 'insert', 'update', 'flush', 'evict'].includes(a.type)) return state
  const s: DatabasePageState = {
    ...state,
    disk: state.disk.map(copyRows),
    frames: state.frames.map((frame) => ({ ...frame, rows: copyRows(frame.rows) })),
    error: null,
  }
  let detail = ''
  if (a.type === 'insert' || a.type === 'update') {
    const existingPage = s.disk.findIndex((_, page) => logicalPage(s, page).some((row) => row.id === s.id))
    if (a.type === 'insert' && existingPage >= 0) return { ...state, error: '主键已存在，不能插入重复 id。' }
    if (a.type === 'update' && existingPage < 0) return { ...state, error: '没有这个主键，无法更新。' }
    const page =
      a.type === 'insert' ? s.disk.findIndex((_, page) => logicalPage(s, page).length < 3) : existingPage
    if (page < 0) return { ...state, error: '六个数据页都已满，最多容纳 18 条固定大小记录。' }
    const frame = fetchPage(s, page)
    if (!frame) return s
    const row = { id: s.id, score: s.score, group: s.group }
    if (a.type === 'insert') frame.rows.push(row)
    else frame.rows = frame.rows.map((old) => (old.id === s.id ? row : old))
    frame.dirty = true
    s.selectedPage = page
    detail = `${a.type === 'insert' ? '插入' : '更新'} id=${s.id}，所在页 ${page} 被标为 dirty。磁盘内容尚未随之改变。`
  } else if (a.type === 'read' || a.type === 'pin') {
    const frame = fetchPage(s, s.selectedPage)
    if (!frame) return s
    if (a.type === 'pin') frame.pins++
    s.result = frame.rows.map((row) => `${row.id}:${row.score}`).join(', ') || '空页'
    detail = `访问页 ${s.selectedPage}，取到 ${frame.rows.length} 条记录；pin=${frame.pins}。${a.type === 'pin' ? 'pin 是本次使用引用，不是事务行锁。' : '再次访问已驻留页无需读盘。'}`
  } else if (a.type === 'unpin') {
    const frame = s.frames.find((frame) => frame.page === s.selectedPage)
    if (!frame || !frame.pins) return { ...state, error: '此页没有可释放的 pin 引用。' }
    frame.pins--
    detail = `页 ${frame.page} pin=${frame.pins}；为 0 时才成为回收候选。`
  } else if (a.type === 'flush') {
    const before = s.writes
    for (const frame of s.frames) flushFrame(s, frame)
    detail = `写回 ${s.writes - before} 个脏页。pin 只限制回收，本模型允许使用中的页完成同步写回。`
  } else {
    const frame = s.frames.find((frame) => frame.page === s.selectedPage)
    if (!frame) return { ...state, error: '此页不在 Buffer Pool 中。' }
    if (frame.pins) return { ...state, pinBlocked: true, error: '此页仍被 pin，不能强制回收。' }
    flushFrame(s, frame)
    s.frames = s.frames.filter((entry) => entry.page !== frame.page)
    detail = `页 ${frame.page} 已从 Buffer Pool 回收，磁盘页与逻辑表仍存在。`
  }
  s.log = addLog(s.log, a.type, detail, 'success')
  return s
}
export function presentDatabasePages(s: DatabasePageState): ExperimentView {
  const reached = s.hits > 0 && s.pinBlocked && s.changedWritten
  return {
    scene: {
      kind: 'data',
      title: '数据库 academy → 表 scores → 记录 → 数据页',
      cards: [
        {
          id: 'layout',
          label: '固定页布局',
          value: '64 B / Page',
          detail: '页头 16 B；每记录 12 B，加一个 4 B 槽项，最多三条。',
        },
        {
          id: 'table',
          label: '逻辑表记录数',
          value: s.disk.reduce((n, _, page) => n + logicalPage(s, page).length, 0),
          detail: 'id 为主键，score 与 group 是类型受限的字段。',
        },
      ],
      tables: [
        {
          id: 'database-disk',
          title: '磁盘上的六个页',
          columns: ['页号', '持久记录 id:score', '占用字节', '空闲字节'],
          rows: s.disk.map((rows, page) => ({
            id: String(page),
            values: [
              page,
              rows.map((row) => `${row.id}:${row.score}`).join(', ') || '空',
              16 + rows.length * 16,
              48 - rows.length * 16,
            ],
          })),
        },
        {
          id: 'database-frames',
          title: 'Buffer Pool 中的数据页副本',
          columns: ['页号', '内存记录 id:score', 'Dirty', 'Pin', '最近访问次序'],
          rows: s.frames.map((frame) => ({
            id: String(frame.page),
            values: [
              frame.page,
              frame.rows.map((row) => `${row.id}:${row.score}`).join(', ') || '空',
              frame.dirty ? '是' : '否',
              frame.pins,
              frame.used,
            ],
          })),
        },
        {
          id: 'database-records',
          title: `页 ${s.selectedPage} 的逻辑记录`,
          columns: ['槽号', 'id / INT', 'score / INT', 'group / INT'],
          rows: logicalPage(s, s.selectedPage).map((row, slot) => ({
            id: String(row.id),
            values: [slot, row.id, row.score, row.group],
          })),
        },
      ],
      caption:
        '这是固定长度记录和逻辑整页 IO 的教学数据库，无 SQL 解析器、索引树、并发事务或恢复日志。Buffer Pool 由数据库管理；与操作系统 Page Cache 的关系取决于具体 IO 方式。pin 不等于事务锁。',
    },
    metrics: [
      { label: '数据页读盘', value: s.reads },
      { label: '数据页写盘', value: s.writes },
      { label: 'Buffer Pool 命中', value: s.hits },
      { label: '脏页数量', value: s.frames.filter((frame) => frame.dirty).length },
      { label: '最近页读取', value: s.result },
    ],
    controls: [
      { id: 'page', kind: 'number', label: '数据库页号', value: s.selectedPage, min: 0, max: 5 },
      {
        id: 'capacity',
        kind: 'number',
        label: 'Buffer Pool 帧数 / 修改会重置',
        value: s.capacity,
        min: 1,
        max: 3,
      },
      { id: 'id', kind: 'number', label: '记录主键 id', value: s.id, min: 1, max: 99 },
      { id: 'score', kind: 'number', label: '记录 score', value: s.score, min: 0, max: 100 },
      { id: 'group', kind: 'number', label: '记录 group', value: s.group, min: 1, max: 3 },
      { id: 'read', kind: 'button', label: '读取数据库页', primary: true },
      { id: 'pin', kind: 'button', label: '读取并 pin 当前页' },
      { id: 'unpin', kind: 'button', label: '释放当前页的一次 pin' },
      { id: 'insert', kind: 'button', label: '插入记录' },
      { id: 'update', kind: 'button', label: '按主键更新记录' },
      { id: 'flush', kind: 'button', label: '写回全部脏页' },
      { id: 'evict', kind: 'button', label: '回收当前缓冲页' },
    ],
    status: {
      title: s.error
        ? '缓冲或记录操作需要调整'
        : reached
          ? '已分开逻辑记录与物理页生命周期'
          : '读一条记录可能带入整页数据',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        'pin 两个不同页，再访问第三页观察回收被阻止；释放 pin 后重试，插入记录并写回，重复读页观察命中。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '观察缓存命中和 pin 阻止回收，再把一次记录修改从脏页写回磁盘。', reached },
    log: s.log,
  }
}
export const databasePagesEngine: EngineFactory = (config) =>
  createSession(
    () => initialDatabasePages(Number(config.capacity ?? 2)),
    databasePagesTransition,
    presentDatabasePages,
  )
