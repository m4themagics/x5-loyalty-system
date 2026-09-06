import { Typography } from '@/components/typography'
import { useEffect, useState } from 'react'

import { requestCollectionTitle } from './demo-api'
import { findItem } from './demo-format'
import {
  closestRecipe,
  firstQualifyingPurchaseMs,
  rankFriendsByProgress,
  referralOutcome,
  type ClosestRecipe,
} from './demo-progress'
import type { DemoState } from './demo-state'
import { DEMO_TRADE_FRIEND_PREFIX } from './demo-trades'
import type { DemoStore } from './demo-store'
import { DISCOUNT_RECIPES } from './profile-discount-crafting'

const CRAFT_SIZE = 4
const MEDALS = ['🥇', '🥈', '🥉']

type Participant = {
  profile_id: string
  alias: string
  recipes_completed: number
  items_collected: number
  itemIds: string[]
  closest: ClosestRecipe | null
}

/**
 * Вкладка «Друзья»: титул коллекции, приглашение и сравнение с друзьями по собранному.
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
  const participants: Participant[] = [
    ...Object.values(store.profiles)
      .filter((entry) => entry.profile.profile_id.startsWith(DEMO_TRADE_FRIEND_PREFIX))
      .map((entry) => toParticipant(entry.profile.profile_id, entry.profile.label, entry.profile)),
    toParticipant(state.profile.profile_id, 'Вы', state.profile),
  ]
  const ranked = rankFriendsByProgress(participants)
  const sharedRanks = new Set(
    ranked.filter((entry, index) => ranked.some((other, otherIndex) =>
      otherIndex !== index && other.rank === entry.rank)).map((entry) => entry.rank),
  )
  const ranking = ranked.map((entry) => ({
    ...entry,
    ...(participants.find((participant) => participant.profile_id === entry.profile_id) as Participant),
    rank: entry.rank,
    // Медаль достаётся только тому, кто стоит на месте один.
    medal: sharedRanks.has(entry.rank) ? null : MEDALS[entry.rank - 1] ?? null,
  }))
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

      <section className="demo-progress" aria-labelledby="ranking-title">
        <div>
          <Typography as="h2" variant="h2" className="demo-block-title" id="ranking-title">
            Друзья и наборы
          </Typography>
          <Typography as="span" variant="bodyXs" className="demo-block-hint">
            Сравниваются собранные наборы и предметы. Суммы покупок и скидок в рейтинг не
            попадают, а место не меняет размер награды.
          </Typography>
        </div>

        <ol className="demo-friend-list">
          {ranking.map((entry) => (
            <li
              className={`demo-friend ${entry.alias === 'Вы' ? 'demo-friend-you' : ''}`}
              key={entry.profile_id}
            >
              <div className="demo-friend-head">
                <Typography
                  as="span"
                  variant="body"
                  className={`demo-friend-medal ${entry.medal === null ? 'demo-friend-place' : ''}`}
                  aria-label={`Место ${entry.rank}`}
                >
                  {entry.medal ?? entry.rank}
                </Typography>
                <div className="demo-friend-name">
                  <Typography as="strong" variant="bodySmMedium" className="demo-friend-alias">
                    {entry.alias}
                  </Typography>
                  <Typography as="span" variant="bodyXs" className="demo-friend-score">
                    {formatSets(entry.recipes_completed)} · {formatItems(entry.items_collected)}
                  </Typography>
                </div>
              </div>

              {entry.itemIds.length === 0 ? (
                <Typography as="span" variant="bodyXs" className="demo-friend-empty">
                  Коллекция пока пуста
                </Typography>
              ) : (
                <div className="demo-friend-items" aria-hidden="true">
                  {entry.itemIds.slice(0, 5).map((itemId) => {
                    const item = findItem(itemId)
                    return item === null ? null : (
                      <img alt="" className={`item-rarity-${item.rarity}`} key={itemId} src={item.iconSrc} />
                    )
                  })}
                  {entry.itemIds.length > 5 ? (
                    <Typography as="span" variant="bodyXs" className="demo-friend-more">
                      +{entry.itemIds.length - 5}
                    </Typography>
                  ) : null}
                </div>
              )}

              {entry.closest === null ? null : (
                <div className="demo-friend-progress">
                  <Typography as="span" variant="bodyXs" className="demo-friend-goal">
                    {entry.closest.owned === entry.closest.required
                      ? `Набор «${entry.closest.title}» готов к сборке`
                      : `До «${entry.closest.title}» — ещё ${entry.closest.required - entry.closest.owned}`}
                  </Typography>
                  <div className="demo-friend-track" aria-hidden="true">
                    {Array.from({ length: CRAFT_SIZE }).map((_unused, slot) => (
                      <span
                        className={`demo-friend-step ${slot < entry.closest!.owned ? 'demo-friend-step-done' : ''}`}
                        key={slot}
                      />
                    ))}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
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
    </>
  )
}

function toParticipant(profileId: string, alias: string, profile: DemoState['profile']): Participant {
  return {
    profile_id: profileId,
    alias,
    recipes_completed: profile.progress.completed_recipe_ids.length,
    items_collected: profile.inventory.reduce((total, item) => total + item.quantity, 0),
    itemIds: profile.inventory.filter((entry) => entry.quantity > 0).map((entry) => entry.item_id),
    closest: closestRecipe(profile.inventory, DISCOUNT_RECIPES, CRAFT_SIZE),
  }
}

function formatSets(count: number): string {
  if (count === 0) return 'наборов нет'
  const tail = count % 100 >= 11 && count % 100 <= 14
    ? 'наборов'
    : count % 10 === 1
      ? 'набор'
      : count % 10 >= 2 && count % 10 <= 4
        ? 'набора'
        : 'наборов'
  return `${count} ${tail}`
}

function formatItems(count: number): string {
  const tail = count % 100 >= 11 && count % 100 <= 14
    ? 'предметов'
    : count % 10 === 1
      ? 'предмет'
      : count % 10 >= 2 && count % 10 <= 4
        ? 'предмета'
        : 'предметов'
  return `${count} ${tail}`
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
