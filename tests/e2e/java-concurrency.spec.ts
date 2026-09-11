import { expect, test } from '@playwright/test'
import { click, finishCourse, metric, openCourse, select } from './course-helpers'

test('Thread increments expose lost updates, CAS retry and stamped ABA detection', async ({ page }) => {
  await openCourse(page, 'java-atomics')
  const step = () => click(page, '执行当前线程的读 / 写步骤')
  const reads = async () => {
    for (const id of ['T1', 'T2']) {
      await select(page, 'selected', id)
      await click(page, 'Thread.start · 启动一次')
      await step()
    }
  }
  await reads()
  await select(page, 'selected', 'T1')
  await step()
  await select(page, 'selected', 'T2')
  await step()
  await expect(metric(page, '共享计数值')).toHaveText('1')
  await select(page, 'mode', 'cas')
  await reads()
  await select(page, 'selected', 'T1')
  await step()
  await select(page, 'selected', 'T2')
  await step()
  await step()
  await step()
  await click(page, 'main · join 当前线程')
  await expect(metric(page, '共享计数值')).toHaveText('2')
  await select(page, 'mode', 'stamped')
  await click(page, 'Thread.start · 启动一次')
  await step()
  await click(page, '插入一次 A → B → A 修改')
  await step()
  await finishCourse(page, /最终得到 1；volatile 不保证整个自增原子/)
})
test('Condition signals retain ownership and restore all reentrant holds after reacquisition', async ({
  page,
}) => {
  await openCourse(page, 'java-locks')
  const enter = () => click(page, 'lock / monitorenter · 获取或重试'),
    exit = () => click(page, 'unlock / monitorexit · 释放一次')
  await enter()
  await enter()
  await click(page, 'while 检查并 await / wait')
  await select(page, 'selected', 'T2')
  await enter()
  await click(page, '在锁内生产并设置 ready')
  await click(page, 'signal / notify 一个等待者')
  await select(page, 'selected', 'T1')
  await enter()
  await expect(metric(page, '获取锁的等待者')).toHaveText('1')
  await select(page, 'selected', 'T2')
  await exit()
  await select(page, 'selected', 'T1')
  await enter()
  await expect(metric(page, '锁持有计数')).toHaveText('2')
  await click(page, '在锁内检查并消费')
  await exit()
  await exit()
  await finishCourse(page, /T1 等待重新获取锁；T2 仍需解锁/)
})
test('Latch publishes completed results and Semaphore recycles a bounded resource', async ({ page }) => {
  await openCourse(page, 'java-coordination')
  await click(page, /协调者 await/)
  for (const id of ['T1', 'T2', 'T3']) {
    await select(page, 'selected', id)
    await click(page, /完成当前工作，再 countDown/)
  }
  await click(page, /协调者 await/)
  for (const id of ['T1', 'T2', 'T3']) {
    await select(page, 'selected', id)
    await click(page, /acquire ·/)
  }
  await select(page, 'selected', 'T1')
  await click(page, /完成资源任务/)
  await select(page, 'selected', 'T3')
  await click(page, /acquire ·/)
  for (const id of ['T2', 'T3']) {
    await select(page, 'selected', id)
    await click(page, /完成资源任务/)
  }
  await finishCourse(page, /可用许可可能变为 3/)
})
test('Executor queues before growing and applies caller backpressure before graceful shutdown', async ({
  page,
}) => {
  await openCourse(page, 'java-executors')
  await click(page, '突发提交六个任务')
  await expect(metric(page, '已创建 pool worker')).toHaveText('3')
  await expect(page.locator('[data-table="executor-queue"] tbody tr')).toHaveCount(2)
  await select(page, 'policy', 'caller')
  await click(page, 'execute · 提交一个任务')
  await expect(page.getByRole('button', { name: 'execute · 提交一个任务', exact: true })).toBeDisabled()
  await click(page, 'shutdown · 排空后关闭')
  await click(page, '运行到所有已接纳任务结束')
  await expect(metric(page, '完成任务数量')).toHaveText('6')
  await expect(metric(page, '线程池阶段')).toHaveText('terminated')
  await finishCourse(page, /任务 1、2、5；3、4 排队/)
})
test('Concurrent map retains atomic compute updates and reads during progressive resize', async ({
  page,
}) => {
  await openCourse(page, 'java-concurrent-map')
  const begin = () => click(page, '开始当前线程的更新'),
    advance = () => click(page, '推进 / 重试已保存的更新'),
    transfer = () => click(page, '迁移一个旧桶')
  await begin()
  await select(page, 'selected', 'T2')
  await begin()
  await advance()
  await select(page, 'selected', 'T1')
  await advance()
  await select(page, 'operation', 'compute')
  await begin()
  await select(page, 'selected', 'T2')
  await begin()
  await select(page, 'selected', 'T1')
  await advance()
  await select(page, 'selected', 'T2')
  await advance()
  await advance()
  await click(page, '开始扩容到双倍容量')
  await transfer()
  await transfer()
  await click(page, 'get · 读取当前键')
  await expect(metric(page, '最近 get 结果')).toHaveText('3')
  await transfer()
  await transfer()
  await finishCourse(page, /同桶写入可以等待，不同桶仍可推进/)
})
test('ForkJoin computes the sum and Future chains distinguish failure, recovery and execution context', async ({
  page,
}) => {
  await openCourse(page, 'java-futures')
  const run = () => click(page, '运行所有当前可执行任务'),
    remote = () => click(page, '完成远端 source'),
    join = () => click(page, 'join · 观察组合结果'),
    rebuild = () => click(page, '按配置重建 Future 依赖链')
  await click(page, 'worker 取任务并执行一步')
  await select(page, 'selected', 'W2')
  await click(page, 'worker 取任务并执行一步')
  await run()
  await expect(metric(page, 'ForkJoin 求和')).toHaveText('36')
  await remote()
  await run()
  await join()
  await expect(metric(page, 'join 观察值')).toHaveText('82')
  await select(page, 'outcome', 'failure')
  await rebuild()
  await remote()
  await run()
  await join()
  await expect(metric(page, 'join 观察值')).toContainText('CompletionException')
  await select(page, 'recovery', 'on')
  await select(page, 'async', 'off')
  await rebuild()
  await remote()
  await join()
  await expect(metric(page, 'join 观察值')).toHaveText('72')
  await finishCourse(page, /这个 future 进入取消状态/)
})
