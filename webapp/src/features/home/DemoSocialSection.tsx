import { Typography } from '@/components/typography'

import { formatRubles } from './demo-format'
import { firstQualifyingPurchaseMs, rankParticipants, referralOutcome } from './demo-progress'
import type { DemoState } from './demo-state'

const RANKING_PEERS = [
  { profile_id: 'peer-1', alias: 'Сосед по кварталу', redeemed_savings_28d_kopecks: 3200 },
  { profile_id: 'peer-2', alias: 'Утренний покупатель', redeemed_savings_28d_kopecks: 1500 },
  { profile_id: 'peer-3', alias: 'Любитель выпечки', redeemed_savings_28d_kopecks: 1500 },
]

/** Вкладка «Друзья»: приглашения и место по сэкономленному. */
export function DemoSocialSection({
  state,
  referralIssued,
}: {
  state: DemoState
  referralIssued: boolean
}) {
  const ranking = rankParticipants([
    ...RANKING_PEERS,
    {
      profile_id: state.profile.profile_id,
      alias: 'Вы',
      redeemed_savings_28d_kopecks: state.profile.progress.redeemed_savings_28d_kopecks,
    },
  ])
  const referral = referralOutcome(
    state.profile.referral,
    state.profile.profile_id,
    firstQualifyingPurchaseMs(state.profile),
  )

  return (
    <>
      <section className="demo-invite" aria-labelledby="invite-title">
        <div className="demo-invite-copy">
          <Typography as="h2" variant="h2" className="demo-block-title" id="invite-title">
            Позовите друга
          </Typography>
          <Typography as="p" variant="bodySm" className="demo-invite-text">
            Когда приглашенный друг сделает первую покупку, вы получите предмет для своей коллекции.
          </Typography>
        </div>
        <div className={`demo-invite-status ${referralIssued ? 'demo-invite-status-done' : ''}`}>
          <Typography as="span" variant="bodyXs">
            {referralIssued
              ? 'Друг совершил покупку — предмет начислен.'
              : referralReasonText(referral.reason)}
          </Typography>
        </div>
        <button className="demo-button demo-button-primary demo-button-block" type="button" disabled>
          <Typography as="span" variant="control">Пригласить друга</Typography>
        </button>
        <Typography as="span" variant="bodyXs" className="demo-block-hint">
          В демонстрации приглашение не отправляется.
        </Typography>
      </section>

      <section className="demo-progress" aria-labelledby="ranking-title">
        <div>
          <Typography as="h2" variant="h2" className="demo-block-title" id="ranking-title">
            Рейтинг экономии
          </Typography>
        </div>

        <ol className="demo-ranking">
          {ranking.map((entry) => (
            <li
              className={`demo-rank-row ${entry.alias === 'Вы' ? 'demo-rank-row-you' : ''}`}
              key={entry.profile_id}
            >
              <Typography as="span" variant="bodyXs" className="demo-rank-place">
                {entry.rank}
              </Typography>
              <Typography as="span" variant="bodyXs" className="demo-rank-alias">
                {entry.alias}
              </Typography>
              <Typography as="span" variant="bodyXs" className="demo-rank-value">
                {formatRubles(entry.redeemed_savings_28d_kopecks)}
              </Typography>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

function referralReasonText(reason: string): string {
  const messages: Record<string, string> = {
    referral_reward_due: 'Условия приглашения выполнены — награда начислена.',
    referral_not_invited: 'Пока никто вас не приглашал и вы никого не позвали.',
    referral_self_invite: 'Приглашение самого себя не засчитывается.',
    referral_existing_customer: 'У приглашённого уже были покупки, награда не начисляется.',
    referral_no_qualifying_purchase: 'Ждём первую покупку приглашённого друга.',
    referral_window_expired: 'Друг купил позже семи дней после приглашения.',
    referral_cap_reached: 'За эту неделю награда за приглашение уже получена.',
  }
  return messages[reason] ?? reason
}
