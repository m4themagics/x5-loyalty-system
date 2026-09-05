"""Проверки квалификации чека, однократной выдачи и решений риска."""
import copy
import json
import pathlib
import unittest

from recsys.engine.event import handle_event

EXAMPLES = pathlib.Path(__file__).resolve().parents[3] / "recsys" / "contract" / "examples"
DAY_MS = 86_400_000


class EventTest(unittest.TestCase):
    def setUp(self) -> None:
        self.request = json.loads(
            (EXAMPLES / "event-request-qualified.json").read_text(encoding="utf-8")
        )

    def test_paid_line_in_the_window_grants_both_components_once(self) -> None:
        response = handle_event(copy.deepcopy(self.request))
        self.assertEqual(response["qualification"], "qualified")
        self.assertFalse(response["idempotent_replay"])
        self.assertEqual(response["risk"]["decision"], "allow")
        self.assertEqual(response["grant"]["item_id"], "milk-pitcher")
        self.assertIsNotNone(response["grant"]["sku_entitlement_id"])

    def test_grant_identifiers_are_stable_for_the_same_receipt(self) -> None:
        first = handle_event(copy.deepcopy(self.request))
        second = handle_event(copy.deepcopy(self.request))
        self.assertEqual(first["grant"], second["grant"])
        self.assertEqual(first["event_id"], second["event_id"])

    def test_replayed_idempotency_key_returns_a_duplicate_without_a_second_grant(self) -> None:
        request = copy.deepcopy(self.request)
        request["profile"]["processed_event_ids"] = [request["idempotency_key"]]
        response = handle_event(request)
        self.assertEqual(response["qualification"], "duplicate")
        self.assertTrue(response["idempotent_replay"])
        self.assertIsNone(response["grant"])
        self.assertIn("idempotent_replay", response["reason_codes"])

    def test_replayed_receipt_id_returns_a_duplicate(self) -> None:
        request = copy.deepcopy(self.request)
        request["profile"]["processed_event_ids"] = [request["receipt"]["receipt_id"]]
        self.assertEqual(handle_event(request)["qualification"], "duplicate")

    def test_already_issued_challenge_never_grants_again(self) -> None:
        request = copy.deepcopy(self.request)
        request["profile"]["issued_rewards"] = [
            {
                "reward_id": "rwd_existing",
                "challenge_id": request["challenge"]["challenge_id"],
                "source_event_id": "evt_existing",
                "item_instance_id": "inst_existing",
                "item_id": "milk-pitcher",
                "sku_entitlement_id": None,
                "sku_id": None,
                "issued_at_ms": request["now_ms"] - DAY_MS,
            }
        ]
        response = handle_event(request)
        self.assertEqual(response["qualification"], "duplicate")
        self.assertIn("reward_already_issued", response["reason_codes"])
        self.assertIsNone(response["grant"])

    def test_a_free_line_alone_does_not_close_the_challenge(self) -> None:
        request = copy.deepcopy(self.request)
        for line in request["receipt"]["lines"]:
            line["paid"] = False
        response = handle_event(request)
        self.assertEqual(response["qualification"], "not_qualified")
        self.assertEqual(response["reason_codes"], ["receipt_line_not_paid"])
        self.assertIsNone(response["grant"])

    def test_a_zero_amount_paid_line_does_not_close_the_challenge(self) -> None:
        request = copy.deepcopy(self.request)
        for line in request["receipt"]["lines"]:
            line["amount_kopecks"] = 0
        response = handle_event(request)
        self.assertEqual(response["qualification"], "not_qualified")
        self.assertEqual(response["reason_codes"], ["receipt_line_not_paid"])
        self.assertIsNone(response["grant"])

    def test_a_receipt_before_the_promise_does_not_qualify(self) -> None:
        request = copy.deepcopy(self.request)
        request["receipt"]["purchased_at_ms"] = (
            request["profile"]["outstanding_promise"]["published_at_ms"] - 1
        )
        response = handle_event(request)
        self.assertEqual(response["reason_codes"], ["receipt_before_promise"])
        self.assertIsNone(response["grant"])

    def test_a_future_receipt_does_not_qualify(self) -> None:
        request = copy.deepcopy(self.request)
        request["receipt"]["purchased_at_ms"] = request["now_ms"] + 1
        response = handle_event(request)
        self.assertEqual(response["reason_codes"], ["receipt_from_future"])
        self.assertIsNone(response["grant"])

    def test_a_challenge_without_an_active_promise_does_not_issue(self) -> None:
        request = copy.deepcopy(self.request)
        request["profile"]["outstanding_promise"] = None
        response = handle_event(request)
        self.assertEqual(response["reason_codes"], ["promise_not_active"])
        self.assertIsNone(response["grant"])

    def test_a_different_challenge_than_the_promise_does_not_issue(self) -> None:
        request = copy.deepcopy(self.request)
        request["profile"]["outstanding_promise"]["challenge_id"] = "chl_different"
        response = handle_event(request)
        self.assertEqual(response["reason_codes"], ["promise_mismatch"])
        self.assertIsNone(response["grant"])

    def test_a_different_category_does_not_qualify(self) -> None:
        request = copy.deepcopy(self.request)
        for line in request["receipt"]["lines"]:
            line["category"] = "Снеки и орехи"
        response = handle_event(request)
        self.assertEqual(response["reason_codes"], ["receipt_category_mismatch"])

    def test_insufficient_quantity_does_not_qualify(self) -> None:
        request = copy.deepcopy(self.request)
        request["challenge"]["target"]["quantity"] = 3
        response = handle_event(request)
        self.assertEqual(response["reason_codes"], ["receipt_quantity_insufficient"])

    def test_a_purchase_after_the_deadline_does_not_qualify(self) -> None:
        request = copy.deepcopy(self.request)
        request["receipt"]["purchased_at_ms"] = request["challenge"]["target"]["deadline_ms"] + 1
        response = handle_event(request)
        self.assertEqual(response["reason_codes"], ["receipt_window_expired"])

    def test_a_returned_receipt_goes_to_a_separate_review(self) -> None:
        request = copy.deepcopy(self.request)
        request["receipt"]["returned"] = True
        response = handle_event(request)
        self.assertEqual(response["qualification"], "not_qualified")
        self.assertEqual(response["reason_codes"], ["receipt_returned"])
        self.assertIn("returned_receipt", response["risk"]["signals"])

    def test_a_shared_household_alone_never_blocks_a_legitimate_family(self) -> None:
        request = copy.deepcopy(self.request)
        request["profile"]["risk_signals"]["household_id"] = "household-shared"
        response = handle_event(request)
        self.assertEqual(response["risk"]["decision"], "allow")
        self.assertIsNotNone(response["grant"])

    def test_a_held_event_confirms_completion_but_issues_nothing(self) -> None:
        request = copy.deepcopy(self.request)
        request["profile"]["risk_signals"].update(
            {"confirmed_purchase_days": 0, "account_age_days": 1, "household_id": "household-new"}
        )
        response = handle_event(request)
        self.assertEqual(response["qualification"], "qualified")
        self.assertEqual(response["risk"]["decision"], "hold")
        self.assertIsNone(response["grant"])
        self.assertIn("risk_hold", response["reason_codes"])

    def test_a_self_referral_raises_risk_to_a_refusal(self) -> None:
        request = copy.deepcopy(self.request)
        profile = request["profile"]
        profile["referral"]["invited_by_profile_id"] = profile["profile_id"]
        profile["risk_signals"].update({"confirmed_purchase_days": 0, "account_age_days": 1})
        response = handle_event(request)
        self.assertIn("self_referral", response["risk"]["signals"])
        self.assertEqual(response["risk"]["decision"], "reject")
        self.assertIsNone(response["grant"])


if __name__ == "__main__":
    unittest.main()
