import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export interface FileInode {
  id: number
  size: number
  blocks: number[]
}
export interface FileHandle {
  fd: number
  inode: number
  offset: number
}
export interface FileState {
  entries: { name: string; inode: number }[]
  inodes: FileInode[]
  blocks: (string | null)[]
  handles: FileHandle[]
  nextInode: number
  nextFd: number
  name: string
  alias: string
  data: string
  fd: number
  count: number
  lastRead: string | null
  linked: number[]
  orphanRead: number[]
  reclaimed: number[]
  error: string | null
  log: Observation[]
}
const blockSize = 4
const validName = (name: string) => /^[A-Za-z0-9_.-]{1,12}$/.test(name) && !['.', '..'].includes(name)
const validData = (data: string) => /^[\x20-\x7e]{0,24}$/.test(data)
export function initialFileSystem(): FileState {
  return {
    entries: [{ name: 'note', inode: 1 }],
    inodes: [{ id: 1, size: 8, blocks: [0, 1] }],
    blocks: ['ABCD', '1234', ...Array<string | null>(10).fill(null)],
    handles: [],
    nextInode: 2,
    nextFd: 3,
    name: 'note',
    alias: 'copy',
    data: 'ABCD1234',
    fd: 3,
    count: 4,
    lastRead: null,
    linked: [],
    orphanRead: [],
    reclaimed: [],
    error: null,
    log: [],
  }
}
export const fileLinkCount = (s: FileState, id: number) =>
  s.entries.filter((entry) => entry.inode === id).length
export function readInode(s: FileState, inode: FileInode): string {
  return inode.blocks
    .map((id) => s.blocks[id] ?? '')
    .join('')
    .slice(0, inode.size)
}
function collectUnlinked(s: FileState): void {
  for (const inode of s.inodes) {
    if (fileLinkCount(s, inode.id) || s.handles.some((handle) => handle.inode === inode.id)) continue
    for (const block of inode.blocks) s.blocks[block] = null
    s.reclaimed.push(inode.id)
  }
  s.inodes = s.inodes.filter((inode) => !s.reclaimed.includes(inode.id))
}
function replaceFileData(s: FileState, inode: FileInode, data: string): boolean {
  const required = Math.ceil(data.length / blockSize)
  const available = [...inode.blocks, ...s.blocks.flatMap((value, i) => (value === null ? [i] : []))]
  if (required > available.length) return false
  for (const block of inode.blocks) s.blocks[block] = null
  inode.blocks = available.slice(0, required)
  inode.size = data.length
  inode.blocks.forEach((id, i) => {
    s.blocks[id] = data.slice(i * blockSize, (i + 1) * blockSize)
  })
  return true
}
export function fileTransition(state: FileState, action: ExperimentAction): FileState {
  if (['name', 'alias', 'data'].includes(action.type))
    return { ...state, [action.type]: String(action.value ?? ''), error: null }
  if (action.type === 'count') {
    const count = boundedInteger(action.value, 1, 24)
    return count === null ? state : { ...state, count }
  }
  if (action.type === 'fd') {
    const fd = boundedInteger(action.value, 3, Number.MAX_SAFE_INTEGER)
    return fd !== null && state.handles.some((h) => h.fd === fd) ? { ...state, fd } : state
  }
  if (!['create', 'write', 'link', 'unlink', 'open', 'read', 'seek', 'close'].includes(action.type))
    return state
  const s: FileState = {
    ...state,
    entries: state.entries.map((entry) => ({ ...entry })),
    inodes: state.inodes.map((inode) => ({ ...inode, blocks: [...inode.blocks] })),
    blocks: [...state.blocks],
    handles: state.handles.map((handle) => ({ ...handle })),
    linked: [...state.linked],
    orphanRead: [...state.orphanRead],
    reclaimed: [...state.reclaimed],
    error: null,
  }
  const fail = (error: string): FileState => ({
    ...state,
    error,
    log: addLog(state.log, '操作未完成', error, 'warning'),
  })
  const entry = s.entries.find((entry) => entry.name === s.name)
  const inode = entry && s.inodes.find((inode) => inode.id === entry.inode)
  const handle = s.handles.find((handle) => handle.fd === s.fd)
  let detail = ''
  if (['create', 'write', 'link', 'unlink', 'open'].includes(action.type) && !validName(s.name))
    return fail('文件名限 1–12 个英文字母、数字、点、下划线或连字符，不能是 . 或 ..。')
  if (action.type === 'create' || action.type === 'write') {
    if (!validData(s.data)) return fail('教学文件限 0–24 个可打印 ASCII 字节。')
    if (action.type === 'create' && entry) return fail('文件名已经存在。')
    if (action.type === 'write' && !inode) return fail('名称不存在；已打开的 FD 不会自动赋予这个名称。')
    if (action.type === 'create' && (s.inodes.length >= 8 || s.entries.length >= 16))
      return fail('已达到 8 个 inode 或 16 个目录项的模型上限。')
    const target = action.type === 'create' ? { id: s.nextInode, size: 0, blocks: [] } : inode!
    if (!replaceFileData(s, target, s.data)) return fail('空闲块不足，操作原子拒绝，旧数据保持完整。')
    if (action.type === 'create') {
      s.nextInode++
      s.inodes.push(target)
      s.entries.push({ name: s.name, inode: target.id })
    }
    detail = `${s.name} → inode ${target.id}，${target.size} 字节使用 ${target.blocks.length} 个块；同 inode 的其他名字和 FD 看到同一份数据。`
  } else if (action.type === 'link') {
    if (!inode) return fail('源文件名不存在。')
    if (!validName(s.alias) || s.entries.some((entry) => entry.name === s.alias))
      return fail('硬链接的新名称必须合法且尚不存在。')
    if (s.entries.length >= 16) return fail('目录项已达到模型上限 16。')
    s.entries.push({ name: s.alias, inode: inode.id })
    if (!s.linked.includes(inode.id)) s.linked.push(inode.id)
    detail = `${s.alias} 与 ${s.name} 指向同一个 inode ${inode.id}，nlink=${fileLinkCount(s, inode.id)}；没有复制数据块。`
  } else if (action.type === 'unlink') {
    if (!inode) return fail('文件名不存在。')
    s.entries = s.entries.filter((entry) => entry.name !== s.name)
    collectUnlinked(s)
    detail = `移除名称 ${s.name}。inode ${inode.id} 剩 ${fileLinkCount(s, inode.id)} 个硬链接、${s.handles.filter((h) => h.inode === inode.id).length} 个打开引用；${s.inodes.some((n) => n.id === inode.id) ? '数据仍保留' : '已回收 inode 与数据块'}。`
  } else if (action.type === 'open') {
    if (!inode) return fail('找不到目录项，无法通过此名称打开。')
    if (s.handles.length >= 8) return fail('最多同时打开 8 个 FD。')
    s.fd = s.nextFd++
    s.handles.push({ fd: s.fd, inode: inode.id, offset: 0 })
    detail = `FD ${s.fd} 引用 inode ${inode.id}，独立文件偏移从 0 开始；后续 read 不再查这个文件名。`
  } else {
    if (!handle) return fail('没有选中一个打开的 FD。')
    const target = s.inodes.find((inode) => inode.id === handle.inode)!
    if (action.type === 'read') {
      const result = readInode(s, target).slice(handle.offset, handle.offset + s.count)
      handle.offset += result.length
      s.lastRead = result
      if (result.length && !fileLinkCount(s, target.id) && !s.orphanRead.includes(target.id))
        s.orphanRead.push(target.id)
      detail = `FD ${handle.fd} 从 inode ${target.id} 读取 ${result.length} 字节${result ? `「${result}」` : '，返回 EOF'}，偏移变为 ${handle.offset}；nlink=${fileLinkCount(s, target.id)}。`
    } else if (action.type === 'seek') {
      handle.offset = 0
      detail = `FD ${handle.fd} 的偏移回到 0，没有复制或重新打开文件。`
    } else {
      s.handles = s.handles.filter((h) => h.fd !== handle.fd)
      s.fd = s.handles[0]?.fd ?? 3
      collectUnlinked(s)
      detail = `关闭 FD ${handle.fd}。inode ${target.id} ${s.inodes.some((n) => n.id === target.id) ? '仍有名称或其他打开引用，继续保留' : '没有名称也没有打开引用，已回收数据块'}。`
    }
  }
  s.log = addLog(s.log, action.type, detail, 'success')
  return s
}
export function presentFileSystem(s: FileState): ExperimentView {
  const reached = s.reclaimed.some((id) => s.linked.includes(id) && s.orphanRead.includes(id))
  const hasFd = s.handles.some((h) => h.fd === s.fd)
  return {
    scene: {
      kind: 'data',
      title: '名字、对象与打开引用是三层关系',
      tables: [
        {
          id: 'fs-directory',
          title: '根目录的名字 → inode',
          columns: ['名称', 'inode'],
          rows: s.entries.map((entry) => ({ id: entry.name, values: [entry.name, entry.inode] })),
        },
        {
          id: 'fs-inodes',
          title: 'inode 元数据',
          columns: ['inode', '字节数', '数据块', 'nlink', '打开引用'],
          rows: s.inodes.map((inode) => ({
            id: String(inode.id),
            values: [
              inode.id,
              inode.size,
              inode.blocks.join(', ') || '无',
              fileLinkCount(s, inode.id),
              s.handles.filter((h) => h.inode === inode.id).length,
            ],
          })),
        },
        {
          id: 'fs-handles',
          title: '进程的打开文件',
          columns: ['FD', 'inode', '当前偏移'],
          rows: s.handles.map((h) => ({ id: String(h.fd), values: [h.fd, h.inode, h.offset] })),
        },
        {
          id: 'fs-blocks',
          title: '磁盘块分配（每块 4 字节）',
          columns: ['块号', '内容', '状态'],
          rows: s.blocks.map((data, i) => ({
            id: String(i),
            values: [i, data ?? '—', data === null ? '空闲' : '占用'],
          })),
        },
      ],
      caption:
        '单目录、单进程、无软链接的 inode 模型。每次 open 建立独立偏移，未模拟 dup / fork 共享的 open file description；数据块立即更新，不涉及 Page Cache 与崩溃恢复。',
    },
    metrics: [
      { label: '目录项数量', value: s.entries.length },
      { label: '存活 inode', value: s.inodes.length },
      { label: '已分配数据块', value: s.blocks.filter((b) => b !== null).length },
      { label: '打开 FD 数量', value: s.handles.length },
      { label: '最近读取内容', value: s.lastRead === null ? '—' : s.lastRead || 'EOF' },
    ],
    controls: [
      { id: 'name', kind: 'text', label: '文件名', value: s.name },
      { id: 'alias', kind: 'text', label: '新硬链接名称', value: s.alias },
      { id: 'data', kind: 'text', label: '文件完整内容 / ASCII', value: s.data },
      {
        id: 'fd',
        kind: 'select',
        label: '当前文件描述符',
        value: s.fd,
        disabled: !s.handles.length,
        options: s.handles.length
          ? s.handles.map((h) => ({ value: String(h.fd), label: `FD ${h.fd} → inode ${h.inode}` }))
          : [{ value: '3', label: '尚未打开文件' }],
      },
      { id: 'count', kind: 'number', label: '每次读取字节数', value: s.count, min: 1, max: 24 },
      { id: 'open', kind: 'button', label: 'open · 打开文件', primary: true },
      { id: 'link', kind: 'button', label: 'link · 创建硬链接' },
      { id: 'unlink', kind: 'button', label: 'unlink · 删除名称' },
      { id: 'read', kind: 'button', label: 'read · 从 FD 读取', disabled: !hasFd },
      { id: 'seek', kind: 'button', label: 'seek · 回到文件开头', disabled: !hasFd },
      { id: 'close', kind: 'button', label: 'close · 关闭 FD', disabled: !hasFd },
      { id: 'create', kind: 'button', label: '创建新文件' },
      { id: 'write', kind: 'button', label: '替换文件全部内容' },
    ],
    status: {
      title: s.error
        ? '检查文件操作'
        : reached
          ? '最后一个引用消失后才回收'
          : '文件名消失，打开的对象仍可能存在',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先打开 note，为它创建 copy 硬链接，再删除两个名称；通过 FD 读出内容，最后关闭观察回收。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: { label: '为同一 inode 建立硬链接，删除全部名称后通过 FD 读取，再关闭最后的引用并回收。', reached },
    log: s.log,
  }
}
export const fileSystemEngine: EngineFactory = () =>
  createSession(initialFileSystem, fileTransition, presentFileSystem)
