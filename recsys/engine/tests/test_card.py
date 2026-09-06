"""Проверки карточки: шаблон без ключа, отклонение нарушений контракта, честная диагностика."""
import copy
import json
import pathlib
import unittest
from unittest import mock

import recsys.llm as llm
from recsys.engine.decision import handle_decision
from recsys.llm.validate import check
from recsys.llm.ollama import LlmResult as OllamaResult
from recsys.llm.yandexgpt import LlmResult

EXAMPLES = pathlib.Path(__file__).resolve().parents[3] / "recsys" / "contract" / "examples"


def offer_challenge() -> dict:
    request = json.loads((EXAMPLES / "decision-request-empty.json").read_text(encoding="utf-8"))
    with mock.patch.dict("os.environ", {"LLM_PROVIDER": "template"}):
        return handle_decision(request)["challenge"]


class CardTest(unittest.TestCase):
    def setUp(self) -> None:
        self.request = json.loads(
            (EXAMPLES / "decision-request-empty.json").read_text(encoding="utf-8")
        )
        self.challenge = offer_challenge()

    def test_missing_credentials_produce_a_valid_template(self) -> None:
        with mock.patch.dict("os.environ", {"LLM_PROVIDER": "yandexgpt", "YANDEX_API_KEY": "", "YANDEX_FOLDER_ID": ""}):
            response = handle_decision(copy.deepcopy(self.request))
        card = response["card"]
        self.assertEqual(card["source"], "fallback")
        self.assertEqual(card["violations"], [])
        self.assertEqual(
            response["diagnostics"]["llm"]["error"], "yandexgpt_credentials_missing"
        )
        self.assertTrue(card["headline"] and card["body"])

    def test_template_passes_its_own_contract_checks(self) -> None:
        with mock.patch.dict("os.environ", {"LLM_PROVIDER": "yandexgpt", "YANDEX_API_KEY": "", "YANDEX_FOLDER_ID": ""}):
            card = handle_decision(copy.deepcopy(self.request))["card"]
        draft = {field: card[field] for field in
                 ("headline", "body", "reward_line", "deadline_line", "sponsor_line")}
        self.assertEqual(check(draft, self.challenge, "Молочный кувшин"), [])

    def test_invalid_model_json_falls_back_and_says_so(self) -> None:
        with mock.patch.dict("os.environ", {"LLM_PROVIDER": "yandexgpt"}), mock.patch.object(llm.yandexgpt, "is_configured", return_value=True), mock.patch.object(
            llm.yandexgpt, "complete", return_value=LlmResult("не json", "yandexgpt-lite", 120, None)
        ):
            response = handle_decision(copy.deepcopy(self.request))
        self.assertEqual(response["card"]["source"], "fallback")
        self.assertEqual(response["card"]["violations"], ["llm_invalid_json"])
        self.assertEqual(response["diagnostics"]["llm"]["error"], "llm_invalid_json")

    def test_transport_failure_falls_back_without_raising(self) -> None:
        with mock.patch.dict("os.environ", {"LLM_PROVIDER": "yandexgpt"}), mock.patch.object(llm.yandexgpt, "is_configured", return_value=True), mock.patch.object(
            llm.yandexgpt,
            "complete",
            return_value=LlmResult(None, "yandexgpt-lite", 8000, "yandexgpt_unreachable: timeout"),
        ):
            response = handle_decision(copy.deepcopy(self.request))
        self.assertEqual(response["card"]["source"], "fallback")
        self.assertEqual(
            response["diagnostics"]["llm"]["error"], "yandexgpt_unreachable: timeout"
        )

    def test_a_valid_model_card_is_shown_and_marked_as_llm(self) -> None:
        draft = {"headline": "Молочный кувшин: утренний чекпоинт"}
        with mock.patch.dict("os.environ", {"LLM_PROVIDER": "yandexgpt"}), mock.patch.object(llm.yandexgpt, "is_configured", return_value=True), mock.patch.object(
            llm.yandexgpt,
            "complete",
            return_value=LlmResult(json.dumps(draft, ensure_ascii=False), "yandexgpt-lite", 300, None),
        ):
            response = handle_decision(copy.deepcopy(self.request))
        self.assertEqual(response["card"]["source"], "llm")
        self.assertEqual(response["card"]["headline"], "Молочный кувшин: утренний чекпоинт")
        self.assertEqual(response["diagnostics"]["llm"]["latency_ms"], 300)

    def test_local_ollama_card_is_used_without_cloud_credentials(self) -> None:
        draft = {"headline": "Молочный кувшин для доброго утра"}
        with mock.patch.dict("os.environ", {"LLM_PROVIDER": "ollama"}), mock.patch.object(
            llm.ollama,
            "complete",
            return_value=OllamaResult(json.dumps(draft, ensure_ascii=False), "qwen3:1.7b", 420, None),
        ):
            response = handle_decision(copy.deepcopy(self.request))
        self.assertEqual(response["card"]["source"], "llm")
        self.assertEqual(response["card"]["headline"], "Молочный кувшин для доброго утра")
        self.assertEqual(
            response["card"]["body"],
            "До 12.09.2026 купите «Молоко питьевое 1 л» — получите предмет "
            "«Молочный кувшин» для рецепта «Доброе утро».",
        )
        self.assertEqual(response["card"]["deadline_line"], "Срок: до 12.09.2026")
        self.assertEqual(response["diagnostics"]["llm"]["model"], "qwen3:1.7b")

    def test_local_ollama_timeout_returns_a_fallback_result(self) -> None:
        with mock.patch("urllib.request.urlopen", side_effect=TimeoutError("timed out")):
            result = llm.ollama.complete("system", "user")
        self.assertIsNone(result.text)
        self.assertEqual(result.model, "qwen3:1.7b")
        self.assertIn("ollama_unreachable", result.error)

    def test_yandex_timeout_returns_a_fallback_result(self) -> None:
        with mock.patch.dict(
            "os.environ",
            {"YANDEX_API_KEY": "test", "YANDEX_FOLDER_ID": "test"},
        ), mock.patch("urllib.request.urlopen", side_effect=TimeoutError("timed out")):
            result = llm.yandexgpt.complete("system", "user")
        self.assertIsNone(result.text)
        self.assertIn("yandexgpt_unreachable", result.error)


class CardContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.challenge = offer_challenge()
        self.valid = {
            "headline": "Молочный чекпоинт",
            "body": "Купите один товар до 12.09.2026 — «Молочный кувшин» приблизит рецепт.",
            "reward_line": "Предмет «Молочный кувшин»",
            "deadline_line": "До 12.09.2026",
            "sponsor_line": "При поддержке бренда",
        }

    def test_a_clean_card_has_no_violations(self) -> None:
        self.assertEqual(check(self.valid, self.challenge, "Молочный кувшин"), [])

    def test_an_invented_price_is_blocked(self) -> None:
        card = {**self.valid, "reward_line": "Предмет «Молочный кувшин» за 149 ₽"}
        self.assertIn("invented_price", check(card, self.challenge, "Молочный кувшин"))

    def test_an_invented_sku_is_blocked(self) -> None:
        card = {**self.valid, "body": "Купите sku-fake-999 — «Молочный кувшин» приблизит рецепт."}
        self.assertIn("invented_sku", check(card, self.challenge, "Молочный кувшин"))

    def test_a_changed_deadline_is_blocked(self) -> None:
        card = {**self.valid, "deadline_line": "Осталось 14 дней"}
        self.assertIn("changed_deadline", check(card, self.challenge, "Молочный кувшин"))

    def test_a_promised_causal_effect_is_blocked(self) -> None:
        card = {**self.valid, "body": "Покупка гарантирует скидку, «Молочный кувшин» ваша."}
        self.assertIn("promised_causal_lift", check(card, self.challenge, "Молочный кувшин"))

    def test_a_lifted_hold_is_blocked(self) -> None:
        card = {**self.valid, "body": "Награда ваша, забирайте сейчас, «Молочный кувшин» ждёт."}
        self.assertIn("released_hold", check(card, self.challenge, "Молочный кувшин"))

    def test_hidden_sponsorship_is_blocked(self) -> None:
        card = {**self.valid, "sponsor_line": None}
        self.assertIn("hidden_sponsorship", check(card, self.challenge, "Молочный кувшин"))

    def test_false_urgency_is_blocked(self) -> None:
        card = {**self.valid, "headline": "Только сегодня: Молочный кувшин"}
        self.assertIn("false_urgency", check(card, self.challenge, "Молочный кувшин"))

    def test_a_card_that_forgets_the_reward_is_blocked(self) -> None:
        card = {**self.valid, "reward_line": "Полезный предмет"}
        card["body"] = "Купите один товар до 12.09.2026 и продвиньтесь по рецепту."
        card["headline"] = "Кофейный чекпоинт"
        self.assertIn("reward_mismatch", check(card, self.challenge, "Молочный кувшин"))

    def test_a_card_without_a_next_step_is_blocked(self) -> None:
        card = {**self.valid, "body": "«Молочный кувшин» — приятный предмет коллекции."}
        self.assertIn("missing_next_step", check(card, self.challenge, "Молочный кувшин"))

    def test_extra_fields_are_blocked(self) -> None:
        card = {**self.valid, "price": "149"}
        self.assertIn("unexpected_card_field", check(card, self.challenge, "Молочный кувшин"))


if __name__ == "__main__":
    unittest.main()
