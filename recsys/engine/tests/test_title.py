"""Collection title: a deterministic template and protection against promises."""
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
        self.assertIn("title_mentions_money_or_promise", check("10% Discount"))
        self.assertIn("title_mentions_money_or_promise", check("Guaranteed Gift"))
        self.assertIn("title_mentions_money_or_promise", check("Save 500 rub"))

    def test_rejects_long_or_wordy_titles(self) -> None:
        self.assertIn("title_too_long", check("Utterly Incredible Collector Of Collections"))
        self.assertIn("title_too_many_words", check("master of morning dairy sets"))

    def test_accepts_plain_collection_title(self) -> None:
        self.assertEqual(check("Breakfast Master"), [])

    def test_empty_title_is_rejected(self) -> None:
        self.assertEqual(check("   "), ["title_empty"])

    def test_rejects_a_list_of_items_instead_of_a_title(self) -> None:
        facts = {"item_names": ["Clubhouse Toaster", "Milk Pitcher", "Breakfast Pan"],
                 "top_categories": ["Bread & Bakery"]}
        self.assertIn("title_is_enumeration", check("Toaster, pitcher, breakfast", facts))
        self.assertIn("title_repeats_collection", check("Toaster Pitcher Breakfast", facts))

    def test_a_real_title_over_the_same_collection_passes(self) -> None:
        facts = {"item_names": ["Clubhouse Toaster", "Milk Pitcher", "Breakfast Pan"],
                 "top_categories": ["Bread & Bakery"]}
        self.assertEqual(check("Bread Baron", facts), [])
        self.assertEqual(check("Morning King", facts), [])


class TitleTemplateTest(unittest.TestCase):
    def test_completed_set_wins_over_categories(self) -> None:
        facts = {
            "completed_recipes": ["Good Morning"],
            "top_categories": ["Dairy"],
            "items_total": 4,
        }
        self.assertEqual(template_title(facts)["title"], '"Good Morning" Master')

    def test_empty_collection_has_its_own_title(self) -> None:
        facts = {"completed_recipes": [], "top_categories": [], "items_total": 0}
        self.assertEqual(template_title(facts)["title"], "Empty Shelf")

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
