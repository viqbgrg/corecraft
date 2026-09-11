import { expect, test } from '@playwright/test'
import { click, fill, finishCourse, metric, openCourse, select } from './course-helpers'
test('Kafka exposes retry duplicates, early-offset loss and the limited scope of transactional output', async ({
  page,
}) => {
  await openCourse(page, 'kafka-delivery')
  const send = () => click(page, 'Producer 发送新记录'),
    fetch = () => click(page, 'Consumer fetch 一条记录'),
    process = () => click(page, '执行业务并生成适用的事务输出'),
    crash = () => click(page, '消费者崩溃并从 committed 重启'),
    commit = () => click(page, '提交处理结果与适用的 offset')
  await send()
  await click(page, '模拟确认丢失后的相同序列重试')
  await fetch()
  await process()
  await crash()
  await fetch()
  await process()
  await commit()
  await expect(metric(page, '外部业务效果总和')).toHaveText('2')
  await select(page, 'mode', 'at-most')
  await send()
  await fetch()
  await crash()
  await expect(metric(page, '外部业务效果总和')).toHaveText('0')
  await select(page, 'mode', 'transactional')
  await send()
  await fetch()
  await process()
  await crash()
  await fetch()
  await process()
  await commit()
  await expect(metric(page, 'read_committed 输出数')).toHaveText('1')
  await finishCourse(page, /外部数据库不在该事务范围/)
})
test('RabbitMQ keeps publisher confirm, consumer ack and business inbox independent', async ({ page }) => {
  await openCourse(page, 'rabbitmq-delivery')
  for (const name of [
    'basic.publish · 发布消息',
    '接收 publisher confirm',
    '向消费者投递一条消息',
    '处理当前投递的业务',
    '断开消费者 channel 并重连',
    '向消费者投递一条消息',
    '处理当前投递的业务',
    'basic.ack · 确认当前投递',
  ])
    await click(page, name)
  await expect(metric(page, '业务效果次数')).toHaveText('1')
  await expect(metric(page, '应用去重跳过次数')).toHaveText('1')
  await fill(page, 'routing', 'unmatched.created')
  await click(page, 'basic.publish · 发布消息')
  await click(page, '接收 publisher confirm')
  await finishCourse(page, /不可路由由 basic.return 报告/)
})
