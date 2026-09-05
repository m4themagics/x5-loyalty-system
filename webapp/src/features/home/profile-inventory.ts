import { profileItems } from './profile-items'

const INVENTORY_VERSION = 1
const knownItemIds = new Set(profileItems.map((item) => item.id))

export type InventoryEntry = {
  itemId: string
  quantity: number
}

type SavedInventory = {
  version: typeof INVENTORY_VERSION
  entries: InventoryEntry[]
}

export function addInventoryItem(
  inventory: readonly InventoryEntry[],
  itemId: string,
): InventoryEntry[] {
  if (!knownItemIds.has(itemId)) return [...inventory]

  const existingEntry = inventory.find((entry) => entry.itemId === itemId)
  if (existingEntry === undefined) {
    return [...inventory, { itemId, quantity: 1 }]
  }

  return inventory.map((entry) => entry.itemId === itemId
    ? { ...entry, quantity: entry.quantity + 1 }
    : entry)
}

export function consumeInventoryItems(
  inventory: readonly InventoryEntry[],
  itemIds: readonly string[],
): InventoryEntry[] {
  const requiredCounts = itemIds.reduce<Map<string, number>>((counts, itemId) => {
    counts.set(itemId, (counts.get(itemId) ?? 0) + 1)
    return counts
  }, new Map())

  for (const [itemId, requiredQuantity] of requiredCounts) {
    const availableQuantity = inventory.find((entry) => entry.itemId === itemId)?.quantity ?? 0
    if (availableQuantity < requiredQuantity) {
      throw new Error(`Not enough inventory items: ${itemId}`)
    }
  }

  return inventory.flatMap((entry) => {
    const remainingQuantity = entry.quantity - (requiredCounts.get(entry.itemId) ?? 0)
    return remainingQuantity > 0
      ? [{ ...entry, quantity: remainingQuantity }]
      : []
  })
}

export function resolveInventory(rawInventory: string | null): InventoryEntry[] {
  if (rawInventory === null) return []

  try {
    const saved = JSON.parse(rawInventory) as Partial<SavedInventory>
    if (saved.version !== INVENTORY_VERSION || !Array.isArray(saved.entries)) {
      return []
    }

    return saved.entries.reduce<InventoryEntry[]>((inventory, entry) => {
      if (
        typeof entry?.itemId !== 'string'
        || !knownItemIds.has(entry.itemId)
        || !Number.isInteger(entry.quantity)
        || entry.quantity < 1
      ) {
        return inventory
      }

      const existingEntry = inventory.find(
        (inventoryEntry) => inventoryEntry.itemId === entry.itemId,
      )
      if (existingEntry !== undefined) {
        existingEntry.quantity += entry.quantity
        return inventory
      }

      inventory.push({ itemId: entry.itemId, quantity: entry.quantity })
      return inventory
    }, [])
  } catch {
    return []
  }
}

export function serializeInventory(inventory: readonly InventoryEntry[]): string {
  return JSON.stringify({ version: INVENTORY_VERSION, entries: inventory })
}
