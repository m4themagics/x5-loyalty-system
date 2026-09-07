# Контракт локального PoC

Один общий контракт трёх зон работы: **история покупок → вычисленное задание → карточка →
тестовый чек → обещанные награды → существующий крафт**.

Источник истины — [`packages/contracts/src/demo-poc.ts`](../../packages/contracts/src/demo-poc.ts)
(Zod, **contract v2**). Эталонные полезные нагрузки лежат в [`examples/`](examples) и проверяются
[`demo-poc.test.ts`](../../packages/contracts/src/demo-poc.test.ts).

## Границы

- Контракт описывает демонстрационный обмен данными webapp ↔ `recsys/engine`, а не серверный реестр прав.
- Поля в `snake_case`: вторая сторона — Python и существующий `schema/action.schema.json`.
- Деньги — целые копейки. Новый купон 10 000, резерв экземпляра 2 500, пример себестоимости демо-SKU 2 500. Схема также принимает максимум 1 000 для ранее выданных купонов.
- Счётчик входов хранится только в webapp: три разных дня по Москве, четыре получения за 28 дней. До первого показанного шага резервируются 2 500; при открытии резерв переходит предмету.
- При чтении старого браузерного снимка обеспечение предметов и невыполненного задания дополняется до 2 500 один раз; фонд не увеличивается. Старые купоны сохраняются и погашаются по своему максимуму.
- Contract v2 переносит снимок глобального локального Ads-состояния: бюджеты кампаний,
  зарезервированные/списанные суммы, показы и CPA-биллинги. Это браузерный демонстрационный
  ledger, а не финансовый или защищённый серверный реестр.
- Жизненный цикл обмена хранится в общем снимке webapp, но не передаётся Python decision/event.
  Повторные товарные цели в этот контракт пока не входят.
- Инвентарь остаётся количественным (`item_id` + `quantity`), как в существующем игровом модуле.
  Однократность выдачи обеспечивает журнал `issued_rewards` с `reward_id` и `item_instance_id`.

## Три операции

| Операция | Вход | Выход |
| --- | --- | --- |
| `POST /api/demo/decision` | `demoDecisionRequestSchema` | `demoDecisionResponseSchema` |
| `POST /api/demo/event` | `demoEventRequestSchema` | `demoEventResponseSchema` |
| `POST /api/demo/title` | `demoTitleRequestSchema` | `demoTitleResponseSchema` |

Титул коллекции описывает только собранные предметы: валидатор отклоняет цифры, деньги,
скидки и обещания, а также титулы длиннее 28 символов или трёх слов. Любое нарушение,
недоступность модели или невалидный JSON дают детерминированный шаблон с `source: "fallback"`.

Ошибка транспорта или движка — `demoErrorResponseSchema` с кодом `bad_request`,
`engine_failed`, `engine_timeout` или `engine_invalid_output`.

Инварианты, проверяемые схемой: `status: "offer"` требует `challenge` и `card`, `no_action`
запрещает их; `grant` возможен только при `qualification: "qualified"` и `risk.decision: "allow"`;
`billing` возможен только вместе со свежей выдачей и запрещён для идемпотентного повтора.

## Кто чем владеет

| Зона | Каталоги | Не трогает |
| --- | --- | --- |
| Контракт (координатор) | `packages/contracts/src/demo-poc*.ts`, `recsys/contract/**`, `webapp/src/features/home/demo-game-snapshot.ts`, `webapp/scripts/build-demo-contract-examples.ts` | — |
| Мария: движок, экономика, LLM | `recsys/engine/**`, `recsys/llm/**` | `webapp/**`, `recsys/eval/**` |
| Григорий: интеграция с игрой | `webapp/**` | `recsys/**`, существующие игровые правила |
| Артемий: независимая проверка | `recsys/eval/**`, позже `docs/presentation/**` | `recsys/engine/**`, `webapp/**` |

Каталог предметов и формула скидки живут только в `webapp/src/features/home`. Движок получает
снимок (`game`) и рассчитанные признаки (`game_features`) и не хранит второй каталог.

## Эталонные файлы

| Файл | Что фиксирует |
| --- | --- |
| `examples/game-snapshot.json` | 24 предмета и 7 рецептов, сгенерировано из игровых модулей |
| `examples/profile-empty.json` | Новый участник: покупки есть, инвентарь пуст |
| `examples/profile-breakfast-seeded.json` | Явно подготовленный профиль с тремя предметами «Доброго утра» |
| `examples/budget.json` | 10 000 ₽ купонного и 25 000 ₽ физического фонда |
| `examples/ads.json` | Начальные глобальные бюджеты кампаний без показов и списаний |
| `examples/decision-request-empty.json`, `examples/decision-request-seeded.json` | Полные запросы, собранные генератором |
| `examples/decision-response-offer.json`, `examples/decision-response-no-action.json` | Форма ответа движка; числа синтетические |
| `examples/event-request-qualified.json` | Тестовый чек с оплаченной и бесплатной строкой |
| `examples/event-response-granted.json`, `examples/event-response-duplicate.json` | Выдача с одноразовым Ads-биллингом и идемпотентный повтор без второго счёта |

Ответы — образцы формы, а не ожидаемый вывод движка. Ожидаемые решения задаёт разметка в
`recsys/eval/`.

## Проверки

```bash
bun run test:contracts
bun webapp/scripts/build-demo-contract-examples.ts --check
python3 recsys/validate.py
python3 recsys/validate_explanation.py
python3 recsys/eval_creatives.py
```

`--check` падает, если каталог предметов или рецепты изменились без пересборки эталона.
Пересборка: тот же скрипт без флага.
