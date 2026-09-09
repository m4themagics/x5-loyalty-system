"""Qualification of a synthetic receipt and one-time issuing of what was promised.

Repeating a legitimate request returns the previous result and is not fraud by itself.
Free lines do not complete a challenge.
"""
from __future__ import annotations

import hashlib
from typing import Any

from .history import PurchaseHistory
from .policy import PolicyError, load_policy
from .risk import assess


def handle_event(request: dict[str, Any]) -> dict[str, Any]:
    profile = request["profile"]
    challenge = request["challenge"]
    receipt = request["receipt"]
    now_ms = request["now_ms"]

    try:
        policy = load_policy()
    except PolicyError:
        return _response(
            request,
            qualification="not_qualified",
            replay=False,
            risk={"decision": "review", "score": 0.0, "signals": ["policy_parameter_missing"]},
            grant=None,
            reason_codes=["policy_parameter_missing"],
        )

    history = PurchaseHistory(profile["receipts"], now_ms, policy["history_window_days"])
    risk = assess(profile, receipt, history, policy).as_contract()

    processed = set(profile["processed_event_ids"])
    event_id = _stable_id("evt", request["idempotency_key"])
    already_issued = any(
        reward["challenge_id"] == challenge["challenge_id"] for reward in profile["issued_rewards"]
    )
    if (
        request["idempotency_key"] in processed
        or event_id in processed
        or receipt["receipt_id"] in processed
        or already_issued
    ):
        reasons = ["idempotent_replay"]
        if already_issued:
            reasons.append("reward_already_issued")
        return _response(request, "duplicate", True, risk, None, reasons)

    promise = profile.get("outstanding_promise")
    if promise is None or promise["fulfilled"]:
        return _response(request, "not_qualified", False, risk, None, ["promise_not_active"])
    if (
        promise["challenge_id"] != challenge["challenge_id"]
        or promise["challenge_version"] != challenge["challenge_version"]
        or promise["deadline_ms"] != challenge["target"]["deadline_ms"]
    ):
        return _response(request, "not_qualified", False, risk, None, ["promise_mismatch"])

    if receipt["returned"]:
        return _response(request, "not_qualified", False, risk, None, ["receipt_returned"])

    if receipt["purchased_at_ms"] < promise["published_at_ms"]:
        return _response(request, "not_qualified", False, risk, None, ["receipt_before_promise"])

    if receipt["purchased_at_ms"] > challenge["target"]["deadline_ms"]:
        return _response(request, "not_qualified", False, risk, None, ["receipt_window_expired"])

    if receipt["purchased_at_ms"] > now_ms:
        return _response(request, "not_qualified", False, risk, None, ["receipt_from_future"])

    qualification_reasons = _qualify(receipt, challenge["target"])
    if qualification_reasons:
        return _response(request, "not_qualified", False, risk, None, qualification_reasons)

    if risk["decision"] != "allow":
        return _response(
            request, "qualified", False, risk, None, ["receipt_qualified", f"risk_{risk['decision']}"]
        )

    return _response(
        request,
        "qualified",
        False,
        risk,
        _grant(challenge, receipt),
        ["receipt_qualified", "reward_issued_once"],
    )


def _qualify(receipt: dict[str, Any], target: dict[str, Any]) -> list[str]:
    """An empty list means the receipt completes the challenge. Otherwise, refusal reasons."""
    sku_ids = set(target["sku_ids"])
    matching = [
        line
        for line in receipt["lines"]
        if line["category"] == target["category"] and (not sku_ids or line["sku_id"] in sku_ids)
    ]
    if not matching:
        return ["receipt_category_mismatch"]

    paid_quantity = sum(
        line["quantity"] for line in matching if line["paid"] and line["amount_kopecks"] > 0
    )
    if paid_quantity == 0:
        return ["receipt_line_not_paid"]
    if paid_quantity < target["quantity"]:
        return ["receipt_quantity_insufficient"]
    return []


def _grant(challenge: dict[str, Any], receipt: dict[str, Any]) -> dict[str, Any]:
    seed = f"{challenge['challenge_id']}|{receipt['receipt_id']}"
    physical = challenge["reward"]["physical_sku"]
    return {
        "reward_id": _stable_id("rwd", seed),
        "item_instance_id": _stable_id("inst", seed),
        "item_id": challenge["reward"]["digital_item_id"],
        "sku_entitlement_id": _stable_id("ent", seed) if physical else None,
        "sku_id": physical["sku_id"] if physical else None,
    }


def _response(
    request: dict[str, Any],
    qualification: str,
    replay: bool,
    risk: dict[str, Any],
    grant: dict[str, Any] | None,
    reason_codes: list[str],
) -> dict[str, Any]:
    event_id = _stable_id("evt", request["idempotency_key"])
    billing = _build_billing(request, event_id) if grant is not None and not replay else None
    if billing is not None:
        reason_codes = [*reason_codes, "ad_billed_once"]
    return {
        "contract_version": 2,
        "request_id": request["request_id"],
        "server_time_ms": request["now_ms"],
        "event_id": event_id,
        "qualification": qualification,
        "idempotent_replay": replay,
        "risk": risk,
        "grant": grant,
        "billing": billing,
        "reason_codes": reason_codes,
    }


def _build_billing(request: dict[str, Any], event_id: str) -> dict[str, Any] | None:
    """First-price CPA: the charge equals the bid and happens only after allow + issue."""
    economics = request["challenge"]["economics"]
    campaign_id = economics.get("campaign_id")
    advertiser_id = economics.get("advertiser_id")
    if economics.get("funding_source") != "advertiser" or not campaign_id or not advertiser_id:
        return None
    bid = int(economics["bid_per_qualified_event_kopecks"])
    subsidy = int(economics["subsidy_kopecks"])
    return {
        "billing_id": _stable_id("bill", f"{event_id}|{campaign_id}"),
        "event_id": event_id,
        "profile_id": request["profile"]["profile_id"],
        "challenge_id": request["challenge"]["challenge_id"],
        "campaign_id": campaign_id,
        "advertiser_id": advertiser_id,
        "amount_kopecks": bid,
        "subsidy_kopecks": subsidy,
        "billed_at_ms": request["now_ms"],
    }


def _stable_id(prefix: str, seed: str) -> str:
    return f"{prefix}_{hashlib.sha1(seed.encode('utf-8')).hexdigest()[:12]}"
