import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function open(page: Page, slug: string, mode = 'experiment') {
  await page.goto('#/learn/' + slug + '?mode=' + mode)
  await expect(page.locator('.workbench')).toBeVisible()
  await expect(page.locator('h1')).not.toBeEmpty()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}
function metric(page: Page, label: string) {
  return page
    .locator('.metric')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('strong')
}
async function primarySteps(page: Page, count: number) {
  for (let i = 0; i < count; i++) await page.locator('.workbench-actions .primary').click()
}
async function goalReached(page: Page) {
  await expect(page.locator('.experiment-goal')).toHaveClass(/reached/)
}
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error
  })
})

test('binary controls, mode switching, challenge and persisted completion form a learning loop', async ({
  page,
}) => {
  await open(page, 'binary')
  await page.getByRole('button', { name: 'A 的第 0 位，当前 0' }).click()
  await expect(page.getByLabel('十进制 A', { exact: true })).toHaveValue('43')
  await page.getByRole('button', { name: '试试 255 + 1' }).click()
  await expect(metric(page, '十进制结果')).toHaveText('0')
  await expect(metric(page, '进位 Carry')).toHaveText('1')
  await goalReached(page)
  await expect(page.getByRole('button', { name: '完成本课' })).toBeDisabled()
  await page.getByRole('tab', { name: /Challenge/ }).click()
  await expect(metric(page, '进位 Carry')).toHaveText('1')
  await page.getByRole('radio', { name: /完整结果是/ }).check()
  await page.getByRole('button', { name: '验证我的理解' }).click()
  await page.getByRole('button', { name: '完成本课' }).click()
  await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeDisabled()
  await page.reload()
  await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeVisible()
  await expect(page.locator('.sidebar-progress progress')).toHaveAttribute('value', '1')
})

test('binary rejects malformed bits and reset restores the initial model', async ({ page }) => {
  await open(page, 'binary')
  await page.getByLabel('二进制 A', { exact: true }).fill('10200000')
  await page.getByLabel('二进制 A', { exact: true }).press('Tab')
  await expect(page.locator('.experiment-feedback')).toContainText('只能包含 0 和 1')
  await expect(page.getByLabel('十进制 A', { exact: true })).toHaveValue('42')
  await page.getByRole('button', { name: '重置实验', exact: true }).click()
  await expect(page.getByLabel('二进制 A', { exact: true })).toHaveValue('00101010')
})

test('CPU exposes the write-back boundary and completes memory round trips', async ({ page }) => {
  await open(page, 'cpu')
  await page.getByLabel('MOV R1 的值').fill('5')
  await page.getByLabel('MOV R2 的值').fill('7')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^单步/ }).click()
  await expect(metric(page, 'R1')).toHaveText('0')
  await page.getByRole('button', { name: /^单步/ }).click()
  await expect(metric(page, 'R1')).toHaveText('5')
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '执行完当前指令' }).click()
  await expect(metric(page, 'R1')).toHaveText('12')
  await expect(page.locator('.registers > div').filter({ hasText: 'R3' }).locator('strong')).toHaveText('12')
  await expect(page.getByRole('button', { name: '执行结束', exact: true })).toBeDisabled()
  await goalReached(page)
})

test('cache visualizes real line fills and compares identical workloads', async ({ page }) => {
  await open(page, 'cache')
  await page.getByRole('button', { name: '访问地址', exact: true }).click()
  await page.getByLabel('快速访问').selectOption('0x1004')
  await expect(metric(page, 'L1 Hit Rate')).toContainText('50.0')
  await expect(metric(page, 'Memory Access')).toContainText('1')
  await page.getByRole('button', { name: '顺序访问 32 次' }).click()
  await page.getByRole('button', { name: '打乱访问 32 次' }).click()
  await expect(metric(page, '顺序组 · L1 命中')).toContainText('75.0%')
  await expect(metric(page, '打乱组 · L1 命中')).toBeVisible()
  await goalReached(page)
})

test('process wakeup does not immediately preempt the running thread', async ({ page }) => {
  await open(page, 'process')
  await page.getByRole('button', { name: '调度 Ready 线程' }).click()
  await page.getByRole('button', { name: '执行一步', exact: true }).click()
  await page.getByRole('button', { name: '当前线程等待 IO' }).click()
  await expect(metric(page, 'Running')).toHaveText('T2')
  await page.getByRole('button', { name: '完成目标 IO' }).click()
  await expect(metric(page, 'Running')).toHaveText('T2')
  await expect(
    page.locator('.thread-card').filter({ hasText: 'Thread 1' }).locator('.state-pill'),
  ).toHaveText('Ready')
  await goalReached(page)
})

test('virtual memory separates a TLB miss from a recoverable page fault', async ({ page }) => {
  await open(page, 'virtual-memory')
  await page.getByRole('button', { name: '访问地址 · 查询 TLB' }).click()
  await page.getByRole('button', { name: '查询页表', exact: true }).click()
  await expect(metric(page, 'Physical Address')).toHaveText('0x002C')
  await page.getByRole('button', { name: '访问地址 · 查询 TLB' }).click()
  await expect(metric(page, 'TLB Hits')).toHaveText('1')
  await page.getByLabel('虚拟地址 / 0x0000–0x07FF').fill('0x022A')
  await page.getByRole('button', { name: '访问地址 · 查询 TLB' }).click()
  await page.getByRole('button', { name: '查询页表', exact: true }).click()
  await expect(metric(page, 'Page Faults')).toHaveText('1')
  await page.getByRole('button', { name: '处理缺页并重试' }).click()
  await expect(metric(page, 'Physical Address')).toHaveText('0x032A')
  await goalReached(page)
})

test('TCP recovers from duplicate SYN, invalid ACK and loss while preserving endpoint states', async ({
  page,
}) => {
  await open(page, 'tcp-handshake')
  await page.getByLabel('Client 初始 Seq').fill('12')
  await page.getByLabel('Server 初始 Seq').fill('25')
  await page.getByRole('button', { name: '发送 SYN', exact: true }).click()
  await page.getByRole('button', { name: '注入重复 SYN' }).click()
  await page.getByRole('button', { name: '发送 SYN+ACK', exact: true }).click()
  await expect(metric(page, 'Client State')).toHaveText('ESTABLISHED')
  await expect(metric(page, 'Server State')).toHaveText('SYN_RCVD')
  await page.getByLabel('最后 ACK 的确认号').fill('1')
  await page.getByRole('button', { name: '发送 ACK', exact: true }).click()
  await expect(metric(page, '丢包 / 错误 ACK')).toHaveText('0 / 1')
  await expect(page.locator('.packet-label').filter({ hasText: 'RST' })).toBeVisible()
  await page.getByLabel('最后 ACK 的确认号').fill('26')
  await page.getByLabel('下一次发送', { exact: true }).selectOption('drop')
  await page.getByRole('button', { name: '发送 ACK', exact: true }).click()
  await expect(metric(page, 'Server State')).toHaveText('SYN_RCVD')
  await page.getByRole('button', { name: '重传 SYN+ACK', exact: true }).click()
  await page.getByRole('button', { name: '发送 ACK', exact: true }).click()
  await expect(metric(page, 'Server State')).toHaveText('ESTABLISHED')
  await goalReached(page)
})

test('TCP half-close permits data and TIME_WAIT survives a lost final ACK', async ({ page }) => {
  await open(page, 'tcp-close')
  await page.getByRole('button', { name: '① Client 发送 FIN' }).click()
  await page.getByRole('button', { name: '② Server 发送 ACK' }).click()
  await page.getByRole('button', { name: 'Server 发送剩余数据' }).click()
  await expect(metric(page, '半关闭接收数据')).toContainText('12')
  await page.getByRole('button', { name: '③ Server 发送 FIN' }).click()
  await page.getByLabel('最后 ACK 的传输').selectOption('drop')
  await page.getByRole('button', { name: '④ Client 发送 ACK' }).click()
  await expect(metric(page, 'Server State')).toHaveText('LAST_ACK')
  await page.getByRole('button', { name: 'Server 重传 FIN' }).click()
  await page.getByRole('button', { name: '④ Client 发送 ACK' }).click()
  await page.getByRole('button', { name: '推进 1 MSL' }).click()
  await expect(metric(page, 'Client State')).toHaveText('TIME_WAIT')
  await page.getByRole('button', { name: '推进 1 MSL' }).click()
  await expect(metric(page, 'Client State')).toHaveText('CLOSED')
  await goalReached(page)
})

test('DNS switches from recursive iteration to cache response, then expires TTL', async ({ page }) => {
  await open(page, 'dns')
  await primarySteps(page, 8)
  await expect(metric(page, '本次上游查询')).toHaveText('3')
  await expect(metric(page, '解析结果')).toHaveText('203.0.113.42')
  await primarySteps(page, 2)
  await expect(metric(page, '本次上游查询')).toHaveText('0')
  await expect(metric(page, '累计 Cache Hits')).toHaveText('1')
  await goalReached(page)
  await page.getByRole('button', { name: '时间 +30 s' }).click({ clickCount: 2 })
  await expect(metric(page, '记录剩余 TTL')).toContainText('0')
  await primarySteps(page, 2)
  await expect(metric(page, '本次上游查询')).toHaveText('1')
})

test('HTTP can reuse connections and identify a failure before the application layer', async ({ page }) => {
  await open(page, 'http')
  await primarySteps(page, 7)
  await expect(metric(page, '响应状态')).toHaveText('200')
  await expect(metric(page, '模拟总耗时')).toContainText('225')
  await primarySteps(page, 7)
  await expect(metric(page, '连接复用')).toHaveText('REUSED')
  await expect(metric(page, '模拟总耗时')).toContainText('85')
  await goalReached(page)
  await page.getByLabel('故障情景').selectOption('tcp')
  await primarySteps(page, 3)
  await expect(metric(page, '响应状态')).toHaveText('TCP_TIMEOUT')
  await expect(
    page
      .locator('.pipeline-node')
      .filter({ has: page.getByText('HTTP', { exact: true }) })
      .locator('.state-pill'),
  ).toHaveText('等待')
})

test('B+Tree performs split, search, merge and real leaf-chain range scans', async ({ page }) => {
  await open(page, 'btree')
  await page.getByRole('button', { name: '插入示例 5', exact: true }).click()
  await page.getByRole('button', { name: '插入示例 15', exact: true }).click()
  await expect(metric(page, '树高 / 层')).toHaveText('3')
  await page.getByRole('button', { name: 'Search · 查找' }).click()
  await expect(page.locator('.tree-key.found')).toHaveText('15')
  await page.getByRole('button', { name: 'Delete · 删除' }).click()
  await goalReached(page)
  await page.getByLabel('Key / 范围起点').fill('20')
  await page.getByLabel('范围终点', { exact: true }).fill('50')
  await page.getByRole('button', { name: 'Range · 范围查询' }).click()
  await expect(page.locator('.experiment-feedback')).toContainText('[20, 30, 40, 50]')
  await page.getByRole('button', { name: '清空树', exact: true }).click()
  await expect(metric(page, '叶子记录')).toHaveText('0')
})

test('Tutor is an honest local adapter, with accessible dialog and author hints', async ({ page }) => {
  await open(page, 'binary')
  const outgoing: string[] = []
  page.on('request', (request) => outgoing.push(request.url()))
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('AI Tutor coming soon.')
  await expect(page.getByRole('dialog')).toContainText('当前未接入 AI')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click()
  await page.getByRole('button', { name: '先查看课程提示' }).click()
  await expect(page.locator('.hint-banner')).toContainText('Carry')
  expect(outgoing).toEqual([])
})

test('roadmap distinguishes planned concepts and hash links survive reload', async ({ page }) => {
  await open(page, 'binary', 'learn')
  await page.getByRole('link', { name: /有符号数与补码/ }).click()
  await expect(page).toHaveURL(/#\/roadmap\?level=1/)
  await expect(page.locator('#level-1')).toHaveClass(/highlighted/)
  await expect(page.locator('.roadmap-level')).toHaveCount(18)
  await page.reload()
  await expect(page.locator('#level-1')).toBeVisible()
  await page.goto('#/learn/not-a-course')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('这个地址，还没有映射。')
})

test('navigation, keyboard bits, and corrupted storage remain usable on narrow screens', async ({
  page,
  isMobile,
}) => {
  await page.addInitScript(() => localStorage.setItem('corecraft.progress.v1', '{bad-json'))
  await open(page, 'binary')
  const bit = page.getByRole('button', { name: 'A 的第 0 位，当前 0' })
  await bit.focus()
  await page.keyboard.press('Space')
  await expect(page.getByLabel('十进制 A', { exact: true })).toHaveValue('43')
  if (isMobile) {
    await expect(page.locator('#course-navigation')).toHaveAttribute('inert', '')
    await page.getByRole('button', { name: '打开课程导航' }).click()
    await expect(page.locator('#course-navigation')).not.toHaveAttribute('inert', '')
  }
  await page.locator('.course-nav-item').filter({ hasText: 'CPU 如何执行指令' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('CPU 如何执行指令')
  if (isMobile) await expect(page.locator('#course-navigation')).toHaveAttribute('inert', '')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('representative learning views meet automated WCAG A and AA checks', async ({ page }) => {
  test.setTimeout(90_000)
  for (const slug of [
    'binary',
    'cpu',
    'cache',
    'process',
    'virtual-memory',
    'tcp-handshake',
    'tcp-close',
    'dns',
    'http',
    'btree',
  ]) {
    await open(page, slug, 'learn')
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(
      result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      slug,
    ).toEqual([])
  }
  await page.goto('#/roadmap')
  await expect(page.locator('.roadmap-level')).toHaveCount(18)
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([])
})
