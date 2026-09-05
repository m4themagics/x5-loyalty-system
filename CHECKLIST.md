# Install Checklist

This file is the intake record for this repository. The installing agent fills it in during first-run setup and keeps it current afterwards.

**For the agent:** ask the questions below in the user's language, in product terms, and write the answers into this file as you go. Do not start feature work until everything through _First-version capabilities_ and every conditional section activated by those answers is completed. Never ask the user anything under _Decided by the agent_ - make those calls yourself and explain them in product terms.

**For the product owner:** this is the record of what was decided about your project. If something here is wrong, say so - the agent treats this file as the source of truth for what your product needs.

Answer cells hold `_unanswered_` until the question is asked, and `n/a` when the question cannot apply to this project. Answers are written in the product owner's language, but the section headings and the capability-ledger state words stay in English: other documents refer to them by those exact names. Keep every section heading, even when its rows are all `n/a`.

**When working on the template itself** (not installing it for a project), there is nothing to record: leave every answer cell at `_unanswered_` and every checkbox unchecked - those would otherwise ship to each future install. The capability ledger is the exception: it always describes the current branch, so keep it current when template work adds or removes a capability.

**Install status:** `completed 2026-09-04`
<!-- Set to: not started | in progress | completed YYYY-MM-DD -->

---

## 1. Project identity

| Question                                                        | Answer       |
| --------------------------------------------------------------- | ------------ |
| New project from this template, or work on the template itself? | Новый проект из шаблона |
| Project name / slug                                             | `pyaterochka-game-demo` |
| Your own GitHub repository URL, if you have one                 | `https://github.com/m4themagics/x5-loyalty-system.git` |

If no GitHub destination is chosen, the repository is left without `origin` and publishing stays unconfigured. The template remote is detached during setup unless this checkout is explicitly for improving the template.

## 2. Product

| Question                                                  | Answer       |
| --------------------------------------------------------- | ------------ |
| What product do you want to build first?                  | Мобильное веб-демо «X5 Чекпоинт — Собирай свою выгоду»: коробка, цифровые предметы, инвентарь и создание собственной скидки из четырёх предметов. Согласованное развитие: один персональный челлендж, гарантированный бесплатный физический товар и полезный цифровой предмет после первого выполненного допустимого задания, обмен дубликатами и финансирование через Ads |
| What is the first user journey that must work end to end? | Сейчас: коробка → предмет → инвентарь → четыре предмета → скидка → демонстрационный штрихкод. Следующий сценарий: история покупок и инвентарь → одно выполнимое задание → подтверждённое выполнение → обещанный товар и полезный предмет → существующее создание скидки; интеграция ещё не реализована |

### Agreed next product scope — documentation only

Приоритет к Demo Day: довести связный персональный сценарий с LLM-карточкой → усилить оценку 40 профилей, симуляцию 1 000 пользователей и простой антифрод → исправить прогресс/рейтинг/реферал → защита. Обмен, повторные товарные цели и полный аукцион сохраняются в плане развития и не блокируют проверки. Условие синтетического задания: одна оплаченная единица из указанной категории за семь дней; бесплатные строки и повторы не засчитываются, возвраты проверяются отдельно. Локальный PoC активирован только в Vite dev-сервере.

Решение от 05.09.2026 закреплено в [описании проекта](docs/project/project-description.md). Полный каталог, составы семи рецептов и фактические правила игры сохраняются в [описании предметов](docs/project/item-pool.md), пользовательские и операторские сценарии — в [продуктовых материалах](docs/project/product-materials.md). План объединяет реализацию коллег с согласованными дополнениями; он не сводится к перечислению будущих слоёв и не требует выбирать одну из трёх альтернативных механик или обязательно уменьшать награду по фазам.

- Первый бесплатный физический товар и полезный цифровой предмет гарантируются после уже показанного и выполненного допустимого челленджа. До показа проверяются наличие, риск, бюджет и положительная ожидаемая экономика; обязательство резервируется полностью. После показа случайный предмет не заменяет обещанный.
- Первое задание рассчитано на один обычный допустимый покупочный день. При пустом инвентаре оно даёт первый цифровой предмет, а для скидки нужны четыре копии. Демонстрация завершения рецепта одним заданием использует явно подготовленный стартовый инвентарь из трёх подходящих предметов.
- Целевая игра сохраняет 24 предмета, три редкости, семь рецептов, четыре ячейки и выбор комбинации. Выбор цели, выдача обещанного предмета, учёт дубликатов, жизненные циклы товара и скидки и журнал обязательств описаны как будущая интеграция. Реальное обязательство нельзя потерять при создании новой скидки.
- Финансирование: бренд оплачивает товар либо X5 покрывает его из ожидаемой дополнительной маржи. Учитывается маржа каждого SKU, субсидия, стоимость будущей скидки, фрод и операции. Реальная прибыльность пока не измерена.
- Повторные циклы имеют видимую конкретную цель: бесплатный SKU за обеспеченный рецепт либо обычную скидку. Четыре копии расходуются на один результат. Цель с товаром обеспечена наличием и полным резервом до показа; частота ограничивается финансированием, риском и экономикой. Подарок не положен за каждое задание.
- Обмен цифровыми дубликатами: один к одному одинаковой редкости, срок 24 часа, обе стороны подтверждают, предметы резервируются и передаются атомарно. Участие — от двух подтверждённых покупочных дней; максимум три завершённых обмена в неделю на пользователя. Товары, купоны, активные скидки и невыданные награды не передаются.
- В локальном PoC rules-based RecSys выбирает следующее полезное действие. Закрытый first-price CPA-аукцион брендов остаётся будущим контуром и не исполняется.
- Прогресс аватара, добровольный псевдонимный рейтинг подтверждённой экономии и расчёт реферальной награды сохраняются в карте требований кейса. Приглашение само по себе не оплачивается: требуется уникальная подтверждённая квалифицирующая покупка приглашённого и допуск по риску/бюджету. Обмен предметами не закрывает этот расчёт.
- Антифрод обязателен для будущей выдачи, обмена и погашения; общий телефон или устройство сам по себе не является основанием блокировки. Алкоголь, табак и никотин исключены из PoC.

Часть согласованных возможностей переведена в статус `available`: работает локальный PoC «история покупок → вычисленное задание → карточка → тестовый чек → обещанные награды → существующий крафт» с расчётом аватара, рейтинга и реферала. Учёт демонстрационный и живёт в одной вкладке браузера; серверного реестра прав, реальной выдачи товара, обмена, повторных товарных целей, полного аукциона и обученных моделей по-прежнему нет — они остаются `absent`. Карточку локально генерирует Qwen3 1.7B через Ollama; при недоступности или отклонении ответа используется проверенный шаблон. Финальные материалы в `docs/presentation/` сохраняются по требованиям сдачи: аннотация на 6–7 абзацев и обязательные разделы проекта; три продуктовых материала с вкладом AI Product. Дословный `case-brief.md` сохраняется. Входы, выходы, зависимости и приёмка следующей реализации определены в [плане проекта](docs/project/plan.md).

## 3. Active surfaces

Mark what is active now, and set the install status to `in progress` as soon as this section is answered. From then on, everything unmarked is deferred and must be left alone: no features, no setup, no test flows. While the status is still `not started` nothing has been decided yet, so unmarked boxes mean "not asked", not "forbidden".

- [ ] `backend` - API, database, auth
- [x] `webapp` - browser screens behind sign-in (no SEO)
- [ ] `website` - public pages that must rank in search or preview when shared
- [ ] `mobile` - Expo app (lives on the `mobile` branch; switch branches before setup)

| Question                                                                                                             | Answer       |
| -------------------------------------------------------------------------------------------------------------------- | ------------ |
| Why the unmarked surfaces are deferred, if it needs explaining                                                       | Нужен только мобильный веб-интерфейс. Backend, публичный website и нативное mobile-приложение отложены. Игровой профиль, случайная выдача и инвентарь работают локально в браузере; задания статические. |
| If `mobile` is active: are Expo/EAS builds, Expo Push, and Maestro E2E needed now, or left unconfigured until later? | n/a |

The split between `webapp` and `website` is the agent's call, not the user's; `README.md` explains how to route a feature between them.

## 4. First-version capabilities

Ask about product needs, not implementations. Mark what the first version actually needs, then fill the row below even when nothing was ticked, so a later session can tell "asked, and the answer was no" from "not asked yet".

- [ ] Accounts / sign-in
- [x] Saved data that survives a restart
- [ ] File, image, or media uploads → also answer _Files, images, and media_
- [ ] Paid subscriptions or one-off payments → also answer _Payments_
- [ ] Admin tools or roles
- [ ] External integrations (which: нет в первой версии; данные и сценарии будут предоставлены командой)
- [ ] Real-time chat, presence, collaboration, or live updates

| Question                                                                                          | Answer       |
| ------------------------------------------------------------------------------------------------- | ------------ |
| What the first version explicitly should NOT do (write "nothing ruled out" if that is the answer) | Не использовать backend, реальные аккаунты, загрузки, платежи, админ-инструменты, внешние интеграции, real-time, публичный website или нативное mobile-приложение. Текущая финализация концепции ограничена документацией: без runtime-кода, схем, фикстур, зависимостей и коммитов. |

## 5. Files, images, and media

This project ships private file storage with user avatars, so answer these for the files your product adds on top; otherwise mark the rows `n/a`. Keep the section either way - `docs/STORAGE.md` sends the agent here when uploads are added later.

| Question                                                                                      | Answer       |
| --------------------------------------------------------------------------------------------- | ------------ |
| What do users upload?                                                                         | n/a |
| Public, private, shared with selected people, or mixed?                                       | n/a |
| Who can upload, view, replace, and delete?                                                    | n/a |
| Maximum file size and allowed file types                                                      | n/a |
| Do images need thumbnails, resizing, format conversion, compression, cropping, or moderation? | n/a |
| How long do files live after the owning record is deleted?                                    | n/a |
| Should filenames be visible to users, or opaque?                                              | n/a |

## 6. Website data and freshness

Answer these when `website` is active; otherwise mark the rows `n/a`. Keep product choices here and
follow the implementation contract in `docs/WEB_SURFACES.md`.

| Question                                                                                    | Answer       |
| ------------------------------------------------------------------------------------------- | ------------ |
| Which public product or content data comes from the backend/database at website build time? | n/a |
| How soon after that data changes must the public website show the change?                   | n/a |
| Which changes require an automatic rebuild/redeploy rather than a manual release?           | n/a |

The default is Astro SSG. Database-backed public data is fetched while building static output. If
published database changes must appear automatically, implement the documented `website:rebuild`
outbox path. SSR or request-time rendering is an exception recorded here only when the required
freshness or personalization cannot be met by rebuild/redeploy.

## 7. Payments

Answer these only when payments are active above; otherwise mark the rows `n/a`. Keep the section either way, and replace the `n/a` answers if payments are added later.

| Question                                                                                                                    | Answer       |
| --------------------------------------------------------------------------------------------------------------------------- | ------------ |
| What exactly do users pay for?                                                                                              | n/a |
| Recurring subscription, one-off purchase, or both?                                                                          | n/a |
| Does the public website need a local cart or offer selection before registration/sign-in?                                   | n/a |
| Which active surfaces need payment: browser checkout, App Store / Google Play, native card entry, Apple Pay, or Google Pay? | n/a |
| What stops working when someone does not pay?                                                                               | n/a |

Whatever this project ends up with, the ledger below is what states it. Read `docs/WEB_SURFACES.md`
before implementing any payment surface. Browser checkout is built in authenticated `webapp` plus
the backend; `website` may pass a local cart but never owns a second payment flow. The `mobile`
template line ships App Store and Google Play subscriptions as working code that is switched off,
and may independently add policy-compliant card, Apple Pay, or Google Pay flows when the product
needs them. Declining a shipped payment capability means deleting its code during setup and
recording it as `removed`. Payments are never half-present and are never reintroduced on a guess.

## 8. Deployment

| Question                                                                                     | Answer       |
| -------------------------------------------------------------------------------------------- | ------------ |
| Is deployment needed now, or local-only for the moment?                                      | Пока только локально; исходный код публикуется в GitHub |
| Where are your users, and must the data stay in Russia?                                      | Пользователи в России; production-данные должны оставаться в России |
| Hosting, picked by the agent from the answer above: DigitalOcean / Yandex Cloud / own server | Yandex Cloud при активации deployment; сейчас облачные ресурсы не создаются |
| Production domains / URLs for API, webapp, and website; is Yandex CDN needed now?            | n/a до запроса на deployment |
| Which surfaces are released first                                                            | `webapp` |

**Ask the audience question, not the provider question.** A product owner knows where their users
are and whether data must stay in Russia; they should not be asked to compare clouds. The agent
picks the hosting from that answer:

| Hosting      | Chosen when                                                                        | What the template gives you                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DigitalOcean | Default for an audience outside Russia.                                            | Terraform creates App Platform API/static sites, a scheduler worker, migration gate, Managed PostgreSQL, DOCR, private media Spaces, and remote state. Release everything with `bun run release -- digitalocean`. |
| Yandex Cloud | Users in Russia, or data must stay there.                                          | Terraform creates Serverless Containers/timers, Managed PostgreSQL, API Gateway, static and private media Object Storage, remote state, and opt-in CDN. Release everything with `bun run release -- yandex`.      |
| Own server   | Full control wanted, no vendor lock-in, and someone is willing to run the machine. | The same Docker image plus the in-repo scheduler, with a short runbook in the "Own Server" section of `docs/DEPLOYMENT.md`. No release script: you own TLS, backups, updates, and monitoring.                     |

Pick exactly one and record it above. In an installed project, delete the unused provider directory
under `infra/` and its provider runbook rather than keeping a second possible production state.
Keep `scripts/infra.mjs` and `docs/DEPLOYMENT.md`: they own the shared safety/release contract. An
own-server project deletes both provider directories and runbooks. Local development never requires
cloud credentials regardless of the choice.

Deployment is often deferred at install time, which leaves these rows `_unanswered_`. When the user later asks to deploy, ask the unanswered questions then and write the answers back here before following `docs/DEPLOYMENT.md`.

## 9. Decided by the agent - do not ask the user

The user is a product owner, not an engineer. These are engineering decisions the agent owns, makes, and explains only in product terms:

- Which browser surface a feature belongs to (`website` for SEO/public, `webapp` for behind-login).
- Which email provider the recorded hosting implies: Yandex Cloud means Postbox, anything else means Resend. Ask where the users are, not which mail service the owner prefers.
- SSG plus build-time backend data and rebuild/redeploy for public product information unless a recorded freshness or personalization need requires runtime rendering.
- One browser checkout in authenticated `webapp`; `website` may hand off a local cart but never owns payment. Mobile payment UI stays native and separate.
- Monolithic backend; no microservices during setup.
- Docker Compose for local PostgreSQL on every OS; never a native install unless the user insists.
- Astro for `website`; Next.js only if Vercel-style ISR is a stated product requirement.
- The selected Terraform launch profile, machine sizes, serverless/static shape, and when an HA or CDN upgrade is justified.
- Which hosting the recorded audience implies: Russia means Yandex Cloud, elsewhere means DigitalOcean, and an explicit wish for full control means an own server. Explain the pick in product terms; never ask the owner to compare providers.
- Managed Redis-compatible Pub/Sub only when real-time needs to scale across instances.
- Test boundaries follow the failure mechanism: unit for pure/client rules, contracts for shared wire shapes, backend integration for route/auth/database behavior, and a curated browser portfolio for product-critical client-to-API journeys and real-browser risks.
- Libraries, file layout, naming, refactors, and validation scope.

## 10. Capability ledger

What this project actually contains. The agent updates it whenever a capability is added or removed. Every row carries exactly one state:

- `included` - present and expected to work.
- `available` - partly there but not usable yet; the note says exactly what is still missing, which may be configuration, routes, or UI.
- `absent` - not part of this project. Build it only after the product owner asks.
- `removed` - deliberately deleted during setup. **Do not re-add it.** A leftover reference, migration, or doc mention is not a product requirement; ask the product owner first.

A capability with no row is `absent` by default. Add the row instead of assuming. The State column always holds one of the four states above - never `_unanswered_` or `n/a`.

| Capability                      | State    | Note                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth (email + password)         | included | Template baseline.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Admin roles                     | included | Roles and seeding in `backend`; admin UI in `webapp`.                                                                                                                                                                                                                                                                                                                                                                |
| Password reset email delivery   | included | Two providers behind one port, Yandex Cloud Postbox and Resend, selected by `EMAIL_DELIVERY`. The schema fallback is `disabled`, so an unset deployment sends and queues nothing; the copied local `backend/.env.example` intentionally selects `console` so reset links print locally. Delivery is durable: a request queues a `task_outbox` row and the shipped scheduler drains it every minute. Production needs an account with a provider and a deployed runner. See `docs/EMAIL.md`. |
| File/media storage              | included | Private uploads end to end, with user avatars as the worked example. Stores on local disk by default and on any S3-compatible bucket via `PRIVATE_STORAGE_*`, with no code change between them. See `docs/STORAGE.md`.                                                                                                                                                                                               |
| Infrastructure as code          | included | Provider-specific Terraform bootstrap, foundation, migration/runtime, and static roots cover DigitalOcean and Yandex Cloud, with remote state, guarded plan/apply, migration-gated immutable releases, media storage, static hosting, and jobs. `scripts/infra.mjs` is the one operations entry point. See `infra/README.md` and `docs/DEPLOYMENT.md`.                                                               |
| Static asset precompression     | included | `bun run static:precompress` writes `.br` and `.gz` next to the text assets in `webapp/dist` and `website/dist`, using `node:zlib` and no dependency. It is own-server tooling: hosted releases do not upload those sidecars and use their edge/runtime compression when available.                                                                                                                                  |
| Storybook component catalogs    | included | Separate local React/Vite catalogs cover every `src/components/ui` module in `webapp` and `website`, with official docs/a11y addons and story-only composition examples. They are not deployed; Astro sections remain outside Storybook and the website stays static SSG.                                                                                                                                       |
| Website build-time backend data | absent   | The baseline landing content is repository-owned; add a shared public DTO and build fetch only when `website` needs database-backed information.                                                                                                                                                                                                                                                                     |
| Automatic SSG rebuild           | absent   | Durable desired/published revision state, single-flight deployment reconciliation, immutable atomic/blue-green release promotion, public-marker verification, and a provider adapter are not implemented. Yandex additionally needs a separate builder/upload component. See `docs/WEB_SURFACES.md`.                                                                                                                 |
| Website cart handoff            | absent   | No local cart or cross-origin handoff exists on the default branch. When activated, it feeds the one authenticated browser checkout defined in `docs/WEB_SURFACES.md`.                                                                                                                                                                                                                                               |
| Browser checkout / payments     | absent   | No browser checkout or payment code exists. Build it in `webapp` plus the backend, never in `website`. Store subscriptions come from the mobile template line.                                                                                                                                                                                                                                                       |
| Push notifications              | absent   | No push code here. Expo Push comes from the mobile template line.                                                                                                                                                                                                                                                                                                                                                    |
| Social sign-in (Apple / Google) | absent   | No social auth here. It comes from the mobile template line.                                                                                                                                                                                                                                                                                                                                                         |
| Real-time / WebSockets          | absent   | Requires an explicit product need.                                                                                                                                                                                                                                                                                                                                                                                   |
| Background jobs                 | included | Jobs live in `backend/src/jobs.ts`. The shared scheduler runs `outbox:drain` every minute, upload cleanup hourly at minute 15, and auth cleanup daily at 03:00 UTC. Terraform deploys that scheduler as a DigitalOcean worker and the same executor in Yandex HTTP job containers/timer triggers; own servers run it under a supervisor. `workerLoops` stays empty. See `docs/BACKGROUND_JOBS.md`.                              |
| Durable task outbox             | included | `task_outbox` in PostgreSQL with handlers in `backend/src/outbox/handlers.ts`, drained by `outbox:drain`. Ships with the password-reset emails as its only producers, and stays empty until something enqueues. Adding a task type is a code change, never a migration.                                                                                                                                              |
| Local demo profiles and progress | included | The mobile web demo includes an interactive profile, an expandable inventory with eight initial slots, static weekly tasks, and an unlimited reward chest. Every shake-opened chest randomly selects one of 24 items using documented 70%/25%/5% rarity weights, adds it to the persisted inventory, stacks duplicates, and is immediately available again. Tapping an inventory item opens its rarity and a playful usage clue without revealing the exact discount category. Four inventory items can be equipped by drag-and-drop or tap, consumed to craft a discount from a 5–15% base with a recipe bonus and an 18% formula cap, and matched against seven themed recipes for a +2/+3 percentage-point synergy bonus. One active discount is persisted, shown beside the character, and opens a structurally valid EAN-13 barcode. Inventory, randomization, crafting, and discount state are browser-local only: there is no backend profile sync, real purchase feed, task issuance, cooldown enforcement, anti-tamper randomization, discount expiry/redemption, POS registration, or production reward fulfillment. |
| Allocator scenario contract and validators | available | Existing JSON schema, campaign catalog, nine fixture files and local validation scripts live in `recsys/`. They describe allocator scenarios and copy checks; current game screens do not consume them. A runtime recommender, trained models and complete game/reward contracts are not present. |
| Local PoC decision API and LLM card | available | The webapp calls `python3 recsys/engine/cli.py` over a Vite middleware at `/api/demo/decision` and `/api/demo/event`, validated by the shared Zod contract in `packages/contracts/src/demo-poc.ts`. Local Qwen3 1.7B runs through Ollama without a cloud key; YandexGPT remains an optional provider. Invalid or unavailable model output falls back to a validated deterministic template. Dev-server only. |
| Personal purchase challenge / RecSys | available | A local PoC is connected: `recsys/engine` scores the full candidate catalog with rules, the webapp reaches it through a Vite `configureServer` middleware, and both `demo-empty` and `demo-breakfast-seeded` receive different challenges. Exploration is off, model training and a served recommender are still absent. |
| Recipe goal selection and promised item issuance | available | The engine picks one recipe goal and one missing catalog item, and a qualifying synthetic receipt issues exactly that item once through `issued_rewards`. State is browser-local for one tab; there is no protected server ledger. |
| Guaranteed first physical reward | available | The first cycle promises one funded gift SKU (about RUB 25) beside the digital item, with stock and the full liability reserved before the promise is shown. Repeat cycles promise no second gift. The demo grants an entitlement record only; no real product issuance or redemption. |
| Digital item exchange | absent | Approved future specification: 1:1 same-rarity duplicate exchange, 24h expiry, both confirmations, atomic reserved transfer, 3 completed exchanges/week/user and at least 2 verified purchase days. No exchange runtime or UI. |
| Retail-media auction and billing | absent | Approved future specification: one placement, closed quality-adjusted first-price CPA auction; winner pays its submitted bid after a verified qualifying event. No live bidding, budget ledger or billing. |
| Product antifraud and reward ledger | available | Explainable receipt qualification and an allow/review/hold/reject scorer run in `recsys/engine/risk.py` with thresholds fixed in `data/policy.json`; duplicates and free lines never grant. Evaluated in `recsys/eval/fraud_eval.py`. No protected server-side ledger, no multiaccount graph, no returns workflow. |
| Funded recipe goal with a concrete physical reward | absent | Approved future specification: one visible funded goal with an exact SKU and existing recipe; four eligible instances yield either that SKU or the ordinary coupon, once. Stock and full goal liability are reserved before the promise; first-challenge gifts remain separate. No goal issuance/redemption UI or runtime is connected. |
| Coupon lifecycle and maximum reward reservations | available | Each isolated synthetic profile enforces the PoC rules end to end: RUB 10 coupon cap, RUB 2.50 per promised or unspent instance, separate physical fund, full maximum liability before a promise, and an active coupon blocking a new one until demo redemption. There is no shared server fund across profiles. |
| Avatar progress and voluntary savings ranking | available | Avatar level counts distinct completed recipes 0-7 and a pseudonymous ranking uses confirmed redeemed savings, with equal savings sharing a rank. Computed on synthetic local events in `webapp/src/features/home/demo-progress.ts`; no server events. |
| Referral qualification and reward calculation | available | A synthetic unit flow grants one common item to the inviter after the invitee's first allowed qualifying purchase within seven days, with a RUB 2.50 reserve and idempotent award record. Self-invites, existing customers and repeats are excluded. Current screen seeds have no invitation, and there is no real invitation flow or event feed. |
| Habit, relevance and economics evaluation | available | Reproducible local runs exist: 40 independently labelled profiles with a rubric of acceptable answers, a separate refusal set, a 1,000-user simulation with positive/zero/negative worlds, and fraud precision/recall. Labels are `agent_draft` pending human confirmation; no human walkthroughs and no real 28-day purchase or margin measurement. |

## 11. Environment checks

Verified by the agent during setup, not asked.

- [ ] `docker compose version` and `docker info` succeed (needed for backend/API, uploads, or DB-backed validation)
- [x] `git remote -v` inspected; template remote detached unless contributing to the template
- [ ] App-local `.env` files created from `.env.example`, with a locally generated `JWT_SECRET` (never committed) — n/a: backend is deferred and the webapp build needs no local environment file
- [x] Smallest meaningful validation run for the active surfaces

## 12. After setup

- [x] Durable answers above filled in, install status set to `completed YYYY-MM-DD`
- [x] Validation scope recorded for this project (which suites run before a change is called done): `template:check`, `architecture:check`, `typecheck:webapp`, `lint`, `test:webapp`, `build:webapp`; the isolated `e2e:demo:webapp` browser suite covers demo navigation scroll reset and expired chest recovery without requiring backend or Docker
- [x] Project renamed from the template identifiers (`web_app_demo`, `web-app-demo`, `vibecoding-template`), `bun.lock` regenerated
- [x] Deferred-surface notes added to the READMEs of surfaces that are not active
- [x] `Bootstrap-Only Instructions` blocks deleted from `AGENTS.md` and `CLAUDE.md`
- [x] Local URLs, commands run, and anything the user must authorize manually reported back to the user

`README.md`, `AGENTS.md`, `CLAUDE.md`, and some `docs/` runbooks route agents into this file by section name, so renaming a heading breaks those pointers silently. Add rows and sections a project needs, and cross-reference sections by name rather than by number so renumbering stays harmless.
