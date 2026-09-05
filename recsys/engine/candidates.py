"""Перебор пар «покупочное условие + полезный предмет», ограничения и ранжирование.

Каталог предметов и рецепты приходят в запросе снимком игры. Движок не хранит второй каталог
и не считает процент скидки: это правило игры.
"""
from typing import Any, NamedTuple

from .economics import (
    Budget,
    Sponsorship,
    build_economics,
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
        """Согласованный порядок: рецепт, знакомая категория, завершение, прирост,
        выполнимость, экономика, стабильный ID."""
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
    """Один выбранный рецепт: наибольший прогресс, затем знакомость недостающих категорий."""
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

    target_sku_ids = _eligible_target_skus(category, sku_catalog)
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

    sponsorship = select_sponsorship(category, now_ms, policy, campaigns)
    economics = build_economics(category, coupon_reserve, physical_reserve, sponsorship, policy)
    if expected_net_kopecks(economics) < policy["min_expected_increment_kopecks"]:
        reasons.append("sku_economics_negative")
        accepted = False

    completes = progress["matched_count"] + 1 >= craft_size
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
        gift_sku=gift_sku,
        sponsorship=sponsorship,
        economics=economics,
        coupon_reserve=coupon_reserve,
        physical_reserve=physical_reserve,
        accepted=accepted,
        reason_codes=reasons,
    )


def _eligible_target_skus(category: str, sku_catalog: dict[str, Any]) -> list[str]:
    """Список оплачиваемых SKU категории фиксируется до показа задания."""
    return sorted(
        sku["sku_id"]
        for sku in sku_catalog["skus"]
        if sku["category"] == category and sku["stock"] > 0 and sku["unit_cost_kopecks"] > 0
    )


def _pick_gift_sku(category: str, sku_catalog: dict[str, Any]) -> dict[str, Any] | None:
    """Бесплатный товар — отдельный маленький формат с собственным остатком и себестоимостью."""
    available = [
        sku
        for sku in sku_catalog.get("gift_skus", [])
        if sku["category"] == category and sku["stock"] > 0 and sku["unit_cost_kopecks"] > 0
    ]
    if not available:
        return None
    return min(available, key=lambda sku: (sku["unit_cost_kopecks"], sku["sku_id"]))
