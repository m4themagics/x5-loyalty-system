import { Typography } from '@/components/typography'
import type { DemoProfileSnapshot } from '@pyaterochka-game-demo/contracts'

import { DEMO_RECEIPT_LABELS, type DemoReceiptKind } from './demo-receipt'
import type { DemoState } from './demo-state'

const RECEIPT_KINDS: readonly DemoReceiptKind[] = [
  'qualifying',
  'free_line',
  'wrong_category',
  'late',
  'returned',
]

/**
 * Служебная сцена демонстрации. Всё, чего нет в интерфейсе покупателя — подмена профиля,
 * тестовый чек вместо кассы, сброс и диагностика решения — живёт только здесь.
 */
export function DemoStandPanel({
  state,
  profiles,
  isBusy,
  eventLog,
  onSelectProfile,
  onSendReceipt,
  onRecompute,
  onReset,
  onOpenX5,
  onClose,
}: {
  state: DemoState
  profiles: readonly DemoProfileSnapshot[]
  isBusy: boolean
  eventLog: string | null
  onSelectProfile: (profileId: string) => void
  onSendReceipt: (kind: DemoReceiptKind, replay: boolean) => void
  onRecompute: () => void
  onReset: () => void
  onOpenX5: () => void
  onClose: () => void
}) {
  const challenge = state.challenge

  return (
    <div className="demo-x5-overlay">
      <section className="demo-evaluation demo-stand" aria-label="Демо-стенд">
        <div className="demo-x5-head">
          <span className="demo-x5-grabber" aria-hidden="true" />
          <Typography as="h3" variant="h2" className="demo-x5-title">
            Демо-стенд
          </Typography>
          <button className="demo-x5-close" onClick={onClose} type="button" aria-label="Закрыть демо-стенд">
            <Typography as="span" variant="body" aria-hidden="true">×</Typography>
          </button>
        </div>

        <Typography as="p" variant="bodyXs" className="demo-x5-note">
          Этих элементов нет в интерфейсе покупателя. Они подменяют синтетический профиль
          и подставляют тестовый чек вместо кассы.
        </Typography>

        <div className="demo-x5-card">
          <Typography as="span" variant="bodyXs" className="demo-x5-eyebrow">
            Синтетический профиль
          </Typography>
          <div className="demo-chip-row" role="group" aria-label="Синтетический профиль">
            {profiles.map((profile) => (
              <button
                aria-pressed={profile.profile_id === state.profile.profile_id}
                className="demo-chip"
                disabled={isBusy}
                key={profile.profile_id}
                onClick={() => onSelectProfile(profile.profile_id)}
                type="button"
              >
                <Typography as="span" variant="bodyXs">{profile.label}</Typography>
              </button>
            ))}
          </div>
        </div>

        {challenge === null ? null : (
          <div className="demo-x5-card">
            <Typography as="span" variant="bodyXs" className="demo-x5-eyebrow">
              Тестовый чек
            </Typography>
            <div className="demo-chip-row" role="group" aria-label="Тестовые чеки">
              {RECEIPT_KINDS.map((kind) => (
                <button
                  className="demo-button"
                  disabled={isBusy}
                  key={kind}
                  onClick={() => onSendReceipt(kind, false)}
                  type="button"
                >
                  <Typography as="span" variant="bodyXs">{DEMO_RECEIPT_LABELS[kind]}</Typography>
                </button>
              ))}
              <button
                className="demo-button"
                disabled={isBusy || state.last_receipt?.challenge_id !== challenge.challenge_id}
                onClick={() => onSendReceipt('qualifying', true)}
                type="button"
              >
                <Typography as="span" variant="bodyXs">Тот же чек ещё раз</Typography>
              </button>
            </div>
            {eventLog === null ? null : (
              <Typography as="p" variant="bodyXs" className="demo-stand-log">
                {eventLog}
              </Typography>
            )}
          </div>
        )}

        <div className="demo-x5-card">
          <Typography as="span" variant="bodyXs" className="demo-x5-eyebrow">
            Управление демонстрацией
          </Typography>
          <div className="demo-chip-row">
            <button className="demo-button" disabled={isBusy} onClick={onRecompute} type="button">
              <Typography as="span" variant="bodyXs">Пересчитать задание</Typography>
            </button>
            <button className="demo-button" disabled={isBusy} onClick={onReset} type="button">
              <Typography as="span" variant="bodyXs">Полный сброс демо</Typography>
            </button>
          </div>
          <button className="demo-button demo-button-primary demo-button-block" onClick={onOpenX5} type="button">
            <Typography as="span" variant="bodyXs">Для X5</Typography>
          </button>
        </div>

        {state.decision === null ? null : (
          <details className="demo-diagnostics">
            <summary><Typography as="span" variant="bodyXs">Диагностика решения</Typography></summary>
            <dl className="demo-metrics demo-metrics-wide">
              <StandTerm label="Решение" value={state.decision.decision_id} />
              <StandTerm label="Причины" value={state.decision.reason_codes.join(', ')} />
              <StandTerm label="Источник карточки" value={state.decision.card_source ?? '—'} />
              <StandTerm label="LLM" value={state.decision.llm_error ?? 'ответ модели принят'} />
              <StandTerm label="Купонный фонд" value={formatRubles(state.decision.coupon_available_kopecks)} />
              <StandTerm label="Товарный фонд" value={formatRubles(state.decision.physical_available_kopecks)} />
              {state.challenge === null ? null : (
                <StandTerm
                  label="Резерв под задание"
                  value={`${formatRubles(state.challenge.reservation.coupon_reserve_kopecks)} / ${formatRubles(state.challenge.reservation.physical_reserve_kopecks)}`}
                />
              )}
            </dl>
          </details>
        )}
      </section>
    </div>
  )
}

function StandTerm({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt><Typography as="span" variant="bodyXs">{label}</Typography></dt>
      <dd><Typography as="span" variant="bodyXs">{value}</Typography></dd>
    </div>
  )
}

function formatRubles(kopecks: number): string {
  return `${(kopecks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
}
