import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type MappingMode = 'shared' | 'private'
export type ProcessId = 'P' | 'Q'
export interface CachedFilePage {
  page: number
  value: number
  dirty: boolean
  used: number
  writer: ProcessId | null
}
export interface FileMapping {
  process: ProcessId
  mode: MappingMode
  resident: number[]
  copies: { page: number; value: number }[]
}
export interface PageCacheState {
  capacity: number
  disk: number[]
  cache: CachedFilePage[]
  mappings: FileMapping[]
  clock: number
  process: ProcessId
  mode: MappingMode
  page: number
  value: number
  reads: number
  writes: number
  hits: number
  faults: number
  cowFaults: number
  lastRead: number | null
  sharedObserved: boolean
  privateObserved: boolean
  persisted: boolean
  error: string | null
  log: Observation[]
}
export function initialPageCache(capacity = 2): PageCacheState {
  if (boundedInteger(capacity, 1, 3) === null) throw new Error('Page Cache capacity must be 1–3')
  return {
    capacity,
    disk: [10, 20, 30, 40],
    cache: [],
    mappings: [],
    clock: 0,
    process: 'P',
    mode: 'shared',
    page: 0,
    value: 99,
    reads: 0,
    writes: 0,
    hits: 0,
    faults: 0,
    cowFaults: 0,
    lastRead: null,
    sharedObserved: false,
    privateObserved: false,
    persisted: false,
    error: null,
    log: [],
  }
}
function writeBack(s: PageCacheState, page: CachedFilePage): void {
  if (!page.dirty) return
  if (s.disk[page.page] !== page.value) s.persisted = true
  s.disk[page.page] = page.value
  page.dirty = false
  s.writes++
  s.log = addLog(s.log, '脏页写回', `文件页 ${page.page} 的值 ${page.value} 写入磁盘。`, 'success')
}
function ensureCached(s: PageCacheState, page: number): CachedFilePage {
  s.clock++
  const cached = s.cache.find((entry) => entry.page === page)
  if (cached) {
    cached.used = s.clock
    s.hits++
    return cached
  }
  if (s.cache.length === s.capacity) {
    const victim = [...s.cache].sort((a, b) => a.used - b.used)[0]!
    writeBack(s, victim)
    s.cache = s.cache.filter((entry) => entry.page !== victim.page)
    for (const mapping of s.mappings)
      if (!mapping.copies.some((copy) => copy.page === victim.page))
        mapping.resident = mapping.resident.filter((p) => p !== victim.page)
    s.log = addLog(
      s.log,
      'LRU 回收文件页',
      `移除缓存页 ${victim.page}，同时撤销指向该页的驻留映射；独立 COW 副本不受影响。`,
    )
  }
  const created = { page, value: s.disk[page]!, dirty: false, used: s.clock, writer: null }
  s.cache.push(created)
  s.reads++
  s.log = addLog(s.log, '从磁盘读页', `文件页 ${page} 装入 Page Cache，值=${created.value}。`)
  return created
}
function mappingRead(s: PageCacheState, mapping: FileMapping): number {
  const privateCopy = mapping.copies.find((copy) => copy.page === s.page)
  if (privateCopy) return privateCopy.value
  if (!mapping.resident.includes(s.page)) {
    s.faults++
    mapping.resident.push(s.page)
  }
  const cached = ensureCached(s, s.page)
  if (mapping.mode === 'shared' && cached.writer && cached.writer !== mapping.process) s.sharedObserved = true
  if (
    mapping.mode === 'shared' &&
    s.mappings.some(
      (other) =>
        other.process !== mapping.process &&
        other.copies.some((copy) => copy.page === s.page && copy.value !== cached.value),
    )
  )
    s.privateObserved = true
  return cached.value
}
export function pageCacheTransition(state: PageCacheState, a: ExperimentAction): PageCacheState {
  if (a.type === 'process' && ['P', 'Q'].includes(String(a.value)))
    return { ...state, process: a.value as ProcessId, error: null }
  if (a.type === 'mode' && ['shared', 'private'].includes(String(a.value)))
    return { ...state, mode: a.value as MappingMode }
  if (a.type === 'page' || a.type === 'value' || a.type === 'capacity') {
    const value = boundedInteger(
      a.value,
      a.type === 'value' ? -99 : a.type === 'page' ? 0 : 1,
      a.type === 'value' ? 99 : 3,
    )
    if (value === null) return state
    return a.type === 'capacity' ? initialPageCache(value) : { ...state, [a.type]: value, error: null }
  }
  if (!['map', 'buffered-read', 'load', 'store', 'fsync', 'msync', 'crash'].includes(a.type)) return state
  const s: PageCacheState = {
    ...state,
    disk: [...state.disk],
    cache: state.cache.map((entry) => ({ ...entry })),
    mappings: state.mappings.map((m) => ({
      ...m,
      resident: [...m.resident],
      copies: m.copies.map((copy) => ({ ...copy })),
    })),
    error: null,
  }
  const mapping = s.mappings.find((m) => m.process === s.process)
  let detail = ''
  if (a.type === 'map') {
    s.mappings = s.mappings.filter((m) => m.process !== s.process)
    s.mappings.push({ process: s.process, mode: s.mode, resident: [], copies: [] })
    detail = `${s.process} 建立 MAP_${s.mode.toUpperCase()} 文件映射（若已有则先解除旧映射）；没有读盘，尚无驻留页。`
  } else if (a.type === 'crash') {
    s.cache = []
    s.mappings = []
    s.lastRead = null
    detail = '模拟进程与易失缓存全部丢失。未写回的共享修改和私有副本消失，磁盘仅保留已经完成的写回。'
  } else if (a.type === 'buffered-read') {
    s.lastRead = ensureCached(s, s.page).value
    detail = `read(2) 经文件页缓存读到 ${s.lastRead}；用户空间接收一次逻辑复制，不创建 mmap 页表项。`
  } else if (a.type === 'fsync' || a.type === 'msync') {
    if (a.type === 'msync' && !mapping) return { ...state, error: '当前进程尚未建立映射。' }
    const before = s.writes
    if (a.type === 'fsync' || mapping?.mode === 'shared') for (const page of s.cache) writeBack(s, page)
    detail =
      a.type === 'msync' && mapping?.mode === 'private'
        ? 'MAP_PRIVATE 的 COW 副本不写回文件；msync 不会把私有修改变成共享修改。'
        : `${a.type} 等待本模型文件范围的 ${s.writes - before} 个脏页完成写回。`
  } else {
    if (!mapping) return { ...state, error: '先为当前进程建立 mmap 映射。' }
    const wasResident = mapping.resident.includes(s.page)
    const before = mappingRead(s, mapping)
    if (a.type === 'load') {
      s.lastRead = before
      detail = `${s.process} 通过映射读文件页 ${s.page}，得到 ${before}。缺页可以命中 Page Cache，不必每次读盘。`
    } else if (mapping.mode === 'shared') {
      const cached = s.cache.find((entry) => entry.page === s.page)!
      cached.value = s.value
      cached.dirty = true
      cached.writer = s.process
      detail = `${s.process} 修改共享文件页 ${s.page}：${before} → ${s.value}。其他共享映射可见，磁盘尚未因此更新。`
    } else {
      let copy = mapping.copies.find((copy) => copy.page === s.page)
      if (!copy) {
        copy = { page: s.page, value: before }
        mapping.copies.push(copy)
        s.cowFaults++
        if (wasResident) s.faults++
      }
      copy.value = s.value
      detail = `${s.process} 对页 ${s.page} 的私有副本写入 ${s.value}；共享文件页仍为 ${s.cache.find((entry) => entry.page === s.page)?.value ?? s.disk[s.page]}。`
    }
  }
  s.log = addLog(s.log, a.type, detail, a.type === 'crash' ? 'warning' : 'success')
  return s
}
export function presentPageCache(s: PageCacheState): ExperimentView {
  const mapping = s.mappings.find((m) => m.process === s.process)
  const reached = s.sharedObserved && s.privateObserved && s.persisted
  return {
    scene: {
      kind: 'data',
      title: '磁盘、共享文件页与进程私有页',
      tables: [
        {
          id: 'page-cache-disk',
          title: '磁盘上的文件页',
          columns: ['页', '磁盘值', '缓存值', '缓存状态'],
          rows: s.disk.map((value, page) => {
            const entry = s.cache.find((entry) => entry.page === page)
            return {
              id: String(page),
              values: [
                page,
                value,
                entry?.value ?? '不在缓存',
                entry ? (entry.dirty ? '脏页' : '干净') : '—',
              ],
            }
          }),
        },
        {
          id: 'file-mappings',
          title: '映射与驻留状态',
          columns: ['进程 / 模式', '文件页', '驻留', '本进程读取的值'],
          rows: s.mappings.flatMap((m) =>
            s.disk.map((_, page) => {
              const copy = m.copies.find((c) => c.page === page),
                resident = m.resident.includes(page)
              return {
                id: `${m.process}-${page}`,
                values: [
                  `${m.process} / ${m.mode}`,
                  page,
                  resident ? (copy ? '私有 COW 页' : '共享文件页') : '未驻留',
                  resident
                    ? (copy?.value ?? s.cache.find((c) => c.page === page)?.value ?? '—')
                    : '访问时再调入',
                ],
              }
            }),
          ),
        },
      ],
      caption:
        'LRU 容量只限制共享文件页缓存，私有 COW 页另行占用内存且本模型不回收。共享页淘汰前写回脏数据并撤销对应映射。每页用一个整数代表内容，不模拟文件元数据、日志和真实磁盘屏障。',
    },
    metrics: [
      { label: '磁盘读页', value: s.reads },
      { label: '磁盘写页', value: s.writes },
      { label: '缺页处理次数', value: s.faults },
      { label: '私有 COW 次数', value: s.cowFaults },
      { label: '最近读取值', value: s.lastRead ?? '—' },
      { label: '脏文件页', value: s.cache.filter((page) => page.dirty).length },
    ],
    controls: [
      {
        id: 'process',
        kind: 'select',
        label: '当前映射进程',
        value: s.process,
        options: [
          { value: 'P', label: '进程 P' },
          { value: 'Q', label: '进程 Q' },
        ],
      },
      {
        id: 'mode',
        kind: 'select',
        label: '新映射方式',
        value: s.mode,
        options: [
          { value: 'shared', label: 'MAP_SHARED' },
          { value: 'private', label: 'MAP_PRIVATE' },
        ],
      },
      { id: 'page', kind: 'number', label: '文件页号', value: s.page, min: 0, max: 3 },
      { id: 'value', kind: 'number', label: '写入页值', value: s.value, min: -99, max: 99 },
      {
        id: 'capacity',
        kind: 'number',
        label: '文件页缓存容量 / 修改会重置',
        value: s.capacity,
        min: 1,
        max: 3,
      },
      { id: 'map', kind: 'button', label: 'mmap · 建立或替换映射', primary: true },
      { id: 'buffered-read', kind: 'button', label: 'read · 经 Page Cache 读取' },
      { id: 'load', kind: 'button', label: 'load · 读取映射页', disabled: !mapping },
      { id: 'store', kind: 'button', label: 'store · 修改映射页', disabled: !mapping },
      { id: 'msync', kind: 'button', label: 'msync · 同步当前映射', disabled: !mapping },
      { id: 'fsync', kind: 'button', label: 'fsync · 同步文件脏页' },
      { id: 'crash', kind: 'button', label: '模拟重启 / 丢弃易失内存' },
    ],
    status: {
      title: s.error ? '检查映射操作' : reached ? '已区分可见性、私有性与持久化' : '建立映射不等于立刻读盘',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '让 P、Q 都共享映射页 0；P 写 99、Q 读。再把 Q 改为私有映射写 77，P 仍读 99，最后同步文件。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '让另一共享映射看见修改，验证私有 COW 隔离，并将改变后的共享页写回磁盘。', reached },
    log: s.log,
  }
}
export const pageCacheEngine: EngineFactory = (config) =>
  createSession(() => initialPageCache(Number(config.capacity ?? 2)), pageCacheTransition, presentPageCache)
