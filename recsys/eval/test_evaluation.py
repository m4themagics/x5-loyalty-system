"""Regression checks for evaluation semantics; no generated reports are written."""
import contextlib
import io
import json
import pathlib
import unittest
from unittest.mock import patch

from recsys.eval import fraud_eval, population, run_relevance, simulate

ROOT = pathlib.Path(__file__).resolve().parent


class EvaluationTest(unittest.TestCase):
    def scenario(self, cycles=1):
        scenario = json.loads((ROOT / "scenarios/positive.json").read_text())
        scenario.update(users=8, cycles=cycles, missing_history_share=0)
        scenario["hidden"].update(base_purchase_probability=1.0,
                                  qualification_probability_given_purchase=1.0,
                                  coupon_craft_probability=1.0,
                                  coupon_redemption_probability=1.0, fraud_share=0.0)
        scenario["start_empty_inventory"] = True
        return scenario

    def test_refusal_for_wrong_reason_fails_the_evaluation(self):
        rubric = json.loads((ROOT / "rubric.json").read_text())
        answers = [{"status": "offer", "challenge": {"reward": {
            "digital_item_id": entry["acceptable_item_ids"][0]}}}
            for entry in rubric["eligible"]]
        answers += [{"status": "no_action", "reason_codes": ["unrelated_failure"]}
                    for _ in rubric["refusal"]]
        with patch.object(run_relevance, "call_engine", side_effect=answers), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(run_relevance.main(), 1)
        self.assertIn("ОШИБКА eval-refusal-01", output.getvalue())

    def test_simulation_calls_the_real_decision_and_stops_at_zero_budget(self):
        from recsys.engine.decision import handle_decision
        scenario = self.scenario()
        scenario["budget"] = {
            "coupon_fund_kopecks": 0, "coupon_reserved_kopecks": 0,
            "coupon_settled_kopecks": 0, "physical_fund_kopecks": 0,
            "physical_reserved_kopecks": 0, "physical_settled_kopecks": 0,
        }
        with patch.object(simulate, "handle_decision", wraps=handle_decision) as decide:
            result = simulate.run_scenario(scenario)
        self.assertEqual(decide.call_count, scenario["users"])
        self.assertEqual(result["offers"], 0)
        self.assertEqual(result["spend_kopecks"], 0)
        self.assertGreater(result["budget_refusals"], 0)

    def test_one_new_item_cannot_create_a_coupon(self):
        result = simulate.run_scenario(self.scenario())
        self.assertGreater(result["items_granted"], 0)
        self.assertEqual(result["initial_item_instances"], 0)
        self.assertEqual(result["coupons_crafted"], 0)

    def test_each_coupon_consumes_four_items_and_funds_remain_balanced(self):
        scenario = self.scenario(cycles=4)
        scenario["start_empty_inventory"] = False
        result = simulate.run_scenario(scenario)
        self.assertGreater(result["coupons_crafted"], 0)
        self.assertEqual(result["items_consumed"], 4 * result["coupons_crafted"])
        self.assertEqual(result["remaining_item_instances"],
                         result["initial_item_instances"] + result["items_granted"] - result["items_consumed"])
        self.assertEqual(result["final_budget"]["coupon_reserved_kopecks"],
                         250 * result["remaining_item_instances"] + 1000 * result["outstanding_coupons"])
        self.assertLessEqual(result["physical_gifts"], result["users"])
        for fund in ("coupon", "physical"):
            budget = result["final_budget"]
            self.assertLessEqual(budget[f"{fund}_settled_kopecks"] +
                                 budget[f"{fund}_reserved_kopecks"],
                                 budget[f"{fund}_fund_kopecks"])

    def test_existing_promises_stop_later_publications_before_outcomes(self):
        scenario = self.scenario()
        scenario["missing_history_share"] = 0
        scenario["budget"] = {
            "coupon_fund_kopecks": 250, "coupon_reserved_kopecks": 0,
            "coupon_settled_kopecks": 0, "physical_fund_kopecks": 2900,
            "physical_reserved_kopecks": 0, "physical_settled_kopecks": 0,
        }
        result = simulate.run_scenario(scenario)
        self.assertEqual(result["offers"], 1)
        self.assertEqual(result["budget_refusals"], 7)

    def test_hidden_outcomes_are_not_passed_to_the_decision_policy(self):
        from recsys.engine.decision import handle_decision
        with patch.object(simulate, "handle_decision", wraps=handle_decision) as decide:
            simulate.run_scenario(self.scenario())
        for call in decide.call_args_list:
            request = call.args[0]
            self.assertNotIn("hidden", request)
            self.assertNotIn("game_uplift_probability", request)
            self.assertNotIn("audience_segment", request)
            self.assertNotIn("engagement", request)

    def test_population_matches_pyaterochka_app_segments(self):
        people = population.build_population(self.scenario(), users=1000)
        self.assertEqual(
            population.count_by(people, "audience_segment"),
            {"youth": 370, "harmful_habits": 50, "parents_u3": 260,
             "mature": 210, "senior": 110},
        )
        self.assertEqual(
            set(population.count_by(people, "engagement")),
            {"interested", "neutral", "skeptical"},
        )

    def test_population_is_reproducible_and_keeps_interest_latent(self):
        first = population.build_population(self.scenario(), users=100)
        second = population.build_population(self.scenario(), users=100)
        fingerprint = lambda rows: [
            (row["audience_segment"], row["engagement"], row["inventory_count"],
             row["missing_history"]) for row in rows
        ]
        self.assertEqual(fingerprint(first), fingerprint(second))
        self.assertTrue(all("profile" not in row for row in first))

    def test_simulation_reports_all_population_slices(self):
        result = simulate.run_scenario(self.scenario())
        self.assertEqual(sum(row["users"] for row in result["audience_breakdown"]), 8)
        self.assertEqual(sum(row["users"] for row in result["engagement_breakdown"]), 8)
        self.assertEqual(
            {row["engagement"] for row in result["engagement_breakdown"]},
            {"interested", "neutral", "skeptical"},
        )

    def test_fraud_metrics_separate_reject_hold_and_review(self):
        rows = [{"label": "abuse", "decision": "reject", "household": False},
                {"label": "abuse", "decision": "hold", "household": False},
                {"label": "legitimate", "decision": "review", "household": True}]
        metrics = fraud_eval.summarize(rows)
        self.assertEqual(metrics["reject"]["count"], 1)
        self.assertEqual(metrics["reject"]["recall"], .5)
        self.assertEqual(metrics["hold"]["count"], 1)
        self.assertEqual(metrics["review"]["count"], 1)
        self.assertEqual(metrics["family_intervention_count"], 1)

    def test_final_fraud_contains_new_combinations(self):
        from recsys.engine.policy import load_policy
        payload = json.loads((ROOT / "fraud/cases.json").read_text())
        policy = load_policy()
        signatures = {}
        for split in ("calibration", "final"):
            scored = fraud_eval.score_cases(
                [case for case in payload["cases"] if case["split"] == split], policy)
            signatures[split] = {tuple(row["signals"]) for row in scored}
        self.assertGreaterEqual(len(signatures["final"] - signatures["calibration"]), 4)


if __name__ == "__main__":
    unittest.main()
