"""Простой объяснимый скоринг риска для синтетических чеков PoC.

Признаки складываются: общий телефон, устройство или домохозяйство сами по себе не блокируют
легитимную семью. Порог выбирается по ожидаемому предотвращённому ущербу и стоимости ошибочного
отказа и задаётся в политике до выдачи, а не подбирается под результат.
"""
from typing import Any, NamedTuple

from .history import PurchaseHistory, day_key


class RiskAssessment(NamedTuple):
    decision: str
    score: float
    signals: list[str]

    def as_contract(self) -> dict[str, Any]:
        return {"decision": self.decision, "score": self.score, "signals": self.signals}


def assess(
    profile: dict[str, Any],
    receipt: dict[str, Any],
    history: PurchaseHistory,
    policy: dict[str, Any],
) -> RiskAssessment:
    risk_policy = policy["risk"]
    weights = risk_policy["weights"]
    signals: list[str] = []
    score = 0.0

    risk_signals = profile["risk_signals"]
    if risk_signals["confirmed_purchase_days"] == 0:
        signals.append("no_confirmed_purchase_days")
        score += weights["no_confirmed_purchase_days"]
    if risk_signals["account_age_days"] < risk_policy["min_account_age_days_for_promise"]:
        signals.append("new_account")
        score += weights["new_account"]
    if risk_signals["household_id"] is not None:
        signals.append("shared_household_device")
        score += weights["shared_household_device"]
    if day_key(receipt["purchased_at_ms"]) in set(history.split_days()):
        signals.append("same_day_basket_split")
        score += weights["same_day_basket_split"]
    if receipt["returned"]:
        signals.append("returned_receipt")
        score += weights["returned_receipt"]
    if profile["referral"]["invited_by_profile_id"] == profile["profile_id"]:
        signals.append("self_referral")
        score += weights["self_referral"]

    if not signals:
        signals.append("no_risk_signal")

    score = round(min(score, 1.0), 4)
    if score >= risk_policy["reject_score"]:
        decision = "reject"
    elif score >= risk_policy["hold_score"]:
        decision = "hold"
    elif score >= risk_policy["review_score"]:
        decision = "review"
    else:
        decision = "allow"

    return RiskAssessment(decision, score, signals)
