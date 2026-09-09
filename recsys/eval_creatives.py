"""Evaluation of the creative loop: violation detection, false positives and repair.

Detection without false positives means nothing: a validator that rejects everything reports
100% detection and is useless. Hence three numbers — the share of mutations caught per category,
the share of false positives on legitimate variants and the share of successfully repaired
creatives.

Mutations are generated deterministically from the valid fixtures, so the set is reproducible and
grows with them.
"""
import copy, json, pathlib, re, sys
from collections import defaultdict

from validate_explanation import check, fallback_for

ROOT = pathlib.Path(__file__).parent


def load_valid():
    out = []
    for path in sorted((ROOT / "fixtures").glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        if doc.get("decision") and doc.get("creative_copy"):
            out.append((path.stem, doc["decision"], doc["creative_copy"]))
    return out


# --- mutations: each one breaks exactly one rule -------------------------------

def m_price(d, c):
    c["body"] = "Take the RUB 149 product for free."
    return c

def m_sku(d, c):
    c["body"] = "The reward is sku_999 after your visit."
    return c

def m_deadline(d, c):
    if d.get("window_days") is None:
        return None
    c["body"] = f"You have {d['window_days'] + 9} days to visit."
    return c

def m_causal(d, c):
    c["body"] = "The route is guaranteed to raise your monthly savings."
    return c

def m_hold(d, c):
    if d.get("status") != "delayed":
        return None
    c["body"] = "The reward is yours, collect it now after the purchase."
    return c

def m_sponsorship(d, c):
    if d.get("surface_result") != "sponsored":
        return None
    c.pop("sponsored_label", None)
    return c

def m_swap(d, c):
    c["decision_id"] = "dec_9999"
    return c

def m_urgency(d, c):
    c["body"] = "Today only: come back for a purchase."
    return c

def m_no_next_step(d, c):
    c["body"] = "A fine day for a good mood."
    return c

def m_extra_field(d, c):
    c["discount_percent"] = 20
    return c

def m_overflow(d, c):
    c["title"] = "A very long headline about the coffee route that does not fit anywhere at all"
    return c

MUTATIONS = {
    "invented price": m_price,
    "invented SKU": m_sku,
    "changed deadline": m_deadline,
    "promised effect": m_causal,
    "released hold": m_hold,
    "hidden label": m_sponsorship,
    "swapped decision": m_swap,
    "false urgency": m_urgency,
    "no next step": m_no_next_step,
    "extra field": m_extra_field,
    "length overflow": m_overflow,
}


# --- benign variants: rejecting these is not allowed ---------------------------

def benign_variants(decision, card):
    out = []
    a = copy.deepcopy(card); a["cta"] = "Open the route"; out.append(("different CTA", a))
    b = copy.deepcopy(card); b["progress"] = ""; out.append(("no progress", b))
    c = copy.deepcopy(card)
    c["body"] = c["body"].replace("One visit", "One more visit") if "One visit" in c["body"] else c["body"] + " We look forward to your purchase."
    out.append(("rephrased copy", c))
    return out


# --- repair: deterministic fixing instead of refusal ---------------------------

def repair(decision, card):
    fixed = copy.deepcopy(card)
    fixed["decision_id"] = decision["decision_id"]
    for field in list(fixed):
        if field not in {"decision_id", "title", "body", "progress", "cta", "sponsored_label"}:
            fixed.pop(field)
    text_fields = ("title", "body")
    for f in text_fields:
        if f in fixed:
            fixed[f] = re.sub(r"(?:₽|\bRUB\b)\s*\d[\d\s.,]*|\d[\d\s.,]*\s*(?:₽|\brubles?\b|\brub\b)", "", str(fixed[f]), flags=re.I)
            fixed[f] = re.sub(r"\bsku[_\-]?\d+\b", "", fixed[f], flags=re.I)
            fixed[f] = re.sub(r"is guaranteed to|guaranteed|today only|last chance|hurry", "", fixed[f], flags=re.I)
            fixed[f] = re.sub(r"the reward is yours|collect it now|receive it immediately", "", fixed[f], flags=re.I)
            fixed[f] = re.sub(r"\s{2,}", " ", fixed[f]).strip()
    template = fallback_for(decision)
    if not check(decision, fixed):
        return fixed, "repaired"
    return template, "fallback"


def main():
    valid = load_valid()
    if not valid:
        print("no valid fixtures"); return 1

    # 1. false positives
    controls, false_positives = 0, []
    for name, decision, card in valid:
        for label, variant in [("original", card)] + benign_variants(decision, card):
            controls += 1
            problems = check(decision, variant)
            if problems:
                false_positives.append(f"{name} / {label}: {'; '.join(problems)}")

    # 2. detection per category
    per_cat = defaultdict(lambda: [0, 0])
    misses, repaired, fell_back = [], 0, 0
    for name, decision, card in valid:
        for cat, mutate in MUTATIONS.items():
            mutated = mutate(decision, copy.deepcopy(card))
            if mutated is None:
                continue
            per_cat[cat][1] += 1
            problems = check(decision, mutated)
            if problems:
                per_cat[cat][0] += 1
                _, how = repair(decision, mutated)
                repaired += how == "repaired"
                fell_back += how == "fallback"
            else:
                misses.append(f"{name} / {cat}")

    total_hits = sum(h for h, _ in per_cat.values())
    total_cases = sum(n for _, n in per_cat.values())

    print(f"Benign variants: {controls}, false positives: {len(false_positives)}")
    for fp in false_positives:
        print("  FALSE POSITIVE:", fp)
    print(f"\nMutations: {total_cases}, caught: {total_hits} ({total_hits / total_cases:.0%})\n")
    print(f"{'category':<24} {'caught':>10}")
    for cat, (hits, n) in sorted(per_cat.items()):
        mark = "" if hits == n else "  <-- miss"
        print(f"{cat:<24} {hits:>5}/{n:<4}{mark}")
    if misses:
        print("\nMissed:")
        for m in misses:
            print("  ", m)
    print(f"\nAfter blocking: repaired {repaired}, template returned {fell_back}")
    return 1 if (false_positives or misses) else 0


if __name__ == "__main__":
    sys.exit(main())
