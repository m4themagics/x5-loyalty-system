"""Загрузка политики, каталога синтетических SKU и кампаний.

Пороговые значения не выдумываются в момент выдачи задания: они читаются из
`data/policy.json`. Отсутствие обязательного параметра запрещает новое обещание.
"""
import json
import pathlib
from typing import Any

ENGINE_ROOT = pathlib.Path(__file__).resolve().parent
RECSYS_ROOT = ENGINE_ROOT.parent


class PolicyError(Exception):
    """Обязательный параметр политики отсутствует или задан некорректно."""


def load_policy(path: pathlib.Path | None = None) -> dict[str, Any]:
    policy = _read_json(path or ENGINE_ROOT / "data" / "policy.json")
    missing = [name for name in policy.get("required_parameters", []) if name not in policy]
    if missing:
        raise PolicyError(f"нет обязательных параметров политики: {', '.join(sorted(missing))}")
    if policy.get("insufficient_history_policy") not in {"refuse", "fixed_challenge"}:
        raise PolicyError("insufficient_history_policy должен быть refuse или fixed_challenge")
    return policy


def load_sku_catalog(path: pathlib.Path | None = None) -> dict[str, Any]:
    return _read_json(path or ENGINE_ROOT / "data" / "sku_catalog.json")


def load_campaigns(path: pathlib.Path | None = None) -> dict[str, Any]:
    return _read_json(path or RECSYS_ROOT / "catalog" / "campaigns.json")


def rubles_to_kopecks(value: float | int) -> int:
    """Суммы каталога кампаний заданы в рублях; храним и считаем только копейки."""
    return int(round(float(value) * 100))


def _read_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise PolicyError(f"нет файла политики: {path}") from error
    except json.JSONDecodeError as error:
        raise PolicyError(f"повреждён файл политики {path}: {error}") from error
