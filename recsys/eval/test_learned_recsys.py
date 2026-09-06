"""Acceptance tests for the dependency-free learned RecSys proof."""
import copy
import json
import pathlib
import tempfile
import unittest

from recsys.eval import learned_recsys


class LearnedRecSysTest(unittest.TestCase):
    def test_population_and_randomized_log_are_reproducible(self):
        first = learned_recsys.build_dataset(users=800, seed=20260906)
        second = learned_recsys.build_dataset(users=800, seed=20260906)
        self.assertEqual(first, second)
        self.assertEqual({row["split"] for row in first["logged"]}, {"train", "calibration", "test"})
        train = [row for row in first["logged"] if row["split"] == "train"]
        treated_share = sum(row["treatment"] for row in train) / len(train)
        self.assertGreater(treated_share, 0.43)
        self.assertLess(treated_share, 0.57)

    def test_policy_surface_contains_observable_features_only(self):
        dataset = learned_recsys.build_dataset(users=80, seed=17)
        forbidden = {
            "control_outcome", "treatment_outcome", "billable_outcome",
            "true_control_probability", "true_treatment_probability",
            "true_uplift", "true_billable_probability", "latent_response",
        }
        for user in dataset["users"]:
            for candidate in user["candidates"]:
                self.assertFalse(forbidden.intersection(candidate["observable"]))
                self.assertTrue(forbidden.intersection(candidate["evaluation_only"]))
        for row in dataset["logged"]:
            self.assertFalse(forbidden.intersection(row))
            self.assertFalse(forbidden.intersection(row["observable"]))

    def test_test_labels_cannot_change_fitted_models_or_calibrator(self):
        dataset = learned_recsys.build_dataset(users=800, seed=29)
        changed = copy.deepcopy(dataset)
        for row in changed["logged"]:
            if row["split"] == "test":
                row["observed_purchase"] = 1 - row["observed_purchase"]
                row["billable_event"] = 1 - row["billable_event"]
        original_models = learned_recsys._fit_models(dataset)
        changed_models = learned_recsys._fit_models(changed)
        self.assertEqual([model.summary() for model in original_models],
                         [model.summary() for model in changed_models])
        original_calibrator, original_points = learned_recsys._fit_calibrator(
            dataset, original_models[0], original_models[1]
        )
        changed_calibrator, changed_points = learned_recsys._fit_calibrator(
            changed, changed_models[0], changed_models[1]
        )
        self.assertEqual(original_points, changed_points)
        self.assertEqual(original_calibrator.summary(), changed_calibrator.summary())

    def test_logistic_regression_learns_order_and_returns_probabilities(self):
        rows = [([0.0], 0), ([0.1], 0), ([0.2], 0), ([0.8], 1), ([0.9], 1), ([1.0], 1)] * 30
        model = learned_recsys.LogisticRegression(epochs=500, learning_rate=0.25, l2=0.01)
        model.fit([x for x, _ in rows], [y for _, y in rows])
        low = model.predict_probability([0.1])
        high = model.predict_probability([0.9])
        self.assertGreater(high, low)
        self.assertGreaterEqual(low, 0.0)
        self.assertLessEqual(high, 1.0)

    def test_isotonic_calibration_is_monotone(self):
        calibrator = learned_recsys.IsotonicRegression()
        calibrator.fit([0.1, 0.2, 0.3, 0.4], [0.04, 0.22, 0.12, 0.35], [10, 10, 10, 10])
        predictions = [calibrator.predict(value) for value in [0.05, 0.15, 0.25, 0.35, 0.45]]
        self.assertEqual(predictions, sorted(predictions))
        self.assertAlmostEqual(calibrator.predict(0.25), 0.17, places=6)

    def test_training_and_heldout_policy_report_are_reproducible(self):
        first = learned_recsys.build_report(users=6000, seed=20260906)
        second = learned_recsys.build_report(users=6000, seed=20260906)
        self.assertEqual(first, second)
        self.assertEqual(first["evidence_type"], "synthetic_randomized_offline_evaluation")
        self.assertTrue(first["guardrails"]["policy_inputs_exclude_labels_and_outcomes"])
        self.assertTrue(first["guardrails"]["test_set_used_only_for_final_evaluation"])
        self.assertEqual(first["models"]["uplift"], "two_model_logistic_regression_plus_isotonic")
        self.assertEqual(first["models"]["billable"], "separate_logistic_regression")

        policies = {row["policy"]: row for row in first["heldout_policy_comparison"]}
        self.assertGreater(policies["learned_profit_gated"]["net_kopecks"], 0)
        self.assertGreater(
            policies["learned_profit_gated"]["net_kopecks"],
            policies["rules_affinity"]["net_kopecks"],
        )
        self.assertGreater(
            policies["learned_profit_gated"]["net_kopecks"],
            policies["fixed_dairy"]["net_kopecks"],
        )
        self.assertGreater(first["heldout_model_metrics"]["billable_auc"], 0.65)
        self.assertLess(first["heldout_model_metrics"]["uplift_rmse"], 0.08)

    def test_cli_writes_the_same_report_as_library(self):
        with tempfile.TemporaryDirectory() as directory:
            output = pathlib.Path(directory) / "report.json"
            exit_code = learned_recsys.main([
                "--users", "600", "--seed", "73", "--json-out", str(output),
            ])
            self.assertEqual(exit_code, 0)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8")),
                             learned_recsys.build_report(users=600, seed=73))

    def test_multi_seed_summary_is_reproducible_and_keeps_each_baseline(self):
        first = learned_recsys.build_robustness_summary(users=600, seeds=(71, 72))
        second = learned_recsys.build_robustness_summary(users=600, seeds=(71, 72))
        self.assertEqual(first, second)
        self.assertEqual(first["seeds"], [71, 72])
        self.assertEqual(len(first["runs"]), 2)
        for run in first["runs"]:
            self.assertEqual(
                set(run["policy_net_kopecks"]),
                {"learned_profit_gated", "rules_affinity", "fixed_dairy"},
            )


if __name__ == "__main__":
    unittest.main()
