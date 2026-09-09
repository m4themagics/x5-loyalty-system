"""Collection-title handler: a contract envelope around the text generator."""
from __future__ import annotations

import time
from typing import Any

from recsys.llm.title import build_title

CONTRACT_VERSION = 2


def handle_title(request: dict[str, Any]) -> dict[str, Any]:
    profile = request["profile"]
    game = request["game"]

    title, _llm_error = build_title(profile, game)

    return {
        "contract_version": CONTRACT_VERSION,
        "request_id": request["request_id"],
        "server_time_ms": int(time.time() * 1000),
        "title": title["title"],
        "subtitle": title["subtitle"],
        "source": title["source"],
        "violations": title["violations"],
    }
