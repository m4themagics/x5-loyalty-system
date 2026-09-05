"""Бюджет, полные максимальные резервы и синтетическая экономика кандидата.

Все суммы — целые копейки. Жёсткий доступный бюджет вычитает подтверждённые расходы и полные
максимальные незакрытые обязательства, а не вероятностный прогноз. Прогноз дополнительной
маржи остаётся синтетическим допущением и не является доказательством прибыльности.
"""
import datetime as dt
from typing import Any, NamedTuple

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
) -> Sponsorship:
    """Отбор допустимой кампании и выбор наибольшей ставки среди прошедших фильтры.

    Это фильтр и выбор, а не quality-adjusted аукцион: полный аукцион вынесен за границы PoC.
    """
    campaign_category = policy.get("campaign_category_map", {}).get(category)
    if campaign_category is None:
        return NO_SPONSOR

    names = {
        advertiser["advertiser_id"]: advertiser["name"]
        for advertiser in campaigns.get("advertisers", [])
    }
    today = dt.datetime.fromtimestamp(now_ms / 1000, dt.timezone.utc).date()
    eligible = []

    for campaign in campaigns.get("campaigns", []):
        if campaign_category not in campaign.get("eligible_categories", []):
            continue
        if not _within_flight(campaign, today):
            continue
        bid_kopecks = rubles_to_kopecks(campaign["bid_per_qualified_visit"])
        if rubles_to_kopecks(campaign.get("remaining_budget", 0)) < bid_kopecks:
            continue
        eligible.append((bid_kopecks, campaign))

    if not eligible:
        return NO_SPONSOR

    bid_kopecks, campaign = max(eligible, key=lambda item: (item[0], item[1]["campaign_id"]))
    return Sponsorship(
        advertiser_id=campaign["advertiser_id"],
        campaign_id=campaign["campaign_id"],
        advertiser_name=names.get(campaign["advertiser_id"]),
        bid_kopecks=bid_kopecks,
        subsidy_kopecks=rubles_to_kopecks(campaign.get("reward_cost") or 0),
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
    }


def expected_net_kopecks(economics: dict[str, Any]) -> int:
    """Ожидаемая экономика кандидата. Положительный прогноз не является доказанной прибылью."""
    return (
        economics["bid_per_qualified_event_kopecks"]
        + economics["expected_incremental_margin_kopecks"]
        - economics["uncovered_reward_cost_kopecks"]
    )


def _within_flight(campaign: dict[str, Any], today: dt.date) -> bool:
    start = dt.date.fromisoformat(campaign["flight_start"])
    end = dt.date.fromisoformat(campaign["flight_end"])
    return start <= today <= end
