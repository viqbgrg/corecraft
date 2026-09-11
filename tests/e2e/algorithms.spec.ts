import { expect, test, type Page } from '@playwright/test'

async function open(page: Page, slug: string) {
  await page.goto('#/learn/' + slug + '?mode=experiment')
  await expect(page.locator('.workbench')).toBeVisible()
}
function metric(page: Page, label: string) {
  return page
    .locator('.metric')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('strong')
}
async function editText(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value)
  await page.getByLabel(label, { exact: true }).press('Tab')
}
async function finish(page: Page, answer: RegExp) {
  await expect(page.locator('.experiment-goal')).toHaveClass(/reached/)
  await expect(page.getByRole('button', { name: '完成本课', exact: true })).toBeDisabled()
  await page.getByRole('tab', { name: /Challenge/ }).click()
  await page.getByRole('radio', { name: answer }).check()
  await page.getByRole('button', { name: '验证我的理解' }).click()
  await page.getByRole('button', { name: '完成本课', exact: true }).click()
  await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error
  })
})

test('array and linked-list edits expose separate lookup and mutation costs', async ({ page }) => {
  await open(page, 'linear-storage')
  await page.getByRole('button', { name: '在索引处插入' }).click()
  await expect(metric(page, '元素数量')).toHaveText('5')
  await expect(metric(page, '元素 / 链接写入')).toHaveText('5')
  await page.getByRole('button', { name: '删除索引处元素' }).click()
  await expect(metric(page, '最近返回值')).toHaveText('25')
  await page.getByLabel('线性存储结构').selectOption('linked')
  await page.getByRole('button', { name: '在索引处插入' }).click()
  await expect(metric(page, '元素 / 链接写入')).toHaveText('2')
  await expect(page.locator('.data-caption')).toContainText('head=N4')
  await page.getByRole('button', { name: '读取索引处元素' }).click()
  await expect(metric(page, '最近返回值')).toHaveText('25')
  await page.getByRole('button', { name: '删除索引处元素' }).click()
  await page.getByLabel('操作索引').fill('3')
  await page.getByRole('button', { name: '比较相同位置的插入' }).click()
  await expect(
    page.locator('[data-table="linear-comparison"] tbody tr').nth(1).locator('td').first(),
  ).toHaveText('3')
  await finish(page, /O\(k\)：先遍历找到前驱/)
})

test('a full queue wraps into the freed physical slot without changing FIFO order', async ({ page }) => {
  await open(page, 'stack-queue')
  for (const value of [10, 20, 30, 40]) {
    await page.getByLabel('放入的值').fill(String(value))
    await page.getByRole('button', { name: '队尾放入', exact: true }).click()
  }
  await expect(metric(page, 'head')).toHaveText('0')
  await expect(metric(page, 'tail')).toHaveText('0')
  await expect(page.getByRole('button', { name: '队尾放入', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '队首移除', exact: true }).click()
  await expect(metric(page, '最近移除值')).toHaveText('10')
  await page.getByLabel('放入的值').fill('50')
  await page.getByRole('button', { name: '队尾放入', exact: true }).click()
  await expect(page.locator('.data-sequence strong')).toHaveText(['20', '30', '40', '50'])
  await expect(page.locator('[data-table="ring-buffer"] tbody tr').first().locator('td').first()).toHaveText(
    '50',
  )
  await finish(page, /检查 size：0 为空/)
})

test('hash lookup survives deletion, and resizing preserves the updated record', async ({ page }) => {
  await open(page, 'hash-table')
  await page.getByRole('button', { name: 'Put · 插入或更新' }).click()
  await page.getByLabel('Key', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Remove · 删除' }).click()
  await page.getByLabel('Key', { exact: true }).fill('8')
  await page.getByRole('button', { name: 'Get · 查找' }).click()
  await expect(page.locator('.experiment-feedback')).toContainText('找到 8 → 80')
  await expect(metric(page, '本次探测')).toHaveText('2')
  await page.getByLabel('Value', { exact: true }).fill('88')
  await page.getByRole('button', { name: 'Put · 插入或更新' }).click()
  await expect(metric(page, '存活键')).toHaveText('1')
  await page.getByRole('button', { name: '扩容至 13 并重新散列' }).click()
  await expect(metric(page, '墓碑数量')).toHaveText('0')
  await expect(page.locator('[data-table="hash-slots"] tbody tr').nth(8)).toContainText('88')
  await finish(page, /墓碑让查找键 8 继续探测/)
})

test('binary search returns the first duplicate and distinguishes an absent target', async ({ page }) => {
  await open(page, 'binary-search')
  await page.getByRole('button', { name: '查找到结束' }).click()
  await expect(metric(page, '搜索结果')).toHaveText('首个索引 1')
  await page.getByLabel('查找目标').fill('4')
  await page.getByRole('button', { name: '查找到结束' }).click()
  await expect(metric(page, '搜索结果')).toHaveText('未找到 · 插入点 4')
  await editText(page, '有序数组', '3 1 2')
  await expect(page.locator('.experiment-feedback')).toContainText('实验不会偷偷排序')
  await expect(page.getByRole('button', { name: '查找到结束' })).toBeDisabled()
  await editText(page, '有序数组', '1 2 3')
  await page.getByRole('button', { name: '查找到结束' }).click()
  await expect(metric(page, 'lo')).toHaveText('3')
  await finish(page, /令 hi=mid/)
})

test('sort comparisons preserve identity evidence and expose selection instability', async ({ page }) => {
  await open(page, 'sorting')
  await editText(page, '待排序数组', '2 2 1')
  await page.getByLabel('排序算法').selectOption('selection')
  await page.getByRole('button', { name: '运行排序到结束' }).click()
  await expect(page.locator('.data-sequence span')).toHaveText(['0 · #2', '1 · #1', '2 · #0'])
  await page.getByRole('button', { name: '对比三种排序算法' }).click()
  await expect(page.locator('[data-table="sorting-comparison"] tbody tr').nth(1)).toContainText('发生改变')
  await page.getByLabel('排序算法').selectOption('merge')
  await page.getByRole('button', { name: '运行排序到结束' }).click()
  await expect(page.locator('.data-sequence span')).toHaveText(['0 · #2', '1 · #0', '2 · #1'])
  await page.getByRole('button', { name: '对比三种排序算法' }).click()
  await finish(page, /先取左侧，因为左侧同值元素/)
})

test('BST deletes its two-child root and heap maintains the minimum through bubbling', async ({ page }) => {
  await open(page, 'trees-heaps')
  await page.getByRole('button', { name: '插入键', exact: true }).click()
  await page.getByRole('button', { name: '按键查找', exact: true }).click()
  await expect(metric(page, '读取结果')).toHaveText('25')
  await page.getByLabel('操作键').fill('40')
  await page.getByRole('button', { name: '删除键', exact: true }).click()
  await expect(page.locator('.tree-key').filter({ hasText: /^40$/ })).toHaveCount(0)
  await expect(metric(page, '节点数')).toHaveText('7')
  await expect(page.locator('.experiment-goal')).toHaveClass(/reached/)
  await page.getByLabel('树的约束', { exact: true }).selectOption('heap')
  await page.getByLabel('操作键').fill('5')
  await page.getByRole('button', { name: '插入键', exact: true }).click()
  await page.getByRole('button', { name: '查看堆顶', exact: true }).click()
  await expect(metric(page, '读取结果')).toHaveText('5')
  await expect(page.locator('.tree-key.found')).toHaveText('5')
  await page.getByRole('button', { name: '移除堆顶', exact: true }).click()
  await page.getByRole('button', { name: '查看堆顶', exact: true }).click()
  await expect(metric(page, '读取结果')).toHaveText('10')
  await finish(page, /不能只按左右顺序排除/)
})

test('graph algorithms reveal the difference between hops and cost, then handle unreachable nodes', async ({
  page,
}) => {
  await open(page, 'graph')
  await page.getByRole('button', { name: '运行图算法到结束' }).click()
  await expect(metric(page, '路径总权重')).toHaveText('9')
  await page.getByLabel('图算法').selectOption('dijkstra')
  await page.getByRole('button', { name: '运行图算法到结束' }).click()
  await expect(metric(page, '路径总权重')).toHaveText('8')
  await page.getByRole('button', { name: '对比三种图算法' }).click()
  await expect(page.locator('.graph-caption')).toContainText('DIJKSTRA：A → D → B → C → F')
  await finish(page, /BFS 优化的是边数/)
  await editText(page, '边 / 起点-终点:权重', 'A-B:-1')
  await expect(page.getByRole('button', { name: '运行图算法到结束' })).toBeDisabled()
  await editText(page, '边 / 起点-终点:权重', 'A-B:0 B-C:2')
  await page.getByRole('button', { name: '运行图算法到结束' }).click()
  await expect(metric(page, '目标路径')).toHaveText('不可达')
  await page.getByLabel('目标顶点').selectOption('C')
  await page.getByRole('button', { name: '运行图算法到结束' }).click()
  await expect(metric(page, '路径总权重')).toHaveText('2')
})

test('coin change compares a suboptimal greedy path and a false dead end against DP', async ({ page }) => {
  await open(page, 'dynamic-programming')
  await page.getByRole('button', { name: '求解到结束' }).click()
  await expect(metric(page, '结果枚数')).toHaveText('3')
  await page.getByRole('button', { name: '对比贪心与动态规划' }).click()
  await expect(page.locator('[data-table="optimization-comparison"] tbody tr').nth(1)).toContainText('3 + 3')
  await page.getByLabel('求解策略').selectOption('dp')
  await page.getByRole('button', { name: '求解到结束' }).click()
  await expect(metric(page, '结果枚数')).toHaveText('2')
  await editText(page, '可用面额', '3 4')
  await page.getByLabel('求解策略').selectOption('greedy')
  await page.getByRole('button', { name: '求解到结束' }).click()
  await expect(metric(page, '结果枚数')).toHaveText('未找到解')
  await page.getByRole('button', { name: '对比贪心与动态规划' }).click()
  await expect(page.locator('[data-table="optimization-comparison"] tbody tr').nth(1)).toContainText('3 + 3')
  await finish(page, /只说明这条贪心路径失败/)
})
