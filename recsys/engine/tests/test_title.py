"""Титул коллекции: детерминированный шаблон и защита от обещаний."""
import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3]))

from recsys.engine.title import handle_title  # noqa: E402
from recsys.llm.title import check, collect_facts, template_title  # noqa: E402

EXAMPLES = pathlib.Path(__file__).resolve().parents[2] / "contract" / "examples"


def _read(name: str) -> dict:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


class TitleValidatorTest(unittest.TestCase):
    def test_rejects_money_and_promises(self) -> None:
        self.assertIn("title_mentions_money_or_promise", check("Скидка 10%"))
        self.assertIn("title_mentions_money_or_promise", check("Гарантируем подарок"))
        self.assertIn("title_mentions_money_or_promise", check("Экономия 500 руб"))

    def test_rejects_long_or_wordy_titles(self) -> None:
        self.assertIn("title_too_long", check("Совершенно невероятный собиратель коллекций"))
        self.assertIn("title_too_many_words", check("мастер утреннего молочного набора"))

    def test_accepts_plain_collection_title(self) -> None:
        self.assertEqual(check("Мастер завтраков"), [])

    def test_empty_title_is_rejected(self) -> None:
        self.assertEqual(check("   "), ["title_empty"])


class TitleTemplateTest(unittest.TestCase):
    def test_completed_set_wins_over_categories(self) -> None:
        facts = {
            "completed_recipes": ["Доброе утро"],
            "top_categories": ["Молочные продукты"],
            "items_total": 4,
        }
        self.assertEqual(template_title(facts)["title"], "Мастер «Доброе утро»")

    def test_empty_collection_has_its_own_title(self) -> None:
        facts = {"completed_recipes": [], "top_categories": [], "items_total": 0}
        self.assertEqual(template_title(facts)["title"], "Пустая полка")

    def test_facts_count_only_owned_items(self) -> None:
        request = _read("title-request-seeded.json")
        facts = collect_facts(request["profile"], request["game"])
        self.assertEqual(facts["items_total"], 3)
        self.assertEqual(facts["completed_recipes"], [])


class TitleHandlerTest(unittest.TestCase):
    def test_response_matches_reference_example(self) -> None:
        request = _read("title-request-seeded.json")
        expected = _read("title-response-seeded.json")

        response = handle_title(request)

        self.assertEqual(response["title"], expected["title"])
        self.assertEqual(response["subtitle"], expected["subtitle"])
        self.assertEqual(response["source"], "fallback")
        self.assertEqual(response["violations"], [])
        self.assertEqual(response["contract_version"], 2)


if __name__ == "__main__":
    unittest.main()
