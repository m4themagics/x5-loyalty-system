"""Synthetic challenge-set evaluation. Reject, hold and review remain separate outcomes.

The policy is fixed; calibration comparisons do not tune it using the final challenge set.
Agent-written abuse labels describe scenario intent, not the model's score.
"""
import copy
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from recsys.engine.history import PurchaseHistory  # noqa: E402
from recsys.engine.policy import load_policy  # noqa: E402
from recsys.engine.risk import assess  # noqa: E402

CASES = ROOT / "recsys/eval/fraud/cases.json"
NOW_MS = 1_788_598_800_000
MISSED_ABUSE_COST_KOPECKS = 3500
FALSE_BLOCK_COST_KOPECKS = 12000
MANUAL_REVIEW_COST_KOPECKS = 900


def score_cases(cases, policy):
    scored = []
    for case in cases:
        history = PurchaseHistory(case["profile"]["receipts"], NOW_MS, policy["history_window_days"])
        risk = assess(case["profile"], case["receipt"], history, policy)
        scored.append({"case_id": case["case_id"], "label": case["label"],
                       "description": case["description"], "decision": risk.decision,
                       "signals": risk.signals, "score": risk.score,
                       "household": case["profile"]["risk_signals"]["household_id"] is not None})
    return scored


def summarize(rows):
    abuse = sum(row["label"] == "abuse" for row in rows)
    legit = len(rows) - abuse
    metrics = {"total": len(rows), "abuse": abuse, "legitimate": legit}
    for action in ("reject", "hold", "review", "allow"):
        selected = [row for row in rows if row["decision"] == action]
        true = sum(row["label"] == "abuse" for row in selected)
        metrics[action] = {"count": len(selected), "abuse": true,
                           "legitimate": len(selected) - true,
                           "precision": true / len(selected) if selected else None,
                           "recall": true / abuse if abuse else None}
    family = [row for row in rows if row["label"] != "abuse" and row["household"]]
    metrics["family_count"] = len(family)
    metrics["family_intervention_count"] = sum(row["decision"] != "allow" for row in family)
    metrics["family_held_or_rejected"] = sum(row["decision"] in {"hold", "reject"} for row in family)
    # Worst-case unresolved review: fraud loss is still possible until a reviewer decides.
    missed = metrics["allow"]["abuse"] + metrics["review"]["abuse"]
    false_block = metrics["reject"]["legitimate"] + metrics["hold"]["legitimate"]
    metrics["conservative_loss_kopecks"] = (
        missed * MISSED_ABUSE_COST_KOPECKS + false_block * FALSE_BLOCK_COST_KOPECKS
        + metrics["review"]["count"] * MANUAL_REVIEW_COST_KOPECKS)
    return metrics


def formatted(value):
    return "n/a (no cases)" if value is None else f"{value:.2f}"


def report(split, cases, policy):
    scored = score_cases(cases, policy)
    metrics = summarize(scored)
    print(f"\n{split}: {len(cases)} cases, abuse={metrics['abuse']}, legitimate={metrics['legitimate']}")
    for action in ("reject", "hold", "review", "allow"):
        row = metrics[action]
        print(f"  {action}: {row['count']}; abuse={row['abuse']}, legitimate={row['legitimate']}; "
              f"precision={formatted(row['precision'])}, recall={formatted(row['recall'])}")
    print(f"  families: {metrics['family_count']}; review/hold/reject: "
          f"{metrics['family_intervention_count']}; of them hold/reject: {metrics['family_held_or_rejected']}")
    print(f"  scenario upper bound on loss with unresolved review: "
          f"RUB {metrics['conservative_loss_kopecks'] / 100:.2f}")
    for row in scored:
        if ((row["label"] == "abuse" and row["decision"] in {"allow", "review"}) or
                (row["label"] == "legitimate" and row["decision"] in {"hold", "reject"})):
            print(f"    disputed case {row['case_id']}: {row['decision']} — {row['description']}")
    return scored


def main():
    payload, policy = json.loads(CASES.read_text()), load_policy()
    print(f"Anti-fraud: {payload['label_status']}; the labelling is not human-confirmed.")
    calibration = [row for row in payload["cases"] if row["split"] == "calibration"]
    final = [row for row in payload["cases"] if row["split"] == "final"]
    print("review/hold/reject thresholds: " + "/".join(str(policy["risk"][f"{action}_score"])
                                                  for action in ("review", "hold", "reject")))
    print("Thresholds are compared on calibration only; the production policy is not changed automatically:")
    for name, thresholds in (("configured", None), ("strict", (.2, .4, .6)), ("lenient", (.5, .75, .95))):
        alternative = copy.deepcopy(policy)
        if thresholds:
            for action, threshold in zip(("review", "hold", "reject"), thresholds):
                alternative["risk"][f"{action}_score"] = threshold
        metrics = summarize(score_cases(calibration, alternative))
        print(f"  {name}: scenario loss RUB {metrics['conservative_loss_kopecks']/100:.2f}; "
              f"hold/reject errors={metrics['hold']['legitimate']+metrics['reject']['legitimate']}")
    before = report("calibration", calibration, policy)
    after = report("final challenge set", final, policy)
    old = {tuple(row["signals"]) for row in before}
    new = {tuple(row["signals"]) for row in after}
    print(f"\nNew risk-signal combinations in final: {len(new-old)} of {len(new)}.")
    print("These are hand-written synthetic scenarios, not an independent random sample of customers. "
          "Final holds new combinations and known hard cases; precision does not transfer to a real "
          "fraud rate. Review is not a rejection, and a hold is not a final refusal.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
