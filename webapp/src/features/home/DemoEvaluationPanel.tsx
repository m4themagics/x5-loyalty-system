import { useEffect, useState } from 'react'
import { Typography } from '@/components/typography'
import { fetchDemoEvaluation } from './demo-api'
import type { DemoState } from './demo-state'
import type { DemoStore } from './demo-store'

const rubles = (kopecks: number | null) => kopecks === null ? 'Not defined' : `RUB ${(kopecks / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const count = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 })

export function DemoEvaluationPanel({ state, store, onClose }: {
  state: DemoState
  store: DemoStore
  onClose: () => void
}) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchDemoEvaluation>> | null>(null)
  useEffect(() => {
    let cancelled = false
    void fetchDemoEvaluation().then((response) => { if (!cancelled) setResult(response) })
    return () => { cancelled = true }
  }, [])
  const primary = result?.ok === true ? result.data.primary : null
  const economics = state.challenge?.economics
  const campaign = store.ads.campaigns.find((entry) => entry.campaign_id === economics?.campaign_id)
  const billing = [...store.ads.billings].reverse().find((entry) =>
    entry.profile_id === state.profile.profile_id
    && entry.campaign_id === economics?.campaign_id
    && entry.challenge_id === state.challenge?.challenge_id
  )
  const exposure = store.ads.exposures.find((entry) =>
    entry.profile_id === state.profile.profile_id
    && entry.campaign_id === economics?.campaign_id
    && entry.decision_id === state.decision?.decision_id,
  )
  const latestExposureMs = store.ads.exposures.reduce(
    (latest, entry) => Math.max(latest, entry.shown_at_ms),
    0,
  )
  const frequency14d = economics?.campaign_id === null || economics?.campaign_id === undefined
    ? 0
    : store.ads.exposures.filter((entry) =>
        entry.profile_id === state.profile.profile_id
        && entry.campaign_id === economics.campaign_id
        && entry.shown_at_ms > latestExposureMs - 14 * 86_400_000,
      ).length

  return (
    <section className="demo-evaluation" aria-label="For X5">
      <div className="demo-x5-head">
        <span className="demo-x5-grabber" aria-hidden="true" />
        <Typography as="h3" variant="h2" className="demo-x5-title">
          For X5: economics and decision
        </Typography>
        <button className="demo-x5-close" onClick={onClose} type="button" aria-label="Close the X5 panel">
          <Typography as="span" variant="body" aria-hidden="true">×</Typography>
        </button>
      </div>

      <Typography as="p" variant="bodyXs" className="demo-x5-note">
        Synthetic evaluation under the current parameters: coupon capped at RUB 10, reserve RUB 2.50.
        The simulator does not model login-day boxes. Results describe X5 across a cohort of
        1,000 users, not the reward of a single customer.
      </Typography>

      <div className="demo-x5-card">
        {primary === null ? (
          <Typography as="p" variant="bodySm" role={result?.ok === false ? 'alert' : undefined}>
            {result === null ? 'Loading evaluation results…' : result.ok === false ? result.error.message : 'No result'}
          </Typography>
        ) : (
          <>
            <div>
              <Typography as="span" variant="bodyXs" className="demo-x5-eyebrow">
                Evaluated policy
              </Typography>
              <Typography as="strong" variant="emphasis" className="demo-x5-policy">
                {primary.policy === 'sponsored_onboarding' ? 'Funded first gift' : 'Limited-issuance scenario'}
              </Typography>
            </div>

            <div className="demo-x5-headline">
              <Typography as="span" variant="bodyXs" className="demo-x5-headline-label">
                X5 net over 1,000 users after reserves
              </Typography>
              <Typography as="span" variant="body" className="demo-x5-headline-value">
                {rubles(primary.mean_conservative_net_kopecks)}
              </Typography>
            </div>

            <Typography as="p" variant="bodyXs" className="demo-x5-note">
              The policy was evaluated in simulation across {primary.seed_count} seeds.
            </Typography>

            <dl className="demo-metrics">
              <Metric label="Positive X5 net after reserves" value={`${primary.conservative_positive_net_seeds} of ${primary.seed_count} seeds`} />
              <Metric label="Range after reserves" value={`${rubles(primary.conservative_net_range_kopecks[0])} … ${rubles(primary.conservative_net_range_kopecks[1])}`} />
              <Metric label="X5 cash net over 4 weeks" value={rubles(primary.mean_net_kopecks)} />
              <Metric label="Mean coverage" value={`${count(primary.mean_coverage * 100)}%`} />
              <Metric label="Incremental purchase days" value={count(primary.mean_incremental_purchase_days)} />
              <Metric label="Break-even CPA with reserves" value={rubles(primary.conservative_break_even_cpa_kopecks)} />
              <Metric label="Actual CPA of the scenario" value={rubles(primary.actual_cpa_kopecks)} />
            </dl>

            <details className="demo-diagnostics">
              <summary><Typography as="span" variant="bodyXs">Robustness check</Typography></summary>
              <Typography as="p" variant="bodyXs" className="demo-x5-note">
                Simulated policy: {primary.policy}. Cash-net range: {rubles(primary.net_range_kopecks[0])} … {rubles(primary.net_range_kopecks[1])}.
              </Typography>
              <Typography as="p" variant="bodyXs" className="demo-x5-note">
                Break-even CPA on the four-week cash net alone: {rubles(primary.break_even_cpa_kopecks)}.
              </Typography>
              <div className="demo-x5-stability">
                {result?.ok === true ? result.data.stability.map((row) => (
                  <div className="demo-x5-stability-row" key={`${row.policy}-${row.label}`}>
                    <Typography as="strong" variant="bodySmMedium">{row.label} · {row.policy}</Typography>
                    <Typography as="p" variant="bodyXs">
                      X5 net {rubles(row.net_kopecks)}; coverage {count(row.coverage * 100)}%; incremental purchase days {count(row.incremental_purchase_days)}.
                    </Typography>
                  </div>
                )) : null}
              </div>
            </details>
          </>
        )}

        {result?.ok === true ? (
          <details className="demo-diagnostics">
            <summary><Typography as="span" variant="bodyXs">Learned RecSys: offline check</Typography></summary>
            <Typography as="p" variant="bodyXs" className="demo-x5-note">
              Two logistic regressions for treatment/control, isotonic calibration and a separate
              billable-event model. Evaluated on randomized synthetic logs; live serving still uses transparent rules.
            </Typography>
            <dl className="demo-metrics">
              <Metric label="Learned RecSys, held-out" value={rubles(result.data.learned_recsys.heldout_learned_net_kopecks)} />
              <Metric label="Rules baseline, held-out" value={rubles(result.data.learned_recsys.heldout_rules_net_kopecks)} />
              <Metric label="Fixed challenge, held-out" value={rubles(result.data.learned_recsys.heldout_fixed_net_kopecks)} />
              <Metric label="Learned robustness" value={`${result.data.learned_recsys.learned_positive_seeds}/${result.data.learned_recsys.seed_count} positive; ${result.data.learned_recsys.learned_beats_rules_seeds}/${result.data.learned_recsys.seed_count} above rules`} />
              <Metric label="Uplift RMSE / billable AUC" value={`${count(result.data.learned_recsys.uplift_rmse)} / ${count(result.data.learned_recsys.billable_auc)}`} />
            </dl>
          </details>
        ) : null}
      </div>

      <div className="demo-x5-card">
        <Typography as="h3" variant="h2" className="demo-block-title">Current offer to the customer</Typography>
        <dl className="demo-metrics">
          <Metric label="Decision" value={state.decision?.status ?? 'No challenge selected yet'} />
          <Metric label="Selection / refusal reasons" value={state.decision?.reason_codes.join(', ') ?? '—'} />
          <Metric label="Funding source" value={economics?.funding_source === 'advertiser' ? `Brand ${economics.advertiser_id ?? ''}` : economics?.funding_source === 'own_margin' ? 'Expected incremental X5 margin' : '—'} />
          <Metric label="Expected incremental margin" value={economics === undefined ? '—' : rubles(economics.expected_incremental_margin_kopecks)} />
          <Metric label="Uncovered reward cost" value={economics === undefined ? '—' : rubles(economics.uncovered_reward_cost_kopecks)} />
          <Metric label="Bid per event / subsidy" value={economics === undefined ? '—' : `${rubles(economics.bid_per_qualified_event_kopecks)} / ${rubles(economics.subsidy_kopecks)}`} />
          <Metric
            label="Ads campaign"
            value={state.challenge === null
              ? state.decision?.status === 'no_action' ? 'No active challenge' : 'No challenge selected yet'
              : economics?.campaign_id ?? 'Organic challenge'}
          />
          <Metric label="CPA charged" value={billing === undefined ? 'RUB 0' : rubles(billing.amount_kopecks)} />
          <Metric label="Available campaign budget" value={campaign === undefined ? '—' : rubles(campaign.remaining_budget_kopecks - campaign.reserved_kopecks)} />
          <Metric label="Campaign reserve / exposure status" value={economics === undefined || economics.auction_type === 'organic' ? '—' : `${rubles(economics.campaign_reserve_kopecks)} / ${exposure?.status ?? 'no exposure recorded'}`} />
          <Metric label="Impressions in 14 days" value={campaign === undefined ? '—' : `${frequency14d} of ${campaign.frequency_cap_14d}`} />
          <Metric label="Reserve for the current challenge" value={state.challenge === null ? '—' : `${rubles(state.challenge.reservation.coupon_reserve_kopecks)} / ${rubles(state.challenge.reservation.physical_reserve_kopecks)}`} />
          <Metric label="Ads auction" value={economics === undefined ? '—' : economics.auction_type === 'quality_adjusted_first_price_cpa' ? `quality-adjusted first-price; quality ${count(economics.quality_score)}, pacing ${count(economics.pacing_multiplier)}` : 'organic delivery'} />
          <Metric label="Ads competition" value={economics === undefined || economics.auction_type === 'organic' ? '—' : `${economics.auction_candidate_count} campaigns, ${economics.auction_eligible_count} passed the filters; ${economics.winner_was_highest_bid ? 'the highest bid won' : `a ${rubles(economics.highest_candidate_bid_kopecks)} bid lost on quality and economics`}`} />
          <Metric label="Coupon / product reserves" value={`${rubles(state.budget.coupon_reserved_kopecks)} / ${rubles(state.budget.physical_reserved_kopecks)}`} />
          <Metric label="Risk of the last receipt" value={state.last_risk === null ? 'No receipt checked yet' : `${state.last_risk.decision}, score ${count(state.last_risk.score)}; ${state.last_risk.signals.join(', ') || 'no signals'}`} />
          <Metric label="Card source" value={state.card?.source ?? '—'} />
          <Metric label="LLM check" value={state.decision?.llm_error ?? (state.card?.source === 'llm' ? 'Model response accepted' : 'Model was not called')} />
        </dl>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt><Typography as="span" variant="bodyXs">{label}</Typography></dt><dd><Typography as="span" variant="bodyXs">{value}</Typography></dd></div>
}
