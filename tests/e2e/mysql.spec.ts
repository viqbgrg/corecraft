import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function open(page: Page, slug: string) {
  page.on('pageerror', (error) => {
    throw error
  })
  await page.goto('#/learn/' + slug + '?mode=experiment')
  await expect(page.locator('.workbench')).toBeVisible()
}
function metric(page: Page, label: string) {
  return page
    .locator('.metric')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('strong')
}
async function finish(page: Page, answer: RegExp) {
  await expect(page.locator('.experiment-goal')).toHaveClass(/reached/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations,
  ).toEqual([])
  await page.getByRole('tab', { name: /Challenge/ }).click()
  await page.getByRole('radio', { name: answer }).check()
  await page.getByRole('button', { name: '验证我的理解' }).click()
  await page.getByRole('button', { name: '完成本课', exact: true }).click()
  await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeDisabled()
}

test('InnoDB index coverage changes fetched fields and back-to-cluster work', async ({ page }) => {
  await open(page, 'innodb-indexes')
  await page.getByRole('button', { name: '执行当前索引查询' }).click()
  await expect(metric(page, '已读取记录')).toHaveText('1')
  await page.getByLabel('InnoDB 查询入口').selectOption('secondary')
  await page.getByRole('button', { name: '执行当前索引查询' }).click()
  await expect(metric(page, '完成查询的回表次数')).toHaveText('4')
  await page.getByRole('button', { name: '对比覆盖查询与回表' }).click()
  await expect(page.locator('[data-table="innodb-covering"] tbody tr')).toHaveCount(2)
  await finish(page, /两者匹配相同主键/)
})

test('prepared recovery distinguishes absent and durable binlog decisions', async ({ page }) => {
  await open(page, 'innodb-commit')
  for (const label of [
    '开始事务并修改缓冲行',
    'PREPARE · 持久化 Redo',
    '尝试写回主库数据页',
    '在当前阶段崩溃',
    '按 Redo 与 Binlog 恢复',
  ])
    await page.getByRole('button', { name: label, exact: true }).click()
  await expect(page.locator('[data-table="innodb-recovery-decisions"]')).toContainText('ROLLBACK')
  for (const label of [
    '开始事务并修改缓冲行',
    'PREPARE · 持久化 Redo',
    '写入完整 Binlog 事务',
    '同步 Binlog 到持久层',
    '在当前阶段崩溃',
    '按 Redo 与 Binlog 恢复',
    '复制端应用持久 Binlog',
  ])
    await page.getByRole('button', { name: label, exact: true }).click()
  await expect(metric(page, '客户端收到成功次数')).toHaveText('0')
  await expect(metric(page, '已应用 Binlog 事务')).toHaveText('1')
  await finish(page, /根据同 XID 的持久 Binlog 决定提交/)
})

test('Read View excludes two classes of new versions and releases Undo on transaction end', async ({
  page,
}) => {
  await open(page, 'innodb-read-view')
  const select = (slot: string) => page.getByLabel('Read View 会话').selectOption(slot)
  const begin = () => page.getByRole('button', { name: 'BEGIN · 分配教学事务 ID' }).click()
  const read = () => page.getByRole('button', { name: '普通一致性读 / 遍历 Undo' }).click()
  const write = () => page.getByRole('button', { name: '写入一个新行版本' }).click()
  const commit = () => page.getByRole('button', { name: 'COMMIT · 结束当前事务' }).click()
  await select('T2')
  await begin()
  await write()
  await select('T1')
  await begin()
  await read()
  await expect(metric(page, '最近快照读值')).toHaveText('10')
  await select('T2')
  await commit()
  await select('T3')
  await begin()
  await page.getByLabel('新行版本的值').fill('30')
  await write()
  await commit()
  await select('T1')
  await read()
  await expect(page.locator('[data-table="read-view-trace"] tbody tr')).toHaveCount(3)
  await page.getByRole('button', { name: 'Purge · 尝试清理旧版本' }).click()
  await expect(metric(page, '当前行版本数')).toHaveText('3')
  await commit()
  await page.getByRole('button', { name: 'Purge · 尝试清理旧版本' }).click()
  await expect(metric(page, '累计清理旧版本')).toHaveText('2')
  await finish(page, /旧视图保持原活跃集合/)
})

test('gap lock blocks insertion until the saved statement is retried', async ({ page }) => {
  await open(page, 'innodb-locks')
  await page.getByRole('button', { name: 'T1 BEGIN + SELECT FOR UPDATE' }).click()
  await page.getByRole('button', { name: 'T2 执行当前语句' }).click()
  await expect(metric(page, 'T2 等待语句')).toHaveText('insert 15')
  await expect(metric(page, '记录数量')).toHaveText('3')
  await page.getByRole('button', { name: 'T1 COMMIT · 释放锁' }).click()
  await expect(metric(page, '记录数量')).toHaveText('3')
  await page.getByRole('button', { name: 'T2 重试原等待语句' }).click()
  await expect(metric(page, '记录数量')).toHaveText('4')
  await page.getByRole('button', { name: '对比四种索引锁范围' }).click()
  await finish(page, /INSERT key=15 与 UPDATE key=20/)
})

test('SQL operators return real grouped rows and Filesort can stay in memory', async ({ page }) => {
  await open(page, 'mysql-execution')
  await page.getByRole('button', { name: 'EXPLAIN · 仅查看计划' }).click()
  await expect(metric(page, '已执行算子步骤')).toHaveText('0')
  await page.getByRole('button', { name: '执行完整 SQL 管线' }).click()
  await expect(metric(page, '过滤后订单数')).toHaveText('8')
  await expect(metric(page, '模拟排序落盘')).toHaveText('是')
  await expect(page.locator('[data-table="execution-result"] tbody tr').first()).toContainText('200')
  await page.getByRole('button', { name: '更新 Join 选择率统计' }).click()
  await page.getByLabel('每个排序段的内存容量（组）').fill('6')
  await page.getByRole('button', { name: '执行完整 SQL 管线' }).click()
  await expect(metric(page, '模拟排序落盘')).toHaveText('否')
  await page.getByRole('button', { name: '实际对比三种 Join' }).click()
  await expect(page.locator('[data-table="execution-comparison"] tbody tr')).toHaveCount(3)
  await finish(page, /Filesort 表示额外排序/)
})
