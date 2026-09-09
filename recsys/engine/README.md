# Local PoC decision engine

Selects one achievable next challenge and validates a synthetic receipt. Python standard library
only, versioned JSON on stdin/stdout, with no network services or database in the decision engine.
The contract is [`packages/contracts/src/demo-poc.ts`](../../packages/contracts/src/demo-poc.ts);
integration boundaries are in [`recsys/contract/README.md`](../contract/README.md).

## Run

```bash
python3 recsys/engine/cli.py decision < recsys/contract/examples/decision-request-empty.json
python3 recsys/engine/cli.py event    < recsys/contract/examples/event-request-qualified.json
python3 -m unittest discover -s recsys/engine/tests -t .
```

Exit codes: `0` for a contract-valid response, `2` for invalid input, and `1` for engine failure.
Both failure cases write an envelope with `{"contract_version", "request_id", "error"}` to stdout
and details to stderr. Tracebacks are never exposed in the response.

## Challenge selection

A candidate pairs a purchase condition with a missing recipe item. The request supplies an item
and recipe catalog snapshot: the engine stores no second catalog and does not calculate discounts.

Pre-display filters require a category present in purchase history, a paid SKU and an in-stock
gift SKU where required, enough hard available budget for the full maximum reserve, and expected
economics above the minimum threshold. Unfamiliar-category exploration is disabled in this PoC;
empty purchase history produces an explained refusal instead of an invented challenge.

Ranking order: selected recipe → familiar category → achievable completion → additional distinct
matches → feasibility (category recency) → expected economics → stable ID. The diagnostic `score`
is a human-readable value; the `rank_key` tuple determines the ranking.

`no_action` applies before a new challenge is displayed. An active, incomplete promise is preserved
and blocks a new challenge; an expired promise no longer blocks one and releases its reserve
on the client.

## Money and reserves

All amounts are integer kopecks. The current contract caps a coupon at 1,000 and reserves 250
per unspent or promised instance; a separate fund covers gift SKUs. The full maximum obligation
is reserved before display. Hard available budget subtracts settled spending and full outstanding
maximum obligations, rather than a probability-weighted forecast.

`expected_incremental_margin_kopecks` is a synthetic policy assumption. A positive forecast does
not establish profitability.

## Local Ads auction

The first physical gift requires a winning advertiser campaign. The closed
**quality-adjusted first-price CPA auction** compares at least two campaigns in dairy and coffee
categories. Category, flight, available budget, 14-day frequency cap, minimum quality, and expected
increment filters precede scoring; candidate checks cover risk and stock. For the first gift,
`bid + subsidy` must fully cover the physical SKU cost. The coupon fund separately backs the
digital item reserve.

The score combines expected payment adjusted for quality and billable-event probability,
synthetic incremental X5 margin, and uncovered reward cost. Pacing affects allocation score only.
The winner retains its original bid: before display, the browser ledger reserves `bid + subsidy`;
a fresh `qualified + allow` event bills them once. Replayed events do not create a second charge.
After the first cycle, runtime permits organic digital challenges. Real bidder accounts,
contracts, payment reconciliation, and a protected budget ledger are absent from the PoC.

## Policy data

| File | Contents |
| --- | --- |
| `data/policy.json` | Policy version, window, reserves, risk thresholds, and economic thresholds. Missing required parameters prevent a new promise |
| `data/sku_catalog.json` | Synthetic paid SKUs and separate gift SKUs. Alcohol, tobacco, and nicotine are excluded |
| `../catalog/campaigns.json` | Existing synthetic campaigns, read-only. RUB amounts are explicitly converted to kopecks |

The gift cost is approximately RUB 25 under the fixed arithmetic: four instances at RUB 2.50
plus a RUB 25 product total RUB 35. A category without a gift SKU returns `sku_out_of_stock`.

## Receipts and risk

Qualification requires a paid line with the specified category and SKU, sufficient quantity,
and a timestamp before the deadline. Free lines do not complete the challenge. A repeated
`receipt_id` or idempotency key returns `duplicate` without a second grant; a retry is not fraud.
Returns receive a separate decision.

Risk decisions `allow / review / hold / reject` combine explainable signals. A shared household
or device alone does not block a user: its weight is below the review threshold. Rewards can be
granted only for `qualified` and `allow`, an invariant also enforced by the contract schema.

## Cards and the LLM

The local demo's primary adapter is Qwen3 1.7B through Ollama in [`recsys/llm`](../llm). It uses
local HTTP without a Python SDK or cloud key. Vite enables the `ollama` provider automatically;
`OLLAMA_MODEL` and `OLLAMA_URL` configure the model and endpoint.

YandexGPT Lite remains an optional alternative adapter. It requires explicit `LLM_PROVIDER=yandexgpt`,
`YANDEX_API_KEY`, and `YANDEX_FOLDER_ID` settings on the server process.

The model receives an already approved decision. Deterministic validation rejects invented prices
or SKUs, changed deadlines, causal-effect claims, released holds, false urgency, hidden sponsorship,
missing next steps, and omitted rewards. Any error, timeout, invalid JSON, or missing required key
produces a valid template with `source: "fallback"`; `diagnostics.llm.error` exposes the reason.
The same fallback applies when the local model is unavailable.

The local model generates only the card title. The condition, deadline, digital and physical
rewards, and sponsorship disclosure are constructed deterministically from the approved decision.
This makes the LLM contribution visible while keeping the financial promise under system control.
