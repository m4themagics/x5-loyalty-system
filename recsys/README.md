# RecSys: contracts, scenarios, and personalization

This directory contains **fixed synthetic scenarios, local checks, and the local PoC decision
engine**. Rules-based challenge selection, a local Ads auction, an LLM adapter, and independent
evaluation are connected to the game screens through Vite middleware. A separate learned
RecSys is implemented and evaluated offline on randomized synthetic logs. Server-owned
entitlement records, production billing, and training on X5 data are not implemented.
Local item exchange uses a shared browser state snapshot.

The product specification is in the [project description](../docs/project/project-description.md),
the team sequence is in the [team plan](../docs/project/plan.md), and detailed implementation
status and the production roadmap for models and Ads are in [PLAN.md](PLAN.md).

## The product integration

**Reward box → digital item → inventory → four items → a crafted discount.**

The local rules-based RecSys selects one achievable challenge from synthetic purchase history
and missing recipe items. After the first displayed, eligible challenge is completed and
verified, the user is guaranteed the promised free physical product and useful digital item.
A random demonstration box drop cannot replace that reward.

In the future repeat-cycle design, a specific free product can become the visible goal of a funded recipe.
Four instances are spent once, either on a discount or on that SKU. The two funding hypotheses
for first and repeat products are brand funding or X5 funding from positive expected incremental
margin after all costs. Current runtime allows the first SKU only when an advertiser wins;
X5 funding remains a target hypothesis. The first SKU, rules-based RecSys, local quality-adjusted
first-price CPA auction, and simple risk scoring work in the demo flow; production antifraud
remains future work.

Personalization uses the existing 24 items and seven recipes in
[profile-items.ts](../webapp/src/features/home/profile-items.ts) and
[profile-discount-crafting.ts](../webapp/src/features/home/profile-discount-crafting.ts).
The complete catalog, rarities, and bonuses are in [item-pool.md](../docs/project/item-pool.md).
RecSys recommends a useful next item; the user chooses the four instances for crafting.
Distinct recipe matches and the number of owned instances are counted separately.

A new user has an empty inventory: the first challenge grants one digital item and a separate
free product, rather than four items immediately. The “earn the fourth item and craft a discount”
scenario uses an explicitly seeded profile with three items. For example, `breakfast-pan`
completes `club-toaster`, `milk-pitcher`, and `travel-mug` into four common items in the
`breakfast` recipe: 5% base + 3 percentage points of bonus = 8% under the existing calculation.

In a repeat cycle, one active product goal binds a specific SKU to an existing recipe in advance.
Completing it requires four available instances that produce that thematic result under the
existing rules. Server-side consumption would grant one coupon or entitlement to the promised
product. The full SKU reserve is separate from instance-level coupon reserves; the first
challenge gift is also a separate obligation. These events and fields are described in the
roadmap only and have not been added to the schema.

Effect evaluation separates reward desirability, the added value of the game under equal
rewards and conditions, and subsequent paid purchases after a shared, predefined incentive
window. Current validators do not test purchase persistence or implement product grants for recipes.

## Directory contents

| Artifact | What it establishes |
| --- | --- |
| [action.schema.json](schema/action.schema.json) | The existing allocator scenario contract; not a contract for the full inventory, physical rewards, or discount redemption |
| [campaigns.json](catalog/campaigns.json) | 13 synthetic campaigns across 10 advertising categories; each of the 24 game categories has at least two competitors in the live local auction. The catalog does not specify pacing: the engine derives it from actual spending during the flight |
| [fixtures/](fixtures/) | Seven decision scenarios and two separate datasets for candidate inspection and copy validation |
| [validate.py](validate.py) | Validation of the supported schema subset, decision-level combinations, and the propensity product |
| [validate_explanation.py](validate_explanation.py) | Deterministic copy constraints relative to the selected decision |
| [eval_creatives.py](eval_creatives.py) | Copy mutation checks, false-positive checks, repair, or template fallback |

`validate.py` is not a complete JSON Schema validator: it skips files without `decision`.
A message reporting nine files describes the dataset size, not nine identically structured decisions.

| Fixture | Scenario and limitations |
| --- | --- |
| [masha.json](fixtures/masha.json) | A predefined sponsored scenario with `personal_finish` and `supplier_trial` |
| [masha-cycle2.json](fixtures/masha-cycle2.json) | A legacy transition to `digital_unlock`; the fading field is retained for compatibility, but mandatory reward fading is not a product requirement |
| [katya.json](fixtures/katya.json) | Predefined `store_coop` and selection of a lower-bid campaign; this result was not computed by a running auction |
| [sergey.json](fixtures/sergey.json) | Ad rejection at the incrementality threshold: `no_fill` together with `organic` |
| [holdout-ghost.json](fixtures/holdout-ghost.json) | A control assignment without display; the ghost record stores a possible action |
| [pacing-exhausted.json](fixtures/pacing-exhausted.json) | A predefined spending-pace constraint example |
| [fraud-delayed.json](fixtures/fraud-delayed.json) | Delayed reward and advertising charge; a scenario, not an operational fraud scorer |
| [console-sergey.json](fixtures/console-sergey.json) | Candidate inspection data, not an implemented console |
| [creatives-adversarial.json](fixtures/creatives-adversarial.json) | Seven copy-contract violations |

The seven regular scenarios contain `profile`, `decision`, `creative_copy`, and `route_state`.
The console and adversarial datasets use other structures. Current game screens do not read these fixtures.

## Local PoC

| Area | Responsibility |
| --- | --- |
| [contract/](contract) | Shared contract v2 for decisions/events, Ads state, and reference payloads |
| [engine/](engine) | Rules-based challenge selection, Ads allocation/billing, economics, reserves, receipt qualification, and risk scoring |
| [llm/](llm) | Local Qwen3 through Ollama, optional YandexGPT adapter, card validation, and template fallback |
| [eval/](eval) | Independent labels, policy simulation, offline learned RecSys, Qwen copy checks, and antifraud evaluation |

The complete flow is purchase history → computed challenge → live local Ads auction → validated
card → synthetic receipt → one-time CPA billing and promised rewards → exchange → existing crafting.
The “For X5” panel (`Для X5` in the Russian UI) displays the live local Ads ledger and compact
views of reproducible evaluations. Accounting is demonstrational and runs in one browser tab;
there is no server-owned entitlement ledger or real product fulfillment.

## What the current checks establish

On the current mutation suite, the copy checks detect 60 of 60 violations across 11 categories,
reject none of 24 legitimate variants, repair 25 invalid variants, and replace 35 with templates.
These are results for **one specific deterministic dataset**. They do not establish live LLM
agent quality, personalization relevance, fraud protection, or business impact.

Local Qwen3 1.7B generates the title of a card for an already selected challenge; the system
constructs factual fields. Errors produce a template fallback. Training on synthetic logs is
implemented in a separate offline workflow; no effect has been measured on people.
Claims about the team's use of AI must be supported by actual tools, task examples, and
verified work outputs.

All monetary values, probabilities, and effects in JSON are synthetic. A shared catalog-level
`contribution_margin_rub` does not replace SKU-level margins. `expected_liability` forecasts
expected spending; it is not a reserve for maximum obligations. Pacing changes allocation score
only. In the local auction, the winner pays its original synthetic bid after a verified event;
this ledger does not settle real payments with a brand.

## Implemented Ads and learned-policy evaluation

Runtime next-best-action selection scores the entire small catalog using rules. One placement
then runs a closed quality-adjusted first-price CPA auction: category/flight/budget/frequency/
quality/increment filters, pacing in allocation only, a `bid + subsidy` reserve before display,
and idempotent billing after `qualified + allow`. The first physical gift is not offered without
an advertiser winner; later digital challenges may be organic.

The offline learned RecSys uses the Python standard library: separate treatment/control logistic
regression models, uplift as their difference, isotonic calibration, and a separate billable-event
logistic model. Randomized synthetic logs are split deterministically. On 1,215 held-out users,
the learned profit-gated policy produced **RUB +18,665.20**, rules **RUB +13,533.60**, and fixed
dairy **RUB −6,790.60**; uplift RMSE was **0.063689** and billable AUC **0.801916**. Across five
seeds, learned results were positive and exceeded rules: **RUB +15,828.20…+19,431.60**, with a
mean of **RUB +17,763.76**.

Comparing only against one naive heuristic would overstate the model's contribution, so the
suite includes two additional policies. `rules_runtime` adapts the ordering of `Candidate.rank_key`
to offline candidates, replacing observed familiar purchase days with continuous category affinity
and using a simplified economic estimate; it does not call the runtime allocator.
`rules_profit_ranked` ranks directly by the same static economics. The comparison
separates the contributions: ranking by economics adds **RUB +3,190.00** over runtime ordering,
and calibrated uplift adds another **RUB +1,941.60**. Most of the earlier learned-versus-rules
gap therefore comes from the economic objective, rather than machine learning.

A separate offline finding: `rules_runtime` and `rules_affinity` agree across all five seeds.
Economics is sixth in the adapted lexicographic key, and continuous `category_affinity` resolves
comparisons earlier in this generator. This does not establish that economics never affects
the application's actual runtime selection.

These amounts describe synthetic evaluation cohorts, not an individual user or measured X5
impact. Production requires real randomized logs, mature labels, advertiser accounts, a protected
ledger, POS integration, and financial reconciliation. Production exchange and server-owned
reward accounting also require separate implementation.

The roadmap specifies inputs and outputs for challenge selection, promise publication, receipt
verification, both reward components, crafting, redemption, exchange, and CPA billing. Item type
IDs are separate from IDs of user-owned instances; retries and concurrent operations must not
produce duplicate grants or spending. Thresholds and financial terms absent from the source data
are explicitly marked as pre-launch parameters; missing required values prevent new promises.

The first verifiable integration is implemented: deterministic selection from a history/inventory
snapshot → synthetic receipt → guaranteed local grant of an existing item and SKU entitlement →
existing discount crafting. New and seeded profiles have distinct expected results. Real
fulfillment requires server-owned reserves, atomicity, and idempotency; changing a local
percentage or barcode must not create a discount entitlement.

Synthetic artifacts include evaluator contract v2 for the post-onboarding digital cycle,
with 40/40 acceptable decisions and 8/8 expected refusals; a three-world simulation of 1,000
users; a separate fraud challenge set; and paired comparison of four policies across five seeds.
The funded first-gift policy remained positive after fully funding the increase in outstanding
coupon liabilities: a mean of RUB 3,845.06 per 1,000-user cohort over four weeks, a range of
RUB 3,743.20–4,171.80, and positive results on 5/5 seeds at 20.40% reach. Reward-only at the
same reach produced RUB 3,436.90; the estimated RUB +408.16 contribution of the game depends on
an explicit synthetic assumption. Labels await human confirmation; these are scenario-evaluation
results, not actual X5 profit.

## Local validation

Run from the repository root:

```bash
python3 recsys/validate.py
python3 recsys/validate_explanation.py
python3 recsys/eval_creatives.py
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s recsys/engine/tests -t .
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s recsys/eval -p 'test_*.py' -v
```

The first three commands validate legacy fixtures and copy. Evaluation commands and results are
in [eval/README.md](eval/README.md); they use synthetic data, not measurements of X5 customers.

The current local PoC contract caps a coupon at RUB 10 and reserves RUB 2.50 per unspent or
promised instance. Four instances preserve RUB 10 of liability after crafting; redemption replaces
the reserve with actual savings. Physical SKUs are accounted for separately. Demo qualification
requires one paid unit from the displayed category within seven days; free lines and duplicate
receipts do not qualify, and returns undergo separate review. Real funds, stock, and POS are not connected.
