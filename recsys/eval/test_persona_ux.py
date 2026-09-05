"""The model's roleplay must never be reported as human research or valid after failure."""
import copy
import json
import unittest
from unittest.mock import patch

from recsys.eval import persona_ux
from recsys.llm.ollama import LlmResult


def answer(persona_id):
    return {"persona_id": persona_id, "comprehension": {"next_step": "paid_category_purchase",
            "first_reward": "digital_and_physical", "four_items": "coupon_or_funded_product",
            }, "subjective": {"intent": "maybe", "main_reason": "Хочу понять ценность награды.",
            "confusion_points": ["Не знаю доступность товара."],
            "suggested_copy": "Покажите конкретный товар и условие покупки."}}


class PersonaUxTest(unittest.TestCase):
    def test_personas_cover_five_segments_and_three_attitudes(self):
        personas = persona_ux.build_personas()
        self.assertEqual(len(personas), 15)
        self.assertEqual(len({row["persona_id"] for row in personas}), 15)
        self.assertEqual(len({row["segment_id"] for row in personas}), 5)
        self.assertEqual(len({row["attitude"] for row in personas}), 3)

    def test_strict_validation_rejects_wrong_identity_extra_fields_and_invalid_enums(self):
        good = answer("youth_interested")
        self.assertEqual(persona_ux.validate_response(json.dumps(good), "youth_interested"), good)
        for change in ({"persona_id": "other"}, {"comprehension": {}}, {"subjective": {}},
                       {"made_up_human_count": 5}):
            bad = {**copy.deepcopy(good), **change}
            with self.assertRaises(ValueError):
                persona_ux.validate_response(json.dumps(bad), "youth_interested")
        for raw in ("```json\n{}\n```", "{}", "[]", "not JSON"):
            with self.assertRaises(ValueError):
                persona_ux.validate_response(raw, "youth_interested")

    def test_comprehension_scoring_records_mistakes_separately_from_intent(self):
        response = answer("youth_interested")
        self.assertEqual(persona_ux.comprehension_score(response), 3)
        response["subjective"]["intent"] = "skip"
        self.assertEqual(persona_ux.comprehension_score(response), 3)
        response["comprehension"]["next_step"] = "open_box_no_purchase"
        self.assertEqual(persona_ux.comprehension_score(response), 2)
        response["comprehension"]["first_reward"] = "physical_only"
        response["comprehension"]["four_items"] = "free_product_every_task"
        self.assertEqual(persona_ux.comprehension_score(response), 0)

    def test_offline_mode_makes_no_model_calls_and_reports_zero_results(self):
        with patch.object(persona_ux, "complete") as call:
            report = persona_ux.run(live=False)
        call.assert_not_called()
        self.assertEqual(report["status"], "prepared_not_run")
        self.assertEqual(report["valid_responses"], 0)
        self.assertEqual(report["actual_human_participants"], 0)

    def test_unavailable_model_is_not_replaced_with_fake_success(self):
        with patch.object(persona_ux, "complete", return_value=LlmResult(
                None, "qwen3:1.7b", 1, "ollama_unreachable: refused")) as call:
            report = persona_ux.run(live=True)
        self.assertEqual(report["status"], "unavailable")
        self.assertEqual(report["valid_responses"], 0)
        self.assertEqual(call.call_count, 1)
        self.assertTrue(all(row["response"] is None for row in report["personas"]))

    def test_live_protocol_is_explicitly_synthetic_even_with_valid_answers(self):
        def respond(system, user):
            data = json.loads(user)
            return LlmResult(json.dumps(answer(data["persona"]["persona_id"])),
                             "qwen3:1.7b", 1, None)
        with patch.object(persona_ux, "complete", side_effect=respond):
            report = persona_ux.run(live=True)
        self.assertEqual(report["status"], "completed")
        self.assertEqual(report["valid_responses"], 15)
        self.assertEqual(report["actual_human_participants"], 0)
        self.assertEqual(report["evidence_type"], "synthetic_llm_roleplay")


if __name__ == "__main__":
    unittest.main()
