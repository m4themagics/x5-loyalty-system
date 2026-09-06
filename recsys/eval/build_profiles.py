"""Строит независимый набор оценочных профилей и рубрику приемлемых решений.

Разметка фиксируется ДО прогона движка и не подстраивается под его ответы. Критерий
приемлемости продуктовый, а не копия ранжирования: показанное задание должно лежать в
категории, которую человек действительно покупает, и приближать хотя бы один рецепт.

Все записи помечены `label_status: "agent_draft"`. Статус экспертной оценки появляется только
после подтверждения человеком.

Запуск из корня репозитория: python3 recsys/eval/build_profiles.py
"""
import json
import pathlib
import random

ROOT = pathlib.Path(__file__).resolve().parents[2]
EVAL_ROOT = ROOT / "recsys" / "eval"
EXAMPLES = ROOT / "recsys" / "contract" / "examples"

DAY_MS = 86_400_000
NOW_MS = 1_788_598_800_000
LABEL_STATUS = "agent_draft"
LABELLED_ON = "2026-09-05"

SEED = 20260905
CONTRACT_VERSION = 2


def main() -> None:
    game = json.loads((EXAMPLES / "game-snapshot.json").read_text(encoding="utf-8"))
    catalog = json.loads((ROOT / "recsys/engine/data/sku_catalog.json").read_text(encoding="utf-8"))

    gift_categories = sorted(
        {sku["category"] for sku in catalog["gift_skus"] if sku["stock"] > 0}
    )
    paid_categories = {sku["category"] for sku in catalog["skus"] if sku["stock"] > 0}
    fundable = [category for category in gift_categories if category in paid_categories]

    items_by_category: dict[str, list[str]] = {}
    for item in game["items"]:
        items_by_category.setdefault(item["category"], []).append(item["id"])
    recipe_items = {recipe["id"]: recipe["item_ids"] for recipe in game["recipes"]}
    in_any_recipe = {item_id for item_ids in recipe_items.values() for item_id in item_ids}

    random_source = random.Random(SEED)
    eligible = [
        build_eligible_profile(index, fundable, items_by_category, in_any_recipe, random_source)
        for index in range(1, 41)
    ]
    refusals = build_refusal_profiles(fundable, items_by_category)

    write_profiles(EVAL_ROOT / "profiles/eligible", [profile for profile, _ in eligible])
    write_profiles(EVAL_ROOT / "profiles/refusal", [profile for profile, _ in refusals])

    rubric = {
        "notes": (
            "Независимая разметка. Приемлемым считается любое задание, категория которого есть в "
            "истории покупок профиля и предмет которого недостающий в каком-либо рецепте. "
            "Рубрика допускает множество решений и не повторяет порядок ранжирования движка. "
            "Допустимые профили оцениваются в цифровом цикле после onboarding: так прогон измеряет "
            "релевантность RecSys отдельно от охвата Ads первого физического подарка."
        ),
        "label_status": LABEL_STATUS,
        "labelled_on": LABELLED_ON,
        "expert_confirmation": "не проводилась",
        "threshold": {"eligible_profiles": 40, "minimum_hits": 28},
        "eligible": [entry for _, entry in eligible],
        "refusal": [entry for _, entry in refusals],
    }
    (EVAL_ROOT / "rubric.json").write_text(
        json.dumps(rubric, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"профилей: {len(eligible)} допустимых, {len(refusals)} отказных; рубрика записана")


def build_eligible_profile(
    index: int,
    fundable: list[str],
    items_by_category: dict[str, list[str]],
    in_any_recipe: set[str],
    random_source: random.Random,
) -> tuple[dict, dict]:
    profile_id = f"eval-{index:02d}"
    familiar_count = 1 + (index % 3)
    categories = random_source.sample(fundable, familiar_count)

    # Неудобные случаи: редкие визиты, дубликаты и почти собранный рецепт.
    rare_visits = index % 7 == 0
    duplicate_heavy = index % 5 == 0
    nearly_complete = index % 11 == 0
    shared_household = index % 4 == 0

    receipts = []
    for position, category in enumerate(categories):
        days_ago = (55 if rare_visits else 3 + position * 4) + index % 5
        receipts.append(
            {
                "receipt_id": f"rcp-{profile_id}-{position}",
                "purchased_at_ms": NOW_MS - days_ago * DAY_MS,
                "store_id": f"store-eval-{index % 6}",
                "returned": False,
                "lines": [
                    {
                        "sku_id": f"sku-eval-{position}",
                        "category": category,
                        "quantity": 1,
                        "paid": True,
                        "amount_kopecks": 7900 + index * 100,
                    }
                ],
            }
        )

    inventory: list[dict] = []
    if duplicate_heavy:
        duplicate_item = items_by_category[categories[0]][0]
        inventory.append({"item_id": duplicate_item, "quantity": 3})
    if nearly_complete:
        inventory.extend(
            {"item_id": item_id, "quantity": 1}
            for item_id in ["club-toaster", "milk-pitcher", "travel-mug"]
        )

    acceptable = acceptable_items(categories, inventory, items_by_category, in_any_recipe)
    if not acceptable and duplicate_heavy:
        # Инвариант набора: у допустимого профиля есть хотя бы один приемлемый ответ.
        # Дубликаты не должны выкупать единственный предмет знакомой категории.
        inventory = [entry for entry in inventory if entry["quantity"] == 1]
        acceptable = acceptable_items(categories, inventory, items_by_category, in_any_recipe)
    if not acceptable:
        raise AssertionError(f"{profile_id}: допустимый профиль без приемлемого ответа")

    unacceptable = sorted(
        {
            item_id
            for category, item_ids in items_by_category.items()
            if category not in categories
            for item_id in item_ids
        }
    )

    profile = {
        "snapshot_version": CONTRACT_VERSION,
        "profile_id": profile_id,
        "label": f"Оценочный синтетический профиль {index:02d}",
        "synthetic": True,
        "receipts": receipts,
        "inventory": inventory,
        "issued_rewards": [],
        "processed_event_ids": [],
        "active_coupon": None,
        "outstanding_promise": None,
        "progress": {
            "completed_recipe_ids": [],
            "avatar_level": 0,
            "redeemed_savings_28d_kopecks": 0,
        },
        "referral": {
            "invited_by_profile_id": None,
            "invited_at_ms": None,
            "had_confirmed_purchase_before_invite": False,
            "inviter_rewards_in_window": 0,
        },
        "risk_signals": {
            "device_id": f"device-eval-{index}",
            "household_id": f"household-eval-{index % 9}" if shared_household else None,
            "account_age_days": 30 + index * 3,
            "confirmed_purchase_days": len(receipts),
        },
    }

    entry = {
        "profile_id": profile_id,
        "familiar_categories": categories,
        "acceptable_item_ids": acceptable,
        "unacceptable_item_ids": unacceptable[:12],
        "expected_status": "offer",
        "rationale": "Категория есть в истории, предмет недостающий в рецепте.",
        "label_status": LABEL_STATUS,
        "labelled_on": LABELLED_ON,
    }
    return profile, entry


def acceptable_items(
    categories: list[str],
    inventory: list[dict],
    items_by_category: dict[str, list[str]],
    in_any_recipe: set[str],
) -> list[str]:
    owned = {entry["item_id"] for entry in inventory}
    return sorted(
        {
            item_id
            for category in categories
            for item_id in items_by_category.get(category, [])
            if item_id in in_any_recipe and item_id not in owned
        }
    )


def build_refusal_profiles(
    fundable: list[str],
    items_by_category: dict[str, list[str]],
) -> list[tuple[dict, dict]]:
    def base(profile_id: str, label: str) -> dict:
        return {
            "snapshot_version": CONTRACT_VERSION,
            "profile_id": profile_id,
            "label": label,
            "synthetic": True,
            "receipts": [],
            "inventory": [],
            "issued_rewards": [],
            "processed_event_ids": [],
            "active_coupon": None,
            "outstanding_promise": None,
            "progress": {
                "completed_recipe_ids": [],
                "avatar_level": 0,
                "redeemed_savings_28d_kopecks": 0,
            },
            "referral": {
                "invited_by_profile_id": None,
                "invited_at_ms": None,
                "had_confirmed_purchase_before_invite": False,
                "inviter_rewards_in_window": 0,
            },
            "risk_signals": {
                "device_id": f"device-{profile_id}",
                "household_id": None,
                "account_age_days": 60,
                "confirmed_purchase_days": 0,
            },
        }

    def receipt(receipt_id: str, days_ago: int, category: str, paid: bool = True) -> dict:
        return {
            "receipt_id": receipt_id,
            "purchased_at_ms": NOW_MS - days_ago * DAY_MS,
            "store_id": "store-eval-refusal",
            "returned": False,
            "lines": [
                {
                    "sku_id": "sku-eval-refusal",
                    "category": category,
                    "quantity": 1,
                    "paid": paid,
                    "amount_kopecks": 6900,
                }
            ],
        }

    cases: list[tuple[dict, dict]] = []

    empty = base("eval-refusal-01", "Отказ: покупок нет вовсе")
    cases.append((empty, refusal_entry(empty, "no_purchase_history", "История покупок пуста.")))

    unpaid = base("eval-refusal-02", "Отказ: только бесплатные строки в истории")
    unpaid["receipts"] = [receipt("rcp-ref-02", 5, fundable[0], paid=False)]
    cases.append((unpaid, refusal_entry(unpaid, "no_purchase_history", "Бесплатные строки не создают покупочный день.")))

    foreign = base("eval-refusal-03", "Отказ: покупки только вне игрового каталога")
    foreign["receipts"] = [receipt("rcp-ref-03", 4, "Бытовая химия")]
    foreign["risk_signals"]["confirmed_purchase_days"] = 1
    cases.append((foreign, refusal_entry(foreign, "category_not_in_history", "Ни одна купленная категория не связана с предметом рецепта.")))

    no_gift = base("eval-refusal-04", "Отказ: у знакомой категории нет обеспеченного подарка")
    no_gift["receipts"] = [receipt("rcp-ref-04", 3, "Готовая еда")]
    no_gift["risk_signals"]["confirmed_purchase_days"] = 1
    cases.append((no_gift, refusal_entry(no_gift, "sku_out_of_stock", "Для категории нет подарочного SKU с остатком.")))

    outstanding = base("eval-refusal-05", "Отказ: действующее невыполненное обещание")
    outstanding["receipts"] = [receipt("rcp-ref-05", 2, fundable[0])]
    outstanding["risk_signals"]["confirmed_purchase_days"] = 1
    outstanding["outstanding_promise"] = {
        "challenge_id": "chl_eval_open",
        "challenge_version": 1,
        "decision_id": "dec_eval_open",
        "published_at_ms": NOW_MS - DAY_MS,
        "deadline_ms": NOW_MS + 4 * DAY_MS,
        "fulfilled": False,
    }
    cases.append((outstanding, refusal_entry(outstanding, "promise_already_outstanding", "Новое обещание не показывается поверх действующего.")))

    stale = base("eval-refusal-06", "Отказ: покупки старше окна истории")
    stale["receipts"] = [receipt("rcp-ref-06", 200, fundable[0])]
    cases.append((stale, refusal_entry(stale, "no_purchase_history", "Покупки за пределами окна истории не считаются знакомой категорией.")))

    returned = base("eval-refusal-07", "Отказ: единственная покупка возвращена")
    returned["receipts"] = [receipt("rcp-ref-07", 3, fundable[0])]
    returned["receipts"][0]["returned"] = True
    cases.append((returned, refusal_entry(returned, "no_purchase_history", "Возвращённый чек не создаёт покупочный день.")))

    unknown_item = base("eval-refusal-08", "Отказ: знакомая категория без предмета в рецептах")
    unknown_item["receipts"] = [receipt("rcp-ref-08", 6, "Любимые покупки")]
    unknown_item["risk_signals"]["confirmed_purchase_days"] = 1
    cases.append((unknown_item, refusal_entry(unknown_item, "sku_out_of_stock", "Для категории нет обеспеченного товара; предмет один и без подарка.")))

    assert items_by_category  # каталог нужен только для проверки согласованности данных
    return cases


def refusal_entry(profile: dict, reason_code: str, rationale: str) -> dict:
    return {
        "profile_id": profile["profile_id"],
        "expected_status": "no_action",
        "expected_reason_codes": [reason_code],
        "rationale": rationale,
        "label_status": LABEL_STATUS,
        "labelled_on": LABELLED_ON,
    }


def write_profiles(directory: pathlib.Path, profiles: list[dict]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for existing in directory.glob("*.json"):
        existing.unlink()
    for profile in profiles:
        path = directory / f"{profile['profile_id']}.json"
        path.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
