"""Reproducible heterogeneous synthetic audience for the PoC simulation.

Only the five audience shares come from the case Q&A. Interest and behaviour are
scenario assumptions: they are latent outcomes and must never become policy inputs.
"""
from __future__ import annotations

import json
import pathlib
import random
from collections import Counter

CONFIG_PATH = pathlib.Path(__file__).with_name("audience.json")


def load_audience() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def build_population(scenario: dict, users: int | None = None) -> list[dict]:
    config = load_audience()
    total = scenario["users"] if users is None else users
    seed = scenario["seed"]
    rng = random.Random(seed)
    segment_counts = allocate_counts(total, {row["id"]: row["share"] for row in config["segments"]})
    rows = []

    for segment in config["segments"]:
        segment_id = segment["id"]
        engagement_counts = allocate_counts(segment_counts[segment_id], segment["engagement_shares"])
        for engagement_id, count in engagement_counts.items():
            behaviour = config["engagement"][engagement_id]
            for _ in range(count):
                inventory_count = 0 if scenario.get("start_empty_inventory", False) else _weighted_choice(
                    rng, {int(key): value for key, value in behaviour["starting_inventory_distribution"].items()}
                )
                missing_probability = min(
                    1.0,
                    scenario.get("missing_history_share", 0.1) * segment["missing_history_multiplier"],
                )
                rows.append({
                    "audience_segment": segment_id,
                    "audience_label": segment["label"],
                    "engagement": engagement_id,
                    "engagement_label": behaviour["label"],
                    "baseline_purchase_multiplier": segment["baseline_purchase_multiplier"],
                    "positive_response_multiplier": behaviour["positive_response_multiplier"],
                    "negative_response_multiplier": behaviour["negative_response_multiplier"],
                    "coupon_craft_probability": behaviour["coupon_craft_probability"],
                    "coupon_redemption_probability": behaviour["coupon_redemption_probability"],
                    "inventory_count": inventory_count,
                    "missing_history": rng.random() < missing_probability,
                })

    rng.shuffle(rows)
    return rows


def allocate_counts(total: int, shares: dict[str, float]) -> dict[str, int]:
    """Largest-remainder allocation keeps the requested total and deterministic ties."""
    exact = {key: total * share for key, share in shares.items()}
    counts = {key: int(value) for key, value in exact.items()}
    remaining = total - sum(counts.values())
    order = sorted(shares, key=lambda key: (-(exact[key] - counts[key]), key))
    for key in order[:remaining]:
        counts[key] += 1
    return counts


def count_by(rows: list[dict], field: str) -> dict[str, int]:
    return dict(Counter(row[field] for row in rows))


def _weighted_choice(rng: random.Random, weights: dict[int, float]) -> int:
    draw = rng.random()
    cumulative = 0.0
    for value, weight in weights.items():
        cumulative += weight
        if draw < cumulative:
            return value
    return next(reversed(weights))
