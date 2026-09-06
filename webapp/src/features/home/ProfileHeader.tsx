import { Typography } from '@/components/typography'

import { formatRubles } from './demo-format'
import { type CharacterMood, ProfileCharacter } from './ProfileCharacter'
import { ActiveDiscountBadge } from './ProfileDiscount'
import type { CraftedDiscount } from './profile-discount-crafting'

const AVATAR_STEPS = [0, 1, 2, 3, 4, 5, 6]
const AVATAR_MAX_LEVEL = 7

/**
 * Постоянная шапка профиля: кто пользователь, чего достиг и что у него на руках.
 * Она не меняется при переключении вкладок, поэтому уровень и экономия всегда на виду.
 */
export function ProfileHeader({
  level,
  savingsKopecks,
  activeDiscount,
  characterMood,
  ownedItemIds,
  onOpenDiscount,
  onOpenTrade,
}: {
  level: number
  savingsKopecks: number
  activeDiscount: CraftedDiscount | null
  characterMood: CharacterMood
  ownedItemIds: readonly string[]
  onOpenDiscount: () => void
  onOpenTrade: () => void
}) {
  return (
    <section className="profile-hero" aria-label="Профиль игрока">
      <Typography as="h1" variant="h1" className="profile-title">
        Профиль
      </Typography>
      <ProfileCharacter mood={characterMood} ownedItemIds={ownedItemIds} />
      <button
        aria-label="Открыть обмен предметами"
        className="profile-trade-entry"
        onClick={onOpenTrade}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M7 10h15l-3.5-3.5M25 22H10l3.5 3.5" />
        </svg>
        <Typography as="span" variant="bodyXs">Обмен</Typography>
      </button>
      {activeDiscount !== null ? (
        <ActiveDiscountBadge discount={activeDiscount} onClick={onOpenDiscount} />
      ) : null}

      <div className="profile-stats">
        <div className="profile-stat-level">
          <div className="profile-stat-level-row">
            <Typography as="span" variant="bodyXs" className="profile-stat-label">
              Уровень
            </Typography>
            <Typography as="span" variant="bodySmMedium" className="profile-stat-level-value">
              {level} из {AVATAR_MAX_LEVEL}
            </Typography>
          </div>
          <div className="profile-level-track" aria-hidden="true">
            {AVATAR_STEPS.map((step) => (
              <span
                className={`profile-level-step ${step < level ? 'profile-level-step-done' : ''}`}
                key={step}
              />
            ))}
          </div>
        </div>

        <div className="profile-stat-savings">
          <div className="profile-stat-level-row">
            <Typography as="span" variant="bodyXs" className="profile-stat-label">
              Выгода за 28 дней
            </Typography>
            <Typography as="span" variant="body" className="profile-stat-value">
              {formatRubles(savingsKopecks)}
            </Typography>
          </div>
        </div>
      </div>
    </section>
  )
}
