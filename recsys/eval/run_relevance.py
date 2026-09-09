"""Runs the engine over independently labelled profiles and prints a relevance report.

Threshold: at least 28 hits out of 40. A refusal on an eligible profile counts as a miss, and no
profile is dropped after the run. The negative sample is checked separately.

This script only reads the labels: `rubric.json` is frozen before the run.

Run from the repository root: python3 recsys/eval/run_relevance.py
"""
from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys
from copy import deepcopy

ROOT = pathlib.Path(__file__).resolve().parents[2]
EVAL_ROOT = ROOT / "recsys" / "eval"
EXAMPLES = ROOT / "recsys" / "contract" / "examples"
ENGINE = ROOT / "recsys" / "engine" / "cli.py"
NOW_MS = 1_788_598_800_000
CONTRACT_VERSION = 2
DAY_MS = 86_400_000


def main() -> int:
    if not ENGINE.exists():
        print(f"engine not found: {ENGINE}. The run cannot proceed.", file=sys.stderr)
        return 2

    rubric = json.loads((EVAL_ROOT / "rubric.json").read_text(encoding="utf-8"))
    game = json.loads((EXAMPLES / "game-snapshot.json").read_text(encoding="utf-8"))
    budget = json.loads((EXAMPLES / "budget.json").read_text(encoding="utf-8"))
    ads = json.loads((EXAMPLES / "ads.json").read_text(encoding="utf-8"))

    hits, misses = [], []
    for entry in rubric["eligible"]:
        profile = prepare_post_onboarding_profile(
            load_profile("eligible", entry["profile_id"])
        )
        response = call_engine(profile, game, budget, ads)
        if response is None:
            misses.append((entry["profile_id"], "the engine returned an error"))
            continue
        if response["status"] != "offer":
            misses.append((entry["profile_id"], f"refusal: {', '.join(response['reason_codes'])}"))
            continue
        item_id = response["challenge"]["reward"]["digital_item_id"]
        if item_id in entry["acceptable_item_ids"]:
            hits.append((entry["profile_id"], item_id))
        else:
            misses.append((entry["profile_id"], f"item outside the rubric: {item_id}"))

    refusal_correct, refusal_wrong = [], []
    for entry in rubric["refusal"]:
        profile = load_profile("refusal", entry["profile_id"])
        response = call_engine(profile, game, budget, ads)
        if response is None:
            refusal_wrong.append((entry["profile_id"], "the engine returned an error"))
            continue
        if response["status"] == "no_action":
            expected = set(entry["expected_reason_codes"])
            matched = expected.issubset(set(response["reason_codes"]))
            if matched:
                refusal_correct.append(
                    (entry["profile_id"], ", ".join(response["reason_codes"]), True)
                )
            else:
                refusal_wrong.append((entry["profile_id"],
                    "wrong refusal reason: " + ", ".join(response["reason_codes"])))
        else:
            refusal_wrong.append((entry["profile_id"], "a challenge was shown instead of a refusal"))

    total = len(rubric["eligible"])
    minimum = rubric["threshold"]["minimum_hits"]

    print("Relevance against a separately stored rubric of synthetic profiles")
    print("  scope: repeat digital cycle after onboarding; Ads state supplied")
    print(f"  labelling: {rubric['label_status']} from {rubric['labelled_on']}, "
          f"expert confirmation: {rubric['expert_confirmation']}")
    print(f"  denominator: {total}, threshold: {minimum}")
    print(f"  hits: {len(hits)}, misses: {len(misses)}")
    for profile_id, reason in misses:
        print(f"    miss {profile_id}: {reason}")

    print("\nNegative sample (a refusal is expected)")
    print(f"  correct refusals: {len(refusal_correct)} of {len(rubric['refusal'])}")
    for profile_id, reasons, matched in refusal_correct:
        mark = "matched" if matched else "different"
        print(f"    {profile_id}: {reasons} (expected reason {mark})")
    for profile_id, reason in refusal_wrong:
        print(f"    ERROR {profile_id}: {reason}")

    print(
        "\nThis is the result of one deterministic set of synthetic profiles. "
        "It does not measure relevance for real customers."
    )

    passed = (total == rubric["threshold"]["eligible_profiles"]
              and len(hits) >= minimum and not refusal_wrong)
    print(f"\nRESULT: {'threshold met' if passed else 'threshold not met'}")
    return 0 if passed else 1


def load_profile(kind: str, profile_id: str) -> dict:
    return json.loads(
        (EVAL_ROOT / "profiles" / kind / f"{profile_id}.json").read_text(encoding="utf-8")
    )


def build_game_features(profile: dict, game: dict) -> dict:
    """Mirror of `buildDemoGameFeatures` from the webapp: features follow the same rules."""
    owned = {entry["item_id"] for entry in profile["inventory"]}
    return {
        "inventory_total": sum(entry["quantity"] for entry in profile["inventory"]),
        "inventory_distinct": len(profile["inventory"]),
        "duplicate_item_ids": [
            entry["item_id"] for entry in profile["inventory"] if entry["quantity"] > 1
        ],
        "recipe_progress": [
            {
                "recipe_id": recipe["id"],
                "matched_count": sum(1 for item_id in recipe["item_ids"] if item_id in owned),
                "owned_item_ids": [item_id for item_id in recipe["item_ids"] if item_id in owned],
                "missing_item_ids": [
                    item_id for item_id in recipe["item_ids"] if item_id not in owned
                ],
            }
            for recipe in game["recipes"]
        ],
    }


def prepare_post_onboarding_profile(profile: dict) -> dict:
    """Move an eligible fixture to a repeat digital cycle without changing its rubric.

    The relevance test intentionally isolates next-best-action ranking from the limited
    advertiser coverage of the first physical gift. The synthetic onboarding reward is
    already spent, so it changes neither current inventory nor acceptable item ids.
    """
    prepared = deepcopy(profile)
    profile_id = prepared["profile_id"]
    prepared["issued_rewards"] = [
        {
            "reward_id": f"rwd-{profile_id}-onboarding",
            "challenge_id": f"chl-{profile_id}-onboarding",
            "source_event_id": f"evt-{profile_id}-onboarding",
            "item_instance_id": f"inst-{profile_id}-spent",
            "item_id": "club-toaster",
            "sku_entitlement_id": f"ent-{profile_id}-redeemed",
            "sku_id": "gift-bun-60",
            "issued_at_ms": NOW_MS - 70 * DAY_MS,
        }
    ]
    return prepared


def call_engine(profile: dict, game: dict, budget: dict, ads: dict) -> dict | None:
    request = {
        "contract_version": CONTRACT_VERSION,
        "request_id": f"req-eval-{profile['profile_id']}",
        "now_ms": NOW_MS,
        "profile": profile,
        "game": game,
        "game_features": build_game_features(profile, game),
        "budget": budget,
        "ads": ads,
    }
    result = subprocess.run(
        [sys.executable, str(ENGINE), "decision"],
        input=json.dumps(request, ensure_ascii=False),
        capture_output=True,
        text=True,
        cwd=str(ROOT),
        env={**os.environ, "LLM_PROVIDER": "template", "PYTHONDONTWRITEBYTECODE": "1"},
    )
    if result.returncode != 0:
        print(f"  engine: exit {result.returncode}: {result.stderr.strip()}", file=sys.stderr)
        return None
    return json.loads(result.stdout)


if __name__ == "__main__":
    sys.exit(main())
