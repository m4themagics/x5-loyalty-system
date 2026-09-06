import { Typography } from '@/components/typography'
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  SHAKE_DISTANCE_REQUIRED,
  addShakeMovement,
  type PointerPoint,
} from './profile-chest-gesture'
import { ITEM_DROP_RATES, drawProfileItem } from './profile-item-drop'
import { type ItemRarity, type ProfileItem } from './profile-items'
import { serializeChestCycle } from './profile-countdown'
import {
  type CraftedDiscount,
  resolveCraftedDiscount,
  serializeCraftedDiscount,
} from './profile-discount-crafting'
import { ProfileDiscountOverlay } from './ProfileDiscount'
import { ProfileHeader } from './ProfileHeader'
import { ProfileInventoryCrafting } from './ProfileInventoryCrafting'
import { avatarLevel } from './demo-progress'
import { availableDemoInventory } from './demo-state'
import { findItem, formatRubles } from './demo-format'
import { DemoQuestSection } from './DemoQuestSection'
import { DemoSocialSection } from './DemoSocialSection'
import { DemoTradePanel } from './DemoTradePanel'
import { DemoStandPanel } from './DemoStandPanel'
import { DemoEvaluationPanel } from './DemoEvaluationPanel'
import { useDemoChallenge } from './use-demo-challenge'

import './profile-screen.css'
import './demo-challenge.css'

const COUNTDOWN_STORAGE_KEY = 'pyaterochka_profile_chest_deadline'
const ACTIVE_DISCOUNT_STORAGE_KEY = 'pyaterochka_profile_active_discount'
const DEMO_BASKET_HINT_KOPECKS = 45_000

const rarityLabels: Record<ItemRarity, string> = {
  common: 'Обычный',
  epic: 'Эпический',
  legendary: 'Легендарный',
}

const profileTabs = [
  { id: 'quests', label: 'Задания' },
  { id: 'collection', label: 'Коллекция' },
  { id: 'friends', label: 'Друзья' },
] as const

type ProfileTab = (typeof profileTabs)[number]['id']

const tasks = [
  {
    brand: 'Добрый',
    brandClass: 'dobry',
    brandLogo: '/assets/task-brands/dobry.webp',
    description: 'Купите 5 напитков «Добрый»',
    progress: '2 из 5',
  },
  {
    brand: 'Рестория',
    brandClass: 'restoria',
    brandLogo: '/assets/task-brands/restoria.webp',
    description: 'Купите 3 готовых блюда «Рестория»',
    progress: '1 из 3',
  },
  {
    brand: 'Овощи и фрукты',
    brandClass: 'global-village',
    brandLogo: '/assets/task-brands/apples.webp',
    description: 'Купите овощи или фрукты 3 раза',
    progress: '2 из 3',
  },
  {
    brand: 'Молочные продукты',
    brandClass: 'milk',
    brandLogo: '/assets/task-brands/milk.webp',
    description: 'Купите молочные продукты 2 раза',
    progress: '0 из 2',
  },
] as const

export function ProfileScreen() {
  const demo = useDemoChallenge()
  const demoState = demo.state
  const [tab, setTab] = useState<ProfileTab>('quests')
  const [openPanel, setOpenPanel] = useState<'none' | 'stand' | 'x5'>('none')
  const { claimReward, countdown, isOpenable } = useChestCountdown()
  const collectChestItem = demo.collectChestItem
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [openingStage, setOpeningStage] = useState<'closed' | 'shaking' | 'opening' | 'reward'>('closed')
  const [rewardItem, setRewardItem] = useState<ProfileItem | null>(null)
  const [activeDiscount, setActiveDiscount] = useState<CraftedDiscount | null>(() => {
    if (typeof window === 'undefined') return null
    return resolveCraftedDiscount(
      window.localStorage.getItem(ACTIVE_DISCOUNT_STORAGE_KEY),
    )
  })
  const [discountOverlayMode, setDiscountOverlayMode] = useState<'reveal' | 'barcode' | null>(null)
  const [isTradeOpen, setIsTradeOpen] = useState(false)
  const [shakeOffset, setShakeOffset] = useState({ x: 0, y: 0 })
  const lastPointerRef = useRef<PointerPoint | null>(null)
  const shakeDistanceRef = useRef(0)

  useEffect(() => {
    if (!isTradeOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isTradeOpen])

  useEffect(() => {
    if (openingStage !== 'opening') return

    const revealTimer = window.setTimeout(() => {
      const nextReward = drawProfileItem()
      collectChestItem(nextReward.id)
      claimReward()
      setRewardItem(nextReward)
      setOpeningStage('reward')
    }, 1_400)

    return () => window.clearTimeout(revealTimer)
  }, [claimReward, collectChestItem, openingStage])

  const openChest = () => {
    if (!isOpenable) return
    setIsInfoOpen(false)
    shakeDistanceRef.current = 0
    setShakeOffset({ x: 0, y: 0 })
    setRewardItem(null)
    setOpeningStage('shaking')
  }

  const startShaking = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (openingStage !== 'shaking') return
    event.currentTarget.setPointerCapture(event.pointerId)
    lastPointerRef.current = { x: event.clientX, y: event.clientY }
  }

  const continueShaking = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const previousPoint = lastPointerRef.current
    if (openingStage !== 'shaking' || previousPoint === null) return

    const nextPoint = { x: event.clientX, y: event.clientY }
    const nextDistance = addShakeMovement(
      shakeDistanceRef.current,
      previousPoint,
      nextPoint,
    )
    shakeDistanceRef.current = nextDistance
    lastPointerRef.current = nextPoint
    setShakeOffset({
      x: Math.max(-22, Math.min(22, (nextPoint.x - previousPoint.x) * .55)),
      y: Math.max(-14, Math.min(14, (nextPoint.y - previousPoint.y) * .35)),
    })

    if (nextDistance >= SHAKE_DISTANCE_REQUIRED) {
      lastPointerRef.current = null
      setShakeOffset({ x: 0, y: 0 })
      setOpeningStage('opening')
    }
  }

  const stopShaking = () => {
    lastPointerRef.current = null
    setShakeOffset({ x: 0, y: 0 })
  }

  /** Один путь сборки: предметы списываются из общего инвентаря, купон и штрихкод — одна скидка. */
  const createProfileDiscount = useCallback((itemIds: readonly string[]) => {
    const discount = demo.craft(itemIds)
    if (discount === null) return
    window.localStorage.setItem(
      ACTIVE_DISCOUNT_STORAGE_KEY,
      serializeCraftedDiscount(discount),
    )
    setActiveDiscount(discount)
    setDiscountOverlayMode('reveal')
  }, [demo])

  const redeemCoupon = useCallback(() => {
    demo.redeem()
    window.localStorage.removeItem(ACTIVE_DISCOUNT_STORAGE_KEY)
    setActiveDiscount(null)
    setDiscountOverlayMode(null)
  }, [demo])

  const level = demoState === null ? 0 : avatarLevel(demoState.profile.progress.completed_recipe_ids)
  const savings = demoState === null ? 0 : demoState.profile.progress.redeemed_savings_28d_kopecks
  const grant = demoState?.last_grant ?? null
  const grantedItem = grant === null ? null : findItem(grant.item_id)
  const coupon = demoState?.profile.active_coupon ?? null
  const inventory = demoState === null
    ? []
    : availableDemoInventory(demoState).map((entry) => ({
        itemId: entry.item_id,
        quantity: entry.quantity,
      }))

  const changeTab = (next: ProfileTab) => {
    if (next === tab) return
    window.scrollTo(0, 0)
    setTab(next)
  }

  return (
    <main className="profile-screen" aria-label="Профиль">
      <ProfileHeader
        level={level}
        savingsKopecks={savings}
        activeDiscount={activeDiscount}
        onOpenDiscount={() => setDiscountOverlayMode('barcode')}
        onOpenTrade={() => setIsTradeOpen(true)}
      />

      <section className="profile-chest-panel" aria-label="Коробка награды">
        <div className="chest-timer">
          <Typography as="span" variant="bodyXs" className="chest-timer-label">
            Коробка
          </Typography>
          <Typography as="time" variant="body" className="chest-timer-value">
            {countdown}
          </Typography>
        </div>

        <button
          aria-label="Открыть коробку Пятёрочки"
          className="profile-chest-trigger"
          disabled={!isOpenable}
          onClick={openChest}
          type="button"
        >
          <img
            alt=""
            className="profile-chest-image"
            src="/assets/pyaterochka-cardboard-chest.webp"
          />
          <Typography as="span" variant="bodyXs" className="chest-tap-hint">
            Нажмите, чтобы открыть
          </Typography>
        </button>

        <div className="chest-info-wrap">
          <button
            aria-expanded={isInfoOpen}
            aria-label="Информация о коробке"
            className="chest-info-button"
            onClick={() => setIsInfoOpen((isOpen) => !isOpen)}
            type="button"
          >
            <Typography as="span" variant="body" aria-hidden="true">i</Typography>
          </button>
          {isInfoOpen ? (
            <div className="chest-info-popover" role="dialog" aria-label="Как открыть коробку">
              <button
                aria-label="Закрыть информацию"
                className="info-close"
                onClick={() => setIsInfoOpen(false)}
                type="button"
              >
                <Typography as="span" variant="body" aria-hidden="true">×</Typography>
              </button>
              <Typography as="strong" variant="emphasis" className="info-title">
                Коробка награды
              </Typography>
              <Typography as="span" variant="bodySm" className="info-copy">
                Открой коробку движением по экрану.
              </Typography>
              <Typography as="strong" variant="bodyXs" className="chest-drop-rates-title">
                Шансы выпадения
              </Typography>
              <ul className="chest-drop-rates" aria-label="Шансы выпадения предметов">
                {(Object.keys(rarityLabels) as ItemRarity[]).map((rarity) => (
                  <li className={`item-rarity-${rarity}`} key={rarity}>
                    <Typography as="span" variant="bodyXs">{rarityLabels[rarity]}</Typography>
                    <Typography as="strong" variant="bodyXs">
                      {ITEM_DROP_RATES[rarity] * 100}%
                    </Typography>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <nav className="profile-tabs" aria-label="Разделы профиля">
        {profileTabs.map((item) => (
          <button
            aria-current={item.id === tab ? 'page' : undefined}
            className={`profile-tab ${item.id === tab ? 'profile-tab-active' : ''}`}
            key={item.id}
            onClick={() => changeTab(item.id)}
            type="button"
          >
            <Typography as="span" variant="bodySmMedium">{item.label}</Typography>
          </button>
        ))}
      </nav>

      {tab === 'quests' ? (
        <>
          {demoState === null ? (
            <section className="demo-panel">
              <Typography as="p" variant="bodySm" className="demo-empty">Подбираем задание…</Typography>
            </section>
          ) : (
            <DemoQuestSection demo={demo} state={demoState} />
          )}

          <section className="profile-tasks" aria-labelledby="tasks-title">
            <div className="tasks-heading-row">
              <div>
                <Typography as="h2" variant="h2" className="section-title" id="tasks-title">
                  Задания недели
                </Typography>
              </div>
              <Typography as="span" variant="bodyXs" className="week-badge">7 дней</Typography>
            </div>

            <div className="tasks-list">
              {tasks.map((task) => (
                <article className="task-card" key={task.description}>
                  <div
                    className={`task-brand task-brand-${task.brandClass}`}
                    aria-label={`Бренд ${task.brand}`}
                  >
                    <img alt="" src={task.brandLogo} />
                  </div>
                  <div className="task-copy">
                    <Typography as="span" variant="bodySmMedium" className="task-description">
                      {task.description}
                    </Typography>
                    <Typography as="span" variant="bodyXs" className="task-progress">
                      {task.progress}
                    </Typography>
                  </div>
                  <div className="task-reward" aria-label="Награда: одна коробка Пятёрочки">
                    <img alt="" src="/assets/pyaterochka-cardboard-chest.webp" />
                    <Typography as="span" variant="bodyXs" className="reward-count">×1</Typography>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {tab === 'collection' ? (
        <>
          {coupon === null ? null : (
            <section className="profile-section equipment-section" aria-label="Активная скидка">
              <div className="demo-coupon-live">
                <Typography as="span" variant="body" className="demo-coupon-percent">
                  {coupon.percent}%
                </Typography>
                <div>
                  <Typography as="span" variant="bodyXs" className="demo-coupon-copy">
                    Активная скидка {coupon.percent}%, максимум {formatRubles(coupon.max_kopecks)}.
                    Новый набор можно собрать после погашения.
                  </Typography>
                  <div className="demo-actions demo-coupon-actions">
                    <button
                      className="demo-button"
                      onClick={() => setDiscountOverlayMode('barcode')}
                      type="button"
                    >
                      <Typography as="span" variant="control">Показать штрихкод</Typography>
                    </button>
                    <button
                      className="demo-button"
                      disabled={demo.isBusy}
                      onClick={redeemCoupon}
                      type="button"
                    >
                      <Typography as="span" variant="control">Погасить (демо)</Typography>
                    </button>
                  </div>
                  <Typography as="span" variant="bodyXs" className="demo-block-hint">
                    Погашение считается по корзине {formatRubles(DEMO_BASKET_HINT_KOPECKS)}.
                  </Typography>
                </div>
              </div>
            </section>
          )}

          <ProfileInventoryCrafting
            craftingDisabled={coupon !== null}
            inventory={inventory}
            onCraft={createProfileDiscount}
          />
        </>
      ) : null}

      {tab === 'friends' && demoState !== null ? (
        <section className="demo-panel">
          <DemoSocialSection state={demoState} referralIssued={demo.referralIssued} />
        </section>
      ) : null}

      <div className="profile-stand-row">
        <button className="demo-stand-entry" onClick={() => setOpenPanel('stand')} type="button">
          <Typography as="span" variant="bodyXs">Демо-стенд</Typography>
        </button>
      </div>

      {openPanel === 'stand' && demoState !== null ? (
        <DemoStandPanel
          state={demoState}
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

      {openPanel === 'x5' && demoState !== null && demo.store !== null ? (
        <div className="demo-x5-overlay">
          <DemoEvaluationPanel
            state={demoState}
            store={demo.store}
            onClose={() => setOpenPanel('stand')}
          />
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

      {isTradeOpen && demo.store !== null ? (
        <div className="profile-trade-overlay">
          <DemoTradePanel
            key={`trade-${demoState?.profile.profile_id ?? 'loading'}`}
            store={demo.store}
            isBusy={demo.isBusy}
            note={demo.tradeNote}
            onClose={() => setIsTradeOpen(false)}
            onCreate={demo.createTrade}
            onRespond={demo.respondTrade}
          />
        </div>
      ) : null}

      {activeDiscount !== null && discountOverlayMode !== null ? (
        <ProfileDiscountOverlay
          discount={activeDiscount}
          mode={discountOverlayMode}
          onClose={() => setDiscountOverlayMode(null)}
          onShowBarcode={() => setDiscountOverlayMode('barcode')}
        />
      ) : null}

      {openingStage !== 'closed' ? (
        <div className="chest-opening-overlay" role="dialog" aria-modal="true" aria-label="Открытие коробки">
          <div className={`chest-opening-scene chest-opening-scene-${openingStage}`}>
            <Typography as="h2" variant="h2" className="opening-title">
              {openingStage === 'shaking'
                ? 'Потрясите коробку'
                : openingStage === 'opening'
                  ? 'Открываем коробку…'
                  : 'Вам выпал предмет!'}
            </Typography>

            {openingStage === 'shaking' ? (
              <Typography as="span" variant="bodySm" className="shake-instruction">
                Зажмите коробку и быстро водите ей из стороны в сторону
              </Typography>
            ) : null}

            <button
              aria-label="Трясти коробку"
              className="opening-chest"
              disabled={openingStage !== 'shaking'}
              onPointerCancel={stopShaking}
              onPointerDown={startShaking}
              onPointerMove={continueShaking}
              onPointerUp={stopShaking}
              style={{
                '--shake-x': `${shakeOffset.x}px`,
                '--shake-y': `${shakeOffset.y}px`,
              } as CSSProperties}
              type="button"
            >
              <img
                className="opening-chest-image"
                src="/assets/pyaterochka-cardboard-chest.webp"
                alt=""
              />
            </button>

            {openingStage === 'reward' && rewardItem !== null ? (
              <div className="revealed-reward">
                <div
                  aria-label={`Получен предмет: ${rewardItem.name}`}
                  className={`revealed-reward-item item-rarity-${rewardItem.rarity}`}
                >
                  <img alt={rewardItem.name} src={rewardItem.iconSrc} />
                  <Typography as="span" variant="bodyXs" className="reward-rarity">
                    {rarityLabels[rewardItem.rarity]}
                  </Typography>
                  <Typography as="strong" variant="bodySmMedium" className="reward-item-name">
                    {rewardItem.name}
                  </Typography>
                  <Typography as="span" variant="bodyXs" className="reward-item-category">
                    {rewardItem.category}
                  </Typography>
                </div>
                <button
                  className="collect-reward-button"
                  onClick={() => { setOpeningStage('closed'); setTab('collection') }}
                  type="button"
                >
                  <Typography as="span" variant="control">Забрать</Typography>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  )
}

function useChestCountdown() {
  useEffect(() => {
    window.localStorage.setItem(
      COUNTDOWN_STORAGE_KEY,
      serializeChestCycle({ status: 'openable' }),
    )
  }, [])

  const claimReward = useCallback(() => {
    window.localStorage.setItem(
      COUNTDOWN_STORAGE_KEY,
      serializeChestCycle({ status: 'openable' }),
    )
  }, [])

  return {
    claimReward,
    countdown: 'Готова',
    isOpenable: true,
  }
}
