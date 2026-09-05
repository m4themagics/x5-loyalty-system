"""Квалификация синтетического чека и однократная выдача обещанного.

Повтор легитимного запроса возвращает прежний результат и сам по себе не является
мошенничеством. Бесплатные строки не закрывают задание.
"""
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
    already_issued = any(
        reward["challenge_id"] == challenge["challenge_id"] for reward in profile["issued_rewards"]
    )
    if request["idempotency_key"] in processed or receipt["receipt_id"] in processed or already_issued:
        reasons = ["idempotent_replay"]
        if already_issued:
            reasons.append("reward_already_issued")
        return _response(request, "duplicate", True, risk, None, reasons)

    if receipt["returned"]:
        return _response(request, "not_qualified", False, risk, None, ["receipt_returned"])

    if receipt["purchased_at_ms"] > challenge["target"]["deadline_ms"]:
        return _response(request, "not_qualified", False, risk, None, ["receipt_window_expired"])

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
    """Пустой список — чек закрывает задание. Иначе список причин отказа."""
    sku_ids = set(target["sku_ids"])
    matching = [
        line
        for line in receipt["lines"]
        if line["category"] == target["category"] and (not sku_ids or line["sku_id"] in sku_ids)
    ]
    if not matching:
        return ["receipt_category_mismatch"]

    paid_quantity = sum(line["quantity"] for line in matching if line["paid"])
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
    return {
        "contract_version": 1,
        "request_id": request["request_id"],
        "server_time_ms": request["now_ms"],
        "event_id": _stable_id("evt", request["idempotency_key"]),
        "qualification": qualification,
        "idempotent_replay": replay,
        "risk": risk,
        "grant": grant,
        "reason_codes": reason_codes,
    }


def _stable_id(prefix: str, seed: str) -> str:
    return f"{prefix}_{hashlib.sha1(seed.encode('utf-8')).hexdigest()[:12]}"
