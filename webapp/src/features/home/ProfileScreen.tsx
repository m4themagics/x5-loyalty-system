import { Typography } from '@/components/typography'
import { useEffect, useState } from 'react'

import { formatCountdown, resolveCountdownDeadline } from './profile-countdown'

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
  const countdown = useChestCountdown()
  const [isInfoOpen, setIsInfoOpen] = useState(false)

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

        <img
          alt="Коробка Пятёрочки"
          className="profile-chest-image"
          src="/assets/pyaterochka-cardboard-chest.png"
        />

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
                Таймер идёт 24 часа. После его завершения коробку можно открыть и получить персональную скидку.
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
  const [deadline] = useState(() => {
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

  return formatCountdown(remaining)
}
