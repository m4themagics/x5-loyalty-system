"""Прогоняет движок по независимо размеченным профилям и печатает отчёт о релевантности.

Порог: минимум 28 попаданий из 40. Отказ на допустимом профиле считается промахом,
профили после прогона не исключаются. Негативная выборка проверяется отдельно.

Разметку этот скрипт только читает: `rubric.json` фиксируется до прогона.

Запуск из корня репозитория: python3 recsys/eval/run_relevance.py
"""
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
EVAL_ROOT = ROOT / "recsys" / "eval"
EXAMPLES = ROOT / "recsys" / "contract" / "examples"
ENGINE = ROOT / "recsys" / "engine" / "cli.py"
NOW_MS = 1_788_598_800_000


def main() -> int:
    if not ENGINE.exists():
        print(f"движок не найден: {ENGINE}. Прогон невозможен.", file=sys.stderr)
        return 2

    rubric = json.loads((EVAL_ROOT / "rubric.json").read_text(encoding="utf-8"))
    game = json.loads((EXAMPLES / "game-snapshot.json").read_text(encoding="utf-8"))
    budget = json.loads((EXAMPLES / "budget.json").read_text(encoding="utf-8"))

    hits, misses = [], []
    for entry in rubric["eligible"]:
        profile = load_profile("eligible", entry["profile_id"])
        response = call_engine(profile, game, budget)
        if response is None:
            misses.append((entry["profile_id"], "движок вернул ошибку"))
            continue
        if response["status"] != "offer":
            misses.append((entry["profile_id"], f"отказ: {', '.join(response['reason_codes'])}"))
            continue
        item_id = response["challenge"]["reward"]["digital_item_id"]
        if item_id in entry["acceptable_item_ids"]:
            hits.append((entry["profile_id"], item_id))
        else:
            misses.append((entry["profile_id"], f"предмет вне рубрики: {item_id}"))

    refusal_correct, refusal_wrong = [], []
    for entry in rubric["refusal"]:
        profile = load_profile("refusal", entry["profile_id"])
        response = call_engine(profile, game, budget)
        if response is None:
            refusal_wrong.append((entry["profile_id"], "движок вернул ошибку"))
            continue
        if response["status"] == "no_action":
            expected = set(entry["expected_reason_codes"])
            matched = expected.issubset(set(response["reason_codes"]))
            if matched:
                refusal_correct.append(
                    (entry["profile_id"], ", ".join(response["reason_codes"]), True)
                )
            else:
                refusal_wrong.append((entry["profile_id"],
                    "неверная причина отказа: " + ", ".join(response["reason_codes"])))
        else:
            refusal_wrong.append((entry["profile_id"], "показано задание вместо отказа"))

    total = len(rubric["eligible"])
    minimum = rubric["threshold"]["minimum_hits"]

    print("Релевантность по отдельно хранимой рубрике синтетических профилей")
    print(f"  разметка: {rubric['label_status']} от {rubric['labelled_on']}, "
          f"экспертное подтверждение: {rubric['expert_confirmation']}")
    print(f"  знаменатель: {total}, порог: {minimum}")
    print(f"  попаданий: {len(hits)}, промахов: {len(misses)}")
    for profile_id, reason in misses:
        print(f"    промах {profile_id}: {reason}")

    print("\nНегативная выборка (ожидается отказ)")
    print(f"  корректных отказов: {len(refusal_correct)} из {len(rubric['refusal'])}")
    for profile_id, reasons, matched in refusal_correct:
        mark = "совпала" if matched else "иная"
        print(f"    {profile_id}: {reasons} (ожидаемая причина {mark})")
    for profile_id, reason in refusal_wrong:
        print(f"    ОШИБКА {profile_id}: {reason}")

    print(
        "\nЭто результат конкретного детерминированного набора синтетических профилей. "
        "Он не измеряет релевантность на реальных покупателях."
    )

    passed = (total == rubric["threshold"]["eligible_profiles"]
              and len(hits) >= minimum and not refusal_wrong)
    print(f"\nИТОГ: {'порог достигнут' if passed else 'порог не достигнут'}")
    return 0 if passed else 1


def load_profile(kind: str, profile_id: str) -> dict:
    return json.loads(
        (EVAL_ROOT / "profiles" / kind / f"{profile_id}.json").read_text(encoding="utf-8")
    )


def build_game_features(profile: dict, game: dict) -> dict:
    """Зеркало `buildDemoGameFeatures` из webapp: признаки считаются по тем же правилам."""
    owned = {entry["item_id"] for entry in profile["inventory"]}
    return {
        "inventory_total": sum(entry["quantity"] for entry in profile["inventory"]),
        "inventory_distinct": len(profile["inventory"]),
        "duplicate_item_ids": [
            entry["item_id"] for entry in profile["inventory"] if entry["quantity"] > 1
        ],
        "recipe_progress": [
            {
                "recipe_id": recipe["id"],
                "matched_count": sum(1 for item_id in recipe["item_ids"] if item_id in owned),
                "owned_item_ids": [item_id for item_id in recipe["item_ids"] if item_id in owned],
                "missing_item_ids": [
                    item_id for item_id in recipe["item_ids"] if item_id not in owned
                ],
            }
            for recipe in game["recipes"]
        ],
    }


def call_engine(profile: dict, game: dict, budget: dict) -> dict | None:
    request = {
        "contract_version": 1,
        "request_id": f"req-eval-{profile['profile_id']}",
        "now_ms": NOW_MS,
        "profile": profile,
        "game": game,
        "game_features": build_game_features(profile, game),
        "budget": budget,
    }
    result = subprocess.run(
        [sys.executable, str(ENGINE), "decision"],
        input=json.dumps(request, ensure_ascii=False),
        capture_output=True,
        text=True,
        cwd=str(ROOT),
        env={**os.environ, "LLM_PROVIDER": "template", "PYTHONDONTWRITEBYTECODE": "1"},
    )
    if result.returncode != 0:
        print(f"  движок: код {result.returncode}: {result.stderr.strip()}", file=sys.stderr)
        return None
    return json.loads(result.stdout)


if __name__ == "__main__":
    sys.exit(main())
