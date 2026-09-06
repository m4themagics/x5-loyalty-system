import { Typography } from '@/components/typography'
import { useEffect, useState } from 'react'

import { requestCollectionTitle } from './demo-api'

import { firstQualifyingPurchaseMs, rankFriendsByProgress, referralOutcome } from './demo-progress'
import type { DemoState } from './demo-state'
import { DEMO_TRADE_FRIEND_PREFIX } from './demo-trades'
import type { DemoStore } from './demo-store'

const AVATAR_MAX_LEVEL = 7

/**
 * Вкладка «Друзья»: приглашения и сравнение с друзьями по собранным наборам.
 * Деньги в сравнение не выносятся — соревноваться по тратам в магазине неэтично.
 */
export function DemoSocialSection({
  state,
  store,
  referralIssued,
}: {
  state: DemoState
  store: DemoStore
  referralIssued: boolean
}) {
  const title = useCollectionTitle(state)
  const friends = Object.values(store.profiles)
    .filter((entry) => entry.profile.profile_id.startsWith(DEMO_TRADE_FRIEND_PREFIX))
    .map((entry) => ({
      profile_id: entry.profile.profile_id,
      alias: entry.profile.label,
      recipes_completed: entry.profile.progress.completed_recipe_ids.length,
      items_collected: entry.profile.inventory.reduce((total, item) => total + item.quantity, 0),
    }))
  const ranking = rankFriendsByProgress([
    ...friends,
    {
      profile_id: state.profile.profile_id,
      alias: 'Вы',
      recipes_completed: state.profile.progress.completed_recipe_ids.length,
      items_collected: state.profile.inventory.reduce((total, item) => total + item.quantity, 0),
    },
  ])
  const referral = referralOutcome(
    state.profile.referral,
    state.profile.profile_id,
    firstQualifyingPurchaseMs(state.profile),
  )

  return (
    <>
      <section className="demo-title-card" aria-labelledby="collection-title">
        <Typography as="span" variant="bodyXs" className="demo-title-eyebrow">
          Титул коллекции
        </Typography>
        <Typography as="h2" variant="h2" className="demo-title-value" id="collection-title">
          {title === null ? '…' : title.title}
        </Typography>
        <Typography as="span" variant="bodyXs" className="demo-title-subtitle">
          {title === null ? 'Подбираем титул по вашей коллекции' : title.subtitle}
        </Typography>
      </section>

      <section className="demo-invite" aria-labelledby="invite-title">
        <div className="demo-invite-copy">
          <Typography as="h2" variant="h2" className="demo-block-title" id="invite-title">
            Позовите друга
          </Typography>
          <Typography as="p" variant="bodySm" className="demo-invite-text">
            Когда приглашенный друг сделает первую покупку, вы получите предмет для своей коллекции.
          </Typography>
        </div>
        <div className={`demo-invite-status ${referralIssued ? 'demo-invite-status-done' : ''}`}>
          <Typography as="span" variant="bodyXs">
            {referralIssued
              ? 'Друг совершил покупку — предмет начислен.'
              : referralReasonText(referral.reason)}
          </Typography>
        </div>
        <button className="demo-button demo-button-primary demo-button-block" type="button" disabled>
          <Typography as="span" variant="control">Пригласить друга</Typography>
        </button>
        <Typography as="span" variant="bodyXs" className="demo-block-hint">
          В демонстрации приглашение не отправляется.
        </Typography>
      </section>

      <section className="demo-progress" aria-labelledby="ranking-title">
        <div>
          <Typography as="h2" variant="h2" className="demo-block-title" id="ranking-title">
            Друзья и наборы
          </Typography>
          <Typography as="span" variant="bodyXs" className="demo-block-hint">
            Сравниваются только собранные наборы и предметы. Суммы покупок и скидок в рейтинг
            не попадают, а место не меняет размер награды.
          </Typography>
        </div>

        <ol className="demo-ranking">
          {ranking.map((entry) => (
            <li
              className={`demo-rank-row ${entry.alias === 'Вы' ? 'demo-rank-row-you' : ''}`}
              key={entry.profile_id}
            >
              <Typography as="span" variant="bodyXs" className="demo-rank-place">
                {entry.rank}
              </Typography>
              <Typography as="span" variant="bodyXs" className="demo-rank-alias">
                {entry.alias}
              </Typography>
              <Typography as="span" variant="bodyXs" className="demo-rank-value">
                {entry.recipes_completed === 0
                  ? `${entry.items_collected} предметов`
                  : `Уровень ${Math.min(entry.recipes_completed, AVATAR_MAX_LEVEL)} · ${entry.items_collected} предметов`}
              </Typography>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

function referralReasonText(reason: string): string {
  const messages: Record<string, string> = {
    referral_reward_due: 'Условия приглашения выполнены — награда начислена.',
    referral_not_invited: 'Пока никто вас не приглашал и вы никого не позвали.',
    referral_self_invite: 'Приглашение самого себя не засчитывается.',
    referral_existing_customer: 'У приглашённого уже были покупки, награда не начисляется.',
    referral_no_qualifying_purchase: 'Ждём первую покупку приглашённого друга.',
    referral_window_expired: 'Друг купил позже семи дней после приглашения.',
    referral_cap_reached: 'За эту неделю награда за приглашение уже получена.',
  }
  return messages[reason] ?? reason
}

/**
 * Титул описывает собранную коллекцию. Его пишет модель, а при недоступности или
 * нарушении контракта движок возвращает детерминированный шаблон.
 */
function useCollectionTitle(state: DemoState) {
  const [title, setTitle] = useState<{ title: string; subtitle: string } | null>(null)
  const profileId = state.profile.profile_id
  const revision = state.revision

  useEffect(() => {
    let cancelled = false
    void requestCollectionTitle(state.profile, Date.now()).then((result) => {
      if (cancelled) return
      setTitle(result.ok ? { title: result.data.title, subtitle: result.data.subtitle } : null)
    })
    return () => { cancelled = true }
    // Профиль и его ревизия полностью определяют состав коллекции.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, revision])

  return title
}
