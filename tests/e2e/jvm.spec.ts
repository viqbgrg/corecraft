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

test('JVM preparation, initialization and typed operand execution stay distinct', async ({ page }) => {
  await open(page, 'jvm-runtime')
  for (const name of ['加载教学类元数据', '验证字节码类型', '准备静态字段默认值'])
    await page.getByRole('button', { name, exact: true }).click()
  await expect(page.locator('.data-cards').filter({ hasText: '普通静态字段 seed' })).toContainText('0')
  for (const name of [
    '解析常量池依赖',
    '主动使用 / 初始化类',
    '在 Java 堆分配一个对象',
    '解释执行到方法返回',
    '对比相同字段的两种对象布局',
  ])
    await page.getByRole('button', { name, exact: true }).click()
  await expect(metric(page, '方法返回值')).toHaveText('12')
  await expect(metric(page, 'Heap 已用 / 容量')).toHaveText('24 / 128 B')
  await expect(page.locator('[data-table="jvm-layout-comparison"] tbody tr')).toHaveCount(2)
  await finish(page, /prepare 时为 0，initialize 后为 7/)
})

test('generational GC traces cross-generation roots, reclaims cycles and promotes real survivors', async ({
  page,
}) => {
  await open(page, 'jvm-gc')
  await page.getByRole('button', { name: '暂停应用并开始标记' }).click()
  await page.getByRole('button', { name: '标记一个前沿对象' }).click()
  await expect(page.locator('[data-table="gc-marking"]')).toContainText('O2')
  await page.getByRole('button', { name: '完成剩余可达性标记' }).click()
  await page.getByRole('button', { name: '回收未标记对象并整理' }).click()
  await expect(metric(page, '累计回收对象')).toHaveText('2')
  await page.getByRole('button', { name: '运行当前范围的完整 GC' }).click()
  await expect(metric(page, '累计晋升对象')).toHaveText('2')
  await page.getByLabel('GC 回收范围').selectOption('full')
  await page.getByRole('button', { name: '运行当前范围的完整 GC' }).click()
  await expect(page.locator('[data-table="gc-objects"] tbody tr')).toHaveCount(3)
  await expect(metric(page, '累计回收对象')).toHaveText('3')
  await finish(page, /把 old→young 记忆集合中的入边作为边界根/)
})

test('region relocation preserves values through eager repair and a load barrier', async ({ page }) => {
  await open(page, 'jvm-collectors')
  await page.getByRole('button', { name: '检查各老区回收收益' }).click()
  await page.getByRole('button', { name: '搬迁选中老区的存活对象' }).click()
  await expect(metric(page, '停顿内修复引用')).toHaveText('1')
  await page.getByRole('button', { name: '读取 main 指向对象的首个引用' }).click()
  await expect(metric(page, '最近读取字段值')).toHaveText('30')
  await page.getByLabel('重开相同输入的收集机制').selectOption('zgc')
  await page.getByRole('button', { name: '搬迁选中老区的存活对象' }).click()
  await page.getByLabel('加载引用时的教学验证').selectOption('off')
  await page.getByRole('button', { name: '读取 main 指向对象的首个引用' }).click()
  await expect(page.locator('.experiment-feedback')).toContainText('旧引用')
  await page.getByLabel('加载引用时的教学验证').selectOption('on')
  await page.getByRole('button', { name: '读取 main 指向对象的首个引用' }).click()
  await expect(metric(page, '加载时修复引用')).toHaveText('1')
  await expect(metric(page, '最近读取字段值')).toHaveText('30')
  await finish(page, /通过屏障解析转发关系/)
})

test('JIT warmup removes allocations, safepoints wait for polls and changed types deoptimize', async ({
  page,
}) => {
  await open(page, 'jvm-jit')
  const begin = () => page.getByRole('button', { name: '开始一次方法调用' }).click()
  const run = () => page.getByRole('button', { name: '运行到返回或安全点' }).click()
  for (let i = 0; i < 3; i++) {
    await begin()
    await run()
  }
  await expect(metric(page, '累计对象分配')).toHaveText('15')
  await begin()
  await page.getByRole('button', { name: 'VM 请求 Safepoint' }).click()
  await page.getByRole('button', { name: '执行一次循环迭代' }).click()
  await expect(page.getByRole('button', { name: 'VM 恢复安全点中的线程' })).toBeDisabled()
  await run()
  await page.getByRole('button', { name: 'VM 恢复安全点中的线程' }).click()
  await run()
  await expect(metric(page, '累计对象分配')).toHaveText('15')
  await expect(metric(page, '最近方法结果')).toHaveText('15')
  await page.getByLabel('本次接收者类型').selectOption('ColoredPoint')
  await begin()
  await run()
  await expect(metric(page, '类型守卫失效次数')).toHaveText('1')
  await expect(metric(page, '最近方法结果')).toHaveText('65')
  await page.getByRole('button', { name: '对比相同输入的分配工作量' }).click()
  await finish(page, /不必创建对象身份，保留字段计算即可/)
})
