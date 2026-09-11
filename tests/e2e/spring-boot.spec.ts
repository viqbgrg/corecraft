import { expect, test } from '@playwright/test'
import { click, fill, finishCourse, metric, openCourse, select } from './course-helpers'
test('Boot configuration resolves typed values and auto-configuration backs off for user beans', async ({
  page,
}) => {
  await openCourse(page, 'boot-configuration')
  await click(page, '重新绑定配置并启动应用')
  await expect(metric(page, '应用已启动')).toHaveText('false')
  await fill(page, 'env', 'APP_CLIENT_POOLSIZE=6;APP_CLIENT_TIMEOUT=750ms')
  await click(page, '重新绑定配置并启动应用')
  await expect(metric(page, '绑定 timeout')).toHaveText('1000 ms')
  await select(page, 'custom', 'yes')
  await click(page, '重新绑定配置并启动应用')
  await expect(page.locator('[data-table="boot-beans"]')).toContainText('用户 @Bean')
  await finishCourse(page, /自动配置退让，保留用户 Bean/)
})
test('Boot web validation, health probes and management exposure follow separate decisions', async ({
  page,
}) => {
  await openCourse(page, 'boot-web')
  const request = () => click(page, '发送当前 HTTP 请求')
  await click(page, '启动嵌入式 Web 应用')
  await request()
  await expect(metric(page, '已创建订单数')).toHaveText('0')
  await fill(page, 'body', '{"email":"ada@example.test","quantity":2,"address":{"city":"杭州"}}')
  await request()
  await expect(metric(page, '最近 HTTP 状态')).toHaveText('201')
  await select(page, 'db', 'off')
  await select(page, 'endpoint', 'readiness')
  await request()
  await expect(metric(page, '最近 HTTP 状态')).toHaveText('503')
  await select(page, 'endpoint', 'liveness')
  await request()
  await expect(metric(page, '最近 HTTP 状态')).toHaveText('200')
  await select(page, 'endpoint', 'metrics')
  await request()
  await expect(metric(page, '最近 HTTP 状态')).toHaveText('404')
  await select(page, 'metricsExposed', 'on')
  await request()
  await expect(metric(page, '最近 HTTP 状态')).toHaveText('403')
  await select(page, 'role', 'operator')
  await request()
  await finishCourse(page, /readiness 可以 DOWN，liveness 仍 UP/)
})
