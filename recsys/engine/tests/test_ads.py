"""Contract tests for the local Ads auction.

The auction filters ineligible campaigns before scoring, reserves the maximum liability and
returns a first-price billing intent that can only be charged after a confirmed qualifying
event.
"""
import datetime as dt
import json
import pathlib
import unittest

from recsys.engine.ads import (
    DAY_MS,
    AuctionCampaign,
    AuctionContext,
    allocate_campaign,
    count_recent_exposures,
    resolve_billing,
)
from recsys.engine.economics import build_economics, select_sponsorship
from recsys.engine.policy import load_campaigns, load_policy


TODAY = dt.date(2026, 9, 6)


def campaign(
    campaign_id: str,
    *,
    category: str = "dairy",
    bid: int = 1_800,
    subsidy: int = 0,
    available: int = 100_000,
    quality: int = 8_000,
    increment: int = 600,
    billable: int = 8_000,
    pacing: int = 10_000,
    frequency_cap: int = 3,
    start: str = "2026-09-01",
    end: str = "2026-09-30",
) -> AuctionCampaign:
    return AuctionCampaign(
        campaign_id=campaign_id,
        advertiser_id=f"brand-{campaign_id}",
        advertiser_name=f"Brand {campaign_id}",
        eligible_categories=(category,),
        flight_start=dt.date.fromisoformat(start),
        flight_end=dt.date.fromisoformat(end),
        bid_kopecks=bid,
        subsidy_kopecks=subsidy,
        available_budget_kopecks=available,
        frequency_cap_14d=frequency_cap,
        quality_bps=quality,
        increment_bps=increment,
        p_billable_bps=billable,
        pacing_bps=pacing,
    )


def context(**overrides: object) -> AuctionContext:
    values = {
        "category": "dairy",
        "today": TODAY,
        "candidate_relevance_bps": 9_000,
        "min_quality_bps": 5_000,
        "min_increment_bps": 400,
        "expected_x5_margin_kopecks": 2_000,
        "reward_cost_kopecks": 2_750,
        "exposures_14d_by_campaign": None,
    }
    values.update(overrides)
    return AuctionContext(**values)  # type: ignore[arg-type]


class AdsAuctionTest(unittest.TestCase):
    def test_demo_catalog_quality_can_beat_the_higher_submitted_bid(self) -> None:
        examples = pathlib.Path(__file__).resolve().parents[2] / "contract" / "examples"
        ads = json.loads((examples / "ads.json").read_text(encoding="utf-8"))
        sponsorship = select_sponsorship(
            "Dairy",
            1_788_598_800_000,
            load_policy(),
            load_campaigns(),
            ads=ads,
            profile_id="demo-empty",
            candidate_relevance_bps=8_250,
            expected_x5_margin_kopecks=4_500,
            reward_cost_kopecks=2_750,
        )

        self.assertEqual(sponsorship.campaign_id, "camp_058")
        self.assertEqual(sponsorship.bid_kopecks, 1_800)
        self.assertEqual(sponsorship.highest_candidate_bid_kopecks, 3_200)
        self.assertFalse(sponsorship.winner_was_highest_bid)
        self.assertEqual(sponsorship.auction_candidate_count, 2)
        self.assertEqual(sponsorship.auction_eligible_count, 2)

    def test_hard_filters_run_before_scoring_and_explain_each_rejection(self) -> None:
        candidates = [
            campaign("wrong-category", category="coffee"),
            campaign("not-started", start="2026-09-07"),
            campaign("ended", end="2026-09-05"),
            campaign("no-budget", bid=1_800, subsidy=500, available=2_299),
            campaign("low-quality", quality=4_000),
            campaign("low-increment", increment=399),
            campaign("winner"),
        ]

        result = allocate_campaign(candidates, context())

        self.assertEqual(result.status, "filled")
        self.assertEqual(result.winner.campaign.campaign_id, "winner")  # type: ignore[union-attr]
        self.assertEqual(
            {rejection.campaign_id: rejection.reason_code for rejection in result.rejections},
            {
                "wrong-category": "category_mismatch",
                "not-started": "flight_inactive",
                "ended": "flight_inactive",
                "no-budget": "campaign_budget_insufficient",
                "low-quality": "quality_below_floor",
                "low-increment": "increment_below_floor",
            },
        )

    def test_frequency_cap_is_hard_only_when_exposure_state_is_supplied(self) -> None:
        capped = campaign("capped", bid=3_000, frequency_cap=2)
        fallback = campaign("fallback", bid=1_800, frequency_cap=3)

        without_state = allocate_campaign([capped, fallback], context())
        with_state = allocate_campaign(
            [capped, fallback],
            context(exposures_14d_by_campaign={"capped": 2, "fallback": 0}),
        )

        self.assertEqual(
            without_state.winner.campaign.campaign_id, "capped"  # type: ignore[union-attr]
        )
        self.assertEqual(
            with_state.winner.campaign.campaign_id, "fallback"  # type: ignore[union-attr]
        )
        self.assertIn("frequency_cap_reached", with_state.reason_codes)

    def test_quality_adjusted_score_can_beat_the_highest_bid(self) -> None:
        high_bid_low_quality = campaign(
            "high-bid", bid=4_000, quality=6_000, billable=5_000, pacing=8_000
        )
        relevant_on_pace = campaign(
            "quality", bid=2_800, quality=9_500, billable=9_000, pacing=11_000
        )

        result = allocate_campaign([high_bid_low_quality, relevant_on_pace], context())

        self.assertEqual(result.winner.campaign.campaign_id, "quality")  # type: ignore[union-attr]
        components = result.winner.score  # type: ignore[union-attr]
        self.assertEqual(components.expected_payment_kopecks, 2_520)
        self.assertEqual(components.effective_quality_bps, 8_550)
        self.assertEqual(components.pacing_bps, 11_000)
        self.assertEqual(
            components.rank_score_kopecks,
            components.paced_quality_payment_kopecks
            + components.expected_x5_margin_kopecks
            - components.uncovered_reward_cost_kopecks,
        )

    def test_ties_are_resolved_by_stable_campaign_id(self) -> None:
        result = allocate_campaign(
            [campaign("z-campaign"), campaign("a-campaign")], context()
        )
        self.assertEqual(
            result.winner.campaign.campaign_id, "a-campaign"  # type: ignore[union-attr]
        )

    def test_no_eligible_campaign_returns_no_fill(self) -> None:
        result = allocate_campaign([campaign("coffee", category="coffee")], context())
        self.assertEqual(result.status, "no_fill")
        self.assertIsNone(result.winner)
        self.assertIsNone(result.billing_intent)
        self.assertEqual(result.reason_codes, ("no_eligible_campaign", "category_mismatch"))

    def test_reserve_covers_submitted_bid_and_reward_subsidy(self) -> None:
        result = allocate_campaign(
            [campaign("funded", bid=1_800, subsidy=2_500, available=4_300)], context()
        )
        self.assertEqual(result.winner.reserve_kopecks, 4_300)  # type: ignore[union-attr]
        self.assertEqual(result.billing_intent.reserved_kopecks, 4_300)  # type: ignore[union-attr]
        self.assertEqual(
            result.winner.score.uncovered_reward_cost_kopecks,  # type: ignore[union-attr]
            250,
        )

    def test_first_gift_requires_full_physical_funding_but_not_coupon_funding(self) -> None:
        auction_context = context(
            reward_cost_kopecks=2_750,
            required_physical_funding_kopecks=2_500,
        )

        underfunded = allocate_campaign(
            [campaign("underfunded", bid=1_000, subsidy=1_499)], auction_context
        )
        exactly_funded = allocate_campaign(
            [campaign("exact", bid=1_000, subsidy=1_500)], auction_context
        )

        self.assertEqual(underfunded.status, "no_fill")
        self.assertIn("physical_reward_funding_insufficient", underfunded.reason_codes)
        self.assertEqual(exactly_funded.status, "filled")
        self.assertEqual(exactly_funded.winner.reserve_kopecks, 2_500)  # type: ignore[union-attr]

    def test_first_price_is_charged_only_for_a_verified_qualified_event(self) -> None:
        allocation = allocate_campaign(
            [campaign("first-price", bid=3_200, subsidy=1_800)], context()
        )
        intent = allocation.billing_intent
        self.assertEqual(intent.bid_kopecks, 3_200)  # type: ignore[union-attr]
        self.assertEqual(
            intent.charge_condition,  # type: ignore[union-attr]
            "verified_qualified_event",
        )

        unqualified = resolve_billing(  # type: ignore[arg-type]
            intent, qualified=False, verified=True
        )
        unverified = resolve_billing(  # type: ignore[arg-type]
            intent, qualified=True, verified=False
        )
        billed = resolve_billing(intent, qualified=True, verified=True)  # type: ignore[arg-type]

        self.assertEqual(unqualified.status, "not_billable")
        self.assertEqual(unqualified.charge_kopecks, 0)
        self.assertEqual(unverified.status, "not_billable")
        self.assertEqual(unverified.charge_kopecks, 0)
        self.assertEqual(billed.status, "billable")
        self.assertEqual(billed.charge_kopecks, 3_200)
        self.assertNotEqual(
            billed.charge_kopecks,
            allocation.winner.score.rank_score_kopecks,  # type: ignore[union-attr]
        )

    def test_recent_exposures_count_unique_impressions_for_profile_and_campaign(self) -> None:
        now_ms = 1_788_686_400_000  # 2026-09-06T08:00:00Z
        day_ms = 86_400_000
        exposures = [
            {
                "exposure_id": "exp-1",
                "profile_id": "u-1",
                "campaign_id": "c-1",
                "shown_at_ms": now_ms - day_ms,
            },
            {
                "exposure_id": "exp-1",
                "profile_id": "u-1",
                "campaign_id": "c-1",
                "shown_at_ms": now_ms - day_ms,
            },
            {
                "exposure_id": "exp-2",
                "profile_id": "u-1",
                "campaign_id": "c-1",
                "shown_at_ms": now_ms - 14 * day_ms,
            },
            {
                "exposure_id": "exp-old",
                "profile_id": "u-1",
                "campaign_id": "c-1",
                "shown_at_ms": now_ms - 14 * day_ms - 1,
            },
            {
                "exposure_id": "exp-other-user",
                "profile_id": "u-2",
                "campaign_id": "c-1",
                "shown_at_ms": now_ms - day_ms,
            },
            {
                "exposure_id": "exp-other-campaign",
                "profile_id": "u-1",
                "campaign_id": "c-2",
                "shown_at_ms": now_ms - day_ms,
            },
            {
                "exposure_id": "exp-future",
                "profile_id": "u-1",
                "campaign_id": "c-1",
                "shown_at_ms": now_ms + 1,
            },
        ]

        counts = count_recent_exposures(exposures, profile_id="u-1", now_ms=now_ms)

        self.assertEqual(counts, {"c-1": 2, "c-2": 1})

    def test_runtime_adapter_uses_global_ads_budget_and_exposures(self) -> None:
        now_ms = 1_788_598_800_000
        catalog = {
            "incrementality_floor": 0.04,
            "advertisers": [{"advertiser_id": "brand-1", "name": "Brand one"}],
            "campaigns": [
                {
                    "campaign_id": "c-1",
                    "advertiser_id": "brand-1",
                    "eligible_categories": ["dairy"],
                    "flight_start": "2026-09-01",
                    "flight_end": "2026-09-30",
                    "frequency_cap_14d": 2,
                    "bid_per_qualified_visit": 18.0,
                    "reward_cost": 25.0,
                    "quality_score": 0.9,
                    "uplift": 0.06,
                    "p_billable": 0.8,
                    "pacing_multiplier": 1.1,
                    "total_budget": 100.0,
                    "remaining_budget": 100.0,
                }
            ],
        }
        policy = {
            "campaign_category_map": {"Dairy": "dairy"},
            "min_expected_increment_kopecks": 100,
            "expected_incremental_margin_default_kopecks": 3_500,
        }
        ads = {
            "campaigns": [
                {
                    "campaign_id": "c-1",
                    "remaining_budget_kopecks": 6_000,
                    "reserved_kopecks": 1_000,
                    "settled_kopecks": 4_000,
                    "frequency_cap_14d": 2,
                }
            ],
            "exposures": [
                {
                    "exposure_id": "exp-1",
                    "decision_id": "dec-1",
                    "profile_id": "u-1",
                    "campaign_id": "c-1",
                    "shown_at_ms": now_ms - DAY_MS,
                    "reserved_kopecks": 4_300,
                    "status": "released",
                }
            ],
            "billings": [],
        }

        sponsorship = select_sponsorship(
            "Dairy",
            now_ms,
            policy,
            catalog,
            ads=ads,
            profile_id="u-1",
            candidate_relevance_bps=9_000,
            expected_x5_margin_kopecks=3_500,
            reward_cost_kopecks=2_750,
        )

        self.assertEqual(sponsorship.campaign_id, "c-1")
        self.assertEqual(sponsorship.bid_kopecks, 1_800)
        self.assertEqual(sponsorship.subsidy_kopecks, 2_500)
        self.assertEqual(sponsorship.reserve_kopecks, 4_300)
        self.assertEqual(sponsorship.available_budget_kopecks, 5_000)
        self.assertEqual(sponsorship.quality_bps, 9_000)
        self.assertEqual(sponsorship.pacing_bps, 11_000)
        self.assertIsInstance(sponsorship.rank_score_kopecks, int)
        self.assertEqual(sponsorship.billing_intent.bid_kopecks, 1_800)

        economics = build_economics("Dairy", 250, 2_500, sponsorship, policy)
        self.assertEqual(economics["quality_score"], 0.81)
        self.assertEqual(economics["pacing_multiplier"], 1.1)
        self.assertEqual(economics["campaign_reserve_kopecks"], 4_300)
        self.assertEqual(economics["auction_type"], "quality_adjusted_first_price_cpa")
        self.assertEqual(economics["auction_score_kopecks"], sponsorship.rank_score_kopecks)

    def test_runtime_adapter_rejects_exhausted_reserve_and_frequency_cap(self) -> None:
        now_ms = 1_788_598_800_000
        catalog = {
            "incrementality_floor": 0.04,
            "advertisers": [],
            "campaigns": [
                {
                    "campaign_id": "c-1",
                    "advertiser_id": "brand-1",
                    "eligible_categories": ["dairy"],
                    "flight_start": "2026-09-01",
                    "flight_end": "2026-09-30",
                    "frequency_cap_14d": 1,
                    "bid_per_qualified_visit": 18.0,
                    "reward_cost": 25.0,
                    "remaining_budget": 100.0,
                }
            ],
        }
        policy = {
            "campaign_category_map": {"Dairy": "dairy"},
            "min_expected_increment_kopecks": 100,
            "expected_incremental_margin_default_kopecks": 3_500,
        }
        base_state = {
            "campaigns": [
                {
                    "campaign_id": "c-1",
                    "remaining_budget_kopecks": 5_000,
                    "reserved_kopecks": 701,
                    "settled_kopecks": 0,
                    "frequency_cap_14d": 1,
                }
            ],
            "exposures": [],
            "billings": [],
        }

        exhausted = select_sponsorship(
            "Dairy", now_ms, policy, catalog, ads=base_state, profile_id="u-1"
        )
        self.assertIsNone(exhausted.campaign_id)

        frequency_state = {
            **base_state,
            "campaigns": [
                {**base_state["campaigns"][0], "reserved_kopecks": 0}
            ],
            "exposures": [
                {
                    "exposure_id": "exp-1",
                    "profile_id": "u-1",
                    "campaign_id": "c-1",
                    "shown_at_ms": now_ms,
                    "status": "reserved",
                }
            ],
        }
        capped = select_sponsorship(
            "Dairy", now_ms, policy, catalog, ads=frequency_state, profile_id="u-1"
        )
        self.assertIsNone(capped.campaign_id)

        missing_campaign_state = {"campaigns": [], "exposures": [], "billings": []}
        missing = select_sponsorship(
            "Dairy",
            now_ms,
            policy,
            catalog,
            ads=missing_campaign_state,
            profile_id="u-1",
        )
        self.assertIsNone(missing.campaign_id)

    def test_runtime_adapter_never_reserves_more_subsidy_than_the_reward(self) -> None:
        now_ms = 1_788_598_800_000
        catalog = {
            "incrementality_floor": 0.04,
            "advertisers": [],
            "campaigns": [
                {
                    "campaign_id": "c-1",
                    "advertiser_id": "brand-1",
                    "eligible_categories": ["dairy"],
                    "flight_start": "2026-09-01",
                    "flight_end": "2026-09-30",
                    "frequency_cap_14d": 2,
                    "bid_per_qualified_visit": 18.0,
                    "reward_cost": 50.0,
                    "remaining_budget": 100.0,
                }
            ],
        }
        policy = {
            "campaign_category_map": {"Dairy": "dairy"},
            "min_expected_increment_kopecks": 100,
            "expected_incremental_margin_default_kopecks": 3_500,
        }
        ads = {
            "campaigns": [
                {
                    "campaign_id": "c-1",
                    "remaining_budget_kopecks": 10_000,
                    "reserved_kopecks": 0,
                    "settled_kopecks": 0,
                    "frequency_cap_14d": 2,
                }
            ],
            "exposures": [],
            "billings": [],
        }

        sponsorship = select_sponsorship(
            "Dairy",
            now_ms,
            policy,
            catalog,
            ads=ads,
            profile_id="u-1",
            reward_cost_kopecks=2_750,
        )

        self.assertEqual(sponsorship.subsidy_kopecks, 2_750)
        self.assertEqual(sponsorship.reserve_kopecks, 4_550)


class DerivedPacingTest(unittest.TestCase):
    """The catalog does not set the spend pace: it follows from actual flight spend.

    Flight 2026-09-01..2026-09-30 (30 days), "today" is the fifth day, budget RUB 100.
    Planned spend by that day is RUB 16.67, so under-delivery speeds impressions up and
    over-delivery slows them down. The multiplier is clamped to 0.5x-1.5x.
    """

    NOW_MS = 1_788_598_800_000

    def sponsorship_for(self, settled_kopecks: int):
        catalog = {
            "incrementality_floor": 0.04,
            "advertisers": [{"advertiser_id": "brand-1", "name": "Brand one"}],
            "campaigns": [
                {
                    "campaign_id": "c-1",
                    "advertiser_id": "brand-1",
                    "eligible_categories": ["dairy"],
                    "flight_start": "2026-09-01",
                    "flight_end": "2026-09-30",
                    "frequency_cap_14d": 5,
                    "bid_per_qualified_visit": 18.0,
                    "reward_cost": 0.0,
                    "quality_score": 0.9,
                    "uplift": 0.06,
                    "p_billable": 0.8,
                    "total_budget": 100.0,
                    "remaining_budget": 100.0,
                }
            ],
        }
        policy = {
            "campaign_category_map": {"Dairy": "dairy"},
            "min_expected_increment_kopecks": 100,
            "expected_incremental_margin_default_kopecks": 3_500,
        }
        ads = {
            "campaigns": [
                {
                    "campaign_id": "c-1",
                    "remaining_budget_kopecks": 10_000 - settled_kopecks,
                    "reserved_kopecks": 0,
                    "settled_kopecks": settled_kopecks,
                    "frequency_cap_14d": 5,
                }
            ],
            "exposures": [],
            "billings": [],
        }
        return select_sponsorship(
            "Dairy",
            self.NOW_MS,
            policy,
            catalog,
            ads=ads,
            profile_id="u-1",
            reward_cost_kopecks=250,
        )

    def test_catalog_no_longer_pins_the_pacing_multiplier(self) -> None:
        for entry in load_campaigns()["campaigns"]:
            self.assertNotIn("pacing_multiplier", entry, entry["campaign_id"])

    def test_a_campaign_that_has_not_spent_yet_gets_maximum_catch_up(self) -> None:
        self.assertEqual(self.sponsorship_for(0).pacing_bps, 15_000)

    def test_spending_on_plan_keeps_the_neutral_multiplier(self) -> None:
        self.assertEqual(self.sponsorship_for(1_667).pacing_bps, 10_000)

    def test_underspending_accelerates_and_overspending_throttles(self) -> None:
        underspent = self.sponsorship_for(1_000).pacing_bps
        on_plan = self.sponsorship_for(1_667).pacing_bps
        overspent = self.sponsorship_for(3_000).pacing_bps

        self.assertGreater(underspent, on_plan)
        self.assertLess(overspent, on_plan)

    def test_the_multiplier_stays_inside_the_bounded_range(self) -> None:
        # Every value leaves the campaign budget for a reserve, otherwise it is filtered before scoring.
        for settled in (1, 500, 1_667, 4_000, 8_000):
            with self.subTest(settled=settled):
                self.assertTrue(5_000 <= self.sponsorship_for(settled).pacing_bps <= 15_000)

    def test_pacing_changes_ranking_but_never_the_billed_price(self) -> None:
        throttled = self.sponsorship_for(8_000)
        accelerated = self.sponsorship_for(500)

        self.assertLess(throttled.rank_score_kopecks, accelerated.rank_score_kopecks)
        self.assertEqual(throttled.bid_kopecks, accelerated.bid_kopecks)
        self.assertEqual(
            resolve_billing(throttled.billing_intent, qualified=True, verified=True).charge_kopecks,
            resolve_billing(accelerated.billing_intent, qualified=True, verified=True).charge_kopecks,
        )


if __name__ == "__main__":
    unittest.main()
