"""Paired, reproducible policy comparison; financial success is scenario-conditional."""
import argparse
import copy
import json
import math
import pathlib
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from recsys.eval.policies import POLICIES  # noqa: E402
from recsys.eval.simulate import EVAL, load_json, rubles, run_scenario  # noqa: E402

SEEDS = tuple(range(20260901, 20260906))
METRICS = ("served_users", "offers", "incremental_purchases", "spend_kopecks",
           "peak_reserved_kopecks", "net_kopecks", "incremental_margin_kopecks",
           "sponsor_income_kopecks", "subsidy_income_kopecks", "sponsored_qualified",
           "opening_coupon_liability_kopecks", "ending_coupon_liability_kopecks",
           "outstanding_liability_delta_kopecks",
           "conservative_net_after_outstanding_max_liability_kopecks")


def break_even_cpa(row, include_outstanding=False):
    """Minimum constant CPA per realised sponsored event, keeping all other outcomes fixed."""
    events = row["sponsored_qualified"]
    if not events:
        return None
    uncovered = row["spend_kopecks"] - row["incremental_margin_kopecks"] - row["subsidy_income_kopecks"]
    if include_outstanding:
        uncovered += row["outstanding_liability_delta_kopecks"]
    return max(0, math.ceil(uncovered / events))


def summarize(policy, rows):
    summary = {"policy": policy, "seeds": [row["seed"] for row in rows],
               "positive_net_seeds": sum(row["net_kopecks"] > 0 for row in rows),
               "runs": rows}
    summary["mean"] = {key: statistics.mean(row[key] for row in rows) for key in METRICS}
    summary["net_range_kopecks"] = [min(row["net_kopecks"] for row in rows),
                                     max(row["net_kopecks"] for row in rows)]
    conservative = [row["conservative_net_after_outstanding_max_liability_kopecks"] for row in rows]
    summary["conservative_net_range_kopecks"] = [min(conservative), max(conservative)]
    summary["conservative_positive_net_seeds"] = sum(value > 0 for value in conservative)
    summary["mean_coverage"] = statistics.mean(row["served_users"] / row["users"] for row in rows)
    total = {key: sum(row[key] for row in rows) for key in (
        "spend_kopecks", "incremental_margin_kopecks", "subsidy_income_kopecks", "sponsored_qualified",
        "outstanding_liability_delta_kopecks")}
    summary["pooled_break_even_cpa_kopecks"] = break_even_cpa(total)
    summary["pooled_conservative_break_even_cpa_kopecks"] = break_even_cpa(total, include_outstanding=True)
    summary["mean_actual_cpa_kopecks"] = (round(sum(row["sponsor_income_kopecks"] for row in rows)
                                               / total["sponsored_qualified"], 2)
                                           if total["sponsored_qualified"] else None)
    return summary


def build_report(scenario=None, seeds=SEEDS):
    scenario = copy.deepcopy(scenario or load_json(EVAL / "scenarios/positive.json"))
    if not seeds:
        raise ValueError("At least one seed is required")
    policies = []
    for policy in POLICIES:
        runs = []
        for seed in seeds:
            current = {**scenario, "seed": seed}
            result = run_scenario(current, policy_name=policy)
            result.update(seed=seed, break_even_cpa_kopecks=break_even_cpa(result),
                          conservative_break_even_cpa_kopecks=break_even_cpa(result, include_outstanding=True))
            runs.append(result)
        policies.append(summarize(policy, runs))
    for index in range(len(seeds)):
        if len({row["runs"][index]["potential_outcomes_fingerprint"] for row in policies}) != 1:
            raise AssertionError("Comparison requires common random outcomes")
    broad = next(row for row in policies if row["policy"] == "personalized_broad")
    for row in policies:
        row["paired_delta_vs_broad"] = [
            {"seed": run["seed"], "net_kopecks": run["net_kopecks"] - base["net_kopecks"],
             "incremental_purchases": run["incremental_purchases"] - base["incremental_purchases"]}
            for run, base in zip(row["runs"], broad["runs"])
        ]
    stress = []
    for world in ("positive", "zero", "negative"):
        current = load_json(EVAL / f"scenarios/{world}.json")
        current.update(users=scenario["users"], cycles=scenario.get("cycles", 4))
        row = run_scenario(current)
        row.update(world=world, seed=current["seed"])
        stress.append(row)
    return {
        "report_version": 1, "population": "synthetic_pyaterochka_mobile_app_audience",
        "primary_result": next(row for row in policies if row["policy"] == "sponsored_onboarding"),
        "comparison": policies, "stress_appendix": stress,
        "assumptions": {
            "users": scenario["users"], "cycles": scenario.get("cycles", 4), "seeds": list(seeds),
            "response_world": "positive", "reward_only_response_multiplier": scenario.get("reward_only_response_multiplier", 0.75),
            "reward_only_sensitivity": "Set multiplier to 1 to represent no incremental game value; identical rules and rewards, later state may diverge after responses.",
            "fixed_dairy": "Fixed safe dairy category; real familiarity/stock/risk/economics filters; outcome model has no learned category response.",
            "budget": scenario["budget"], "economics": scenario["economics"],
            "interest_is_hidden_from_policy": True, "common_random_numbers": True,
            "baseline_population_unchanged": True, "not_a_forecast": True,
            "cpa_break_even": "Conditional sensitivity with visits, subsidy and sponsored events held fixed; not an optimized auction bid.",
            "funding_accounting": "Declared challenge CPA and subsidy collected once; explicit [0,1] multipliers model nonpayment, not additional revenue.",
            "conservative_net": "Four-week cash net minus max(0, ending coupon liability - opening coupon liability); opening external/seeded obligations are not subtracted twice.",
            "limitations": ["no human validation", "no modelled exchange or habit after incentives",
                            "no global SKU stock or advertiser campaign budget depletion",
                            "positive policy chosen after earlier synthetic exploration, not a held-out profit test"],
        },
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-out", type=pathlib.Path)
    args = parser.parse_args(argv)
    report = build_report()
    primary = report["primary_result"]
    print(f"Основной сценарий: {primary['policy']}, {primary['conservative_positive_net_seeds']}/{len(SEEDS)} "
          "положительных seed после покрытия прироста максимальных обязательств.")
    for row in report["comparison"]:
        print(f"{row['policy']}: после обязательств "
              f"{rubles(row['mean']['conservative_net_after_outstanding_max_liability_kopecks'])} ₽; "
              f"денежный итог {rubles(row['mean']['net_kopecks'])} ₽; "
              f"охват {row['mean_coverage']:.1%}; дельта дней {row['mean']['incremental_purchases']:+.1f}; "
              f"CPA после покрытия обязательств {row['pooled_conservative_break_even_cpa_kopecks']} коп.")
    print("Это парное сравнение сценарных допущений, не измеренная прибыль и не исследование привычки.")
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
