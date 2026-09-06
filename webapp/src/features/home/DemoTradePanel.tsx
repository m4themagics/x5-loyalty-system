import { useEffect, useState } from 'react'
import { Typography } from '@/components/typography'
import type { DemoTradeCreate, DemoTradeRespond } from '@pyaterochka-game-demo/contracts'

import type { DemoStore } from './demo-store'
import { availableDemoInventory } from './demo-state'
import {
  DEMO_TRADE_FRIEND_PREFIX,
  completedTradesInWindow,
  confirmedTradePurchaseDays,
} from './demo-trades'
import { profileItems } from './profile-items'

const QR_SIZE = 25

const findItem = (id: string) => profileItems.find((item) => item.id === id) ?? null
const itemName = (id: string) => findItem(id)?.name ?? id
const rarity = (id: string) => findItem(id)?.rarity

const tradeStatusLabels = {
  pending: 'Ожидает ответа',
  accepted: 'Обмен завершён',
  rejected: 'Обмен отклонён',
  expired: 'Время истекло',
} as const

export function DemoTradePanel({
  store,
  isBusy,
  note,
  onClose,
  onCreate,
  onRespond,
}: {
  store: DemoStore
  isBusy: boolean
  note: string | null
  onClose: () => void
  onCreate: (command: DemoTradeCreate) => void
  onRespond: (command: DemoTradeRespond) => void
}) {
  const [recipient, setRecipient] = useState('')
  const [offered, setOffered] = useState('')
  const [requested, setRequested] = useState('')
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [isQrVisible, setIsQrVisible] = useState(false)
  const [nowMs, setNowMs] = useState(Date.now)

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const actor = store.profiles[store.active_profile_id]
  const peers = Object.values(store.profiles).filter((state) =>
    state.profile.profile_id !== store.active_profile_id
    && state.profile.profile_id.startsWith(DEMO_TRADE_FRIEND_PREFIX))
  const receiver = peers.find((state) => state.profile.profile_id === recipient)
    ?? peers.find((state) => availableDemoInventory(state).some((entry) => entry.quantity >= 1))
    ?? peers[0]
  const outgoing = availableDemoInventory(actor).filter((entry) => entry.quantity >= 1)
  const give = outgoing.find((entry) => entry.item_id === offered)?.item_id ?? ''
  const incoming = receiver === undefined || give === ''
    ? []
    : availableDemoInventory(receiver).filter((entry) =>
      entry.quantity >= 1
      && rarity(entry.item_id) === rarity(give)
      && entry.item_id !== give)
  const take = isQrVisible
    ? incoming.find((entry) => entry.item_id === requested)?.item_id ?? incoming[0]?.item_id ?? ''
    : ''
  const trades = store.trades
    .filter((trade) =>
      trade.sender_profile_id === store.active_profile_id
      || trade.receiver_profile_id === store.active_profile_id)
    .slice()
    .reverse()
  const giveItem = give === '' ? null : findItem(give)
  const takeItem = take === '' ? null : findItem(take)
  const pairingCode = buildPairingCode(store.active_profile_id, receiver?.profile.profile_id, give)

  const chooseOfferedItem = (itemId: string) => {
    setOffered(itemId)
    setRequested('')
    setIsPickerOpen(false)
    setIsQrVisible(false)
  }

  const showQr = () => {
    if (give === '') return
    setRequested(incoming[0]?.item_id ?? '')
    setIsQrVisible(true)
  }

  const submitTrade = () => {
    if (receiver === undefined || give === '' || take === '') return
    onCreate({
      trade_id: `trade-${crypto.randomUUID()}`,
      actor_profile_id: store.active_profile_id,
      receiver_profile_id: receiver.profile.profile_id,
      offered_item_id: give,
      requested_item_id: take,
      expected_store_revision: store.store_revision,
    })
  }

  return (
    <section
      aria-label="Обмен предметами"
      aria-modal="true"
      className="profile-trade-sheet"
      role="dialog"
    >
      <header className="profile-trade-header">
        <div>
          <Typography as="span" variant="bodyXs" className="profile-trade-eyebrow">
            Обмен 1 на 1
          </Typography>
          <Typography as="h2" variant="h2" className="profile-trade-title">
            Обмен предметами
          </Typography>
        </div>
        <div className="profile-trade-header-actions">
          <button
            aria-expanded={isInfoOpen}
            aria-label="Информация об обмене"
            className={`profile-trade-info-button${isInfoOpen ? ' profile-trade-info-button-active' : ''}`}
            onClick={() => setIsInfoOpen((isOpen) => !isOpen)}
            type="button"
          >
            <Typography as="span" variant="body" aria-hidden="true">i</Typography>
          </button>
          <button
            aria-label="Закрыть обмен"
            className="profile-trade-close"
            onClick={onClose}
            type="button"
          >
            <Typography as="span" variant="body" aria-hidden="true">×</Typography>
          </button>
        </div>
      </header>

      {isInfoOpen ? (
        <aside className="profile-trade-info" aria-label="Правила обмена">
          <Typography as="strong" variant="bodySmMedium" className="profile-trade-info-title">
            Как работает обмен
          </Typography>
          <ul className="profile-trade-info-list">
            <li><Typography as="span" variant="bodyXs">Можно выбрать любой доступный предмет из своей коллекции.</Typography></li>
            <li><Typography as="span" variant="bodyXs">В ответ можно получить предмет только той же редкости.</Typography></li>
            <li><Typography as="span" variant="bodyXs">Оба предмета резервируются и передаются только после подтверждения участников.</Typography></li>
            <li><Typography as="span" variant="bodyXs">Предложение действует 24 часа. Доступно до трёх завершённых обменов за семь дней.</Typography></li>
            <li><Typography as="span" variant="bodyXs">Для участия каждому нужно минимум два подтверждённых дня покупок.</Typography></li>
          </ul>
          <div className="profile-trade-info-stats">
            <Typography as="span" variant="bodyXs">
              Ваши покупочные дни: {confirmedTradePurchaseDays(actor.profile, nowMs)}
            </Typography>
            <Typography as="span" variant="bodyXs">
              Обмены за 7 дней: {completedTradesInWindow(store, store.active_profile_id, nowMs)} из 3
            </Typography>
          </div>
        </aside>
      ) : null}

      <div className="profile-trade-flow">
        <div className="profile-trade-side">
          <Typography as="span" variant="bodySmMedium" className="profile-trade-side-title">
            Ваш предмет
          </Typography>
          <button
            aria-expanded={isPickerOpen}
            aria-label={giveItem === null ? 'Добавить свой предмет для обмена' : `Изменить предмет: ${giveItem.name}`}
            className={`profile-trade-slot discount-slot${giveItem === null ? ' empty-slot profile-trade-slot-empty' : ` filled-slot item-rarity-${giveItem.rarity}`}`}
            disabled={isBusy || outgoing.length === 0}
            onClick={() => setIsPickerOpen((isOpen) => !isOpen)}
            type="button"
          >
            {giveItem === null ? (
              <>
                <Typography as="span" variant="body" className="profile-trade-plus" aria-hidden="true">+</Typography>
                <Typography as="span" variant="bodyXs">
                  {outgoing.length === 0 ? 'Нет доступных предметов' : 'Добавить предмет'}
                </Typography>
              </>
            ) : (
              <>
                <img alt="" src={giveItem.iconSrc} />
                <Typography as="span" variant="bodyXs">{giveItem.name}</Typography>
              </>
            )}
          </button>

          {isPickerOpen ? (
            <div className="profile-trade-picker" role="group" aria-label="Выберите свой предмет">
              {outgoing.map((entry) => {
                const item = findItem(entry.item_id)
                return item === null ? null : (
                  <button
                    aria-label={`Выбрать ${item.name} для обмена`}
                    className={`profile-trade-picker-item item-rarity-${item.rarity}`}
                    key={item.id}
                    onClick={() => chooseOfferedItem(item.id)}
                    type="button"
                  >
                    <img alt="" src={item.iconSrc} />
                    <Typography as="span" variant="bodyXs">{item.name}</Typography>
                    <Typography as="span" variant="bodyXs">×{entry.quantity}</Typography>
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        <button
          aria-label="Показать QR-код для подключения"
          className={`profile-trade-swap${isQrVisible ? ' profile-trade-swap-active' : ''}`}
          disabled={isBusy || give === ''}
          onClick={showQr}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 32 32">
            <path d="M7 10h15l-3.5-3.5M25 22H10l3.5 3.5" />
          </svg>
        </button>

        {isQrVisible ? (
          <div className="profile-trade-qr-card" aria-live="polite">
            <TradeQr value={pairingCode} />
            <div className="profile-trade-qr-copy">
              <Typography as="strong" variant="bodySmMedium">QR для подключения</Typography>
              <Typography as="span" variant="bodyXs">
                В демо выберите участника — его предложение появится в нижней ячейке.
              </Typography>
              <label className="profile-trade-partner-field">
                <Typography as="span" variant="bodyXs">Кому предложить обмен</Typography>
                <select
                  disabled={isBusy}
                  onChange={(event) => {
                    setRecipient(event.target.value)
                    setRequested('')
                  }}
                  value={receiver?.profile.profile_id ?? ''}
                >
                  {peers.map((peer) => (
                    <option key={peer.profile.profile_id} value={peer.profile.profile_id}>
                      {peer.profile.label}
                    </option>
                  ))}
                </select>
              </label>
              <Typography as="code" variant="bodyXs" className="profile-trade-code">
                {pairingCode}
              </Typography>
            </div>
          </div>
        ) : null}

        <div className="profile-trade-side">
          <Typography as="span" variant="bodySmMedium" className="profile-trade-side-title">
            Предмет участника
          </Typography>
          <div
            aria-label={takeItem === null ? 'Предмет другого участника пока не выбран' : `Участник предлагает ${takeItem.name}`}
            className={`profile-trade-slot discount-slot profile-trade-partner-slot${takeItem === null ? ' empty-slot profile-trade-slot-empty' : ` filled-slot item-rarity-${takeItem.rarity}`}`}
          >
            {takeItem === null ? (
              <>
                <Typography as="span" variant="body" className="profile-trade-person" aria-hidden="true">?</Typography>
                <Typography as="span" variant="bodyXs">
                  {isQrVisible ? 'Подходящего предмета нет' : 'Подключите участника'}
                </Typography>
              </>
            ) : (
              <>
                <img alt="" src={takeItem.iconSrc} />
                <Typography as="span" variant="bodyXs">{takeItem.name}</Typography>
              </>
            )}
          </div>

          {isQrVisible && incoming.length > 1 ? (
            <div className="profile-trade-partner-options" role="group" aria-label="Предметы участника">
              {incoming.map((entry) => {
                const item = findItem(entry.item_id)
                return item === null ? null : (
                  <button
                    aria-label={`Получить ${item.name}`}
                    aria-pressed={take === item.id}
                    className={`profile-trade-partner-option item-rarity-${item.rarity}`}
                    key={item.id}
                    onClick={() => setRequested(item.id)}
                    type="button"
                  >
                    <img alt="" src={item.iconSrc} />
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>

      <button
        className="profile-trade-confirm"
        disabled={isBusy || receiver === undefined || give === '' || take === ''}
        onClick={submitTrade}
        type="button"
      >
        <Typography as="span" variant="control">Подтвердить обмен</Typography>
      </button>

      {note === null ? null : (
        <Typography as="p" variant="bodyXs" className="profile-trade-note" aria-live="polite">
          {note}
        </Typography>
      )}

      {trades.map((trade) => (
        <article className="profile-trade-card" aria-label={`Предложение обмена ${trade.trade_id}`} key={trade.trade_id}>
          <div className="profile-trade-card-head">
            <Typography as="strong" variant="bodySmMedium">
              {itemName(trade.offered_item_id)} ⇄ {itemName(trade.requested_item_id)}
            </Typography>
            <Typography as="span" variant="bodyXs" className={`profile-trade-status profile-trade-status-${trade.status}`}>
              {tradeStatusLabels[trade.status as keyof typeof tradeStatusLabels] ?? 'Отменено'}
            </Typography>
          </div>
          <Typography as="p" variant="bodyXs" className="profile-trade-card-copy">
            {store.profiles[trade.sender_profile_id]?.profile.label} → {store.profiles[trade.receiver_profile_id]?.profile.label}
          </Typography>
          {trade.status === 'pending' && trade.receiver_profile_id === store.active_profile_id ? (
            <div className="profile-trade-card-actions">
              <button
                className="profile-trade-card-button profile-trade-card-button-primary"
                disabled={isBusy}
                onClick={() => onRespond({
                  trade_id: trade.trade_id,
                  actor_profile_id: store.active_profile_id,
                  action: 'accept',
                  expected_store_revision: store.store_revision,
                  expected_trade_revision: trade.revision,
                })}
                type="button"
              >
                <Typography as="span" variant="control">Принять обмен</Typography>
              </button>
              <button
                className="profile-trade-card-button"
                disabled={isBusy}
                onClick={() => onRespond({
                  trade_id: trade.trade_id,
                  actor_profile_id: store.active_profile_id,
                  action: 'reject',
                  expected_store_revision: store.store_revision,
                  expected_trade_revision: trade.revision,
                })}
                type="button"
              >
                <Typography as="span" variant="control">Отклонить обмен</Typography>
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  )
}

function TradeQr({ value }: { value: string }) {
  const cells = buildQrCells(value)
  return (
    <svg
      aria-label="QR-код подключения к обмену"
      className="profile-trade-qr"
      role="img"
      viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`}
    >
      <rect width={QR_SIZE} height={QR_SIZE} fill="#fff" />
      {cells.map(([x, y]) => <rect height="1" key={`${x}-${y}`} width="1" x={x} y={y} />)}
    </svg>
  )
}

function buildPairingCode(senderId: string, receiverId: string | undefined, itemId: string) {
  const source = `${senderId}:${receiverId ?? 'guest'}:${itemId}`
  let hash = 0
  for (const character of source) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619)
  return `X5-${Math.abs(hash).toString(36).slice(0, 6).toUpperCase().padStart(6, '0')}`
}

function buildQrCells(value: string): [number, number][] {
  let seed = 2_166_136_261
  for (const character of value) seed = Math.imul(seed ^ character.charCodeAt(0), 16_777_619)
  const cells: [number, number][] = []

  for (let y = 0; y < QR_SIZE; y += 1) {
    for (let x = 0; x < QR_SIZE; x += 1) {
      const finder = finderPixel(x, y, 0, 0)
        ?? finderPixel(x, y, QR_SIZE - 7, 0)
        ?? finderPixel(x, y, 0, QR_SIZE - 7)
      if (finder !== null) {
        if (finder) cells.push([x, y])
        continue
      }
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      if ((seed >>> 0) % 7 < 3) cells.push([x, y])
    }
  }
  return cells
}

function finderPixel(x: number, y: number, left: number, top: number): boolean | null {
  const localX = x - left
  const localY = y - top
  if (localX < 0 || localY < 0 || localX > 6 || localY > 6) return null
  return localX === 0 || localX === 6 || localY === 0 || localY === 6
    || (localX >= 2 && localX <= 4 && localY >= 2 && localY <= 4)
}
