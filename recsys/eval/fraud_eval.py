"""Оценка простого скоринга риска на размеченных синтетических случаях.

Порог задан заранее в `recsys/engine/data/policy.json` и не подбирается под итоговую выборку.
Калибровочная выборка объясняет выбор порога, итоговая измеряет результат.

Автоматическим отказом считаются решения `hold` и `reject`. Решение `review` — это стоимость
ручной проверки, а не блокировка пользователя.

Запуск из корня репозитория: python3 recsys/eval/fraud_eval.py
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from recsys.engine.history import PurchaseHistory  # noqa: E402
from recsys.engine.policy import load_policy  # noqa: E402
from recsys.engine.risk import assess  # noqa: E402

CASES = ROOT / "recsys" / "eval" / "fraud" / "cases.json"
NOW_MS = 1_788_598_800_000

# Стоимость ошибок задаётся до оценки и объясняет, почему precision важнее recall.
MISSED_ABUSE_COST_KOPECKS = 3_500
FALSE_BLOCK_COST_KOPECKS = 12_000
MANUAL_REVIEW_COST_KOPECKS = 900


def main() -> int:
    payload = json.loads(CASES.read_text(encoding="utf-8"))
    policy = load_policy()

    print("Скоринг риска на размеченных синтетических случаях")
    print(f"  разметка: {payload['label_status']} от {payload['labelled_on']}")
    print(f"  порог: {policy['risk']['review_score']} / {policy['risk']['hold_score']} / "
          f"{policy['risk']['reject_score']} (review / hold / reject), источник: {payload['threshold_source']}")
    print(f"  порог зафиксирован до итоговой оценки: "
          f"{'да' if payload['threshold_fixed_before_final_scoring'] else 'нет'}")

    for split in ("calibration", "final"):
        report(split, [case for case in payload["cases"] if case["split"] == split], policy)

    print(
        "\nНабор искусственно сбалансирован: доли злоупотреблений здесь заданы вручную и не равны "
        "реальной частоте мошенничества. Переносить precision и recall на прод нельзя."
    )
    return 0


def report(split: str, cases: list[dict], policy: dict) -> None:
    refused_abuse = refused_legit = missed_abuse = reviewed = 0
    legit_total = abuse_total = 0
    misses: list[str] = []

    for case in cases:
        history = PurchaseHistory(
            case["profile"]["receipts"], NOW_MS, policy["history_window_days"]
        )
        decision = assess(case["profile"], case["receipt"], history, policy).decision
        refused = decision in {"hold", "reject"}
        if decision == "review":
            reviewed += 1

        if case["label"] == "abuse":
            abuse_total += 1
            if refused:
                refused_abuse += 1
            else:
                missed_abuse += 1
                misses.append(f"{case['case_id']}: {decision} — {case['description']}")
        else:
            legit_total += 1
            if refused:
                refused_legit += 1

    refused_total = refused_abuse + refused_legit
    precision = refused_abuse / refused_total if refused_total else 0.0
    recall = refused_abuse / abuse_total if abuse_total else 0.0
    false_block_rate = refused_legit / legit_total if legit_total else 0.0
    expected_loss = (
        missed_abuse * MISSED_ABUSE_COST_KOPECKS
        + refused_legit * FALSE_BLOCK_COST_KOPECKS
        + reviewed * MANUAL_REVIEW_COST_KOPECKS
    )

    label = "Калибровочная выборка" if split == "calibration" else "Итоговая выборка"
    print(f"\n{label}: {len(cases)} случаев ({abuse_total} злоупотреблений, {legit_total} легитимных)")
    print(f"  автоматических отказов: {refused_total}")
    print(f"  precision: {precision:.2f}   recall: {recall:.2f}")
    print(f"  ошибочные блокировки легитимных: {refused_legit} ({false_block_rate:.0%})")
    print(f"  отправлено на ручную проверку: {reviewed} ({reviewed / len(cases):.0%})")
    print(f"  ожидаемые потери на выборке: {expected_loss / 100:.2f} ₽")
    for miss in misses:
        print(f"    пропуск {miss}")


if __name__ == "__main__":
    sys.exit(main())
