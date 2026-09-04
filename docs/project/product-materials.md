# X5 Чекпоинт — продуктовые материалы

**Версия:** v5  
**Дата:** 04.09.2026  
**Контур MVP:** мобильное приложение «Пятёрочки», синтетические данные  
**Рабочее название пользовательского слоя:** X5 Чекпоинт  
**Рабочее название AI-policy:** QuestRank / next-best-game-action

## Как читать документ

- **Факт** — следует из кейса, Q&A, опубликованного источника или фактически выполненной работы.
- **Сигнал** — наблюдение с ограниченной доказательной силой.
- **Гипотеза** — требует проверки; не является результатом.
- **Критерий** — заранее выбранное условие принятия решения.
- **Рабочее решение** — актуальная версия плана, которая заменяет противоречащие ей элементы v4.

## Материал 0. Decision log: что поменялось в v5

### Проблема v4

В v4 пользовательский цикл был построен вокруг трёх персональных физических призов. Это сокращало путь до ценности, но не давало защищаемого ответа на формулировку «повышать частоту за счёт интереса, а не только новых скидок».

Если пользователь возвращался только ради бесплатного кофе, продуктом оставался reward. Герой, XP и «Своя Пятёрочка» рисковали выглядеть декоративной оболочкой. Кроме того, персонализация SKU внутри одной механики уже является рыночным baseline.

### Рабочее решение v5

> X5 Чекпоинт — единая короткая оболочка, внутри которой QuestRank выбирает для пользователя сам тип игрового воздействия, минимальное подкрепление или `no_action`.

Персонализируется комбинация:

```text
механика × следующий ход × окно × подкрепление × стоимость × частотный лимит
```

Каталог MVP ограничен тремя поведенческими механиками:

1. **Личный финиш** — завершение уже начатого прогресса.
2. **Своя Пятёрочка** — вклад в видимую локальную общую цель.
3. **Семейная эстафета** — взаимность и передача уже заработанного хода/ценности.

Физический товар становится onboarding- или milestone-подкреплением, а не обязательным результатом каждого цикла. После первых успешных циклов применяется **reward fading**. Если частота исчезает вместе с reward, работала скидка, а не интерес.

### Что сохраняется из v4

- короткий маршрут и один следующий покупочный день;
- текущий чек как контекст и стартовый прогресс;
- герой, магазин, семья и gifting как игровые активы;
- `no_action`, экономика, antifraud и grounded LLM;
- supplier-funded reward как непроверенная коммерческая гипотеза;
- измерение purchase weeks и post-treatment эффекта.

### Что не является ядром v5

- колесо/reveal;
- три товара для каждого пользователя;
- обязательный бесплатный товар после каждого маршрута;
- универсальная линейка герой → голос → FastPass;
- рейтинг, referral, gifting, голосование и FastPass как одновременно запускаемые механики.

## Материал 1. Product brief

### Пользователь и проблема

**Приоритетный пользователь MVP** — пользователь приложения «Пятёрочки» с повторяемой корзиной, но нерегулярным или ухудшающимся ритмом покупок.

**Второй пользователь** — product/CRM/loyalty-команда X5, которой нужно выбирать воздействие, способное создать дополнительную покупочную неделю без оплаты органического поведения.

**Проблема покупателя:** приложение предлагает много промо и отдельных механик, но они не обязательно совпадают с тем, что мотивирует конкретного человека. Длинная игра требует лишних действий; короткая акция часто остаётся просто купоном.

**Проблема X5:** одна игра для всех усредняет разные поведенческие реакции, а персональный reward не отделяет causal uplift от pull-forward и organic subsidy.

### Позиционирование

> Мы не создаём ещё одну универсальную мини-игру. QuestRank выбирает, какой короткий игровой рычаг показать конкретному пользователю, какое минимальное подкрепление использовать и стоит ли вмешиваться вообще.

Пользователь видит одну последовательную оболочку Чекпоинта, а не хаотичный каталог игр.

### AJTBD покупателя

> Когда я уже совершил обычную покупку, я хочу увидеть один понятный следующий ход, связанный с тем, что мне действительно интересно — завершить личный прогресс, помочь своей точке или передать ценность близкому, — чтобы захотеть вернуться без длинной игры и разбора очередных скидок.

### AJTBD продуктовой команды

> Когда нужно увеличить частоту покупок, я хочу выбрать для конкретного пользователя минимальное рентабельное игровое воздействие, чтобы создать дополнительную покупочную неделю и не субсидировать визит, который произошёл бы сам.

### Ценностное предложение

> После валидного чека QuestRank выбирает для пользователя один короткий Чекпоинт: личный, локальный или семейный. Один следующий покупочный день завершает маршрут и оставляет постоянный результат. Материальная награда используется только там, где она нужна для входа или milestone; затем её стоимость снижается, чтобы проверить устойчивость интереса.

### Что не заявляем

- не заявляем мировой уникальности;
- не заявляем готовую uplift-модель без randomized history;
- не утверждаем, что AI умеет определять «тип личности» по чекам;
- не заявляем доказанный рост частоты, retention или маржи;
- не называем LLM источником бизнес-решения;
- не считаем синтетическую симуляцию пользовательским доказательством;
- не считаем engagement-метрики конкурентов causal uplift.

## Материал 2. Конкурентное отличие

### Краткий тезис

> Большинство loyalty-решений персонализируют предложение внутри одной игры. X5 Чекпоинт персонализирует саму механику мотивации и умеет выбрать минимальную награду или `no_action`.

### Сравнение

| Типовое решение | X5 Чекпоинт v5 |
| --- | --- |
| Одна игра для всех | Каталог из трёх механик с общей оболочкой |
| Разные товары, пороги и тексты | Разный поведенческий рычаг: завершение, локальный вклад, взаимность |
| Каждый eligible получает reward | Material, digital, privilege, progress-only или `no_action` |
| Оптимизация MAU/completion | Инкрементальные purchase weeks при положительной contribution margin |
| Игра и reward измеряются вместе | Reward-only control, fixed-game control и reward fading |
| Демо одного пользователя | Три пользователя с разными policy decisions |
| LLM «придумывает квест» | Policy выбирает action; LLM объясняет валидированный payload |

### Почему это сильнее предыдущей версии

Персональный товар — понятная utility-механика, но её легко повторить и трудно отделить от скидки. Выбор механики создаёт продуктовый и технический контур:

- heterogeneous treatment logic;
- controlled exploration;
- mechanic-level reason codes;
- `no_action`;
- reward fading;
- policy-level experiment.

Именно этот контур должен быть виден в прототипе, архитектуре и защите. Иначе QuestRank останется невидимой надписью на обычном квесте.

## Материал 3. Каталог механик MVP

### Общий контракт Чекпоинта

Каждая механика должна соответствовать ограничениям:

- один понятный следующий ход;
- цель связана с покупочным днём, а не с долгой игровой сессией;
- текущий чек может давать стартовый прогресс;
- сумма чека не покупает статус или влияние;
- результат сохраняется после завершения;
- условия заранее понятны и не меняются LLM;
- reward является подкреплением, а не единственным смыслом;
- доступен `no_action`.

### Механика A. Личный финиш

**Психологический механизм-гипотеза:** goal gradient / endowed progress.

**Пользовательский сценарий:**

1. Текущий чек открывает маршрут и сразу заполняет первый checkpoint.
2. До завершения остаётся один покупочный день в персональном окне.
3. После completion пользователь получает постоянный цифровой результат: предмет, карточку завершённого маршрута или игровую способность.
4. Физический reward допускается на первом цикле или milestone.

**Не делаем:** длинный streak, ежедневные действия, spend-based XP и обязательный reward в каждом цикле.

### Механика B. «Своя Пятёрочка»

**Психологический механизм-гипотеза:** local belonging и collective efficacy.

**Пользовательский сценарий:**

1. Пользователь выбирает одну из двух-трёх заранее разрешённых сезонных целей точки.
2. Следующий покупочный день добавляет один ограниченный вклад.
3. Интерфейс показывает конкретный итог этапа.
4. Голос, FastPass или физическое изменение допустимы только после отдельной операционной проверки; в PoC показывается цифровой state.

**Не делаем:** влияние пропорционально сумме трат, фиктивное обещание реального ремонта, глобальный рейтинг богатства.

### Механика C. Семейная эстафета

**Психологический механизм-гипотеза:** reciprocity и shared goal.

**Пользовательский сценарий:**

1. Пользователь передаёт близкому уже заработанный цифровой ход или trial.
2. Получатель совершает проверенное qualifying action.
3. Shared progress обновляется только после валидного события.
4. Reward остаётся `delayed`, если graph antifraud обнаруживает self-referral или аномалию.

**Не делаем:** спам-реферал за ссылку, reward до первого подтверждённого действия, оценку только по индивидуальным визитам без household guardrail.

### Измерение подкрепления

QuestRank отдельно выбирает reinforcement:

| Reinforcement | Роль |
| --- | --- |
| Supplier-funded full-size trial | Onboarding или редкий milestone |
| Баллы в жёстком EV-бюджете | Fallback, если проходят порог |
| Digital unlock | Контроль над будущей игрой: сменить маршрут, продлить окно, выбрать тему |
| Local privilege | Только при operational capability |
| Progress-only | Проверка внутренней ценности механики |
| `no_action` | Не платить за organic behavior или высокий fatigue/risk |

## Материал 4. Product hypothesis и карта доказательств

### Основная гипотеза v5

> Если для пользователя с нерегулярным ритмом QuestRank выбирает из личной, локальной и семейной механики тот короткий игровой рычаг, который лучше соответствует его наблюдаемому поведению, а затем снижает стоимость подкрепления, то число активных покупочных недель и contribution margin будут выше, чем у персонального reward-only и одной фиксированной игры, потому что разные пользователи причинно реагируют на разные мотивы, а policy не платит органически лояльным.

Это гипотеза реального randomized пилота, а не результат PoC.

### Самое рискованное предположение

Пользователи действительно имеют **различающуюся causal-реакцию** на три механики, и её можно оценить лучше случайного назначения без чрезмерного объёма данных.

Если QuestRank не превосходит фиксированную короткую игру при сопоставимом бюджете и exploration, mechanic-level personalization не оправдана. Тогда решение нужно упростить до одной наиболее эффективной механики с profit-aware targeting.

### Второе рискованное предположение

Часть эффекта сохраняется после снижения материальной награды.

Если completion и purchase uplift исчезают сразу после reward fading, частоту создаёт скидка, а не игровой интерес. Тогда claim «за счёт интереса» должен быть снят.

### Ближайший Riskiest Assumption Test до финала

До финала нельзя доказать causal uplift, но можно проверить более ранние звенья:

1. Пользователь без объяснения различает три типа маршрута и понимает свой следующий ход.
2. Маршрут остаётся желательным, когда в нём нет гарантированного физического товара.
3. Пользователь не воспринимает reward fading как скрытое ухудшение условий.
4. Product-менеджер понимает reason codes и отличие mechanic-choice от SKU-personalization.

Метод: 5–7 модерируемых тестов кликабельного прототипа; каждому участнику показываются три контекста и парные варианты `reward-only / fixed game / QuestRank-selected route`. Это проверяет понимание и предпочтение, но не причинный рост покупок.

### Evidence map

| Сигнал | Что поддерживает | Чего не доказывает |
| --- | --- | --- |
| Q&A кейсодателя: прежние механики были длинными, retention низким, reward слабым | Нужен короткий путь и ранняя понятная ценность | Что QuestRank повысит покупки |
| Интервью `n=1`: нужен быстрый полезный результат; голосование перегружает | Первый цикл должен быть простым; локальные привилегии не в onboarding | Лучший ICP и лучшая механика |
| X5 уже публично описывает платформу геймификации и персонализацию | «Ещё одна игра» и «персональный challenge» не уникальны | Что текущая внутренняя платформа умеет mechanic-level policy |
| EagleAI/Tesco персонализируют challenges, категории, пороги и rewards | Персональный challenge — рыночный baseline | Что mechanism selection не имеет добавочной ценности |
| Goal-gradient и endowed progress | Основание для личного финиша и стартового прогресса | Размер эффекта в X5 |
| Randomized field experiment: купон сильнее в моменте, геймификация устойчивее после снятия | Нужны post-treatment и reward fading | Что X5 получит тот же эффект |
| GS25 digital storage/gifting | Передача уже заработанной ценности понятна пользователям | Рост частоты домохозяйства |
| Grocery loyalty study: полезность повышают экономия и удобство, а entertainment может мешать | Игра должна быть короткой и utility-first | Что игровые механики не работают вообще |
| Profit-aware targeting literature | Нужны EV, no_action и organic-subsidy control | Готовую causal-модель для X5 |

### Приоритет гипотез

| ID | Гипотеза | Неопределённость | Приоритет |
| --- | --- | --- | --- |
| H1 | Пользователь понимает выбранную механику и один следующий ход | Высокая | 1 — prototype test |
| H2 | Маршрут без постоянного физического reward остаётся желательным | Очень высокая | 2 — concept test / reward fading copy |
| H3 | QuestRank превосходит fixed game | Очень высокая | 3 — randomized pilot |
| H4 | Full QuestRank превосходит personalized reward-only | Очень высокая | 4 — randomized pilot |
| H5 | `no_action` снижает reward waste без потери инкрементальных покупок | Очень высокая | 5 — pilot |
| H6 | Семейная механика растит household purchase days, а не перераспределяет их | Очень высокая | Phase 2 |
| H7 | Локальная механика даёт эффект без дорогого физического reward | Очень высокая | Phase 2/pilot cell |

## Материал 5. Границы MVP

### Core loop

1. Валидный чек обновляет контекст пользователя.
2. Mechanic catalog формирует допустимые действия по трём механикам и `no_action`.
3. Hard filters исключают неподдерживаемые, дорогие, частые и рискованные варианты.
4. QuestRank ранжирует `mechanic × target × window × reinforcement`.
5. Пользователь получает один маршрут; текущий чек может уже засчитываться как старт.
6. Один qualifying purchase day завершает маршрут и обновляет соответствующий state.
7. Reward fading controller определяет следующее подкрепление.
8. Product dashboard показывает decision, reason codes, стоимость и экспериментальную группу.

### Входит в MVP

- один формат — «Пятёрочка»;
- три механики: personal_finish, store_coop, family_relay;
- `no_action`;
- единый короткий UX-контракт;
- синтетические истории чеков и поведенческие признаки;
- mechanic catalog и candidate generator;
- rules-based QuestRank;
- controlled exploration flag;
- reward fading state;
- grounded LLM-output;
- state engine трёх механик;
- простые antifraud reason codes;
- product console;
- три сквозных синтетических сценария;
- sensitivity simulation на 1–10 тыс. профилей.

### Не входит в MVP

- реальная causal uplift-модель или contextual bandit;
- реальные персональные данные;
- кассовая, CRM, stock и loyalty-ledger интеграция;
- реальный household identity resolution;
- промышленный antifraud;
- реальное исполнение голосования, FastPass и улучшений магазина;
- отдельный магазин косметики и сложный avatar gameplay;
- длинные истории, mini-games и ежедневные streaks;
- реальная выдача supplier-funded reward;
- юридический, security и нагрузочный review.

### Сценарии демонстрации

#### Сценарий 1. Маша — personal_finish

- нерегулярный cadence, повторяемые категории, низкий social/store engagement;
- action: один визит в пять дней;
- reinforcement: supplier-funded trial на onboarding;
- next phase: digital unlock;
- reason: высокий gap до ожидаемого следующего визита, низкий fatigue, экономика проходит.

#### Сценарий 2. Катя — store_coop

- средний cadence, регулярное открытие экрана точки, прошлое участие в локальных выборах;
- action: один визит в семь дней с вкладом в выбранную сезонную цель;
- reinforcement: progress-only + milestone vote token;
- reason: local engagement выше reward sensitivity; physical reward не нужен.

#### Сценарий 3. Сергей — no_action

- высокая baseline visit probability и стабильные purchase weeks;
- action: `no_action` для платного воздействия;
- optional: бесплатный digital drop без push;
- reason: ожидаемая инкрементальная ценность ниже стоимости и риск organic subsidy высок.

#### Edge case. Подозрительная семейная связь

- shared device/payment и невозможная скорость событий;
- family reward переводится в `delayed`;
- LLM не может снять hold.

## Материал 6. AI/техническое решение

### Архитектура

| Компонент | Роль |
| --- | --- |
| Synthetic generator | Профили, cadence, route history, store/social signals, reward response proxy и fraud cases |
| Feature builder | Baseline propensity, recency trend, category affinity, fatigue, mechanic-history и risk features |
| Target heads | Отдельные предсказания частоты, завершения, маржи корзины, персистентности, fraud и opt-out; в PoC — синтетические proxy |
| Mechanic catalog | Разрешённые mechanics, targets, state transitions, reinforcement types и capability rules |
| Candidate generator | Комбинации действий и `no_action` |
| Hard filters | Eligibility, budget, funding, cooldown, frequency cap, capability и fraud |
| QuestRank | Многоцелевой rules-based ranking в PoC: вектор целей, ε-ограничения и свёртка с бюджетным дуалом; uplift/bandit только после randomized history |
| Budget controller | Общая теневая цена бюджета `λ`, калибровка под потолок и кривая «недели против бюджета» |
| Exploration allocator | Безопасная рандомизация между допустимыми действиями |
| Reward fading controller | Onboarding, confirmation, persistence и stop/rotate decisions |
| State engine | Personal/store/family states и qualifying events |
| LLM adapter | Название, story и объяснение выбранного action |
| Validator | JSON schema, immutable IDs, catalog grounding и fallback |
| Product console | Candidate set, score decomposition, reason codes, fading phase и group assignment |

### Action schema

```json
{
  "action_id": "action_1042",
  "mechanic_id": "personal_finish",
  "target_action": "purchase_day_in_window",
  "window_days": 5,
  "reinforcement_type": "supplier_trial",
  "reinforcement_id": "sku_318",
  "reinforcement_cost": 18.0,
  "funding_source": "supplier",
  "fading_phase": "onboarding",
  "estimated_incremental_probability": 0.0,
  "expected_persistence_uplift": 0.0,
  "expected_completion_probability": 0.0,
  "expected_payout": 0.0,
  "expected_contribution_margin": 0.0,
  "fraud_risk": 0.0,
  "optout_risk": 0.0,
  "fatigue_penalty": 0.0,
  "budget_price": 0.0,
  "persistence_weight": 0.0,
  "objective_scores": { "freq": 0.0, "persist": 0.0, "cost": 0.0, "margin": 0.0 },
  "reason_codes": []
}
```

### Scoring

Ранжирование многоцелевое. Цели считаются отдельно, а свёртка использует ε-ограничение и
бюджетный дуал:

```text
J_freq    = p_week − p_week_base                 → max
J_persist = p_persist − p_week_base              → max
J_cost    = reinforcement_cost × p_complete      → min
J_margin  = J_freq × CM + m_basket − J_cost − fraud − fatigue − ops   → max

maximize   J_freq + β(phase) × J_persist − λ × J_cost
subject to J_margin ≥ 0, p_fraud ≤ τ, p_optout ≤ τ, caps и capability
```

`λ` — одна теневая цена бюджета на всю популяцию, калиброванная под потолок reward budget; такое
ранжирование эквивалентно ранжированию по стоимости инкрементальной покупочной недели. `β` задаётся
фазой fading и не даёт максимизировать сиюминутный отклик дорогим подкреплением. Маржа остаётся
ограничением, а не слагаемым, — так же как в дизайне пилота. Полная постановка, крайние точки и
кривая компромисса — в разделе 8.4 [описания проекта](project-description.md).

В PoC все головы — синтетические proxy. Реальное next-best-game-action обучение требует randomized
treatment data.

### `no_action`

`no_action` выбирается, если:

- ни один допустимый кандидат не даёт положительной свёртки при текущем `λ`;
- baseline purchase probability высока и organic subsidy risk превышает порог;
- fatigue/frequency cap нарушен;
- нет допустимого funding/capability;
- fraud risk требует hold;
- confidence ниже минимального порога.

### Reward fading state machine

```text
onboarding → confirmation → persistence → maintain / rotate / no_action
```

- `onboarding`: допустим ощутимый trial;
- `confirmation`: меньшая стоимость или digital unlock;
- `persistence`: progress-only либо milestone reward;
- `maintain`: дешёвая механика сохраняет uplift;
- `rotate`: текущий рычаг перестал работать;
- `no_action`: вмешательство не окупается.

### LLM contract

LLM может:

- назвать маршрут;
- объяснить один следующий ход;
- объяснить reason codes понятным языком;
- адаптировать тон в пределах утверждённых шаблонов.

LLM не может:

- выбирать механику;
- менять цену, срок, reward, funding или eligibility;
- создавать новые условия;
- диагностировать личность пользователя;
- снимать fraud hold;
- обещать uplift.

## Материал 7. Product → Tech traceability

| Продуктовое решение | Техническая реализация | Чем проверяем |
| --- | --- | --- |
| Персонализируем саму механику | Mechanic catalog + QuestRank candidates | Lift D vs C, reason-code review |
| Один следующий ход | Общий state contract и configurable window | Comprehension, completion, purchase weeks |
| Интерес сверх reward | Reward fading controller и post-treatment window | Persistence without material reward |
| Не платить органически лояльным | Baseline proxy + EV + `no_action` | Reward waste и margin |
| Не притворяться, что знаем мотивацию | Exploration allocator и causal pilot | Heterogeneous treatment estimates |
| Личный финиш | Endowed-progress state | Completion и repeat route |
| Своя Пятёрочка | Store state + capability catalog | Comprehension, local engagement, ops guardrails |
| Семейная эстафета | Household/referral graph + delayed state | Household purchase days и fraud precision |
| Подкрепление отдельно от механики | Reinforcement catalog и funding ledger | Cost per incremental week |
| LLM не принимает бизнес-решение | Immutable action JSON + validator | 0 invented mechanics/terms |
| Продукт понимает policy | Console с candidates, вектором целей и reason codes | Время ответа на вопрос «почему это действие» |
| Бюджет ограничен на популяцию, а не на пользователя | Общая теневая цена `λ` и калибровка под потолок | Кривая «инкрементальные недели против бюджета»; cost per incremental week |
| Интерес важнее сиюминутного отклика | Вес `β(phase)` на цель персистентности | Persistence after fading при равном бюджете |

## Материал 8. Критерии успеха и эксперимент

### Критерии PoC

| Область | Предварительный критерий |
| --- | --- |
| Decision diversity | На демонстрационном наборе policy выдаёт не менее трёх разных валидных решений, включая `no_action` |
| Mechanic relevance | Экспертная оценка top action не ниже 70% на 30–50 синтетических профилях; это проверка логики, не causal effect |
| Explainability | Для каждого решения доступны candidate set, score decomposition и reason codes |
| Reward fading | State корректно проходит onboarding → confirmation → persistence |
| Grounding LLM | 100% output проходит schema/catalog validation; 0 придуманных mechanics/SKU/terms |
| Antifraud | Каждый hold/block имеет reason code; precision приоритетнее recall |
| UX | Не менее 5 из 7 участников понимают механику, следующий ход и отсутствие обязательного reward в каждом цикле |
| Demo | Три пользователя + один fraud case проходят сквозной сценарий |

Порог UX — внутренний критерий команды, а не внешний benchmark.

### Предпочтительный дизайн пилота

Все группы сравниваются по сопоставимому ожидаемому reward budget; D может тратить меньше за счёт `no_action` и fading, но budget ceiling должен быть одинаковым.

| Группа | Воздействие | Что изолируем |
| --- | --- | --- |
| A | BAU | Baseline |
| B | Personalized reward-only | Эффект персонального reward |
| C | Fixed short game для всех | Эффект игровой оболочки без mechanic selection |
| D | QuestRank policy | Эффект mechanic selection, minimal reinforcement и `no_action` |

Внутри D первые назначения рандомизируются между допустимыми actions для накопления causal history.

### Метрики

**Primary:** число активных покупочных недель/дней на eligible-пользователя.

**Business gate:** contribution margin не ниже контроля.

**Основные сравнения:**

- `D − C`: добавочная ценность mechanic-level personalization;
- `D − B`: добавочная ценность игры сверх reward-only;
- `persistence after fading`: эффект после снижения reward;
- `cost per incremental purchase week`;
- `saved reward budget from no_action`.

**Secondary:** action acceptance, route completion, repeat route, digital-only completion, store/family route use, app D7/D30.

**Guardrails:** average basket, pull-forward, cannibalization, organic subsidy, reward cost, split receipts, returns, fraud precision, complaints, opt-out, push fatigue, household redistribution и store operations.

### Критерии отказа

- Если D не превосходит C — отказаться от mechanic-level personalization и оставить лучшую фиксированную механику.
- Если D не превосходит B — игровой слой не добавляет ценность сверх reward.
- Если эффект исчезает после fading — не заявлять рост «за счёт интереса».
- Если contribution margin ниже контроля — не масштабировать независимо от engagement.
- Если пользователи не понимают отсутствие reward в каждом цикле — перепроектировать onboarding и copy.
- Если кривая `λ` показывает, что простой порог `J_margin ≥ 0` даёт ту же частоту при том же бюджете — многоцелевая свёртка не нужна, остаётся EV-фильтр.

## Материал 9. Риски и план проверки

| Допущение / риск | Текущий статус | Проверка | Решение |
| --- | --- | --- | --- |
| Пользователи различаются по causal-реакции на механики | Не подтверждено | Randomized exploration + pilot | Упростить до fixed game, если heterogeneity недостаточна |
| Три механики понятны в общей оболочке | Не проверено | 5–7 usability tests | Сократить catalog или изменить copy |
| Reward fading не воспринимается как потеря | Не проверено | Concept test двух сезонных правил | Сделать milestone schedule явным; не обещать постоянный товар |
| Personal route работает без reward | Не проверено | Digital-only cell | Оставить material reward только там, где проходит EV |
| Store route имеет реальную ценность | Не проверено | Prototype comprehension + capability interview | Оставить только digital state или убрать |
| Family route растит household frequency | Не проверено | Household-level pilot | Убрать из core при redistribution-only effect |
| `no_action` не выглядит наказанием | Не проверено | UX copy + silent holdout | Не показывать «вам ничего не дали»; использовать neutral experience |
| Supplier funding доступен | Гипотеза | Коммерческая проверка | Без funding — digital/privilege/no_action |
| Policy не учится на bias своих решений | Высокий риск | Exploration allocator и holdout | Не запускать deterministic personalization без exploration |
| LLM не выдумывает условия | Архитектурно ограничено, не протестировано | Adversarial schema tests | Блокировка и template fallback |

### План до финала

1. Зафиксировать mechanic catalog и common UX contract.
2. Провести 5–7 tests трёх route types и reward-fading copy.
3. Собрать три пользовательских экрана и product console.
4. Сгенерировать 1–10 тыс. synthetic profiles и 30–50 eval profiles.
5. Реализовать candidates, filters, QuestRank score, exploration flag и `no_action`.
6. Реализовать fading state, three-mechanic state engine и fraud cases.
7. Реализовать grounded LLM/validator.
8. Провести sensitivity simulation четырёх групп.
9. Подготовить 90-секундное demo: три пользователя → три решения → один policy dashboard.

## Материал 10. Команда и использование AI

### Команда

| Участник | Роль | Зона ответственности v5 |
| --- | --- | --- |
| Вербицкий Артемий Андреевич · @yungatla | AI Product | Mechanic catalog, JTBD, hypotheses, reward fading, economics, experiment и pitch |
| Гуреева Мария Дмитриевна · @m4themagics | AI Engineer — Recsys / LLM | Synthetic data, candidate generation, QuestRank, exploration, `no_action`, eval, simulation, LLM grounding и validator |
| Зоринов Григорий Алексеевич · @grigorii_zor | AI Engineer — Механики / Application | Mechanic catalog, state engine трёх маршрутов, fading controller, экраны и demo integration |

### Вклад AI Product

- критика v4 и фиксация, что reward не должен быть продуктом;
- переход от SKU-personalization к mechanic-level policy;
- ограничение каталога тремя поведенческими рычагами;
- формулировка falsification criteria;
- reward fading и post-treatment measurement;
- design групп BAU / reward-only / fixed game / QuestRank;
- перевод решений в action schema, state machine и evaluation requirements.

### Как AI использован в PDLC

| Этап | Использование AI | Что осталось человеческим решением |
| --- | --- | --- |
| Discovery | Разбор кейса/Q&A, карта противоречий, критика assumptions | Выбор проблемы и живые интервью |
| Research | Поиск и сравнение зарубежных/российских аналогов, source matrix | Проверка качества источников и причинности |
| Product design | Альтернативы, red-team критика, mechanic catalog, RAT и метрики | Выбор v5 и допустимых рисков |
| Prototype | Screen structure, copy variants, edge cases | UX-решения и tests с людьми |
| Development | Synthetic generator scaffolding, action schemas и test cases | Архитектура, код-review и приёмка |
| Evaluation | Eval set, schema tests, simulation design | Решение, доказан ли пользовательский и бизнес-эффект |

Синтетические пользователи и LLM-as-judge не считаются customer evidence.

## Источники

1. [Описание кейса](case-brief.md) и Q&A кейсодателя, предоставленные команде 03.09.2026.
2. [X5 о собственной платформе геймификации](https://www.x5.ru/ru/news/kazhdyj-tretij-gejmer-igraet-v-mobilnyh-prilozheniyah-x5/).
3. [EagleAI Challenges](https://eagleeye.com/challenges) — baseline персонализированных challenge.
4. [Tesco Clubcard Challenges case](https://eagleeye.com/case-studies/tesco-clubcard-challenges) — participation/adoption signals, не публичный causal uplift.
5. [GS25 My Refrigerator](https://view.asiae.co.kr/en/article/2021061408363290618) — digital ownership и gifting; adoption, не causal uplift.
6. [Kivetz, Urminsky, Zheng — Goal-Gradient](https://journals.sagepub.com/doi/abs/10.1509/jmkr.43.1.39).
7. [Nunes, Drèze — Endowed Progress Effect](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=991962).
8. [Managing Churn to Maximize Profits](https://pubsonline.informs.org/doi/10.1287/mksc.2020.1229) — profit-aware targeting, не готовая X5-модель.
9. [Ho, Liu, Wang — Fun Shopping: A Randomized Field Experiment on Gamification](https://pubsonline.informs.org/doi/10.1287/isre.2022.1147).
10. [Playing to Win: The Impact of Gamified Loyalty Programs in Grocery Retail](https://doi.org/10.1108/SJME-10-2024-0276).
11. [X5 Клуб — уровни, любимые категории и кешбэк](https://x5club.ru/faq/cashback).
12. [Ailawadi et al. — Promotion Profitability for a Retailer](https://journals.sagepub.com/doi/abs/10.1509/jmkr.44.3.450).
13. Материалы AI Product Hack: Context Pack, AJTBD, product/AI hypotheses, Riskiest Assumption Test, AI in PDLC и принцип «синтетический пользователь не является доказательством».
