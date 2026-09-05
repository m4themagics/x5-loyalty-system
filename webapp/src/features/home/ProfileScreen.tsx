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
import { drawProfileItem } from './profile-item-drop'
import {
  addInventoryItem,
  consumeInventoryItems,
  resolveInventory,
  serializeInventory,
} from './profile-inventory'
import { type ItemRarity, type ProfileItem } from './profile-items'
import { serializeChestCycle } from './profile-countdown'
import {
  craftDiscount,
  type CraftedDiscount,
  resolveCraftedDiscount,
  serializeCraftedDiscount,
} from './profile-discount-crafting'
import {
  ActiveDiscountBadge,
  ProfileDiscountOverlay,
} from './ProfileDiscount'
import { ProfileInventoryCrafting } from './ProfileInventoryCrafting'

import './profile-screen.css'

const COUNTDOWN_STORAGE_KEY = 'pyaterochka_profile_chest_deadline'
const INVENTORY_STORAGE_KEY = 'pyaterochka_profile_inventory'
const ACTIVE_DISCOUNT_STORAGE_KEY = 'pyaterochka_profile_active_discount'

const rarityLabels: Record<ItemRarity, string> = {
  common: 'Обычный',
  epic: 'Эпический',
  legendary: 'Легендарный',
}

const tasks = [
  {
    brand: 'D',
    brandClass: 'dobry',
    description: 'Купите 5 напитков «Добрый»',
    progress: '2 из 5',
  },
  {
    brand: 'Р',
    brandClass: 'restoria',
    description: 'Купите 3 готовых блюда «Рестория»',
    progress: '1 из 3',
  },
  {
    brand: 'GV',
    brandClass: 'global-village',
    description: 'Купите овощи или фрукты 3 раза',
    progress: '2 из 3',
  },
  {
    brand: 'М',
    brandClass: 'milk',
    description: 'Купите молочные продукты 2 раза',
    progress: '0 из 2',
  },
] as const

export function ProfileScreen() {
  const { claimReward, countdown, isOpenable } = useChestCountdown()
  const { addReceivedItem, consumeReceivedItems, inventory } = useProfileInventory()
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
  const [shakeOffset, setShakeOffset] = useState({ x: 0, y: 0 })
  const lastPointerRef = useRef<PointerPoint | null>(null)
  const shakeDistanceRef = useRef(0)

  useEffect(() => {
    if (openingStage !== 'opening') return

    const revealTimer = window.setTimeout(() => {
      const nextReward = drawProfileItem()
      addReceivedItem(nextReward.id)
      claimReward()
      setRewardItem(nextReward)
      setOpeningStage('reward')
    }, 1_400)

    return () => window.clearTimeout(revealTimer)
  }, [addReceivedItem, claimReward, openingStage])

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

  const createProfileDiscount = useCallback((itemIds: readonly string[]) => {
    const discount = craftDiscount(itemIds)
    consumeReceivedItems(itemIds)
    window.localStorage.setItem(
      ACTIVE_DISCOUNT_STORAGE_KEY,
      serializeCraftedDiscount(discount),
    )
    setActiveDiscount(discount)
    setDiscountOverlayMode('reveal')
  }, [consumeReceivedItems])

  return (
    <main className="profile-screen" aria-label="Профиль">
      <section className="profile-hero">
        <Typography as="h1" variant="h1" className="profile-title">
          Профиль
        </Typography>
        <img
          alt="Игровой персонаж профиля"
          className="profile-character"
          src="/assets/pyaterochka-profile-character.webp"
        />
        {activeDiscount !== null ? (
          <ActiveDiscountBadge
            discount={activeDiscount}
            onClick={() => setDiscountOverlayMode('barcode')}
          />
        ) : null}
      </section>

      <section className="profile-chest-panel" aria-label="Коробка награды">
        <div className="chest-timer">
          <Typography as="span" variant="bodyXs" className="chest-timer-label">
            Демо-режим
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
                Сейчас коробку можно открывать без ограничений. Нажмите на неё, зажмите и потрясите движениями по экрану — после получения предмета коробка сразу станет доступна снова.
              </Typography>
            </div>
          ) : null}
        </div>
      </section>

      <ProfileInventoryCrafting
        inventory={inventory}
        onCraft={createProfileDiscount}
      />

      <section className="profile-tasks" aria-labelledby="tasks-title">
        <div className="tasks-heading-row">
          <div>
            <Typography as="h2" variant="h2" className="section-title" id="tasks-title">
              Задания недели
            </Typography>
            <Typography as="span" variant="bodyXs" className="section-hint">
              Выполняйте задания и получайте коробки
            </Typography>
          </div>
          <Typography as="span" variant="bodyXs" className="week-badge">7 дней</Typography>
        </div>

        <div className="tasks-list">
          {tasks.map((task) => (
            <article className="task-card" key={task.description}>
              <Typography
                as="span"
                variant="body"
                className={`task-brand task-brand-${task.brandClass}`}
                aria-label={`Бренд ${task.brand}`}
              >
                {task.brand}
              </Typography>
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
                className="opening-chest-part opening-chest-base"
                src="/assets/pyaterochka-cardboard-chest.webp"
                alt=""
              />
              <img
                className="opening-chest-part opening-chest-lid"
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
                  onClick={() => setOpeningStage('closed')}
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
    countdown: 'Без лимита',
    isOpenable: true,
  }
}

function useProfileInventory() {
  const [inventory, setInventory] = useState(() => {
    if (typeof window === 'undefined') return []
    return resolveInventory(window.localStorage.getItem(INVENTORY_STORAGE_KEY))
  })

  const addReceivedItem = useCallback((itemId: string) => {
    setInventory((currentInventory) => {
      const nextInventory = addInventoryItem(currentInventory, itemId)
      window.localStorage.setItem(
        INVENTORY_STORAGE_KEY,
        serializeInventory(nextInventory),
      )
      return nextInventory
    })
  }, [])

  const consumeReceivedItems = useCallback((itemIds: readonly string[]) => {
    setInventory((currentInventory) => {
      const nextInventory = consumeInventoryItems(currentInventory, itemIds)
      window.localStorage.setItem(
        INVENTORY_STORAGE_KEY,
        serializeInventory(nextInventory),
      )
      return nextInventory
    })
  }, [])

  return { addReceivedItem, consumeReceivedItems, inventory }
}
