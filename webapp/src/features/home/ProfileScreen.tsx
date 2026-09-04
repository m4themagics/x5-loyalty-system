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
import {
  formatCountdown,
  resolveCountdownDeadline,
  restartCountdownDeadline,
} from './profile-countdown'

import './profile-screen.css'

const COUNTDOWN_STORAGE_KEY = 'pyaterochka_profile_chest_deadline'

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
  const { countdown, restartCountdown } = useChestCountdown()
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [openingStage, setOpeningStage] = useState<'closed' | 'shaking' | 'opening' | 'reward'>('closed')
  const [shakeOffset, setShakeOffset] = useState({ x: 0, y: 0 })
  const lastPointerRef = useRef<PointerPoint | null>(null)
  const shakeDistanceRef = useRef(0)

  useEffect(() => {
    if (openingStage !== 'opening') return

    const revealTimer = window.setTimeout(() => {
      restartCountdown()
      setOpeningStage('reward')
    }, 1_400)

    return () => window.clearTimeout(revealTimer)
  }, [openingStage, restartCountdown])

  const openChest = () => {
    setIsInfoOpen(false)
    shakeDistanceRef.current = 0
    setShakeOffset({ x: 0, y: 0 })
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

  return (
    <main className="profile-screen" aria-label="Профиль">
      <section className="profile-hero">
        <Typography as="h1" variant="h1" className="profile-title">
          Профиль
        </Typography>
        <img
          alt="Игровой персонаж профиля"
          className="profile-character"
          src="/assets/pyaterochka-profile-character.png"
        />
      </section>

      <section className="profile-chest-panel" aria-label="Коробка награды">
        <div className="chest-timer">
          <Typography as="span" variant="bodyXs" className="chest-timer-label">
            До открытия
          </Typography>
          <Typography as="time" variant="body" className="chest-timer-value">
            {countdown}
          </Typography>
        </div>

        <button
          aria-label="Открыть коробку Пятёрочки"
          className="profile-chest-trigger"
          onClick={openChest}
          type="button"
        >
          <img
            alt=""
            className="profile-chest-image"
            src="/assets/pyaterochka-cardboard-chest.png"
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
                Нажмите на коробку, зажмите её и потрясите движениями по экрану. После открытия вы получите предмет, а таймер запустится заново.
              </Typography>
            </div>
          ) : null}
        </div>
      </section>

      <section className="profile-section equipment-section" aria-labelledby="equipment-title">
        <div className="profile-section-heading">
          <div>
            <Typography as="h2" variant="h2" className="section-title" id="equipment-title">
              Ячейки скидок
            </Typography>
            <Typography as="span" variant="bodyXs" className="section-hint">
              Создавайте скидки и размещайте их в свободных ячейках
            </Typography>
          </div>
          <Typography as="span" variant="bodyXs" className="slots-counter">0/4</Typography>
        </div>
        <EmptySlots count={4} className="equipment-slots" />
        <button className="create-discount-button" type="button">
          <Typography as="span" variant="control" className="create-discount-label">
            Создать скидку
          </Typography>
        </button>
      </section>

      <section className="profile-section inventory-section" aria-labelledby="inventory-title">
        <div className="profile-section-heading">
          <div>
            <Typography as="h2" variant="h2" className="section-title" id="inventory-title">
              Инвентарь
            </Typography>
            <Typography as="span" variant="bodyXs" className="section-hint">
              Здесь появятся полученные предметы и награды
            </Typography>
          </div>
          <Typography as="span" variant="bodyXs" className="slots-counter">0/8</Typography>
        </div>
        <EmptySlots count={8} className="inventory-slots" />
      </section>

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
                <img alt="" src="/assets/pyaterochka-cardboard-chest.png" />
                <Typography as="span" variant="bodyXs" className="reward-count">×1</Typography>
              </div>
            </article>
          ))}
        </div>
      </section>

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
                src="/assets/pyaterochka-cardboard-chest.png"
                alt=""
              />
              <img
                className="opening-chest-part opening-chest-lid"
                src="/assets/pyaterochka-cardboard-chest.png"
                alt=""
              />
            </button>

            {openingStage === 'reward' ? (
              <div className="revealed-reward">
                <div className="gray-square-reward">
                  <Typography as="span" variant="bodySmMedium">
                    Серый квадрат
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

function EmptySlots({ count, className }: { count: number; className: string }) {
  return (
    <Typography
      as="div"
      variant="body"
      className={`empty-slots ${className}`}
      aria-label={`${count} пустых ячеек`}
    >
      {Array.from({ length: count }, (_, index) => (
        <span className="empty-slot" aria-label={`Пустая ячейка ${index + 1}`} key={index} />
      ))}
    </Typography>
  )
}

function useChestCountdown() {
  const [deadline, setDeadline] = useState(() => {
    const now = Date.now()
    const savedDeadline = typeof window === 'undefined'
      ? null
      : window.localStorage.getItem(COUNTDOWN_STORAGE_KEY)
    const resolvedDeadline = resolveCountdownDeadline(savedDeadline, now)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(COUNTDOWN_STORAGE_KEY, String(resolvedDeadline))
    }
    return resolvedDeadline
  })
  const [remaining, setRemaining] = useState(() => deadline - Date.now())

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, deadline - Date.now()))
    const interval = window.setInterval(update, 1_000)
    return () => window.clearInterval(interval)
  }, [deadline])

  const restartCountdown = useCallback(() => {
    const now = Date.now()
    const nextDeadline = restartCountdownDeadline(now)
    window.localStorage.setItem(COUNTDOWN_STORAGE_KEY, String(nextDeadline))
    setDeadline(nextDeadline)
    setRemaining(nextDeadline - now)
  }, [])

  return { countdown: formatCountdown(remaining), restartCountdown }
}
