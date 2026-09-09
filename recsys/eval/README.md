# Local PoC evaluation

The relevance rubric is maintained separately from the decision engine. `agent_draft` means
provisional annotations produced by an agent. Human expert review and real user sessions
have not been completed. These evaluations do not establish quality for X5 customers.

## Run the evaluations

Run from the repository root:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s recsys/eval -p 'test_*.py' -v
PYTHONDONTWRITEBYTECODE=1 python3 recsys/eval/run_relevance.py
PYTHONDONTWRITEBYTECODE=1 python3 recsys/eval/simulate.py \
  --json-out recsys/eval/results/audience-simulation.json
PYTHONDONTWRITEBYTECODE=1 python3 recsys/eval/fraud_eval.py
PYTHONDONTWRITEBYTECODE=1 python3 recsys/eval/compare_policies.py \
  --json-out recsys/eval/results/policy-comparison.json
PYTHONDONTWRITEBYTECODE=1 python3 recsys/eval/learned_recsys.py \
  --robustness-seeds 20260902,20260903,20260904,20260905,20260906 \
  --json-out recsys/eval/results/learned-recsys.json
PYTHONDONTWRITEBYTECODE=1 python3 recsys/eval/persona_ux.py --live \
  --json-out recsys/eval/results/persona-ux.json
```

Omit `--json-out` to print results without replacing the saved reports. Bulk evaluation uses
a template instead of external LLM calls; live model checks run separately. `build_profiles.py`
overwrites profiles and the rubric, so do not run it after those annotations have been
manually approved.

## Relevance

The acceptance threshold is at least 28 matches across 40 eligible profiles. `no_action` on
an eligible profile counts as a miss. Eight separate negative profiles pass only when the
actual refusal includes the expected reason. A reduced denominator or an incorrect refusal
reason produces a nonzero exit code.

The rubric accepts a missing item from a familiar category that belongs to at least one
recipe. It allows several valid answers without copying the ranking order, but currently
checks only the choice of digital item. Eligible profiles are evaluated as a subsequent
digital cycle after onboarding, separating RecSys relevance from the limited advertiser
coverage of the first physical gift. Requests still include the full Ads contract v2
snapshot. Separate engine, web and E2E tests cover the first cycle, reservations and billing.
Challenge feasibility and the usefulness of the complete offer still require human review.

Evaluator contract v2, post-onboarding digital cycle: **40/40** acceptable decisions and
**8/8** expected refusals. Annotation status: **agent_draft**, without expert confirmation.

## Primary result: a funded first physical gift

`sponsored_onboarding` allows the first physical gift only with advertiser funding. If no
eligible funded offer exists, it returns `funding_gate` before display or reservation.
Ordinary challenges with digital rewards are allowed after the first gift. The same funding
gate applies to runtime `/decision`; the figures below come from a separate simulator.
Reward terms remain fixed once displayed.

Across five seeds, **20260901–20260905**, with 1,000 users and four weeks per run, simulated
net value after fully covering the increase in outstanding coupon liabilities averaged
**+RUB 3,845.06**, ranging from **+RUB 3,743.20 to +RUB 4,171.80**, positive in **5/5** runs.
Average reach was **204 users (20.40%)**, with **20.6 incremental purchase days**,
**RUB 4,701.04** in costs and an average peak simultaneous reserve of **RUB 6,765.90**.
All 1,000 assigned users remain in the denominator, including those who receive no offer.

| Policy | Average reach | Incremental purchase days | Net after liability coverage | Four-week cash net |
| --- | ---: | ---: | ---: | ---: |
| Advertiser-funded first gift | 20.40% | +20.6 | **+RUB 3,845.06** | +RUB 4,301.56 |
| Broad personalized allocation | 96.48% | +109.0 | −RUB 7,996.44 | −RUB 5,896.94 |
| Fixed dairy category | 6.84% | +4.6 | +RUB 1,024.88 | +RUB 1,141.38 |
| Same terms and reward, without the game presentation | 20.40% | +16.4 | +RUB 3,436.90 | +RUB 3,889.40 |

The opening coupon reserve includes external obligations and every seeded item instance.
The calculation subtracts `max(0, closing reserve - opening reserve)` from cash net, without
charging existing liabilities a second time. For the selected policy, the average opening
reserve is **RUB 1,681**, the closing reserve is **RUB 2,137.50**, and the increase is
**RUB 456.50**: **4,301.56 − 456.50 = RUB 3,845.06**. Physical rewards are already fully
included in costs. Unfulfilled promises expire before the scenario ends; this accounting
does not cancel earned rights.

`fixed_dairy` restricts the engine's candidates to dairy while preserving familiarity,
stock, risk and budget filters. It is a fixed baseline, not an optimum across all categories.
`reward_only` uses the same advertiser-only gate, rules and rewards as `sponsored_onboarding`,
with the assumed behavioral response multiplied by **0.75**. Both policies therefore reach
**20.40%** of users, with a simulated difference of **+RUB 408.16** after liabilities in
favor of the game. The multiplier is an assumption, not a measured contribution of the
game. With a multiplier of 1, initial allocation is identical; later states can diverge
when responses differ. Hidden segment and engagement labels never enter the policy.
Within each seed, all policies use the same population and per-user, per-week random draws;
their fingerprints are checked.

Revenue is counted once using the terms of **the selected challenge**. The declared
campaign terms include a dairy CPA of RUB 18 with up to RUB 25 in subsidy, and a coffee CPA
of RUB 32 with up to RUB 18 in subsidy. The subsidy is capped by the reserved reward cost;
for a digital-only reward, this is the item reserve. Scenario collection multipliers from
0 to 1 model nonpayment of declared revenue. They do not create extra revenue. This replaces
the earlier flat assumption of “RUB 18 + RUB 12 for every campaign” while retaining the
baseline population and behavioral assumptions.

The selected policy's average simulated billed CPA is **RUB 26.88**. The break-even CPA,
including the increase in outstanding liabilities, is **RUB 1.22** per sponsored qualifying
event when purchases, subsidies and costs are held fixed. The calculation takes the positive
part of `(costs - incremental margin - subsidies + liability increase) / sponsored events`
and rounds up to the next kopeck. This is a conditional sensitivity calculation, not an
auction bid or a brand agreement. The scenario also assumes RUB 95 of incremental margin
per purchase day and RUB 1.20 of operating costs per display. Outstanding liabilities remain
in `final_budget`; four-week cash net is not lifetime user profit.

The policy was selected after exploratory synthetic runs. Five seeds do not make this an
independent customer experiment. The demonstrated result is positive simulated net value
under explicit funding and eligibility constraints, with lower reach. All seeds, costs,
reserves and breakdowns across five segments and three engagement levels are available in
[`results/policy-comparison.json`](results/policy-comparison.json).

## Offline learned RecSys

[`learned_recsys.py`](learned_recsys.py) implements separate treatment and control logistic
regressions, their difference as uplift, isotonic calibration, and a separate logistic
regression for billable-event probability. It uses no external libraries. The generator
creates 6,000 synthetic users with four candidate actions each; treatment and logged action
are randomly assigned. The deterministic split contains 3,620 training, 1,165 calibration
and **1,215 test** users. Labels, hidden potential outcomes and engagement do not enter the
policy features.

Results on the same held-out population:

| Policy | Reach | Incremental purchases | Net value across the entire test cohort |
| --- | ---: | ---: | ---: |
| Learned profit-gated | 96.21% | +271 | **+RUB 18,665.20** |
| Rules profit-ranked | 98.11% | +210 | **+RUB 16,723.60** |
| Rules runtime | 98.11% | +287 | **+RUB 13,533.60** |
| Rules affinity | 98.11% | +287 | **+RUB 13,533.60** |
| Fixed dairy | 87.49% | +87 | **−RUB 6,790.60** |

The three rules baselines separate the choice of objective from the learned estimates.
`Rules runtime` adapts the ordering of `Candidate.rank_key` from
[`../engine/candidates.py`](../engine/candidates.py) and its minimum expected-value gate to
the synthetic catalog. The offline adapter uses continuous `category_affinity` in place of
the engine's observed `familiar_days`, synthetic recency and a simplified static economic
estimate; it does not call the runtime allocator. `Rules profit-ranked` uses the same static
economic estimate but ranks by it directly. `Rules affinity` is a naive heuristic without
an economic objective.

In this shared synthetic test cohort, ranking by the economic objective improves net value
by **RUB 3,190.00**; the calibrated learned policy adds another **RUB 1,941.60**. Most of the
gap to the runtime-style baseline comes from changing the ranking objective. The
`rules profit-ranked` baseline produces fewer incremental purchases but higher net value,
because it chooses actions with more favorable assumed economics.

`Rules runtime` and `rules affinity` produce identical monetary results across all five
seeds. In this offline generator, continuous `category_affinity` resolves comparisons before
the sixth, economic component of the lexicographic key. This does not prove that economics
never affects the real engine's ranking: the engine uses discrete purchase-day counts,
which can tie, and also applies an economic eligibility gate.

Calibrated uplift RMSE is **0.063689**, compared with **0.067954** before calibration;
billable-event AUC is **0.801916**. Across five seeds, the learned policy has positive net
value and outperforms the runtime-style rules baseline in **5/5** runs. Its net value ranges
from **+RUB 15,828.20 to +RUB 19,431.60**, averaging **+RUB 17,763.76**. It also outperforms
`rules profit-ranked` in **5/5** runs, while `rules profit-ranked` outperforms the
runtime-style order in **4/5**. Coefficients, isotonic blocks, guardrails and comparisons are
saved in [`results/learned-recsys.json`](results/learned-recsys.json).

This demonstrates an implementation on randomized synthetic data. It does not measure real
X5 uplift, user demand, advertiser demand or production quality. Runtime continues to use
explainable rules. A valid next step is a randomized pilot with actual propensity logging,
matured outcome labels and SKU-level margins.

Do not compare the absolute net value from this test run directly with the **+RUB 3,845.06**
four-week policy simulation: the cohorts, horizons and outcome generators differ. Compare
learned, rules and fixed policies only within the shared held-out population of this report.

## Appendix: audience and broad-allocation stress tests

The simulation contains 1,000 synthetic users, four weekly steps and a fixed seed. Segment
counts reproduce the Pyaterochka mobile-app audience shares provided in the case Q&A:
370 young adults, 50 adults in the case's “harmful habits” segment, 260 parents of children
under three, 210 mature adults and 110 seniors. Alcohol, tobacco and nicotine are excluded
from every offer. Engagement is assigned to 179 interested, 392 neutral and 429 skeptical
users. These engagement shares, purchase behavior and game responses are scenario
assumptions, not X5 data.

For external context, X5 reported 4.2 million players and 74 million sessions for its
“Om Nom” game in 2025, without a comparable impression denominator. Those totals cannot
identify the probability of interest in this game. X5 also reported that “Paket” subscribers
visit stores an average of 18 times per month, twice as often as loyalty-card holders.
That is a different, self-selected product across both retail chains. These figures are
therefore not model inputs. In this simulation, purchase probability refers to a weekly
purchase day in the challenge's familiar category, not any store visit. See the
[X5 gamification report](https://www.x5.ru/ru/news/kazhdyj-tretij-gejmer-igraet-v-mobilnyh-prilozheniyah-x5/)
and [Paket audience report](https://mediahub.x5.ru/news/chislo-podpischikov-paketa-ot-h5-dostiglo-25-mln).

The simulation calls the actual `handle_decision` and `handle_event` functions without
passing hidden response variables to the engine. Before each display, available funds
exclude settled spending and existing maximum liabilities. All promises displayed within
a week are reserved together before outcomes are processed.

The initial-state mix includes 670 seeded item instances, funded in advance by the coupon
reserve. A physical product incurs its full unit cost when first granted. Crafting a coupon
consumes four owned instances and transfers their reserve to the coupon without releasing
funds. An uncompleted challenge expires after its weekly opportunity; earned items and
unredeemed coupons remain funded. `start_empty_inventory: true` removes all seeded items.

| Broad-policy response scenario | Incremental purchase days | Coupons / items consumed | Net after liability coverage |
| --- | ---: | ---: | ---: |
| Positive purchase effect | +114 | 66 / 264 | −RUB 7,538.30 |
| Zero effect | 0 | 55 / 220 | −RUB 17,463.80 |
| Negative effect | −39 | 66 / 264 | −RUB 29,459.70 |

All three rows stress-test **`personalized_broad`**, not the primary `sponsored_onboarding`
policy. Peak simultaneous reserves reach RUB 24,127 against a RUB 10,000 coupon fund and a
RUB 25,000 physical-reward fund. A reserve is an outstanding obligation, not a settled cost.
A positive purchase effect does not ensure positive net value under these cost assumptions.
Zero incremental purchases also do not, by themselves, rule out advertiser revenue.

In the positive broad-allocation scenario, interested users contribute +49 purchase days
and +RUB 1,268.10; neutral users contribute +59 days and −RUB 1,080.50; skeptical users
contribute +6 days and −RUB 5,618.40 in cash net, before the aggregate reserve adjustment.
This illustrates the risk of broad allocation; it does not identify engaged users in advance.

Audience settings are in [`audience.json`](audience.json), with aggregate results in
[`results/audience-simulation.json`](results/audience-simulation.json).

Limitations: response probabilities and campaign parameters are synthetic. Operating costs
and fraud losses enter net value separately from reward funds. The simulation does not
model global SKU stock or advertiser-budget depletion, item trading, a subsequent period
without incentives, or habit formation. Starting with empty inventory produces zero coupons
across these limited four-step histories; the seeded scenario is explicitly disclosed.

## Fraud evaluation

The evaluation uses 36 calibration cases and 12 separately authored final challenge cases.
The final set contains 10 new risk-feature combinations among 11 distinct combinations.
These are deliberately difficult scenarios, not an independent random sample. Both sets
have `agent_draft` annotations.

Thresholds of 0.35 / 0.60 / 0.85 are compared with two alternatives on calibration data only,
using explicit error costs. The policy is not tuned on the final set. `reject`, `hold`,
`review` and `allow` are reported separately; losses from unresolved review cases use a
conservative estimate.

Final-set results: **1 reject** (precision 1.00, recall 0.17); **4 holds** (3 abusive and
1 legitimate case); **4 reviews**; and **3 allows**, including 1 concealed abuse case.
Of three legitimate households, one is incorrectly held and another sent for review.
Known gaps include a legitimate return from a new household triggering a hold and a
referral ring passing without observable graph features. These cases remain in the report;
thresholds have not been adjusted to improve final-set metrics. The results cannot estimate
real-world fraud prevalence or precision.

## Human evaluation and synthetic UX

### Synthetic UX with Qwen

`persona_ux.py --live` calls local Qwen3 1.7B through Ollama for **15 fictional personas**:
five segments × three attitudes toward the game. Without `--live`, it creates only a
protocol with status `prepared_not_run`. An unavailable model or invalid response is not
reported as a success. Strict JSON Schema constrains fields and allowed options, but does
not force factually correct answers. Comprehension of three card facts is scored separately
from subjective willingness to try the product.

The reports were re-recorded against the English product copy instead of translating model
responses after the fact. The initial-copy run in
[`results/persona-ux-initial.json`](results/persona-ux-initial.json) produced **15/15** valid
responses with all three facts correct. The no-schema variant in
[`results/persona-ux-separated-prompt.json`](results/persona-ux-separated-prompt.json) remained
invalid because Qwen confused field names. The latest structured-output run,
[`results/persona-ux.json`](results/persona-ux.json), also contains **15/15** valid responses,
with **45/45** facts correct. This English rerun does not preserve the earlier Russian-copy
ablation and is not evidence that one language is clearer than another.

All 15 intent responses are `try`, including skeptical personas. This is a limitation of
subjective roleplay with a small model, not evidence of broad interest. Valid JSON and
“I would try it” responses do not establish real interface comprehension or conversion.
This is a model-based check of copy and protocol; the number of real participants is **0**.

[human-protocol.md](human-protocol.md) describes a planned protocol for 5–7 user sessions;
no observations have been collected. Agent annotations and scenario results remain
synthetic evidence, even when produced by a separate agent or stored in a separate directory.
