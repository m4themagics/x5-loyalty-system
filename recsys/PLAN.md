# RecSys, Ads, economics, and antifraud roadmap

Area owned by @m4themagics. The canonical product is defined in the
[project description](../docs/project/project-description.md); team sequencing is in the
[shared plan](../docs/project/plan.md). Current artifacts and validation commands are in
[README.md](README.md).

**Status:** the local PoC implements a rules-based next-challenge engine, event qualification,
Qwen/template cards, a quality-adjusted first-price CPA auction with a browser ledger,
audience and policy simulators, an offline learned RecSys, a simple fraud scorer, and item
exchange. Production fulfillment, a protected server ledger, real bidder accounts, and training
on X5 logs are not implemented. The sections below distinguish the working PoC from the next
production stage.

This roadmap defines product rules and module boundaries sufficient for separate team tasks.
Numerical thresholds absent from the agreed product decision are marked as **pre-launch
parameters**. They must be set in a policy version from data and budgets, rather than invented
when a challenge is issued. A missing required parameter prevents a promise.

## 1. What is personalized

Preserve the team's existing game: **reward box → digital item → inventory → four items → a
crafted discount**. RecSys selects one achievable next action that helps the user complete a
relevant recipe and is expected to create incremental purchase value.

Target cycle:

1. Select one challenge and useful item from purchase history, visit cadence, and inventory.
2. Check constraints, stock, risk, and economics; reserve the obligations.
3. Display the exact challenge, deadline, and reward. The first eligible challenge promises
   a free physical product and a digital item.
4. Verify the qualifying event and grant each promised reward once.
5. The user collects items, exchanges duplicates, and spends four instances on an ordinary
   discount or a specific free SKU under an active, funded recipe goal.

A displayed promise cannot be replaced with a random drop. The free product is guaranteed after
completion and verification of an already displayed, eligible first challenge; opening the app
does not itself create that promise. The first challenge can be completed in one ordinary
eligible purchase day. It does not require several purchase days or a large mandatory basket.
The personalized completion window is fixed before the promise; seven days is not a universal
limit. A review hold has a clear status and resolution deadline: verified completion preserves
the right to the promised reward.

In repeat cycles, a specific free product becomes the visible goal of a funded recipe. Four
instances produce one result: an ordinary discount or the promised SKU. Stock, frequency, and
funding are checked before the promise; a product is not granted for every challenge.
`no_action` applies before a new promise and does not cancel existing grants or reservations.

A new user starts with an empty inventory. The first challenge grants one useful digital item
and a free physical product; it does not promise four items or an immediately craftable discount.
The first physical product has value on its own. A short recipe-completion demo uses a separate,
explicitly seeded profile with three previously granted items. That is a different starting
scenario, not an undisclosed gift to every newcomer.

## 2. Candidates and data

**The task is next-best-action recommendation.** A candidate combines an eligible challenge,
completion window, missing recipe item, reward package, and possible funding source. The small
catalog is scored in full; two-tower or neural retrieval is unnecessary at this scale.

| Group | Required features / data | Purpose |
| --- | --- | --- |
| Purchases | Categories, recency and number of purchase days, intervals between visits | Select a familiar action and an achievable window |
| Game | Inventory, duplicates, missing items, nearby recipes | Provide clear progress toward a desired discount |
| SKU | Procurement cost, price, margin after ordinary promotions but before the new game discount, stock, permitted product class | Check full reward cost and availability |
| Campaign | Event bid, separate product subsidy, flight, budget, frequency cap | Admit a sponsor and calculate funding |
| Risk | Receipt uniqueness, velocity, returns, account and exchange links | Allow, review, hold, or reject |
| Decision context | Date, policy version, available candidates, experimental assignment | Reproduce the selection and evaluate it correctly |

No purchase history in a category means uncertainty. Bounded exploration of a new category is
permitted when it is related to familiar categories, has positive expected economics, and belongs
to a safe product class. This does not establish interest or future habit formation.

Alcohol, tobacco, nicotine, and other sensitive categories are excluded from the PoC. Future
consideration requires a separate legal assessment, age verification, and responsible-promotion
policy; it is outside this implementation plan.

The game catalog stays in the existing game modules. Integration uses its identifiers and
recipe rules; `recsys` must not create a second independent item catalog.

### 2.1. Connecting candidates to the existing game

Items come from [profile-items.ts](../webapp/src/features/home/profile-items.ts); recipes and
calculations come from
[profile-discount-crafting.ts](../webapp/src/features/home/profile-discount-crafting.ts).
The current catalog contains 24 items, rarities `common` / `epic` / `legendary`, and seven
`recipeId` values: `breakfast`, `fresh`, `movie`, `asian`, `chef`, `dessert`, and `pantry`.
Full membership and rules are in the [item catalog](../docs/project/item-pool.md).

A recipe earns its bonus from distinct matching `itemId` values, while the four slots require
four available instances: two copies of one item occupy two slots but provide one thematic match.
Features therefore include both instance counts and distinct matches. A digital item's category
is a game label; it does not itself define which physical SKUs qualify for a discount. The future
coupon's eligible assortment is defined separately before a promise is shown.

For a large inventory, calculate achievable outcomes over valid combinations of **four** instances
using the same preview rules, rather than aggregating every inventory match into one discount.
Reserved and held instances are excluded. With fewer than four available instances, show set
progress rather than the percentage of an already available coupon.

A future candidate record must include:

| Candidate block | Fields / rule |
| --- | --- |
| Reproducibility | `candidate_id`, `policy_version`, game catalog version, and timestamps of history/inventory/stock snapshots; these are proposed future fields |
| Action | Eligible purchase predicate, allowed categories/SKUs, number of distinct purchase days, and completion window; the first challenge requires only one day |
| Game goal | Existing `recipeId`, existing promised `itemId`, quantity 1, catalog rarity, current distinct matches, and progress after the grant |
| First reward | Exact physical `sku_id`, quantity 1, fulfillment terms, cost, stock, and confirmed funding source, alongside the digital item |
| Later reward | A digital item for the selected goal; a separate specific SKU for a recipe if funded before display, or an ordinary discount. A goal is not a gift for every challenge |
| Economics | Horizon, source of each margin estimate, expected cost, maximum obligations, and owning budgets |
| Sponsor | No sponsor, or compatible campaigns with original bids, separate subsidies, and contractual events |
| Eligibility | Relevance, feasibility, risk, stock, frequency constraints, and exclusion reasons |

RecSys recommends a useful next item and recipe, but the user still chooses the four items for
a discount. Choosing a goal must not require buying every category represented in the recipe.
A future adapter exports one versioned game catalog for Python and the server; discount rules
retain a single owner and are checked against the same examples at the integration boundary.

**Demo qualification:** before display, fix the eligible SKUs or category, minimum number of paid
units, and deadline. The synthetic example requires one paid unit from the specified category
within seven days of display. Free lines, duplicate receipts/events, and other categories do not
qualify. A purchase day counts once; a return goes to separate review. Economic eligibility does
not follow automatically from receipt total or challenge completion. These requirements describe
the challenge contract, not new fields in the legacy allocator JSON schema.

### 2.2. A specific product as a repeat-cycle goal

One active personal goal binds an existing `recipeId` to a specific SKU/package, quantity,
completion deadline, collection location/window, terms version, and full reserve. Names such as
`goal_id`, `goal_snapshot`, and `result_kind` below belong to a future contract, not the current
schema. RecSys recommends an available goal and an achievable next action toward the selected
result; reranking cannot change an existing promise. Missing-item counts and feasibility account
for owned instances and eligible exchanges, rather than assumed new visits.

Completion requires four available instances for which the existing algorithm selects the target
thematic recipe with a bonus. Three distinct matches may produce a thematic recipe; four identical
instances do not. For `breakfast`, the toaster, pitcher, travel mug, and pan can yield the ordinary
8% discount or the promised product under an active goal. The four instances are spent only once;
they cannot produce both a coupon and a product. The first challenge gift is a separate grant
without spending four items; simultaneous promises require two physical reserves.

Funding and stock are verified before displaying the specific promise. A goal is not funded by
a hypothetical future auction win. Ads remains one challenge placement; collecting a gift does
not itself become a second CPA event. Predicting free-product collection does not replace
estimating incremental subsequent paid purchases.

## 3. Runtime baseline and offline learned policy

### Current baseline and the stage before experimental logs

Start with a rules-based baseline: a familiar category, a window matching purchase cadence, an
item needed for a recipe, eligible economics, and satisfied limits. Rules return explanations
and refusal reasons. Effect estimates at this stage are explicit simulation assumptions.

The reproducible initial policy follows this sequence:

1. Generate all pairs of eligible actions and useful items from the existing catalog, applying
   first/subsequent-cycle constraints. With incomplete history, use a strong fixed challenge
   in an available safe category or `no_action`.
2. Exclude unavailable SKUs, prohibited classes, exceeded limits, `hold`/`reject` risk, infeasible
   windows, and unfunded promises. Do not promise a new financial outcome while additional review
   is pending. Existing displayed challenges follow their own lifecycle.
3. Check relevance and feasibility thresholds, positive conservative economics, and minimum
   expected increment for Ads. Thresholds, allowed visit intervals, the bounded-exploration share,
   and the economic horizon are pre-launch parameters.
4. Sort remaining candidates lexicographically: explicit user-selected recipe; familiar before
   exploratory category; achievable thematic bonus after the grant; additional distinct matches;
   fewer required purchase days; higher conservative expected margin; stable `candidate_id`.
   Without a selected recipe, the first feature is equal for all candidates. New users receive
   no artificial “almost complete” bonus.
5. Save all admitted/rejected candidates and reasons. Identical input snapshots and policy versions
   produce identical results. `action_given_serve` is 1 for the selected deterministic action;
   randomized exploration requires separate logging.

This is an ordering of rules, not a learned interest probability. The 70% labeled-profile
relevance check assesses selected actions; it does not establish uplift prediction quality.

**Seeded-profile example:** inventory contains one each of `club-toaster`, `milk-pitcher`, and
`travel-mug`; the user selects `breakfast` and buys familiar breakfast categories. A candidate
promising `breakfast-pan` adds a fourth distinct match. After the grant, the user can craft from
four common items: 4 rarity points → 5% base + 3 percentage points of thematic bonus = 8%.
A `snack-bowl` candidate does not complete this recipe and ranks lower, other factors equal.
If the first candidate lacks stock, budget, or eligible economics, it is excluded before ranking:
recipe progress cannot bypass a financial restriction.

For a new user, the same `breakfast-pan` grants one item, not an 8% discount. Demo inventory
seeding and earned grants have distinct sources; seeding is not a purchase, advertising event,
or training observation.

The product Q&A permits a product without ML. A reproducible flow and sound evaluation matter
more for the demo than a model name. The team's AI use must be supported by actual development
and research examples; describe an offline model as offline, not production serving.

### Implemented offline workflow and the path to real logs

The PoC implements a reproducible Python standard-library version on randomized synthetic logs;
NumPy and scikit-learn are not required. It reflects the proposed production contract but does
not serve runtime or replace experimental X5 data.

- Two separate `LogisticRegression` models estimate the probability of a qualifying purchase
  day with and without the displayed challenge: a T-learner.
- Their probability difference estimates the challenge's incremental effect.
- `IsotonicRegression` calibrates prediction differences on a separate calibration split.
  With limited data, retain the simpler baseline; calibration does not create evidence.
- A separate `LogisticRegression` estimates the probability of a verified advertising event.
  It does not replace the incremental-visit model: the campaign contract defines billing.

Models compute these quantities in the offline artifact; legacy allocator JSON still stores some
values manually. Production serving requires a shared versioned feature/model contract.

Models use comparable pre-decision features. Post-assignment purchases, prize collection, and
future inventory must not enter model inputs. The production data split must separate users and
time, with distinct training, calibration, and final evaluation sets and mature conversion windows.

One binary treatment supports evaluating one specified challenge type. Comparing multiple action
types requires corresponding randomized assignments and candidate coverage: a single model pair
trained on a mixture of incomparable challenges cannot be called a causal ranker for each action.

Assess probabilities with reliability curves and Brier scores. Assess effects separately: within
predicted-uplift bins, compare observed rate differences between randomized groups. Well-calibrated
component probabilities do not themselves establish accurate individual uplift. Initially, use
repeat paid category purchases as an outcome metric; a separate prediction model is optional.

One training row represents an opportunity to assign a specified action: a pre-decision snapshot,
experiment assignment ID, assigned variant, actual display, and outcome over a predefined window.
Control uses the same definition of a qualifying purchase day even without a displayed challenge.
Keep everyone assigned when estimating assignment effects; treatment labels must not include only
people who accepted or completed a challenge. Repeated opportunities for one person are dependent;
control for one action must not silently include another incentivized challenge.

The `p_billable` label is a finally verified contractual event after deduplication and returns.
It predicts billability, not incremental purchase probability: someone may be likely to buy the
brand without display. Purchase history without assignment/display logs can supply features,
but cannot train the causal effect of these challenges.

## 4. One placement and a first-price CPA auction

**A bounded local version of the closed quality-adjusted first-price CPA auction is implemented.**
Brands submit bids for a predefined verified event. Each user receives one suitable challenge
and at most one sponsor.

RecSys produces eligible actions and an organic selection under section 3. Ads evaluates
eligible-action/compatible-campaign pairs and may choose a different pair only within the same
user, financial, and risk constraints. The winner determines the single displayed challenge.
With `no_fill`, the first cycle returns `no_action` because its physical gift needs a sponsor;
an organic alternative is available in subsequent digital cycles. No second parallel slot or
competing promise is created.

1. Filter campaigns by challenge relevance, SKU stock, permitted product class, frequency cap,
   risk, flight, budgets, and minimum expected increment.
2. Require positive expected economics without an artificial pacing contribution.
3. Score remaining campaigns by expected brand payment, incremental X5 margin, uncovered reward
   costs, and budget pacing.
4. Fix the winner, original bid, billable event, and reserves before display.
5. After a verified qualifying event, charge **the winner's own bid** once. An impression, box
   opening, or unverified receipt is not itself billable.
6. In the first cycle, return `no_action` without displaying a physical gift if no advertiser
   wins; after the first gift, an organic digital challenge is allowed. If no useful challenge
   has eligible economics, return `no_action`.

Simplified form of local ranking:

```text
expected brand payment = probability of a verified event × original bid

priority = pacing × expected brand payment
         + expected incremental X5 margin
         − uncovered reward cost
         − expected discount cost
         − expected fraud losses
         − operating costs
```

Pacing controls campaign priority, does not change the contractual price, and does not make an
unprofitable candidate profitable. The economics gate uses monetary values without pacing.
Advertisers supply `bid_per_qualified_visit`; a model does not predict their bids.
The existing `effective_bid` belongs to legacy scenarios and must not become the first-price
billing amount.

Campaign terms fix the qualifying event, such as a verified distinct purchase day satisfying the
challenge. Free SKU fulfillment and the brand's billable event are recorded separately even when
they belong to the same journey. Returns and cancellations follow a predefined final-verification
and adjustment rule.

### 4.1. Exactly what is billed

Before launch, each campaign fixes its event type (distinct purchase day or specified brand/SKU
purchase), eligible stores and products, attribution window from challenge display, purchase-day
time zone, return-exclusion rule, final-verification deadline, and bid. The first contract permits
at most one CPA charge per issued challenge. A free reward does not count as a paid brand purchase;
multiple receipts in one day do not create multiple purchase days. The window, review deadline,
and time zone are pre-launch parameters.

An event links `campaign_id`, `challenge_id`, canonical `receipt_id`, and the qualifying condition.
The first eligible verified purchase fulfills the obligation; one receipt cannot fulfill another
assignment of the same event again. Message redelivery returns the existing result. Billing uses
the original bid even if ranking used calibrated probabilities, pacing, or a higher margin estimate.

After a return, recompute qualification from remaining receipt lines. If the condition still
holds, a partial return does not cancel the CPA event. If it no longer holds before final
verification, cancel the pending charge and release the CPA reserve. After settlement, create
a separate one-time credit adjustment for the original amount. Replayed returns do not refund
twice. Do not rewrite the ledger or original charge. Product subsidy terms and already earned user
rewards are handled separately; an advertising-payment adjustment does not automatically cancel
a reward.

Spending includes actual settlements and full outstanding reserves; target pace follows the
campaign flight and schedule. The pacing function, multiplier bounds, and release rule for
adjusted budget are pre-launch parameters. Ties use stable `campaign_id`, then `candidate_id`.

Four policies—highest-bid, quality-adjusted, profit-aware, and incrementality-gated—are planned
for a separate research comparison in the GitHub project. They are not required demo scope.
A first-price design alone does not establish robustness to strategic bidding: PoC advertisers
are synthetic, and market behavior has not been studied.

| Future comparison policy | Distinguishing selection rule |
| --- | --- |
| Highest-bid | Highest original bid among eligible advertising candidates |
| Quality-adjusted | Highest expected payment: calibrated event probability × bid, with identical pacing for the comparison |
| Profit-aware | Rank by monetary contribution including margin and costs; positive expected economics is required |
| Incrementality-gated | Profit-aware with an additional expected-increment threshold; the most constrained target policy |

All runs share data and hard stock, safety, relevance, frequency, risk, and maximum-reserve
constraints. Explicitly label research baselines that omit an economic or incrementality gate;
such ablations are allowed only in simulation. Compare margin after costs as well as revenue,
incremental purchase days, budget spending, `no_fill`/`no_action`, invalid-decision rates, and
maximum obligations.

## 5. Funding, SKU margin, and obligations

Two parallel hypotheses:

| Source | Eligibility condition |
| --- | --- |
| Brand | Funds the product separately and may participate in the CPA auction; subsidy and bid are distinct obligations |
| X5 | Funds the product when conservative incremental margin after all costs is positive and the full reserve is available |

Current PoC runtime uses a conservative demonstration boundary: the first physical gift requires
a winning advertiser campaign. X5 funding remains a future-pilot hypothesis pending actual
SKU margins.

The absence of a sponsor does not itself make an X5-funded free product available. Organic
challenges undergo the same reward, risk, and budget checks.

```text
expected incremental margin from subsequent visits
+ expected margin from later paid repeat purchases
+ expected advertising revenue
+ supplier subsidy
− cost of the free product to X5
− expected future discount cost
− expected fraud losses
− operating costs
> 0
```

Include repeat-purchase margin separately only when those sales are not already included in
subsequent-visit margin. Measure margin after ordinary promotions but before the new game discount;
if the game discount is already included, do not subtract it again. Similarly, account for a
subsidy either as a separate positive term against full product cost or through uncovered product
cost, never both. Count each component once for a given horizon and sale.

The reward's retail price is not X5's cost. Use the specific SKU cost, actual paid-purchase margin,
subsidy, stock, and redemption probabilities. The shared synthetic margin in the current catalog
is a legacy-example parameter and is insufficient for this contract.

Expected profit and maximum permitted spending are separate checks:

```text
available budget = total budget
                 − settled spending
                 − full maximum cost of outstanding obligations
```

Before display, reserve the full maximum cost of the promised physical product and associated
future discount. A percentage discount requires advance limits on basket amount, number of
redemptions, and maximum RUB cost; without a finite upper bound, a full reserve cannot be computed.
The local PoC enforces fixed demo limits in a browser snapshot; a protected backend must enforce
real limits and funds.

A digital item can also create an obligation through a future recipe. Its reserve follows the
items or crafted discount and transfers between states during crafting without double spending
or double counting. Same-rarity exchange does not guarantee equal cost: a new combination can
unlock a more expensive recipe or increase redemption probability.

Reserve CPA separately at the maximum charge for each outstanding campaign promise: the original
bid for one allowed event. Product funding has its own subsidy-budget maximum. The same RUB cannot
be promised simultaneously in two budgets. A reserve becomes actual spending or is released when
the obligation closes; challenge expiry does not remove an already earned reward.

`expected_liability` in legacy fixtures is a probability-weighted forecast. Subtracting it does
not enforce a hard overspending limit. Contract v2 and the browser store demonstrate full reserves,
but real overspending protection requires server-owned accounting and atomic budget checks.

Positive synthetic results establish rule compliance under chosen assumptions only. Actual
profitability requires X5 data and subsequent-purchase evaluation. An unconfirmed subsidy cannot
serve as a funded cash reserve.

### 5.1. Transferring liability from items to a coupon

The current PoC uses one coupon fund and a uniform **RUB 10** coupon maximum. Every unspent or
promised-but-unissued digital instance is backed by **RUB 2.50**. A promise and its fulfilled
instance are one position; reserving an instance for exchange does not remove it from the count.
Issuing a promised instance does not create a second reserve.

N such instances can create at most ⌊N / 4⌋ coupons, so 2.50 × N covers their maximum liability
of 10 × ⌊N / 4⌋. The full coupon reserve is 2.50 × N plus the fixed maxima of all issued,
unredeemed coupons. Instances spent on those coupons are no longer included in N. The current
`DEMO_UNLIMITED_CHEST` switch bypasses the demo's box timing restriction, but every added instance
still requires a funded coupon reserve.

Crafting atomically replaces four RUB 2.50 reserves with one RUB 10 coupon reserve; it releases
no additional funds. Redemption settles the amount actually used and releases the remainder.
Valid coupon expiry releases its reserve. Challenge expiry neither burns earned items nor cancels
other active entitlements.

Exchange preserves instance count and the pooled reserve, with provenance following the instance.
Changed redemption probabilities require expected-economics and risk checks. This proof applies
to one shared coupon fund with a uniform cap; brand CPA and subsidy budgets are not interchangeable.
Raising the limit requires additional funding for existing rights. Real values and terms must be
agreed with X5 before a pilot; local runtime uses fixed demo values, and the legacy allocator
schema does not change their meaning.

The target server must preserve an existing unused coupon: another coupon remains unavailable
until redemption or disclosed expiry. The current local `craftDemoDiscount` already refuses
crafting while `active_coupon` is present; production must enforce this with server-owned rights.

### 5.2. Reserving and completing a product goal

An active goal's full SKU reserve is separate from digital-instance coupon reserves. It is required
before display, even when the recipe is incomplete. If the user chooses the product result, the
server atomically consumes four instances, releases their coupon reserves, and transfers the goal
reserve to one SKU entitlement. Synthetic example: four instances backed by RUB 2.50 each plus
a SKU costing RUB 25 total RUB 35; product completion releases RUB 10 and retains RUB 25 for
fulfillment. Reserves are not additional costs in margin calculations.

Ordinary crafting retains the “four reserves → one coupon” transition. It does not automatically
cancel an active product goal: the goal reserve remains until fulfillment, explicit user refusal,
or the displayed expiry. An existing coupon blocks only another coupon, not a separate product
grant. Closing one goal does not cancel separate rewards already promised by challenges.

Evaluate economics across the remaining journey, including possible new grants, exchange, the
first gift, and other outstanding obligations. Do not attribute one paid repeat to multiple goals
or invent incremental visits for already collected or exchanged items. The earlier first-offer
table does not include an additional SKU for a repeat goal.

Expected cost distinguishes alternatives: one set cannot yield both a coupon and a product.
A coupon and a later product earned with new instances are separate costs; the same margin cannot
fund both on paper.

**Reserve and horizon:** the first RUB 25 product plus one promised item require RUB 27.50.
Three previously funded instances add RUB 7.50, totaling RUB 35. The expected RUB 5 future-discount
cost in scenario economics covers the entire path to one coupon; it is not the current reserve
for a single instance. Further grants that have not yet been promised are admitted and funded
later; do not attribute the journey's margin and discount to every challenge again.

**Scale:** RUB 35,000 can back at most 1,000 simultaneous RUB 35 offers before other costs and
obligations, provided the budget includes a funded RUB 10,000 coupon portion and RUB 25,000
physical portion. A shortfall in either fund blocks new promises. This is a synthetic example,
not a commitment to reward the entire audience. Existing displayed promises remain valid.
