# Documentation

The portfolio overview, technical guides and implementation status are available in English.
The application, screenshots, original product specifications and submitted case materials
retain their original Russian language.

## English technical documentation

| Document | Scope |
| --- | --- |
| [Root README](../README.md) | RecSys/Ads portfolio overview, local setup and demo walkthrough |
| [Implementation status](project/poc-status.md) | Implemented behavior, validation scope, synthetic results and remaining work |
| [Webapp](../webapp/README.md) | Browser demo, checks and runtime boundaries |
| [TypeScript contracts](../packages/contracts/README.md) | Shared Zod schemas and coordinated contract changes |
| [Decision system overview](../recsys/README.md) | Engine, evaluation and the evidence each check provides |
| [Wire contract](../recsys/contract/README.md) | Versioned JSON exchange between the webapp and Python |
| [Decision engine](../recsys/engine/README.md) | Challenge selection, CPA ad auction and reward economics |
| [Evaluation](../recsys/eval/README.md) | Relevance, policy simulations and the offline learned recommender |

## Original product specifications (Russian)

These documents preserve the team's full product specification and source case. They describe
both the implemented local PoC and target behavior. Use the English [implementation status](project/poc-status.md)
and current code to distinguish shipped demo behavior from future requirements.

| Document | Scope |
| --- | --- |
| [project-description.md](project/project-description.md) | Complete product design: mechanics, economics and PoC boundaries |
| [item-pool.md](project/item-pool.md) | Catalog of 24 items, rarities and exact membership of seven recipes |
| [product-materials.md](project/product-materials.md) | Customer and operator scenarios |
| [case-brief.md](project/case-brief.md) | Original case brief, preserved verbatim |
| [plan.md](project/plan.md) | Team responsibilities and acceptance criteria |
| [context-pack.md](project/context-pack.md) | Working product context |

## Archived submission (Russian)

The submitted materials are preserved in `submission/` and are not maintained alongside the code:

- [presentation.pdf](submission/presentation.pdf): presentation slides.
- [product-materials.pdf](submission/product-materials.pdf): product materials.
- [project-description-final.md](submission/project-description-final.md): submitted project description.

## Setup and checks

Installation and local setup are documented in the [root README](../README.md). Run the
combined type, lint, unit, engine, evaluation and RecSys validation checks with:

```bash
bun run check
```

Build and browser acceptance are separate commands:

```bash
bun run build
bun run e2e:demo
```

## Documentation images

Screenshots and animations in `assets/screenshots/` are captured from the running app with
`bun run docs:shots`. The capture code in `webapp/scripts/docs-shots/` uses shared E2E selectors.
Regenerate these assets after visible screen changes.

Mascot source images live in `assets/mascot-source/`: four poses and two cosmetic overlays.
The application layers built from these sources live in `webapp/public/assets/character/`.
