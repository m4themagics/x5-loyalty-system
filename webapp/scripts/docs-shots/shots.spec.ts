import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test, type Page } from '@playwright/test'

import { dismissLoginDay, openTab, prepareLoginBox, putItemIntoDiscountSlot } from '../../e2e/demo/stand'

/**
 * Кадры уходят сырыми в артефакты, а `build.mjs` собирает из них WebP и GIF в docs/assets.
 * Селекторы берём из общих помощников e2e: один источник правды не даёт съёмке отстать от кода.
 */
const raw = fileURLToPath(new URL('../../e2e/.artifacts/docs-shots/raw/', import.meta.url))
mkdirSync(raw, { recursive: true })

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${raw}${name}.png`, animations: 'disabled' })

async function openProfile(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await dismissLoginDay(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Профиль' })).toBeVisible()
}

/**
 * Задание считается отдельным запросом к движку. Пока приложение догружает синтетические
 * профили, нажатие молча игнорируется, поэтому клик повторяется до появления карточки.
 */
async function showChallenge(page: Page) {
  const card = page.getByRole('article', { name: 'Карточка задания' })
  const ask = page.getByRole('button', { name: 'Показать задание' })
  await expect.poll(async () => {
    if (await card.count() > 0) return true
    if (await ask.count() > 0) await ask.first().click()
    return await card.count() > 0
  }, { timeout: 40_000, intervals: [700, 1_200, 2_000] }).toBe(true)
  await expect(card).toBeVisible()
  return card
}

test('снимает картинки для документации', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Карта лояльности' })).toBeVisible()
  await page.waitForTimeout(600)
  await shot(page, 'home')

  await openProfile(page)
  const card = await showChallenge(page)
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await card.screenshot({ path: `${raw}challenge.png`, animations: 'disabled' })

  await openTab(page, 'Друзья')
  const ranking = page.locator('.demo-progress')
  await expect(ranking.getByRole('heading', { name: 'Прогресс друзей' })).toBeVisible()
  await page.waitForTimeout(400)
  await ranking.screenshot({ path: `${raw}friends.png`, animations: 'disabled' })

  await openTab(page, 'Задания')
  await page.getByRole('button', { name: 'Демо-стенд', exact: true }).click()
  await page.getByRole('button', { name: 'Для X5', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Для X5', exact: true })
  await expect(panel).toBeVisible()
  await page.waitForTimeout(600)
  await panel.screenshot({ path: `${raw}x5-panel.png`, animations: 'disabled' })
})

test('снимает открытие коробки', async ({ page }) => {
  await openProfile(page)
  await prepareLoginBox(page)
  await page.getByRole('button', { name: 'Открыть коробку Пятёрочки' }).click()
  const shakeTarget = page.getByRole('button', { name: 'Трясти коробку' })
  await expect(shakeTarget).toBeVisible()
  await page.waitForTimeout(800)

  await record(page, 'box', async () => {
    const box = await shakeTarget.boundingBox()
    if (box === null) return
    const centerY = box.y + box.height / 2
    await page.mouse.move(box.x + box.width / 2, centerY)
    await page.mouse.down()
    for (let move = 0; move < 14; move += 1) {
      await page.mouse.move(move % 2 === 0 ? box.x + 20 : box.x + box.width - 20, centerY, { steps: 4 })
      await page.waitForTimeout(35)
    }
    await page.mouse.up()
    await expect(page.getByRole('heading', { name: 'Вам выпал предмет!' })).toBeVisible()
    await page.waitForTimeout(1_200)
    await shot(page, 'reward')
    // Забираем предмет прямо в записи: маскот радуется после закрытия окна награды.
    await page.getByRole('button', { name: 'Забрать' }).click()
    await page.waitForTimeout(1_600)
  })

  // Радость держится 2,6 секунды после закрытия окна — успеваем снять шапку с маскотом.
  await shot(page, 'mascot')
})

test('снимает сборку скидки', async ({ page }) => {
  await openProfile(page)
  await openTab(page, 'Коллекция')
  await expect(page.getByRole('button', { name: 'Пустая ячейка скидки 1' })).toBeVisible()
  await page.waitForTimeout(400)

  await record(page, 'craft', async () => {
    const items = ['Клубный тостер', 'Клубный тостер', 'Молочный кувшин', 'Сковорода завтрака']
    for (const [index, itemName] of items.entries()) {
      await putItemIntoDiscountSlot(page, itemName, index + 1)
      await page.waitForTimeout(200)
    }
    await page.waitForTimeout(600)
    // Четыре заполненные ячейки — состояние перед списанием, его и показываем в документации.
    await shot(page, 'collection')
    await page.getByRole('button', { name: /^Создать скидку \d+%$/ }).click()
    await expect(page.getByRole('dialog', { name: 'Созданная скидка' })).toBeVisible()
    await page.waitForTimeout(1_400)
    await shot(page, 'discount')
  })
})

type Frame = { data: Buffer; ts: number }

/** Пишет экран через CDP: обычная видеозапись Playwright даёт слишком мягкую картинку для GIF. */
async function record(page: Page, name: string, run: () => Promise<void>) {
  const target = `${raw}frames-${name}/`
  mkdirSync(target, { recursive: true })
  const client = await page.context().newCDPSession(page)
  const frames: Frame[] = []
  client.on('Page.screencastFrame', (params) => {
    frames.push({ data: Buffer.from(params.data, 'base64'), ts: params.metadata.timestamp ?? 0 })
    client.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {})
  })
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 })
  await run()
  await client.send('Page.stopScreencast')
  frames.forEach((frame, index) => {
    writeFileSync(`${target}${String(index).padStart(4, '0')}.jpg`, frame.data)
  })
  writeFileSync(`${target}meta.json`, JSON.stringify(frames.map((frame) => frame.ts)))
  console.log(`${name}: ${frames.length} кадров`)
}
