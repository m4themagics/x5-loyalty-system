import { useEffect, useState } from 'react'
import { Typography } from '@/components/typography'
import { fetchDemoEvaluation } from './demo-api'
import type { DemoState } from './demo-state'
import type { DemoStore } from './demo-store'

const rubles = (kopecks: number | null) => kopecks === null ? 'Не определён' : `${(kopecks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`
const count = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

export function DemoEvaluationPanel({ state, store }: { state: DemoState; store: DemoStore }) {
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
    <section className="demo-evaluation" aria-label="Для X5">
      <Typography as="h3" variant="h2" className="section-title">Для X5: экономика и решение</Typography>
      <Typography as="p" variant="bodyXs" className="section-hint">Синтетическая симуляция за четыре недели. Денежные итоги относятся к X5 на всей когорте из 1 000 пользователей, а не к награде одного покупателя.</Typography>
      {primary === null ? <Typography as="p" variant="bodySm" role={result?.ok === false ? 'alert' : undefined}>
        {result === null ? 'Загружаем результаты оценки…' : result.ok === false ? result.error.message : 'Нет результата'}
      </Typography> : (
        <>
          <Typography as="strong" variant="emphasis">{primary.policy === 'sponsored_onboarding' ? 'Финансируемый первый подарок' : 'Сценарий ограниченной выдачи'}</Typography>
          <Typography as="p" variant="bodyXs">Политика оценена в симуляции на {primary.seed_count} seed.</Typography>
          <dl className="demo-terms">
            <Metric label="Итог X5 на 1 000 пользователей после обеспечения" value={rubles(primary.mean_conservative_net_kopecks)} />
            <Metric label="Положительный итог X5 после обеспечения" value={`${primary.conservative_positive_net_seeds} из ${primary.seed_count} seed`} />
            <Metric label="Диапазон после обеспечения" value={`${rubles(primary.conservative_net_range_kopecks[0])} … ${rubles(primary.conservative_net_range_kopecks[1])}`} />
            <Metric label="Денежный итог X5 за 4 недели" value={rubles(primary.mean_net_kopecks)} />
            <Metric label="Средний охват" value={`${count(primary.mean_coverage * 100)}%`} />
            <Metric label="Дополнительные покупочные дни" value={count(primary.mean_incremental_purchase_days)} />
            <Metric label="CPA безубыточности с обеспечением" value={rubles(primary.conservative_break_even_cpa_kopecks)} />
            <Metric label="Фактический CPA сценария" value={rubles(primary.actual_cpa_kopecks)} />
          </dl>
          <details className="demo-diagnostics">
            <summary><Typography as="span" variant="bodyXs">Проверка устойчивости</Typography></summary>
            <Typography as="p" variant="bodyXs">Политика в симуляции: {primary.policy}. Диапазон денежного итога: {rubles(primary.net_range_kopecks[0])} … {rubles(primary.net_range_kopecks[1])}.</Typography>
            <Typography as="p" variant="bodyXs">CPA безубыточности только по денежному итогу 4 недель: {rubles(primary.break_even_cpa_kopecks)}.</Typography>
            {result?.ok === true ? result.data.stability.map((row) => <div className="demo-card" key={`${row.policy}-${row.label}`}>
              <Typography as="strong" variant="bodySmMedium">{row.label} · {row.policy}</Typography>
              <Typography as="p" variant="bodyXs">Итог X5 {rubles(row.net_kopecks)}; охват {count(row.coverage * 100)}%; дополнительные покупочные дни {count(row.incremental_purchase_days)}.</Typography>
            </div>) : null}
          </details>
        </>
      )}
      {result?.ok === true ? (
        <details className="demo-diagnostics">
          <summary><Typography as="span" variant="bodyXs">Обучаемый RecSys: offline-проверка</Typography></summary>
          <Typography as="p" variant="bodyXs">Две logistic regression для treatment/control, isotonic-калибровка и отдельная модель billable event. Оценка на randomized synthetic logs; в live-выдаче пока работают прозрачные rules.</Typography>
          <dl className="demo-terms">
            <Metric label="Learned RecSys, held-out" value={rubles(result.data.learned_recsys.heldout_learned_net_kopecks)} />
            <Metric label="Rules baseline, held-out" value={rubles(result.data.learned_recsys.heldout_rules_net_kopecks)} />
            <Metric label="Фиксированное задание, held-out" value={rubles(result.data.learned_recsys.heldout_fixed_net_kopecks)} />
            <Metric label="Устойчивость learned" value={`${result.data.learned_recsys.learned_positive_seeds}/${result.data.learned_recsys.seed_count} положительных; ${result.data.learned_recsys.learned_beats_rules_seeds}/${result.data.learned_recsys.seed_count} выше rules`} />
            <Metric label="Uplift RMSE / billable AUC" value={`${count(result.data.learned_recsys.uplift_rmse)} / ${count(result.data.learned_recsys.billable_auc)}`} />
          </dl>
        </details>
      ) : null}
      <Typography as="h3" variant="h2" className="section-title">Текущее предложение покупателю</Typography>
      <dl className="demo-terms">
        <Metric label="Решение" value={state.decision?.status ?? 'Задание ещё не выбиралось'} />
        <Metric label="Причины выбора / отказа" value={state.decision?.reason_codes.join(', ') ?? '—'} />
        <Metric label="Источник финансирования" value={economics?.funding_source === 'advertiser' ? `Бренд ${economics.advertiser_id ?? ''}` : economics?.funding_source === 'own_margin' ? 'Ожидаемая дополнительная маржа X5' : '—'} />
        <Metric label="Ожидаемая дополнительная маржа" value={economics === undefined ? '—' : rubles(economics.expected_incremental_margin_kopecks)} />
        <Metric label="Непокрытая стоимость награды" value={economics === undefined ? '—' : rubles(economics.uncovered_reward_cost_kopecks)} />
        <Metric label="Ставка за событие / субсидия" value={economics === undefined ? '—' : `${rubles(economics.bid_per_qualified_event_kopecks)} / ${rubles(economics.subsidy_kopecks)}`} />
        <Metric
          label="Кампания Ads"
          value={state.challenge === null
            ? state.decision?.status === 'no_action' ? 'Нет активного задания' : 'Задание ещё не выбиралось'
            : economics?.campaign_id ?? 'Органическое задание'}
        />
        <Metric label="CPA начислено" value={billing === undefined ? '0 ₽' : rubles(billing.amount_kopecks)} />
        <Metric label="Доступный бюджет кампании" value={campaign === undefined ? '—' : rubles(campaign.remaining_budget_kopecks - campaign.reserved_kopecks)} />
        <Metric label="Резерв кампании / статус показа" value={economics === undefined || economics.auction_type === 'organic' ? '—' : `${rubles(economics.campaign_reserve_kopecks)} / ${exposure?.status ?? 'показ не записан'}`} />
        <Metric label="Частота показов за 14 дней" value={campaign === undefined ? '—' : `${frequency14d} из ${campaign.frequency_cap_14d}`} />
        <Metric label="Аукцион Ads" value={economics === undefined ? '—' : economics.auction_type === 'quality_adjusted_first_price_cpa' ? `quality-adjusted first-price; quality ${count(economics.quality_score)}, pacing ${count(economics.pacing_multiplier)}` : 'органическая выдача'} />
        <Metric label="Конкуренция Ads" value={economics === undefined || economics.auction_type === 'organic' ? '—' : `${economics.auction_candidate_count} кампании, ${economics.auction_eligible_count} прошли фильтры; ${economics.winner_was_highest_bid ? 'победила максимальная ставка' : `ставка ${rubles(economics.highest_candidate_bid_kopecks)} проиграла по quality и экономике`}`} />
        <Metric label="Резервы купонов / товаров" value={`${rubles(state.budget.coupon_reserved_kopecks)} / ${rubles(state.budget.physical_reserved_kopecks)}`} />
        <Metric label="Риск последнего чека" value={state.last_risk === null ? 'Чек ещё не проверялся' : `${state.last_risk.decision}, score ${count(state.last_risk.score)}; ${state.last_risk.signals.join(', ') || 'без сигналов'}`} />
        <Metric label="Источник карточки" value={state.card?.source ?? '—'} />
        <Metric label="Проверка LLM" value={state.decision?.llm_error ?? (state.card?.source === 'llm' ? 'Ответ модели принят' : 'Модель не вызывалась')} />
      </dl>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt><Typography as="span" variant="bodyXs">{label}</Typography></dt><dd><Typography as="span" variant="bodyXs">{value}</Typography></dd></div>
}
