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
 * The operator scene of the demo. Everything the customer interface does not have — profile
 * switching, a test receipt instead of a till, reset and decision diagnostics — lives here.
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
  onAdvanceLoginDay,
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
  onAdvanceLoginDay: () => void
  onOpenX5: () => void
  onClose: () => void
}) {
  const challenge = state.challenge

  return (
    <div className="demo-x5-overlay">
      <section className="demo-evaluation demo-stand" aria-label="Demo stand">
        <div className="demo-x5-head">
          <span className="demo-x5-grabber" aria-hidden="true" />
          <Typography as="h3" variant="h2" className="demo-x5-title">
            Demo stand
          </Typography>
          <button className="demo-x5-close" onClick={onClose} type="button" aria-label="Close the demo stand">
            <Typography as="span" variant="body" aria-hidden="true">×</Typography>
          </button>
        </div>

        <Typography as="p" variant="bodyXs" className="demo-x5-note">
          None of these controls exist in the customer interface. They swap the synthetic
          profile and submit a test receipt in place of a real till.
        </Typography>

        <div className="demo-x5-card">
          <Typography as="span" variant="bodyXs" className="demo-x5-eyebrow">
            Synthetic profile
          </Typography>
          <div className="demo-chip-row" role="group" aria-label="Synthetic profile">
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
              Test receipt
            </Typography>
            <div className="demo-chip-row" role="group" aria-label="Test receipts">
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
                <Typography as="span" variant="bodyXs">Send the same receipt again</Typography>
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
            Demo controls
          </Typography>
          <div className="demo-chip-row">
            <button className="demo-button" disabled={isBusy || state.login_box.days === 3} onClick={onAdvanceLoginDay} type="button">
              <Typography as="span" variant="bodyXs">Next login day (demo)</Typography>
            </button>
            <button className="demo-button" disabled={isBusy} onClick={onRecompute} type="button">
              <Typography as="span" variant="bodyXs">Recompute the challenge</Typography>
            </button>
            <button className="demo-button" disabled={isBusy} onClick={onReset} type="button">
              <Typography as="span" variant="bodyXs">Full demo reset</Typography>
            </button>
          </div>
          <Typography as="p" variant="bodyXs">Login days: {state.login_box.days} of 3. The button changes only the box counter, not receipt or campaign time.</Typography>
          <button className="demo-button demo-button-primary demo-button-block" onClick={onOpenX5} type="button">
            <Typography as="span" variant="bodyXs">For X5</Typography>
          </button>
        </div>

        {state.decision === null ? null : (
          <details className="demo-diagnostics">
            <summary><Typography as="span" variant="bodyXs">Decision diagnostics</Typography></summary>
            <dl className="demo-metrics demo-metrics-wide">
              <StandTerm label="Decision" value={state.decision.decision_id} />
              <StandTerm label="Reasons" value={state.decision.reason_codes.join(', ')} />
              <StandTerm label="Card source" value={state.decision.card_source ?? '—'} />
              <StandTerm label="LLM" value={state.decision.llm_error ?? 'model response accepted'} />
              <StandTerm label="Coupon fund" value={formatRubles(state.decision.coupon_available_kopecks)} />
              <StandTerm label="Product fund" value={formatRubles(state.decision.physical_available_kopecks)} />
              {state.challenge === null ? null : (
                <StandTerm
                  label="Reserve for the challenge"
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
  return `RUB ${(kopecks / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
