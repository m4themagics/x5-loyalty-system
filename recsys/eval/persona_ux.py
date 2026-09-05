"""Fifteen explicitly synthetic Qwen roleplays, not human tests or conversion evidence."""
import argparse
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from recsys.eval.population import load_audience  # noqa: E402
from recsys.llm.ollama import DEFAULT_MODEL, DEFAULT_URL, LlmResult  # noqa: E402

ENUMS = {
    "next_step": {"paid_category_purchase", "open_box_no_purchase", "get_immediate_coupon"},
    "first_reward": {"digital_and_physical", "physical_only", "coupon_only"},
    "four_items": {"coupon_or_funded_product", "free_product_every_task", "keep_items_and_coupon"},
    "intent": {"try", "maybe", "skip"},
}
FACTS = {
    "next_step": "paid_category_purchase", "first_reward": "digital_and_physical",
    "four_items": "coupon_or_funded_product",
}
SUBJECTIVE_FIELDS = {"intent", "main_reason", "confusion_points", "suggested_copy"}
RESPONSE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["persona_id", "comprehension", "subjective"],
    "properties": {
        "persona_id": {"type": "string"},
        "comprehension": {
            "type": "object", "additionalProperties": False, "required": list(FACTS),
            "properties": {field: {"type": "string", "enum": sorted(ENUMS[field])} for field in FACTS},
        },
        "subjective": {
            "type": "object", "additionalProperties": False,
            "required": ["intent", "main_reason", "confusion_points", "suggested_copy"],
            "properties": {
                "intent": {"type": "string", "enum": sorted(ENUMS["intent"])},
                "main_reason": {"type": "string", "minLength": 1, "maxLength": 400},
                "confusion_points": {"type": "array", "maxItems": 4, "items": {
                    "type": "string", "minLength": 1, "maxLength": 200}},
                "suggested_copy": {"type": "string", "minLength": 1, "maxLength": 240},
            },
        },
    },
}
SYSTEM_PROMPT = """Синтетический разбор текста, не интервью реального человека. Верни JSON
ровно с тремя ключами: persona_id, comprehension, subjective. Никакого Markdown.

Блок comprehension: извлеки ТОЛЬКО фактические правила карточки, независимо от отношения
персоны. Это вопрос о том, что написано, а не что ты хочешь получить. Ровно три ключа:
next_step: paid_category_purchase = оплатить товар категории; open_box_no_purchase = открыть
коробку без покупки; get_immediate_coupon = сразу забрать скидку.
first_reward: digital_and_physical = цифровой предмет И настоящий товар; physical_only =
только настоящий товар; coupon_only = только скидка.
four_items: coupon_or_funded_product = потратить на скидку ИЛИ обеспеченный товар;
free_product_every_task = бесплатный товар за каждое задание;
keep_items_and_coupon = сохранить четыре предмета и получить скидку.

Блок subjective: только здесь дай субъективную реакцию указанной персоны, не меняя факты.
Ровно четыре ключа: intent (try/maybe/skip); main_reason (по-русски, 1–400 символов);
confusion_points (массив 0–4 русских строк по 1–200 символов, только непонятные вопросы,
пустой массив если всё ясно); suggested_copy (русская формулировка, 1–240 символов).
persona_id должен точно совпадать со входом. Не изображай измеренные покупки или конверсию."""

PRODUCT_COPY = {
    "screen": "Собирай свою выгоду",
    "Что сделать": "За семь дней оплатите один товар из указанной молочной категории.",
    "Что получите": "После первого выполненного задания — бесплатный йогурт И цифровой "
                    "молочный кувшин в коллекцию. Это первый из четырёх предметов.",
    "После 4 предметов": "Потратьте четыре предмета на скидку. В целевой версии для обеспеченного "
                         "рецепта можно вместо скидки выбрать указанный бесплатный товар. "
                         "Предметы расходуются один раз; скидка и товар одновременно не выдаются.",
    "Ограничения": "Бесплатный товар не положен за каждое задание. Сейчас это локальное демо "
                    "с вымышленными покупками, реальное получение в магазине не подключено.",
}


def complete(system_prompt, user_prompt):
    """Eval-specific structured response, retaining all correct AND incorrect answer options."""
    model = os.environ.get("OLLAMA_MODEL", DEFAULT_MODEL)
    payload = {"model": model, "stream": False, "think": False, "format": RESPONSE_SCHEMA,
               "keep_alive": "10m", "options": {"temperature": 0.2, "num_predict": 700},
               "messages": [{"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}]}
    request = urllib.request.Request(os.environ.get("OLLAMA_URL", DEFAULT_URL),
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST")
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            text = json.load(response)["message"]["content"]
        return LlmResult(text, model, int((time.monotonic() - started) * 1000), None)
    except urllib.error.HTTPError as error:
        reason = f"ollama_http_{error.code}"
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        reason = f"ollama_unreachable: {error}"
    except (ValueError, KeyError, TypeError):
        reason = "ollama_invalid_response"
    return LlmResult(None, model, int((time.monotonic() - started) * 1000), reason)


def build_personas():
    config = load_audience()
    return [{"persona_id": f"{segment['id']}_{attitude}", "segment_id": segment["id"],
             "segment_label": segment["label"], "attitude": attitude,
             "attitude_label": config["engagement"][attitude]["label"],
             "note": "Вымышленный совершеннолетний пользователь; опасные категории не предлагаются."}
            for segment in config["segments"]
            for attitude in ("interested", "neutral", "skeptical")]


def validate_response(text, persona_id):
    try:
        payload = json.loads(text)
    except (json.JSONDecodeError, TypeError) as error:
        raise ValueError("invalid_json") from error
    if not isinstance(payload, dict) or set(payload) != {"persona_id", "comprehension", "subjective"}:
        raise ValueError("unexpected_fields")
    if payload["persona_id"] != persona_id:
        raise ValueError("wrong_persona_id")
    comprehension, subjective = payload["comprehension"], payload["subjective"]
    if not isinstance(comprehension, dict) or set(comprehension) != set(FACTS):
        raise ValueError("invalid_comprehension_fields")
    if not isinstance(subjective, dict) or set(subjective) != SUBJECTIVE_FIELDS:
        raise ValueError("invalid_subjective_fields")
    for field, values in ENUMS.items():
        value = subjective[field] if field == "intent" else comprehension[field]
        if not isinstance(value, str) or value not in values:
            raise ValueError(f"invalid_{field}")
    for field, maximum in (("main_reason", 400), ("suggested_copy", 240)):
        if not isinstance(subjective[field], str) or not 1 <= len(subjective[field].strip()) <= maximum:
            raise ValueError(f"invalid_{field}")
    points = subjective["confusion_points"]
    if (not isinstance(points, list) or len(points) > 4
            or any(not isinstance(point, str) or not 1 <= len(point.strip()) <= 200 for point in points)):
        raise ValueError("invalid_confusion_points")
    return payload


def comprehension_score(response):
    return sum(response["comprehension"][field] == expected for field, expected in FACTS.items())


def run(live=False, progress=None):
    rows, unavailable = [], False
    for persona in build_personas():
        row = {"persona": persona, "response": None, "model": None,
               "latency_ms": None, "error": None,
               "status": "prepared_not_run" if not live else "not_run_after_unavailable"}
        if live and not unavailable:
            result = complete(SYSTEM_PROMPT, json.dumps(
                {"persona": persona, "product_copy": PRODUCT_COPY}, ensure_ascii=False))
            row.update(model=result.model, latency_ms=result.latency_ms, error=result.error)
            if result.error:
                row["status"] = "model_error"
                unavailable = result.error.startswith(("ollama_unreachable", "ollama_http_404"))
            else:
                try:
                    row["response"] = validate_response(result.text, persona["persona_id"])
                    row["status"] = "valid"
                except ValueError as error:
                    row.update(status="invalid_response", error=str(error), raw_response=result.text)
            if progress:
                progress(f"{persona['persona_id']}: {row['status']}")
        rows.append(row)
    valid = [row["response"] for row in rows if row["status"] == "valid"]
    status = ("prepared_not_run" if not live else "completed" if len(valid) == len(rows)
              else "unavailable" if unavailable and not valid else "partial")
    return {
        "report_version": 2, "evidence_type": "synthetic_llm_roleplay", "status": status,
        "actual_human_participants": 0, "planned_personas": 15, "valid_responses": len(valid),
        "product_copy": PRODUCT_COPY, "system_prompt": SYSTEM_PROMPT, "personas": rows,
        "structured_output_schema": RESPONSE_SCHEMA,
        "response_counts": {field: dict(Counter(
            row["subjective" if field == "intent" else "comprehension"][field] for row in valid))
                            for field in ENUMS},
        "comprehension": {
            **{f"correct_{field}": sum(row["comprehension"][field] == expected for row in valid)
               for field, expected in FACTS.items()},
            "all_three_correct": sum(comprehension_score(row) == 3 for row in valid),
            "total_correct_facts": sum(comprehension_score(row) for row in valid),
            "fact_opportunities": 15 * 3,
        },
        "limitations": ["Qwen responses are synthetic opinions, not observed behaviour",
                        "15 balanced personas do not represent actual audience frequencies",
                        "no estimate of conversion, retention, relevance or profit",
                        "reading supplied product text does not test the working interface",
                        "JSON validity is not independent evidence of correct comprehension"],
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="actually call local Qwen via Ollama")
    parser.add_argument("--json-out", type=pathlib.Path)
    args = parser.parse_args(argv)
    report = run(args.live, progress=lambda line: print(line, flush=True))
    print(f"Синтетические персоны: {report['status']}, валидных ответов "
          f"{report['valid_responses']}/15; реальных участников: 0.")
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0 if report["status"] in {"prepared_not_run", "completed"} else 2


if __name__ == "__main__":
    sys.exit(main())
