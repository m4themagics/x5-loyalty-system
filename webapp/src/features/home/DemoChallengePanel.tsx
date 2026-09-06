import { Typography } from '@/components/typography'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DemoTradeCreate, DemoTradeRespond } from '@pyaterochka-game-demo/contracts'

import {
  fetchSeedProfiles,
  requestDecision,
  submitDemoEvent,
  type DemoApiFailure,
} from './demo-api'
import {
  avatarLevel,
  firstQualifyingPurchaseMs,
  rankParticipants,
  referralOutcome,
} from './demo-progress'
import { buildDemoReceipt, type DemoReceiptKind } from './demo-receipt'
import { createShowcaseProfile } from './demo-showcase'
import {
  applyCraft,
  applyRedemption,
  availableDemoInventory,
  createDemoState,
  refreshDemoSavings,
  revealGrant,
  type DemoState,
} from './demo-state'
import {
  applyDemoDecision,
  applyDemoEvent,
  applyReferralReward,
  createDemoStore,
  hydrateDemoAds,
  releaseExpiredDemoPromise,
  releaseExpiredDemoPromises,
  resetDemoStore,
  resolveDemoStore,
  saveDemoProfile,
  selectDemoProfile,
  serializeDemoStore,
  type DemoStore,
} from './demo-store'
import { addDemoSelection, removeDemoSelection } from './demo-selection'
import { createDemoTrade, createTradeSeedProfiles, expireDemoTrades, respondDemoTrade } from './demo-trades'
import { DemoTradePanel } from './DemoTradePanel'
import { DemoEvaluationPanel } from './DemoEvaluationPanel'
import { DemoStandPanel } from './DemoStandPanel'
import { DISCOUNT_RECIPES, craftDiscount, previewCraftedDiscount } from './profile-discount-crafting'
import { profileItems } from './profile-items'

import './demo-challenge.css'

const DEMO_STATE_STORAGE_KEY = 'pyaterochka_demo_challenge_state'
const DEMO_BASKET_KOPECKS = 45_000
const DEMO_CRAFT_SIZE = 4
const RECIPE_SLOTS = [0, 1, 2, 3]
const AVATAR_STEPS = [0, 1, 2, 3, 4, 5, 6]

const RANKING_PEERS = [
  { profile_id: 'peer-1', alias: 'Сосед по кварталу', redeemed_savings_28d_kopecks: 3200 },
  { profile_id: 'peer-2', alias: 'Утренний покупатель', redeemed_savings_28d_kopecks: 1500 },
  { profile_id: 'peer-3', alias: 'Любитель выпечки', redeemed_savings_28d_kopecks: 1500 },
]

export function DemoChallengePanel() {
  const demo = useDemoChallenge()
  const [openPanel, setOpenPanel] = useState<'none' | 'stand' | 'x5'>('none')

  if (demo.state === null) {
    return (
      <section className="demo-panel" aria-labelledby="demo-title">
        <div className="profile-section-heading">
          <div>
            <Typography as="h2" variant="h2" className="section-title" id="demo-title">
              Персональный челлендж
            </Typography>
            <Typography as="span" variant="bodyXs" className="section-hint">
              {demo.failure === null ? 'Подбираем задание…' : formatFailure(demo.failure)}
            </Typography>
          </div>
        </div>
      </section>
    )
  }

  const { state } = demo
  const challenge = state.challenge
  const card = state.card
  const grant = state.last_grant
  const grantedItem = grant === null ? null : findItem(grant.item_id)
  const level = avatarLevel(state.profile.progress.completed_recipe_ids)

  return (
    <section className="demo-panel" aria-labelledby="demo-title">
      <div className="profile-section-heading">
        <div>
          <Typography as="h2" variant="h2" className="section-title" id="demo-title">
            Персональный челлендж
          </Typography>
          <Typography as="span" variant="bodyXs" className="section-hint">
            Одно задание по вашим покупкам. Выполните его за обычный поход в магазин.
          </Typography>
        </div>
        <Typography as="span" variant="bodyXs" className="week-badge">
          Уровень {level}/7
        </Typography>
      </div>

      {demo.failure !== null ? (
        <Typography as="p" variant="bodySm" className="demo-error" role="alert">
          {formatFailure(demo.failure)}
        </Typography>
      ) : null}

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
              <Typography as="span" variant="control">Показать следующее задание</Typography>
            </button>
          ) : null}
        </>
      ) : (
        <div className="demo-quest-empty">
          <img alt="" src="/assets/pyaterochka-cardboard-chest.webp" />
          <Typography as="strong" variant="emphasis" className="demo-empty-title">
            {state.decision === null ? 'Задание готово к показу' : 'Пока нет подходящего задания'}
          </Typography>
          <Typography as="p" variant="bodySm" className="demo-empty">
            {state.decision === null
              ? 'Мы подберём одно задание по вашим прошлым покупкам — его можно выполнить за один обычный поход в магазин.'
              : 'Новое задание появится, когда подойдёт подходящее предложение. Собранные предметы и обещанные награды сохраняются.'}
          </Typography>
          <button
            className="demo-button demo-button-primary demo-button-block"
            disabled={demo.isBusy}
            onClick={demo.askForChallenge}
            type="button"
          >
            <Typography as="span" variant="control">Показать задание</Typography>
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

      <DemoInventory
        key={`inventory-${state.profile.profile_id}-${state.revision}`}
        state={state}
        isBusy={demo.isBusy}
        onCraft={demo.craft}
        onRedeem={demo.redeem}
      />

      <DemoProgressBlock state={state} referralIssued={demo.referralIssued} />

      {demo.store === null ? null : (
        <DemoTradePanel
          key={`trade-${state.profile.profile_id}`}
          store={demo.store}
          isBusy={demo.isBusy}
          note={demo.tradeNote}
          onCreate={demo.createTrade}
          onRespond={demo.respondTrade}
        />
      )}

      <button className="demo-stand-entry" onClick={() => setOpenPanel('stand')} type="button">
        <Typography as="span" variant="bodyXs">Демо-стенд</Typography>
      </button>

      {openPanel === 'stand' ? (
        <DemoStandPanel
          state={state}
          profiles={demo.profiles}
          isBusy={demo.isBusy}
          eventLog={demo.eventLog}
          onSelectProfile={demo.selectProfile}
          onSendReceipt={demo.sendReceipt}
          onRecompute={demo.askForChallenge}
          onReset={demo.resetDemo}
          onOpenX5={() => setOpenPanel('x5')}
          onClose={() => setOpenPanel('none')}
        />
      ) : null}

      {openPanel === 'x5' && demo.store !== null ? (
        <div className="demo-x5-overlay">
          <DemoEvaluationPanel state={state} store={demo.store} onClose={() => setOpenPanel('stand')} />
        </div>
      ) : null}

      {grant !== null && !grant.revealed && grantedItem !== null ? (
        <div className="demo-reveal" role="dialog" aria-modal="true" aria-label="Награда за задание">
          <div className={`demo-reveal-scene item-rarity-${grantedItem.rarity}`}>
            <img alt="" className="demo-reveal-box" src="/assets/pyaterochka-cardboard-chest.webp" />
            <img alt={grantedItem.name} className="demo-reveal-item" src={grantedItem.iconSrc} />
            <Typography as="span" variant="bodyXs" className="demo-reveal-eyebrow">
              Задание выполнено
            </Typography>
            <Typography as="strong" variant="emphasis" className="demo-reveal-name">
              {grantedItem.name}
            </Typography>
            {grant.sku_id !== null ? (
              <Typography as="span" variant="bodyXs" className="demo-reveal-bonus">
                Плюс демонстрационное право на бесплатный товар
              </Typography>
            ) : null}
            <button className="demo-button demo-button-primary" onClick={demo.reveal} type="button">
              <Typography as="span" variant="control">Забрать</Typography>
            </button>
          </div>
        </div>
      ) : null}
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
    <article className={`demo-quest ${isDone ? 'demo-quest-done' : ''}`} aria-label="Карточка задания">
      <div className="demo-quest-head">
        {isDone ? (
          <Typography as="span" variant="bodyXs" className="demo-quest-done-badge">
            Выполнено
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
            Награда
          </Typography>
          <Typography as="span" variant="bodyXs" className="demo-card-reward">
            {card.reward_line}
          </Typography>
          {challenge.reward.physical_sku === null ? null : (
            <Typography as="span" variant="bodyXs" className="demo-quest-bonus">
              Товар уже отложен под это задание.
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
                Набор «{recipe.title}»
              </Typography>
              <Typography as="span" variant="bodyXs" className="demo-recipe-count">
                {ownedForRecipe} из {DEMO_CRAFT_SIZE}
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
          <DemoTerm label="Категория" value={challenge.target.category} />
          <DemoTerm label="Оплаченных единиц" value={String(challenge.target.quantity)} />
        </dl>
      </div>
    </article>
  )
}

function DemoInventory({
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

function DemoProgressBlock({ state, referralIssued }: { state: DemoState; referralIssued: boolean }) {
  const level = avatarLevel(state.profile.progress.completed_recipe_ids)
  const ranking = rankParticipants([
    ...RANKING_PEERS,
    {
      profile_id: state.profile.profile_id,
      alias: 'Вы',
      redeemed_savings_28d_kopecks: state.profile.progress.redeemed_savings_28d_kopecks,
    },
  ])
  const referral = referralOutcome(
    state.profile.referral,
    state.profile.profile_id,
    firstQualifyingPurchaseMs(state.profile),
  )

  return (
    <div className="demo-progress">
      <div>
        <Typography as="h3" variant="h2" className="demo-block-title">Прогресс и рейтинг</Typography>
        <Typography as="span" variant="bodyXs" className="demo-block-hint">
          Уровень растёт от разных собранных наборов. Место в рейтинге не меняет размер награды.
        </Typography>
      </div>

      <div className="demo-level">
        <div className="demo-level-row">
          <Typography as="span" variant="bodySmMedium" className="demo-level-label">
            Уровень аватара
          </Typography>
          <Typography as="span" variant="bodySmMedium" className="demo-level-value">
            {level} из 7
          </Typography>
        </div>
        <div className="demo-level-track" aria-hidden="true">
          {AVATAR_STEPS.map((step) => (
            <span className={`demo-level-step ${step < level ? 'demo-level-step-done' : ''}`} key={step} />
          ))}
        </div>
      </div>

      <div className="demo-stat-grid">
        <div className="demo-stat">
          <Typography as="span" variant="bodyXs" className="demo-stat-label">
            Сэкономлено за 28 дней
          </Typography>
          <Typography as="span" variant="body" className="demo-stat-value">
            {formatRubles(state.profile.progress.redeemed_savings_28d_kopecks)}
          </Typography>
        </div>
        <div className="demo-stat">
          <Typography as="span" variant="bodyXs" className="demo-stat-label">
            Наборов собрано
          </Typography>
          <Typography as="span" variant="body" className="demo-stat-value">
            {state.profile.progress.completed_recipe_ids.length} из 7
          </Typography>
        </div>
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
              {formatRubles(entry.redeemed_savings_28d_kopecks)}
            </Typography>
          </li>
        ))}
      </ol>

      <div className={`demo-referral ${referralIssued ? 'demo-referral-done' : ''}`}>
        <Typography as="span" variant="bodyXs">
          {referralIssued
            ? 'Приглашённый друг сделал покупку — вам начислен предмет за приглашение.'
            : referralReasonText(referral.reason)}
        </Typography>
      </div>
    </div>
  )
}

type DemoLastEvent = {
  qualification: string
  reasonCodes: readonly string[]
}

function useDemoChallenge() {
  const [seed, setSeed] = useState<Awaited<ReturnType<typeof fetchSeedProfiles>> | null>(null)
  const [store, setStore] = useState<DemoStore | null>(null)
  const storeRef = useRef<DemoStore | null>(null)
  const busyRef = useRef(false)
  const state = store === null ? null : store.profiles[store.active_profile_id]
  const [failure, setFailure] = useState<DemoApiFailure | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [lastEvent, setLastEvent] = useState<DemoLastEvent | null>(null)
  const [eventLog, setEventLog] = useState<string | null>(null)
  const [tradeNote, setTradeNote] = useState<string | null>(null)

  const persistStore = useCallback((next: DemoStore) => {
    window.localStorage.setItem(DEMO_STATE_STORAGE_KEY, serializeDemoStore(next))
    storeRef.current = next
    setStore(next)
  }, [])

  const persist = useCallback((next: DemoState) => {
    const current = storeRef.current
    if (current !== null) persistStore(saveDemoProfile(current, next))
  }, [persistStore])

  useEffect(() => {
    let cancelled = false
    void fetchSeedProfiles().then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setSeed(result)
        setFailure(result.error)
        return
      }
      const showcase = createShowcaseProfile(
        result.data.profiles.find((profile) => profile.inventory.length > 0) ?? result.data.profiles[0],
      )
      const allProfiles = [
        showcase,
        ...result.data.profiles,
        ...createTradeSeedProfiles(result.data.profiles[0], Date.now()),
      ]
      const expanded = { ...result, data: { ...result.data, profiles: allProfiles } }
      setSeed(expanded)
      let loaded = resolveDemoStore(window.localStorage.getItem(DEMO_STATE_STORAGE_KEY))
        ?? createDemoStore(createDemoState(showcase, result.data.budget), result.data.ads)
      loaded = hydrateDemoAds(loaded, result.data.ads)
      for (const profile of allProfiles) {
        if (loaded.profiles[profile.profile_id] === undefined) {
          loaded = { ...loaded, profiles: { ...loaded.profiles, [profile.profile_id]: createDemoState(profile, result.data.budget) } }
        }
      }
      loaded = expireDemoTrades(loaded, Date.now())
      loaded = releaseExpiredDemoPromises(loaded, Date.now())
      const active = refreshDemoSavings(loaded.profiles[loaded.active_profile_id], Date.now())
      persistStore(saveDemoProfile(loaded, active))
    })
    return () => { cancelled = true }
  }, [persistStore])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const stored = storeRef.current
      if (stored === null || busyRef.current) return
      const traded = expireDemoTrades(stored, Date.now())
      const current = releaseExpiredDemoPromises(traded, Date.now())
      const active = current.profiles[current.active_profile_id]
      const next = refreshDemoSavings(active, Date.now())
      if (next !== active || current !== stored) persistStore(saveDemoProfile(current, next))
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [persistStore])

  const profiles = seed?.ok === true ? seed.data.profiles : []

  const selectProfile = useCallback((profileId: string) => {
    if (seed?.ok !== true || storeRef.current === null || busyRef.current) return
    const profile = seed.data.profiles.find((candidate) => candidate.profile_id === profileId)
    if (profile === undefined) return
    setLastEvent(null)
    setEventLog(null)
    setTradeNote(null)
    setFailure(null)
    const selected = selectDemoProfile(expireDemoTrades(storeRef.current, Date.now()), profile, seed.data.budget)
    persistStore(saveDemoProfile(selected, refreshDemoSavings(selected.profiles[profileId], Date.now())))
  }, [persistStore, seed])

  const resetDemo = useCallback(() => {
    if (seed?.ok !== true || busyRef.current) return
    setFailure(null)
    setLastEvent(null)
    setEventLog(null)
    setTradeNote(null)
    persistStore(resetDemoStore(seed.data.profiles, seed.data.budget, seed.data.ads))
  }, [persistStore, seed])

  const createTrade = useCallback((command: DemoTradeCreate) => {
    const current = storeRef.current
    if (current === null || busyRef.current) return
    const result = createDemoTrade(current, command, Date.now())
    setTradeNote(tradeReason(result.reason))
    if (result.store !== current) persistStore(result.store)
  }, [persistStore])

  const respondTrade = useCallback((command: DemoTradeRespond) => {
    const current = storeRef.current
    if (current === null || busyRef.current) return
    const result = respondDemoTrade(current, command, Date.now())
    setTradeNote(tradeReason(result.reason))
    if (result.store !== current) persistStore(result.store)
  }, [persistStore])

  const askForChallenge = useCallback(async () => {
    const initialStore = storeRef.current
    if (state === null || initialStore === null || busyRef.current) return
    const nowMs = Date.now()
    let currentStore = releaseExpiredDemoPromise(initialStore, state.profile.profile_id, nowMs)
    const refreshed = refreshDemoSavings(currentStore.profiles[state.profile.profile_id], nowMs)
    if (refreshed !== currentStore.profiles[state.profile.profile_id]) currentStore = saveDemoProfile(currentStore, refreshed)
    if (currentStore !== initialStore) persistStore(currentStore)
    const current = currentStore.profiles[state.profile.profile_id]

    setIsBusy(true)
    busyRef.current = true
    setFailure(null)
    setLastEvent(null)
    setEventLog(null)
    const requestRevision = current.revision
    const result = await requestDecision(current.profile, current.budget, currentStore.ads, nowMs)
    setIsBusy(false)
    busyRef.current = false

    if (!result.ok) {
      setFailure(result.error)
      return
    }
    const latestStore = storeRef.current
    const latest = latestStore?.profiles[current.profile.profile_id]
    if (latestStore === null || latestStore === undefined || latest === undefined || latestStore.active_profile_id !== current.profile.profile_id) return
    persistStore(applyDemoDecision(latestStore, current.profile.profile_id, result.data, requestRevision, nowMs))
  }, [persistStore, state])

  const sendReceipt = useCallback(async (kind: DemoReceiptKind, replay: boolean) => {
    if (state === null || state.challenge === null || busyRef.current) return
    const nowMs = Date.now()
    const receipt = replay
      ? state.last_receipt?.challenge_id === state.challenge.challenge_id ? state.last_receipt.receipt : null
      : buildDemoReceipt(kind, state.challenge, nowMs, `rcp-${crypto.randomUUID()}`)
    if (receipt === null) return

    setIsBusy(true)
    busyRef.current = true
    setFailure(null)
    const requestRevision = state.revision
    const result = await submitDemoEvent(state.profile, state.challenge, receipt, nowMs)
    setIsBusy(false)
    busyRef.current = false

    if (!result.ok) {
      setFailure(result.error)
      return
    }
    const current = storeRef.current
    const latest = current?.profiles[state.profile.profile_id]
    if (current === null || latest === undefined || current.active_profile_id !== state.profile.profile_id || latest.revision !== requestRevision) return
    const applied = applyDemoEvent(current, state.profile.profile_id, result.data, receipt, requestRevision, nowMs)
    if (applied === current) return
    const referral = applyReferralReward(applied, state.profile.profile_id, result.data, receipt, nowMs)
    setLastEvent({ qualification: result.data.qualification, reasonCodes: result.data.reason_codes })
    setEventLog(`${result.data.qualification} · риск: ${result.data.risk.decision} · ${result.data.reason_codes.join(', ')}${state.profile.referral.invited_by_profile_id === null ? '' : ` · ${referral.reason}`}`)
    persistStore(referral.store)
  }, [persistStore, state])

  const reveal = useCallback(() => {
    if (state === null) return
    persist(revealGrant(state))
  }, [persist, state])

  const craft = useCallback((itemIds: readonly string[]) => {
    if (state === null || itemIds.length !== DEMO_CRAFT_SIZE) return
    persist(applyCraft(state, craftDiscount(itemIds), Date.now()))
  }, [persist, state])

  const redeem = useCallback(() => {
    if (state === null) return
    persist(applyRedemption(state, DEMO_BASKET_KOPECKS, Date.now()))
  }, [persist, state])

  return {
    askForChallenge,
    craft,
    eventLog,
    failure,
    isBusy,
    lastEvent,
    profiles,
    referralIssued: store?.referral_awards.some((award) => award.invitee_profile_id === state?.profile.profile_id) ?? false,
    redeem,
    resetDemo,
    reveal,
    selectProfile,
    sendReceipt,
    state,
    store,
    tradeNote,
    createTrade,
    respondTrade,
  }
}

/** Результат чека объясняется покупателю словами; коды причин остаются в демо-стенде. */
function eventMessage(event: DemoLastEvent): string {
  if (event.qualification === 'qualified') {
    return 'Покупка засчитана. Награда за задание уже в инвентаре.'
  }
  if (event.qualification === 'duplicate') {
    return 'Этот чек уже учтён — награда выдаётся один раз.'
  }
  if (event.reasonCodes.includes('receipt_returned')) {
    return 'Покупку вернули, поэтому задание осталось невыполненным.'
  }
  if (event.reasonCodes.includes('receipt_window_expired')) {
    return 'Покупка сделана после срока задания.'
  }
  if (
    event.reasonCodes.includes('receipt_line_not_paid')
    || event.reasonCodes.includes('receipt_category_mismatch')
    || event.reasonCodes.includes('receipt_quantity_insufficient')
  ) {
    // Движок не различает бесплатную строку и чужую категорию: обе означают,
    // что оплаченной покупки из нужной категории в чеке нет.
    return 'В чеке нет оплаченной покупки из нужной категории. Задание ещё активно.'
  }
  return 'Покупка не подошла под условия задания. Оно ещё активно.'
}

function tradeReason(reason: string): string {
  const messages: Record<string, string> = {
    trade_created: 'Предложение отправлено. Обе копии зарезервированы на 24 часа.',
    trade_accepted: 'Предметы переданы обоим участникам.',
    trade_rejected: 'Предложение отклонено. Копии снова доступны.',
    trade_expired: 'Срок предложения истёк. Копии снова доступны.',
    trade_idempotent: 'Это действие уже учтено; повторной передачи нет.',
    trade_weekly_limit: 'У одного из участников уже три завершённых обмена за последние семь дней.',
    trade_purchase_days_insufficient: 'Каждому участнику нужны минимум два оплаченных покупочных дня.',
    trade_duplicate_unavailable: 'Свободного дубликата уже нет. Обновите выбор.',
    trade_stale_revision: 'Состояние изменилось. Проверьте предложение и повторите действие.',
    trade_rarity_mismatch: 'Можно обмениваться только предметами одной редкости.',
    trade_receiver_required: 'Подтвердить или отклонить предложение может только получатель.',
  }
  return messages[reason] ?? `Обмен не выполнен: ${reason}`
}

function referralReasonText(reason: string): string {
  const messages: Record<string, string> = {
    referral_reward_due: 'Условия приглашения выполнены — награда начислена.',
    referral_not_invited: 'Пригласите друга: за его первую покупку вы получите предмет.',
    referral_self_invite: 'Приглашение самого себя не засчитывается.',
    referral_existing_customer: 'У приглашённого уже были покупки, награда не начисляется.',
    referral_no_qualifying_purchase: 'Ждём первую покупку приглашённого друга.',
    referral_window_expired: 'Друг купил позже семи дней после приглашения.',
    referral_cap_reached: 'За это окно награда за приглашение уже получена.',
  }
  return messages[reason] ?? reason
}

function DemoTerm({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt><Typography as="span" variant="bodyXs">{label}</Typography></dt>
      <dd><Typography as="span" variant="bodyXs">{value}</Typography></dd>
    </div>
  )
}

/** Обещание закрыто, когда чек по нему уже засчитан. */
function isChallengeDone(state: DemoState): boolean {
  const promise = state.profile.outstanding_promise
  if (promise === null || state.challenge === null) return false
  return promise.challenge_id === state.challenge.challenge_id && promise.fulfilled
}

function findItem(itemId: string | null) {
  if (itemId === null) return null
  return profileItems.find((item) => item.id === itemId) ?? null
}

function daysUntil(deadlineMs: number): number | null {
  const remaining = deadlineMs - Date.now()
  if (remaining <= 0) return 0
  return Math.ceil(remaining / 86_400_000)
}

function formatDaysLeft(days: number): string {
  if (days === 0) return 'Последний день'
  const tail = days % 100 >= 11 && days % 100 <= 14
    ? 'дней'
    : days % 10 === 1
      ? 'день'
      : days % 10 >= 2 && days % 10 <= 4
        ? 'дня'
        : 'дней'
  return `Осталось ${days} ${tail}`
}

function formatRubles(kopecks: number): string {
  return `${(kopecks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
}

function formatFailure(failure: DemoApiFailure): string {
  return `Задание временно недоступно (${failure.code}).`
}
