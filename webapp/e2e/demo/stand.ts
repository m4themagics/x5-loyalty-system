import { expect, type Page } from '@playwright/test'

/** Служебные инструменты демонстрации живут в отдельном стенде, а не на экране покупателя. */
export const DEMO_PROFILES = {
  showcase: /Показательный профиль/,
  empty: /Новый участник, пустой инвентарь/,
  seeded: /три предмета «Доброго утра»/,
  anya: 'Аня',
  boris: 'Борис',
} as const

export async function openStand(page: Page) {
  await page.getByRole('button', { name: 'Демо-стенд', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Демо-стенд' })).toBeVisible()
}

export async function closeStand(page: Page) {
  await page.getByRole('button', { name: 'Закрыть демо-стенд' }).click()
  await expect(page.getByRole('region', { name: 'Демо-стенд' })).toHaveCount(0)
}

/** Переключает синтетический профиль и возвращает экран покупателя. */
export async function switchProfile(page: Page, name: string | RegExp) {
  await openStand(page)
  await page.getByRole('button', { name }).click()
  await closeStand(page)
}

export async function sendReceipt(page: Page, name: string) {
  await openStand(page)
  await page.getByRole('button', { name }).click()
}

export const standLog = (page: Page) => page.locator('.demo-stand-log')

/** Экран профиля разделён на вкладки: игровые действия доступны только на своей. */
export async function openTab(page: Page, name: 'Задания' | 'Коллекция' | 'Друзья') {
  const tab = page
    .getByRole('navigation', { name: 'Разделы профиля' })
    .getByRole('button', { name, exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-current', 'page')
}
