"""Оценка контура креативов: детекция нарушений, ложные срабатывания и починка.

Детекция без ложных срабатываний ничего не значит: валидатор, отвергающий всё подряд, покажет
100% детекции и будет бесполезен. Поэтому здесь три числа — доля пойманных мутаций по категориям,
доля ложных срабатываний на легитимных вариантах и доля успешно починенных креативов.

Мутации порождаются детерминированно из валидных фикстур, поэтому набор воспроизводим и растёт
вместе с фикстурами.
"""
import copy, json, pathlib, re, sys
from collections import defaultdict

from validate_explanation import check, fallback_for

ROOT = pathlib.Path(__file__).parent


def load_valid():
    out = []
    for path in sorted((ROOT / "fixtures").glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        if doc.get("decision") and doc.get("creative_copy"):
            out.append((path.stem, doc["decision"], doc["creative_copy"]))
    return out


# --- мутации: каждая ломает ровно одно правило ---------------------------------

def m_price(d, c):
    c["body"] = "Заберите товар за 149 ₽ бесплатно."
    return c

def m_sku(d, c):
    c["body"] = "В награду положен sku_999 после визита."
    return c

def m_deadline(d, c):
    if d.get("window_days") is None:
        return None
    c["body"] = f"У вас есть {d['window_days'] + 9} дней на визит."
    return c

def m_causal(d, c):
    c["body"] = "Маршрут гарантированно поднимет вашу экономию за месяц."
    return c

def m_hold(d, c):
    if d.get("status") != "delayed":
        return None
    c["body"] = "Награда ваша, забирайте сейчас после покупки."
    return c

def m_sponsorship(d, c):
    if d.get("surface_result") != "sponsored":
        return None
    c.pop("sponsored_label", None)
    return c

def m_swap(d, c):
    c["decision_id"] = "dec_9999"
    return c

def m_urgency(d, c):
    c["body"] = "Только сегодня: вернитесь за покупкой."
    return c

def m_no_next_step(d, c):
    c["body"] = "Отличный день для хорошего настроения."
    return c

def m_extra_field(d, c):
    c["discount_percent"] = 20
    return c

def m_overflow(d, c):
    c["title"] = "Очень длинный заголовок про кофейный маршрут, который никуда не помещается совсем"
    return c

MUTATIONS = {
    "выдуманная цена": m_price,
    "выдуманный SKU": m_sku,
    "изменённый срок": m_deadline,
    "обещание эффекта": m_causal,
    "снятие hold": m_hold,
    "скрытая маркировка": m_sponsorship,
    "подмена решения": m_swap,
    "ложная срочность": m_urgency,
    "нет следующего шага": m_no_next_step,
    "лишнее поле": m_extra_field,
    "переполнение длины": m_overflow,
}


# --- легитимные варианты: их отвергать нельзя ----------------------------------

def benign_variants(decision, card):
    out = []
    a = copy.deepcopy(card); a["cta"] = "Открыть маршрут"; out.append(("другой CTA", a))
    b = copy.deepcopy(card); b["progress"] = ""; out.append(("без прогресса", b))
    c = copy.deepcopy(card)
    c["body"] = c["body"].replace("Один визит", "Ещё один визит") if "Один визит" in c["body"] else c["body"] + " Ждём вас за покупкой."
    out.append(("перефразированный текст", c))
    return out


# --- починка: детерминированный ремонт вместо отказа ---------------------------

def repair(decision, card):
    fixed = copy.deepcopy(card)
    fixed["decision_id"] = decision["decision_id"]
    for field in list(fixed):
        if field not in {"decision_id", "title", "body", "progress", "cta", "sponsored_label"}:
            fixed.pop(field)
    text_fields = ("title", "body")
    for f in text_fields:
        if f in fixed:
            fixed[f] = re.sub(r"\d+[\s ]*(?:₽|руб)\w*", "", str(fixed[f]))
            fixed[f] = re.sub(r"\bsku[_\-]?\d+\b", "", fixed[f], flags=re.I)
            fixed[f] = re.sub(r"гарантированно|только сегодня|последний шанс|торопитесь", "", fixed[f], flags=re.I)
            fixed[f] = re.sub(r"награда ваша|забирайте сейчас|получите сразу", "", fixed[f], flags=re.I)
            fixed[f] = re.sub(r"\s{2,}", " ", fixed[f]).strip()
    template = fallback_for(decision)
    if not check(decision, fixed):
        return fixed, "repaired"
    return template, "fallback"


def main():
    valid = load_valid()
    if not valid:
        print("нет валидных фикстур"); return 1

    # 1. ложные срабатывания
    controls, false_positives = 0, []
    for name, decision, card in valid:
        for label, variant in [("исходный", card)] + benign_variants(decision, card):
            controls += 1
            problems = check(decision, variant)
            if problems:
                false_positives.append(f"{name} / {label}: {'; '.join(problems)}")

    # 2. детекция по категориям
    per_cat = defaultdict(lambda: [0, 0])
    misses, repaired, fell_back = [], 0, 0
    for name, decision, card in valid:
        for cat, mutate in MUTATIONS.items():
            mutated = mutate(decision, copy.deepcopy(card))
            if mutated is None:
                continue
            per_cat[cat][1] += 1
            problems = check(decision, mutated)
            if problems:
                per_cat[cat][0] += 1
                _, how = repair(decision, mutated)
                repaired += how == "repaired"
                fell_back += how == "fallback"
            else:
                misses.append(f"{name} / {cat}")

    total_hits = sum(h for h, _ in per_cat.values())
    total_cases = sum(n for _, n in per_cat.values())

    print(f"Легитимных вариантов: {controls}, ложных срабатываний: {len(false_positives)}")
    for fp in false_positives:
        print("  ЛОЖНОЕ:", fp)
    print(f"\nМутаций: {total_cases}, поймано: {total_hits} ({total_hits / total_cases:.0%})\n")
    print(f"{'категория':<24} {'поймано':>10}")
    for cat, (hits, n) in sorted(per_cat.items()):
        mark = "" if hits == n else "  <-- пропуск"
        print(f"{cat:<24} {hits:>5}/{n:<4}{mark}")
    if misses:
        print("\nПропущено:")
        for m in misses:
            print("  ", m)
    print(f"\nПосле блокировки: починено {repaired}, отдан шаблон {fell_back}")
    return 1 if (false_positives or misses) else 0


if __name__ == "__main__":
    sys.exit(main())
