import { useEffect, useState } from 'react'
import { Typography } from '@/components/typography'
import type { DemoTradeCreate, DemoTradeRespond } from '@pyaterochka-game-demo/contracts'
import type { DemoStore } from './demo-store'
import { availableDemoInventory } from './demo-state'
import { completedTradesInWindow, confirmedTradePurchaseDays } from './demo-trades'
import { profileItems } from './profile-items'

const itemName = (id: string) => profileItems.find((item) => item.id === id)?.name ?? id
const rarity = (id: string) => profileItems.find((item) => item.id === id)?.rarity

export function DemoTradePanel({ store, isBusy, note, onCreate, onRespond }: {
  store: DemoStore
  isBusy: boolean
  note: string | null
  onCreate: (command: DemoTradeCreate) => void
  onRespond: (command: DemoTradeRespond) => void
}) {
  const [recipient, setRecipient] = useState('')
  const [offered, setOffered] = useState('')
  const [requested, setRequested] = useState('')
  const [nowMs, setNowMs] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const actor = store.profiles[store.active_profile_id]
  const peers = Object.values(store.profiles).filter((state) => state.profile.profile_id !== store.active_profile_id)
  const receiver = peers.find((state) => state.profile.profile_id === recipient)
    ?? peers.find((state) => availableDemoInventory(state).some((entry) => entry.quantity >= 2)) ?? peers[0]
  const outgoing = availableDemoInventory(actor).filter((entry) => entry.quantity >= 2)
  const give = outgoing.find((entry) => entry.item_id === offered)?.item_id ?? outgoing[0]?.item_id ?? ''
  const incoming = receiver === undefined ? [] : availableDemoInventory(receiver)
    .filter((entry) => entry.quantity >= 2 && rarity(entry.item_id) === rarity(give) && entry.item_id !== give)
  const take = incoming.find((entry) => entry.item_id === requested)?.item_id ?? incoming[0]?.item_id ?? ''
  const trades = store.trades.filter((trade) => trade.sender_profile_id === store.active_profile_id || trade.receiver_profile_id === store.active_profile_id).slice().reverse()

  return (
    <section className="demo-trades" aria-label="Обмен дубликатами">
      <Typography as="h3" variant="h2" className="section-title">Обмен дубликатами</Typography>
      <Typography as="p" variant="bodyXs" className="section-hint">
        Аня и Борис — подготовленные профили с дубликатами и двумя покупочными днями.
        Одна копия за одну копию той же редкости; обе резервируются на 24 часа. Создание подтверждает ваше согласие.
      </Typography>
      <Typography as="p" variant="bodyXs">
        Покупочных дней: {confirmedTradePurchaseDays(actor.profile, nowMs)}. Завершённых обменов за последние 7 дней: {completedTradesInWindow(store, store.active_profile_id, nowMs)} из 3.
      </Typography>
      <div className="demo-trade-form">
        <label><Typography as="span" variant="bodyXs">Кому предложить обмен</Typography>
          <select disabled={isBusy} value={receiver?.profile.profile_id ?? ''} onChange={(event) => { setRecipient(event.target.value); setRequested('') }}>
            {peers.map((peer) => <option key={peer.profile.profile_id} value={peer.profile.profile_id}>{peer.profile.label}</option>)}
          </select>
        </label>
        <label><Typography as="span" variant="bodyXs">Отдаю дубликат</Typography>
          <select disabled={isBusy || outgoing.length === 0} value={give} onChange={(event) => { setOffered(event.target.value); setRequested('') }}>
            {outgoing.length === 0 ? <option value="">Свободных дубликатов нет</option> : outgoing.map((item) => <option key={item.item_id} value={item.item_id}>{itemName(item.item_id)}</option>)}
          </select>
        </label>
        <label><Typography as="span" variant="bodyXs">Хочу получить</Typography>
          <select disabled={isBusy || incoming.length === 0} value={take} onChange={(event) => setRequested(event.target.value)}>
            {incoming.length === 0 ? <option value="">Подходящего дубликата нет</option> : incoming.map((item) => <option key={item.item_id} value={item.item_id}>{itemName(item.item_id)}</option>)}
          </select>
        </label>
      </div>
      <button className="demo-button demo-button-primary" disabled={isBusy || !give || !take || receiver === undefined}
        onClick={() => onCreate({ trade_id: `trade-${crypto.randomUUID()}`, actor_profile_id: store.active_profile_id,
          receiver_profile_id: receiver.profile.profile_id, offered_item_id: give, requested_item_id: take, expected_store_revision: store.store_revision })} type="button">
        <Typography as="span" variant="control">Предложить обмен</Typography>
      </button>
      {note === null ? null : <Typography as="p" variant="bodyXs" aria-live="polite">{note}</Typography>}
      {trades.map((trade) => (
        <article className="demo-card" aria-label={`Предложение обмена ${trade.trade_id}`} key={trade.trade_id}>
          <Typography as="strong" variant="emphasis">{itemName(trade.offered_item_id)} ↔ {itemName(trade.requested_item_id)}</Typography>
          <Typography as="p" variant="bodyXs">{store.profiles[trade.sender_profile_id]?.profile.label} → {store.profiles[trade.receiver_profile_id]?.profile.label}</Typography>
          <Typography as="p" variant="bodyXs">
            {trade.status === 'pending' ? `Ожидает подтверждения до ${new Date(trade.expires_at_ms).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК`
              : trade.status === 'accepted' ? 'Обмен завершён'
                : trade.status === 'rejected' ? 'Обмен отклонён'
                  : trade.status === 'expired' ? 'Время предложения истекло' : 'Предложение отменено при сбросе демо'}
          </Typography>
          {trade.status === 'pending' && trade.receiver_profile_id === store.active_profile_id ? (
            <div className="demo-actions">
              {(['accept', 'reject'] as const).map((action) => <button className="demo-button" disabled={isBusy} key={action}
                onClick={() => onRespond({ trade_id: trade.trade_id, actor_profile_id: store.active_profile_id, action, expected_store_revision: store.store_revision, expected_trade_revision: trade.revision })} type="button">
                <Typography as="span" variant="control">{action === 'accept' ? 'Принять обмен' : 'Отклонить обмен'}</Typography>
              </button>)}
            </div>
          ) : null}
        </article>
      ))}
    </section>
  )
}
