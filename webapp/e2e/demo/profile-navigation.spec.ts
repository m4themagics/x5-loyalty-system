import { expect, test } from '@playwright/test'

import { openTab, prepareLoginBox, dismissLoginDay } from './stand'

const chestStorageKey = 'pyaterochka_profile_chest_deadline'
const demoStateKey = 'pyaterochka_demo_challenge_state'

/** Total copies in the shared inventory of the active profile. */
async function readOwnedCopies(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return 0
    const store = JSON.parse(raw) as {
      active_profile_id: string
      profiles: Record<string, { profile: { inventory: { quantity: number }[] } }>
    }
    const active = store.profiles[store.active_profile_id]
    return active.profile.inventory.reduce((total, entry) => total + entry.quantity, 0)
  }, demoStateKey)
}
const activeDiscountStorageKey = 'pyaterochka_profile_active_discount'

test('returns to the top when switching from the scrolled profile to Home', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Profile' }).click()
  await dismissLoginDay(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
  await expect(page.getByText('Savings over 28 days')).toBeVisible()
  await expect(page.getByText('Saved over 28 days')).toHaveCount(0)
  await expect(page.locator('.profile-stat-value')).toHaveCSS('color', 'rgb(20, 145, 62)')
  await expect(page.locator('.profile-trade-entry [data-slot="typography"]')).toHaveCSS('color', 'rgb(32, 33, 36)')

  await page.evaluate(() => window.scrollTo(0, 600))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Home' }).click()

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.getByRole('region', { name: 'Loyalty card' })).toBeVisible()
})

test('the demo chest stays available across reloads and keeps its rules visible', async ({ page }) => {
  await page.addInitScript(
    ({ key, deadline }) => window.localStorage.setItem(key, String(deadline)),
    { key: chestStorageKey, deadline: Date.now() + 24 * 60 * 60 * 1_000 },
  )

  await page.goto('/')
  await page.getByRole('button', { name: 'Profile' }).click()
  await dismissLoginDay(page)
  await expect(page.getByRole('button', { name: 'Open the Pyaterochka box' })).toBeEnabled()
  await expect(page.getByText('Shared store challenges, visible to every customer')).toHaveCount(0)
  await expect(page.locator('.chest-timer-label')).toHaveText('Pyaterochka box')
  await expect(page.locator('.chest-timer-value')).toHaveText('Ready')

  await page.getByRole('button', { name: 'Box information' }).click()
  const chestInfo = page.getByRole('dialog', { name: 'How to open the box' })
  await expect(chestInfo.getByText('Demonstration mode', { exact: false })).toBeVisible()
  await expect(chestInfo.getByRole('list', { name: 'Item drop rates' })).toContainText('Common70%')
  await expect(chestInfo.getByRole('list', { name: 'Item drop rates' })).toContainText('Epic25%')
  await expect(chestInfo.getByRole('list', { name: 'Item drop rates' })).toContainText('Legendary5%')
  await chestInfo.getByRole('button', { name: 'Close information' }).click()

  await page.reload()
  await page.getByRole('button', { name: 'Profile' }).click()
  await dismissLoginDay(page)
  await expect(page.getByRole('button', { name: 'Open the Pyaterochka box' })).toBeEnabled()
  await expect(page.locator('.chest-timer-value')).toHaveText('Ready')

  for (const tab of ['Collection', 'Friends', 'Challenges'] as const) {
    await openTab(page, tab)
    await expect(page.getByRole('button', { name: 'Open the Pyaterochka box' })).toBeVisible()
    if (tab === 'Friends') {
      await expect(page.getByText('When an invited friend makes their first purchase, you receive an item for your collection.')).toBeVisible()
      await expect(page.getByText('One reward per week and only for a confirmed purchase.')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: "Friends' progress" })).toBeVisible()
      // Money is out of the comparison: the ranking speaks only about what was collected.
      await expect(page.getByText('Only savings actually redeemed over 28 days are counted.', { exact: false })).toHaveCount(0)
      // A friend card keeps the title and the items, but no amounts.
      await expect(page.locator('.demo-friend-score').first()).not.toContainText('₽')
      await expect(page.locator('.demo-friend').first()).not.toContainText('₽')
      await expect(page.locator('.demo-friend')).toHaveCount(3)
      await expect(page.getByRole('heading', { name: 'Collection title' })).toHaveCount(0)
      await expect(page.locator('.demo-title-value')).toBeVisible()
    }
  }
})

test('opens an available chest and keeps accelerated demo mode after reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Profile' }).click()
  await dismissLoginDay(page)
  await expect(page.getByRole('heading', { level: 2, name: 'Personal challenge' })).toBeVisible()
  await prepareLoginBox(page)
  const copiesBefore = await readOwnedCopies(page)
  await page.getByRole('button', { name: 'Open the Pyaterochka box' }).click()

  const shakeTarget = page.getByRole('button', { name: 'Shake the box' })
  const box = await shakeTarget.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return

  const centerY = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, centerY)
  await page.mouse.down()
  for (let move = 0; move < 9; move += 1) {
    const x = move % 2 === 0 ? box.x + 24 : box.x + box.width - 24
    await page.mouse.move(x, centerY)
  }
  await page.mouse.up()

  await expect(page.getByRole('heading', { name: 'You got an item!' })).toBeVisible()
  await expect(page.locator('.revealed-reward-item')).toBeVisible()
  await page.getByRole('button', { name: 'Collect', exact: true }).click()

  // A box item lands in the same inventory as challenge rewards.
  const copiesAfter = await readOwnedCopies(page)
  expect(copiesAfter).toBe(copiesBefore + 1)

  await openTab(page, 'Challenges')
  const chestButton = page.getByRole('button', { name: 'Open the Pyaterochka box' })
  await expect(chestButton).toBeEnabled()
  await page.reload()
  await page.getByRole('button', { name: 'Profile' }).click()
  await dismissLoginDay(page)
  await expect(chestButton).toBeEnabled()
  expect(await readOwnedCopies(page)).toBe(copiesAfter)
})

test('crafts a themed discount from four inventory items and restores its barcode', async ({ page }) => {
  await page.addInitScript((discountKey) => {
    if (window.sessionStorage.getItem('crafting-fixture-seeded') === 'true') return
    window.localStorage.removeItem(discountKey)
    window.sessionStorage.setItem('crafting-fixture-seeded', 'true')
  }, activeDiscountStorageKey)

  await page.goto('/')
  await page.getByRole('button', { name: 'Profile' }).click()
  await dismissLoginDay(page)
  await openTab(page, 'Collection')
  await expect(page.getByText('Collect 4 items')).toBeVisible()
  await expect(page.getByText('The items you have received, ready to be spent on a discount.')).toBeVisible()
  await expect(page.getByText('Drag four items. Creating a discount spends one copy of each.')).toHaveCount(0)
  await expect(page.getByText('Drag an item up or tap to select it, then tap a slot.')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Challenge items' })).toHaveCount(0)

  const firstItem = page.locator('.inventory-item[aria-label^="Clubhouse Toaster"]')
  await expect(firstItem).toBeVisible()
  const firstSlot = page.getByRole('button', { name: 'Empty discount slot 1' })
  await firstItem.dragTo(firstSlot)
  await expect(page.getByRole('button', { name: /Clubhouse Toaster in slot 1/ }))
    .toBeVisible()

  for (const [itemName, slotNumber] of [
    ['Clubhouse Toaster', 2],
    ['Milk Pitcher', 3],
    ['Breakfast Pan', 4],
  ] as const) {
    await page.locator(`.inventory-item[aria-label^="${itemName}"]`).click()
    const itemDialog = page.getByRole('dialog', { name: `Item "${itemName}"` })
    await expect(itemDialog).toBeVisible()
    await expect(itemDialog.getByText(/discount/i)).toHaveCount(0)
    await itemDialog.getByRole('button', { name: 'Add to the set' }).click()
    await expect(itemDialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: new RegExp(`${itemName} in slot ${slotNumber}`) }))
      .toBeVisible()
  }

  const createButton = page.getByRole('button', { name: 'Create a 7% discount' })
  await expect(createButton).toBeEnabled()
  await createButton.click()

  const discountDialog = page.getByRole('dialog', { name: 'Crafted discount' })
  await expect(discountDialog).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Good Morning' })).toBeVisible()
  await expect(discountDialog.getByText('−7%', { exact: true })).toBeVisible()
  // The same button exists on the active discount card, so take the one inside the dialog.
  await discountDialog.getByRole('button', { name: 'Show barcode' }).click()
  const barcodeDialog = page.getByRole('dialog', { name: 'Discount barcode' })
  await expect(barcodeDialog).toBeVisible()
  await expect(barcodeDialog.getByText('Show at the till')).toHaveCount(0)
  await expect(barcodeDialog.getByRole('heading', { name: 'Good Morning' })).toBeVisible()
  await expect(barcodeDialog.locator('.discount-barcode-percent')).toHaveText('−7%')
  await expect(page.getByRole('img', { name: /^Barcode \d{13}$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Close discount' }).click()

  const discountBadge = page.getByRole('button', { name: /Open the 7% "Good Morning" discount/ })
  await expect(discountBadge).toBeVisible()
  await expect(discountBadge).toHaveCSS('border-top-color', 'rgb(22, 163, 74)')
  await page.reload()
  await page.getByRole('button', { name: 'Profile' }).click()
  await dismissLoginDay(page)
  await expect(discountBadge).toBeVisible()
  await discountBadge.click()
  await expect(page.getByRole('img', { name: /^Barcode \d{13}$/ })).toBeVisible()
})
