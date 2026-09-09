"""Four weekly steps with the real decision/event handlers and funded item accounting.

Response worlds are synthetic and unavailable to the policy. Every coupon consumes four
owned copies, including any explicitly funded starting inventory. No LLM API is called.
"""
import argparse
import copy
import hashlib
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
from recsys.eval.policies import choose_decision  # noqa: E402
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
    print("Synthetic: 1,000 users, four weekly steps; real decision/event calls.")
    print("The mix is calibrated to the five Pyaterochka mobile-app segments from the case Q&A.")
    print("Interest in the game and behavioural probabilities are explicit synthetic assumptions.")
    results = []
    for path in sorted((EVAL / "scenarios").glob("*.json")):
        row = run_scenario(load_json(path))
        results.append(row)
        print(f"\n{row['name']}: coverage {row['served_users']}/{row['users']}, "
              f"challenges {row['offers']}, refusals {row['refusals']} "
              f"(budget: {row['budget_refusals']}), items granted {row['items_granted']}")
        print(f"  coupons {row['coupons_crafted']}, copies spent {row['items_consumed']}, "
              f"first physical products {row['physical_gifts']}")
        print(f"  seeded starting copies {row['initial_item_instances']}; "
              "their full coupon reserve is counted before the first impression")
        print(f"  purchase days: baseline {row['baseline_purchase_days']}, "
              f"game {row['purchase_days']}, difference {row['incremental_purchases']}")
        print(f"  spend RUB {rubles(row['spend_kopecks'])}; peak reserve "
              f"RUB {rubles(row['peak_reserved_kopecks'])}; incremental margin "
              f"RUB {rubles(row['incremental_margin_kopecks'])}; net "
              f"RUB {rubles(row['net_kopecks'])}")
        print(f"  brand income RUB {rubles(row['sponsor_income_kopecks'])}; "
              f"subsidy RUB {rubles(row['subsidy_income_kopecks'])}")
        print(f"  items remaining {row['remaining_item_instances']}; "
              f"unredeemed coupons {row['outstanding_coupons']}; "
              f"refusal reasons {row['refusal_reasons']}")
        print(f"  funds (kopecks): {json.dumps(row['final_budget'], ensure_ascii=False)}")
        print("  by audience segment:")
        for group in row["audience_breakdown"]:
            print(f"    {group['label']}: {group['users']} users, coverage {group['served_users']}, "
                  f"day delta {group['incremental_purchases']:+d}, net RUB {rubles(group['net_kopecks'])}")
        print("  by attitude to the game:")
        for group in row["engagement_breakdown"]:
            print(f"    {group['label']}: {group['users']} users, coverage {group['served_users']}, "
                  f"day delta {group['incremental_purchases']:+d}, net RUB {rubles(group['net_kopecks'])}")
    print("\nThe result is not an X5 forecast. CPA and subsidy come from the challenge and are "
          "collected with a fixed multiplier. Policy comparison lives in compare_policies.py; "
          "there is no check of habit after incentives. "
          "Even zero increment can pay off through funding: that is not purchase growth.")
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        report = {
            "report_version": 1,
            "population": "synthetic_pyaterochka_mobile_app_audience",
            "evidence_boundary": {
                "case_fact": "Five Pyaterochka mobile-app segment shares from the case Q&A",
                "synthetic_assumptions": [
                    "interest in the game", "probability of buying the challenge category",
                    "response to the game", "crafting and redemption", "scenario economics",
                ],
                "not_a_forecast": True,
            },
            "scenarios": results,
        }
        args.json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Aggregate report: {args.json_out}")
    return 0


def run_scenario(scenario: dict, policy_name: str = "personalized_broad") -> dict:
    # Explicit provider override keeps a 4,000-decision evaluation offline and reproducible.
    with patch.dict(os.environ, {"LLM_PROVIDER": "template"}):
        return _run_scenario(scenario, policy_name)


def _run_scenario(scenario: dict, policy_name: str = "personalized_broad") -> dict:
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
        profile["label"] = f"Synthetic profile {index:04d}"
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
    outcomes_hash = hashlib.sha256()

    for cycle in range(scenario.get("cycles", 4)):
        now = NOW_MS + cycle * 7 * DAY_MS
        pending = {}
        # Publish the cohort first; all current promises reserve their full maxima together.
        for index, profile in enumerate(profiles):
            decision = choose_decision({
                "contract_version": 2, "request_id": f"sim-{index}-{cycle}", "now_ms": now,
                "profile": profile, "game": game,
                "game_features": build_game_features(profile, game), "budget": dict(budget),
            }, handle_decision, policy_name)
            if decision["status"] != "offer":
                counts["refusals"] += 1
                reasons.update(decision["reason_codes"])
                counts["budget_refusals"] += _is_budget_refusal(decision)
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
            draws = potential_outcomes(scenario["seed"], index, cycle)
            outcomes_hash.update(json.dumps(draws, separators=(",", ":")).encode("ascii"))
            base_draw, effect_draw, qualify_draw, craft_draw, redeem_draw, fraud_draw = draws
            baseline_probability = min(1.0, hidden["base_purchase_probability"]
                                       * trait["baseline_purchase_multiplier"])
            baseline = base_draw < baseline_probability
            counts["baseline_purchase_days"] += baseline
            challenge = pending.get(index)
            purchased = baseline
            if challenge:
                uplift = hidden["game_uplift_probability"]
                if policy_name == "reward_only":
                    # Explicit synthetic assumption, not an estimated contribution of the game.
                    uplift *= scenario.get("reward_only_response_multiplier", 0.75)
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
                    "contract_version": 2, "request_id": f"event-sim-{index}-{cycle}",
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
                    # Collect only the declared CPA and subsidy, once per granted event.
                    if challenge["economics"]["funding_source"] == "advertiser":
                        counts["sponsored_qualified"] += 1
                        _record_slices(audience_stats, engagement_stats, trait, "sponsored_qualified", 1)
                        payment, subsidy = realised_funding(challenge, economics)
                        sponsor_income += payment
                        subsidy_income += subsidy
                        _record_slices(audience_stats, engagement_stats, trait, "sponsor_income_kopecks",
                                       payment)
                        _record_slices(audience_stats, engagement_stats, trait, "subsidy_income_kopecks",
                                       subsidy)
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
    opening_coupon_liability = external_coupon_reserve + initial_items * instance_cost
    ending_coupon_liability = budget["coupon_reserved_kopecks"]
    outstanding_liability_delta = max(0, ending_coupon_liability - opening_coupon_liability)
    net = paid_margin + sponsor_income + subsidy_income - spend
    return {
        **{name: counts[name] for name in (
            "offers", "refusals", "budget_refusals", "qualified", "items_granted", "items_consumed",
            "coupons_crafted", "coupons_redeemed", "physical_gifts", "fraud_cases", "sponsored_qualified",
            "purchase_days", "baseline_purchase_days", "incremental_purchases")},
        "name": scenario["name"], "users": scenario["users"], "served_users": len(served),
        "policy": policy_name, "potential_outcomes_fingerprint": outcomes_hash.hexdigest(),
        "initial_item_instances": initial_items, "remaining_item_instances": remaining,
        "outstanding_coupons": outstanding_coupons, "final_budget": budget,
        "refusal_reasons": dict(reasons), "spend_kopecks": spend,
        "peak_reserved_kopecks": peak_reserve, "incremental_margin_kopecks": paid_margin,
        "sponsor_income_kopecks": sponsor_income, "subsidy_income_kopecks": subsidy_income,
        "audience_breakdown": audience_breakdown, "engagement_breakdown": engagement_breakdown,
        "net_kopecks": net,
        "opening_coupon_liability_kopecks": opening_coupon_liability,
        "ending_coupon_liability_kopecks": ending_coupon_liability,
        "outstanding_liability_delta_kopecks": outstanding_liability_delta,
        "conservative_net_after_outstanding_max_liability_kopecks": net - outstanding_liability_delta,
    }


def potential_outcomes(seed, profile_index, cycle):
    """Draws depend on assigned person/week, never on policy or whether it serves."""
    draw = random.Random(seed + profile_index * 7919 + cycle * 104729)
    return [draw.random() for _ in range(6)]


def realised_funding(challenge, scenario_economics):
    """No extra reward funding: a collection multiplier only scales the promised amount."""
    economics = challenge["economics"]
    if economics["funding_source"] != "advertiser":
        return 0, 0
    payment = scenario_economics.get("advertiser_payment_multiplier", 1.0)
    subsidy = scenario_economics.get("supplier_subsidy_multiplier", 1.0)
    if not 0 <= payment <= 1 or not 0 <= subsidy <= 1:
        raise ValueError("Funding collection multipliers must lie in [0, 1]")
    return (round(economics["bid_per_qualified_event_kopecks"] * payment),
            round(economics["subsidy_kopecks"] * subsidy))


def _is_budget_refusal(decision: dict) -> bool:
    """Classify a refusal from the complete candidate trace, not its short summary.

    The runtime response intentionally keeps only the most useful top-level reasons. A
    hard budget rejection can therefore be present on every candidate while another
    reason (for example Ads eligibility) occupies the compact summary.
    """
    reason_groups = [decision.get("reason_codes", [])]
    reason_groups.extend(
        candidate.get("reason_codes", [])
        for candidate in decision.get("diagnostics", {}).get("candidates", [])
    )
    return any(
        "budget_insufficient" in reason
        for reason_codes in reason_groups
        for reason in reason_codes
    )


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
