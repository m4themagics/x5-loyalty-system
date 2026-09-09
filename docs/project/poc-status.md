# Local PoC: Implementation Status

**Code review date: September 9, 2026.** Current code and executable checks take precedence
over this document. The application and original product specifications remain in Russian.

## Integrated demo

The prototype connects three paths in one local browser session:

1. **Reward box:** box → random item → shared collection.
2. **Personal challenge:** synthetic purchase history → rule-based next-best-action selection → local CPA ad auction → Qwen or template card → synthetic receipt → reward reveal, recorded obligations and an item in the same collection.
3. **Crafting:** four collected items → demo discount → EAN-13 barcode and local coupon redemption.

Box rewards and challenge rewards share one inventory and the same crafting rules. Each item
instance reserves RUB 2.50 in a common coupon fund. Crafting transfers four item reserves to
one coupon capped at RUB 10. Physical reward reserves and advertiser budgets are separate.
These values reflect the current contract and engine policy; older product materials may
describe different target settings.

The current build enables `DEMO_UNLIMITED_CHEST`, allowing repeated box opening without waiting
for login days while retaining the item funding requirement. The three-distinct-Moscow-days
counter and four-claims-per-28-days rules remain in the code, but do not restrict opening in
this demo mode. In the time-gated flow, missed days preserve progress and the first counted
visit reserves an item before showing progress.

## Implemented behavior

### Game profile

- Home and profile screens support mobile widths.
- The profile header shows the mascot, level, private savings, trading and active discount across tabs.
- The mascot blinks, reacts to rewards and can wear an owned baker's apron or chef's knife; cosmetics do not change the discount.
- A screen gesture opens the reward box.
- The catalog contains 24 items, split evenly across three rarities; rarity probabilities are 70% / 25% / 5%.
- Copies accumulate in local inventory, and item cards display rarity and a category clue.
- Four items create a discount using seven recipes; the four instances are consumed and one active discount is saved in the browser.
- Barcodes have an EAN-13 structure but are not registered with a point-of-sale system.
- Weekly tasks are static and are not linked to real purchases.

### RecSys, Ads and reward lifecycle

- Vite development middleware invokes the Python engine using contract v2.
- Runtime RecSys scores the full small candidate catalog with rules; there is no retrieval model or learned model serving.
- The first physical gift requires an eligible advertiser-funded campaign and full reward reserves before display.
- A local quality-adjusted first-price CPA auction checks category, campaign dates, budget, frequency, quality, expected increment and reward funding.
- A qualifying synthetic receipt creates a digital reward, a local SKU entitlement and one CPA charge.
- Free receipt lines, returns, late receipts and repeated events do not create a new qualifying reward grant.
- Qwen3 1.7B proposes card headings and collection titles; task terms remain deterministic, and invalid or unavailable model output falls back to a validated template.
- The X5 evaluation panel displays the decision, funding and synthetic evaluation results.
- The learned recommender is implemented and evaluated separately offline.

### Social mechanics

- Local trading works between seeded synthetic profiles.
- Available digital items of the same rarity can be exchanged 1:1.
- Offers expire after 24 hours; each participant needs two verified purchase days and is limited to three completed exchanges in seven days.
- QR codes and a second-phone connection are demonstrations only.
- Referral calculations and a friends ranking by collected sets and items operate on synthetic state. The seeded Anya-to-Boris referral appears on the friends screen; no real invitation is sent.
- Qwen generates collection titles through `/api/demo/title`. Validation rejects digits, money and promises, using a deterministic template when needed.

## Validation

The repository includes shared-contract, webapp, Python engine and analytical tests, plus a
Playwright demo suite. Relevant browser scenarios cover the integrated reward lifecycle,
Ads, trading, collection titles and recovery after a title-loading error.

On September 9, 2026, `bun run check` passed: **249 tests** (11 contract, 111 webapp,
86 engine and 41 evaluation), plus type checking, linting and all three RecSys/LLM validators.
Playwright was not rerun for this documentation update.

Run the checks from the repository root:

```bash
bun run test
bun run test:engine
bun run test:eval
bun run validate:recsys
bun run typecheck
bun run lint
bun run build
bun run e2e:demo
```

`bun run check` combines type checking, linting, unit tests, engine and evaluation tests, and
the three RecSys/LLM validators. Build and Playwright acceptance are separate.
Passing these checks demonstrates local implementation behavior; it does not establish real
fulfillment, production security or measured customer outcomes.

## Saved synthetic evaluation results

The independent relevance evaluator checks the post-onboarding digital cycle: **40/40**
eligible profiles receive an accepted item from a familiar category, and **8/8** refusal
profiles return the expected reason. The rubric is an unreviewed `agent_draft`; it does not
establish that a customer finds the complete challenge useful.

The saved [policy simulation](../../recsys/eval/results/policy-comparison.json) reports a mean
**+RUB 3,845.06** after reserving the increase in outstanding maximum coupon liability, for
1,000 synthetic users over four weeks. All five simulated seeds are positive. In the separate
[offline learned-policy evaluation](../../recsys/eval/results/learned-recsys.json), the learned
policy returns **+RUB 18,665.20**, compared with **+RUB 16,723.60** for rules ranked by expected
profit and **+RUB 13,533.60** for the runtime rule ordering, on the same 1,215-user held-out cohort.

These are saved implementation experiments under synthetic assumptions. They are not measured
X5 uplift, actual profit or user-research findings. The four-week simulation and offline
held-out evaluation use different populations and outcome generators, so their absolute
totals cannot be compared directly. See the [evaluation guide](../../recsys/eval/README.md)
for assumptions, baselines and reproduction commands.

## Not implemented

- Actual delivery of a free physical product.
- Point-of-sale discount registration and redemption.
- A production backend, database, authentication or protected entitlement ledger.
- Cross-device synchronization.
- Real advertiser accounts, budgets, contracts or financial reconciliation.
- Training on actual X5 logs.
- User research or a causal A/B test with customers.
- A real QR connection between trading participants.
- Repeat physical SKU goals and their stock/reserve lifecycle.

The complete target product specification is preserved in the original Russian
[project description](project-description.md).
