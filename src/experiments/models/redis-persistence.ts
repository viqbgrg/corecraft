import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
type PersistMode = 'rdb' | 'everysec' | 'always'
interface Snapshot {
  value: number
  seq: number
}
interface AofCommand {
  seq: number
  value: number
}
export interface RedisPersistenceState {
  mode: PersistMode
  alive: boolean
  value: number
  seq: number
  acked: number
  rdb: Snapshot
  saving: Snapshot | null
  cow: boolean
  aofOs: AofCommand[]
  aofDisk: AofCommand[]
  rewriting: Snapshot | null
  rewrites: number
  fsyncs: number
  recoveredSeq: number
  lost: number
  rdbSeen: boolean
  lossSeen: boolean
  alwaysSeen: boolean
  error: string | null
  log: Observation[]
}
export function initialPersistence(): RedisPersistenceState {
  return {
    mode: 'rdb',
    alive: true,
    value: 0,
    seq: 0,
    acked: 0,
    rdb: { value: 0, seq: 0 },
    saving: null,
    cow: false,
    aofOs: [],
    aofDisk: [],
    rewriting: null,
    rewrites: 0,
    fsyncs: 0,
    recoveredSeq: 0,
    lost: 0,
    rdbSeen: false,
    lossSeen: false,
    alwaysSeen: false,
    error: null,
    log: [],
  }
}
export function persistenceTransition(
  state: RedisPersistenceState,
  a: ExperimentAction,
): RedisPersistenceState {
  if (a.type === 'mode' && ['rdb', 'everysec', 'always'].includes(String(a.value)))
    return {
      ...initialPersistence(),
      mode: a.value as PersistMode,
      rdbSeen: state.rdbSeen,
      lossSeen: state.lossSeen,
      alwaysSeen: state.alwaysSeen,
      log: addLog(
        state.log,
        '新持久化场景',
        '新实例从 counter=0 开始，使用选定持久化配置；已有对照证据保留。',
      ),
    }
  if (
    ![
      'write',
      'save-start',
      'save-finish',
      'fsync',
      'rewrite-start',
      'rewrite-finish',
      'crash',
      'recover',
    ].includes(a.type)
  )
    return state
  if (!state.alive && a.type !== 'recover') return { ...state, error: '实例已停止，先执行恢复。' }
  const s = structuredClone(state)
  s.error = null
  let detail = ''
  if (a.type === 'write') {
    if (s.seq >= 32) return { ...state, error: '教学写入轨迹最多 32 次，请重置。' }
    s.seq++
    s.value++
    s.cow ||= s.saving !== null
    if (s.mode !== 'rdb') {
      s.aofOs.push({ seq: s.seq, value: s.value })
      if (s.mode === 'always') {
        s.aofDisk = structuredClone(s.aofOs)
        s.fsyncs++
      }
    }
    s.acked = s.seq
    detail = `INCR counter → ${s.value}，客户端收到成功。${s.mode === 'rdb' ? '尚未生成新的稳定快照。' : s.mode === 'always' ? '本次 AOF fsync 完成后才确认。' : '命令进入 OS AOF 文件缓存，尚未保证 fsync。'}`
  } else if (a.type === 'save-start') {
    if (s.saving) return state
    s.saving = { value: s.value, seq: s.seq }
    s.cow = false
    detail = `BGSAVE 的逻辑快照固定在 seq=${s.seq}、value=${s.value}；父进程可以继续写。`
  } else if (a.type === 'save-finish') {
    if (!s.saving) return state
    s.rdb = { ...s.saving }
    s.saving = null
    detail = `新 RDB 完成并替换旧文件，持久值=${s.rdb.value}；快照开始后的写入不自动进入此文件。`
  } else if (a.type === 'fsync') {
    if (s.mode === 'rdb') return { ...state, error: '当前只启用 RDB，没有 AOF 文件可同步。' }
    s.aofDisk = structuredClone(s.aofOs)
    s.fsyncs++
    detail = `AOF 文件缓存同步到稳定存储，持久命令 ${s.aofDisk.length} 条。everysec 典型约一秒的窗口不是任何环境下绝对的一秒上界。`
  } else if (a.type === 'rewrite-start') {
    if (s.mode === 'rdb' || s.rewriting)
      return { ...state, error: 'AOF rewrite 需要启用 AOF 且没有正在进行的 rewrite。' }
    s.rewriting = { value: s.value, seq: s.seq }
    detail = '重写开始，记录当前数据的等价基线；后续命令仍写旧 AOF，同时保留到新文件的增量。'
  } else if (a.type === 'rewrite-finish') {
    if (!s.rewriting) return state
    const base = s.rewriting,
      tail = s.aofOs.filter((c) => c.seq > base.seq)
    s.aofOs = [{ ...base }, ...tail]
    s.aofDisk = structuredClone(s.aofOs)
    s.fsyncs++
    s.rewriting = null
    s.rewrites++
    detail = `新 AOF = SET counter ${base.value} + ${tail.length} 条后续绝对值命令，持久化后原子切换；重写不重新执行原始 INCR 副作用。`
  } else if (a.type === 'crash') {
    s.alive = false
    s.value = 0
    s.saving = null
    s.rewriting = null
    s.aofOs = structuredClone(s.aofDisk)
    detail = '模拟整机断电，丢弃进程状态、未持久 OS AOF 尾部与未完成临时文件，旧稳定文件仍在。'
  } else {
    if (s.alive) return state
    const recovered = s.mode === 'rdb' ? s.rdb : (s.aofDisk.at(-1) ?? { value: 0, seq: 0 })
    s.value = recovered.value
    s.recoveredSeq = recovered.seq
    s.lost = Math.max(0, s.acked - recovered.seq)
    s.seq = recovered.seq
    s.alive = true
    s.rdbSeen ||= s.mode === 'rdb' && s.cow && s.lost > 0 && s.value === s.rdb.value
    s.lossSeen ||= s.mode === 'everysec' && s.lost > 0
    s.alwaysSeen ||= s.mode === 'always' && s.lost === 0 && s.acked > 0
    detail = `从 ${s.mode === 'rdb' ? 'RDB' : 'AOF'} 恢复 counter=${s.value}，已确认但未恢复 ${s.lost} 次写入。两者同时启用时通常优先使用 AOF；这里每场景指定恢复来源。`
  }
  s.log = addLog(s.log, a.type, detail, a.type === 'crash' || s.lost > 0 ? 'warning' : 'neutral')
  return s
}
export function presentPersistence(s: RedisPersistenceState): ExperimentView {
  const reached = s.rdbSeen && s.lossSeen && s.alwaysSeen
  return {
    scene: {
      kind: 'data',
      title: '客户端确认、快照时点与日志持久前缀分别推进',
      tables: [
        {
          id: 'redis-rdb',
          title: 'RDB 逻辑快照',
          columns: ['位置', 'seq', 'counter'],
          rows: [
            { id: 'disk', values: ['稳定 RDB', s.rdb.seq, s.rdb.value] },
            ...(s.saving ? [{ id: 'child', values: ['正在生成的快照', s.saving.seq, s.saving.value] }] : []),
          ],
        },
        {
          id: 'redis-aof',
          title: 'AOF 等价写命令 / 文件缓存与稳定文件',
          columns: ['位置', '命令序列'],
          rows: [
            {
              id: 'os',
              values: ['OS 文件缓存', s.aofOs.map((c) => `${c.seq}:SET ${c.value}`).join(' → ') || '空'],
            },
            {
              id: 'disk',
              values: ['稳定 AOF', s.aofDisk.map((c) => `${c.seq}:SET ${c.value}`).join(' → ') || '空'],
            },
          ],
        },
      ],
      caption:
        '单个 counter，RDB 固定开始时点，AOF 用等价 SET 表达命令重放；always 在 fsync 后确认，everysec 由显式 fsync 步骤推进。断电假设未持久页丢失。重写用基线加增量并原子替换解释语义，不复刻 Redis 7 多段 AOF、真实 fork/COW 页、磁盘错误或校验损坏。',
    },
    metrics: [
      { label: '内存 counter', value: s.alive ? s.value : '实例停止' },
      { label: '已确认写入序号', value: s.acked },
      { label: '恢复丢失写入数', value: s.lost },
      { label: 'fsync 次数', value: s.fsyncs },
      { label: '完整 AOF 重写次数', value: s.rewrites },
    ],
    controls: [
      {
        id: 'mode',
        kind: 'select',
        label: '新实例持久化策略',
        value: s.mode,
        options: [
          { value: 'rdb', label: 'RDB 快照' },
          { value: 'everysec', label: 'AOF everysec / 显式时钟同步' },
          { value: 'always', label: 'AOF always / 同步后确认' },
        ],
      },
      ...[
        ['write', 'INCR 并观察客户端确认'],
        ['save-start', 'BGSAVE · 固定快照时点'],
        ['save-finish', '完成 RDB 并替换稳定文件'],
        ['fsync', 'AOF 执行一次 fsync'],
        ['rewrite-start', '开始 AOF 重写'],
        ['rewrite-finish', '持久化新 AOF 并原子切换'],
        ['crash', '模拟整机断电'],
        ['recover', '按当前策略恢复实例'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'write' })),
    ],
    status: {
      title: s.error
        ? '持久化操作前提未满足'
        : reached
          ? '三种确认与恢复边界已比较'
          : '收到 OK 不总等于断电后可恢复',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        'RDB 在两次写入之间开始快照，保存并恢复；再对照 everysec 未同步丢失与 always 同步后确认。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '验证 RDB 的快照时点、everysec 未同步尾部丢失，以及 always 已确认写入的恢复。', reached },
    log: s.log,
  }
}
export const persistenceEngine: EngineFactory = () =>
  createSession(initialPersistence, persistenceTransition, presentPersistence)
