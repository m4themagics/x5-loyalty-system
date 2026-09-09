"""Challenge-selection checks: different histories give different decisions, refusals explain themselves."""
import copy
import json
import pathlib
import unittest
from unittest.mock import patch

from recsys.engine.decision import handle_decision
from recsys.engine.economics import available_budget
from recsys.engine.history import PurchaseHistory
from recsys.engine.policy import load_campaigns, rubles_to_kopecks

EXAMPLES = pathlib.Path(__file__).resolve().parents[3] / "recsys" / "contract" / "examples"
DAY_MS = 86_400_000


def load(name: str) -> dict:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


def receipt(receipt_id: str, at_ms: int, category: str, paid: bool = True) -> dict:
    return {
        "receipt_id": receipt_id,
        "purchased_at_ms": at_ms,
        "store_id": "store-test",
        "returned": False,
        "lines": [
            {
                "sku_id": f"sku-{receipt_id}",
                "category": category,
                "quantity": 1,
                "paid": paid,
                "amount_kopecks": 9900,
            }
        ],
    }


class DecisionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.empty = load("decision-request-empty.json")
        self.seeded = load("decision-request-seeded.json")

    def test_empty_and_seeded_profiles_get_different_challenges(self) -> None:
        empty = handle_decision(copy.deepcopy(self.empty))
        seeded = handle_decision(copy.deepcopy(self.seeded))

        self.assertEqual(empty["status"], "offer")
        self.assertEqual(seeded["status"], "offer")
        self.assertNotEqual(
            empty["challenge"]["reward"]["digital_item_id"],
            seeded["challenge"]["reward"]["digital_item_id"],
        )

    def test_empty_inventory_gets_a_first_copy_not_a_finished_recipe(self) -> None:
        response = handle_decision(copy.deepcopy(self.empty))
        self.assertIn("recipe_goal_first_copy", response["reason_codes"])
        self.assertNotIn("recipe_completion_reachable", response["reason_codes"])

    def test_seeded_profile_can_complete_the_breakfast_recipe(self) -> None:
        response = handle_decision(copy.deepcopy(self.seeded))
        self.assertIn("recipe_completion_reachable", response["reason_codes"])
        self.assertEqual(response["challenge"]["recipe_goal_id"], "breakfast")
        self.assertEqual(response["challenge"]["reward"]["digital_item_id"], "breakfast-pan")

    def test_first_cycle_promises_a_reserved_physical_sku(self) -> None:
        challenge = handle_decision(copy.deepcopy(self.empty))["challenge"]
        physical = challenge["reward"]["physical_sku"]
        self.assertIsNotNone(physical)
        self.assertTrue(physical["stock_reserved"])
        self.assertEqual(
            challenge["reservation"]["physical_reserve_kopecks"], physical["unit_cost_kopecks"]
        )
        self.assertEqual(challenge["reservation"]["coupon_reserve_kopecks"], 250)

    def test_first_cycle_refuses_an_ad_that_does_not_fully_fund_the_physical_sku(self) -> None:
        campaigns = load_campaigns()
        campaigns["campaigns"] = [
            {
                **next(
                    campaign
                    for campaign in campaigns["campaigns"]
                    if campaign["campaign_id"] == "camp_058"
                ),
                "bid_per_qualified_visit": 10.0,
                "reward_cost": 14.99,
            }
        ]

        with patch("recsys.engine.decision.load_campaigns", return_value=campaigns):
            response = handle_decision(copy.deepcopy(self.empty))

        self.assertEqual(response["status"], "no_action")
        self.assertIn("physical_reward_funding_insufficient", response["reason_codes"])

    def test_repeat_cycle_promises_no_second_physical_gift(self) -> None:
        request = copy.deepcopy(self.empty)
        request["profile"]["issued_rewards"] = [
            {
                "reward_id": "rwd_prev",
                "challenge_id": "chl_prev",
                "source_event_id": "evt_prev",
                "item_instance_id": "inst_prev",
                "item_id": "milk-pitcher",
                "sku_entitlement_id": "ent_prev",
                "sku_id": "gift-milk-500",
                "issued_at_ms": request["now_ms"] - DAY_MS,
            }
        ]
        challenge = handle_decision(request)["challenge"]
        self.assertIsNone(challenge["reward"]["physical_sku"])
        self.assertEqual(challenge["reservation"]["physical_reserve_kopecks"], 0)

    def test_outstanding_promise_blocks_a_new_one_without_cancelling_it(self) -> None:
        request = copy.deepcopy(self.empty)
        request["profile"]["outstanding_promise"] = {
            "challenge_id": "chl_open",
            "challenge_version": 1,
            "decision_id": "dec_open",
            "published_at_ms": request["now_ms"] - DAY_MS,
            "deadline_ms": request["now_ms"] + 3 * DAY_MS,
            "fulfilled": False,
        }
        response = handle_decision(request)
        self.assertEqual(response["status"], "no_action")
        self.assertEqual(response["reason_codes"], ["promise_already_outstanding"])
        self.assertIsNone(response["challenge"])

    def test_expired_promise_does_not_block_a_new_decision(self) -> None:
        request = copy.deepcopy(self.empty)
        request["profile"]["outstanding_promise"] = {
            "challenge_id": "chl_old",
            "challenge_version": 1,
            "decision_id": "dec_old",
            "published_at_ms": request["now_ms"] - 30 * DAY_MS,
            "deadline_ms": request["now_ms"] - DAY_MS,
            "fulfilled": False,
        }
        self.assertEqual(handle_decision(request)["status"], "offer")

    def test_no_purchase_history_refuses_with_an_explanation(self) -> None:
        request = copy.deepcopy(self.empty)
        request["profile"]["receipts"] = []
        response = handle_decision(request)
        self.assertEqual(response["status"], "no_action")
        self.assertEqual(response["reason_codes"], ["no_purchase_history"])

    def test_self_referral_is_rejected_before_a_promise_is_shown(self) -> None:
        request = copy.deepcopy(self.empty)
        request["profile"]["referral"]["invited_by_profile_id"] = request["profile"]["profile_id"]
        response = handle_decision(request)
        self.assertEqual(response["status"], "no_action")
        self.assertEqual(response["reason_codes"], ["risk_reject", "self_referral"])

    def test_unknown_categories_only_refuse_because_exploration_is_disabled(self) -> None:
        request = copy.deepcopy(self.empty)
        request["profile"]["receipts"] = [
            receipt("r1", request["now_ms"] - 2 * DAY_MS, "Household chemicals")
        ]
        response = handle_decision(request)
        self.assertEqual(response["status"], "no_action")
        self.assertIn("category_not_in_history", response["reason_codes"])
        self.assertIn("exploration_disabled", response["reason_codes"])

    def test_category_without_a_gift_sku_is_rejected_for_the_first_cycle(self) -> None:
        request = copy.deepcopy(self.empty)
        request["profile"]["receipts"] = [
            receipt("r1", request["now_ms"] - 2 * DAY_MS, "Ready Meals")
        ]
        response = handle_decision(request)
        self.assertEqual(response["status"], "no_action")
        best = response["diagnostics"]["candidates"][0]
        self.assertEqual(best["item_id"], "golden-chef-hat")
        self.assertIn("sku_out_of_stock", best["reason_codes"])

    def test_exhausted_coupon_fund_blocks_a_new_promise(self) -> None:
        request = copy.deepcopy(self.empty)
        request["budget"]["coupon_reserved_kopecks"] = request["budget"]["coupon_fund_kopecks"]
        response = handle_decision(request)
        self.assertEqual(response["status"], "no_action")
        self.assertIn("coupon_budget_insufficient", response["reason_codes"])

    def test_exhausted_physical_fund_blocks_a_new_promise(self) -> None:
        request = copy.deepcopy(self.empty)
        request["budget"]["physical_settled_kopecks"] = request["budget"]["physical_fund_kopecks"]
        response = handle_decision(request)
        self.assertEqual(response["status"], "no_action")
        self.assertIn("physical_budget_insufficient", response["reason_codes"])

    def test_available_budget_subtracts_settled_spend_and_full_maximum_liability(self) -> None:
        budget = available_budget(
            {
                "coupon_fund_kopecks": 1000,
                "coupon_settled_kopecks": 100,
                "coupon_reserved_kopecks": 250,
                "physical_fund_kopecks": 5000,
                "physical_settled_kopecks": 500,
                "physical_reserved_kopecks": 2500,
            }
        )
        self.assertEqual(budget.coupon_available, 650)
        self.assertEqual(budget.physical_available, 2000)

    def test_reported_budget_is_the_remainder_after_the_new_reservation(self) -> None:
        request = copy.deepcopy(self.empty)
        response = handle_decision(request)
        reservation = response["challenge"]["reservation"]
        diagnostics = response["diagnostics"]
        self.assertEqual(
            diagnostics["coupon_available_kopecks"],
            request["budget"]["coupon_fund_kopecks"] - reservation["coupon_reserve_kopecks"],
        )
        self.assertEqual(
            diagnostics["physical_available_kopecks"],
            request["budget"]["physical_fund_kopecks"] - reservation["physical_reserve_kopecks"],
        )

    def test_decision_is_deterministic_for_the_same_input(self) -> None:
        first = handle_decision(copy.deepcopy(self.empty))
        second = handle_decision(copy.deepcopy(self.empty))
        self.assertEqual(first["decision_id"], second["decision_id"])
        self.assertEqual(first["challenge"]["challenge_id"], second["challenge"]["challenge_id"])

    def test_two_receipts_on_one_day_count_as_one_purchase_day(self) -> None:
        now_ms = self.empty["now_ms"]
        history = PurchaseHistory(
            [
                receipt("r1", now_ms - DAY_MS, "Dairy"),
                receipt("r2", now_ms - DAY_MS + 3_600_000, "Dairy"),
            ],
            now_ms,
            90,
        )
        self.assertEqual(history.purchase_day_count, 1)
        self.assertEqual(len(history.split_days()), 1)

    def test_unpaid_lines_never_create_a_purchase_day(self) -> None:
        now_ms = self.empty["now_ms"]
        history = PurchaseHistory(
            [receipt("r1", now_ms - DAY_MS, "Dairy", paid=False)], now_ms, 90
        )
        self.assertEqual(history.purchase_day_count, 0)

    def test_campaign_amounts_are_converted_to_kopecks_without_drift(self) -> None:
        self.assertEqual(rubles_to_kopecks(32.0), 3200)
        self.assertEqual(rubles_to_kopecks(18.0), 1800)
        self.assertEqual(rubles_to_kopecks(0.1), 10)


if __name__ == "__main__":
    unittest.main()
