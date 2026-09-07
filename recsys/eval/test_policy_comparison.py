"""Policy experiment invariants, independent of favourable numerical outcomes."""
import copy
import json
import pathlib
import unittest
from unittest.mock import patch

from recsys.engine.decision import handle_decision
from recsys.engine.policy import load_campaigns, load_policy
from recsys.eval import compare_policies, simulate
from recsys.eval.policies import choose_decision

HERE = pathlib.Path(__file__).resolve().parent


def scenario():
    value = json.loads((HERE / "scenarios/positive.json").read_text())
    value.update(users=40, cycles=2, missing_history_share=0)
    return value


class PolicyComparisonTest(unittest.TestCase):
    def test_realised_funding_uses_declared_cpa_and_subsidy_once(self):
        def offer(bid, subsidy, source="advertiser"):
            return {"economics": {"funding_source": source,
                "bid_per_qualified_event_kopecks": bid, "subsidy_kopecks": subsidy}}
        self.assertEqual(simulate.realised_funding(offer(1800, 0), {}), (1800, 0))
        self.assertEqual(simulate.realised_funding(offer(3200, 1800), {}), (3200, 1800))
        self.assertEqual(simulate.realised_funding(offer(3200, 250), {}), (3200, 250))
        self.assertEqual(simulate.realised_funding(offer(0, 0, "own_margin"), {}), (0, 0))
        self.assertEqual(simulate.realised_funding(offer(3200, 1800), {
            "advertiser_payment_multiplier": 0.5, "supplier_subsidy_multiplier": 0}), (1600, 0))
        with self.assertRaises(ValueError):
            simulate.realised_funding(offer(3200, 1800), {"supplier_subsidy_multiplier": 2})

    def test_funding_gate_rejects_only_first_unfunded_physical_offer(self):
        request = {"profile": {}, "budget": {}}
        offer = {"status": "offer", "challenge": {
            "reward": {"physical_sku": {"sku_id": "demo"}},
            "economics": {"funding_source": "x5"}}, "card": {"title": "fixed"},
            "reason_codes": ["offer_published"], "diagnostics": {}}
        for policy_name in ("sponsored_onboarding", "reward_only"):
            rejected = choose_decision(request, lambda _: copy.deepcopy(offer), policy_name)
            self.assertEqual(rejected["status"], "no_action")
            self.assertEqual(rejected["reason_codes"], ["funding_gate"])
            self.assertIsNone(rejected["challenge"])
            self.assertIsNone(rejected["card"])
        offer["challenge"]["reward"]["physical_sku"] = None
        self.assertEqual(choose_decision(request, lambda _: offer,
                                        "sponsored_onboarding")["status"], "offer")
        offer["challenge"]["reward"]["physical_sku"] = {"sku_id": "demo"}
        offer["challenge"]["economics"]["funding_source"] = "advertiser"
        self.assertEqual(choose_decision(request, lambda _: offer,
                                        "sponsored_onboarding")["status"], "offer")

    def test_fixed_dairy_only_emits_dairy_and_keeps_real_safety_filters(self):
        emitted = []
        def capture(request):
            response = handle_decision(request)
            if response["status"] == "offer":
                emitted.append(response["challenge"]["target"]["category"])
            return response
        with patch.object(simulate, "handle_decision", side_effect=capture):
            result = simulate.run_scenario(scenario(), policy_name="fixed_dairy")
        self.assertGreater(result["offers"], 0)
        self.assertEqual(set(emitted), {"Молочные продукты"})
        self.assertGreater(result["refusals"], 0)

    def test_all_policies_share_latent_outcomes_but_never_receive_traits(self):
        fingerprints, baselines = set(), set()
        with patch.object(simulate, "handle_decision", wraps=handle_decision) as decide:
            for name in compare_policies.POLICIES:
                result = simulate.run_scenario(scenario(), policy_name=name)
                fingerprints.add(result["potential_outcomes_fingerprint"])
                baselines.add(result["baseline_purchase_days"])
        self.assertEqual(len(fingerprints), 1)
        self.assertEqual(len(baselines), 1)
        for call in decide.call_args_list:
            text = json.dumps(call.args[0])
            for latent in ("positive_response_multiplier", "engagement_label",
                           "audience_segment", "game_uplift_probability"):
                self.assertNotIn(latent, text)

    def test_broad_and_sponsored_onboarding_are_distinct_allocation_policies(self):
        # Политики расходятся только там, где рекламного финансирования не хватает на всех.
        # Полный каталог покрывает все игровые категории, поэтому дефицит задаётся явно:
        # кампании остаются лишь в молочной категории. Иначе тест проверял бы не правило
        # финансирования, а случайную полноту каталога.
        catalog = load_campaigns()
        scarce = {
            **catalog,
            "campaigns": [
                entry for entry in catalog["campaigns"]
                if "dairy" in entry["eligible_categories"]
            ],
        }
        self.assertTrue(scarce["campaigns"], "нужна хотя бы одна кампания для сравнения")

        value = scenario()
        with patch("recsys.engine.decision.load_campaigns", return_value=scarce):
            broad = simulate.run_scenario(value, policy_name="personalized_broad")
            sponsored = simulate.run_scenario(value, policy_name="sponsored_onboarding")

        self.assertGreater(broad["served_users"], sponsored["served_users"])
        self.assertGreater(broad["offers"], sponsored["offers"])
        self.assertGreater(sponsored["refusal_reasons"].get("funding_gate", 0), 0)

    def test_full_catalog_funds_an_advertiser_in_every_game_category(self):
        """Обратная сторона: на полном каталоге гейт финансирования не должен быть узким местом."""
        value = scenario()
        sponsored = simulate.run_scenario(value, policy_name="sponsored_onboarding")

        self.assertEqual(sponsored["refusal_reasons"].get("ads_no_eligible_campaign", 0), 0)
        self.assertEqual(sponsored["refusal_reasons"].get("funding_gate", 0), 0)

    def test_evaluation_funding_override_does_not_change_runtime_policy(self):
        self.assertEqual(load_policy()["first_cycle_funding_policy"], "advertiser_only")
        simulate.run_scenario(scenario(), policy_name="personalized_broad")
        self.assertEqual(load_policy()["first_cycle_funding_policy"], "advertiser_only")

    def test_reward_only_identity_when_response_multiplier_is_one(self):
        value = scenario()
        value["reward_only_response_multiplier"] = 1.0
        first = simulate.run_scenario(value, policy_name="sponsored_onboarding")
        second = simulate.run_scenario(value, policy_name="reward_only")
        for key in first:
            if key != "policy":
                self.assertEqual(first[key], second[key], key)

    def test_each_policy_keeps_funds_and_item_conservation(self):
        for name in compare_policies.POLICIES:
            result = simulate.run_scenario(scenario(), policy_name=name)
            self.assertEqual(result["initial_item_instances"] + result["items_granted"],
                             result["remaining_item_instances"] + result["items_consumed"])
            self.assertEqual(result["items_consumed"], result["coupons_crafted"] * 4)
            simulate.check_budget(result["final_budget"])

    def test_report_reproducibility_and_break_even_round_up(self):
        report = compare_policies.build_report(scenario(), seeds=[11, 12])
        self.assertEqual(report, compare_policies.build_report(scenario(), seeds=[11, 12]))
        row = {"spend_kopecks": 100, "incremental_margin_kopecks": 10,
               "subsidy_income_kopecks": 0, "sponsored_qualified": 4}
        self.assertEqual(compare_policies.break_even_cpa(row), 23)
        row["outstanding_liability_delta_kopecks"] = 8
        self.assertEqual(compare_policies.break_even_cpa(row, include_outstanding=True), 25)
        row["sponsored_qualified"] = 0
        self.assertIsNone(compare_policies.break_even_cpa(row))
        self.assertEqual(report["primary_result"]["policy"], "sponsored_onboarding")
        self.assertEqual(len(report["stress_appendix"]), 3)
        self.assertEqual(
            report["assumptions"]["policy_funding_assumptions"],
            {
                "personalized_broad": "advertiser_or_positive_margin",
                "fixed_dairy": "advertiser_or_positive_margin",
                "sponsored_onboarding": "advertiser_only",
                "reward_only": "advertiser_only",
            },
        )
        self.assertTrue(report["assumptions"]["runtime_funding_policy_unchanged"])

    def test_conservative_result_subtracts_only_growth_of_outstanding_liability(self):
        value = scenario()
        value["budget"]["coupon_reserved_kopecks"] = 12000
        result = simulate.run_scenario(value, policy_name="sponsored_onboarding")
        opening = 12000 + result["initial_item_instances"] * 2500
        ending = result["final_budget"]["coupon_reserved_kopecks"]
        self.assertEqual(result["opening_coupon_liability_kopecks"], opening)
        self.assertEqual(result["ending_coupon_liability_kopecks"], ending)
        self.assertEqual(result["outstanding_liability_delta_kopecks"], max(0, ending - opening))
        self.assertEqual(result["conservative_net_after_outstanding_max_liability_kopecks"],
                         result["net_kopecks"] - max(0, ending - opening))
        self.assertNotEqual(result["conservative_net_after_outstanding_max_liability_kopecks"],
                            result["net_kopecks"] - ending)

    def test_conservative_aggregates_are_computed_from_individual_runs(self):
        report = compare_policies.build_report(scenario(), seeds=[11, 12])
        for row in report["comparison"]:
            values = [run["conservative_net_after_outstanding_max_liability_kopecks"]
                      for run in row["runs"]]
            self.assertEqual(row["mean"]["conservative_net_after_outstanding_max_liability_kopecks"],
                             sum(values) / len(values))
            self.assertEqual(row["conservative_net_range_kopecks"], [min(values), max(values)])
            self.assertEqual(row["conservative_positive_net_seeds"], sum(value > 0 for value in values))

    def test_released_existing_liability_does_not_artificially_increase_profit(self):
        value = scenario()
        value.update(users=1, cycles=1)
        value["hidden"].update(base_purchase_probability=1, qualification_probability_given_purchase=1,
                               coupon_craft_probability=1, coupon_redemption_probability=1)
        trait = simulate.build_population(value)[0]
        trait.update(inventory_count=4, missing_history=False, coupon_craft_probability=1,
                     coupon_redemption_probability=1, baseline_purchase_multiplier=1)

        def eligible_repeat_decision(request):
            # Isolate the liability invariant from first-cycle Ads eligibility. The
            # synthetic user has already completed onboarding and has recent history in
            # a category that can award a missing breakfast item.
            prepared = copy.deepcopy(request)
            prepared["profile"]["issued_rewards"] = [{"reward_id": "prior-onboarding"}]
            prepared["profile"]["receipts"] = [{
                "receipt_id": "prior-paid-bread",
                "purchased_at_ms": prepared["now_ms"] - simulate.DAY_MS,
                "store_id": "synthetic-store",
                "returned": False,
                "lines": [{
                    "sku_id": "synthetic-bread",
                    "category": "Хлеб и выпечка",
                    "quantity": 1,
                    "paid": True,
                    "amount_kopecks": 10_000,
                }],
            }]
            return handle_decision(prepared)

        with patch.object(simulate, "build_population", return_value=[trait]), \
                patch.object(simulate, "handle_decision", side_effect=eligible_repeat_decision):
            result = simulate.run_scenario(value)
        self.assertEqual(result["offers"], 1)
        self.assertEqual(result["coupons_redeemed"], 1)
        self.assertLess(result["ending_coupon_liability_kopecks"], result["opening_coupon_liability_kopecks"])
        self.assertEqual(result["outstanding_liability_delta_kopecks"], 0)
        self.assertEqual(result["conservative_net_after_outstanding_max_liability_kopecks"], result["net_kopecks"])


if __name__ == "__main__":
    unittest.main()
