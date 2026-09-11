import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function open(page: Page, slug: string) {
  page.on('pageerror', (error) => {
    throw error
  })
  await page.goto('#/learn/' + slug + '?mode=experiment')
  await expect(page.locator('.workbench')).toBeVisible()
}
const metric = (page: Page, label: string) =>
  page
    .locator('.metric')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('strong')
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

test('Java method arguments share objects but rebind only the parameter slot', async ({ page }) => {
  await open(page, 'java-objects')
  await page.getByRole('button', { name: 'main · a = new Box(value)' }).click()
  await page.getByRole('button', { name: 'main · b = a' }).click()
  await page.getByRole('button', { name: '调用 change(a) · 参数复制' }).click()
  await page.getByLabel('Box 字段新值').fill('20')
  await page.getByRole('button', { name: '通过引用修改对象字段' }).click()
  await expect(page.locator('[data-table="java-stack"] tbody tr')).toHaveCount(3)
  await page.getByLabel('Box 字段新值').fill('30')
  await page.getByRole('button', { name: 'change · p = new Box(value)' }).click()
  await page.getByRole('button', { name: 'change 返回并弹出栈帧' }).click()
  await expect(metric(page, '栈帧数')).toHaveText('1')
  await expect(metric(page, '已分配 Box')).toHaveText('2')
  await expect(metric(page, '栈可达 Box')).toHaveText('1')
  await finish(page, /仍指向 O1，O1.value 已变为 20/)
})

test('class identity follows defining loader and reflective failures preserve their cause', async ({
  page,
}) => {
  await open(page, 'java-classes')
  await page.getByLabel('请求类的加载器').selectOption('Plugin')
  await page.getByRole('button', { name: 'loadClass · 仅加载类型' }).click()
  await page.getByRole('button', { name: 'Reflection · 检查方法元数据' }).click()
  await expect(page.locator('[data-table="java-loaded-classes"]')).toContainText('否')
  await page.getByRole('button', { name: '初始化并创建 Counter 实例' }).click()
  await page.getByRole('button', { name: '转换为 App 的 Counter' }).click()
  await page.getByLabel('新场景的 Plugin 委派规则').selectOption('local')
  await page.getByRole('button', { name: '初始化并创建 Counter 实例' }).click()
  await page.getByRole('button', { name: '转换为 App 的 Counter' }).click()
  await expect(page.locator('.experiment-feedback')).toContainText('ClassCastException')
  await page.getByRole('button', { name: 'Method.invoke · 调用目标方法' }).click()
  await expect(metric(page, '异常栈深度')).toHaveText('3')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '传播异常 / 处理一个栈帧' }).click()
  await expect(metric(page, 'finally 执行次数')).toHaveText('1')
  await expect(page.locator('.experiment-feedback')).toContainText('cause')
  await finish(page, /定义加载器不同导致运行时类型不同/)
})

test('Java collections grow, retain hash collisions and reject a polluted String cast', async ({ page }) => {
  await open(page, 'java-collections')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'add / put · 写入集合' }).click()
  await expect(metric(page, 'List size / capacity')).toHaveText('3 / 3')
  await page.getByLabel('待写入对象的运行时类型').selectOption('Integer')
  await page.getByLabel('元素 / 值 / Set 查询键').fill('7')
  await page.getByRole('button', { name: 'add / put · 写入集合' }).click()
  await expect(page.locator('.experiment-feedback')).toContainText('泛型检查拒绝')
  await page.getByLabel('List / Map 写入调用点').selectOption('raw')
  await page.getByRole('button', { name: 'add / put · 写入集合' }).click()
  await page.getByLabel('List 下标').fill('3')
  await page.getByRole('button', { name: 'get / contains · 读取集合' }).click()
  await expect(page.locator('.experiment-feedback')).toContainText('ClassCastException')
  await page.getByLabel('Java 集合实现').selectOption('map')
  await page.getByLabel('待写入对象的运行时类型').selectOption('String')
  await page.getByRole('button', { name: 'add / put · 写入集合' }).click()
  await page.getByLabel('HashMap 字符串键').fill('BB')
  await page.getByRole('button', { name: 'add / put · 写入集合' }).click()
  await expect(metric(page, '不同键碰撞次数')).toHaveText('1')
  await finish(page, /未检查写入造成堆污染/)
})

test('volatile adds a transitive publication edge that rules out the initial data value', async ({
  page,
}) => {
  await open(page, 'java-memory-model')
  const publication = async () => {
    for (const name of [
      'writer · data = 42',
      'writer · ready = true',
      'reader · 读取 ready',
      'reader · 尝试读取 data',
    ])
      await page.getByRole('button', { name, exact: true }).click()
  }
  await publication()
  await expect(metric(page, 'reader 的 data')).toHaveText('0')
  await page.getByLabel('ready 的内存语义 / 重开场景').selectOption('volatile')
  await publication()
  await expect(page.locator('.experiment-feedback')).toContainText('happens-before')
  await expect(metric(page, 'reader 的 data')).toHaveText('未读')
  await page.getByLabel('尝试选择的 data 写入来源').selectOption('writer')
  await page.getByRole('button', { name: 'reader · 尝试读取 data' }).click()
  await expect(metric(page, 'reader 的 data')).toHaveText('42')
  await page.getByRole('button', { name: '枚举普通与 volatile 发布结果' }).click()
  await expect(page.locator('[data-table="jmm-outcomes"] tbody tr')).toHaveCount(5)
  await finish(page, /两侧程序顺序与 volatile 同步边传递/)
})

test('Java IO separates byte and char units and exposes explicit buffer boundaries', async ({ page }) => {
  await open(page, 'java-io-apis')
  await page.getByRole('button', { name: 'read · 从当前输入读取' }).click()
  await expect(metric(page, 'Stream 字节偏移')).toHaveText('2')
  await page.getByLabel('当前 Java IO 接口').selectOption('reader')
  await page.getByRole('button', { name: 'read · 从当前输入读取' }).click()
  await expect(page.locator('[data-table="java-io-outputs"]')).toContainText('0041 4E2D')
  await page.getByLabel('当前 Java IO 接口').selectOption('channel')
  await page.getByRole('button', { name: 'read · 从当前输入读取' }).click()
  await page.getByRole('button', { name: 'ByteBuffer.flip', exact: true }).click()
  await page.getByRole('button', { name: 'ByteBuffer.get · 消费剩余字节' }).click()
  await expect(metric(page, 'Buffer position / limit / capacity')).toHaveText('2 / 2 / 4')
  await page.getByRole('button', { name: '独立运行三个 API 到 EOF' }).click()
  await expect(page.locator('[data-table="java-io-comparison"] tbody tr')).toHaveCount(3)
  await finish(page, /当前 Buffer 没有空间/)
})
