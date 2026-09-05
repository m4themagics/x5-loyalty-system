import type { DemoInventoryEntry } from '@pyaterochka-game-demo/contracts'
import { DEMO_CRAFT_SIZE } from '@pyaterochka-game-demo/contracts'

/** Каждый слот занимает одну копию, в том числе при повторяющихся ID. */
export function addDemoSelection(
  selected: readonly string[],
  inventory: readonly DemoInventoryEntry[],
  itemId: string,
): string[] {
  const available = inventory.find((entry) => entry.item_id === itemId)?.quantity ?? 0
  const used = selected.filter((id) => id === itemId).length
  if (used >= available || selected.length >= DEMO_CRAFT_SIZE) return [...selected]
  return [...selected, itemId]
}

export function removeDemoSelection(selected: readonly string[], itemId: string): string[] {
  const index = selected.lastIndexOf(itemId)
  return selected.filter((_, position) => position !== index)
}
