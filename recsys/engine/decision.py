"""Выбор одного следующего задания и сборка ответа `decision`."""
from __future__ import annotations

import hashlib
from typing import Any

from .candidates import Candidate, build_candidates
from .economics import available_budget
from .history import DAY_MS, PurchaseHistory
from .policy import PolicyError, load_campaigns, load_policy, load_sku_catalog
from .risk import assess_promise

MAX_TRACED_CANDIDATES = 8


def handle_decision(request: dict[str, Any]) -> dict[str, Any]:
    now_ms = request["now_ms"]
    profile = request["profile"]

    try:
        policy = load_policy()
        sku_catalog = load_sku_catalog()
        campaigns = load_campaigns()
    except PolicyError as error:
        return _no_action(
            request,
            ["policy_parameter_missing"],
            {"engine_version": "unknown", "policy_version": "unknown"},
            llm_error=str(error),
        )

    engine_meta = {
        "engine_version": policy["engine_version"],
        "policy_version": policy["policy_version"],
    }
    budget = available_budget(request["budget"])

    promise_risk = assess_promise(profile)
    if promise_risk.decision != "allow":
        return _no_action(
            request,
            [f"risk_{promise_risk.decision}", *promise_risk.signals],
            engine_meta,
            budget=budget,
        )

    promise = profile.get("outstanding_promise")
    if promise is not None and not promise["fulfilled"] and promise["deadline_ms"] >= now_ms:
        return _no_action(request, ["promise_already_outstanding"], engine_meta, budget=budget)

    history = PurchaseHistory(profile["receipts"], now_ms, policy["history_window_days"])
    if not history.has_history and policy["insufficient_history_policy"] == "refuse":
        return _no_action(request, ["no_purchase_history"], engine_meta, budget=budget)

    grant_physical = bool(policy["first_cycle_physical_reward"]) and not profile["issued_rewards"]
    candidates = build_candidates(
        request, history, budget, policy, sku_catalog, campaigns, grant_physical
    )
    accepted = [candidate for candidate in candidates if candidate.accepted]

    if not accepted:
        return _no_action(
            request,
            _aggregate_reasons(candidates),
            engine_meta,
            budget=budget,
            candidates=candidates,
        )

    winner = accepted[0]
    challenge = _build_challenge(winner, request, policy, grant_physical)
    remaining = budget.after(winner.coupon_reserve, winner.physical_reserve)

    from recsys.llm import build_card

    card, llm_diagnostics = build_card(challenge, winner, policy)

    return {
        "contract_version": 2,
        "request_id": request["request_id"],
        "server_time_ms": now_ms,
        "decision_id": _decision_id(profile["profile_id"], now_ms, winner.candidate_id),
        "status": "offer",
        "reason_codes": ["offer_published", *_unique(winner.reason_codes)],
        "challenge": challenge,
        "card": card,
        "diagnostics": {
            **engine_meta,
            "candidates": _trace(candidates),
            "coupon_available_kopecks": remaining.coupon_available,
            "physical_available_kopecks": remaining.physical_available,
            "llm": llm_diagnostics,
        },
    }


def _build_challenge(
    candidate: Candidate,
    request: dict[str, Any],
    policy: dict[str, Any],
    grant_physical: bool,
) -> dict[str, Any]:
    now_ms = request["now_ms"]
    window_days = policy["challenge_window_days"]
    challenge_id = _stable_id(
        "chl", request["profile"]["profile_id"], str(now_ms), candidate.candidate_id
    )
    physical = None
    if grant_physical and candidate.gift_sku is not None:
        physical = {
            "sku_id": candidate.gift_sku["sku_id"],
            "name": f"{candidate.gift_sku['name']} (синтетический SKU)",
            "unit_cost_kopecks": candidate.gift_sku["unit_cost_kopecks"],
            "stock_reserved": True,
        }

    return {
        "challenge_id": challenge_id,
        "challenge_version": 1,
        "title": f"{candidate.recipe_title}: {candidate.item_name}",
        "recipe_goal_id": candidate.recipe_id,
        "target": {
            "category": candidate.category,
            "sku_ids": candidate.target_sku_ids,
            "quantity": policy["challenge_quantity"],
            "paid_only": True,
            "window_days": window_days,
            "deadline_ms": now_ms + window_days * DAY_MS,
        },
        "reward": {"digital_item_id": candidate.item_id, "physical_sku": physical},
        "reservation": {
            "coupon_reserve_kopecks": candidate.coupon_reserve,
            "physical_reserve_kopecks": candidate.physical_reserve,
        },
        "economics": candidate.economics,
    }


def _no_action(
    request: dict[str, Any],
    reason_codes: list[str],
    engine_meta: dict[str, str],
    budget: Any = None,
    candidates: list[Candidate] | None = None,
    llm_error: str | None = None,
) -> dict[str, Any]:
    return {
        "contract_version": 2,
        "request_id": request["request_id"],
        "server_time_ms": request["now_ms"],
        "decision_id": _decision_id(
            request["profile"]["profile_id"], request["now_ms"], "no_action"
        ),
        "status": "no_action",
        "reason_codes": reason_codes,
        "challenge": None,
        "card": None,
        "diagnostics": {
            **engine_meta,
            "candidates": _trace(candidates or []),
            "coupon_available_kopecks": budget.coupon_available if budget else 0,
            "physical_available_kopecks": budget.physical_available if budget else 0,
            "llm": {"source": "fallback", "model": None, "latency_ms": None, "error": llm_error},
        },
    }


def _aggregate_reasons(candidates: list[Candidate]) -> list[str]:
    counts: dict[str, int] = {}
    for candidate in candidates:
        for reason in candidate.reason_codes:
            if reason in {"category_in_history", "recipe_completion_reachable", "recipe_goal_first_copy"}:
                continue
            counts[reason] = counts.get(reason, 0) + 1
    decisive = [
        reason
        for reason in (
            "physical_reward_requires_advertiser",
            "physical_reward_funding_insufficient",
            "advertiser_budget_insufficient",
            "frequency_cap_reached",
            "quality_below_floor",
            "funding_gate",
            "ads_budget_insufficient",
            "ads_frequency_cap",
            "ads_quality_below_floor",
            "ads_no_eligible_campaign",
        )
        if reason in counts
    ]
    ranked = [
        reason
        for reason, _ in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        if reason not in decisive
    ]
    return ["no_eligible_candidate", *decisive, *ranked[:3]]


def _trace(candidates: list[Candidate]) -> list[dict[str, Any]]:
    traced = []
    for rank, candidate in enumerate(candidates[:MAX_TRACED_CANDIDATES]):
        traced.append(
            {
                "candidate_id": candidate.candidate_id,
                "item_id": candidate.item_id,
                "recipe_id": candidate.recipe_id,
                "category": candidate.category,
                "rank": rank,
                "score": _score(candidate),
                "accepted": candidate.accepted,
                "reason_codes": _unique(candidate.reason_codes),
            }
        )
    return traced


def _score(candidate: Candidate) -> float:
    """Читаемая для человека величина порядка. Ранжирование выполняет `rank_key`, не она."""
    recency = candidate.days_since_last
    recency_score = 0.0 if recency is None else max(0.0, 1.0 - recency / 30.0)
    return round(
        0.35 * float(candidate.is_goal_recipe)
        + 0.2 * float(candidate.completes_recipe)
        + 0.2 * min(candidate.familiar_days / 5.0, 1.0)
        + 0.15 * recency_score
        + 0.1 * min(max(candidate.net_kopecks, 0) / 10_000.0, 1.0),
        4,
    )


def _decision_id(profile_id: str, now_ms: int, candidate_id: str) -> str:
    return _stable_id("dec", profile_id, str(now_ms), candidate_id)


def _stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"


def _unique(values: list[str]) -> list[str]:
    seen: dict[str, None] = {}
    for value in values:
        seen.setdefault(value, None)
    return list(seen)
