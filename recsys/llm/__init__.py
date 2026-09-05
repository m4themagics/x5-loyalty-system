"""Карточка задания: генерация текста поверх уже утверждённого решения.

Модель получает только утверждённые условия. Любая ошибка, таймаут, невалидный JSON,
отсутствие ключа или нарушение контракта дают корректный детерминированный шаблон
с источником `fallback`. Живая генерация без доступа к API не считается проверенной.
"""
import datetime as dt
import json
from typing import Any

from . import yandexgpt
from .validate import check

SYSTEM_PROMPT = (
    "Ты пишешь короткую карточку задания для программы лояльности «X5 Чекпоинт». "
    "Все условия уже утверждены и менять их нельзя. Запрещено называть цену или сумму, "
    "выдумывать SKU, менять срок, обещать гарантированный результат, снимать проверку "
    "и скрывать пометку о спонсорстве. Ответь строго одним JSON-объектом с полями "
    "headline, body, reward_line, deadline_line, sponsor_line, без markdown и пояснений."
)


def build_card(
    challenge: dict[str, Any],
    candidate: Any,
    policy: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    facts = _facts(challenge, candidate)
    template = _template_card(challenge, facts)

    if not yandexgpt.is_configured():
        return (
            {**template, "source": "fallback", "violations": []},
            _diagnostics("fallback", None, None, "yandexgpt_credentials_missing"),
        )

    result = yandexgpt.complete(SYSTEM_PROMPT, _user_prompt(facts))
    if result.text is None:
        return (
            {**template, "source": "fallback", "violations": []},
            _diagnostics("fallback", result.model, result.latency_ms, result.error),
        )

    try:
        draft = json.loads(result.text)
    except json.JSONDecodeError:
        return (
            {**template, "source": "fallback", "violations": ["llm_invalid_json"]},
            _diagnostics("fallback", result.model, result.latency_ms, "llm_invalid_json"),
        )

    violations = check(draft, challenge, facts["item_name"])
    if violations:
        return (
            {**template, "source": "fallback", "violations": violations},
            _diagnostics("fallback", result.model, result.latency_ms, "llm_contract_violation"),
        )

    return (
        {
            "headline": draft["headline"],
            "body": draft["body"],
            "reward_line": draft["reward_line"],
            "deadline_line": draft["deadline_line"],
            "sponsor_line": draft.get("sponsor_line") or None,
            "source": "llm",
            "violations": [],
        },
        _diagnostics("llm", result.model, result.latency_ms, None),
    )


def _facts(challenge: dict[str, Any], candidate: Any) -> dict[str, Any]:
    physical = challenge["reward"]["physical_sku"]
    return {
        "item_name": candidate.item_name,
        "recipe_title": candidate.recipe_title,
        "matched_count": candidate.matched_count,
        "category": challenge["target"]["category"],
        "quantity": challenge["target"]["quantity"],
        "window_days": challenge["target"]["window_days"],
        "deadline_date": _format_date(challenge["target"]["deadline_ms"]),
        "physical_name": physical["name"] if physical else None,
        "sponsor_name": candidate.sponsorship.advertiser_name,
        "sponsored": challenge["economics"]["funding_source"] == "advertiser",
    }


def _template_card(challenge: dict[str, Any], facts: dict[str, Any]) -> dict[str, Any]:
    reward = f"Предмет «{facts['item_name']}»"
    if facts["physical_name"]:
        reward += f" и бесплатный товар: {facts['physical_name']}"

    body = (
        f"Купите один оплаченный товар из категории «{facts['category']}» до "
        f"{facts['deadline_date']} — предмет «{facts['item_name']}» приблизит рецепт "
        f"«{facts['recipe_title']}»."
    )

    return {
        "headline": _clip(challenge["title"], 60),
        "body": _clip(body, 220),
        "reward_line": _clip(reward, 120),
        "deadline_line": _clip(
            f"До {facts['deadline_date']}, оплаченных покупок: {facts['quantity']}", 120
        ),
        "sponsor_line": (
            _clip(f"При поддержке бренда: {facts['sponsor_name'] or 'партнёр'}", 120)
            if facts["sponsored"]
            else None
        ),
    }


def _user_prompt(facts: dict[str, Any]) -> str:
    lines = [
        f"Предмет-награда: {facts['item_name']}",
        f"Рецепт: {facts['recipe_title']}, уже собрано совпадений: {facts['matched_count']}",
        f"Категория покупки: {facts['category']}",
        f"Нужно оплаченных единиц: {facts['quantity']}",
        f"Срок: до {facts['deadline_date']}",
    ]
    if facts["physical_name"]:
        lines.append(f"Дополнительно обещан бесплатный товар: {facts['physical_name']}")
    lines.append(
        "Пометка о спонсорстве обязательна." if facts["sponsored"] else "Спонсора нет, поле sponsor_line оставь пустым."
    )
    lines.append(
        "В body обязательно назови следующий шаг покупателя и упомяни название предмета-награды."
    )
    return "\n".join(lines)


def _diagnostics(
    source: str, model: str | None, latency_ms: int | None, error: str | None
) -> dict[str, Any]:
    return {"source": source, "model": model, "latency_ms": latency_ms, "error": error}


def _format_date(timestamp_ms: int) -> str:
    return dt.datetime.fromtimestamp(timestamp_ms / 1000, dt.timezone.utc).strftime("%d.%m.%Y")


def _clip(value: str, limit: int) -> str:
    return value if len(value) <= limit else f"{value[: limit - 1].rstrip()}…"
