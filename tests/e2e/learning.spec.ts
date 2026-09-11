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

test('pipeline exposes a load-use bubble, compares execution and completes the learning loop', async ({
  page,
}) => {
  await open(page, 'pipeline')
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '推进 1 个周期' }).click()
  await expect(metric(page, '数据停顿')).toContainText('1')
  await expect(page.locator('.stage-card').filter({ hasText: 'EX' })).toContainText('气泡')
  const register = (name: string) =>
    page
      .locator('.pipeline-storage .registers > div')
      .filter({ has: page.getByText(name, { exact: true }) })
      .locator('strong')
  await expect(register('R1')).toHaveText('0')
  await page.getByRole('button', { name: '推进 1 个周期' }).click()
  await expect(register('R1')).toHaveText('21')
  await expect(register('R2')).toHaveText('0')
  await page.getByRole('button', { name: '运行至结束', exact: true }).click()
  await expect(metric(page, '时钟周期')).toHaveText('9')
  await expect(register('R3')).toHaveText('63')
  await page.getByRole('button', { name: '对比三种执行方式' }).click()
  const rows = page.locator('.pipeline-comparison tbody tr')
  await expect(rows.nth(0).locator('td').first()).toHaveText('20')
  await expect(rows.nth(1).locator('td').first()).toHaveText('14')
  await expect(rows.nth(2).locator('td').first()).toHaveText('9')
  await goalReached(page)
  await page.getByRole('tab', { name: /Challenge/ }).click()
  await expect(metric(page, '时钟周期')).toHaveText('9')
  await page.getByRole('radio', { name: /LOAD 的数据要到 MEM 结束/ }).check()
  await page.getByRole('button', { name: '验证我的理解' }).click()
  await page.getByRole('button', { name: '完成本课', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('branch prediction separates training, validates custom input and compares strategies', async ({
  page,
}) => {
  await open(page, 'branch-prediction')
  await page.getByRole('button', { name: '先预测下一次分支' }).click()
  await expect(page.locator('.branch-decision')).toContainText('预测 N · 等待揭晓')
  await expect(page.locator('.predictor-state.current')).toContainText('01 · 弱不跳转')
  await expect(metric(page, '已揭晓分支')).toHaveText('0 / 15')
  await expect(metric(page, '预测失败')).toContainText('0')
  await page.getByRole('button', { name: '揭晓结果并更新预测器' }).click()
  await expect(page.locator('.predictor-state.current')).toContainText('10 · 弱跳转')
  await expect(metric(page, '预测失败')).toContainText('1')
  await page.getByLabel('实际分支序列 / T 或 N').fill('TTX')
  await page.getByLabel('实际分支序列 / T 或 N').press('Tab')
  await expect(page.locator('.experiment-feedback')).toContainText('请输入 1–64 个 T 或 N')
  await expect(page.getByRole('button', { name: '运行剩余分支' })).toBeDisabled()
  await page.getByLabel('实际分支序列 / T 或 N').fill('TTNNTTNN')
  await page.getByLabel('实际分支序列 / T 或 N').press('Tab')
  await expect(metric(page, '已揭晓分支')).toHaveText('0 / 8')
  await page.getByRole('button', { name: '运行剩余分支' }).click()
  await page.getByRole('button', { name: '对比三种预测策略' }).click()
  const rows = page.locator('.prediction-comparison tbody tr')
  await expect(rows.nth(1).locator('td').nth(1)).toHaveText('4')
  await expect(rows.nth(2).locator('td').nth(1)).toHaveText('6')
  await expect(metric(page, '额外周期')).toHaveText('12')
  await goalReached(page)
  await page.getByRole('tab', { name: /Challenge/ }).click()
  await page.getByRole('radio', { name: /仍预测跳转/ }).check()
  await page.getByRole('button', { name: '验证我的理解' }).click()
  await page.getByRole('button', { name: '完成本课', exact: true }).click()
  await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
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

test('scheduling compares real completion metrics and validates edited workloads', async ({ page }) => {
  await open(page, 'scheduling')
  await page.getByLabel('任务 / 到达:时长').fill('0:0')
  await page.getByLabel('任务 / 到达:时长').press('Tab')
  await expect(page.locator('.experiment-feedback')).toContainText('请输入 1–8')
  await expect(page.getByRole('button', { name: '运行全部任务' })).toBeDisabled()
  await page.getByLabel('任务 / 到达:时长').fill('0:8, 1:4, 2:2')
  await page.getByLabel('任务 / 到达:时长').press('Tab')
  await page.getByRole('button', { name: '运行全部任务' }).click()
  await expect(metric(page, '平均等待时间')).toHaveText('5.67')
  await page.getByRole('button', { name: '对比四种调度策略' }).click()
  await expect(page.locator('[data-table="scheduling-comparison"] tbody tr')).toHaveCount(4)
  await goalReached(page)
  await page.getByRole('tab', { name: /Challenge/ }).click()
  await page.getByRole('radio', { name: /等待 3，响应 3/ }).check()
  await page.getByRole('button', { name: '验证我的理解' }).click()
  await page.getByRole('button', { name: '完成本课', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeVisible()
})

test('page replacement exposes Belady anomaly and independent comparisons', async ({ page }) => {
  await open(page, 'page-replacement')
  await page.getByRole('button', { name: '运行全部访问' }).click()
  await expect(metric(page, '缺页次数')).toHaveText('9')
  await page.getByLabel('物理帧数').fill('4')
  await expect(metric(page, '已访问')).toHaveText('0 / 12')
  await page.getByRole('button', { name: '运行全部访问' }).click()
  await expect(metric(page, '缺页次数')).toHaveText('10')
  await page.getByRole('button', { name: '对比四种置换策略' }).click()
  await expect(page.locator('[data-table="replacement-comparison"] tbody tr')).toHaveCount(4)
  await goalReached(page)
  await page.getByRole('tab', { name: /Challenge/ }).click()
  await page.getByRole('radio', { name: /FIFO 的驻留集合/ }).check()
  await page.getByRole('button', { name: '验证我的理解' }).click()
  await page.getByRole('button', { name: '完成本课', exact: true }).click()
  await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeDisabled()
})

test('TCP reliability repairs a gap and waits for the application window update', async ({ page }) => {
  await open(page, 'tcp-reliability')
  await page.getByLabel('下一次故障', { exact: true }).selectOption('data')
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '发送下一段', exact: true }).click()
  await page.getByRole('button', { name: '发送累计 ACK / 窗口更新', exact: true }).click()
  await expect(metric(page, '已确认字节')).toHaveText('0')
  await expect(page.getByRole('button', { name: '发送下一段', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '触发 RTO · 重传最早未确认段' }).click()
  await page.getByRole('button', { name: '发送累计 ACK / 窗口更新', exact: true }).click()
  await expect(metric(page, '已确认字节')).toHaveText('400')
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '应用读取 1 段' }).click()
  await expect(page.getByRole('button', { name: '发送下一段', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '发送累计 ACK / 窗口更新', exact: true }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '发送下一段', exact: true }).click()
  await page.getByRole('button', { name: '发送累计 ACK / 窗口更新', exact: true }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '应用读取 1 段' }).click()
  await expect(metric(page, '已确认字节')).toHaveText('800')
  await expect(metric(page, 'RTO 重传次数')).toHaveText('1')
  await goalReached(page)
  await page.getByRole('tab', { name: /Challenge/ }).click()
  await page.getByRole('radio', { name: /按原序号识别重复/ }).check()
  await page.getByRole('button', { name: '验证我的理解' }).click()
  await page.getByRole('button', { name: '完成本课', exact: true }).click()
  await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeDisabled()
})

test('TCP congestion distinguishes ACK growth, fast recovery and an RTO', async ({ page }) => {
  await open(page, 'tcp-congestion')
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '发送一轮数据' }).click()
    await page.getByRole('button', { name: '收到整轮新 ACK' }).click()
  }
  await page.getByRole('button', { name: '发送一轮数据' }).click()
  await page.getByRole('button', { name: '收到 3 次重复 ACK' }).click()
  await expect(metric(page, '拥塞控制阶段')).toHaveText('快速恢复')
  await page.getByRole('button', { name: '确认重传 · 退出快速恢复' }).click()
  await expect(metric(page, '拥塞窗口')).toContainText('2.00')
  await page.getByRole('button', { name: '发送一轮数据' }).click()
  await page.getByRole('button', { name: '触发 RTO 超时', exact: true }).click()
  await expect(metric(page, '拥塞窗口')).toContainText('1.00')
  await goalReached(page)
  await page.getByRole('tab', { name: /Challenge/ }).click()
  await page.getByRole('radio', { name: /根据实际 FlightSize/ }).check()
  await page.getByRole('button', { name: '验证我的理解' }).click()
  await page.getByRole('button', { name: '完成本课', exact: true }).click()
  await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeDisabled()
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

test('roadmap links covered concepts and hash links survive reload', async ({ page }) => {
  await open(page, 'binary', 'learn')
  await page.getByRole('link', { name: /有符号数与补码/ }).click()
  await expect(page).toHaveURL(/#\/learn\/signed-number/)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('127 加 1')
  await page.goto('#/roadmap?level=1')
  await expect(page.locator('#level-1')).toHaveClass(/highlighted/)
  await expect(page.locator('.roadmap-level')).toHaveCount(18)
  await page.reload()
  await expect(page.locator('#level-1')).toBeVisible()
  await page.goto('#/roadmap?level=5')
  await page.locator('#level-5').getByRole('link', { name: 'BFS', exact: true }).click()
  await expect(page).toHaveURL(/#\/learn\/graph/)
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
    'modeling',
    'binary',
    'signed-number',
    'floating-point',
    'encoding',
    'logic',
    'interrupt-dma',
    'filesystem',
    'page-cache',
    'io-multiplexing',
    'network-layers',
    'tls',
    'database-pages',
    'wal',
    'transactions',
    'query-optimizer',
    'cpu',
    'pipeline',
    'branch-prediction',
    'cache',
    'process',
    'scheduling',
    'virtual-memory',
    'page-replacement',
    'tcp-handshake',
    'tcp-close',
    'tcp-reliability',
    'tcp-congestion',
    'dns',
    'http',
    'btree',
    'linear-storage',
    'stack-queue',
    'hash-table',
    'binary-search',
    'sorting',
    'trees-heaps',
    'graph',
    'dynamic-programming',
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
