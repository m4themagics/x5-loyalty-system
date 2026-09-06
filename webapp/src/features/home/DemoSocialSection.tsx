import { Typography } from '@/components/typography'
import { useEffect, useState } from 'react'

import { requestCollectionTitle } from './demo-api'
import { findItem } from './demo-format'
import {
  closestRecipe,
  inviterReferralOutcome,
  rankFriendsByProgress,
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
  profile: DemoState['profile']
}

/**
 * Вкладка «Друзья»: титул коллекции, приглашение и сравнение с друзьями по собранному.
 * Деньги в сравнение не выносятся — соревноваться по тратам в магазине неэтично.
 */
export function DemoSocialSection({
  state,
  store,
  referralIssued,
  onOpenCollection,
}: {
  state: DemoState
  store: DemoStore
  referralIssued: boolean
  onOpenCollection: () => void
}) {
  const [titleRetry, setTitleRetry] = useState(0)
  const titles = useCollectionTitles([state.profile, ...Object.values(store.profiles)
    .filter((entry) => entry.profile.profile_id.startsWith(DEMO_TRADE_FRIEND_PREFIX)
      && entry.profile.profile_id !== state.profile.profile_id)
    .map((entry) => entry.profile)], titleRetry)
  const title = collectionTitleFor(titles, state.profile)
  const participants: Participant[] = [
    ...Object.values(store.profiles)
      .filter((entry) => entry.profile.profile_id.startsWith(DEMO_TRADE_FRIEND_PREFIX)
        && entry.profile.profile_id !== state.profile.profile_id)
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
  // Текст блока написан от лица позвавшего, поэтому оцениваем приглашённого этим профилем.
  const referral = inviterReferralOutcome(
    [state.profile, ...Object.values(store.profiles).map((entry) => entry.profile)],
    state.profile.profile_id,
  )

  return (
    <>
      <section className="demo-title-card" aria-labelledby="collection-title">
        <Typography as="span" variant="bodyXs" className="demo-title-eyebrow">
          Титул коллекции
        </Typography>
        <Typography as="h2" variant="h2" className="demo-title-value" id="collection-title">
          {title?.status === 'ready' ? title.title : title?.status === 'error' ? 'Ваша коллекция' : 'Подбираем титул…'}
        </Typography>
        <Typography as="span" variant="bodyXs" className="demo-title-subtitle">
          {title?.status === 'ready'
            ? title.subtitle
            : title?.status === 'error'
              ? 'Титул пока недоступен'
              : 'Смотрим, что вы уже собрали'}
        </Typography>
        {title?.status === 'error' ? (
          <button className="demo-title-retry" onClick={() => setTitleRetry((value) => value + 1)} type="button">
            <Typography as="span" variant="controlXs">Обновить титул</Typography>
          </button>
        ) : null}
      </section>

      <section className="demo-progress" aria-labelledby="ranking-title">
        <div>
          <Typography as="h2" variant="h2" className="demo-block-title" id="ranking-title">
            Прогресс друзей
          </Typography>
          <Typography as="span" variant="bodyXs" className="demo-block-hint">
            Место зависит только от собранных наборов и предметов.
          </Typography>
        </div>

        <ol className="demo-friend-list">
          {ranking.map((entry) => {
            const friendTitle = collectionTitleFor(titles, entry.profile)
            return (
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
                      {formatCollectionScore(entry.recipes_completed, entry.items_collected)}
                    </Typography>
                    {friendTitle?.status === 'ready' ? (
                      <Typography as="span" variant="bodyXs" className="demo-friend-title">
                        {friendTitle.title}
                      </Typography>
                    ) : null}
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

                {entry.closest === null || entry.alias !== 'Вы' ? null : (
                  <div className="demo-friend-progress">
                    <Typography as="span" variant="bodyXs" className="demo-friend-goal">
                      {entry.closest.owned === entry.closest.required
                        ? `Можно собрать «${entry.closest.title}»`
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

                {entry.alias === 'Вы' ? (
                  <button className="demo-friend-collection" onClick={onOpenCollection} type="button">
                    <Typography as="span" variant="controlXs">Открыть коллекцию</Typography>
                  </button>
                ) : null}
              </li>
            )
          })}
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
    profile,
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

function formatCollectionScore(sets: number, items: number): string {
  return `${formatSets(sets)} · ${formatItems(items)}`
}

/**
 * Титулы коллекций: по одному запросу на участника. Их пишет модель, а при недоступности
 * или нарушении контракта движок возвращает детерминированный шаблон.
 */
type CollectionTitleState = (
  | { status: 'error' }
  | { status: 'ready'; title: string; subtitle: string }
) & { signature: string }

function profileCollectionSignature(profile: DemoState['profile']): string {
  return [
    profile.profile_id,
    profile.inventory.map((entry) => `${entry.item_id}:${entry.quantity}`).join(','),
    profile.progress.completed_recipe_ids.join(','),
  ].join(':')
}

function collectionTitleFor(
  titles: ReadonlyMap<string, CollectionTitleState>,
  profile: DemoState['profile'],
): CollectionTitleState | undefined {
  const title = titles.get(profile.profile_id)
  return title?.signature === profileCollectionSignature(profile) ? title : undefined
}

function useCollectionTitles(profiles: readonly DemoState['profile'][], retry: number) {
  const [titles, setTitles] = useState(new Map<string, CollectionTitleState>())
  const key = profiles.map(profileCollectionSignature).join('|')

  useEffect(() => {
    let cancelled = false
    profiles.forEach((profile) => {
      void (async () => {
        const result = await requestCollectionTitle(profile, Date.now())
        if (cancelled) return
        const signature = profileCollectionSignature(profile)
        const next: CollectionTitleState = result.ok
          ? { status: 'ready', title: result.data.title, subtitle: result.data.subtitle, signature }
          : { status: 'error', signature }
        setTitles((current) => new Map(current).set(profile.profile_id, next))
      })()
    })
    return () => { cancelled = true }
    // Состав коллекций полностью определяет титулы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry])

  return titles
}

function referralReasonText(reason: string): string {
  const messages: Record<string, string> = {
    referral_reward_due: 'Условия приглашения выполнены — награда начислена.',
    referral_not_invited: 'Вы пока никого не позвали.',
    referral_self_invite: 'Приглашение самого себя не засчитывается.',
    referral_existing_customer: 'У приглашённого уже были покупки, награда не начисляется.',
    referral_no_qualifying_purchase: 'Друг принял приглашение — ждём его первую покупку.',
    referral_window_expired: 'Друг купил позже семи дней после приглашения.',
    referral_cap_reached: 'За эту неделю награда за приглашение уже получена.',
  }
  return messages[reason] ?? reason
}
