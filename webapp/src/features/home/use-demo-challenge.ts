import { useCallback, useEffect, useRef, useState } from 'react'
import type { DemoTradeCreate, DemoTradeRespond } from '@pyaterochka-game-demo/contracts'

import {
  fetchSeedProfiles,
  requestDecision,
  submitDemoEvent,
  type DemoApiFailure,
} from './demo-api'
import { buildDemoReceipt, type DemoReceiptKind } from './demo-receipt'
import { createShowcaseProfile } from './demo-showcase'
import {
  addChestItem,
  applyCraft,
  applyRedemption,
  createDemoState,
  loginDay,
  loginGreetingFor,
  recordLoginVisit,
  refreshDemoSavings,
  revealGrant,
  type DemoState,
  type LoginGreeting,
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
import { createDemoTrade, createTradeSeedProfiles, expireDemoTrades, respondDemoTrade } from './demo-trades'
import { craftDiscount } from './profile-discount-crafting'

const DEMO_STATE_STORAGE_KEY = 'pyaterochka_demo_challenge_state'
const DEMO_BASKET_KOPECKS = 45_000
export const DEMO_CRAFT_SIZE = 4

export type DemoLastEvent = {
  qualification: string
  reasonCodes: readonly string[]
}

export function useDemoChallenge() {
  const [today, setToday] = useState(() => loginDay(Date.now()))
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
  const [loginGreeting, setLoginGreeting] = useState<LoginGreeting | null>(null)

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
      const opened = refreshDemoSavings(loaded.profiles[loaded.active_profile_id], Date.now())
      const active = recordLoginVisit(opened, Date.now())
      setLoginGreeting(loginGreetingFor(opened, active))
      persistStore(saveDemoProfile(loaded, active))
    })
    return () => { cancelled = true }
  }, [persistStore])

  useEffect(() => {
    const visit = () => {
      setToday(loginDay(Date.now()))
      const current = storeRef.current
      if (current === null || busyRef.current || document.visibilityState !== 'visible') return
      const active = current.profiles[current.active_profile_id]
      const next = recordLoginVisit(active, Date.now())
      if (next === active) return
      setLoginGreeting(loginGreetingFor(active, next))
      persistStore(saveDemoProfile(current, next))
    }
    window.addEventListener('focus', visit)
    document.addEventListener('visibilitychange', visit)
    return () => {
      window.removeEventListener('focus', visit)
      document.removeEventListener('visibilitychange', visit)
    }
  }, [persistStore])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday(loginDay(Date.now()))
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
    const opened = refreshDemoSavings(selected.profiles[profileId], Date.now())
    const active = recordLoginVisit(opened, Date.now())
    setLoginGreeting(loginGreetingFor(opened, active))
    persistStore(saveDemoProfile(selected, active))
  }, [persistStore, seed])

  const resetDemo = useCallback(() => {
    if (seed?.ok !== true || busyRef.current) return
    setFailure(null)
    setLastEvent(null)
    setEventLog(null)
    setTradeNote(null)
    setLoginGreeting(null)
    const reset = resetDemoStore(seed.data.profiles, seed.data.budget, seed.data.ads)
    persistStore(saveDemoProfile(reset, recordLoginVisit(reset.profiles[reset.active_profile_id], Date.now())))
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
    setEventLog(`${result.data.qualification} · risk: ${result.data.risk.decision} · ${result.data.reason_codes.join(', ')}${state.profile.referral.invited_by_profile_id === null ? '' : ` · ${referral.reason}`}`)
    persistStore(referral.store)
  }, [persistStore, state])

  const reveal = useCallback(() => {
    if (state === null) return
    persist(revealGrant(state))
  }, [persist, state])

  /** The only crafting path: it spends the items and returns a discount with a barcode. */
  const craft = useCallback((itemIds: readonly string[]) => {
    if (state === null || itemIds.length !== DEMO_CRAFT_SIZE) return null
    const discount = craftDiscount(itemIds)
    const next = applyCraft(state, discount, Date.now())
    if (next === state) return null
    persist(next)
    return discount
  }, [persist, state])

  /** The box adds to the same inventory as challenges do. */
  const collectChestItem = useCallback((itemId: string) => {
    const current = storeRef.current
    if (current === null || busyRef.current) return false
    const active = current.profiles[current.active_profile_id]
    if (active === undefined) return false
    const next = addChestItem(active, itemId)
    if (next === active) return false
    persistStore(saveDemoProfile(current, next))
    return true
  }, [persistStore])

  // Demo stand only: it changes the login day, not receipt or campaign time.
  const advanceLoginDay = useCallback(() => {
    const current = storeRef.current
    if (current === null || busyRef.current) return
    const active = current.profiles[current.active_profile_id]
    const nextDay = Math.max(loginDay(Date.now()), active.login_box.last_day ?? 0) + 1
    const next = recordLoginVisit(active, nextDay * 86_400_000)
    if (next === active) return
    setLoginGreeting(loginGreetingFor(active, next))
    persistStore(saveDemoProfile(current, next))
  }, [persistStore])

  const redeem = useCallback(() => {
    if (state === null) return
    persist(applyRedemption(state, DEMO_BASKET_KOPECKS, Date.now()))
  }, [persist, state])

  const dismissLoginGreeting = useCallback(() => setLoginGreeting(null), [])

  return {
    askForChallenge,
    advanceLoginDay,
    dismissLoginGreeting,
    loginGreeting,
    collectChestItem,
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
    loginToday: Math.max(today, state?.login_box.last_day ?? 0),
    store,
    tradeNote,
    createTrade,
    respondTrade,
  }
}

export type DemoChallengeController = ReturnType<typeof useDemoChallenge>


/** Technical trade reasons are turned into an explanation for a person. */
function tradeReason(reason: string): string {
  const messages: Record<string, string> = {
    trade_created: 'Offer sent. Both copies are reserved for 24 hours.',
    trade_accepted: 'The items have been transferred to both participants.',
    trade_rejected: 'The offer was declined. Both copies are available again.',
    trade_expired: 'The offer expired. Both copies are available again.',
    trade_idempotent: 'This action was already counted; nothing is transferred twice.',
    trade_weekly_limit: 'One of the participants already has three completed trades in the last seven days.',
    trade_purchase_days_insufficient: 'Each participant needs at least two paid purchase days.',
    trade_duplicate_unavailable: 'The selected item is no longer available. Refresh your choice.',
    trade_stale_revision: 'The state has changed. Check the offer and repeat the action.',
    trade_rarity_mismatch: 'Only items of the same rarity can be exchanged.',
    trade_receiver_required: 'Only the receiver can accept or decline the offer.',
  }
  return messages[reason] ?? `The trade did not go through: ${reason}`
}
