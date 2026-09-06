"""Титул коллекции: короткая подпись поверх уже собранных предметов.

Модель видит только факты коллекции — названия собранных наборов и категории предметов.
Любая ошибка, таймаут, невалидный JSON или нарушение контракта дают детерминированный
шаблон с источником `fallback`. Титул не содержит сумм, скидок и обещаний: сравнение
людей по деньгам исключено на уровне валидатора.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

from . import ollama, yandexgpt

SYSTEM_PROMPT = (
    "Ты придумываешь короткий титул игрока для программы лояльности «X5 Чекпоинт». "
    "Титул описывает собранную коллекцию продуктовых предметов: не более трёх слов, "
    "без цифр, без денег, без скидок и без обещаний. "
    "Ответь строго одним JSON-объектом с единственным полем title, без markdown."
)

MAX_TITLE_LENGTH = 28
FORBIDDEN_PATTERN = re.compile(
    r"\d|₽|руб|скидк|процент|%|бесплатн|подар|выигр|приз|гарант|кэшбэк|кешбэк",
    re.IGNORECASE,
)


def build_title(profile: dict[str, Any], game: dict[str, Any]) -> tuple[dict[str, Any], str | None]:
    """Возвращает (титул, ошибка LLM). Ошибка нужна только диагностике."""
    facts = collect_facts(profile, game)
    template = template_title(facts)

    provider = os.environ.get("LLM_PROVIDER", "template").lower()
    if provider == "ollama":
        result = ollama.complete(SYSTEM_PROMPT, _user_prompt(facts))
    elif provider == "yandexgpt" and yandexgpt.is_configured():
        result = yandexgpt.complete(SYSTEM_PROMPT, _user_prompt(facts))
    elif provider == "yandexgpt":
        return {**template, "source": "fallback", "violations": []}, "yandexgpt_credentials_missing"
    else:
        return {**template, "source": "fallback", "violations": []}, "llm_provider_disabled"

    if result.text is None:
        return {**template, "source": "fallback", "violations": []}, result.error

    try:
        draft = json.loads(result.text)
    except json.JSONDecodeError:
        return {**template, "source": "fallback", "violations": ["llm_invalid_json"]}, "llm_invalid_json"

    if not isinstance(draft, dict) or set(draft) != {"title"}:
        return {**template, "source": "fallback", "violations": ["unexpected_title_field"]}, "llm_contract_violation"

    violations = check(draft.get("title"))
    if violations:
        return {**template, "source": "fallback", "violations": violations}, "llm_contract_violation"

    return {**template, "title": draft["title"].strip(), "source": "llm", "violations": []}, None


def check(title: Any) -> list[str]:
    """Титул описывает коллекцию и ничего не обещает."""
    if not isinstance(title, str) or not title.strip():
        return ["title_empty"]

    value = title.strip()
    violations: list[str] = []
    if len(value) > MAX_TITLE_LENGTH:
        violations.append("title_too_long")
    if len(value.split()) > 3:
        violations.append("title_too_many_words")
    if FORBIDDEN_PATTERN.search(value):
        violations.append("title_mentions_money_or_promise")
    return violations


def collect_facts(profile: dict[str, Any], game: dict[str, Any]) -> dict[str, Any]:
    items = {item["id"]: item for item in game.get("items", [])}
    recipes = {recipe["id"]: recipe for recipe in game.get("recipes", [])}

    owned = [
        {"name": items[entry["item_id"]]["name"], "category": items[entry["item_id"]]["category"], "quantity": entry["quantity"]}
        for entry in profile.get("inventory", [])
        if entry["item_id"] in items
    ]
    completed = [
        recipes[recipe_id]["title"]
        for recipe_id in profile.get("progress", {}).get("completed_recipe_ids", [])
        if recipe_id in recipes
    ]

    categories: dict[str, int] = {}
    for entry in owned:
        categories[entry["category"]] = categories.get(entry["category"], 0) + entry["quantity"]
    top_categories = [name for name, _ in sorted(categories.items(), key=lambda pair: (-pair[1], pair[0]))][:2]

    return {
        "items_total": sum(entry["quantity"] for entry in owned),
        "distinct_items": len(owned),
        "completed_recipes": completed,
        "top_categories": top_categories,
        "item_names": [entry["name"] for entry in owned][:6],
    }


def template_title(facts: dict[str, Any]) -> dict[str, str]:
    """Детерминированный титул: используется как fallback и как подсказка модели."""
    completed = facts["completed_recipes"]
    categories = facts["top_categories"]

    if completed:
        title = f"Мастер «{completed[0]}»" if len(completed) == 1 else "Мастер коллекций"
        subtitle = f"Собранных наборов: {len(completed)}"
    elif facts["items_total"] > 0:
        title = _category_title(categories) or _collector_title(facts["distinct_items"])
        subtitle = (
            f"Больше всего: {categories[0].lower()}" if categories
            else f"Предметов в коллекции: {facts['items_total']}"
        )
    else:
        title = "Пустая полка"
        subtitle = "Откройте коробку или выполните задание"

    return {"title": _fit(title), "subtitle": subtitle[:90]}


# Титул по главной категории коллекции. Это подписи к экрану, а не второй каталог предметов:
# состав и категории приходят снимком из webapp, здесь лежат только слова.
CATEGORY_TITLES = {
    "Хлеб и выпечка": "Хлебный барон",
    "Молочные продукты": "Молочный барон",
    "Фрукты": "Фруктовый знаток",
    "Овощи и зелень": "Грядочный магнат",
    "Кофе и чай": "Кофейный алхимик",
    "Снеки и орехи": "Хрустящий гурман",
    "Яйца и завтраки": "Король завтрака",
    "Всё для выпечки": "Домашний пекарь",
    "Свежие продукты": "Знаток свежего",
    "Замороженные продукты": "Повелитель холода",
    "Полезные напитки": "Витаминный мастер",
    "Мясо и колбасы": "Гриль-мастер",
    "Рыба и азиатская кухня": "Мастер палочек",
    "Кофе и десерты": "Сластёна с кофе",
    "Пицца и готовая еда": "Пицца-магнат",
    "Холодные напитки и мороженое": "Ледяной гурман",
    "Готовая еда": "Мастер быстрого ужина",
    "Любимые покупки": "Верный поклонник",
    "Крупы, супы и соусы": "Хозяин казана",
    "Лапша и азиатская кухня": "Повелитель вока",
    "Мороженое и десерты": "Главный сластёна",
    "Хлеб, сыр и колбасы": "Мастер сэндвича",
    "Бакалея и консервы": "Хранитель запасов",
    "Овощи, фрукты и зелень": "Хранитель свежести",
}


def _category_title(categories: list[str]) -> str | None:
    """Титул различает игроков по тому, что они собирают, а не только по размеру коллекции."""
    for category in categories:
        title = CATEGORY_TITLES.get(category)
        if title is not None:
            return title
    return None


def _collector_title(distinct_items: int) -> str:
    """
    Титул до первого собранного набора. Раньше здесь подставлялось первое слово категории
    («Собиратель: молочные»), и получалось повисшее прилагательное вместо названия.
    Ступени зависят от размера коллекции, поэтому титул растёт вместе с игроком
    и не требует склонения категорий.
    """
    if distinct_items <= 1:
        return "Первая находка"
    if distinct_items <= 3:
        return "Охотник за коробками"
    if distinct_items <= 6:
        return "Кухонный энтузиаст"
    return "Кухонный магнат"


def _fit(title: str) -> str:
    if len(title) <= MAX_TITLE_LENGTH:
        return title
    cut = title[:MAX_TITLE_LENGTH].rstrip()
    return cut[: cut.rfind(' ')] if ' ' in cut else cut


def _user_prompt(facts: dict[str, Any]) -> str:
    return json.dumps(
        {
            "collected_items": facts["item_names"],
            "completed_sets": facts["completed_recipes"],
            "main_categories": facts["top_categories"],
        },
        ensure_ascii=False,
    )
