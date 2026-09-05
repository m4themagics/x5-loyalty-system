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
import {
  DEMO_RECEIPT_LABELS,
  buildDemoReceipt,
  type DemoReceiptKind,
} from './demo-receipt'
import {
  applyCraft,
  applyDecision,
  applyEvent,
  applyRedemption,
  availableDemoInventory,
  createDemoState,
  refreshDemoSavings,
  releaseExpiredPromise,
  revealGrant,
  type DemoState,
} from './demo-state'
import { applyReferralReward, createDemoStore, resolveDemoStore, saveDemoProfile, selectDemoProfile, serializeDemoStore, type DemoStore } from './demo-store'
import { addDemoSelection, removeDemoSelection } from './demo-selection'
import { cancelProfileTrades, createDemoTrade, createTradeSeedProfiles, expireDemoTrades, respondDemoTrade } from './demo-trades'
import { DemoTradePanel } from './DemoTradePanel'
import { DemoEvaluationPanel } from './DemoEvaluationPanel'
import { craftDiscount, previewCraftedDiscount } from './profile-discount-crafting'
import { profileItems } from './profile-items'

import './demo-challenge.css'

const DEMO_STATE_STORAGE_KEY = 'pyaterochka_demo_challenge_state'
const DEMO_BASKET_KOPECKS = 45_000
const RECEIPT_KINDS: readonly DemoReceiptKind[] = [
  'qualifying',
  'free_line',
  'wrong_category',
  'late',
  'returned',
]

const RANKING_PEERS = [
  { profile_id: 'peer-1', alias: 'Сосед по кварталу', redeemed_savings_28d_kopecks: 3200 },
  { profile_id: 'peer-2', alias: 'Утренний покупатель', redeemed_savings_28d_kopecks: 1500 },
  { profile_id: 'peer-3', alias: 'Любитель выпечки', redeemed_savings_28d_kopecks: 1500 },
]

export function DemoChallengePanel() {
  const demo = useDemoChallenge()
  const [showX5, setShowX5] = useState(false)

  if (demo.state === null) {
    return (
      <section className="demo-panel" aria-labelledby="demo-title">
        <Typography as="h2" variant="h2" className="section-title" id="demo-title">
          Персональный челлендж
        </Typography>
        <Typography as="span" variant="bodyXs" className="section-hint">
          {demo.failure === null ? 'Загружаем демонстрационные профили…' : formatFailure(demo.failure)}
        </Typography>
      </section>
    )
  }

  const { state } = demo
  const challenge = state.challenge
  const card = state.card
  const grant = state.last_grant
  const grantedItem = grant === null ? null : findItem(grant.item_id)

  return (
    <section className="demo-panel" aria-labelledby="demo-title">
      <div className="profile-section-heading">
        <div>
          <Typography as="h2" variant="h2" className="section-title" id="demo-title">
            Персональный челлендж
          </Typography>
          <Typography as="span" variant="bodyXs" className="section-hint">
            Локальная демонстрация на синтетических данных. Реальная выдача товара не выполняется.
          </Typography>
        </div>
        <Typography as="span" variant="bodyXs" className="week-badge">
          Уровень {avatarLevel(state.profile.progress.completed_recipe_ids)}/7
        </Typography>
      </div>

      <button className="demo-button" type="button" aria-expanded={showX5} onClick={() => setShowX5((visible) => !visible)}>
        <Typography as="span" variant="control">Для X5</Typography>
      </button>
      {showX5 ? <DemoEvaluationPanel state={state} /> : null}

      <div className="demo-profile-switch" role="group" aria-label="Синтетический профиль">
        {demo.profiles.map((profile) => (
          <button
            aria-pressed={profile.profile_id === state.profile.profile_id}
            className="demo-chip"
            disabled={demo.isBusy}
            key={profile.profile_id}
            onClick={() => demo.selectProfile(profile.profile_id)}
            type="button"
          >
            <Typography as="span" variant="bodyXs">{profile.label}</Typography>
          </button>
        ))}
      </div>

      <div className="demo-actions">
        <button
          className="demo-button demo-button-primary"
          disabled={demo.isBusy}
          onClick={demo.askForChallenge}
          type="button"
        >
          <Typography as="span" variant="control">
            {challenge === null ? 'Показать задание' : 'Пересчитать задание'}
          </Typography>
        </button>
        <button
          className="demo-button"
          disabled={demo.isBusy}
          onClick={demo.resetProfile}
          type="button"
        >
          <Typography as="span" variant="control">Сбросить демо</Typography>
        </button>
      </div>

      {demo.failure !== null ? (
        <Typography as="p" variant="bodySm" className="demo-error" role="alert">
          {formatFailure(demo.failure)}
        </Typography>
      ) : null}

      {challenge !== null && card !== null ? (
        <article className="demo-card" aria-label="Карточка задания">
          <Typography as="strong" variant="emphasis" className="demo-card-headline">
            {card.headline}
          </Typography>
          <Typography as="p" variant="bodySm" className="demo-card-body">{card.body}</Typography>
          <Typography as="span" variant="bodyXs" className="demo-card-reward">{card.reward_line}</Typography>
          <Typography as="span" variant="bodyXs" className="demo-card-deadline">{card.deadline_line}</Typography>
          {card.sponsor_line !== null ? (
            <Typography as="span" variant="bodyXs" className="demo-card-sponsor">{card.sponsor_line}</Typography>
          ) : null}
          <dl className="demo-terms">
            <DemoTerm label="Категория" value={challenge.target.category} />
            <DemoTerm label="Оплаченных единиц" value={String(challenge.target.quantity)} />
            <DemoTerm label="Резерв купона" value={formatRubles(challenge.reservation.coupon_reserve_kopecks)} />
            <DemoTerm label="Резерв товара" value={formatRubles(challenge.reservation.physical_reserve_kopecks)} />
          </dl>
        </article>
      ) : (
        <Typography as="p" variant="bodySm" className="demo-empty">
          {state.decision === null
            ? 'Задание ещё не запрашивалось.'
            : `Нового задания нет: ${state.decision.reason_codes.join(', ')}`}
        </Typography>
      )}

      {challenge !== null ? (
        <div className="demo-receipts" role="group" aria-label="Тестовые чеки">
          {RECEIPT_KINDS.map((kind) => (
            <button
              className="demo-button"
              disabled={demo.isBusy}
              key={kind}
              onClick={() => demo.sendReceipt(kind, false)}
              type="button"
            >
              <Typography as="span" variant="bodyXs">{DEMO_RECEIPT_LABELS[kind]}</Typography>
            </button>
          ))}
          <button
            className="demo-button"
            disabled={demo.isBusy || state.last_receipt?.challenge_id !== challenge.challenge_id}
            onClick={() => demo.sendReceipt('qualifying', true)}
            type="button"
          >
            <Typography as="span" variant="bodyXs">Тот же чек ещё раз</Typography>
          </button>
        </div>
      ) : null}

      {demo.lastEventNote !== null ? (
        <Typography as="p" variant="bodyXs" className="demo-event-note" role="status">
          {demo.lastEventNote}
        </Typography>
      ) : null}

      <DemoInventory
        key={`inventory-${state.profile.profile_id}-${state.revision}`}
        state={state}
        isBusy={demo.isBusy}
        onCraft={demo.craft}
        onRedeem={demo.redeem}
      />

      <DemoProgressBlock state={state} referralIssued={demo.referralIssued} />
      {demo.store === null ? null : <DemoTradePanel key={`trade-${state.profile.profile_id}`} store={demo.store} isBusy={demo.isBusy} note={demo.tradeNote} onCreate={demo.createTrade} onRespond={demo.respondTrade} />}

      {state.decision !== null ? (
        <details className="demo-diagnostics">
          <summary><Typography as="span" variant="bodyXs">Диагностика решения</Typography></summary>
          <dl className="demo-terms">
            <DemoTerm label="Решение" value={state.decision.decision_id} />
            <DemoTerm label="Причины" value={state.decision.reason_codes.join(', ')} />
            <DemoTerm label="Источник карточки" value={state.decision.card_source ?? '—'} />
            <DemoTerm label="LLM" value={state.decision.llm_error ?? 'ответ модели принят'} />
            <DemoTerm label="Купонный фонд" value={formatRubles(state.decision.coupon_available_kopecks)} />
            <DemoTerm label="Товарный фонд" value={formatRubles(state.decision.physical_available_kopecks)} />
          </dl>
        </details>
      ) : null}

      {grant !== null && !grant.revealed && grantedItem !== null ? (
        <div className="demo-reveal" role="dialog" aria-modal="true" aria-label="Награда за задание">
          <div className="demo-reveal-scene">
            <img alt="" className="demo-reveal-box" src="/assets/pyaterochka-cardboard-chest.webp" />
            <Typography as="strong" variant="emphasis">{grantedItem.name}</Typography>
            <img alt={grantedItem.name} className="demo-reveal-item" src={grantedItem.iconSrc} />
            {grant.sku_id !== null ? (
              <Typography as="span" variant="bodyXs">
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
      <Typography as="h3" variant="h2" className="section-title">Персональный инвентарь</Typography>
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
            const available = spendable.find((item) => item.item_id === entry.item_id)?.quantity ?? 0
            return (
              <li key={entry.item_id}>
                <button
                  aria-label={item.name}
                  aria-pressed={selectedCount > 0}
                  className={`demo-item item-rarity-${item.rarity}`}
                  disabled={isBusy || coupon !== null || selectedCount >= available || selected.length >= 4}
                  onClick={() => setSelected((current) => addDemoSelection(current, spendable, entry.item_id))}
                  type="button"
                >
                  <img alt={item.name} src={item.iconSrc} />
                  <Typography as="span" variant="bodyXs">{item.name}</Typography>
                  <Typography as="span" variant="bodyXs" className="demo-item-count">
                    ×{entry.quantity}{selectedCount > 0 ? ` · выбрано ${selectedCount}` : ''}
                    {entry.quantity > available ? ` · в обмене ${entry.quantity - available}` : ''}
                  </Typography>
                </button>
                {selectedCount > 0 ? (
                  <button
                    className="demo-button"
                    disabled={isBusy || coupon !== null}
                    aria-label={`Убрать одну копию: ${item.name}`}
                    onClick={() => setSelected((current) => removeDemoSelection(current, entry.item_id))}
                    type="button"
                  >
                    <Typography as="span" variant="bodyXs">Убрать одну</Typography>
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {coupon === null ? (
        <div className="demo-actions">
          <Typography as="span" variant="bodyXs">
            {preview === null
              ? `Выбрано ${selected.length} из 4 предметов`
              : `«${preview.title}» — ${preview.percent}%`}
          </Typography>
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
        <div className="demo-actions">
          <Typography as="span" variant="bodyXs">
            Активная скидка {coupon.percent}%, максимум {formatRubles(coupon.max_kopecks)}. Новый купон
            недоступен до погашения.
          </Typography>
          <button className="demo-button" disabled={isBusy} onClick={onRedeem} type="button">
            <Typography as="span" variant="control">Погасить (демо)</Typography>
          </button>
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
      <Typography as="h3" variant="h2" className="section-title">Прогресс, рейтинг и реферал</Typography>
      <Typography as="span" variant="bodyXs" className="section-hint">
        Синтетические события. Повтор одного рецепта не поднимает уровень, место не увеличивает награду.
      </Typography>
      <dl className="demo-terms">
        <DemoTerm label="Уровень аватара" value={`${level} из 7`} />
        <DemoTerm
          label="Разные рецепты"
          value={state.profile.progress.completed_recipe_ids.join(', ') || '—'}
        />
        <DemoTerm
          label="Погашенная экономия за 28 дней"
          value={formatRubles(state.profile.progress.redeemed_savings_28d_kopecks)}
        />
        <DemoTerm label="Реферальная награда" value={referralIssued ? 'Пригласившему начислен один обычный предмет' : referral.reason} />
      </dl>
      <ol className="demo-ranking">
        {ranking.map((entry) => (
          <li key={entry.profile_id}>
            <Typography as="span" variant="bodyXs">
              {entry.rank}. {entry.alias} — {formatRubles(entry.redeemed_savings_28d_kopecks)}
            </Typography>
          </li>
        ))}
      </ol>
    </div>
  )
}

function useDemoChallenge() {
  const [seed, setSeed] = useState<Awaited<ReturnType<typeof fetchSeedProfiles>> | null>(null)
  const [store, setStore] = useState<DemoStore | null>(null)
  const storeRef = useRef<DemoStore | null>(null)
  const busyRef = useRef(false)
  const state = store === null ? null : store.profiles[store.active_profile_id]
  const [failure, setFailure] = useState<DemoApiFailure | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [lastEventNote, setLastEventNote] = useState<string | null>(null)
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
      const expanded = { ...result, data: { ...result.data, profiles: [...result.data.profiles, ...createTradeSeedProfiles(result.data.profiles[0], Date.now())] } }
      setSeed(expanded)
      let loaded = resolveDemoStore(window.localStorage.getItem(DEMO_STATE_STORAGE_KEY))
        ?? createDemoStore(createDemoState(result.data.profiles[0], result.data.budget))
      for (const profile of expanded.data.profiles) {
        if (loaded.profiles[profile.profile_id] === undefined) {
          loaded = { ...loaded, profiles: { ...loaded.profiles, [profile.profile_id]: createDemoState(profile, result.data.budget) } }
        }
      }
      loaded = expireDemoTrades(loaded, Date.now())
      const active = refreshDemoSavings(loaded.profiles[loaded.active_profile_id], Date.now())
      persistStore(saveDemoProfile(loaded, active))
    })
    return () => { cancelled = true }
  }, [persistStore])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const stored = storeRef.current
      if (stored === null || busyRef.current) return
      const current = expireDemoTrades(stored, Date.now())
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
    setLastEventNote(null)
    setTradeNote(null)
    setFailure(null)
    const selected = selectDemoProfile(expireDemoTrades(storeRef.current, Date.now()), profile, seed.data.budget)
    persistStore(saveDemoProfile(selected, refreshDemoSavings(selected.profiles[profileId], Date.now())))
  }, [persistStore, seed])

  const resetProfile = useCallback(() => {
    if (state === null || seed?.ok !== true || busyRef.current) return
    const profile = seed.data.profiles.find((candidate) => candidate.profile_id === state.profile.profile_id)
    if (profile === undefined) return
    setFailure(null)
    setLastEventNote(null)
    const current = storeRef.current
    if (current !== null) persistStore(saveDemoProfile(cancelProfileTrades(current, profile.profile_id, Date.now()), createDemoState(profile, seed.data.budget)))
  }, [persistStore, seed, state])

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
    if (state === null || busyRef.current) return
    const nowMs = Date.now()
    const current = releaseExpiredPromise(refreshDemoSavings(state, nowMs), nowMs)
    if (current !== state) persist(current)

    setIsBusy(true)
    busyRef.current = true
    setFailure(null)
    setLastEventNote(null)
    const requestRevision = current.revision
    const result = await requestDecision(current.profile, current.budget, nowMs)
    setIsBusy(false)
    busyRef.current = false

    if (!result.ok) {
      setFailure(result.error)
      return
    }
    const latest = storeRef.current?.profiles[current.profile.profile_id]
    if (latest === undefined || storeRef.current?.active_profile_id !== current.profile.profile_id) return
    persist(applyDecision(latest, result.data, requestRevision, nowMs))
  }, [persist, state])

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
    const next = applyEvent(latest, result.data, receipt, requestRevision, nowMs)
    const referral = applyReferralReward(saveDemoProfile(current, next), state.profile.profile_id, result.data, receipt, nowMs)
    setLastEventNote(`${result.data.qualification} · риск: ${result.data.risk.decision} · ${result.data.reason_codes.join(', ')}${state.profile.referral.invited_by_profile_id === null ? '' : ` · ${referral.reason}`}`)
    persistStore(referral.store)
  }, [persistStore, state])

  const reveal = useCallback(() => {
    if (state === null) return
    persist(revealGrant(state))
  }, [persist, state])

  const craft = useCallback((itemIds: readonly string[]) => {
    if (state === null || itemIds.length !== 4) return
    persist(applyCraft(state, craftDiscount(itemIds), Date.now()))
  }, [persist, state])

  const redeem = useCallback(() => {
    if (state === null) return
    persist(applyRedemption(state, DEMO_BASKET_KOPECKS, Date.now()))
  }, [persist, state])

  return {
    askForChallenge,
    craft,
    failure,
    isBusy,
    lastEventNote,
    profiles,
    referralIssued: store?.referral_awards.some((award) => award.invitee_profile_id === state?.profile.profile_id) ?? false,
    redeem,
    resetProfile,
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

function DemoTerm({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt><Typography as="span" variant="bodyXs">{label}</Typography></dt>
      <dd><Typography as="span" variant="bodyXs">{value}</Typography></dd>
    </div>
  )
}

function findItem(itemId: string) {
  return profileItems.find((item) => item.id === itemId) ?? null
}

function formatRubles(kopecks: number): string {
  return `${(kopecks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
}

function formatFailure(failure: DemoApiFailure): string {
  return `Движок недоступен (${failure.code}): ${failure.message}`
}
