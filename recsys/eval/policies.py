"""Evaluation-only allocation policies: observable inputs, identical safety gates.

No segment/interest label is available here. These policies do not change the runtime
engine or its wire contract. A funding gate is applied before publication/reservation.
"""
from unittest.mock import patch

from recsys.engine import decision as engine_decision

POLICIES = ("personalized_broad", "sponsored_onboarding", "fixed_dairy", "reward_only")
FIXED_CATEGORY = "Молочные продукты"


def choose_decision(request, decide, policy_name):
    if policy_name not in POLICIES:
        raise ValueError(f"Unknown evaluation policy: {policy_name}")
    if policy_name == "fixed_dairy":
        # Keep the real engine's history, stock, risk and economics checks. Restrict its
        # candidate set, rather than pretending unfamiliar dairy is eligible for everyone.
        original = engine_decision.build_candidates
        def dairy_candidates(*args, **kwargs):
            return [row for row in original(*args, **kwargs) if row.category == FIXED_CATEGORY]
        with patch.object(engine_decision, "build_candidates", side_effect=dairy_candidates):
            result = decide(request)
    else:
        result = decide(request)
    if policy_name == "sponsored_onboarding" and result["status"] == "offer":
        challenge = result["challenge"]
        if (challenge["reward"]["physical_sku"] is not None
                and challenge["economics"]["funding_source"] != "advertiser"):
            # Not an outstanding promise: no user has seen it or acquired any right.
            return {**result, "status": "no_action", "reason_codes": ["funding_gate"],
                    "challenge": None, "card": None}
    return result
