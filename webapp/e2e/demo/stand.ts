import { expect, type Page } from '@playwright/test'

/** The operator tools of the demo live on a separate stand, not on the customer screen. */
export const DEMO_PROFILES = {
  showcase: /Showcase profile/,
  empty: /New member, empty inventory/,
  seeded: /three "Good Morning" items collected/,
  anya: 'Anna',
  boris: 'Boris',
} as const

/**
 * The login-day dialog opens on every newly counted day, including the first load. Wait for the
 * demo state to load, otherwise the dialog appears after the check has already run.
 */
export async function dismissLoginDay(page: Page) {
  await expect(page.locator('.chest-timer-value')).not.toHaveText('Loading…')
  const dialog = page.getByRole('dialog', { name: 'Login day' })
  if (await dialog.count() === 0) return
  await dialog.getByRole('button', { name: 'Close the login day dialog' }).click()
  await expect(dialog).toHaveCount(0)
}

export async function openStand(page: Page) {
  await page.getByRole('button', { name: 'Demo stand', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Demo stand' })).toBeVisible()
}

export async function closeStand(page: Page) {
  await page.getByRole('button', { name: 'Close the demo stand' }).click()
  await expect(page.getByRole('region', { name: 'Demo stand' })).toHaveCount(0)
}

/** Switches the synthetic profile and returns to the customer screen. */
export async function switchProfile(page: Page, name: string | RegExp) {
  await openStand(page)
  await page.getByRole('button', { name }).click()
  // A new profile is credited a login day: the dialog covers the stand's close button.
  await dismissLoginDay(page)
  await closeStand(page)
}

export async function sendReceipt(page: Page, name: string) {
  await openStand(page)
  await page.getByRole('button', { name }).click()
}

export const standLog = (page: Page) => page.locator('.demo-stand-log')

/** The profile screen is split into tabs: game actions live only on their own tab. */
export async function openTab(page: Page, name: 'Challenges' | 'Collection' | 'Friends') {
  const tab = page
    .getByRole('navigation', { name: 'Profile sections' })
    .getByRole('button', { name, exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-current', 'page')
}

/**
 * The only path to crafting a discount: the item card in "Inventory" puts it into the first free
 * slot. The slot number follows from the call order and is only asserted here.
 */
export async function putItemIntoDiscountSlot(page: Page, itemName: string, slotNumber: number) {
  await page.getByRole('button', { name: new RegExp(`^${itemName}, `) }).click()
  const itemDialog = page.getByRole('dialog', { name: `Item "${itemName}"` })
  await expect(itemDialog).toBeVisible()
  await itemDialog.getByRole('button', { name: 'Add to the set' }).click()
  await expect(itemDialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: new RegExp(`^${itemName} in slot ${slotNumber}`) }))
    .toBeVisible()
}

/** In demo mode the box is available at once; this helper only waits for a loaded state. */
export async function prepareLoginBox(page: Page) {
  await dismissLoginDay(page)
  await expect(page.getByRole('button', { name: 'Open the Pyaterochka box' })).toBeEnabled()
}
