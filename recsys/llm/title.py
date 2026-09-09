"""Collection title: a short caption written over the items already collected.

The model sees only collection facts — the names of completed sets and the item categories.
Any error, timeout, invalid JSON or contract violation yields a deterministic template with
source `fallback`. A title carries no amounts, discounts or promises: comparing people by
money is excluded at the validator level.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

from . import ollama, yandexgpt

SYSTEM_PROMPT = (
    "You invent a short player title for the \"X5 Checkpoint\" loyalty programme. "
    "A title is an honorific that sums up the collection: \"Bread Baron\", "
    "\"Coffee Alchemist\", \"Breakfast King\". "
    "Listing items or categories is forbidden: \"Toaster, pitcher, breakfast\" is a list, "
    "not a title. Three words at most, no commas, no digits, no money, no discounts and no "
    "promises. "
    "Answer with exactly one JSON object holding a single field title, without markdown."
)

MAX_TITLE_LENGTH = 28
WORD_PATTERN = re.compile(r"[\w-]+", re.UNICODE)
ENUMERATION_PATTERN = re.compile(r"[,;]|\s/\s")
FORBIDDEN_PATTERN = re.compile(
    r"\d|₽|\brub\b|\bruble|\brouble|discount|percent|%|\bfree\b|\bgift\b|\bwin\b|\bprize\b"
    r"|guarantee|cashback|\bsale\b|\bsave\b|\boff\b",
    re.IGNORECASE,
)


def build_title(profile: dict[str, Any], game: dict[str, Any]) -> tuple[dict[str, Any], str | None]:
    """Returns (title, LLM error). The error is for diagnostics only."""
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

    violations = check(draft.get("title"), facts)
    if violations:
        return {**template, "source": "fallback", "violations": violations}, "llm_contract_violation"

    return {**template, "title": draft["title"].strip(), "source": "llm", "violations": []}, None


def check(title: Any, facts: dict[str, Any] | None = None) -> list[str]:
    """A title describes the collection, promises nothing and does not retell its contents."""
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
    if ENUMERATION_PATTERN.search(value):
        violations.append("title_is_enumeration")
    if facts is not None and _repeats_collection(value, facts):
        violations.append("title_repeats_collection")
    return violations


def _repeats_collection(value: str, facts: dict[str, Any]) -> bool:
    """
    The model happily answers with a list of what was collected: "Toaster, pitcher, breakfast".
    Formally that is three words without money, so the earlier rules let such an answer through.
    A title counts as a retelling when at least two of its words come from item or category names.
    """
    source = " ".join(facts.get("item_names", []) + facts.get("top_categories", []))
    known = {_stem(word) for word in WORD_PATTERN.findall(source.lower()) if len(word) > 3}
    used = [_stem(word) for word in WORD_PATTERN.findall(value.lower()) if len(word) > 3]
    return sum(stem in known for stem in used) >= 2


def _stem(word: str) -> str:
    """Rough plural normalisation: "pitcher" and "pitchers" are one word."""
    return word[:-1] if len(word) > 4 and word.endswith("s") else word


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
    """Deterministic title: used both as a fallback and as a hint for the model."""
    completed = facts["completed_recipes"]
    categories = facts["top_categories"]

    if completed:
        title = f'"{completed[0]}" Master' if len(completed) == 1 else "Master of Collections"
        subtitle = f"Sets collected: {len(completed)}"
    elif facts["items_total"] > 0:
        title = _category_title(categories) or _collector_title(facts["distinct_items"])
        subtitle = (
            f"Mostly: {categories[0].lower()}" if categories
            else f"Items in the collection: {facts['items_total']}"
        )
    else:
        title = "Empty Shelf"
        subtitle = "Open a box or complete a challenge"

    return {"title": _fit(title), "subtitle": subtitle[:90]}


# Title by the leading category of the collection. These are screen captions, not a second item
# catalog: contents and categories arrive as a snapshot from the webapp, only the words live here.
CATEGORY_TITLES = {
    "Bread & Bakery": "Bread Baron",
    "Dairy": "Dairy Baron",
    "Fruit": "Fruit Connoisseur",
    "Vegetables & Herbs": "Garden Magnate",
    "Coffee & Tea": "Coffee Alchemist",
    "Snacks & Nuts": "Crunch Gourmet",
    "Eggs & Breakfast": "Breakfast King",
    "Baking Supplies": "Home Baker",
    "Fresh Food": "Fresh Food Expert",
    "Frozen Food": "Lord of Cold",
    "Healthy Drinks": "Vitamin Master",
    "Meat & Sausages": "Grill Master",
    "Fish & Asian Cuisine": "Chopstick Master",
    "Coffee & Desserts": "Sweet Coffee Fan",
    "Pizza & Ready Meals": "Pizza Magnate",
    "Cold Drinks & Ice Cream": "Ice Gourmet",
    "Ready Meals": "Quick Dinner Master",
    "Favourite Buys": "Loyal Regular",
    "Grains, Soups & Sauces": "Cauldron Keeper",
    "Noodles & Asian Cuisine": "Wok Commander",
    "Ice Cream & Desserts": "Chief Sweet Tooth",
    "Bread, Cheese & Deli": "Sandwich Master",
    "Groceries & Canned Food": "Pantry Keeper",
    "Vegetables, Fruit & Herbs": "Freshness Keeper",
}


def _category_title(categories: list[str]) -> str | None:
    """The title tells players apart by what they collect, not only by collection size."""
    for category in categories:
        title = CATEGORY_TITLES.get(category)
        if title is not None:
            return title
    return None


def _collector_title(distinct_items: int) -> str:
    """
    The title before the first completed set. It used to substitute the first word of a category
    ("Collector: dairy"), which left a dangling adjective instead of a name. The steps depend on
    collection size, so the title grows with the player and needs no category inflection.
    """
    if distinct_items <= 1:
        return "First Find"
    if distinct_items <= 3:
        return "Box Hunter"
    if distinct_items <= 6:
        return "Kitchen Enthusiast"
    return "Kitchen Magnate"


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
