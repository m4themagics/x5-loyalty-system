import { Typography } from '@/components/typography'

import { daysUntil, findItem, formatDaysLeft } from './demo-format'
import type { DemoState } from './demo-state'
import { DISCOUNT_RECIPES } from './profile-discount-crafting'
import type { DemoChallengeController } from './use-demo-challenge'
import { DEMO_CRAFT_SIZE, type DemoLastEvent } from './use-demo-challenge'

const RECIPE_SLOTS = [0, 1, 2, 3]

/** The "Challenges" tab: what the customer should do right now. */
export function DemoQuestSection({ demo, state }: { demo: DemoChallengeController; state: DemoState }) {
  const challenge = state.challenge
  const card = state.card

  return (
    <section className="demo-panel" aria-labelledby="demo-title">
      <div className="profile-section-heading">
        <div>
          <Typography as="h2" variant="h2" className="section-title" id="demo-title">
            Personal challenge
          </Typography>
        </div>
      </div>

      {challenge !== null && card !== null ? (
        <>
          <QuestCard
            card={card}
            challenge={challenge}
            inventory={state.profile.inventory}
            isDone={isChallengeDone(state)}
          />
          {isChallengeDone(state) ? (
            <button
              className="demo-button demo-button-primary demo-button-block"
              disabled={demo.isBusy}
              onClick={demo.askForChallenge}
              type="button"
            >
              <Typography as="span" variant="control">Show the next challenge</Typography>
            </button>
          ) : null}
        </>
      ) : (
        <div className="demo-quest-empty">
          <img alt="" src="/assets/pyaterochka-cardboard-chest.webp" />
          <Typography as="strong" variant="emphasis" className="demo-empty-title">
            {state.decision === null ? 'A challenge is ready to show' : 'No suitable challenge right now'}
          </Typography>
          <Typography as="p" variant="bodySm" className="demo-empty">
            {state.decision === null
              ? 'We picked a special challenge based on your past purchases.'
              : 'A new challenge appears once a suitable offer comes up. Collected items and promised rewards are kept.'}
          </Typography>
          <button
            className="demo-button demo-button-primary demo-button-block"
            disabled={demo.isBusy}
            onClick={demo.askForChallenge}
            type="button"
          >
            <Typography as="span" variant="control">Show the challenge</Typography>
          </button>
        </div>
      )}

      {demo.lastEvent === null ? null : (
        <Typography
          as="p"
          variant="bodyXs"
          className={`demo-event-note ${demo.lastEvent.qualification === 'qualified' ? 'demo-event-note-good' : ''}`}
          role="status"
        >
          {eventMessage(demo.lastEvent)}
        </Typography>
      )}
    </section>
  )
}

function QuestCard({
  card,
  challenge,
  inventory,
  isDone,
}: {
  card: NonNullable<DemoState['card']>
  challenge: NonNullable<DemoState['challenge']>
  inventory: DemoState['profile']['inventory']
  isDone: boolean
}) {
  const rewardItem = findItem(challenge.reward.digital_item_id)
  const recipe = DISCOUNT_RECIPES.find((entry) => entry.id === challenge.recipe_goal_id) ?? null
  const ownedForRecipe = recipe === null
    ? 0
    : Math.min(
        DEMO_CRAFT_SIZE,
        recipe.itemIds.filter((itemId) =>
          inventory.some((entry) => entry.item_id === itemId && entry.quantity > 0),
        ).length,
      )
  const daysLeft = daysUntil(challenge.target.deadline_ms)

  return (
    <article className={`demo-quest ${isDone ? 'demo-quest-done' : ''}`} aria-label="Challenge card">
      <div className="demo-quest-head">
        {isDone ? (
          <Typography as="span" variant="bodyXs" className="demo-quest-done-badge">
            Completed
          </Typography>
        ) : null}
        {card.sponsor_line !== null ? (
          <Typography as="span" variant="bodyXs" className="demo-quest-sponsor">
            {card.sponsor_line}
          </Typography>
        ) : null}
        <Typography as="strong" variant="emphasis" className="demo-card-headline">
          {card.headline}
        </Typography>
        {rewardItem === null ? null : (
          <span className={`demo-quest-token item-rarity-${rewardItem.rarity}`} aria-hidden="true">
            <img alt="" src={rewardItem.iconSrc} />
          </span>
        )}
      </div>

      <div className="demo-quest-body">
        <Typography as="p" variant="bodySm" className="demo-card-body">{card.body}</Typography>

        <div className="demo-quest-reward">
          <Typography as="span" variant="bodyXs" className="demo-quest-reward-label">
            Reward
          </Typography>
          <Typography as="span" variant="bodyXs" className="demo-card-reward">
            {card.reward_line}
          </Typography>
          {challenge.reward.physical_sku === null ? null : (
            <Typography as="span" variant="bodyXs" className="demo-quest-bonus">
              The product is already reserved for this challenge.
            </Typography>
          )}
        </div>

        <div className="demo-quest-meta">
          <Typography as="span" variant="bodyXs" className="demo-meta-chip">
            {card.deadline_line}
          </Typography>
          {isDone || daysLeft === null ? null : (
            <Typography as="span" variant="bodyXs" className="demo-meta-chip demo-meta-chip-accent">
              {formatDaysLeft(daysLeft)}
            </Typography>
          )}
        </div>

        {recipe === null ? null : (
          <div className="demo-recipe-progress">
            <div className="demo-recipe-row">
              <Typography as="span" variant="bodyXs" className="demo-recipe-title">
                Set "{recipe.title}"
              </Typography>
              <Typography as="span" variant="bodyXs" className="demo-recipe-count">
                {ownedForRecipe} of {DEMO_CRAFT_SIZE}
              </Typography>
            </div>
            <div className="demo-recipe-dots" aria-hidden="true">
              {RECIPE_SLOTS.map((slot) => (
                <span
                  className={`demo-recipe-dot ${slot < ownedForRecipe ? 'demo-recipe-dot-filled' : ''}`}
                  key={slot}
                />
              ))}
            </div>
          </div>
        )}

        <dl className="demo-terms">
          <DemoTerm label="Category" value={challenge.target.category} />
          <DemoTerm label="Paid units" value={String(challenge.target.quantity)} />
        </dl>
      </div>
    </article>
  )
}

function DemoTerm({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt><Typography as="span" variant="bodyXs">{label}</Typography></dt>
      <dd><Typography as="span" variant="bodyXs">{value}</Typography></dd>
    </div>
  )
}

/** A promise is closed once a receipt has been counted against it. */
function isChallengeDone(state: DemoState): boolean {
  const promise = state.profile.outstanding_promise
  if (promise === null || state.challenge === null) return false
  return promise.challenge_id === state.challenge.challenge_id && promise.fulfilled
}

/** The receipt outcome is explained in words; reason codes stay in the demo stand. */
function eventMessage(event: DemoLastEvent): string {
  if (event.qualification === 'qualified') {
    return 'Purchase counted. The challenge reward is already in your inventory.'
  }
  if (event.qualification === 'duplicate') {
    return 'This receipt has already been counted — the reward is issued once.'
  }
  if (event.reasonCodes.includes('receipt_returned')) {
    return 'The purchase was returned, so the challenge is still open.'
  }
  if (event.reasonCodes.includes('receipt_window_expired')) {
    return 'The purchase was made after the challenge deadline.'
  }
  if (
    event.reasonCodes.includes('receipt_line_not_paid')
    || event.reasonCodes.includes('receipt_category_mismatch')
    || event.reasonCodes.includes('receipt_quantity_insufficient')
  ) {
    // The engine does not distinguish a free line from the wrong category: both mean the
    // receipt holds no paid purchase from the required category.
    return 'The receipt has no paid purchase from the required category. The challenge is still active.'
  }
  return 'The purchase did not meet the challenge terms. It is still active.'
}
