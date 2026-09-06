"""Бюджет, полные максимальные резервы и синтетическая экономика кандидата.

Все суммы — целые копейки. Жёсткий доступный бюджет вычитает подтверждённые расходы и полные
максимальные незакрытые обязательства, а не вероятностный прогноз. Прогноз дополнительной
маржи остаётся синтетическим допущением и не является доказательством прибыльности.
"""
from __future__ import annotations

import datetime as dt
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, NamedTuple

from .ads import (
    BPS,
    AuctionCampaign,
    AuctionContext,
    BillingIntent,
    allocate_campaign,
    count_recent_exposures,
)
from .policy import rubles_to_kopecks


class Budget(NamedTuple):
    coupon_available: int
    physical_available: int

    def covers(self, coupon_reserve: int, physical_reserve: int) -> bool:
        return (
            self.coupon_available >= coupon_reserve
            and self.physical_available >= physical_reserve
        )

    def after(self, coupon_reserve: int, physical_reserve: int) -> "Budget":
        return Budget(
            self.coupon_available - coupon_reserve,
            self.physical_available - physical_reserve,
        )


class Sponsorship(NamedTuple):
    advertiser_id: str | None
    campaign_id: str | None
    advertiser_name: str | None
    bid_kopecks: int
    subsidy_kopecks: int
    quality_bps: int = 0
    effective_quality_bps: int = 0
    increment_bps: int = 0
    p_billable_bps: int = 0
    pacing_bps: int = BPS
    rank_score_kopecks: int = 0
    reserve_kopecks: int = 0
    available_budget_kopecks: int = 0
    billing_intent: BillingIntent | None = None
    reason_codes: tuple[str, ...] = ()
    auction_candidate_count: int = 0
    auction_eligible_count: int = 0
    highest_candidate_bid_kopecks: int = 0
    winner_was_highest_bid: bool = False


NO_SPONSOR = Sponsorship(None, None, None, 0, 0)


def available_budget(budget: dict[str, int]) -> Budget:
    return Budget(
        budget["coupon_fund_kopecks"]
        - budget["coupon_settled_kopecks"]
        - budget["coupon_reserved_kopecks"],
        budget["physical_fund_kopecks"]
        - budget["physical_settled_kopecks"]
        - budget["physical_reserved_kopecks"],
    )


def select_sponsorship(
    category: str,
    now_ms: int,
    policy: dict[str, Any],
    campaigns: dict[str, Any],
    *,
    ads: dict[str, Any] | None = None,
    profile_id: str | None = None,
    candidate_relevance_bps: int = BPS,
    expected_x5_margin_kopecks: int | None = None,
    reward_cost_kopecks: int | None = None,
    required_physical_funding_kopecks: int = 0,
) -> Sponsorship:
    """Adapt the JSON catalog and browser Ads ledger to the pure auction domain."""
    campaign_category = policy.get("campaign_category_map", {}).get(category)
    if campaign_category is None:
        return NO_SPONSOR._replace(reason_codes=("ads_category_unmapped",))

    names = {
        advertiser["advertiser_id"]: advertiser["name"]
        for advertiser in campaigns.get("advertisers", [])
    }
    today = dt.datetime.fromtimestamp(now_ms / 1000, dt.timezone.utc).date()
    ads_campaigns = {
        campaign["campaign_id"]: campaign for campaign in (ads or {}).get("campaigns", [])
    }
    exposure_counts = (
        count_recent_exposures(
            (ads or {}).get("exposures", []), profile_id=profile_id, now_ms=now_ms
        )
        if ads is not None and profile_id is not None
        else None
    )
    min_quality_bps = int(
        policy.get("ads_min_quality_bps", campaigns.get("min_quality_bps", 0))
    )
    min_increment_bps = int(
        policy.get(
            "ads_min_increment_bps",
            _fraction_to_bps(campaigns.get("incrementality_floor", 0)),
        )
    )
    expected_margin = (
        expected_incremental_margin(category, policy)
        if expected_x5_margin_kopecks is None
        else expected_x5_margin_kopecks
    )

    normalized = [
        _normalize_campaign(
            campaign,
            names,
            ads_campaigns.get(campaign["campaign_id"]),
            today,
            require_state=ads is not None,
            max_subsidy_kopecks=reward_cost_kopecks,
        )
        for campaign in campaigns.get("campaigns", [])
    ]
    allocation = allocate_campaign(
        normalized,
        AuctionContext(
            category=campaign_category,
            today=today,
            candidate_relevance_bps=candidate_relevance_bps,
            min_quality_bps=min_quality_bps,
            min_increment_bps=min_increment_bps,
            expected_x5_margin_kopecks=expected_margin,
            reward_cost_kopecks=reward_cost_kopecks or 0,
            required_physical_funding_kopecks=required_physical_funding_kopecks,
            exposures_14d_by_campaign=exposure_counts,
        ),
    )
    if allocation.winner is None:
        return NO_SPONSOR._replace(reason_codes=allocation.reason_codes)

    winner = allocation.winner
    campaign = winner.campaign
    category_candidates = [
        value for value in normalized if campaign_category in value.eligible_categories
    ]
    rejected_ids = {rejection.campaign_id for rejection in allocation.rejections}
    auction_eligible_count = sum(
        value.campaign_id not in rejected_ids for value in category_candidates
    )
    highest_candidate_bid = max(
        (value.bid_kopecks for value in category_candidates), default=campaign.bid_kopecks
    )
    return Sponsorship(
        advertiser_id=campaign.advertiser_id,
        campaign_id=campaign.campaign_id,
        advertiser_name=campaign.advertiser_name,
        bid_kopecks=campaign.bid_kopecks,
        subsidy_kopecks=campaign.subsidy_kopecks,
        quality_bps=campaign.quality_bps,
        effective_quality_bps=winner.score.effective_quality_bps,
        increment_bps=campaign.increment_bps,
        p_billable_bps=campaign.p_billable_bps,
        pacing_bps=campaign.pacing_bps,
        rank_score_kopecks=winner.score.rank_score_kopecks,
        reserve_kopecks=winner.reserve_kopecks,
        available_budget_kopecks=campaign.available_budget_kopecks,
        billing_intent=allocation.billing_intent,
        reason_codes=allocation.reason_codes,
        auction_candidate_count=len(category_candidates),
        auction_eligible_count=auction_eligible_count,
        highest_candidate_bid_kopecks=highest_candidate_bid,
        winner_was_highest_bid=campaign.bid_kopecks >= highest_candidate_bid,
    )


def expected_incremental_margin(category: str, policy: dict[str, Any]) -> int:
    by_category = policy.get("expected_incremental_margin_by_category", {})
    return int(by_category.get(category, policy["expected_incremental_margin_default_kopecks"]))


def build_economics(
    category: str,
    coupon_reserve: int,
    physical_reserve: int,
    sponsorship: Sponsorship,
    policy: dict[str, Any],
) -> dict[str, Any]:
    """Субсидия учитывается один раз: она уменьшает непокрытую стоимость награды."""
    reward_cost = coupon_reserve + physical_reserve
    subsidy = min(sponsorship.subsidy_kopecks, reward_cost)
    return {
        "synthetic": True,
        "funding_source": "advertiser" if sponsorship.campaign_id else "own_margin",
        "advertiser_id": sponsorship.advertiser_id,
        "campaign_id": sponsorship.campaign_id,
        "bid_per_qualified_event_kopecks": sponsorship.bid_kopecks,
        "subsidy_kopecks": subsidy,
        "uncovered_reward_cost_kopecks": reward_cost - subsidy,
        "expected_incremental_margin_kopecks": expected_incremental_margin(category, policy),
        "auction_type": (
            "quality_adjusted_first_price_cpa" if sponsorship.campaign_id else "organic"
        ),
        "quality_score": sponsorship.effective_quality_bps / BPS,
        "predicted_billable_probability": sponsorship.p_billable_bps / BPS,
        "pacing_multiplier": sponsorship.pacing_bps / BPS,
        "auction_score_kopecks": sponsorship.rank_score_kopecks,
        "campaign_reserve_kopecks": sponsorship.reserve_kopecks,
        "auction_candidate_count": sponsorship.auction_candidate_count,
        "auction_eligible_count": sponsorship.auction_eligible_count,
        "highest_candidate_bid_kopecks": sponsorship.highest_candidate_bid_kopecks,
        "winner_was_highest_bid": sponsorship.winner_was_highest_bid,
    }


def expected_net_kopecks(economics: dict[str, Any]) -> int:
    """Ожидаемая экономика кандидата. Положительный прогноз не является доказанной прибылью."""
    if economics.get("auction_type") == "quality_adjusted_first_price_cpa":
        return int(economics["auction_score_kopecks"])
    return (
        economics["expected_incremental_margin_kopecks"]
        - economics["uncovered_reward_cost_kopecks"]
    )


def _normalize_campaign(
    campaign: dict[str, Any],
    names: dict[str, str],
    state: dict[str, Any] | None,
    today: dt.date,
    *,
    require_state: bool,
    max_subsidy_kopecks: int | None,
) -> AuctionCampaign:
    start = dt.date.fromisoformat(campaign["flight_start"])
    end = dt.date.fromisoformat(campaign["flight_end"])
    bid = rubles_to_kopecks(campaign["bid_per_qualified_visit"])
    declared_subsidy = rubles_to_kopecks(campaign.get("reward_cost") or 0)
    subsidy = (
        declared_subsidy
        if max_subsidy_kopecks is None
        else min(declared_subsidy, max_subsidy_kopecks)
    )
    if state is None and require_state:
        remaining = 0
        reserved = 0
        frequency_cap = int(campaign.get("frequency_cap_14d", 0))
    elif state is None:
        remaining = rubles_to_kopecks(campaign.get("remaining_budget", 0))
        reserved = 0
        frequency_cap = int(campaign.get("frequency_cap_14d", 0))
    else:
        remaining = int(state["remaining_budget_kopecks"])
        reserved = int(state.get("reserved_kopecks", 0))
        frequency_cap = int(
            state.get("frequency_cap_14d", campaign.get("frequency_cap_14d", 0))
        )

    quality_bps = int(
        campaign.get("quality_bps", _fraction_to_bps(campaign.get("quality_score", 1)))
    )
    increment_bps = int(
        campaign.get(
            "increment_bps",
            _fraction_to_bps(campaign.get("uplift", campaign.get("incrementality", 0.04))),
        )
    )
    p_billable_bps = int(
        campaign.get(
            "p_billable_bps", _fraction_to_bps(campaign.get("p_billable", 1))
        )
    )
    pacing_bps = int(
        campaign.get(
            "pacing_bps",
            _fraction_to_bps(campaign["pacing_multiplier"])
            if "pacing_multiplier" in campaign
            else _derive_pacing_bps(campaign, state, today, start, end),
        )
    )
    return AuctionCampaign(
        campaign_id=campaign["campaign_id"],
        advertiser_id=campaign["advertiser_id"],
        advertiser_name=names.get(campaign["advertiser_id"]),
        eligible_categories=tuple(campaign.get("eligible_categories", [])),
        flight_start=start,
        flight_end=end,
        bid_kopecks=bid,
        subsidy_kopecks=subsidy,
        available_budget_kopecks=max(0, remaining - reserved),
        frequency_cap_14d=frequency_cap,
        quality_bps=quality_bps,
        increment_bps=increment_bps,
        p_billable_bps=p_billable_bps,
        pacing_bps=pacing_bps,
    )


def _derive_pacing_bps(
    campaign: dict[str, Any],
    state: dict[str, Any] | None,
    today: dt.date,
    start: dt.date,
    end: dt.date,
) -> int:
    """Bounded catch-up multiplier based only on flight progress and settled spend."""
    if today < start or today > end:
        return BPS
    total = rubles_to_kopecks(campaign.get("total_budget", 0))
    if total <= 0:
        return BPS
    if state is None:
        remaining = rubles_to_kopecks(campaign.get("remaining_budget", 0))
        settled = max(0, total - remaining)
    else:
        settled = max(0, int(state.get("settled_kopecks", 0)))
    flight_days = (end - start).days + 1
    elapsed_days = (today - start).days + 1
    target_spend = (total * elapsed_days + flight_days // 2) // flight_days
    if settled == 0:
        return 15_000
    ratio = (target_spend * BPS + settled // 2) // settled
    return min(15_000, max(5_000, ratio))


def _fraction_to_bps(value: object) -> int:
    decimal_value = Decimal(str(value)) * Decimal(BPS)
    return int(decimal_value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
