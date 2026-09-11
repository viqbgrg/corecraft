import { describe, expect, it } from 'vitest'
import {
  finishTransfer,
  initialTransfer,
  transferFinished,
  transferStep,
  transferTransition,
  type TransferMode,
} from '../../src/experiments/models/interrupt-dma'
import {
  fileLinkCount,
  fileTransition,
  initialFileSystem,
  presentFileSystem,
  readInode,
  type FileState,
} from '../../src/experiments/models/filesystem'
import {
  initialPageCache,
  pageCacheTransition,
  presentPageCache,
} from '../../src/experiments/models/page-cache'
import { initialIo, ioTransition, presentIo, type IoMode } from '../../src/experiments/models/io-multiplexing'

describe('device transfers and CPU accounting', () => {
  it('preserves bytes, bus bandwidth accounting and background context across three strategies', () => {
    for (const mode of ['polling', 'interrupt', 'dma'] as TransferMode[])
      for (const interval of [1, 3, 8])
        for (const bytes of [1, 6, 8]) {
          const initial = initialTransfer(mode, bytes, interval, 12),
            result = finishTransfer(initial)
          expect(transferFinished(result)).toBe(true)
          expect(result.memory).toEqual(Array.from({ length: bytes }, (_, i) => (i + 1) * 11))
          expect(result.produced).toBe(bytes)
          expect(result.fifo).toEqual([])
          expect(result.pc).toBe(12)
          expect(result.savedPc).toBeNull()
          expect(result.tick).toBe(
            result.pc + result.polls + result.copies + result.setup + result.overhead + result.idle,
          )
          expect(result.history.filter((tick) => tick.bus !== '空闲')).toHaveLength(bytes)
          expect(result.copies).toBe(mode === 'dma' ? 0 : bytes)
          expect(result.interrupts).toBe(mode === 'dma' ? 1 : mode === 'polling' ? 0 : result.overhead / 2)
          expect(initial.tick).toBe(0)
          expect(initial.memory).toEqual([])
        }
  })
  it('returns to the interrupted background PC and compares independent equal workloads', () => {
    let s = initialTransfer('interrupt')
    while (s.savedPc === null) s = transferStep(s)
    const saved = s.savedPc
    while (s.handler !== null) {
      s = transferStep(s)
      expect(s.pc).toBe(saved)
    }
    const compared = transferTransition(initialTransfer(), { type: 'compare' })
    expect(compared.memory).toEqual([])
    expect(compared.comparison.map((row) => row.transfers)).toEqual([6, 6, 6])
    expect(compared.comparison.map((row) => row.work)).toEqual([12, 12, 12])
    expect(compared.comparison[0]!.polls).toBeGreaterThan(0)
    expect(compared.comparison[2]!.copies).toBe(0)
    expect(() => initialTransfer('dma', 0)).toThrow()
  })
})

function checkFileInvariants(s: FileState) {
  const allocated = s.inodes.flatMap((inode) => inode.blocks)
  expect(new Set(allocated).size).toBe(allocated.length)
  expect(allocated.length).toBe(s.blocks.filter((block) => block !== null).length)
  for (const inode of s.inodes) {
    expect(inode.blocks.length).toBe(Math.ceil(inode.size / 4))
    expect(readInode(s, inode).length).toBe(inode.size)
    expect(fileLinkCount(s, inode.id) > 0 || s.handles.some((h) => h.inode === inode.id)).toBe(true)
  }
  for (const reference of [...s.entries, ...s.handles])
    expect(s.inodes.some((inode) => inode.id === reference.inode)).toBe(true)
}
describe('directory names, inode lifetime and block allocation', () => {
  it('retains an unnamed inode until its last open descriptor closes', () => {
    let s = initialFileSystem()
    const act = (type: string, value?: string | number) => {
      s = fileTransition(s, { type, value })
      checkFileInvariants(s)
    }
    act('open')
    act('open')
    act('link')
    expect(fileLinkCount(s, 1)).toBe(2)
    expect(s.blocks.filter((b) => b !== null)).toHaveLength(2)
    act('unlink')
    act('name', 'copy')
    act('unlink')
    expect(s.entries).toEqual([])
    expect(s.inodes).toHaveLength(1)
    act('read')
    expect(s.lastRead).toBe('ABCD')
    expect(s.handles.map((h) => h.offset)).toEqual([0, 4])
    act('close')
    expect(s.inodes).toHaveLength(1)
    act('read')
    expect(s.lastRead).toBe('ABCD')
    act('read')
    act('read')
    expect(s.lastRead).toBe('')
    act('close')
    expect(s.inodes).toEqual([])
    expect(s.blocks.every((b) => b === null)).toBe(true)
    expect(presentFileSystem(s).goal.reached).toBe(true)
  })
  it('updates hard-linked content without duplicating blocks and refuses capacity overflow atomically', () => {
    let s = fileTransition(initialFileSystem(), { type: 'link' })
    const act = (type: string, value?: string | number) => {
      s = fileTransition(s, { type, value })
      checkFileInvariants(s)
    }
    act('name', 'copy')
    act('data', 'new')
    act('write')
    expect(readInode(s, s.inodes[0]!)).toBe('new')
    expect(s.entries[0]!.inode).toBe(s.entries[1]!.inode)
    act('name', 'b')
    act('data', 'x'.repeat(24))
    act('create')
    act('name', 'c')
    act('data', 'y'.repeat(20))
    act('create')
    expect(s.blocks.filter((b) => b !== null)).toHaveLength(12)
    act('name', 'note')
    act('data', 'longer-content')
    const before = s
    act('write')
    expect(s.error).toContain('空闲块不足')
    expect(s.blocks).toEqual(before.blocks)
    expect(s.inodes).toEqual(before.inodes)
    act('data', '')
    act('write')
    expect(s.inodes[0]!.blocks).toEqual([])
    expect(s.blocks.filter((b) => b !== null)).toHaveLength(11)
  })
})

describe('file Page Cache, lazy mappings and COW', () => {
  it('distinguishes cache residency, shared visibility, private isolation and persistence', () => {
    let s = initialPageCache()
    const act = (type: string, value?: string | number) => {
      s = pageCacheTransition(s, { type, value })
    }
    act('map')
    expect(s.reads).toBe(0)
    expect(s.mappings[0]!.resident).toEqual([])
    act('buffered-read')
    expect(s.reads).toBe(1)
    expect(s.faults).toBe(0)
    act('load')
    expect(s.reads).toBe(1)
    expect(s.faults).toBe(1)
    act('store')
    expect(s.disk[0]).toBe(10)
    act('process', 'Q')
    act('map')
    act('load')
    expect(s.lastRead).toBe(99)
    expect(s.reads).toBe(1)
    expect(s.faults).toBe(2)
    expect(s.sharedObserved).toBe(true)
    act('mode', 'private')
    act('map')
    act('value', 77)
    act('store')
    act('msync')
    expect(s.disk[0]).toBe(10)
    expect(s.writes).toBe(0)
    act('load')
    expect(s.lastRead).toBe(77)
    act('process', 'P')
    act('load')
    expect(s.lastRead).toBe(99)
    expect(s.privateObserved).toBe(true)
    act('fsync')
    expect(s.disk[0]).toBe(99)
    expect(s.writes).toBe(1)
    expect(presentPageCache(s).goal.reached).toBe(true)
    act('crash')
    act('buffered-read')
    expect(s.lastRead).toBe(99)
  })
  it('writes back dirty eviction, invalidates file mappings, and preserves independent COW pages', () => {
    let s = initialPageCache(1)
    const act = (type: string, value?: string | number) => {
      s = pageCacheTransition(s, { type, value })
    }
    act('map')
    act('store')
    act('process', 'Q')
    act('mode', 'private')
    act('map')
    act('value', 77)
    act('store')
    const before = s
    act('page', 1)
    act('buffered-read')
    expect(s.disk[0]).toBe(99)
    expect(s.writes).toBe(1)
    expect(s.mappings.find((m) => m.process === 'P')!.resident).toEqual([])
    expect(s.mappings.find((m) => m.process === 'Q')!.resident).toEqual([0])
    expect(before.disk[0]).toBe(10)
    act('page', 0)
    act('load')
    expect(s.lastRead).toBe(77)
    expect(s.reads).toBe(2)
    act('process', 'P')
    act('load')
    expect(s.lastRead).toBe(99)
    expect(s.reads).toBe(3)
  })
  it('loses unsynced dirty memory on crash and counts a resident private write fault once', () => {
    let s = initialPageCache()
    for (const type of ['map', 'store', 'crash', 'buffered-read']) s = pageCacheTransition(s, { type })
    expect(s.lastRead).toBe(10)
    s = pageCacheTransition(s, { type: 'mode', value: 'private' })
    for (const type of ['map', 'load', 'store', 'store']) s = pageCacheTransition(s, { type })
    expect(s.cowFaults).toBe(1)
    expect(s.faults).toBe(3)
  })
})

describe('blocking, nonblocking and readiness notification', () => {
  it('a blocking read remains tied to its FD while another descriptor receives data', () => {
    let s = ioTransition(initialIo('blocking'), { type: 'read' })
    expect(s.pending?.fd).toBe(3)
    s = ioTransition(s, { type: 'arrival-fd', value: 99 })
    s = ioTransition(s, { type: 'arrive' })
    expect(s.pending?.fd).toBe(3)
    expect(s.buffers[2]!.data).toBe('abcd')
    s = ioTransition(s, { type: 'arrival-fd', value: 3 })
    s = ioTransition(s, { type: 'arrive' })
    expect(s.pending).toBeNull()
    expect(s.lastResult).toBe('ab')
    expect(s.reads).toBe(1)
    const nonblocking = ioTransition(initialIo('nonblocking'), { type: 'read' })
    expect(nonblocking.lastResult).toBe('EAGAIN')
    expect(nonblocking.pending).toBeNull()
  })
  it('ET can be silent with unread bytes and draining ends at EAGAIN without data loss', () => {
    let s = initialIo()
    for (const type of ['arrive', 'wait', 'read', 'wait']) s = ioTransition(s, { type })
    expect(s.reported).toEqual([])
    expect(s.buffers[0]!.data).toBe('cd')
    expect(s.silence).toBe(true)
    s = ioTransition(s, { type: 'drain' })
    s = ioTransition(s, { type: 'compare' })
    expect(s.reads).toBe(3)
    expect(s.eagain).toBe(1)
    expect(s.buffers[0]!.consumed).toBe('abcd')
    expect(presentIo(s).goal.reached).toBe(true)
  })
  it('new arrivals can notify an already nonempty ET socket and events coalesce', () => {
    let s = initialIo()
    for (const type of ['arrive', 'wait', 'read', 'arrive', 'arrive']) s = ioTransition(s, { type })
    expect(s.events).toEqual([3])
    s = ioTransition(s, { type: 'wait' })
    expect(s.reported).toEqual([3])
    expect(s.buffers[0]!.data).toBe('cdabcdabcd')
    s = ioTransition(s, { type: 'drain' })
    expect(s.buffers[0]!.consumed).toBe(s.buffers[0]!.received)
  })
  it('LT repeats unread readiness; select, poll and ready sets expose different candidate ranges', () => {
    for (const mode of ['select', 'poll', 'epoll-lt'] as IoMode[]) {
      let s = initialIo(mode)
      for (const type of ['arrive', 'wait', 'read', 'wait', 'compare']) s = ioTransition(s, { type })
      expect(s.reported).toEqual([3])
      expect(s.checks).toBe(mode === 'select' ? 200 : mode === 'poll' ? 6 : 2)
      expect(s.comparison.map((row) => row.candidates)).toEqual([100, 3, 1])
      expect(s.comparison.map((row) => row.ready)).toEqual([[3], [3], [3]])
    }
  })
})
