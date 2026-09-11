import { describe, expect, it } from 'vitest'
import { atomicsTransition, initialAtomics, presentAtomics } from '../../src/experiments/models/java-atomics'
import { initialJavaLocks, locksTransition, presentJavaLocks } from '../../src/experiments/models/java-locks'
import {
  coordinationTransition,
  initialCoordination,
  presentCoordination,
} from '../../src/experiments/models/java-coordination'

describe('Java Thread lifecycle, volatile increments and CAS', () => {
  it('loses a volatile increment, then completes both increments through CAS retry and detects ABA with a stamp', () => {
    let s = initialAtomics()
    const act = (type: string, value?: string) => {
      s = atomicsTransition(s, { type, value })
    }
    const readBoth = () => {
      for (const id of ['T1', 'T2']) {
        act('selected', id)
        act('start')
        act('step')
      }
    }
    readBoth()
    act('selected', 'T1')
    act('step')
    act('selected', 'T2')
    act('step')
    expect(s.value).toBe(1)
    expect(s.commits).toBe(2)
    expect(s.lost).toBe(true)
    act('mode', 'cas')
    readBoth()
    act('selected', 'T1')
    act('step')
    act('selected', 'T2')
    act('step')
    expect(s.value).toBe(1)
    expect(s.failures).toBe(1)
    expect(s.threads[1]!.pc).toBe('read')
    act('step')
    act('step')
    act('join')
    expect(s.value).toBe(2)
    expect(s.commits).toBe(2)
    expect(s.joinedCompleted).toBe(true)
    act('mode', 'stamped')
    act('start')
    act('step')
    act('aba')
    act('step')
    expect(s.stampedGuarded).toBe(true)
    expect(s.value).toBe(0)
    expect(s.commits).toBe(0)
    expect(s.stamp).toBe(2)
    expect(presentAtomics(s).goal.reached).toBe(true)
    let plain = initialAtomics('cas')
    for (const type of ['start', 'step', 'aba', 'step']) plain = atomicsTransition(plain, { type })
    expect(plain.value).toBe(1)
    expect(plain.failures).toBe(0)
  })
  it('starts once, treats interrupt cooperatively and retains an already waiting join target', () => {
    let s = initialAtomics()
    const act = (type: string, value?: string) => {
      s = atomicsTransition(s, { type, value })
    }
    act('join')
    expect(s.joinedCompleted).toBe(false)
    act('start')
    act('start')
    expect(s.error).toContain('IllegalThreadStateException')
    act('step')
    act('join')
    act('selected', 'T2')
    act('join')
    expect(s.mainWaiting).toBe('T1')
    act('selected', 'T1')
    act('interrupt')
    expect(s.threads[0]!.state).toBe('RUNNABLE')
    act('step')
    expect(s.threads[0]!.state).toBe('TERMINATED')
    expect(s.commits).toBe(0)
    act('join')
    expect(s.mainWaiting).toBeNull()
    act('start')
    expect(s.error).toContain('IllegalThreadStateException')
    act('selected', 'T2')
    act('start')
    act('interrupt')
    act('clear-interrupt')
    act('step')
    act('step')
    expect(s.value).toBe(1)
  })
})

describe('reentrant locks, condition queues and signal semantics', () => {
  it('releases every reentrant hold for await and restores them only after the signaler releases', () => {
    let s = initialJavaLocks()
    const act = (type: string, value?: string) => {
      s = locksTransition(s, { type, value })
      expect(s.owner === null).toBe(s.holds === 0)
      expect(
        new Set([...s.syncQueue.map((e) => e.thread), ...s.conditionQueue.map((e) => e.thread)]).size,
      ).toBe(s.syncQueue.length + s.conditionQueue.length)
    }
    act('enter')
    act('enter')
    act('await')
    expect(s.holds).toBe(0)
    expect(s.conditionQueue).toEqual([{ thread: 'T1', restore: 2 }])
    act('selected', 'T2')
    act('enter')
    act('produce')
    act('signal')
    expect(s.owner).toBe('T2')
    expect(s.conditionQueue).toEqual([])
    act('selected', 'T1')
    act('enter')
    expect(s.owner).toBe('T2')
    expect(s.syncQueue).toHaveLength(1)
    act('selected', 'T2')
    act('exit')
    act('selected', 'T1')
    act('enter')
    expect(s.owner).toBe('T1')
    expect(s.holds).toBe(2)
    act('consume')
    act('exit')
    expect(s.holds).toBe(1)
    expect(presentJavaLocks(s).goal.reached).toBe(false)
    act('exit')
    expect(presentJavaLocks(s).goal.reached).toBe(true)
  })
  it('rechecks the predicate after spurious wakeup and refuses nonowner signaling or unlock', () => {
    let s = initialJavaLocks()
    for (const type of ['enter', 'enter', 'await', 'spurious', 'enter']) s = locksTransition(s, { type })
    expect(s.owner).toBeNull()
    expect(s.conditionQueue).toEqual([{ thread: 'T1', restore: 2 }])
    expect(s.spuriousHandled).toBe(true)
    expect(s.consumed).toBe(0)
    expect(locksTransition(s, { type: 'signal' }).error).toContain('IllegalMonitorStateException')
    expect(locksTransition(s, { type: 'exit' }).error).toContain('IllegalMonitorStateException')
  })
  it('models fair regular acquisition and nonfair barging without claiming FIFO monitors', () => {
    for (const fair of [true, false]) {
      let s = { ...initialJavaLocks(), fair }
      for (const action of [
        { type: 'enter' },
        { type: 'selected', value: 'T2' },
        { type: 'enter' },
        { type: 'selected', value: 'T1' },
        { type: 'exit' },
        { type: 'selected', value: 'T3' },
        { type: 'enter' },
      ])
        s = locksTransition(s, action)
      expect(s.owner).toBe(fair ? null : 'T3')
      expect(s.syncQueue[0]!.thread).toBe('T2')
    }
    const monitor = locksTransition(initialJavaLocks(), { type: 'kind', value: 'monitor' })
    expect(monitor.fair).toBe(false)
  })
})

describe('CountDownLatch and Semaphore coordination', () => {
  it('awaits completed work once, then reuses two permits among three tasks through explicit retry', () => {
    let s = initialCoordination()
    const act = (type: string, value?: string) => {
      s = coordinationTransition(s, { type, value })
    }
    act('await')
    expect(s.coordinator).toBe('waiting')
    for (const id of ['T1', 'T2', 'T3']) {
      act('selected', id)
      act('finish-latch')
    }
    expect(s.latch).toBe(0)
    expect(s.coordinator).toBe('waiting')
    act('await')
    expect(s.readResults).toEqual([10, 20, 30])
    for (const id of ['T1', 'T2', 'T3']) {
      act('selected', id)
      act('acquire')
      expect(s.active.length + s.permits).toBe(2)
    }
    expect(s.waiters).toEqual(['T3'])
    act('selected', 'T1')
    act('finish-permit')
    expect(s.waiters).toEqual(['T3'])
    act('selected', 'T3')
    act('acquire')
    expect(s.active).toEqual(['T2', 'T3'])
    for (const id of ['T2', 'T3']) {
      act('selected', id)
      act('finish-permit')
    }
    expect(s.permits).toBe(2)
    expect(s.completed).toBe(3)
    expect(presentCoordination(s).goal.reached).toBe(true)
  })
  it('does not equate countDown with task completion or clamp excess Semaphore releases to capacity', () => {
    let s = coordinationTransition(initialCoordination(), { type: 'await' })
    for (let i = 0; i < 5; i++) s = coordinationTransition(s, { type: 'count-down' })
    s = coordinationTransition(s, { type: 'await' })
    expect(s.latch).toBe(0)
    expect(s.readResults).toEqual([])
    expect(s.latchObserved).toBe(false)
    for (const id of ['T1', 'T2', 'T3']) {
      s = coordinationTransition(s, { type: 'selected', value: id })
      s = coordinationTransition(s, { type: 'finish-latch' })
    }
    s = coordinationTransition(s, { type: 'await' })
    expect(s.latchObserved).toBe(false)
    expect(s.published).toEqual([])
    s = coordinationTransition(s, { type: 'raw-release' })
    expect(s.permits).toBe(3)
    for (const id of ['T1', 'T2', 'T3']) {
      s = coordinationTransition(s, { type: 'selected', value: id })
      s = coordinationTransition(s, { type: 'acquire' })
    }
    expect(s.active).toHaveLength(3)
    expect(s.permits).toBe(0)
    expect(s.extraReleases).toBe(1)
  })
})

import {
  executorTransition,
  initialExecutor,
  presentExecutor,
} from '../../src/experiments/models/java-executors'
import {
  concurrentMapEntries,
  concurrentMapTransition,
  initialConcurrentMap,
  locateConcurrentBucket,
  presentConcurrentMap,
} from '../../src/experiments/models/java-concurrent-map'
import { futuresTransition, initialFutures, presentFutures } from '../../src/experiments/models/java-futures'

describe('ThreadPoolExecutor admission, backpressure and shutdown', () => {
  it('queues before growing, reports rejection and finishes CallerRuns before the next submission', () => {
    let s = executorTransition(initialExecutor(), { type: 'burst' })
    expect(s.workers.map((w) => w.task)).toEqual([1, 2, 5])
    expect(s.queue).toEqual([3, 4])
    expect(s.tasks[5]!.state).toBe('rejected')
    s = executorTransition(s, { type: 'policy', value: 'caller' })
    s = executorTransition(s, { type: 'submit' })
    expect(s.callerTask).toBe(7)
    expect(executorTransition(s, { type: 'submit' }).tasks).toHaveLength(7)
    s = executorTransition(s, { type: 'shutdown' })
    expect(s.phase).toBe('shutdown')
    s = executorTransition(s, { type: 'run' })
    expect(s.phase).toBe('terminated')
    expect(s.tasks.filter((t) => t.state === 'completed')).toHaveLength(6)
    expect(s.tasks[2]!.started).toBe(3)
    expect(s.tasks[4]!.started).toBe(0)
    expect(s.peakQueue).toBe(2)
    expect(presentExecutor(s).goal.reached).toBe(true)
  })
  it('returns unstarted tasks and requests cooperative interruption without promising to stop uncooperative tasks', () => {
    for (const cooperative of [true, false]) {
      let s = executorTransition({ ...initialExecutor(), cooperative }, { type: 'burst' })
      s = executorTransition(s, { type: 'shutdown-now' })
      expect(s.queue).toEqual([])
      expect(s.tasks.filter((t) => t.state === 'returned').map((t) => t.id)).toEqual([3, 4])
      expect(s.tasks[0]!.state).toBe('running')
      s = executorTransition(s, { type: 'tick' })
      expect(s.tasks[0]!.state).toBe(cooperative ? 'interrupted' : 'running')
      s = executorTransition(s, { type: 'run' })
      expect(s.phase).toBe('terminated')
    }
  })
  it('hands off at zero queue capacity and does not interrupt the external caller when the pool stops', () => {
    let s = { ...initialExecutor(), core: 1, max: 1, queueCapacity: 0 }
    s = executorTransition(s, { type: 'submit' })
    s = executorTransition(s, { type: 'run' })
    s = executorTransition(s, { type: 'submit' })
    expect(s.workers).toHaveLength(1)
    expect(s.workers[0]!.task).toBe(2)
    expect(s.queue).toEqual([])
    s = executorTransition(s, { type: 'policy', value: 'caller' })
    s = executorTransition(s, { type: 'duration', value: 9 })
    s = executorTransition(s, { type: 'submit' })
    s = executorTransition(s, { type: 'shutdown-now' })
    s = executorTransition(s, { type: 'tick' })
    expect(s.phase).toBe('terminated')
    expect(s.callerTask).toBe(3)
    expect(s.tasks[2]!.interruptRequested).toBe(false)
    s = executorTransition(s, { type: 'run' })
    expect(s.tasks[2]!.state).toBe('completed')
  })
})

describe('ConcurrentHashMap operation boundaries and forwarding', () => {
  it('loses get-plus-put updates, serializes compute, then reads through a forwarding marker', () => {
    let s = initialConcurrentMap()
    const act = (type: string, value?: string) => {
      s = concurrentMapTransition(s, { type, value })
    }
    act('begin')
    act('selected', 'T2')
    act('begin')
    act('advance')
    act('selected', 'T1')
    act('advance')
    expect(concurrentMapEntries(s)[0]!.value).toBe(1)
    expect(s.updates).toBe(2)
    expect(s.lost).toBe(true)
    act('operation', 'compute')
    act('begin')
    act('selected', 'T2')
    act('begin')
    expect(s.pending.T2!.expected).toBeNull()
    act('selected', 'T1')
    act('advance')
    act('selected', 'T2')
    act('advance')
    expect(s.pending.T2!.expected).toBe(2)
    act('advance')
    expect(concurrentMapEntries(s)[0]!.value).toBe(3)
    act('start-resize')
    act('transfer')
    act('transfer')
    act('get')
    expect(s.lastGet).toBe(3)
    expect(s.lastPath).toHaveLength(2)
    act('transfer')
    act('transfer')
    expect(s.root).toBe(1)
    expect(s.locks).toEqual({})
    expect(presentConcurrentMap(s).goal.reached).toBe(true)
  })
  it('blocks a colliding key and transfer, allows another bucket, and keeps pending keys stable', () => {
    let s = { ...initialConcurrentMap(), operation: 'compute' as const }
    const act = (type: string, value?: string) => {
      s = concurrentMapTransition(s, { type, value })
    }
    act('begin')
    act('selected', 'T2')
    act('key', 'E')
    act('begin')
    expect(s.pending.T2!.stage).toBe('wait-read')
    act('selected', 'T3')
    act('key', 'B')
    act('begin')
    expect(s.pending.T3!.expected).toBe(0)
    act('advance')
    act('key', 'A')
    act('get')
    expect(s.lastGet).toBe(0)
    act('start-resize')
    act('transfer')
    act('transfer')
    expect(s.error).toContain('compute')
    expect(s.resize!.cursor).toBe(1)
    act('selected', 'T1')
    act('advance')
    act('transfer')
    act('selected', 'T2')
    act('key', 'Z')
    act('advance')
    act('advance')
    expect(concurrentMapEntries(s)).toEqual([
      { key: 'A', value: 1 },
      { key: 'B', value: 1 },
      { key: 'E', value: 1 },
    ])
    act('transfer')
    act('transfer')
    act('start-resize')
    for (let i = 0; i < 8; i++) act('transfer')
    expect(s.resized).toBe(2)
    expect(s.root).toBe(2)
    expect(s.locks).toEqual({})
    expect(locateConcurrentBucket(s, 'E').table.capacity).toBe(16)
    expect(s.tables.flatMap((t) => t.buckets.flatMap((b) => b.entries))).toHaveLength(3)
  })
})

describe('ForkJoin scheduling and CompletableFuture dependencies', () => {
  it('steals the oldest branch, computes actual sums, and joins normal, exceptional and recovered results', () => {
    let s = initialFutures()
    const act = (type: string, value?: string) => {
      s = futuresTransition(s, { type, value })
    }
    act('step')
    expect(s.deques.W1.map((j) => j.id)).toEqual([2, 3])
    act('selected', 'W2')
    act('step')
    expect(s.tasks[1]!.worker).toBe('W2')
    expect(s.steals).toBe(1)
    act('run')
    expect(s.sum).toBe(36)
    expect(s.tasks[0]!.result).toBe(36)
    expect(s.stages.find((n) => n.id === 'combine')!.state).toBe('pending')
    act('join')
    expect(s.joined).toContain('等待')
    act('remote')
    act('run')
    act('join')
    expect(s.joined).toBe('82')
    act('outcome', 'failure')
    act('rebuild')
    act('remote')
    act('run')
    act('join')
    expect(s.joined).toBe('CompletionException(cause=RemoteException)')
    act('recovery', 'on')
    act('async', 'off')
    act('rebuild')
    act('remote')
    act('join')
    expect(s.joined).toBe('72')
    expect(s.stages.find((n) => n.id === 'recover')!.context).toBe('caller')
    expect(presentFutures(s).goal.reached).toBe(true)
  })
  it('cancels the result without discarding underlying work, and invalidates only stale future callbacks on rebuild', () => {
    let s = futuresTransition(initialFutures(), { type: 'cancel' })
    s = futuresTransition(s, { type: 'run' })
    expect(s.sum).toBe(36)
    s = futuresTransition(s, { type: 'join' })
    expect(s.joined).toBe('CancellationException')
    s = futuresTransition(s, { type: 'rebuild' })
    expect(s.deques.W1).toHaveLength(1)
    s = futuresTransition(s, { type: 'rebuild' })
    expect(s.deques.W1).toHaveLength(1)
    s = futuresTransition(s, { type: 'remote' })
    s = futuresTransition(s, { type: 'run' })
    s = futuresTransition(s, { type: 'join' })
    expect(s.joined).toBe('82')
  })
  it('honors changed inputs and leaf size, validates strictly, and lets owners pop the newest branch', () => {
    let s = futuresTransition(initialFutures(), { type: 'step' })
    s = futuresTransition(s, { type: 'step' })
    expect(s.tasks[2]!.worker).toBe('W1')
    s = futuresTransition(s, { type: 'input', value: '9,-2,0,5,1' })
    s = futuresTransition(s, { type: 'leafSize', value: 1 })
    s = futuresTransition(s, { type: 'restart' })
    s = futuresTransition(s, { type: 'run' })
    expect(s.sum).toBe(13)
    expect(s.tasks.filter((t) => !t.children.length)).toHaveLength(5)
    s = futuresTransition(s, { type: 'input', value: '1,,2' })
    expect(futuresTransition(s, { type: 'restart' }).error).toContain('整数')
  })
})
