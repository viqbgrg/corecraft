import { expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
export async function openCourse(page: Page, slug: string) {
  page.on('pageerror', (error) => {
    throw error
  })
  await page.goto('#/learn/' + slug + '?mode=experiment')
  await expect(page.locator('.workbench')).toBeVisible()
}
export const metric = (page: Page, label: string) =>
  page
    .locator('.metric')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('strong')
export const click = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' }).click()
export const select = (page: Page, id: string, value: string) =>
  page.locator(`.workbench select[id$="-${id}"]`).selectOption(value)
export async function fill(page: Page, id: string, value: string) {
  const input = page.locator(`.workbench input[id$="-${id}"]`)
  await input.fill(value)
  await input.blur()
}
export async function finishCourse(page: Page, answer: RegExp) {
  await expect(page.locator('.experiment-goal')).toHaveClass(/reached/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations,
  ).toEqual([])
  await page.getByRole('tab', { name: /Challenge/ }).click()
  await page.getByRole('radio', { name: answer }).check()
  await click(page, '验证我的理解')
  await click(page, '完成本课')
  await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeDisabled()
}
