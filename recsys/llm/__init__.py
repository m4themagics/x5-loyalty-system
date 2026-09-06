"""Карточка задания: генерация текста поверх уже утверждённого решения.

Модель получает только утверждённые условия. Любая ошибка, таймаут, невалидный JSON,
отсутствие ключа или нарушение контракта дают корректный детерминированный шаблон
с источником `fallback`. Живая генерация без доступа к API не считается проверенной.
"""
from __future__ import annotations

import datetime as dt
import json
import os
from typing import Any

from . import ollama, yandexgpt
from .validate import check

SYSTEM_PROMPT = (
    "Ты пишешь короткий живой заголовок карточки задания для программы лояльности "
    "«X5 Чекпоинт». Фактический текст условий и награды добавит система. "
    "Ответь строго одним JSON-объектом с единственным полем headline, без markdown и пояснений."
)


def build_card(
    challenge: dict[str, Any],
    candidate: Any,
    policy: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    facts = _facts(challenge, candidate)
    template = _template_card(challenge, facts)

    provider = os.environ.get("LLM_PROVIDER", "template").lower()
    if provider == "ollama":
        result = ollama.complete(SYSTEM_PROMPT, _user_prompt(facts, template))
    elif provider == "yandexgpt" and yandexgpt.is_configured():
        result = yandexgpt.complete(SYSTEM_PROMPT, _user_prompt(facts, template))
    elif provider == "yandexgpt":
        return (
            {**template, "source": "fallback", "violations": []},
            _diagnostics("fallback", None, None, "yandexgpt_credentials_missing"),
        )
    else:
        return (
            {**template, "source": "fallback", "violations": []},
            _diagnostics("fallback", None, None, "llm_provider_disabled"),
        )
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

    if not isinstance(draft, dict) or set(draft) != {"headline"}:
        violations = ["unexpected_card_field"]
    else:
        violations = check({**template, "headline": draft.get("headline")}, challenge, facts["item_name"])
    if violations:
        return (
            {**template, "source": "fallback", "violations": violations},
            _diagnostics("fallback", result.model, result.latency_ms, "llm_contract_violation"),
        )

    return (
        {
            **template,
            "headline": draft["headline"],
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


def _user_prompt(facts: dict[str, Any], template: dict[str, Any]) -> str:
    return (
        f"Придумай один заголовок до 60 символов. Обязательно дословно включи название "
        f"«{facts['item_name']}». Можно обыграть рецепт «{facts['recipe_title']}». "
        "Не упоминай цену, срочность или гарантии. Пример формата ответа: "
        f"{json.dumps({'headline': facts['item_name']}, ensure_ascii=False)}"
    )


def _diagnostics(
    source: str, model: str | None, latency_ms: int | None, error: str | None
) -> dict[str, Any]:
    return {"source": source, "model": model, "latency_ms": latency_ms, "error": error}


def _format_date(timestamp_ms: int) -> str:
    return dt.datetime.fromtimestamp(timestamp_ms / 1000, dt.timezone.utc).strftime("%d.%m.%Y")


def _clip(value: str, limit: int) -> str:
    return value if len(value) <= limit else f"{value[: limit - 1].rstrip()}…"
