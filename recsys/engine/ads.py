"""Pure local Ads allocation domain for the demonstrational PoC.

The module accepts already-normalized integer money and basis-point inputs. Loading the
legacy campaign JSON and adapting browser state belongs to :mod:`economics`; keeping that
translation outside makes the auction deterministic and independently testable.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Iterable, Literal, Mapping, Sequence


BPS = 10_000
DAY_MS = 86_400_000


@dataclass(frozen=True)
class AuctionCampaign:
    campaign_id: str
    advertiser_id: str
    advertiser_name: str | None
    eligible_categories: tuple[str, ...]
    flight_start: dt.date
    flight_end: dt.date
    bid_kopecks: int
    subsidy_kopecks: int
    available_budget_kopecks: int
    frequency_cap_14d: int
    quality_bps: int
    increment_bps: int
    p_billable_bps: int
    pacing_bps: int

    def __post_init__(self) -> None:
        if not self.campaign_id or not self.advertiser_id:
            raise ValueError("campaign_id and advertiser_id are required")
        if self.flight_end < self.flight_start:
            raise ValueError("campaign flight_end must not precede flight_start")
        for name in ("bid_kopecks", "subsidy_kopecks", "available_budget_kopecks"):
            if not isinstance(getattr(self, name), int) or getattr(self, name) < 0:
                raise ValueError(f"{name} must be a non-negative integer")
        if not isinstance(self.frequency_cap_14d, int) or self.frequency_cap_14d < 0:
            raise ValueError("frequency_cap_14d must be a non-negative integer")
        for name in ("quality_bps", "increment_bps", "p_billable_bps"):
            value = getattr(self, name)
            if not isinstance(value, int) or not 0 <= value <= BPS:
                raise ValueError(f"{name} must be an integer from 0 to 10000")
        if not isinstance(self.pacing_bps, int) or not 0 <= self.pacing_bps <= 2 * BPS:
            raise ValueError("pacing_bps must be an integer from 0 to 20000")

    @property
    def reserve_kopecks(self) -> int:
        """Maximum advertiser liability reserved before the impression is published."""
        return self.bid_kopecks + self.subsidy_kopecks


@dataclass(frozen=True)
class AuctionContext:
    category: str
    today: dt.date
    candidate_relevance_bps: int
    min_quality_bps: int
    min_increment_bps: int
    expected_x5_margin_kopecks: int
    reward_cost_kopecks: int
    required_physical_funding_kopecks: int = 0
    exposures_14d_by_campaign: Mapping[str, int] | None = None

    def __post_init__(self) -> None:
        for name in ("candidate_relevance_bps", "min_quality_bps", "min_increment_bps"):
            value = getattr(self, name)
            if not isinstance(value, int) or not 0 <= value <= BPS:
                raise ValueError(f"{name} must be an integer from 0 to 10000")
        for name in (
            "expected_x5_margin_kopecks",
            "reward_cost_kopecks",
            "required_physical_funding_kopecks",
        ):
            if not isinstance(getattr(self, name), int):
                raise ValueError(f"{name} must be an integer")
        if self.reward_cost_kopecks < 0:
            raise ValueError("reward_cost_kopecks must be non-negative")
        if self.required_physical_funding_kopecks < 0:
            raise ValueError("required_physical_funding_kopecks must be non-negative")


@dataclass(frozen=True)
class ScoreComponents:
    expected_payment_kopecks: int
    effective_quality_bps: int
    quality_adjusted_payment_kopecks: int
    pacing_bps: int
    paced_quality_payment_kopecks: int
    expected_x5_margin_kopecks: int
    uncovered_reward_cost_kopecks: int
    rank_score_kopecks: int


@dataclass(frozen=True)
class EligibleCampaign:
    campaign: AuctionCampaign
    score: ScoreComponents
    reserve_kopecks: int


@dataclass(frozen=True)
class CampaignRejection:
    campaign_id: str
    reason_code: str


@dataclass(frozen=True)
class BillingIntent:
    campaign_id: str
    advertiser_id: str
    bid_kopecks: int
    subsidy_kopecks: int
    reserved_kopecks: int
    charge_condition: Literal["verified_qualified_event"] = "verified_qualified_event"


@dataclass(frozen=True)
class BillingResult:
    campaign_id: str
    advertiser_id: str
    status: Literal["billable", "not_billable"]
    charge_kopecks: int
    settled_subsidy_kopecks: int
    release_kopecks: int


@dataclass(frozen=True)
class AuctionResult:
    status: Literal["filled", "no_fill"]
    winner: EligibleCampaign | None
    billing_intent: BillingIntent | None
    rejections: tuple[CampaignRejection, ...]
    reason_codes: tuple[str, ...]


def allocate_campaign(
    campaigns: Iterable[AuctionCampaign], context: AuctionContext
) -> AuctionResult:
    """Run a closed quality-adjusted first-price CPA auction.

    Hard constraints are evaluated before scoring. The winner is deterministic for the
    same input; a stable campaign id resolves an otherwise exact tie. Pacing affects only
    allocation priority. The billing intent always keeps the submitted bid unchanged.
    """
    eligible: list[EligibleCampaign] = []
    rejections: list[CampaignRejection] = []

    for campaign in sorted(campaigns, key=lambda value: value.campaign_id):
        rejection = _reject_reason(campaign, context)
        if rejection is not None:
            rejections.append(CampaignRejection(campaign.campaign_id, rejection))
            continue
        eligible.append(
            EligibleCampaign(
                campaign=campaign,
                score=_score(campaign, context),
                reserve_kopecks=campaign.reserve_kopecks,
            )
        )

    if not eligible:
        return AuctionResult(
            status="no_fill",
            winner=None,
            billing_intent=None,
            rejections=tuple(rejections),
            reason_codes=(
                "no_eligible_campaign",
                *_unique(rejection.reason_code for rejection in rejections),
            ),
        )

    winner = min(
        eligible,
        key=lambda value: (
            -value.score.rank_score_kopecks,
            -value.score.effective_quality_bps,
            -value.campaign.increment_bps,
            -value.campaign.bid_kopecks,
            value.campaign.campaign_id,
        ),
    )
    intent = BillingIntent(
        campaign_id=winner.campaign.campaign_id,
        advertiser_id=winner.campaign.advertiser_id,
        bid_kopecks=winner.campaign.bid_kopecks,
        subsidy_kopecks=winner.campaign.subsidy_kopecks,
        reserved_kopecks=winner.reserve_kopecks,
    )
    return AuctionResult(
        status="filled",
        winner=winner,
        billing_intent=intent,
        rejections=tuple(rejections),
        reason_codes=(
            "auction_filled",
            *_unique(rejection.reason_code for rejection in rejections),
        ),
    )


def resolve_billing(
    intent: BillingIntent, *, qualified: bool, verified: bool
) -> BillingResult:
    """Resolve the domain billing outcome; persistence/idempotency belong to the event layer."""
    billable = qualified and verified
    return BillingResult(
        campaign_id=intent.campaign_id,
        advertiser_id=intent.advertiser_id,
        status="billable" if billable else "not_billable",
        charge_kopecks=intent.bid_kopecks if billable else 0,
        settled_subsidy_kopecks=intent.subsidy_kopecks if billable else 0,
        release_kopecks=0 if billable else intent.reserved_kopecks,
    )


def count_recent_exposures(
    exposures: Sequence[Mapping[str, object]], *, profile_id: str, now_ms: int
) -> dict[str, int]:
    """Count unique impressions in the inclusive rolling 14-day frequency window."""
    lower_bound = now_ms - 14 * DAY_MS
    seen: set[str] = set()
    counts: dict[str, int] = {}
    for index, exposure in enumerate(exposures):
        if exposure.get("profile_id") != profile_id:
            continue
        shown_at_ms = exposure.get("shown_at_ms")
        campaign_id = exposure.get("campaign_id")
        if not isinstance(shown_at_ms, int) or not lower_bound <= shown_at_ms <= now_ms:
            continue
        if not isinstance(campaign_id, str) or not campaign_id:
            continue
        exposure_id = exposure.get("exposure_id")
        stable_id = exposure_id if isinstance(exposure_id, str) else f"__row_{index}"
        if stable_id in seen:
            continue
        seen.add(stable_id)
        counts[campaign_id] = counts.get(campaign_id, 0) + 1
    return counts


def _reject_reason(campaign: AuctionCampaign, context: AuctionContext) -> str | None:
    if context.category not in campaign.eligible_categories:
        return "category_mismatch"
    if not campaign.flight_start <= context.today <= campaign.flight_end:
        return "flight_inactive"
    if campaign.reserve_kopecks < context.required_physical_funding_kopecks:
        return "physical_reward_funding_insufficient"
    if campaign.available_budget_kopecks < campaign.reserve_kopecks:
        return "campaign_budget_insufficient"
    if context.exposures_14d_by_campaign is not None:
        exposures = context.exposures_14d_by_campaign.get(campaign.campaign_id, 0)
        if exposures >= campaign.frequency_cap_14d:
            return "frequency_cap_reached"
    effective_quality = _apply_bps(campaign.quality_bps, context.candidate_relevance_bps)
    if effective_quality < context.min_quality_bps:
        return "quality_below_floor"
    if campaign.increment_bps < context.min_increment_bps:
        return "increment_below_floor"
    return None


def _score(campaign: AuctionCampaign, context: AuctionContext) -> ScoreComponents:
    expected_payment = _apply_bps(campaign.bid_kopecks, campaign.p_billable_bps)
    effective_quality = _apply_bps(campaign.quality_bps, context.candidate_relevance_bps)
    quality_adjusted_payment = _apply_bps(expected_payment, effective_quality)
    paced_payment = _apply_bps(quality_adjusted_payment, campaign.pacing_bps)
    uncovered_reward_cost = max(0, context.reward_cost_kopecks - campaign.subsidy_kopecks)
    rank_score = paced_payment + context.expected_x5_margin_kopecks - uncovered_reward_cost
    return ScoreComponents(
        expected_payment_kopecks=expected_payment,
        effective_quality_bps=effective_quality,
        quality_adjusted_payment_kopecks=quality_adjusted_payment,
        pacing_bps=campaign.pacing_bps,
        paced_quality_payment_kopecks=paced_payment,
        expected_x5_margin_kopecks=context.expected_x5_margin_kopecks,
        uncovered_reward_cost_kopecks=uncovered_reward_cost,
        rank_score_kopecks=rank_score,
    )


def _apply_bps(value: int, bps: int) -> int:
    """Integer half-up rounding for non-negative monetary score components."""
    return (value * bps + BPS // 2) // BPS


def _unique(values: Iterable[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))
