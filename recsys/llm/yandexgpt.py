"""Адаптер YandexGPT Lite через HTTP, без SDK и без новых зависимостей.

Ключ и идентификатор каталога берутся только из окружения серверного процесса и никогда
не печатаются, не логируются и не сохраняются в файлы.
Справка по API: https://aistudio.yandex.ru/ru/docs/ai-studio/text-generation/api-ref/TextGeneration/completion
"""
import json
import os
import time
import urllib.error
import urllib.request
from typing import Any, NamedTuple

COMPLETION_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
DEFAULT_MODEL = "yandexgpt-lite"
DEFAULT_TIMEOUT_SECONDS = 8.0


class LlmResult(NamedTuple):
    text: str | None
    model: str | None
    latency_ms: int | None
    error: str | None


def is_configured() -> bool:
    return bool(os.environ.get("YANDEX_API_KEY") and os.environ.get("YANDEX_FOLDER_ID"))


def complete(system_prompt: str, user_prompt: str) -> LlmResult:
    api_key = os.environ.get("YANDEX_API_KEY")
    folder_id = os.environ.get("YANDEX_FOLDER_ID")
    if not api_key or not folder_id:
        return LlmResult(None, None, None, "yandexgpt_credentials_missing")

    model = os.environ.get("YANDEX_GPT_MODEL", DEFAULT_MODEL)
    timeout = _timeout_seconds()
    payload = {
        "modelUri": f"gpt://{folder_id}/{model}",
        "completionOptions": {"stream": False, "temperature": 0.3, "maxTokens": "600"},
        "messages": [
            {"role": "system", "text": system_prompt},
            {"role": "user", "text": user_prompt},
        ],
    }
    request = urllib.request.Request(
        COMPLETION_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Api-Key {api_key}",
            "x-folder-id": folder_id,
        },
        method="POST",
    )

    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return LlmResult(None, model, _elapsed_ms(started), f"yandexgpt_http_{error.code}")
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        reason = getattr(error, "reason", str(error))
        return LlmResult(None, model, _elapsed_ms(started), f"yandexgpt_unreachable: {reason}")
    except json.JSONDecodeError:
        return LlmResult(None, model, _elapsed_ms(started), "yandexgpt_invalid_json")

    try:
        text = body["result"]["alternatives"][0]["message"]["text"]
    except (KeyError, IndexError, TypeError):
        return LlmResult(None, model, _elapsed_ms(started), "yandexgpt_unexpected_response")

    return LlmResult(text, model, _elapsed_ms(started), None)


def _timeout_seconds() -> float:
    try:
        return float(os.environ.get("YANDEX_GPT_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS))
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS


def _elapsed_ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)
