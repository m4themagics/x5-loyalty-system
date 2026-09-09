"""Challenge card: text generated on top of an already approved decision.

The model receives only approved terms. Any error, timeout, invalid JSON, missing key or
contract violation yields a correct deterministic template with source `fallback`. Live
generation without API access does not count as verified.
"""
from __future__ import annotations

import datetime as dt
import json
import os
from typing import Any

from . import ollama, yandexgpt
from .validate import check

SYSTEM_PROMPT = (
    "You write a short, lively headline for a challenge card in the \"X5 Checkpoint\" loyalty "
    "programme. The factual terms and reward text are added by the system. "
    "Answer with exactly one JSON object holding a single field headline, without markdown or "
    "explanations."
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
        "target_sku_names": candidate.target_sku_names,
        "quantity": challenge["target"]["quantity"],
        "window_days": challenge["target"]["window_days"],
        "deadline_date": _format_date(challenge["target"]["deadline_ms"]),
        "physical_name": physical["name"] if physical else None,
        "sponsor_name": candidate.sponsorship.advertiser_name,
        "sponsored": challenge["economics"]["funding_source"] == "advertiser",
    }


def _template_card(challenge: dict[str, Any], facts: dict[str, Any]) -> dict[str, Any]:
    reward = f"The \"{facts['item_name']}\" item"
    if facts["physical_name"]:
        reward += f" plus a free product: {facts['physical_name']}"

    target_names = " or ".join(f'"{name}"' for name in facts["target_sku_names"])
    target = (
        target_names
        if len(facts["target_sku_names"]) == 1
        else f"one of these products: {target_names}"
    )
    body = (
        f"Buy {target} before {facts['deadline_date']} and receive the "
        f"\"{facts['item_name']}\" item for the \"{facts['recipe_title']}\" recipe."
    )

    return {
        "headline": _clip(challenge["title"], 60),
        "body": _clip(body, 220),
        "reward_line": _clip(reward, 120),
        "deadline_line": f"Deadline: {facts['deadline_date']}",
        "sponsor_line": (
            _clip(f"Supported by the brand: {facts['sponsor_name'] or 'partner'}", 120)
            if facts["sponsored"]
            else None
        ),
    }


def _user_prompt(facts: dict[str, Any], template: dict[str, Any]) -> str:
    return (
        f"Write one headline of at most 60 characters. It must include the name "
        f"\"{facts['item_name']}\" verbatim. You may play on the \"{facts['recipe_title']}\" recipe. "
        "Do not mention price, urgency or guarantees. Example response format: "
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
