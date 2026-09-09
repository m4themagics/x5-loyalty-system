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
 * The "Friends" tab: collection title, invitation and a comparison by what people collected.
 * Money never enters the comparison — ranking people by store spending is not acceptable.
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
    toParticipant(state.profile.profile_id, 'You', state.profile),
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
    // A medal goes only to someone who holds a rank alone.
    medal: sharedRanks.has(entry.rank) ? null : MEDALS[entry.rank - 1] ?? null,
  }))
  // The block speaks as the inviter, so the invitee is evaluated from this profile.
  const referral = inviterReferralOutcome(
    [state.profile, ...Object.values(store.profiles).map((entry) => entry.profile)],
    state.profile.profile_id,
  )

  return (
    <>
      <section className="demo-title-card" aria-labelledby="collection-title">
        <Typography as="span" variant="bodyXs" className="demo-title-eyebrow">
          Collection title
        </Typography>
        <Typography as="h2" variant="h2" className="demo-title-value" id="collection-title">
          {title?.status === 'ready' ? title.title : title?.status === 'error' ? 'Your collection' : 'Choosing a title…'}
        </Typography>
        <Typography as="span" variant="bodyXs" className="demo-title-subtitle">
          {title?.status === 'ready'
            ? title.subtitle
            : title?.status === 'error'
              ? 'The title is unavailable right now'
              : 'Looking at what you have collected'}
        </Typography>
        {title?.status === 'error' ? (
          <button className="demo-title-retry" onClick={() => setTitleRetry((value) => value + 1)} type="button">
            <Typography as="span" variant="controlXs">Refresh the title</Typography>
          </button>
        ) : null}
      </section>

      <section className="demo-progress" aria-labelledby="ranking-title">
        <div>
          <Typography as="h2" variant="h2" className="demo-block-title" id="ranking-title">
            Friends' progress
          </Typography>
          <Typography as="span" variant="bodyXs" className="demo-block-hint">
            Rank depends only on collected sets and items.
          </Typography>
        </div>

        <ol className="demo-friend-list">
          {ranking.map((entry) => {
            const friendTitle = collectionTitleFor(titles, entry.profile)
            return (
              <li
                className={`demo-friend ${entry.alias === 'You' ? 'demo-friend-you' : ''}`}
                key={entry.profile_id}
              >
                <div className="demo-friend-head">
                  <Typography
                    as="span"
                    variant="body"
                    className={`demo-friend-medal ${entry.medal === null ? 'demo-friend-place' : ''}`}
                    aria-label={`Rank ${entry.rank}`}
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
                    The collection is empty
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

                {entry.closest === null || entry.alias !== 'You' ? null : (
                  <div className="demo-friend-progress">
                    <Typography as="span" variant="bodyXs" className="demo-friend-goal">
                      {entry.closest.owned === entry.closest.required
                        ? `Ready to craft "${entry.closest.title}"`
                        : `${entry.closest.required - entry.closest.owned} more for "${entry.closest.title}"`}
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

                {entry.alias === 'You' ? (
                  <button className="demo-friend-collection" onClick={onOpenCollection} type="button">
                    <Typography as="span" variant="controlXs">Open the collection</Typography>
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
            Invite a friend
          </Typography>
          <Typography as="p" variant="bodySm" className="demo-invite-text">
            When an invited friend makes their first purchase, you receive an item for your collection.
          </Typography>
        </div>
        <div className={`demo-invite-status ${referralIssued ? 'demo-invite-status-done' : ''}`}>
          <Typography as="span" variant="bodyXs">
            {referralIssued
              ? 'Your friend made a purchase — the item has been granted.'
              : referralReasonText(referral.reason)}
          </Typography>
        </div>
        <button className="demo-button demo-button-primary demo-button-block" type="button" disabled>
          <Typography as="span" variant="control">Invite a friend</Typography>
        </button>
        <Typography as="span" variant="bodyXs" className="demo-block-hint">
          No invitation is actually sent in this demo.
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
  if (count === 0) return 'no sets'
  return `${count} ${count === 1 ? 'set' : 'sets'}`
}

function formatItems(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`
}

function formatCollectionScore(sets: number, items: number): string {
  return `${formatSets(sets)} · ${formatItems(items)}`
}

/**
 * Collection titles: one request per participant. The model writes them; if it is unavailable
 * or breaks the contract, the engine returns a deterministic template.
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
    // The contents of the collections fully determine the titles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry])

  return titles
}

function referralReasonText(reason: string): string {
  const messages: Record<string, string> = {
    referral_reward_due: 'The invitation terms are met — the reward has been granted.',
    referral_not_invited: 'You have not invited anyone yet.',
    referral_self_invite: 'Inviting yourself does not count.',
    referral_existing_customer: 'The invitee already had purchases, so no reward is granted.',
    referral_no_qualifying_purchase: 'Your friend accepted the invitation — waiting for their first purchase.',
    referral_window_expired: 'Your friend bought later than seven days after the invitation.',
    referral_cap_reached: 'The invitation reward for this week has already been claimed.',
  }
  return messages[reason] ?? reason
}
