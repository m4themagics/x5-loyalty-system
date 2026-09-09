import { Typography } from '@/components/typography'

import { formatRubles, profileInitial, shortProfileName } from './demo-format'
import { type CharacterMood, ProfileCharacter } from './ProfileCharacter'
import { ActiveDiscountBadge } from './ProfileDiscount'
import type { CraftedDiscount } from './profile-discount-crafting'

const AVATAR_STEPS = [0, 1, 2, 3, 4, 5, 6]
const AVATAR_MAX_LEVEL = 7

/**
 * The permanent profile header: who the user is, what they have achieved and what they hold.
 * It does not change between tabs, so level and savings stay visible at all times.
 */
export function ProfileHeader({
  profileLabel,
  level,
  savingsKopecks,
  activeDiscount,
  characterMood,
  wornItemIds,
  onOpenDiscount,
  onOpenTrade,
}: {
  profileLabel: string
  level: number
  savingsKopecks: number
  activeDiscount: CraftedDiscount | null
  characterMood: CharacterMood
  wornItemIds: readonly string[]
  onOpenDiscount: () => void
  onOpenTrade: () => void
}) {
  return (
    <section className="profile-hero" aria-label="Player profile">
      <Typography as="h1" variant="h1" className="profile-title">
        Profile
      </Typography>
      <div className="profile-identity">
        <Typography as="span" variant="body" className="profile-avatar" aria-hidden="true">
          {profileInitial(profileLabel)}
        </Typography>
        <Typography as="span" variant="bodyXs" className="profile-identity-name">
          {shortProfileName(profileLabel)}
        </Typography>
      </div>
      <ProfileCharacter mood={characterMood} wornItemIds={wornItemIds} />
      <button
        aria-label="Open item exchange"
        className="profile-trade-entry"
        onClick={onOpenTrade}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M7 10h15l-3.5-3.5M25 22H10l3.5 3.5" />
        </svg>
        <Typography as="span" variant="bodyXs">Trade</Typography>
      </button>
      {activeDiscount !== null ? (
        <ActiveDiscountBadge discount={activeDiscount} onClick={onOpenDiscount} />
      ) : null}

      <div className="profile-stats">
        <div className="profile-stat-level">
          <div className="profile-stat-level-row">
            <Typography as="span" variant="bodyXs" className="profile-stat-label">
              Level
            </Typography>
            <Typography as="span" variant="bodySmMedium" className="profile-stat-level-value">
              {level} of {AVATAR_MAX_LEVEL}
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
              Savings over 28 days
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
