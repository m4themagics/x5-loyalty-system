# Contracts

`@pyaterochka-game-demo/contracts` defines the shared wire contract between the webapp and
the local Python engine. The TypeScript client and Vite middleware import its Zod schemas.
Python consumes and produces the corresponding versioned JSON; it does not import Zod.
The middleware validates requests before invoking Python and validates engine responses
before returning them to the client.

## Modules

| Module | Scope |
| --- | --- |
| `src/demo-poc.ts` | Contract v2: profiles, decisions, events, Ads snapshots, funds and limits |
| `src/demo-trade.ts` | Item exchanges between local synthetic profiles |
| `src/demo-evaluation.ts` | Policy comparison response for the X5 evaluation panel |

All modules are exported from `src/index.ts`. Exchange state remains local to the webapp;
the trade schema does not imply a Python trading service or a protected server ledger.

## Stack

TypeScript and Zod. Zod is the package's only runtime dependency.

## Checks

```bash
bun run --cwd packages/contracts typecheck
bun run --cwd packages/contracts test
```

## Contract changes

Update the contract in one coordinated change: the Zod schemas here, reference payloads in
`recsys/contract/examples/`, the Python engine in `recsys/engine/` and the webapp must agree.
Changing only one side can break request or response validation.

Money is represented as integer kopecks. Current demo constants reserve 250 kopecks
(RUB 2.50) per item instance and cap each new coupon at 1,000 kopecks (RUB 10).
This package owns validation, normalization, shared constants and types; decision and
gameplay behavior belongs to the consuming modules.

After changing a schema, check both sides together: package tests, engine tests
(`python3 -m unittest discover -s recsys/engine/tests -t .`) and webapp tests.
See the [wire contract documentation](../../recsys/contract/README.md) for reference examples
and boundary checks.

## Library documentation

Consult the official documentation for library behavior:

- [Zod](https://zod.dev/)
- [TypeScript](https://www.typescriptlang.org/docs/)
