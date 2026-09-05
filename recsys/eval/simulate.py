"""Симуляция 1 000 синтетических пользователей с фиксированным seed.

Скрытая модель отклика отделена от входов политики: политика видит только допустимость,
наличие и бюджет и не знает, добавит ли игра покупку конкретному пользователю.

Маржа считается ТОЛЬКО по дополнительным покупкам. Покупки, которые произошли бы и без игры,
в выгоду не попадают: сценарий с нулевым эффектом обязан оказаться убыточным.

Все числа сценарные и синтетические. Это не измеренный эффект X5.

Запуск из корня репозитория: python3 recsys/eval/simulate.py
"""
import json
import pathlib
import random
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCENARIOS = ROOT / "recsys" / "eval" / "scenarios"


def main() -> int:
    rows = []
    for path in sorted(SCENARIOS.glob("*.json")):
        scenario = json.loads(path.read_text(encoding="utf-8"))
        rows.append(run_scenario(scenario))

    print("Симуляция 1 000 пользователей, фиксированный seed. Числа сценарные, не измеренные.\n")
    header = (
        f"{'Сценарий':<22}{'Показано':>9}{'Выполнено':>11}{'Доп. покупок':>14}"
        f"{'Расход, ₽':>12}{'Макс. резерв, ₽':>17}{'Маржа, ₽':>11}{'Итог, ₽':>11}"
    )
    print(header)
    print("-" * len(header))
    for row in rows:
        print(
            f"{row['name']:<22}{row['offers']:>9}{row['qualified']:>11}{row['incremental_purchases']:>14}"
            f"{rubles(row['spend_kopecks']):>12}{rubles(row['peak_reserved_kopecks']):>17}"
            f"{rubles(row['incremental_margin_kopecks']):>11}{rubles(row['net_kopecks']):>11}"
        )

    zero = next((row for row in rows if row["game_uplift_probability"] == 0), None)
    print()
    if zero is not None:
        verdict = "убыточным" if zero["net_kopecks"] < 0 else "ПРИБЫЛЬНЫМ — двойной учёт"
        print(f"Проверка нулевого эффекта: сценарий «{zero['name']}» оказался {verdict}.")
        if zero["net_kopecks"] >= 0:
            return 1

    print(
        "Дополнительная маржа начислена только за покупки, которых без игры не было. "
        "Резерв показан как полный максимум обязательств, а не как ожидаемый расход."
    )
    return 0


def run_scenario(scenario: dict) -> dict:
    random_source = random.Random(scenario["seed"])
    hidden = scenario["hidden"]
    economics = scenario["economics"]

    gift_cost = scenario["gift_unit_cost_kopecks"]
    instance_reserve = scenario["instance_reserve_kopecks"]
    coupon_max = scenario["coupon_max_kopecks"]
    operations = scenario["operations_cost_per_offer_kopecks"]

    # Обещания показываются раньше, чем разрешаются: полный максимум обязательств
    # держится одновременно по всей когорте, а не по одному пользователю.
    shown = [
        index
        for index in range(scenario["users"])
        if random_source.random() < scenario["offer_eligible_share"]
    ]
    offers = len(shown)
    peak_reserved = offers * (gift_cost + instance_reserve)

    qualified = 0
    incremental_purchases = 0
    coupons_crafted = 0
    coupons_redeemed = 0
    fraud_cases = 0
    open_coupon_reserve = 0

    for _ in shown:
        buys_anyway = random_source.random() < hidden["base_purchase_probability"]
        uplift = hidden["game_uplift_probability"]
        extra_draw = random_source.random()
        if uplift >= 0:
            buys_because_of_game = not buys_anyway and extra_draw < uplift
            cannibalised = False
        else:
            buys_because_of_game = False
            cannibalised = buys_anyway and extra_draw < -uplift

        if buys_because_of_game:
            incremental_purchases += 1
        if cannibalised:
            incremental_purchases -= 1

        purchased = (buys_anyway and not cannibalised) or buys_because_of_game
        if not purchased:
            continue
        if random_source.random() >= hidden["qualification_probability_given_purchase"]:
            continue

        qualified += 1
        if random_source.random() < hidden["fraud_share"]:
            fraud_cases += 1
        if random_source.random() < hidden["coupon_craft_probability"]:
            coupons_crafted += 1
            open_coupon_reserve += coupon_max
            if random_source.random() < hidden["coupon_redemption_probability"]:
                coupons_redeemed += 1

    peak_reserved = max(peak_reserved, open_coupon_reserve)

    gift_spend = qualified * max(0, gift_cost - economics["supplier_subsidy_per_gift_kopecks"])
    coupon_spend = coupons_redeemed * coupon_max
    fraud_loss = fraud_cases * economics["fraud_loss_per_case_kopecks"]
    operations_spend = offers * operations
    spend = gift_spend + coupon_spend + fraud_loss + operations_spend

    advertiser_income = qualified * economics["advertiser_payment_per_qualified_event_kopecks"]
    incremental_margin = (
        incremental_purchases * economics["incremental_margin_per_purchase_kopecks"]
    )

    return {
        "name": scenario["name"],
        "game_uplift_probability": hidden["game_uplift_probability"],
        "offers": offers,
        "qualified": qualified,
        "incremental_purchases": incremental_purchases,
        "coupons_crafted": coupons_crafted,
        "coupons_redeemed": coupons_redeemed,
        "fraud_cases": fraud_cases,
        "spend_kopecks": spend,
        "peak_reserved_kopecks": peak_reserved,
        "incremental_margin_kopecks": incremental_margin,
        "net_kopecks": incremental_margin + advertiser_income - spend,
    }


def rubles(kopecks: int) -> str:
    return f"{kopecks / 100:,.2f}".replace(",", " ")


if __name__ == "__main__":
    sys.exit(main())
