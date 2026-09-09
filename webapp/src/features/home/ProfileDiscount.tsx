import { Typography } from '@/components/typography'

import { encodeEan13 } from './profile-barcode'
import type { CraftedDiscount } from './profile-discount-crafting'
import { profileItems } from './profile-items'

type ActiveDiscountBadgeProps = {
  discount: CraftedDiscount
  onClick: () => void
}

export function ActiveDiscountBadge({ discount, onClick }: ActiveDiscountBadgeProps) {
  return (
    <button
      aria-label={`Open the ${discount.percent}% "${discount.title}" discount`}
      className={`active-discount-badge item-rarity-${discount.rarity}`}
      onClick={onClick}
      type="button"
    >
      <Typography as="strong" variant="body" className="active-discount-percent">
        −{discount.percent}%
      </Typography>
      <Typography as="span" variant="bodyXs" className="active-discount-name">
        {discount.title}
      </Typography>
    </button>
  )
}

type ProfileDiscountOverlayProps = {
  discount: CraftedDiscount
  mode: 'reveal' | 'barcode'
  onClose: () => void
  onShowBarcode: () => void
}

export function ProfileDiscountOverlay({
  discount,
  mode,
  onClose,
  onShowBarcode,
}: ProfileDiscountOverlayProps) {
  const ingredients = discount.itemIds.flatMap((itemId) => {
    const item = profileItems.find((candidate) => candidate.id === itemId)
    return item === undefined ? [] : [item]
  })

  return (
    <div
      aria-label={mode === 'reveal' ? 'Crafted discount' : 'Discount barcode'}
      aria-modal="true"
      className="discount-overlay"
      role="dialog"
    >
      <div className={`discount-result-card item-rarity-${discount.rarity}`}>
        <button
          aria-label="Close discount"
          className="discount-overlay-close"
          onClick={onClose}
          type="button"
        >
          <Typography as="span" variant="body" aria-hidden="true">×</Typography>
        </button>

        {mode === 'reveal' ? (
          <>
            <Typography as="span" variant="bodyXs" className="discount-result-eyebrow">
              Discount created
            </Typography>
            <Typography as="strong" variant="h1" className="discount-result-percent">
              −{discount.percent}%
            </Typography>
            <Typography as="h2" variant="h2" className="discount-result-title">
              {discount.title}
            </Typography>
            <Typography as="span" variant="bodySm" className="discount-result-category">
              {discount.category}
            </Typography>
            <Typography as="p" variant="bodySm" className="discount-result-category">
              Up to RUB {discount.maxKopecks / 100} on eligible products.
              On a RUB 500 basket that is RUB {Math.min(discount.percent * 5, discount.maxKopecks / 100)} saved.
            </Typography>
            <div className="discount-ingredient-row" aria-label="Items used">
              {ingredients.map((item, index) => (
                <div className={`discount-ingredient item-rarity-${item.rarity}`} key={`${item.id}-${index}`}>
                  <img alt={item.name} src={item.iconSrc} />
                </div>
              ))}
            </div>
            <Typography as="span" variant="bodyXs" className="discount-result-bonus">
              {discount.synergyBonus > 0
                ? `Themed bonus: +${discount.synergyBonus}%`
                : 'Mixed set — no themed bonus'}
            </Typography>
            <button className="show-barcode-button" onClick={onShowBarcode} type="button">
              <Typography as="span" variant="control">Show barcode</Typography>
            </button>
            <button className="discount-done-button" onClick={onClose} type="button">
              <Typography as="span" variant="control">Done</Typography>
            </button>
          </>
        ) : (
          <>
            <div className="discount-barcode-heading">
              <Typography as="h2" variant="h2" className="discount-barcode-title">
                {discount.title}
              </Typography>
              <Typography as="strong" variant="body" className="discount-barcode-percent">
                −{discount.percent}%
              </Typography>
            </div>
            <Ean13Barcode value={discount.barcode} />
            <Typography as="span" variant="bodySm" className="discount-result-category">
              {discount.category}
            </Typography>
            <Typography as="span" variant="bodyXs" className="discount-barcode-note">
              Up to RUB {discount.maxKopecks / 100} on eligible products. Demo barcode; it does not work at a real till.
            </Typography>
          </>
        )}
      </div>
    </div>
  )
}

function Ean13Barcode({ value }: { value: string }) {
  const modules = encodeEan13(value)

  return (
    <div className="ean-barcode" aria-label={`Barcode ${value}`} role="img">
      <svg aria-hidden="true" viewBox="0 0 95 64" preserveAspectRatio="none">
        <rect width="95" height="64" fill="white" />
        {[...modules].map((module, index) => module === '1' ? (
          <rect
            fill="#111"
            height={isGuardModule(index) ? 60 : 53}
            key={index}
            width="1"
            x={index}
            y="0"
          />
        ) : null)}
      </svg>
      <Typography as="span" variant="bodySm" className="ean-barcode-value">
        {value}
      </Typography>
    </div>
  )
}

function isGuardModule(index: number): boolean {
  return index < 3 || (index >= 45 && index < 50) || index >= 92
}
