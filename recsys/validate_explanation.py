"""Проверяет объяснение маршрута против уже выбранного действия.

LLM получает валидированный action payload и может только назвать маршрут, описать один
следующий ход и объяснить причину. Всё остальное — нарушение контракта из раздела 8.5
описания проекта: LLM не меняет механику, срок, стоимость, eligibility и funding, не создаёт
SKU и условия, не снимает fraud hold и не обещает причинный эффект.

Невалидный ответ блокируется, вместо него отдаётся детерминированный шаблон.
"""
import json, pathlib, re, sys

ALLOWED_KEYS = {"action_id", "title", "short_story", "explanation"}
LIMITS = {"title": 40, "short_story": 90, "explanation": 220}

MONEY = re.compile(r"\d+[\s ]*(?:₽|руб)", re.I)
SKU = re.compile(r"\bsku[_\-]?\d+\b", re.I)
DAYS = re.compile(r"\b(\d+)\s*(?:дн|дней|день|дня)", re.I)
CAUSAL = re.compile(r"гарантир|обязательно вернёт|увеличит ваши покупки|доказан|точно приведёт", re.I)
HOLD_LIFTED = re.compile(r"награда ваша|забирайте сейчас|получите сразу|hold снят", re.I)

FALLBACK = {
    "personal_finish": "Один следующий покупочный день завершает маршрут.",
    "store_coop": "Один следующий покупочный день добавит вклад в цель магазина.",
    "family_relay": "Награда придёт после подтверждённой покупки приглашённого.",
    "no_action": "Сейчас предложений нет.",
}


def check(action, explanation):
    """Возвращает список нарушений. Пустой список — ответ можно показывать."""
    problems = []
    if explanation is None:
        return ["нет объяснения"]

    extra = set(explanation) - ALLOWED_KEYS
    if extra:
        problems.append(f"лишние поля: {', '.join(sorted(extra))}")
    for key in ALLOWED_KEYS:
        if key not in explanation:
            problems.append(f"нет поля {key}")

    if explanation.get("action_id") != action["action_id"]:
        problems.append("action_id не совпадает с выбранным действием")

    for field, limit in LIMITS.items():
        value = explanation.get(field)
        if isinstance(value, str) and len(value) > limit:
            problems.append(f"{field} длиннее {limit} символов")

    text = " ".join(str(explanation.get(f, "")) for f in ("title", "short_story", "explanation"))

    if MONEY.search(text):
        problems.append("названа цена или стоимость")
    for sku in SKU.findall(text):
        if sku.lower() != str(action.get("reinforcement_id") or "").lower():
            problems.append(f"выдуман SKU {sku}")
    for days in DAYS.findall(text):
        if action.get("window_days") is None or int(days) != action["window_days"]:
            problems.append(f"срок {days} дн. не совпадает с окном действия")
    if CAUSAL.search(text):
        problems.append("обещан причинный эффект")
    if action.get("status") == "delayed" and HOLD_LIFTED.search(text):
        problems.append("снят fraud hold")

    return problems


def fallback_for(action):
    return {
        "action_id": action["action_id"],
        "title": "Ваш чекпоинт",
        "short_story": FALLBACK.get(action["mechanic_id"], FALLBACK["no_action"]),
        "explanation": "Условия маршрута показаны без изменений.",
    }


def main():
    root = pathlib.Path(__file__).parent
    failures = 0
    for path in sorted((root / "fixtures").glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        action = doc.get("action")
        if action is None:
            continue
        problems = check(action, doc.get("explanation"))
        if problems:
            failures += 1
            print(f"{path.name}: ЗАБЛОКИРОВАНО — {'; '.join(problems)}")
            print(f"  fallback: {fallback_for(action)['short_story']}")
        else:
            print(f"{path.name}: ок")

    adversarial = json.loads((root / "fixtures/explanations-adversarial.json").read_text(encoding="utf-8"))
    print("\nПопытки нарушить контракт:")
    for case in adversarial["cases"]:
        problems = check(case["action"], case["explanation"])
        expected = case["expected_problem"]
        hit = any(expected in p for p in problems)
        print(f"  {'✓' if hit else '✗'} {case['name']}: {'; '.join(problems) or 'не поймано'}")
        if not hit:
            failures += 1

    print("\nвсе объяснения проходят контракт" if not failures else f"\nнарушений: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
