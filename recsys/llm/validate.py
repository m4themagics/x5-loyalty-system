"""Детерминированные ограничения карточки относительно уже утверждённого решения.

LLM объясняет валидированное действие. Она не имеет права придумать цену или SKU, изменить
срок, обещать причинный эффект, снять удержание или скрыть пометку о спонсорстве.
Правила согласованы с `recsys/validate_explanation.py`.
"""
import re
from typing import Any

LIMITS = {"headline": 60, "body": 220, "reward_line": 120, "deadline_line": 120, "sponsor_line": 120}
TEXT_FIELDS = ("headline", "body", "reward_line", "deadline_line", "sponsor_line")

MONEY = re.compile(r"\d+[\s  ]*(?:₽|руб)", re.I)
SKU = re.compile(r"\bsku[_\-][a-z0-9_\-]+\b", re.I)
DAYS = re.compile(r"\b(\d+)\s*(?:дн|дней|день|дня)", re.I)
CAUSAL = re.compile(r"гарантир|обязательно вернёт|увеличит ваши покупки|доказан|точно приведёт", re.I)
HOLD_LIFTED = re.compile(r"награда ваша|забирайте сейчас|получите сразу|hold снят", re.I)
URGENCY = re.compile(r"только сегодня|последний шанс|успей|осталось \d+ час|торопитесь", re.I)
NEXT_STEP = re.compile(r"визит|покупк|купит|купи|верн|зайд|чек", re.I)


def check(card: Any, challenge: dict[str, Any], item_name: str) -> list[str]:
    """Возвращает список нарушений. Пустой список — карточку можно показывать."""
    if not isinstance(card, dict):
        return ["card_not_an_object"]

    problems: list[str] = []
    allowed = set(TEXT_FIELDS)
    if set(card) - allowed:
        problems.append("unexpected_card_field")

    for field in ("headline", "body", "reward_line", "deadline_line"):
        value = card.get(field)
        if not isinstance(value, str) or not value.strip():
            problems.append("missing_required_field")
            break

    for field, limit in LIMITS.items():
        value = card.get(field)
        if isinstance(value, str) and len(value) > limit:
            problems.append("field_too_long")
            break

    text = " ".join(str(card.get(field) or "") for field in TEXT_FIELDS)

    if MONEY.search(text):
        problems.append("invented_price")
    allowed_skus = {sku.lower() for sku in challenge["target"]["sku_ids"]}
    physical = challenge["reward"]["physical_sku"]
    if physical:
        allowed_skus.add(physical["sku_id"].lower())
    if any(sku.lower() not in allowed_skus for sku in SKU.findall(text)):
        problems.append("invented_sku")
    window_days = challenge["target"]["window_days"]
    if any(int(days) != window_days for days in DAYS.findall(text)):
        problems.append("changed_deadline")
    if CAUSAL.search(text):
        problems.append("promised_causal_lift")
    if HOLD_LIFTED.search(text):
        problems.append("released_hold")
    if URGENCY.search(text):
        problems.append("false_urgency")

    sponsored = challenge["economics"]["funding_source"] == "advertiser"
    sponsor_line = card.get("sponsor_line")
    if sponsored and not sponsor_line:
        problems.append("hidden_sponsorship")
    if not sponsored and sponsor_line:
        problems.append("sponsor_label_on_organic")

    body = str(card.get("body") or "")
    if body and not NEXT_STEP.search(body):
        problems.append("missing_next_step")
    if item_name and item_name.lower() not in text.lower():
        problems.append("reward_mismatch")

    return sorted(set(problems))
