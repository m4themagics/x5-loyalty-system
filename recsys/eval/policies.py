"""Evaluation-only allocation policies: observable inputs, identical safety gates.

No segment/interest label is available here. These policies do not change the runtime
engine or its wire contract. A funding gate is applied before publication/reservation.
"""
from unittest.mock import patch

from recsys.engine import decision as engine_decision

POLICIES = ("personalized_broad", "sponsored_onboarding", "fixed_dairy", "reward_only")
FIXED_CATEGORY = "Молочные продукты"
FUNDING_POLICY = {
    # These switches are evaluation assumptions only. The runtime policy file remains
    # advertiser_only, while the broad baselines reproduce the wider policy that was
    # agreed for comparison: brand funding or conservatively positive own margin.
    "personalized_broad": "advertiser_or_positive_margin",
    "fixed_dairy": "advertiser_or_positive_margin",
    "sponsored_onboarding": "advertiser_only",
    # Isolate the game response on exactly the same funded allocation as onboarding.
    "reward_only": "advertiser_only",
}


def choose_decision(request, decide, policy_name):
    if policy_name not in POLICIES:
        raise ValueError(f"Unknown evaluation policy: {policy_name}")
    runtime_load_policy = engine_decision.load_policy

    def load_evaluation_policy(*args, **kwargs):
        policy = dict(runtime_load_policy(*args, **kwargs))
        policy["first_cycle_funding_policy"] = FUNDING_POLICY[policy_name]
        return policy

    with patch.object(engine_decision, "load_policy", side_effect=load_evaluation_policy):
        if policy_name == "fixed_dairy":
            # Keep the real engine's history, stock, risk and economics checks. Restrict
            # candidates instead of pretending unfamiliar dairy is eligible for everyone.
            original = engine_decision.build_candidates

            def dairy_candidates(*args, **kwargs):
                return [row for row in original(*args, **kwargs) if row.category == FIXED_CATEGORY]

            with patch.object(engine_decision, "build_candidates", side_effect=dairy_candidates):
                result = decide(request)
        else:
            result = decide(request)
    if FUNDING_POLICY[policy_name] == "advertiser_only" and result["status"] == "offer":
        challenge = result["challenge"]
        if (challenge["reward"]["physical_sku"] is not None
                and challenge["economics"]["funding_source"] != "advertiser"):
            # Not an outstanding promise: no user has seen it or acquired any right.
            return {**result, "status": "no_action", "reason_codes": ["funding_gate"],
                    "challenge": None, "card": None}
    return result
