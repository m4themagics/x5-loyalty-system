import type {
  DemoGameFeatures,
  DemoGameSnapshot,
  DemoInventoryEntry,
} from '@pyaterochka-game-demo/contracts'
import { DEMO_CRAFT_SIZE } from '@pyaterochka-game-demo/contracts'

import { DISCOUNT_RECIPES } from './profile-discount-crafting'
import type { InventoryEntry } from './profile-inventory'
import { profileItems } from './profile-items'

/**
 * A catalog snapshot plus computed game features for the local decision engine.
 * The catalog and recipes stay here; the engine receives a copy and keeps no second catalog.
 */
export function buildDemoGameSnapshot(): DemoGameSnapshot {
  return {
    craft_size: DEMO_CRAFT_SIZE,
    items: profileItems.map((item) => ({
      id: item.id,
      name: item.name,
      rarity: item.rarity,
      category: item.category,
    })),
    recipes: DISCOUNT_RECIPES.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      category: recipe.category,
      item_ids: [...recipe.itemIds],
    })),
  }
}

export function buildDemoGameFeatures(
  inventory: readonly InventoryEntry[],
): DemoGameFeatures {
  const ownedItemIds = new Set(inventory.map((entry) => entry.itemId))

  return {
    inventory_total: inventory.reduce((total, entry) => total + entry.quantity, 0),
    inventory_distinct: inventory.length,
    duplicate_item_ids: inventory
      .filter((entry) => entry.quantity > 1)
      .map((entry) => entry.itemId),
    recipe_progress: DISCOUNT_RECIPES.map((recipe) => {
      const ownedRecipeItemIds = recipe.itemIds.filter((itemId) => ownedItemIds.has(itemId))
      return {
        recipe_id: recipe.id,
        matched_count: ownedRecipeItemIds.length,
        owned_item_ids: [...ownedRecipeItemIds],
        missing_item_ids: recipe.itemIds.filter((itemId) => !ownedItemIds.has(itemId)),
      }
    }),
  }
}

export function toDemoInventory(
  inventory: readonly InventoryEntry[],
): DemoInventoryEntry[] {
  return inventory.map((entry) => ({ item_id: entry.itemId, quantity: entry.quantity }))
}

export function fromDemoInventory(
  inventory: readonly DemoInventoryEntry[],
): InventoryEntry[] {
  return inventory.map((entry) => ({ itemId: entry.item_id, quantity: entry.quantity }))
}
