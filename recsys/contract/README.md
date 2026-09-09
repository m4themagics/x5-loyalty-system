# Local PoC contract

One shared contract connects three work areas: **purchase history → computed challenge → card →
synthetic receipt → promised rewards → existing crafting**.

The source of truth is [`packages/contracts/src/demo-poc.ts`](../../packages/contracts/src/demo-poc.ts)
(Zod, **contract v2**). Reference payloads are in [`examples/`](examples) and validated by
[`demo-poc.test.ts`](../../packages/contracts/src/demo-poc.test.ts).

## Boundaries

- The contract describes demonstrational data exchange between the webapp and `recsys/engine`; it is not a server-owned entitlement ledger.
- Fields use `snake_case` for Python interoperability and consistency with the existing `schema/action.schema.json`.
- Money uses integer kopecks. The current coupon maximum is 1,000, the instance reserve is 250, and the example demo SKU cost is 2,500.
- Login progress is webapp-only. Its ordinary rules require three distinct Moscow calendar days and at most four claims per 28 days, reserving 250 before the first displayed step. The current `DEMO_UNLIMITED_CHEST = true` demo switch bypasses the timing gate; each added item still requires its coupon reserve.
- The webapp owns browser-state migration. When the configured instance reserve increases, it tops up existing items and an unfulfilled challenge once without increasing the fund; existing coupons retain their stored maximum. The engine does not own this migration.
- Contract v2 carries a snapshot of global local Ads state: campaign budgets, reserved/settled amounts, impressions, and CPA billings. This is a browser demo ledger, not a financial or protected server ledger.
- The exchange lifecycle lives in the shared webapp snapshot and is not passed to Python decision/event operations. Repeat product goals are not yet part of this contract.
- Inventory remains quantity-based (`item_id` + `quantity`), matching the existing game module. The `issued_rewards` log, with `reward_id` and `item_instance_id`, supports one-time issuance.

## Three operations

| Operation | Input | Output |
| --- | --- | --- |
| `POST /api/demo/decision` | `demoDecisionRequestSchema` | `demoDecisionResponseSchema` |
| `POST /api/demo/event` | `demoEventRequestSchema` | `demoEventResponseSchema` |
| `POST /api/demo/title` | `demoTitleRequestSchema` | `demoTitleResponseSchema` |

A collection title describes collected items only. Validation rejects digits, money, discounts,
and promises, as well as titles longer than 28 characters or three words. Any violation,
model unavailability, or invalid JSON produces a deterministic template with `source: "fallback"`.

Transport or engine errors use `demoErrorResponseSchema` with `bad_request`, `engine_failed`,
`engine_timeout`, or `engine_invalid_output`.

Schema-enforced invariants: `status: "offer"` requires `challenge` and `card`, while `no_action`
forbids them; `grant` requires `qualification: "qualified"` and `risk.decision: "allow"`;
`billing` requires a fresh grant and is forbidden on an idempotent replay.

## Ownership

| Area | Directories | Does not modify |
| --- | --- | --- |
| Contract coordinator | `packages/contracts/src/demo-poc*.ts`, `recsys/contract/**`, `webapp/src/features/home/demo-game-snapshot.ts`, `webapp/scripts/build-demo-contract-examples.ts` | — |
| Maria: engine, economics, LLM | `recsys/engine/**`, `recsys/llm/**` | `webapp/**`, `recsys/eval/**` |
| Grigory: game integration | `webapp/**` | `recsys/**`, existing game rules |
| Artemy: independent evaluation | `recsys/eval/**` | `recsys/engine/**`, `webapp/**` |

The item catalog and discount formula live only in `webapp/src/features/home`. The engine receives
a snapshot (`game`) and computed features (`game_features`); it does not store a second catalog.

## Reference files

| File | Purpose |
| --- | --- |
| `examples/game-snapshot.json` | 24 items and 7 recipes, generated from game modules |
| `examples/profile-empty.json` | New participant with purchase history and an empty inventory |
| `examples/profile-breakfast-seeded.json` | Explicitly seeded profile with three items from the “Good Morning” (`breakfast`) recipe |
| `examples/budget.json` | RUB 10,000 coupon fund and RUB 25,000 physical reward fund |
| `examples/ads.json` | Initial global campaign budgets without impressions or charges |
| `examples/decision-request-empty.json`, `examples/decision-request-seeded.json` | Complete generated requests |
| `examples/decision-response-offer.json`, `examples/decision-response-no-action.json` | Engine response shapes with synthetic values |
| `examples/event-request-qualified.json` | Synthetic receipt with a paid line and a free line |
| `examples/event-response-granted.json`, `examples/event-response-duplicate.json` | Grant with one-time Ads billing, and idempotent replay without a second charge |

Responses illustrate payload shapes; they are not expected engine outputs. Labels in
`recsys/eval/` define expected decisions.

## Validation

```bash
bun run test:contracts
bun webapp/scripts/build-demo-contract-examples.ts --check
python3 recsys/validate.py
python3 recsys/validate_explanation.py
python3 recsys/eval_creatives.py
```

`--check` fails if the item catalog or recipes changed without regenerating the reference.
To regenerate, run the same script without the flag.
