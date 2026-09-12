import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(({ page }) => {
  page.on('pageerror', (error) => {
    throw error
  })
})

test('the visible theme selector preserves experiments, navigation and reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('#/learn/binary?mode=experiment')
  const theme = page.getByRole('combobox', { name: '切换主题' })
  await expect(page.locator('.theme-switcher').getByText('主题', { exact: true })).toBeVisible()
  await expect(theme).toBeInViewport()
  await expect(theme).toHaveValue('system')
  const lightSurface = await page.locator('.workbench').evaluate((el) => getComputedStyle(el).backgroundColor)
  await page.getByRole('button', { name: 'A 的第 0 位，当前 0' }).click()

  await theme.selectOption('dark')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  await expect(page.locator('.workbench')).not.toHaveCSS('background-color', lightSurface)
  await expect(page.getByLabel('十进制 A', { exact: true })).toHaveValue('43')
  await theme.focus()
  await page.keyboard.press('ArrowUp')
  await expect(theme).toHaveValue('light')
  await expect(page.locator('.workbench')).toHaveCSS('background-color', lightSurface)
  await expect(page.getByLabel('十进制 A', { exact: true })).toHaveValue('43')

  await theme.selectOption('dark')
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /学习路线/ })
    .click()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  await page.reload()
  await expect(theme).toHaveValue('dark')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  await theme.selectOption('light')
  await page.reload()
  await expect(theme).toHaveValue('light')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
})

test('system mode tracks device changes while explicit choices take precedence', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('#/learn/modeling')
  const theme = page.getByRole('combobox', { name: '切换主题' })
  await expect(theme).toHaveValue('system')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
  await theme.selectOption('light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
  await theme.selectOption('system')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  await page.reload()
  await expect(theme).toHaveValue('system')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
})

for (const storage of ['invalid', 'unavailable']) {
  test(`theme switching works with ${storage} browser storage`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.addInitScript((scenario) => {
      if (scenario === 'invalid') localStorage.setItem('corecraft.theme.v1', 'invalid-theme')
      else {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('Storage is unavailable', 'SecurityError')
          },
        })
      }
    }, storage)
    await page.goto('#/learn/binary')
    const theme = page.getByRole('combobox', { name: '切换主题' })
    await expect(theme).toHaveValue('system')
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
    await theme.selectOption('light')
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
    await page.getByRole('button', { name: 'A 的第 0 位，当前 0' }).click()
    await expect(page.getByLabel('十进制 A', { exact: true })).toHaveValue('43')
  })
}

test('theme and navigation controls fit narrow and wide headers', async ({ page }) => {
  await page.goto('#/learn/binary')
  for (const width of [320, 520, 680, 800, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByRole('combobox', { name: '切换主题' })).toBeInViewport()
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), String(width)).toBe(
      true,
    )
    const brand = await page.locator('.header-brand').boundingBox()
    const theme = await page.locator('.theme-switcher').boundingBox()
    expect(brand!.x + brand!.width, String(width)).toBeLessThanOrEqual(theme!.x)
  }
  await page.setViewportSize({ width: 320, height: 900 })
  await page.getByRole('button', { name: '打开课程导航' }).click()
  await expect(page.locator('#course-navigation')).not.toHaveAttribute('inert', '')
  const header = await page.locator('.app-header').boundingBox()
  const sidebar = await page.locator('#course-navigation').boundingBox()
  expect(sidebar!.y).toBe(header!.y + header!.height)
  await page.keyboard.press('Escape')
  await page.getByRole('combobox', { name: '切换主题' }).selectOption('dark')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
})

test('dark lessons, experiment states, roadmap and dialog meet WCAG A and AA checks', async ({ page }) => {
  test.setTimeout(90_000)
  await page.emulateMedia({ colorScheme: 'dark' })
  const checkAccessibility = async (view: string) => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(
      result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      view,
    ).toEqual([])
  }
  for (const slug of [
    'modeling',
    'binary',
    'pipeline',
    'branch-prediction',
    'cache',
    'process',
    'virtual-memory',
    'tcp-handshake',
    'btree',
    'graph',
    'transactions',
  ]) {
    await page.goto('#/learn/' + slug)
    await expect(page.locator('.workbench')).toBeVisible()
    if (slug === 'binary') {
      await page.getByRole('button', { name: '试试 255 + 1' }).click()
      await page.getByLabel('二进制 A', { exact: true }).fill('10200000')
      await page.getByLabel('二进制 A', { exact: true }).press('Tab')
    } else if (slug === 'pipeline') {
      for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '推进 1 个周期' }).click()
    } else if (slug === 'branch-prediction') {
      await page.getByRole('button', { name: '先预测下一次分支' }).click()
      await page.getByRole('button', { name: '揭晓结果并更新预测器' }).click()
    }
    await checkAccessibility(slug)
  }
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await checkAccessibility('dialog')
  await page.keyboard.press('Escape')
  await page.goto('#/roadmap')
  await expect(page.locator('.roadmap-level')).toHaveCount(18)
  await checkAccessibility('roadmap')
})
