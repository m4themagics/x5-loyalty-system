# X5 Checkpoint Webapp

The repository's only user interface is a mobile browser demo built with React 19, TypeScript and Vite. It connects a collectible loyalty game to a local next-best-action recommender and CPA ad auction. The application and screenshots retain the original Russian interface used for the X5 case.

## Demo features

- A recreation of the Pyaterochka app home screen with a profile entry point.
- A profile with a mascot, level, private savings, reward box and three tabs.
- Two wearable items: a baker's apron and a chef's knife.
- Random box rewards and personal challenge rewards in one local inventory.
- Four crafting slots, seven recipes and an active demo coupon with a barcode.
- A personal challenge, static weekly tasks, collection titles and a friends ranking based on completed sets and collected items.
- Local item trading between synthetic profiles.
- A demo control panel for synthetic receipts and an X5 evaluation panel.

Box rewards and challenge rewards contribute to the same collection and discount crafting. Profiles, inventory, mascot outfits, coupons and event records persist only in the browser.

The current demo allows repeated box opening without waiting for login days, subject to the shared coupon fund. The three-day login counter and four-claims-per-28-days rules remain in the code, but box eligibility is bypassed by `DEMO_UNLIMITED_CHEST`. Each new item still reserves RUB 2.50; crafting four items transfers their reserves to one coupon capped at RUB 10. These are demo settings.

## Run locally

From the repository root:

```bash
bun install --frozen-lockfile
bun --bun run --cwd webapp dev
```

The app is usually available at [localhost:5173](http://localhost:5173). Python 3 is required for the local decision engine. Personalization APIs are available only through the Vite development middleware; `vite preview` serves the static build without these APIs. If Ollama/Qwen is unavailable or returns invalid copy, the engine uses a validated card template.

## Checks

```bash
bun run --cwd webapp test
bun run --cwd webapp typecheck
bun run --cwd webapp lint
bun run --cwd webapp build
bun run --cwd webapp e2e:demo
```

The browser suite covers the challenge-to-collection-to-discount journey, Ads allocation and billing, trading, the friends tab, collection-title loading failures and retries. See the [implementation status](../docs/project/poc-status.md) for validation scope.

## Technical boundaries

- State lives in `localStorage` and can be edited manually.
- There is no authentication, role system, administration panel, separate public website, production backend or database.
- There is no cross-device synchronization or production API.
- EAN-13 barcodes are generated locally and are not registered with a point-of-sale system.
- Profiles, receipts, products and advertising campaigns are synthetic.
- Vite middleware invokes Python with fixed arguments and exchanges versioned JSON under contract v2.
- The learned recommender is evaluated offline; runtime decisions use rules.

See the [root README](../README.md) for the project overview and demo walkthrough.
