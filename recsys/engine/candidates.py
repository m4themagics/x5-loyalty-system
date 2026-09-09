"""Enumeration of "purchase condition + useful item" pairs, constraints and ranking.

The item catalog and the recipes arrive with the request as a game snapshot. The engine keeps no
second catalog and does not compute the discount percentage: that is a game rule.
"""
from __future__ import annotations

from typing import Any, NamedTuple

from .economics import (
    Budget,
    Sponsorship,
    build_economics,
    expected_incremental_margin,
    expected_net_kopecks,
    select_sponsorship,
)
from .history import PurchaseHistory


class Candidate(NamedTuple):
    candidate_id: str
    item_id: str
    item_name: str
    recipe_id: str
    recipe_title: str
    category: str
    matched_count: int
    completes_recipe: bool
    is_goal_recipe: bool
    familiar_days: int
    days_since_last: int | None
    target_sku_ids: list[str]
    target_sku_names: list[str]
    gift_sku: dict[str, Any] | None
    sponsorship: Sponsorship
    economics: dict[str, Any] | None
    coupon_reserve: int
    physical_reserve: int
    accepted: bool
    reason_codes: list[str]

    @property
    def net_kopecks(self) -> int:
        return expected_net_kopecks(self.economics) if self.economics else 0

    def rank_key(self) -> tuple:
        """Agreed order: recipe, familiar category, completion, progress,
        feasibility, economics, stable ID."""
        recency = self.days_since_last if self.days_since_last is not None else 10_000
        return (
            not self.is_goal_recipe,
            -self.familiar_days,
            not self.completes_recipe,
            -self.matched_count,
            recency,
            -self.net_kopecks,
            self.candidate_id,
        )


def select_goal_recipe(
    game: dict[str, Any],
    game_features: dict[str, Any],
    history: PurchaseHistory,
) -> str | None:
    """One selected recipe: the greatest progress, then familiarity of the missing categories."""
    categories = {item["id"]: item["category"] for item in game["items"]}
    ranked = []
    for progress in game_features["recipe_progress"]:
        if not progress["missing_item_ids"]:
            continue
        familiar_missing = sum(
            1
            for item_id in progress["missing_item_ids"]
            if history.is_familiar(categories.get(item_id, ""))
        )
        ranked.append((-progress["matched_count"], -familiar_missing, progress["recipe_id"]))
    if not ranked:
        return None
    return min(ranked)[2]


def build_candidates(
    request: dict[str, Any],
    history: PurchaseHistory,
    budget: Budget,
    policy: dict[str, Any],
    sku_catalog: dict[str, Any],
    campaigns: dict[str, Any],
    grant_physical: bool,
) -> list[Candidate]:
    game = request["game"]
    game_features = request["game_features"]
    now_ms = request["now_ms"]
    items = {item["id"]: item for item in game["items"]}
    recipes = {recipe["id"]: recipe for recipe in game["recipes"]}
    goal_recipe_id = select_goal_recipe(game, game_features, history)
    excluded = set(sku_catalog.get("excluded_categories", []))
    coupon_reserve = policy["instance_reserve_kopecks"]

    candidates: list[Candidate] = []
    for progress in game_features["recipe_progress"]:
        recipe = recipes.get(progress["recipe_id"])
        if recipe is None:
            continue
        for item_id in progress["missing_item_ids"]:
            item = items.get(item_id)
            if item is None:
                continue
            candidates.append(
                _evaluate(
                    item=item,
                    recipe=recipe,
                    progress=progress,
                    goal_recipe_id=goal_recipe_id,
                    history=history,
                    budget=budget,
                    now_ms=now_ms,
                    policy=policy,
                    sku_catalog=sku_catalog,
                    campaigns=campaigns,
                    craft_size=game["craft_size"],
                    excluded=excluded,
                    coupon_reserve=coupon_reserve,
                    grant_physical=grant_physical,
                    ads=request.get("ads"),
                    profile_id=request["profile"]["profile_id"],
                )
            )

    return sorted(candidates, key=lambda candidate: candidate.rank_key())


def _evaluate(
    *,
    item: dict[str, Any],
    recipe: dict[str, Any],
    progress: dict[str, Any],
    goal_recipe_id: str | None,
    history: PurchaseHistory,
    budget: Budget,
    now_ms: int,
    policy: dict[str, Any],
    sku_catalog: dict[str, Any],
    campaigns: dict[str, Any],
    craft_size: int,
    excluded: set[str],
    coupon_reserve: int,
    grant_physical: bool,
    ads: dict[str, Any] | None,
    profile_id: str,
) -> Candidate:
    category = item["category"]
    reasons: list[str] = []
    accepted = True

    if category in excluded:
        reasons.append("sku_category_excluded")
        accepted = False

    if history.is_familiar(category):
        reasons.append("category_in_history")
    else:
        reasons.append("category_not_in_history")
        accepted = False
        if not policy["exploration_enabled"]:
            reasons.append("exploration_disabled")

    target_skus = _eligible_target_skus(category, sku_catalog)
    target_sku_ids = [sku["sku_id"] for sku in target_skus]
    target_sku_names = [sku["name"] for sku in target_skus]
    if not target_sku_ids:
        reasons.append("sku_out_of_stock")
        accepted = False

    gift_sku = _pick_gift_sku(category, sku_catalog) if grant_physical else None
    if grant_physical and gift_sku is None:
        reasons.append("sku_out_of_stock")
        accepted = False

    physical_reserve = gift_sku["unit_cost_kopecks"] if gift_sku else 0
    if not budget.covers(coupon_reserve, physical_reserve):
        if budget.coupon_available < coupon_reserve:
            reasons.append("coupon_budget_insufficient")
        if budget.physical_available < physical_reserve:
            reasons.append("physical_budget_insufficient")
        accepted = False

    completes = progress["matched_count"] + 1 >= craft_size
    reward_cost = coupon_reserve + physical_reserve
    expected_margin = expected_incremental_margin(category, policy)
    sponsorship = select_sponsorship(
        category,
        now_ms,
        policy,
        campaigns,
        ads=ads,
        profile_id=profile_id,
        candidate_relevance_bps=_candidate_relevance_bps(
            familiar_days=history.days_in_category(category),
            is_goal_recipe=recipe["id"] == goal_recipe_id,
            completes_recipe=completes,
        ),
        expected_x5_margin_kopecks=expected_margin,
        reward_cost_kopecks=reward_cost,
        # The shared coupon fund reserves the digital item separately. The advertiser
        # must fully cover only the physical SKU promised in this first-cycle offer.
        required_physical_funding_kopecks=physical_reserve if grant_physical else 0,
    )
    if (
        grant_physical
        and policy["first_cycle_funding_policy"] == "advertiser_only"
        and sponsorship.campaign_id is None
    ):
        reasons.extend(("funding_gate", "physical_reward_requires_advertiser"))
        reasons.extend(_ads_reason_codes(sponsorship.reason_codes))
        accepted = False
    economics = build_economics(category, coupon_reserve, physical_reserve, sponsorship, policy)
    if expected_net_kopecks(economics) < policy["min_expected_increment_kopecks"]:
        reasons.append("sku_economics_negative")
        accepted = False

    if completes:
        reasons.append("recipe_completion_reachable")
    elif progress["matched_count"] == 0:
        reasons.append("recipe_goal_first_copy")

    return Candidate(
        candidate_id=f"cnd_{item['id']}_{recipe['id']}",
        item_id=item["id"],
        item_name=item["name"],
        recipe_id=recipe["id"],
        recipe_title=recipe["title"],
        category=category,
        matched_count=progress["matched_count"],
        completes_recipe=completes,
        is_goal_recipe=recipe["id"] == goal_recipe_id,
        familiar_days=history.days_in_category(category),
        days_since_last=history.days_since_last(category),
        target_sku_ids=target_sku_ids,
        target_sku_names=target_sku_names,
        gift_sku=gift_sku,
        sponsorship=sponsorship,
        economics=economics,
        coupon_reserve=coupon_reserve,
        physical_reserve=physical_reserve,
        accepted=accepted,
        reason_codes=reasons,
    )


def _eligible_target_skus(category: str, sku_catalog: dict[str, Any]) -> list[dict[str, Any]]:
    """The list of paid SKUs for a category is fixed before the challenge is shown."""
    return sorted(
        (
            sku
            for sku in sku_catalog["skus"]
            if sku["category"] == category
            and sku["stock"] > 0
            and sku["unit_cost_kopecks"] > 0
        ),
        key=lambda sku: sku["sku_id"],
    )


def _pick_gift_sku(category: str, sku_catalog: dict[str, Any]) -> dict[str, Any] | None:
    """A free product is a separate small format with its own stock and unit cost."""
    available = [
        sku
        for sku in sku_catalog.get("gift_skus", [])
        if sku["category"] == category and sku["stock"] > 0 and sku["unit_cost_kopecks"] > 0
    ]
    if not available:
        return None
    return min(available, key=lambda sku: (sku["unit_cost_kopecks"], sku["sku_id"]))


def _candidate_relevance_bps(
    *, familiar_days: int, is_goal_recipe: bool, completes_recipe: bool
) -> int:
    """Transparent rules baseline: history first, then useful collection progress."""
    return min(
        10_000,
        7_000
        + min(familiar_days, 3) * 500
        + 750 * int(is_goal_recipe)
        + 750 * int(completes_recipe),
    )


def _ads_reason_codes(reason_codes: tuple[str, ...]) -> list[str]:
    mapped = {
        "campaign_budget_insufficient": (
            "advertiser_budget_insufficient",
            "ads_budget_insufficient",
        ),
        "frequency_cap_reached": ("frequency_cap_reached", "ads_frequency_cap"),
        "quality_below_floor": ("quality_below_floor", "ads_quality_below_floor"),
        "increment_below_floor": ("increment_below_floor", "ads_quality_below_floor"),
        "physical_reward_funding_insufficient": (
            "physical_reward_funding_insufficient",
        ),
        "category_mismatch": ("ads_no_eligible_campaign",),
        "flight_inactive": ("ads_no_eligible_campaign",),
        "no_eligible_campaign": ("ads_no_eligible_campaign",),
        "ads_category_unmapped": ("ads_no_eligible_campaign",),
    }
    return list(
        dict.fromkeys(
            mapped_code
            for code in reason_codes
            for mapped_code in mapped.get(code, ())
        )
    )
