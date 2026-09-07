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
| What product do you want to build first?                  | Мобильное веб-демо «X5 Чекпоинт — Собирай свою выгоду»: коробка, цифровые предметы, инвентарь и создание собственной скидки из четырёх предметов. Согласованное развитие: один персональный челлендж, гарантированный бесплатный физический товар и полезный цифровой предмет после первого выполненного допустимого задания, обмен предметами и финансирование через Ads |
| What is the first user journey that must work end to end? | Целевой путь: история покупок → выполнимое задание → чек → обещанный предмет → коллекция → скидка. Локально связаны персональное задание до отдельного окна награды и игра «случайная коробка → коллекция → четыре предмета → скидка со штрихкодом». Инвентарь общий; коробка за три дня входа реализована локально. |

### Agreed product scope — local PoC and documentation

Приоритет к Demo Day: предъявить связный персональный сценарий с LLM-карточкой и локальным Ads-аукционом → показать оценку 40 профилей, две симуляции и простой антифрод → прогресс/рейтинг/реферал и обмен → защита. Повторные товарные цели и промышленная Ads-инфраструктура сохраняются в плане развития и не блокируют проверки. Условие синтетического задания: одна оплаченная единица из указанной категории за семь дней; бесплатные строки и повторы не засчитываются, возвраты проверяются отдельно. Локальный PoC активирован только в Vite dev-сервере.

Решение от 05.09.2026 закреплено в [описании проекта](docs/project/project-description.md). Полный каталог, составы семи рецептов и фактические правила игры сохраняются в [описании предметов](docs/project/item-pool.md), пользовательские и операторские сценарии — в [продуктовых материалах](docs/project/product-materials.md). План объединяет реализацию коллег с согласованными дополнениями; он не сводится к перечислению будущих слоёв и не требует выбирать одну из трёх альтернативных механик или обязательно уменьшать награду по фазам.

- Первый бесплатный физический товар и полезный цифровой предмет гарантируются после уже показанного и выполненного допустимого челленджа. До показа проверяются наличие, риск, бюджет и положительная ожидаемая экономика; обязательство резервируется полностью. После показа случайный предмет не заменяет обещанный.
- Первое задание рассчитано на один обычный допустимый покупочный день. При пустом инвентаре оно даёт первый цифровой предмет, а для скидки нужны четыре копии. Демонстрация завершения рецепта одним заданием использует явно подготовленный стартовый инвентарь из трёх подходящих предметов.
- Целевая игра сохраняет 24 предмета, три редкости, семь рецептов, четыре ячейки и выбор комбинации. Локально работают выдача обещанного предмета, учёт копий, обмен и резервы купона; товарные цели повторных рецептов и защищённый серверный журнал остаются развитием. Реальное обязательство нельзя потерять при создании новой скидки.
- Финансирование: бренд оплачивает товар либо X5 покрывает его из ожидаемой дополнительной маржи. Учитывается маржа каждого SKU, субсидия, стоимость будущей скидки, фрод и операции. Реальная прибыльность пока не измерена.
- Повторные циклы имеют видимую конкретную цель: бесплатный SKU за обеспеченный рецепт либо обычную скидку. Четыре копии расходуются на один результат. Цель с товаром обеспечена наличием и полным резервом до показа; частота ограничивается финансированием, риском и экономикой. Подарок не положен за каждое задание.
- Обмен любыми имеющимися и свободными цифровыми предметами: один к одному одинаковой редкости, срок 24 часа, обе стороны подтверждают, предметы резервируются и передаются атомарно. Разрешено отдать единственную копию; после резервирования она недоступна для крафта и другого обмена. Участие — от двух подтверждённых покупочных дней; максимум три завершённых обмена в неделю на пользователя. Товары, купоны, активные скидки и невыданные награды не передаются.
- В runtime rules-based RecSys выбирает следующее полезное действие. Локальный quality-adjusted first-price CPA-аукцион выбирает кампанию, резервирует её ставку и субсидию и выставляет один счёт после квалифицированного события. Offline learned RecSys реализован и проверен на рандомизированной синтетике, но не обслуживает runtime.
- Прогресс аватара, дружеский рейтинг по собранным наборам и расчёт реферальной награды сохраняются в карте требований кейса. Публичное сравнение по деньгам исключено: подтверждённая экономия остаётся личной цифрой в шапке профиля. Приглашение само по себе не оплачивается: требуется уникальная подтверждённая квалифицирующая покупка приглашённого и допуск по риску/бюджету. Обмен предметами не закрывает этот расчёт.
- Антифрод обязателен для будущей выдачи, обмена и погашения; общий телефон или устройство сам по себе не является основанием блокировки. Алкоголь, табак и никотин исключены из PoC.

Часть согласованных возможностей переведена в статус `available`: работает локальный PoC «история покупок → вычисленное задание → Ads-решение → карточка → тестовый чек → отдельное окно обещанных наград» с расчётом аватара, рейтинга и реферала, локальным обменом, рекламным бюджетным ledger и однократным CPA-биллингом. Коробка и задания наполняют одну коллекцию, из которой четыре предмета собираются в скидку со штрихкодом и купоном. Учёт демонстрационный и живёт в одной вкладке браузера. Offline learned RecSys обучается и оценивается воспроизводимо на синтетических логах; runtime остаётся rules-based. Серверного реестра прав, реальной выдачи товара, повторных товарных целей, POS, production bidder accounts и обучения на реальных логах нет. Карточку локально генерирует Qwen3 1.7B через Ollama; при недоступности или отклонении ответа используется проверенный шаблон. Материалы сдачи переданы на хакатон и в репозитории не хранятся. Дословный `case-brief.md` сохраняется.

## 3. Active surfaces

Mark what is active now, and set the install status to `in progress` as soon as this section is answered. From then on, everything unmarked is deferred and must be left alone: no features, no setup, no test flows. While the status is still `not started` nothing has been decided yet, so unmarked boxes mean "not asked", not "forbidden".

- [ ] `backend` - API, database, auth
- [x] `webapp` - мобильное браузерное демо без входа
- [ ] `website` - public pages that must rank in search or preview when shared
- [ ] `mobile` - Expo app (lives on the `mobile` branch; switch branches before setup)

| Question                                                                                                             | Answer       |
| -------------------------------------------------------------------------------------------------------------------- | ------------ |
| Why the unmarked surfaces are deferred, if it needs explaining                                                       | Нужен только мобильный веб-интерфейс. Backend, публичный website и нативное mobile-приложение отложены. Игровая коллекция работает локально в браузере; персональный PoC вызывает Python только через Vite dev middleware. |
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
| What the first version explicitly should NOT do (write "nothing ruled out" if that is the answer) | Не подключать промышленный backend, реальные аккаунты, загрузки, платежи, POS, real-time, публичный website или нативное mobile-приложение. Авторизован локальный PoC: Vite вызывает Python, Qwen работает через Ollama, состояние хранится в браузере; новые сервисы и зависимости не добавляются. Коммит и push требуют отдельного запроса |

## 5. Files, images, and media

Пользовательские загрузки и приватное файловое хранилище в этом проекте отсутствуют. Раздел сохраняется для фиксации решения.

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

| Capability | State | Note |
| --- | --- | --- |
| Auth, accounts and roles | removed | Демо открывается без входа; backend и административной панели нет. |
| File/media uploads | absent | В проекте есть только репозиторные изображения; пользовательских загрузок нет. |
| Website, checkout and payments | absent | Реализован только мобильный webapp без продаж и платежей. |
| Infrastructure, database and background jobs | removed | В текущем репозитории нет production-инфраструктуры, PostgreSQL, очередей и outbox. |
| Storybook | removed | Каталог компонентов из шаблона не входит в проект. |
| Коробки за входы | available | Три разных дня по Москве, четыре получения за скользящие 28 дней, резерв 2,50 ₽ до показа прогресса; пропуски не сбрасывают дни. |
| Игровой профиль и случайная коробка | included | Маскот, уровень, выгода, коробка за три разных дня входа, 24 предмета, шансы 70/25/5 и сохранение в `localStorage`. |
| Коллекция и создание скидки | included | Четыре слота, выбор нажатием/перетаскиванием, семь рецептов, расход копий, одна активная скидка и локальный EAN-13. Реального погашения нет. |
| Статические недельные задания | included | Четыре карточки с фиксированным прогрессом и наградой-коробкой; покупки их не обновляют. |
| Local PoC decision API and LLM card | available | Vite dev middleware вызывает Python; Qwen меняет только заголовок, при сбое применяется шаблон. Статическая сборка API не содержит. |
| Personal purchase challenge / RecSys | available | Rules-based движок выбирает задание и проверяет синтетический чек. Выданный предмет хранится в состоянии PoC, но не переносится в основную коллекцию и четыре слота. |
| Local X5 decision and evaluation view | available | Показывает решение, Ads-победителя, резерв, CPA и синтетические сравнения; это не production-консоль. |
| Guaranteed first physical reward | available | В PoC создаётся только демонстрационное право на SKU при рекламном финансировании; реальной выдачи нет. |
| Digital item exchange | available | Локальный 1:1 обмен одинаковой редкости между подготовленными профилями; QR демонстрационный, серверного соединения нет. |
| Retail-media auction and billing | available | Локальный quality-adjusted first-price CPA-аукцион и браузерный ledger; реальных рекламодателей и расчётов нет. |
| Product antifraud and reward ledger | available | Синтетическая квалификация чека и риск-скоринг есть; защищённого серверного журнала нет. |
| Coupon lifecycle and reward reservations | available | Доменная логика PoC считает резервы и демо-погашение, но пользовательский экран основной скидки показывает только штрихкод и не содержит погашения. |
| Avatar progress and friends ranking | available | Уровень и дружеский рейтинг по собранным наборам вычисляются по локальному синтетическому состоянию; деньги в сравнение не входят. |
| LLM collection title | available | Титул коллекции пишет Qwen через `/api/demo/title`; валидатор отклоняет цифры, деньги и обещания и подставляет шаблон. |
| Referral qualification | available | Расчёт покрыт unit-тестами; настоящего приглашения и события покупки нет. |
| Habit, relevance and economics evaluation | available | Воспроизводимые синтетические оценки есть; реальных пользовательских прохождений и причинного эффекта нет. |

## 11. Environment checks

Verified by the agent during setup, not asked.

- [ ] `docker compose version` and `docker info` succeed (needed for backend/API, uploads, or DB-backed validation)
- [x] `git remote -v` inspected; template remote detached unless contributing to the template
- [ ] App-local `.env` files created from `.env.example`, with a locally generated `JWT_SECRET` (never committed) — n/a: backend is deferred and the webapp build needs no local environment file
- [x] Smallest meaningful validation run for the active surfaces

## 12. After setup

- [x] Durable answers above filled in, install status set to `completed YYYY-MM-DD`
- [x] Validation scope recorded for this project: `typecheck`, `lint`, `test`, `test:engine`, `test:eval`, `validate:recsys`, `build`. Playwright содержит 18 сценариев, но после изменений профиля требует актуализации и пока не считается зелёной приёмкой
- [x] Project renamed from the template identifiers (`web_app_demo`, `web-app-demo`, `vibecoding-template`), `bun.lock` regenerated
- [x] Deferred-surface notes added to the READMEs of surfaces that are not active
- [x] `Bootstrap-Only Instructions` blocks deleted from `AGENTS.md` and `CLAUDE.md`
- [x] Local URLs, commands run, and anything the user must authorize manually reported back to the user

`README.md`, `AGENTS.md`, `CLAUDE.md`, and some `docs/` runbooks route agents into this file by section name, so renaming a heading breaks those pointers silently. Add rows and sections a project needs, and cross-reference sections by name rather than by number so renumbering stays harmless.
