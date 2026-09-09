"""Validates a route explanation against the action that was already selected.

The LLM receives a validated action payload and may only name the route, describe one next
step and explain the reason. Everything else violates the LLM contract from the project
description: the creative does not change mechanics, deadline, cost, bid, eligibility or
funding, does not invent SKUs and terms, does not release a hold, does not promise a causal
effect and does not hide the sponsorship label.

An invalid answer is blocked and replaced with a deterministic template.
"""
import json, pathlib, re, sys

ALLOWED_KEYS = {"decision_id", "title", "body", "progress", "cta", "sponsored_label"}
REQUIRED_KEYS = {"decision_id", "title", "body", "cta"}
LIMITS = {"title": 40, "body": 120, "progress": 40, "cta": 24}

MONEY = re.compile(r"\d[\d\s.,  ]*(?:₽|\brub\b|\brubles?\b)|(?:₽|\bRUB\b)\s*\d", re.I)
SKU = re.compile(r"\bsku[_\-]?\d+\b", re.I)
DAYS = re.compile(r"\b(\d+)\s*days?\b", re.I)
CAUSAL = re.compile(
    r"guarantee|will definitely|is proven|proven to|will increase your purchases|certain to",
    re.I,
)
HOLD_LIFTED = re.compile(
    r"the reward is yours|collect it now|receive it immediately|hold (?:is )?lifted|hold released",
    re.I,
)
URGENCY = re.compile(r"today only|last chance|hurry|only \d+ hours? left|do not miss", re.I)
NEXT_STEP = re.compile(r"\bvisit|\bpurchas|\bbuy|\breturn|\breceipt|\bshop", re.I)

FALLBACK = {
    "personal_finish": "One more purchase day completes the route.",
    "store_coop": "One more purchase day adds to the store goal.",
    "family_relay": "The reward arrives after the invitee makes a confirmed purchase.",
    "organic_progress": "The route is available without a brand reward.",
    "no_action": "There are no offers right now.",
}


def check(action, explanation):
    """Returns the list of violations. An empty list means the answer can be shown."""
    problems = []
    if explanation is None:
        return ["no explanation"]

    extra = set(explanation) - ALLOWED_KEYS
    if extra:
        problems.append(f"extra fields: {', '.join(sorted(extra))}")
    for key in REQUIRED_KEYS:
        if key not in explanation:
            problems.append(f"missing field {key}")

    if explanation.get("decision_id") != action["decision_id"]:
        problems.append("decision_id does not match the selected decision")

    if action.get("surface_result") == "sponsored" and not explanation.get("sponsored_label"):
        problems.append("no sponsorship label")
    if action.get("surface_result") != "sponsored" and explanation.get("sponsored_label"):
        problems.append("sponsorship label on a non-sponsored route")

    for field, limit in LIMITS.items():
        value = explanation.get(field)
        if isinstance(value, str) and len(value) > limit:
            problems.append(f"{field} is longer than {limit} characters")

    text = " ".join(str(explanation.get(f, "")) for f in ("title", "body", "progress", "cta"))

    if MONEY.search(text):
        problems.append("a price or cost is named")
    for sku in SKU.findall(text):
        if sku.lower() != str(action.get("reinforcement_id") or "").lower():
            problems.append(f"invented SKU {sku}")
    for days in DAYS.findall(text):
        if action.get("window_days") is None or int(days) != action["window_days"]:
            problems.append(f"the {days}-day deadline does not match the action window")
    if CAUSAL.search(text):
        problems.append("a causal effect is promised")
    if action.get("status") == "delayed" and HOLD_LIFTED.search(text):
        problems.append("the fraud hold released")

    if URGENCY.search(text):
        problems.append("false urgency: the deadline is set by the action window")

    body = str(explanation.get("body", ""))
    if action.get("surface_result") in ("sponsored", "organic") and body and not NEXT_STEP.search(body):
        problems.append("the next step is not named")

    return problems


def fallback_for(action):
    card = {
        "decision_id": action["decision_id"],
        "title": "Your checkpoint",
        "body": FALLBACK.get(action["mechanic_family"], FALLBACK["no_action"]),
        "progress": "",
        "cta": "Open",
    }
    if action.get("surface_result") == "sponsored":
        card["sponsored_label"] = "Supported by the brand"
    return card


def main():
    root = pathlib.Path(__file__).parent
    failures = 0
    for path in sorted((root / "fixtures").glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        action = doc.get("decision")
        if action is None:
            continue
        problems = check(action, doc.get("creative_copy")) if doc.get("creative_copy") else []
        if problems:
            failures += 1
            print(f"{path.name}: BLOCKED — {'; '.join(problems)}")
            print(f"  fallback: {fallback_for(action)['body']}")
        else:
            print(f"{path.name}: ok")

    adversarial = json.loads((root / "fixtures/creatives-adversarial.json").read_text(encoding="utf-8"))
    print("\nAttempts to break the contract:")
    for case in adversarial["cases"]:
        problems = check(case["decision"], case["creative_copy"])
        expected = case["expected_problem"]
        hit = any(expected in p for p in problems)
        print(f"  {'✓' if hit else '✗'} {case['name']}: {'; '.join(problems) or 'not caught'}")
        if not hit:
            failures += 1

    print("\nevery explanation satisfies the contract" if not failures else f"\nviolations: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
