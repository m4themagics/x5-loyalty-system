"""Единственная точка входа движка локального PoC.

    python3 recsys/engine/cli.py decision < запрос.json > ответ.json
    python3 recsys/engine/cli.py event    < запрос.json > ответ.json

В stdout всегда попадает ровно один JSON-объект. Диагностика идёт в stderr.
Код возврата: 0 — ответ по контракту, 2 — некорректный вход, 1 — сбой движка.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from recsys.engine.decision import handle_decision  # noqa: E402
from recsys.engine.event import handle_event  # noqa: E402

HANDLERS = {"decision": handle_decision, "event": handle_event}
CONTRACT_VERSION = 1


def main(argv: list[str]) -> int:
    if len(argv) != 1 or argv[0] not in HANDLERS:
        return _fail("unknown", "bad_request", f"ожидается одна команда: {', '.join(HANDLERS)}", 2)

    raw = sys.stdin.read()
    try:
        request = json.loads(raw)
    except json.JSONDecodeError as error:
        return _fail("unknown", "bad_request", f"вход не является JSON: {error}", 2)

    if not isinstance(request, dict):
        return _fail("unknown", "bad_request", "вход должен быть объектом JSON", 2)

    request_id = request.get("request_id")
    request_id = request_id if isinstance(request_id, str) and request_id else "unknown"

    if request.get("contract_version") != CONTRACT_VERSION:
        return _fail(
            request_id,
            "bad_request",
            f"неподдерживаемая версия контракта: {request.get('contract_version')!r}",
            2,
        )

    try:
        response = HANDLERS[argv[0]](request)
    except (KeyError, TypeError, ValueError) as error:
        return _fail(request_id, "bad_request", f"запрос не соответствует контракту: {error}", 2)
    except Exception as error:  # noqa: BLE001 - движок обязан вернуть конверт, а не трейсбек
        return _fail(request_id, "engine_failed", f"сбой движка: {error}", 1)

    _emit(response)
    return 0


def _fail(request_id: str, code: str, message: str, exit_code: int) -> int:
    _emit(
        {
            "contract_version": CONTRACT_VERSION,
            "request_id": request_id,
            "error": {"code": code, "message": message[:500]},
        }
    )
    print(message, file=sys.stderr)
    return exit_code


def _emit(payload: dict) -> None:
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
