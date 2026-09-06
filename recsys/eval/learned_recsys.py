"""Dependency-free learned RecSys proof on randomized synthetic logs.

This module is evaluation-only.  It deliberately does not import or change the runtime
allocator.  Outcomes used to score policies live behind an ``evaluation_only`` boundary;
the policies receive only observable purchase-history, inventory and campaign features.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import random
import statistics
import sys
from collections import Counter
from typing import Iterable, Sequence


REPORT_PATH = pathlib.Path(__file__).with_name("results") / "learned-recsys.json"
DEFAULT_USERS = 6000
DEFAULT_SEED = 20260906
OPERATION_COST_KOPECKS = 120
ISOTONIC_WEIGHT = 0.35

FEATURE_NAMES = (
    "visits_28d",
    "recency_score",
    "average_basket",
    "category_affinity",
    "category_share",
    "inventory_progress",
    "recipe_match",
    "history_reliability",
    "sponsored",
    "action_dairy",
    "action_coffee",
    "action_produce",
    "action_ready_meal",
)

ACTION_CATALOG = (
    {
        "action_id": "dairy",
        "category": "Молочные продукты",
        "margin_kopecks": 7000,
        "reward_cost_kopecks": 3500,
        "cpa_kopecks": 1200,
        "sponsored": True,
        "baseline_shift": 0.18,
        "treatment_shift": -0.18,
    },
    {
        "action_id": "coffee",
        "category": "Кофе и чай",
        "margin_kopecks": 9000,
        "reward_cost_kopecks": 3000,
        "cpa_kopecks": 3300,
        "sponsored": True,
        "baseline_shift": -0.16,
        "treatment_shift": 0.34,
    },
    {
        "action_id": "produce",
        "category": "Овощи и фрукты",
        "margin_kopecks": 8500,
        "reward_cost_kopecks": 1800,
        "cpa_kopecks": 0,
        "sponsored": False,
        "baseline_shift": 0.10,
        "treatment_shift": 0.20,
    },
    {
        "action_id": "ready_meal",
        "category": "Готовая еда",
        "margin_kopecks": 10500,
        "reward_cost_kopecks": 3900,
        "cpa_kopecks": 2400,
        "sponsored": True,
        "baseline_shift": -0.30,
        "treatment_shift": 0.05,
    },
)

# Segment shares are the only population facts copied from the case Q&A.  Every
# behavioural coefficient below is an explicit synthetic assumption.
AUDIENCE_SEGMENTS = (
    ("youth", 0.37, 0.90),
    ("harmful_habits", 0.05, 0.95),
    ("parents_u3", 0.26, 1.20),
    ("mature", 0.21, 1.05),
    ("senior", 0.11, 0.85),
)


def _sigmoid(value: float) -> float:
    if value >= 0:
        return 1.0 / (1.0 + math.exp(-value))
    exp_value = math.exp(value)
    return exp_value / (1.0 + exp_value)


def _logit(probability: float) -> float:
    value = min(1.0 - 1e-9, max(1e-9, probability))
    return math.log(value / (1.0 - value))


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _stable_seed(seed: int, *parts: object) -> int:
    material = ":".join([str(seed), *(str(part) for part in parts)]).encode("utf-8")
    return int.from_bytes(hashlib.sha256(material).digest()[:8], "big")


def _uniform(seed: int, *parts: object) -> float:
    return _stable_seed(seed, *parts) / float(2**64)


def _rng(seed: int, *parts: object) -> random.Random:
    return random.Random(_stable_seed(seed, *parts))


def _weighted_segment(draw: float) -> tuple[str, float]:
    cumulative = 0.0
    for name, share, purchase_multiplier in AUDIENCE_SEGMENTS:
        cumulative += share
        if draw < cumulative:
            return name, purchase_multiplier
    name, _, purchase_multiplier = AUDIENCE_SEGMENTS[-1]
    return name, purchase_multiplier


class LogisticRegression:
    """Small deterministic batch-gradient logistic regression.

    Features are standardized from the training fold.  This is intentionally limited,
    but it provides the same probabilistic contract needed by the PoC without sklearn.
    """

    def __init__(self, *, epochs: int = 280, learning_rate: float = 0.16, l2: float = 0.03):
        self.epochs = epochs
        self.learning_rate = learning_rate
        self.l2 = l2
        self.means: list[float] = []
        self.scales: list[float] = []
        self.weights: list[float] = []
        self.intercept = 0.0
        self.iterations = 0

    def fit(self, features: Sequence[Sequence[float]], labels: Sequence[int]) -> "LogisticRegression":
        if not features or len(features) != len(labels):
            raise ValueError("Features and labels must have the same non-zero length")
        width = len(features[0])
        if not width or any(len(row) != width for row in features):
            raise ValueError("Every feature row must have the same positive width")
        if any(label not in (0, 1) for label in labels):
            raise ValueError("Logistic labels must be binary")

        count = len(features)
        self.means = [sum(row[column] for row in features) / count for column in range(width)]
        self.scales = []
        for column, mean in enumerate(self.means):
            variance = sum((row[column] - mean) ** 2 for row in features) / count
            self.scales.append(max(math.sqrt(variance), 1e-6))
        transformed = [self._transform(row) for row in features]
        target_mean = _clamp(sum(labels) / count, 1e-4, 1.0 - 1e-4)
        self.intercept = _logit(target_mean)
        self.weights = [0.0] * width

        for epoch in range(self.epochs):
            gradient = [0.0] * width
            intercept_gradient = 0.0
            for row, label in zip(transformed, labels):
                prediction = _sigmoid(self.intercept + sum(w * value for w, value in zip(self.weights, row)))
                error = prediction - label
                intercept_gradient += error
                for column, value in enumerate(row):
                    gradient[column] += error * value
            rate = self.learning_rate / math.sqrt(1.0 + epoch / 80.0)
            self.intercept -= rate * intercept_gradient / count
            largest = abs(intercept_gradient / count)
            for column in range(width):
                value = gradient[column] / count + self.l2 * self.weights[column]
                self.weights[column] -= rate * value
                largest = max(largest, abs(value))
            self.iterations = epoch + 1
            if largest < 1e-7:
                break
        return self

    def _transform(self, row: Sequence[float]) -> list[float]:
        if len(row) != len(self.means):
            raise ValueError("Feature width differs from fitted model")
        return [(value - mean) / scale for value, mean, scale in zip(row, self.means, self.scales)]

    def predict_probability(self, row: Sequence[float]) -> float:
        if not self.weights:
            raise ValueError("Model has not been fitted")
        transformed = self._transform(row)
        return _sigmoid(self.intercept + sum(w * value for w, value in zip(self.weights, transformed)))

    def summary(self) -> dict:
        return {
            "iterations": self.iterations,
            "intercept": round(self.intercept, 8),
            "coefficients": {
                name: round(value, 8) for name, value in zip(FEATURE_NAMES, self.weights)
            },
        }


class IsotonicRegression:
    """Weighted pool-adjacent-violators calibrator for monotonically increasing scores."""

    def __init__(self):
        self.blocks: list[dict[str, float]] = []

    def fit(
        self,
        scores: Sequence[float],
        targets: Sequence[float],
        sample_weights: Sequence[float] | None = None,
    ) -> "IsotonicRegression":
        if not scores or len(scores) != len(targets):
            raise ValueError("Scores and targets must have the same non-zero length")
        weights = list(sample_weights or [1.0] * len(scores))
        if len(weights) != len(scores) or any(weight <= 0 for weight in weights):
            raise ValueError("Isotonic weights must be positive and aligned")
        points = sorted(zip(scores, targets, weights), key=lambda row: row[0])
        blocks: list[dict[str, float]] = []
        for score, target, weight in points:
            blocks.append({
                "min_score": float(score),
                "max_score": float(score),
                "weight": float(weight),
                "weighted_target": float(target) * weight,
            })
            while len(blocks) >= 2 and self._mean(blocks[-2]) > self._mean(blocks[-1]):
                right = blocks.pop()
                left = blocks.pop()
                blocks.append({
                    "min_score": left["min_score"],
                    "max_score": right["max_score"],
                    "weight": left["weight"] + right["weight"],
                    "weighted_target": left["weighted_target"] + right["weighted_target"],
                })
        self.blocks = blocks
        return self

    @staticmethod
    def _mean(block: dict[str, float]) -> float:
        return block["weighted_target"] / block["weight"]

    def predict(self, score: float) -> float:
        if not self.blocks:
            raise ValueError("Calibrator has not been fitted")
        if score <= self.blocks[0]["max_score"]:
            return self._mean(self.blocks[0])
        for block in self.blocks[1:]:
            if score <= block["max_score"]:
                return self._mean(block)
        return self._mean(self.blocks[-1])

    def summary(self) -> list[dict]:
        return [
            {
                "min_score": round(block["min_score"], 8),
                "max_score": round(block["max_score"], 8),
                "weight": int(block["weight"]),
                "calibrated_uplift": round(self._mean(block), 8),
            }
            for block in self.blocks
        ]


def feature_vector(observable: dict) -> list[float]:
    action_id = observable["action_id"]
    return [
        observable["visits_28d"] / 16.0,
        observable["recency_score"],
        observable["average_basket_kopecks"] / 300000.0,
        observable["category_affinity"],
        observable["category_share"],
        observable["inventory_progress"] / 3.0,
        float(observable["recipe_match"]),
        observable["history_reliability"],
        float(observable["sponsored"]),
        float(action_id == "dairy"),
        float(action_id == "coffee"),
        float(action_id == "produce"),
        float(action_id == "ready_meal"),
    ]


def _profile(user_id: str, seed: int) -> dict:
    rng = _rng(seed, user_id, "profile")
    segment, segment_multiplier = _weighted_segment(rng.random())
    visits = int(_clamp(round(rng.gauss(6.2 * segment_multiplier, 2.6)), 0, 16))
    days_since_last = int(_clamp(round(rng.gauss(8.0 / segment_multiplier, 5.0)), 0, 30))
    average_basket = int(_clamp(round(rng.gauss(125000 * segment_multiplier, 42000)), 25000, 300000))
    history_reliability = _clamp(0.30 + visits / 16.0 + rng.uniform(-0.12, 0.12), 0.05, 1.0)
    inventory_progress = rng.choices((0, 1, 2, 3), weights=(0.39, 0.27, 0.21, 0.13))[0]
    recipe_action = ACTION_CATALOG[int(rng.random() * len(ACTION_CATALOG))]["action_id"]

    raw_affinities = {}
    for action in ACTION_CATALOG:
        segment_hint = {
            ("parents_u3", "dairy"): 0.18,
            ("youth", "ready_meal"): 0.14,
            ("mature", "produce"): 0.12,
            ("senior", "produce"): 0.16,
            ("harmful_habits", "coffee"): 0.11,
        }.get((segment, action["action_id"]), 0.0)
        raw_affinities[action["action_id"]] = _clamp(rng.betavariate(2.0, 2.8) + segment_hint, 0.02, 0.98)
    total_affinity = sum(raw_affinities.values())
    return {
        "audience_segment": segment,
        "segment_purchase_multiplier": segment_multiplier,
        "visits_28d": visits,
        "days_since_last": days_since_last,
        "average_basket_kopecks": average_basket,
        "history_reliability": history_reliability,
        "inventory_progress": inventory_progress,
        "recipe_action": recipe_action,
        "affinities": raw_affinities,
        "affinity_total": total_affinity,
    }


def _candidate(user_id: str, profile: dict, action: dict, seed: int) -> dict:
    action_id = action["action_id"]
    affinity = profile["affinities"][action_id]
    category_share = affinity / profile["affinity_total"]
    recipe_match = profile["recipe_action"] == action_id
    familiar = profile["visits_28d"] > 0 and affinity >= 0.14
    available = _uniform(seed, user_id, action_id, "stock") >= 0.035
    risk_allowed = _uniform(seed, user_id, action_id, "risk") >= 0.018
    eligible = familiar and available and risk_allowed
    observable = {
        "action_id": action_id,
        "category": action["category"],
        "visits_28d": profile["visits_28d"],
        "recency_score": 1.0 - profile["days_since_last"] / 30.0,
        "average_basket_kopecks": profile["average_basket_kopecks"],
        "category_affinity": affinity,
        "category_share": category_share,
        "inventory_progress": profile["inventory_progress"],
        "recipe_match": recipe_match,
        "history_reliability": profile["history_reliability"],
        "sponsored": action["sponsored"],
        "eligible": eligible,
        "eligibility": {
            "familiar_category": familiar,
            "in_stock": available,
            "risk_allowed": risk_allowed,
        },
        "economics": {
            "margin_kopecks": action["margin_kopecks"],
            "reward_cost_kopecks": action["reward_cost_kopecks"],
            "cpa_kopecks": action["cpa_kopecks"],
            "operation_cost_kopecks": OPERATION_COST_KOPECKS,
        },
    }

    visit_score = profile["visits_28d"] / 16.0
    recency_score = observable["recency_score"]
    latent_response = (_uniform(seed, user_id, action_id, "latent") - 0.5) * 0.34
    baseline_logit = (
        -2.55
        + 2.10 * affinity
        + 0.72 * visit_score
        + 0.40 * recency_score
        + 0.28 * profile["history_reliability"]
        + action["baseline_shift"]
        + math.log(profile["segment_purchase_multiplier"])
        + latent_response * 0.35
    )
    control_probability = _sigmoid(baseline_logit)
    treatment_logit_shift = (
        -0.62
        + 1.35 * affinity
        + 0.72 * float(recipe_match)
        + 0.38 * (profile["inventory_progress"] / 3.0)
        + 0.25 * profile["history_reliability"]
        + action["treatment_shift"]
        + latent_response
    )
    treatment_probability = _sigmoid(baseline_logit + treatment_logit_shift)
    purchase_draw = _uniform(seed, user_id, action_id, "purchase_outcome")
    control_outcome = int(purchase_draw < control_probability)
    treatment_outcome = int(purchase_draw < treatment_probability)
    verification_probability = (
        _clamp(0.73 + 0.22 * profile["history_reliability"], 0.0, 0.98)
        if action["sponsored"] else 0.0
    )
    billable_probability = treatment_probability * verification_probability
    billable_outcome = int(
        action["sponsored"]
        and treatment_outcome
        and _uniform(seed, user_id, action_id, "verification") < verification_probability
    )
    return {
        "observable": observable,
        "evaluation_only": {
            "true_control_probability": control_probability,
            "true_treatment_probability": treatment_probability,
            "true_uplift": treatment_probability - control_probability,
            "true_billable_probability": billable_probability,
            "control_outcome": control_outcome,
            "treatment_outcome": treatment_outcome,
            "billable_outcome": billable_outcome,
            "latent_response": latent_response,
        },
    }


def _split(user_id: str, seed: int) -> str:
    draw = _uniform(seed, user_id, "split")
    if draw < 0.60:
        return "train"
    if draw < 0.80:
        return "calibration"
    return "test"


def build_dataset(*, users: int = DEFAULT_USERS, seed: int = DEFAULT_SEED) -> dict:
    if users < 80:
        raise ValueError("At least 80 users are required for all deterministic folds")
    population = []
    logged = []
    for index in range(users):
        user_id = f"synthetic-{index:05d}"
        profile = _profile(user_id, seed)
        candidates = [_candidate(user_id, profile, action, seed) for action in ACTION_CATALOG]
        split = _split(user_id, seed)
        population.append({
            "user_id": user_id,
            "split": split,
            "audience_segment": profile["audience_segment"],
            "candidates": candidates,
        })
        action_index = int(_uniform(seed, user_id, "logged_action") * len(candidates))
        assigned = candidates[min(action_index, len(candidates) - 1)]
        treatment = int(_uniform(seed, user_id, "treatment_assignment") < 0.5)
        evaluation = assigned["evaluation_only"]
        logged.append({
            "user_id": user_id,
            "split": split,
            "observable": assigned["observable"],
            "treatment": treatment,
            "observed_purchase": (
                evaluation["treatment_outcome"] if treatment else evaluation["control_outcome"]
            ),
            "billable_event": evaluation["billable_outcome"] if treatment else 0,
            "treatment_propensity": 0.5,
            "action_propensity": 1.0 / len(candidates),
        })
    return {"users": population, "logged": logged, "seed": seed}


def _model_rows(rows: Iterable[dict]) -> tuple[list[list[float]], list[int]]:
    values = list(rows)
    return ([feature_vector(row["observable"]) for row in values],
            [row["observed_purchase"] for row in values])


def _fit_models(dataset: dict) -> tuple[LogisticRegression, LogisticRegression, LogisticRegression]:
    training = [row for row in dataset["logged"] if row["split"] == "train"]
    controls = [row for row in training if row["treatment"] == 0]
    treatments = [row for row in training if row["treatment"] == 1]
    control_x, control_y = _model_rows(controls)
    treatment_x, treatment_y = _model_rows(treatments)
    billable_x = [feature_vector(row["observable"]) for row in treatments]
    billable_y = [row["billable_event"] for row in treatments]
    control_model = LogisticRegression().fit(control_x, control_y)
    treatment_model = LogisticRegression().fit(treatment_x, treatment_y)
    billable_model = LogisticRegression().fit(billable_x, billable_y)
    return control_model, treatment_model, billable_model


def _raw_uplift(
    observable: dict,
    control_model: LogisticRegression,
    treatment_model: LogisticRegression,
) -> float:
    features = feature_vector(observable)
    return treatment_model.predict_probability(features) - control_model.predict_probability(features)


def _calibrated_uplift(raw_uplift: float, calibrator: IsotonicRegression) -> float:
    """Regularize a noisy non-parametric calibrator toward the two-model score.

    A calibration fold of roughly one thousand rows is too small for an unshrunk step
    function.  The convex blend remains monotone and fixes the weight before test scoring.
    """
    isotonic = calibrator.predict(raw_uplift)
    return _clamp((1.0 - ISOTONIC_WEIGHT) * raw_uplift + ISOTONIC_WEIGHT * isotonic, -1.0, 1.0)


def _calibration_points(
    rows: list[dict],
    control_model: LogisticRegression,
    treatment_model: LogisticRegression,
    bins: int = 12,
) -> list[dict]:
    scored = sorted(
        ((_raw_uplift(row["observable"], control_model, treatment_model), row) for row in rows),
        key=lambda value: value[0],
    )
    width = max(1, math.ceil(len(scored) / bins))
    points = []
    for offset in range(0, len(scored), width):
        chunk = scored[offset:offset + width]
        treated = [row["observed_purchase"] for _, row in chunk if row["treatment"] == 1]
        control = [row["observed_purchase"] for _, row in chunk if row["treatment"] == 0]
        if not treated or not control:
            continue
        points.append({
            "raw_score": statistics.mean(score for score, _ in chunk),
            "empirical_uplift": statistics.mean(treated) - statistics.mean(control),
            "weight": len(chunk),
            "treated": len(treated),
            "control": len(control),
        })
    if len(points) < 3:
        raise ValueError("Calibration fold did not produce enough mixed-arm bins")
    return points


def _fit_calibrator(
    dataset: dict,
    control_model: LogisticRegression,
    treatment_model: LogisticRegression,
) -> tuple[IsotonicRegression, list[dict]]:
    calibration = [row for row in dataset["logged"] if row["split"] == "calibration"]
    points = _calibration_points(calibration, control_model, treatment_model)
    calibrator = IsotonicRegression().fit(
        [row["raw_score"] for row in points],
        [row["empirical_uplift"] for row in points],
        [row["weight"] for row in points],
    )
    return calibrator, points


def _log_loss(labels: Sequence[int], predictions: Sequence[float]) -> float:
    if not labels:
        return 0.0
    return -sum(
        label * math.log(_clamp(prediction, 1e-12, 1.0 - 1e-12))
        + (1 - label) * math.log(_clamp(1.0 - prediction, 1e-12, 1.0 - 1e-12))
        for label, prediction in zip(labels, predictions)
    ) / len(labels)


def _brier(labels: Sequence[int], predictions: Sequence[float]) -> float:
    if not labels:
        return 0.0
    return sum((label - prediction) ** 2 for label, prediction in zip(labels, predictions)) / len(labels)


def _auc(labels: Sequence[int], predictions: Sequence[float]) -> float:
    positives = sum(labels)
    negatives = len(labels) - positives
    if not positives or not negatives:
        return 0.5
    ordered = sorted(zip(predictions, labels), key=lambda row: row[0])
    positive_rank_sum = 0.0
    index = 0
    while index < len(ordered):
        end = index + 1
        while end < len(ordered) and ordered[end][0] == ordered[index][0]:
            end += 1
        average_rank = ((index + 1) + end) / 2.0
        positive_rank_sum += average_rank * sum(label for _, label in ordered[index:end])
        index = end
    return (positive_rank_sum - positives * (positives + 1) / 2.0) / (positives * negatives)


def _model_metrics(
    dataset: dict,
    control_model: LogisticRegression,
    treatment_model: LogisticRegression,
    billable_model: LogisticRegression,
    calibrator: IsotonicRegression,
) -> dict:
    test_logs = [row for row in dataset["logged"] if row["split"] == "test"]
    control_rows = [row for row in test_logs if row["treatment"] == 0]
    treatment_rows = [row for row in test_logs if row["treatment"] == 1]
    control_labels = [row["observed_purchase"] for row in control_rows]
    treatment_labels = [row["observed_purchase"] for row in treatment_rows]
    control_predictions = [control_model.predict_probability(feature_vector(row["observable"])) for row in control_rows]
    treatment_predictions = [treatment_model.predict_probability(feature_vector(row["observable"])) for row in treatment_rows]
    billable_labels = [row["billable_event"] for row in treatment_rows]
    billable_predictions = [billable_model.predict_probability(feature_vector(row["observable"])) for row in treatment_rows]

    raw_errors = []
    calibrated_errors = []
    for user in dataset["users"]:
        if user["split"] != "test":
            continue
        for candidate in user["candidates"]:
            raw = _raw_uplift(candidate["observable"], control_model, treatment_model)
            calibrated = _calibrated_uplift(raw, calibrator)
            truth = candidate["evaluation_only"]["true_uplift"]
            raw_errors.append((raw - truth) ** 2)
            calibrated_errors.append((calibrated - truth) ** 2)
    return {
        "test_logged_rows": len(test_logs),
        "control_log_loss": round(_log_loss(control_labels, control_predictions), 6),
        "treatment_log_loss": round(_log_loss(treatment_labels, treatment_predictions), 6),
        "control_brier": round(_brier(control_labels, control_predictions), 6),
        "treatment_brier": round(_brier(treatment_labels, treatment_predictions), 6),
        "billable_log_loss": round(_log_loss(billable_labels, billable_predictions), 6),
        "billable_brier": round(_brier(billable_labels, billable_predictions), 6),
        "billable_auc": round(_auc(billable_labels, billable_predictions), 6),
        "raw_uplift_rmse": round(math.sqrt(statistics.mean(raw_errors)), 6),
        "uplift_rmse": round(math.sqrt(statistics.mean(calibrated_errors)), 6),
    }


def _learned_choice(
    candidates: list[dict],
    control_model: LogisticRegression,
    treatment_model: LogisticRegression,
    billable_model: LogisticRegression,
    calibrator: IsotonicRegression,
) -> tuple[dict | None, dict | None]:
    scored = []
    for observable in candidates:
        if not observable["eligible"]:
            continue
        features = feature_vector(observable)
        control_probability = control_model.predict_probability(features)
        treatment_probability = treatment_model.predict_probability(features)
        raw_uplift = treatment_probability - control_probability
        calibrated_uplift = _calibrated_uplift(raw_uplift, calibrator)
        billable_probability = billable_model.predict_probability(features)
        economics = observable["economics"]
        expected_net = (
            calibrated_uplift * economics["margin_kopecks"]
            + billable_probability * economics["cpa_kopecks"]
            - treatment_probability * economics["reward_cost_kopecks"]
            - economics["operation_cost_kopecks"]
        )
        scored.append((expected_net, calibrated_uplift, billable_probability, observable["action_id"], observable))
    if not scored:
        return None, None
    winner = max(scored, key=lambda row: (row[0], row[1], row[2], row[3]))
    if winner[0] <= 0:
        return None, {"reason": "predicted_non_positive_economics", "best_expected_net_kopecks": winner[0]}
    return winner[4], {
        "predicted_net_kopecks": winner[0],
        "predicted_uplift": winner[1],
        "predicted_billable_probability": winner[2],
    }


def _rules_choice(candidates: list[dict]) -> tuple[dict | None, dict | None]:
    eligible = [row for row in candidates if row["eligible"]]
    if not eligible:
        return None, None
    winner = max(eligible, key=lambda row: (
        int(row["recipe_match"]), row["category_affinity"], row["inventory_progress"], row["action_id"]
    ))
    return winner, None


def _fixed_choice(candidates: list[dict]) -> tuple[dict | None, dict | None]:
    winner = next((row for row in candidates if row["action_id"] == "dairy" and row["eligible"]), None)
    return winner, None


def _evaluate_policy(
    name: str,
    users: list[dict],
    control_model: LogisticRegression,
    treatment_model: LogisticRegression,
    billable_model: LogisticRegression,
    calibrator: IsotonicRegression,
) -> dict:
    totals = Counter()
    selected_actions = Counter()
    predicted_uplifts = []
    true_uplifts = []
    expected_true_net = 0.0
    for user in users:
        public_candidates = [candidate["observable"] for candidate in user["candidates"]]
        if name == "learned_profit_gated":
            selected, diagnostics = _learned_choice(
                public_candidates, control_model, treatment_model, billable_model, calibrator
            )
        elif name == "rules_affinity":
            selected, diagnostics = _rules_choice(public_candidates)
        elif name == "fixed_dairy":
            selected, diagnostics = _fixed_choice(public_candidates)
        else:
            raise ValueError(f"Unknown policy: {name}")
        if selected is None:
            totals["no_action"] += 1
            continue
        candidate = next(
            row for row in user["candidates"] if row["observable"]["action_id"] == selected["action_id"]
        )
        evaluation = candidate["evaluation_only"]
        economics = selected["economics"]
        incremental = evaluation["treatment_outcome"] - evaluation["control_outcome"]
        reward_cost = evaluation["treatment_outcome"] * economics["reward_cost_kopecks"]
        margin = incremental * economics["margin_kopecks"]
        sponsor_income = evaluation["billable_outcome"] * economics["cpa_kopecks"]
        spend = reward_cost + economics["operation_cost_kopecks"]
        net = margin + sponsor_income - spend
        expected_true = (
            evaluation["true_uplift"] * economics["margin_kopecks"]
            + evaluation["true_billable_probability"] * economics["cpa_kopecks"]
            - evaluation["true_treatment_probability"] * economics["reward_cost_kopecks"]
            - economics["operation_cost_kopecks"]
        )
        totals.update({
            "served_users": 1,
            "incremental_purchases": incremental,
            "billable_events": evaluation["billable_outcome"],
            "reward_and_operation_spend_kopecks": spend,
            "incremental_margin_kopecks": margin,
            "sponsor_income_kopecks": sponsor_income,
            "net_kopecks": net,
        })
        expected_true_net += expected_true
        selected_actions[selected["action_id"]] += 1
        true_uplifts.append(evaluation["true_uplift"])
        if diagnostics and "predicted_uplift" in diagnostics:
            predicted_uplifts.append(diagnostics["predicted_uplift"])
    assigned = len(users)
    served = totals["served_users"]
    return {
        "policy": name,
        "assigned_users": assigned,
        "served_users": served,
        "coverage": round(served / assigned, 6) if assigned else 0.0,
        "no_action": totals["no_action"],
        "incremental_purchases": totals["incremental_purchases"],
        "incremental_purchase_rate_per_served": round(totals["incremental_purchases"] / served, 6) if served else 0.0,
        "billable_events": totals["billable_events"],
        "reward_and_operation_spend_kopecks": totals["reward_and_operation_spend_kopecks"],
        "incremental_margin_kopecks": totals["incremental_margin_kopecks"],
        "sponsor_income_kopecks": totals["sponsor_income_kopecks"],
        "net_kopecks": totals["net_kopecks"],
        "net_rubles": round(totals["net_kopecks"] / 100.0, 2),
        "expected_true_net_kopecks": round(expected_true_net, 2),
        "mean_true_uplift_selected": round(statistics.mean(true_uplifts), 6) if true_uplifts else 0.0,
        "mean_predicted_uplift_selected": round(statistics.mean(predicted_uplifts), 6) if predicted_uplifts else None,
        "selected_actions": dict(sorted(selected_actions.items())),
    }


def build_report(*, users: int = DEFAULT_USERS, seed: int = DEFAULT_SEED) -> dict:
    dataset = build_dataset(users=users, seed=seed)
    control_model, treatment_model, billable_model = _fit_models(dataset)
    calibrator, calibration_points = _fit_calibrator(dataset, control_model, treatment_model)
    metrics = _model_metrics(dataset, control_model, treatment_model, billable_model, calibrator)
    test_users = [row for row in dataset["users"] if row["split"] == "test"]
    comparisons = [
        _evaluate_policy(name, test_users, control_model, treatment_model, billable_model, calibrator)
        for name in ("learned_profit_gated", "rules_affinity", "fixed_dairy")
    ]
    split_counts = Counter(row["split"] for row in dataset["logged"])
    arm_counts = {
        split: Counter(row["treatment"] for row in dataset["logged"] if row["split"] == split)
        for split in ("train", "calibration", "test")
    }
    return {
        "report_version": 1,
        "evidence_type": "synthetic_randomized_offline_evaluation",
        "seed": seed,
        "dataset": {
            "users": users,
            "candidate_actions_per_user": len(ACTION_CATALOG),
            "split_counts": dict(sorted(split_counts.items())),
            "randomized_arm_counts": {
                split: {"control": counts[0], "treatment": counts[1]}
                for split, counts in arm_counts.items()
            },
            "treatment_propensity": 0.5,
            "logged_action_propensity": 1.0 / len(ACTION_CATALOG),
            "case_fact": "Audience segment shares only",
            "synthetic_assumptions": [
                "purchase probabilities and treatment effects",
                "SKU margin, reward cost and advertiser CPA",
                "stock, risk and billable-event outcomes",
            ],
        },
        "models": {
            "uplift": "two_model_logistic_regression_plus_isotonic",
            "billable": "separate_logistic_regression",
            "features": list(FEATURE_NAMES),
            "control": control_model.summary(),
            "treatment": treatment_model.summary(),
            "billable_event": billable_model.summary(),
            "isotonic_weight": ISOTONIC_WEIGHT,
            "isotonic_blocks": calibrator.summary(),
        },
        "calibration_points": [
            {
                "raw_score": round(row["raw_score"], 8),
                "empirical_uplift": round(row["empirical_uplift"], 8),
                "weight": row["weight"],
                "treated": row["treated"],
                "control": row["control"],
            }
            for row in calibration_points
        ],
        "heldout_model_metrics": metrics,
        "heldout_policy_comparison": comparisons,
        "baseline_definitions": {
            "rules_affinity": (
                "Rules-style baseline on the same candidates: recipe match, then category affinity, "
                "inventory progress and stable action ID; it applies the same eligibility filter."
            ),
            "fixed_dairy": (
                "One dairy challenge for every test user whose dairy candidate passes the same "
                "familiarity, stock and risk checks."
            ),
        },
        "guardrails": {
            "randomized_logged_treatment": True,
            "randomized_logged_action": True,
            "policy_inputs_exclude_labels_and_outcomes": True,
            "test_set_used_only_for_final_evaluation": True,
            "same_test_users_and_potential_outcomes_for_all_policies": True,
            "money_is_integer_kopecks": True,
        },
        "interpretation": {
            "claim": "Offline implementation proof: the learned gated policy can recover positive synthetic value on held-out users.",
            "not_claimed": "No measured X5 uplift, production quality, advertiser demand or proven habit formation.",
            "next_test": "Randomized pilot with logged propensities and SKU-level realized margin.",
        },
    }


def build_robustness_summary(*, users: int, seeds: Sequence[int]) -> dict:
    """Repeat the entire split/train/calibrate/test pipeline for independent seeds."""
    if not seeds:
        raise ValueError("At least one robustness seed is required")
    runs = []
    for seed in seeds:
        report = build_report(users=users, seed=seed)
        policies = {row["policy"]: row for row in report["heldout_policy_comparison"]}
        runs.append({
            "seed": seed,
            "test_users": policies["learned_profit_gated"]["assigned_users"],
            "policy_net_kopecks": {
                name: policies[name]["net_kopecks"]
                for name in ("learned_profit_gated", "rules_affinity", "fixed_dairy")
            },
            "learned_coverage": policies["learned_profit_gated"]["coverage"],
            "uplift_rmse": report["heldout_model_metrics"]["uplift_rmse"],
            "billable_auc": report["heldout_model_metrics"]["billable_auc"],
        })
    learned_values = [row["policy_net_kopecks"]["learned_profit_gated"] for row in runs]
    rules_values = [row["policy_net_kopecks"]["rules_affinity"] for row in runs]
    fixed_values = [row["policy_net_kopecks"]["fixed_dairy"] for row in runs]
    return {
        "users_per_seed": users,
        "seeds": list(seeds),
        "runs": runs,
        "learned_positive_seeds": sum(value > 0 for value in learned_values),
        "learned_beats_rules_seeds": sum(learned > rules for learned, rules in zip(learned_values, rules_values)),
        "learned_beats_fixed_seeds": sum(learned > fixed for learned, fixed in zip(learned_values, fixed_values)),
        "mean_policy_net_kopecks": {
            "learned_profit_gated": round(statistics.mean(learned_values), 2),
            "rules_affinity": round(statistics.mean(rules_values), 2),
            "fixed_dairy": round(statistics.mean(fixed_values), 2),
        },
        "learned_net_range_kopecks": [min(learned_values), max(learned_values)],
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--users", type=int, default=DEFAULT_USERS)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--json-out", type=pathlib.Path)
    parser.add_argument(
        "--robustness-seeds",
        help="Optional comma-separated seeds; reruns the complete pipeline and appends a compact summary.",
    )
    args = parser.parse_args(argv)
    report = build_report(users=args.users, seed=args.seed)
    if args.robustness_seeds:
        seeds = tuple(int(value.strip()) for value in args.robustness_seeds.split(",") if value.strip())
        report["robustness"] = build_robustness_summary(users=args.users, seeds=seeds)
    comparison = {row["policy"]: row for row in report["heldout_policy_comparison"]}
    learned = comparison["learned_profit_gated"]
    print(
        f"Held-out: {learned['assigned_users']} synthetic users; learned policy served "
        f"{learned['served_users']} ({learned['coverage']:.1%}) and returned "
        f"{learned['net_rubles']:+.2f} RUB."
    )
    print(
        "Baselines: rules "
        f"{comparison['rules_affinity']['net_rubles']:+.2f} RUB; fixed dairy "
        f"{comparison['fixed_dairy']['net_rubles']:+.2f} RUB."
    )
    print(
        "Synthetic randomized evaluation only; policy inputs contain no labels, "
        "potential outcomes or latent response."
    )
    if "robustness" in report:
        robustness = report["robustness"]
        print(
            f"Robustness: learned policy is positive in {robustness['learned_positive_seeds']}/"
            f"{len(robustness['seeds'])} seeds and beats rules in "
            f"{robustness['learned_beats_rules_seeds']}/{len(robustness['seeds'])}."
        )
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
