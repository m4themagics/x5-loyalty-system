import { Typography } from '@/components/typography'
import { useState } from 'react'

import { addDemoSelection, removeDemoSelection } from './demo-selection'
import { findItem, formatRubles } from './demo-format'
import { availableDemoInventory, type DemoState } from './demo-state'
import { previewCraftedDiscount } from './profile-discount-crafting'
import { DEMO_CRAFT_SIZE } from './use-demo-challenge'

/** Предметы, выданные за задания, и сборка купона из них. */
export function DemoItemsSection({
  state,
  isBusy,
  onCraft,
  onRedeem,
}: {
  state: DemoState
  isBusy: boolean
  onCraft: (itemIds: readonly string[]) => void
  onRedeem: () => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const coupon = state.profile.active_coupon
  const spendable = availableDemoInventory(state)
  const preview = previewCraftedDiscount(selected)

  return (
    <div className="demo-inventory">
      <div>
        <Typography as="h3" variant="h2" className="demo-block-title">Предметы за задания</Typography>
        <Typography as="span" variant="bodyXs" className="demo-block-hint">
          Четыре предмета одного набора собираются в скидку. Дубликаты можно обменять.
        </Typography>
      </div>

      {state.profile.inventory.length === 0 ? (
        <Typography as="p" variant="bodySm" className="demo-empty">
          Пока пусто. Первое выполненное задание даёт первую из четырёх копий рецепта.
        </Typography>
      ) : (
        <ul className="demo-item-grid">
          {state.profile.inventory.map((entry) => {
            const item = findItem(entry.item_id)
            if (item === null) return null
            const selectedCount = selected.filter((itemId) => itemId === entry.item_id).length
            const available = spendable.find((candidate) => candidate.item_id === entry.item_id)?.quantity ?? 0
            const reserved = entry.quantity - available
            return (
              <li key={entry.item_id}>
                <button
                  aria-label={item.name}
                  aria-pressed={selectedCount > 0}
                  className={`demo-item item-rarity-${item.rarity}`}
                  disabled={isBusy || coupon !== null || selectedCount >= available || selected.length >= DEMO_CRAFT_SIZE}
                  onClick={() => setSelected((current) => addDemoSelection(current, spendable, entry.item_id))}
                  type="button"
                >
                  <span className="demo-item-tile">
                    <img alt="" src={item.iconSrc} />
                    <Typography as="span" variant="bodyXs" className="demo-item-badge">
                      ×{entry.quantity}
                    </Typography>
                  </span>
                  <Typography as="span" variant="bodyXs" className="demo-item-name">
                    {item.name}
                  </Typography>
                  {selectedCount > 0 ? (
                    <Typography as="span" variant="bodyXs" className="demo-item-count">
                      выбрано {selectedCount}
                    </Typography>
                  ) : null}
                  {reserved > 0 ? (
                    <Typography as="span" variant="bodyXs" className="demo-item-count demo-item-locked">
                      в обмене {reserved}
                    </Typography>
                  ) : null}
                </button>
                {selectedCount > 0 ? (
                  <button
                    aria-label={`Убрать одну копию: ${item.name}`}
                    className="demo-item-remove"
                    disabled={isBusy || coupon !== null}
                    onClick={() => setSelected((current) => removeDemoSelection(current, entry.item_id))}
                    type="button"
                  >
                    <Typography as="span" variant="body" aria-hidden="true">−</Typography>
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {coupon === null ? (
        <div className={`demo-craft-bar ${preview === null ? '' : 'demo-craft-bar-ready'}`}>
          <div className="demo-craft-copy">
            <Typography as="span" variant="bodySmMedium" className="demo-craft-title">
              {preview === null
                ? `Выбрано ${selected.length} из ${DEMO_CRAFT_SIZE} предметов`
                : `«${preview.title}» — ${preview.percent}%`}
            </Typography>
            <Typography as="span" variant="bodyXs" className="demo-craft-hint">
              {preview === null
                ? 'Соберите четыре предмета, чтобы получить купон.'
                : 'Четыре предмета спишутся и превратятся в один купон.'}
            </Typography>
          </div>
          <button
            className="demo-button demo-button-primary"
            disabled={isBusy || preview === null}
            onClick={() => { onCraft(selected); setSelected([]) }}
            type="button"
          >
            <Typography as="span" variant="control">Создать скидку</Typography>
          </button>
        </div>
      ) : (
        <div className="demo-coupon-live">
          <Typography as="span" variant="body" className="demo-coupon-percent">
            {coupon.percent}%
          </Typography>
          <div>
            <Typography as="span" variant="bodyXs" className="demo-coupon-copy">
              Активная скидка {coupon.percent}%, максимум {formatRubles(coupon.max_kopecks)}. Новый купон
              недоступен до погашения.
            </Typography>
            <div className="demo-actions demo-coupon-actions">
              <button className="demo-button" disabled={isBusy} onClick={onRedeem} type="button">
                <Typography as="span" variant="control">Погасить (демо)</Typography>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
