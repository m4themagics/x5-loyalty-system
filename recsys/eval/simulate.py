"""Four weekly steps with the real decision/event handlers and funded item accounting.

Response worlds are synthetic and unavailable to the policy. Every coupon consumes four
owned copies, including any explicitly funded starting inventory. No LLM API is called.
"""
import argparse
import copy
import json
import os
import pathlib
import random
import sys
from collections import Counter
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from recsys.engine.decision import handle_decision  # noqa: E402
from recsys.engine.event import handle_event  # noqa: E402
from recsys.engine.history import DAY_MS  # noqa: E402
from recsys.engine.policy import load_policy  # noqa: E402
from recsys.eval.population import build_population  # noqa: E402
from recsys.eval.run_relevance import build_game_features  # noqa: E402

EVAL = ROOT / "recsys/eval"
EXAMPLES = ROOT / "recsys/contract/examples"
NOW_MS = 1_788_598_800_000


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Run the heterogeneous synthetic X5 audience")
    parser.add_argument("--json-out", type=pathlib.Path, help="write aggregate reproducible report")
    args = parser.parse_args(argv)
    print("Синтетика: 1 000 пользователей, четыре недельных шага; реальные decision/event.")
    print("Состав откалиброван по пяти сегментам МП Пятёрочки из Q&A кейса.")
    print("Интерес к игре и поведенческие вероятности — явные синтетические допущения.")
    results = []
    for path in sorted((EVAL / "scenarios").glob("*.json")):
        row = run_scenario(load_json(path))
        results.append(row)
        print(f"\n{row['name']}: охват {row['served_users']}/{row['users']}, "
              f"заданий {row['offers']}, отказов {row['refusals']} "
              f"(бюджет: {row['budget_refusals']}), выдано предметов {row['items_granted']}")
        print(f"  купонов {row['coupons_crafted']}, потрачено копий {row['items_consumed']}, "
              f"первых физических товаров {row['physical_gifts']}")
        print(f"  подготовленных стартовых копий {row['initial_item_instances']}; "
              "их полный купонный резерв включён до первого показа")
        print(f"  покупочных дней: база {row['baseline_purchase_days']}, "
              f"игра {row['purchase_days']}, разница {row['incremental_purchases']}")
        print(f"  расходы {rubles(row['spend_kopecks'])} ₽; максимум резерва "
              f"{rubles(row['peak_reserved_kopecks'])} ₽; дополнительная маржа "
              f"{rubles(row['incremental_margin_kopecks'])} ₽; итог "
              f"{rubles(row['net_kopecks'])} ₽")
        print(f"  доход бренда {rubles(row['sponsor_income_kopecks'])} ₽; "
              f"субсидия {rubles(row['subsidy_income_kopecks'])} ₽")
        print(f"  остаток предметов {row['remaining_item_instances']}; "
              f"непогашенных купонов {row['outstanding_coupons']}; "
              f"причины отказов {row['refusal_reasons']}")
        print(f"  фонды (копейки): {json.dumps(row['final_budget'], ensure_ascii=False)}")
        print("  по сегментам аудитории:")
        for group in row["audience_breakdown"]:
            print(f"    {group['label']}: {group['users']} чел., охват {group['served_users']}, "
                  f"дельта дней {group['incremental_purchases']:+d}, итог {rubles(group['net_kopecks'])} ₽")
        print("  по отношению к игре:")
        for group in row["engagement_breakdown"]:
            print(f"    {group['label']}: {group['users']} чел., охват {group['served_users']}, "
                  f"дельта дней {group['incremental_purchases']:+d}, итог {rubles(group['net_kopecks'])} ₽")
    print("\nИтог не является прогнозом X5. Доходы бренда/субсидии — отдельные допущения; "
          "нет сравнения с фиксированным заданием или проверки привычки после поощрений. "
          "Даже нулевой прирост может окупаться финансированием: это не рост покупок.")
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        report = {
            "report_version": 1,
            "population": "synthetic_pyaterochka_mobile_app_audience",
            "evidence_boundary": {
                "case_fact": "Пять долей сегментов МП ТС5 из Q&A кейса",
                "synthetic_assumptions": [
                    "интерес к игре", "вероятность покупки категории задания",
                    "отклик на игру", "крафт и погашение", "экономика сценария",
                ],
                "not_a_forecast": True,
            },
            "scenarios": results,
        }
        args.json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Агрегированный отчёт: {args.json_out}")
    return 0


def run_scenario(scenario: dict) -> dict:
    # Explicit provider override keeps a 4,000-decision evaluation offline and reproducible.
    with patch.dict(os.environ, {"LLM_PROVIDER": "template"}):
        return _run_scenario(scenario)


def _run_scenario(scenario: dict) -> dict:
    game = load_json(EXAMPLES / "game-snapshot.json")
    policy = load_policy()
    instance_cost = policy["instance_reserve_kopecks"]
    coupon_max = policy["coupon_max_kopecks"]
    craft_size = game["craft_size"]
    if craft_size != 4 or instance_cost * craft_size != coupon_max:
        raise ValueError("Simulation requires the agreed four-item pooled coupon contract")
    budget = copy.deepcopy(scenario.get("budget", load_json(EXAMPLES / "budget.json")))
    templates = [load_json(path) for path in sorted((EVAL / "profiles/eligible").glob("*.json"))]
    prepared = [profile for profile in templates if item_count(profile)]
    traits = build_population(scenario)
    profiles = []
    for index, trait in enumerate(traits):
        profile = copy.deepcopy(templates[index % len(templates)])
        profile["profile_id"] = f"sim-{index:04d}"
        profile["label"] = f"Синтетический профиль {index:04d}"
        source_inventory = prepared[index % len(prepared)]["inventory"][0]
        profile["inventory"] = ([] if trait["inventory_count"] == 0 else [{
            "item_id": source_inventory["item_id"], "quantity": trait["inventory_count"]
        }])
        trait["organic_line"] = copy.deepcopy(profile["receipts"][0]["lines"][0])
        if trait["missing_history"]:
            profile["receipts"] = []
            profile["risk_signals"]["confirmed_purchase_days"] = 0
        profiles.append(profile)

    external_coupon_reserve = budget["coupon_reserved_kopecks"]
    prior_settled = budget["coupon_settled_kopecks"] + budget["physical_settled_kopecks"]
    initial_items = sum(item_count(profile) for profile in profiles)
    budget["coupon_reserved_kopecks"] += initial_items * instance_cost
    check_budget(budget)
    peak_reserve = budget["coupon_reserved_kopecks"] + budget["physical_reserved_kopecks"]
    counts = Counter()
    reasons = Counter()
    served = set()
    audience_stats, engagement_stats = {}, {}
    audience_served, engagement_served = {}, {}
    for index, trait in enumerate(traits):
        _slice_add(audience_stats, trait["audience_segment"], trait["audience_label"], "users", 1)
        _slice_add(engagement_stats, trait["engagement"], trait["engagement_label"], "users", 1)
        audience_served.setdefault(trait["audience_segment"], set())
        engagement_served.setdefault(trait["engagement"], set())
    hidden, economics = scenario["hidden"], scenario["economics"]
    paid_margin = sponsor_income = subsidy_income = fraud_loss = operations = 0

    for cycle in range(scenario.get("cycles", 4)):
        now = NOW_MS + cycle * 7 * DAY_MS
        pending = {}
        # Publish the cohort first; all current promises reserve their full maxima together.
        for index, profile in enumerate(profiles):
            decision = handle_decision({
                "contract_version": 1, "request_id": f"sim-{index}-{cycle}", "now_ms": now,
                "profile": profile, "game": game,
                "game_features": build_game_features(profile, game), "budget": dict(budget),
            })
            if decision["status"] != "offer":
                counts["refusals"] += 1
                reasons.update(decision["reason_codes"])
                counts["budget_refusals"] += any("budget_insufficient" in r for r in decision["reason_codes"])
                continue
            challenge = decision["challenge"]
            reservation = challenge["reservation"]
            budget["coupon_reserved_kopecks"] += reservation["coupon_reserve_kopecks"]
            budget["physical_reserved_kopecks"] += reservation["physical_reserve_kopecks"]
            check_budget(budget)
            peak_reserve = max(peak_reserve, budget["coupon_reserved_kopecks"] + budget["physical_reserved_kopecks"])
            pending[index] = challenge
            profile["outstanding_promise"] = {
                "challenge_id": challenge["challenge_id"],
                "challenge_version": challenge["challenge_version"],
                "decision_id": decision["decision_id"], "published_at_ms": now,
                "deadline_ms": challenge["target"]["deadline_ms"], "fulfilled": False,
            }
            counts["offers"] += 1
            served.add(index)
            audience_served[traits[index]["audience_segment"]].add(index)
            engagement_served[traits[index]["engagement"]].add(index)
            _record_slices(audience_stats, engagement_stats, traits[index], "offers", 1)
            _record_slices(audience_stats, engagement_stats, traits[index], "operations_kopecks",
                           scenario["operations_cost_per_offer_kopecks"])
            operations += scenario["operations_cost_per_offer_kopecks"]

        for index, profile in enumerate(profiles):
            trait = traits[index]
            # Per-person/per-step independent random draws preserve potential outcomes across worlds.
            draw = random.Random(scenario["seed"] + index * 7919 + cycle * 104729)
            base_draw, effect_draw, qualify_draw, craft_draw, redeem_draw, fraud_draw = [draw.random() for _ in range(6)]
            baseline_probability = min(1.0, hidden["base_purchase_probability"]
                                       * trait["baseline_purchase_multiplier"])
            baseline = base_draw < baseline_probability
            counts["baseline_purchase_days"] += baseline
            challenge = pending.get(index)
            purchased = baseline
            if challenge:
                uplift = hidden["game_uplift_probability"]
                multiplier = (trait["positive_response_multiplier"] if uplift >= 0
                              else trait["negative_response_multiplier"])
                uplift = max(-1.0, min(1.0, uplift * multiplier))
                if uplift >= 0:
                    purchased = baseline or (not baseline and effect_draw < uplift)
                else:
                    purchased = baseline and not (effect_draw < -uplift)
            counts["purchase_days"] += purchased
            counts["incremental_purchases"] += int(purchased) - int(baseline)
            delta = int(purchased) - int(baseline)
            margin_delta = delta * economics["incremental_margin_per_purchase_kopecks"]
            paid_margin += margin_delta
            _record_slices(audience_stats, engagement_stats, trait, "baseline_purchase_days", int(baseline))
            _record_slices(audience_stats, engagement_stats, trait, "purchase_days", int(purchased))
            _record_slices(audience_stats, engagement_stats, trait, "incremental_purchases", delta)
            _record_slices(audience_stats, engagement_stats, trait, "incremental_margin_kopecks", margin_delta)
            if not challenge:
                if purchased:
                    _append_organic_receipt(profile, trait["organic_line"], index, cycle, now)
                continue

            granted = False
            if purchased:
                target = challenge["target"]
                receipt = {
                    "receipt_id": f"receipt-sim-{index}-{cycle}", "purchased_at_ms": now + DAY_MS,
                    "store_id": "synthetic-store", "returned": False,
                    "lines": [{"sku_id": target["sku_ids"][0], "category": target["category"],
                               "quantity": target["quantity"],
                               "paid": qualify_draw < hidden["qualification_probability_given_purchase"],
                               "amount_kopecks": 10000}],
                }
                event = handle_event({
                    "contract_version": 1, "request_id": f"event-sim-{index}-{cycle}",
                    "idempotency_key": receipt["receipt_id"], "now_ms": now + DAY_MS,
                    "profile": profile, "challenge": challenge, "receipt": receipt,
                })
                profile["receipts"].append(receipt)
                grant = event["grant"]
                if grant:
                    granted = True
                    counts["qualified"] += 1
                    _record_slices(audience_stats, engagement_stats, trait, "qualified", 1)
                    counts["items_granted"] += 1
                    add_item(profile, grant["item_id"])
                    profile["issued_rewards"].append({**grant, "challenge_id": challenge["challenge_id"],
                        "source_event_id": event["event_id"], "issued_at_ms": now + DAY_MS})
                    profile["processed_event_ids"].append(receipt["receipt_id"])
                    physical_cost = challenge["reservation"]["physical_reserve_kopecks"]
                    budget["physical_reserved_kopecks"] -= physical_cost
                    budget["physical_settled_kopecks"] += physical_cost
                    counts["physical_gifts"] += bool(grant["sku_entitlement_id"])
                    _record_slices(audience_stats, engagement_stats, trait,
                                   "physical_cost_kopecks", physical_cost)
                    # Realised sponsor fulfilment is an explicit world assumption, not policy truth.
                    if challenge["economics"]["funding_source"] == "advertiser":
                        sponsor_income += economics["advertiser_payment_per_qualified_event_kopecks"]
                        subsidy_income += min(physical_cost, economics["supplier_subsidy_per_gift_kopecks"])
                        _record_slices(audience_stats, engagement_stats, trait, "sponsor_income_kopecks",
                                       economics["advertiser_payment_per_qualified_event_kopecks"])
                        _record_slices(audience_stats, engagement_stats, trait, "subsidy_income_kopecks",
                                       min(physical_cost, economics["supplier_subsidy_per_gift_kopecks"]))
                    if fraud_draw < hidden["fraud_share"]:
                        counts["fraud_cases"] += 1
                        fraud_loss += economics["fraud_loss_per_case_kopecks"]
                        _record_slices(audience_stats, engagement_stats, trait, "fraud_loss_kopecks",
                                       economics["fraud_loss_per_case_kopecks"])
                    craft_probability = _scaled_probability(
                        trait["coupon_craft_probability"], hidden["coupon_craft_probability"], 0.42)
                    if (item_count(profile) >= craft_size and profile["active_coupon"] is None
                            and craft_draw < craft_probability):
                        consume_items(profile, craft_size)
                        counts["items_consumed"] += craft_size
                        counts["coupons_crafted"] += 1
                        # Four funded item reserves become one equally funded coupon, without release.
                        profile["active_coupon"] = {"max_kopecks": coupon_max}
                    redeem_probability = _scaled_probability(
                        trait["coupon_redemption_probability"], hidden["coupon_redemption_probability"], 0.55)
                    if profile["active_coupon"] and redeem_draw < redeem_probability:
                        budget["coupon_reserved_kopecks"] -= coupon_max
                        budget["coupon_settled_kopecks"] += coupon_max
                        counts["coupons_redeemed"] += 1
                        _record_slices(audience_stats, engagement_stats, trait,
                                       "coupon_cost_kopecks", coupon_max)
                        profile["active_coupon"] = None
                else:
                    counts["events_without_grant"] += 1
            if not granted:
                # The fixed seven-day promise expires only after this week's opportunity ends.
                budget["coupon_reserved_kopecks"] -= challenge["reservation"]["coupon_reserve_kopecks"]
                budget["physical_reserved_kopecks"] -= challenge["reservation"]["physical_reserve_kopecks"]
            profile["outstanding_promise"] = None
            check_budget(budget)

    remaining = sum(item_count(profile) for profile in profiles)
    outstanding_coupons = sum(profile["active_coupon"] is not None for profile in profiles)
    if initial_items + counts["items_granted"] != remaining + counts["items_consumed"]:
        raise AssertionError("Item conservation failed")
    if budget["coupon_reserved_kopecks"] != external_coupon_reserve + remaining * instance_cost + outstanding_coupons * coupon_max:
        raise AssertionError("Coupon reserve does not match outstanding item/coupon liabilities")
    spend = budget["coupon_settled_kopecks"] + budget["physical_settled_kopecks"] - prior_settled + fraud_loss + operations
    audience_breakdown = _finish_slices(audience_stats, audience_served, "audience_segment")
    engagement_breakdown = _finish_slices(engagement_stats, engagement_served, "engagement")
    return {
        **{name: counts[name] for name in (
            "offers", "refusals", "budget_refusals", "qualified", "items_granted", "items_consumed",
            "coupons_crafted", "coupons_redeemed", "physical_gifts", "fraud_cases",
            "purchase_days", "baseline_purchase_days", "incremental_purchases")},
        "name": scenario["name"], "users": scenario["users"], "served_users": len(served),
        "initial_item_instances": initial_items, "remaining_item_instances": remaining,
        "outstanding_coupons": outstanding_coupons, "final_budget": budget,
        "refusal_reasons": dict(reasons), "spend_kopecks": spend,
        "peak_reserved_kopecks": peak_reserve, "incremental_margin_kopecks": paid_margin,
        "sponsor_income_kopecks": sponsor_income, "subsidy_income_kopecks": subsidy_income,
        "audience_breakdown": audience_breakdown, "engagement_breakdown": engagement_breakdown,
        "net_kopecks": paid_margin + sponsor_income + subsidy_income - spend,
    }


def _slice_add(stats, key, label, field, value):
    row = stats.setdefault(key, {"label": label})
    row[field] = row.get(field, 0) + value


def _record_slices(audience_stats, engagement_stats, trait, field, value):
    _slice_add(audience_stats, trait["audience_segment"], trait["audience_label"], field, value)
    _slice_add(engagement_stats, trait["engagement"], trait["engagement_label"], field, value)


def _finish_slices(stats, served, key_name):
    rows = []
    for key, values in stats.items():
        row = {key_name: key, **values, "served_users": len(served[key])}
        row["net_kopecks"] = (
            row.get("incremental_margin_kopecks", 0)
            + row.get("sponsor_income_kopecks", 0)
            + row.get("subsidy_income_kopecks", 0)
            - row.get("physical_cost_kopecks", 0)
            - row.get("coupon_cost_kopecks", 0)
            - row.get("fraud_loss_kopecks", 0)
            - row.get("operations_kopecks", 0)
        )
        rows.append(row)
    return rows


def _scaled_probability(person_probability, scenario_probability, reference_probability):
    if scenario_probability <= 0:
        return 0.0
    return min(1.0, person_probability * scenario_probability / reference_probability)


def _append_organic_receipt(profile, source_line, index, cycle, now):
    line = copy.deepcopy(source_line)
    line["paid"] = True
    profile["receipts"].append({
        "receipt_id": f"organic-sim-{index}-{cycle}", "purchased_at_ms": now + DAY_MS,
        "store_id": "synthetic-store", "returned": False, "lines": [line],
    })
    profile["risk_signals"]["confirmed_purchase_days"] += 1


def check_budget(budget):
    for fund in ("coupon", "physical"):
        settled, reserved = (budget[f"{fund}_{kind}_kopecks"] for kind in ("settled", "reserved"))
        if settled < 0 or reserved < 0 or settled + reserved > budget[f"{fund}_fund_kopecks"]:
            raise AssertionError(f"Unfunded {fund} obligation: {budget}")


def item_count(profile):
    return sum(entry["quantity"] for entry in profile["inventory"])


def add_item(profile, item_id):
    for entry in profile["inventory"]:
        if entry["item_id"] == item_id:
            entry["quantity"] += 1
            return
    profile["inventory"].append({"item_id": item_id, "quantity": 1})


def consume_items(profile, count):
    if item_count(profile) < count:
        raise AssertionError("Cannot craft a coupon without four owned item copies")
    for entry in profile["inventory"]:
        used = min(entry["quantity"], count)
        entry["quantity"] -= used
        count -= used
    profile["inventory"] = [entry for entry in profile["inventory"] if entry["quantity"]]


def rubles(kopecks: int) -> str:
    return f"{kopecks / 100:,.2f}".replace(",", " ")


if __name__ == "__main__":
    sys.exit(main())
