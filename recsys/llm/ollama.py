"""Локальный LLM-провайдер через HTTP API Ollama, без Python SDK."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import NamedTuple


DEFAULT_URL = "http://127.0.0.1:11434/api/chat"
DEFAULT_MODEL = "qwen3:1.7b"
DEFAULT_TIMEOUT_SECONDS = 20.0


class LlmResult(NamedTuple):
    text: str | None
    model: str | None
    latency_ms: int | None
    error: str | None


def complete(system_prompt: str, user_prompt: str) -> LlmResult:
    model = os.environ.get("OLLAMA_MODEL", DEFAULT_MODEL)
    url = os.environ.get("OLLAMA_URL", DEFAULT_URL)
    payload = {
        "model": model,
        "stream": False,
        "think": False,
        "format": "json",
        "keep_alive": "10m",
        "options": {"temperature": 0.2, "num_predict": 500},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=_timeout_seconds()) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return LlmResult(None, model, _elapsed_ms(started), f"ollama_http_{error.code}")
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        reason = getattr(error, "reason", str(error))
        return LlmResult(None, model, _elapsed_ms(started), f"ollama_unreachable: {reason}")
    except json.JSONDecodeError:
        return LlmResult(None, model, _elapsed_ms(started), "ollama_invalid_response_json")

    try:
        text = body["message"]["content"]
    except (KeyError, TypeError):
        return LlmResult(None, model, _elapsed_ms(started), "ollama_unexpected_response")
    if not isinstance(text, str) or not text.strip():
        return LlmResult(None, model, _elapsed_ms(started), "ollama_empty_response")
    return LlmResult(text, model, _elapsed_ms(started), None)


def _timeout_seconds() -> float:
    try:
        return float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS))
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS


def _elapsed_ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)
