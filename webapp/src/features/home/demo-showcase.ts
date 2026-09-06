import type { DemoProfileSnapshot } from '@pyaterochka-game-demo/contracts'

/**
 * Один показательный профиль, который открывается по умолчанию. Он собран так, чтобы весь путь
 * продукта был виден без переключений: три предмета набора «Доброе утро» уже собраны, недостающая
 * «Термокружка» лежит в категории с активной кампанией и в истории покупок, поэтому задание
 * находится сразу, а лишняя копия «Клубного тостера» открывает обмен дубликатами.
 *
 * Профиль остаётся демонстрационным: он строится из синтетического seed-профиля движка,
 * а не из реальной истории покупок.
 */
export const DEMO_SHOWCASE_PROFILE_ID = 'demo-showcase'

export const DEMO_SHOWCASE_INVENTORY = [
  { item_id: 'club-toaster', quantity: 2 },
  { item_id: 'milk-pitcher', quantity: 1 },
  { item_id: 'breakfast-pan', quantity: 1 },
] as const

export function createShowcaseProfile(template: DemoProfileSnapshot): DemoProfileSnapshot {
  return {
    ...template,
    profile_id: DEMO_SHOWCASE_PROFILE_ID,
    label: 'Показательный профиль: три предмета набора и дубликат для обмена',
    inventory: DEMO_SHOWCASE_INVENTORY.map((entry) => ({ ...entry })),
    issued_rewards: [],
    processed_event_ids: [],
    active_coupon: null,
    outstanding_promise: null,
  }
}
