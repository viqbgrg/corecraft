import { expect, test } from '@playwright/test'
import { click, fill, finishCourse, metric, openCourse, select } from './course-helpers'
test('Backend capacity preserves results while reducing database work and allocation pressure', async ({
  page,
}) => {
  await openCourse(page, 'backend-capacity')
  await click(page, '运行当前负载直到结束')
  await expect(metric(page, 'DB 服务工作量')).toHaveText('96')
  await select(page, 'indexed', 'on')
  await select(page, 'cache', 'on')
  await fill(page, 'allocation', '2')
  await fill(page, 'heap', '64')
  await click(page, '运行同负载基线与当前配置对照')
  await expect(metric(page, '完成 / 拒绝请求')).toHaveText('12 / 0')
  await finishCourse(page, /更多 worker 不增加 DB 容量/)
})
test('Outbox survives relay failure, inbox deduplicates and a cache version floor blocks stale refill', async ({
  page,
}) => {
  await openCourse(page, 'backend-consistency')
  for (const name of [
    '读取线程保存当前数据库 / 缓存快照',
    '商品服务提交库存更新',
    '更新后执行缓存失效',
    '读取线程尝试回填旧快照',
    '提交后停止商品服务',
  ])
    await click(page, name)
  await select(page, 'mode', 'outbox')
  for (const name of [
    '读取线程保存当前数据库 / 缓存快照',
    '商品服务提交库存更新',
    'relay 获取有限租约',
    'relay 发布待发送 outbox 事件',
    '发布后停止当前 relay',
    '租约时钟推进一时隙',
    '租约时钟推进一时隙',
  ])
    await click(page, name)
  await select(page, 'selected', 'W2')
  for (const name of [
    'relay 获取有限租约',
    'relay 发布待发送 outbox 事件',
    'relay 标记发布完成',
    '消费者处理一个事件并确认',
    '消费者处理一个事件并确认',
    '读取线程尝试回填旧快照',
  ])
    await click(page, name)
  await expect(metric(page, '实际通知效果数')).toHaveText('1')
  await expect(metric(page, '重复消息跳过数')).toHaveText('1')
  await finishCourse(page, /允许重复发布，消费者用稳定事件 id/)
})
test('Observability correlates real signals and validates a targeted performance fix on identical load', async ({
  page,
}) => {
  await openCourse(page, 'backend-observability')
  for (const name of [
    '运行并记录基线负载',
    '采集延迟与资源指标',
    '查看指定时隙线程快照',
    '查看指定请求 Trace',
    '查看实际 CPU 样本',
    '查看堆与 GC 时序',
  ])
    await click(page, name)
  await expect(page.locator('[data-table="observability-threads"]')).toContainText('JDBC')
  await expect(page.locator('[data-table="observability-profile"]')).toContainText('OrderController.bind')
  await select(page, 'fix', 'index')
  await click(page, '应用一个调整并用同负载复测')
  await finishCourse(page, /检查 DB 执行与连接等待/)
})
