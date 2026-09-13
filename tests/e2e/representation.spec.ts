import { expect, test, type Page } from '@playwright/test'

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
function dataValue(page: Page, label: string) {
  return page
    .locator('.data-cards > div')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('dd.mono')
}
async function edit(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value)
  await page.getByLabel(label, { exact: true }).press('Tab')
}
async function finish(page: Page, answer: RegExp) {
  await expect(page.locator('.experiment-goal')).toHaveClass(/reached/)
  await page.getByRole('tab', { name: /Challenge/ }).click()
  await page.getByRole('radio', { name: answer }).check()
  await page.getByRole('button', { name: '验证我的理解' }).click()
  await page.getByRole('button', { name: '完成本课', exact: true }).click()
  await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('a beginner can follow reading, processing and output, then explain a changed input', async ({
  page,
}) => {
  await open(page, 'modeling')
  await expect(dataValue(page, '当前记住的数')).toHaveText('还没读取')
  await expect(dataValue(page, '输出')).toHaveText('还没显示')
  await expect(page.getByRole('button', { name: '验证预测并执行下一步' })).toBeDisabled()
  await page.getByRole('button', { name: '执行下一步', exact: true }).click()
  await expect(dataValue(page, '当前记住的数')).toHaveText('3')
  await page.getByLabel('预测下一步记住的数').fill('5')
  await page.getByRole('button', { name: '验证预测并执行下一步', exact: true }).click()
  await expect(metric(page, '正确预测 / 总预测')).toHaveText('1 / 1')
  await expect(dataValue(page, '输入')).toHaveText('3')
  await expect(dataValue(page, '当前记住的数')).toHaveText('5')
  await expect(dataValue(page, '输出')).toHaveText('还没显示')
  await expect(page.locator('.experiment-goal')).not.toHaveClass(/reached/)
  await page.getByRole('button', { name: '执行下一步', exact: true }).click()
  await expect(dataValue(page, '输出')).toHaveText('5')
  await expect(metric(page, '已完成步骤')).toHaveText('3 / 3')
  await expect(metric(page, '实验进度')).toHaveText('已完成')
  await finish(page, /输入数据变了，程序仍按同一条加 2 规则处理/)
  await page.getByRole('tab', { name: /Experiment/ }).click()
  await edit(page, '输入的数字', '4')
  await expect(metric(page, '正确预测 / 总预测')).toHaveText('0 / 0')
  await expect(dataValue(page, '输出')).toHaveText('还没显示')
  await page.getByRole('button', { name: '完成剩余步骤' }).click()
  await expect(dataValue(page, '输出')).toHaveText('6')
  await expect(page.locator('.experiment-goal')).not.toHaveClass(/reached/)
  await page.getByRole('button', { name: '用相同设置再试一次' }).click()
  await expect(page.getByLabel('输入的数字', { exact: true })).toHaveValue('4')
  await expect(metric(page, '已完成步骤')).toHaveText('0 / 3')
})

test('changing the rule or its order recomputes from the same input', async ({ page }) => {
  await open(page, 'modeling')
  await page.getByLabel('处理规则').selectOption('add-double')
  await page.getByRole('button', { name: '完成剩余步骤' }).click()
  await expect(dataValue(page, '输出')).toHaveText('10')
  await page.getByLabel('处理规则').selectOption('double-add')
  await expect(dataValue(page, '当前记住的数')).toHaveText('还没读取')
  await page.getByRole('button', { name: '完成剩余步骤' }).click()
  await expect(dataValue(page, '输入')).toHaveText('3')
  await expect(dataValue(page, '输出')).toHaveText('8')
  await edit(page, '加多少', '4')
  await page.getByRole('button', { name: '完成剩余步骤' }).click()
  await expect(dataValue(page, '输出')).toHaveText('10')
  await page.getByLabel('处理规则').selectOption('double')
  await expect(page.getByLabel('加多少')).toHaveCount(0)
  await page.getByRole('button', { name: '完成剩余步骤' }).click()
  await expect(dataValue(page, '输出')).toHaveText('6')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('signed arithmetic keeps carry separate from overflow', async ({ page }) => {
  await open(page, 'signed-number')
  await page.getByRole('button', { name: '完成全部位计算' }).click()
  await expect(metric(page, '有符号结果')).toHaveText('-128')
  await expect(metric(page, 'Carry')).toHaveText('0')
  await expect(metric(page, 'Overflow')).toHaveText('1')
  await page.getByRole('button', { name: '对比进位与溢出反例' }).click()
  await finish(page, /Carry=0、Overflow=1/)
  await page.getByRole('tab', { name: /Experiment/ }).click()
  await page.getByLabel('有符号 A', { exact: true }).fill('-1')
  await page.getByRole('button', { name: '完成全部位计算' }).click()
  await expect(metric(page, '有符号结果')).toHaveText('0')
  await expect(metric(page, 'Carry')).toHaveText('1')
  await expect(metric(page, 'Overflow')).toHaveText('0')
})

test('float32 rounding reveals exact decimal error and spacing', async ({ page }) => {
  await open(page, 'floating-point')
  await page.getByRole('button', { name: '执行舍入并拆解编码' }).click()
  await expect(metric(page, '十六进制编码')).toHaveText('0x3E99999A')
  await page.getByRole('button', { name: '比较精确值与舍入值' }).click()
  await edit(page, '十进制输入 A', '16777216')
  await edit(page, '十进制输入 B', '1')
  await page.getByRole('button', { name: '执行舍入并拆解编码' }).click()
  await expect(metric(page, 'binary32 结果')).toHaveText('16777216')
  await edit(page, '十进制输入 B', '2')
  await page.getByRole('button', { name: '执行舍入并拆解编码' }).click()
  await expect(metric(page, 'binary32 结果')).toHaveText('16777218')
  await page.getByRole('button', { name: '比较精确值与舍入值' }).click()
  await finish(page, /该区间相邻浮点数间距为 2/)
})

test('Unicode text round-trips and truncated UTF-8 fails visibly', async ({ page }) => {
  await open(page, 'encoding')
  await page.getByRole('button', { name: '文字 → UTF-8 字节' }).click()
  await expect(metric(page, 'Unicode 标量值')).toHaveText('3')
  await expect(metric(page, 'UTF-16 代码单元')).toHaveText('4')
  await expect(metric(page, 'UTF-8 字节数')).toHaveText('8')
  await page.getByRole('button', { name: '严格解码 UTF-8 → 文字' }).click()
  await finish(page, /8 字节：A 占 1/)
  await page.getByRole('tab', { name: /Experiment/ }).click()
  await edit(page, 'UTF-8 十六进制字节', '41 E4 B8 AD F0 9F 99')
  await page.getByRole('button', { name: '严格解码 UTF-8 → 文字' }).click()
  await expect(page.locator('.experiment-feedback')).toContainText('序列不完整')
  await expect(page.locator('.experiment-goal')).not.toHaveClass(/reached/)
})

test('Boolean comparison produces a concrete counterexample', async ({ page }) => {
  await open(page, 'logic')
  await page.getByRole('button', { name: '计算当前输入的逻辑门' }).click()
  await page.getByRole('button', { name: '穷举真值表验证等价' }).click()
  await expect(metric(page, '函数等价')).toHaveText('是')
  await edit(page, '右布尔表达式', '!A & !B')
  await page.getByRole('button', { name: '穷举真值表验证等价' }).click()
  await expect(metric(page, '函数等价')).toHaveText('否')
  await page.getByRole('button', { name: '代入第一个反例' }).click()
  await expect(metric(page, '左表达式输出')).toHaveText('1')
  await expect(metric(page, '右表达式输出')).toHaveText('0')
  await finish(page, /只能说明该组输入一致/)
})
