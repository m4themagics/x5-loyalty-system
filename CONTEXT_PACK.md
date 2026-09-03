# X5 Ключ / PrivilegeRank

**Статус:** основная ставка команды  
**MVP-сеть:** «Пятёрочка»  
**Продукт:** полезные права в любимом офлайн-магазине вместо ещё одной игры  
**Дата:** 03.09.2026

## 1. Решение

> **X5 Ключ — обычные чеки открывают полезное право в любимой «Пятёрочке», а не ещё один экран с игрой.** PrivilegeRank выбирает одно следующее воздействие: сэкономить время, гарантировать наличие, сохранить цену, дать реальное влияние на точку — либо ничего не предлагать. Прогресс обновляется автоматически; отдельной игры нет.

**Почему «Пятёрочка».** Магазин у дома лучше всего подходит для повторяемого ритма, любимой точки и коротких офлайн-визитов. «Перекрёсток» требует другой экономики и больше подходит второй волне с резервом большой корзины. «Чижик» не берём в MVP: его EDLP и минимальная операционная модель плохо совместимы с дорогими физическими привилегиями.

**Первый сегмент.** Пользователь приложения «Пятёрочки» с одной устойчивой любимой точкой, достаточной историей чеков и нерегулярными 1–3 покупочными неделями в месяц. Demo-persona — родитель ребёнка до трёх лет; доля 26% среди пользователей МП ТС5 против 15% гостей — синтетический ориентир кейсодателя, а не доказанный ICP.

**JTBD покупателя:** закончить привычный офлайн-поход быстрее и предсказуемее, получить понятную выгоду или увидеть реальное изменение своей точки — без заданий на несколько минут.

**JTBD X5:** создать дополнительную покупочную неделю, не оплатив органическое поведение и не переполнив ограниченный сервис магазина.

**Важная развилка.** `no_action` применяется до назначения челленджа. Если челлендж назначен и выполнен, обещанное право гарантировано: capacity и бюджет резервируются заранее.

## 2. Что подтверждают данные и конкуренты

### Источники не смешиваем

| Источник | Что можно говорить |
| --- | --- |
| Q&A кейсодателя | Около 80% относится к офлайну; точный denominator нужно выписать из записи. Это не вывод из пяти интервью. |
| Q&A кейсодателя | Существующая геймификация провальна по внутренним метрикам; пока неизвестно, по какой метрике и был ли holdout. |
| Синтетические профили | Используем как prior для persona и генератора, не как сегментационное исследование. |
| AI-role-play 12 proto-personas | Hypothesis generation: price lock оказался наиболее универсальным, reserve/fast service — релевантными отдельным jobs, store voice — самым отличимым, игра/аватар — не самостоятельной ценностью. Это не интервью и не статистика рынка. |

### Что реально показало эффект

| Механика | Вывод для X5 |
| --- | --- |
| **Убрать трение и неопределённость** | Самый сильный офлайн-сигнал. В квазиэксперименте Scan & Go (`n=4 400`) adoption сопровождался `+16,3%` к частоте заказов и `+21,6%` к тратам, но сервис также давал отзывы и товарную информацию — это не чистый эффект кассы. После BOPS у одного non-grocery ритейлера трафик 79 US-точек вырос примерно на 13%, store sales — на 6% против четырёх control-точек. Amazon сообщает для Dash Cart +10% трат, 98% satisfaction и >80% дневных транзакций от повторных пользователей; это company data. Не переносим проценты на X5, но обосновываем utility-first pilot. |
| **Денежная выгода** | Шесть исследований показали устойчивое преимущество денежных rewards при выборе программы. Экономию нельзя заменить «эмоциями» для всех; price lock остаётся baseline/fallback под margin cap. |
| **Настоящее влияние** | В четырёх экспериментах (`n=875`) реальный выбор будущего продукта повышал спрос через psychological ownership; в одном тесте WTP выросла на 19% только при совпадении результата с предпочтением. Migros получила 632 413 голосов по обязательному ассортиментному решению. Это сильное участие, но не доказанный рост grocery-frequency. |
| **Игры и статус** | X5 сообщает о 9 млн игроков и в среднем 22 игровых сессиях в месяц за 2025 год, но не публикует causal lift частоты/маржи. «Магнит» тоже масштабирует игры, «Лента» делала AR-тамагочи. Значит, аватар, миссия и leaderboard — commodity и лишь интерфейс состояния. |

Источники: [Amazon Dash Cart](https://www.aboutamazon.com/news/retail/amazon-just-walk-out-dash-cart-grocery-shopping-checkout-stores), [Scan & Go study](https://onlinelibrary.wiley.com/doi/10.1111/deci.70001), [BOPS study](https://ideas.repec.org/a/inm/ormnsc/v60y2014i6p1434-1451.html), [monetary vs nonmonetary rewards](https://onlinelibrary.wiley.com/doi/abs/10.1002/cb.1663), [customer empowerment](https://journals.sagepub.com/doi/10.1509/jmkg.74.1.65), [Migros vote](https://corporate.migros.ch/de/news/alkohol-abstimmung-resultate), [X5 gaming](https://www.x5.ru/ru/news/kazhdyj-tretij-gejmer-igraet-v-mobilnyh-prilozheniyah-x5/), [«Лента»: AR-геймификация](https://rdk.digital/case/mobil-naja-programma-lojal-nosti-vyrasti-s-lentoj).

### Конкурентное поле

| Слой | Кто | Что это доказывает |
| --- | --- | --- |
| Прямое российское поле | X5, «Магнит», «Лента» | Игры, персональные предложения и реакция на снижение частоты уже существуют. «AI выбирает квест» не новизна. |
| Персональные challenges | Tesco / EagleAI | Уже выбирают frequency/category/brand/referral challenge, threshold и reward с budget control. |
| Офлайн-удобство | Sam’s Club, Amazon Fresh | Scan & Go, early access и checkout-free дают понятную физическую ценность, но X5 уже запускала Express Scan. Нельзя перепродать его как VIP-инновацию. |
| Реальное влияние | Migros, Target, Co-op, Tesco | Голосование масштабируется, если выбор исполняется; causal frequency uplift публично не доказан. |
| Платформы | Antavo, Talon.One, Retail Rocket, Mindbox | Главные build-vs-buy benchmarks: loyalty/incentives, recsys/offline, CRM и эксперименты. |
| Второй эшелон | Gameball, Open Loyalty, Trophy | Gameball/Open Loyalty — engines; Trophy — digital primitives. Это не прямые consumer-конкуренты X5. |

**Честное отличие:** другие системы персонализируют товар, скидку или квест. PrivilegeRank распределяет ограниченное право конкретного магазина с учётом capacity, остатка, операционной стоимости, fairness, fraud и ожидаемого инкрементального эффекта. Если X5 не подтверждает ни одного ограниченного права, отличие исчезает.

Источники: [X5 recommendation technology](https://x5club.ru/api/secure/lk-loyalty/docs/file/recommendation_technology.pdf), [EagleAI Challenges](https://eagleeye.com/challenges), [X5 «Экспресс-скан»](https://www.x5.ru/ru/news/x5-zapuskaet-beskontaktnye-pokupki-s-po/), [«Лента»: purchase-based personalization](https://www.retail.ru/cases/lenta-prevrashchaet-znaniya-o-pokupatelyakh-v-loyalnost/), [Mindbox / ROSTIC’S](https://mindbox.ru/journal/cases/rostics/).

## 3. Продукт и формирование ритма

### Каталог кандидатов, а не четыре продукта

| Роль | Конкретный кандидат | Статус |
| --- | --- | --- |
| **Основной utility-кандидат** | **«Ключ запаса»**: одним нажатием удержать 1–3 прогнозируемых повторных SKU в любимой точке на 60 минут. Только для магазинов с точными остатками, местом выдачи и квотой комплектации. | Hero demo; go/no-go после разговора с operations. |
| Альтернативный time-right | Дополнительный fast/assisted path только там, где есть отдельная честно квотируемая мощность. Не закрываем уровнем базовую КСО или Express Scan. | Не MVP без подтверждённой capacity. |
| **Baseline/fallback** | **«Цена за мной»**: price lock на один повторяемый SKU или категорию на 7 дней. | Понятно, реализуемо, но не конкурентная новизна. |
| **Signature/wow** | **«Голос любимой точки»**: равный голос за один из 2–3 ops-approved вариантов с владельцем, бюджетом, дедлайном и статусом `выбрано → в работе → сделано`. | Отдельная гипотеза; не выдаём за доказанный драйвер частоты. |
| Guardrail | `no_action` при отрицательном EV, fatigue, fraud или отсутствии capacity. | Внутреннее решение до показа. |

На поверхности всегда **одно** предложение и максимум один тап. Пользователь может выбрать «мне важнее цена / время / влияние»; это explicit feedback модели.

### Как появляется привычка без игры

`cue: привычное окно потребности → routine: обычный shopping episode → feedback: чек обновил 1/3 → reward: полезное право следующего визита`

- цель персональна: `min(4, прогноз покупочных недель + 1)`; в demo для baseline `2/4` ставим цель `3/4`, поэтому не награждаем уже привычное поведение;
- один shopping episode в неделю даёт один шаг; чеки в одной точке за 60 минут объединяются;
- пропуск не обнуляет прогресс;
- после награды измеряется persistence, но команда не заявляет, что четыре недели «сформировали привычку»;
- organic loyal не получает платный челлендж: policy выбирает `no_action`.

### Требования кейса

| Механика | Реализация |
| --- | --- |
| Личный прогресс | `1/3 → 2/3 → Ключ открыт`; обновляется чеком. |
| Аватар | Состояние Ключа/пропуска, не питомец, которого нужно кормить. |
| Рейтинг | Позиция любимой точки среди сопоставимых магазинов; чек обновляет вклад и место команды. Если нужен персональный rank — анонимный percentile без ФИО, адреса и награды за траты. |
| Реферал | «Гостевой ключ»; обе награды только после первой валидной покупки приглашённого и fraud gate. Не core питча. |

## 4. AI-ядро: search + recsys + ads + LLM

`candidate = user × predicted_need × right × store × time_window × capacity_unit`

`Value(u,c) = P(Δvisit|u,c) × contribution_margin − reward_cost − operational_cost − fraud_loss − fatigue_penalty`

1. **Features:** RFM, cadence, basket size, повторяемые SKU/category, promo dependence, favorite store, привычное окно, treatment history, fatigue и fraud features.
2. **Retrieval:** hard masks по capability/stock/policy, затем top-K доступных прав и целей.
3. **LLM:** получает только агрегированные признаки и retrieved catalog; возвращает JSON `right_id`, `goal`, `time_window`, `reason_codes`, `user_copy`, `confidence`.
4. **Validator:** schema, grounding, sensitive categories, достижимость и неизменяемые budget/capacity rules. При ошибке — детерминированный шаблон.
5. **Ranker:** прозрачный rules-score в PoC; uplift model/contextual bandit только после randomized data.
6. **Allocator:** batch min-cost flow/ILP или greedy baseline распределяет права по когорте, соблюдая capacity, budget, fairness и one-active-right.
7. **Explanation:** только безопасные причины: «часто повторяющийся товар», «короткая вечерняя корзина», «выбрана любимая точка».

LLM не назначает цену, не создаёт право, которого нет в каталоге, не отменяет fraud block и не делает sensitive inference.

## 5. Экономика и anti-fraud

`net_incremental_margin = Δtransactions × CM + Δbasket_CM − reward_cost − staff_minutes_cost − queue_externality − fraud_loss`

`referral_reward = min(configured_cap, safety_share × expected_incremental_margin)`

- право резервируется до показа; после completion его нельзя заменить «извинением»;
- price lock не пересекается с более выгодным mass promo и проходит margin cap;
- stockout/no-show/unused capacity входят в полную стоимость;
- видимая VIP-очередь исключена: она создаёт несправедливость и ухудшает обычную очередь;
- служебный туалет исключён: санитарная и accessibility-потребность не должна зависеть от трат.

**Объяснимый fraud-score PoC:** `+35 duplicate receipt`, `+25 shared device/payment graph`, `+20 impossible store velocity`, `+15 self-referral`, `+10 return-after-reward`; cap 100. `<30` — approve, `30–59` — delayed reward/review, `≥60` — block. В пилоте веса и пороги калибруются; precision важнее recall.

## 6. Что строим на хакатоне

### Четыре экрана

1. **Мой Ключ:** `2/3 недель`, любимая точка, состояние права и измеримый результат.
2. **Моё право:** один grounded-челлендж, причина, срок, one-tap reserve/activate и «мне важнее другое».
3. **Любимая точка:** три исполнимых варианта, равный голос и статус реализации; здесь же командный rank.
4. **Гостевой ключ:** referral pending/approved/delayed с reason code.

### Данные и симуляция

Минимум: `users`, `transactions`, `stores(capabilities, stock, capacity)`, `rights_catalog(cost, SLA, policy_tags)`, `referrals`, hidden synthetic potential outcomes. Симуляция: 10 000 пользователей, 30 точек, 12 недель истории и 6 недель treatment; generator и policy используют разные seeds.

| Проверка | Критерий |
| --- | --- |
| LLM relevance | `top-1 acceptable ≥70%` на 30–50 frozen profiles; отдельно groundedness и violations. |
| Constraints | 100% назначений проходят stock/capacity/budget/one-active-right. |
| Policy | При одинаковом бюджете сравнить generic challenge, independent top-1 и PrivilegeRank по scenario net margin и overload. |
| UX | За 10 секунд понятны действие, выгода и срок; forced choice `reserve / price / voice / none`. |
| Fraud | Precision по размеченным synthetic cases; medium risk не блокируется навсегда. |

### Demo за 90 секунд

1. Офлайн-профиль родителя: cadence начал срываться, подгузники повторяются, любимая точка известна.
2. Retrieval находит «Ключ запаса»; ranker выбирает SKU и окно; LLM объясняет без вывода «у вас ребёнок».
3. Новый синтетический чек автоматически даёт `3/3`; право активируется одним нажатием.
4. На 10 000 пользователей ordinary top-1 запрашивает 800 единиц при capacity 100; allocator оставляет 100 положительных назначений и соблюдает fairness/budget.
5. Другой профиль получает price lock, участник favorite-store cohort — голос, organic loyal — `no_action`.
6. Duplicate receipt/self-referral задерживает награду; dashboard показывает reason code и scenario economics.

**Вау:** физическое право меняется от чека, а модель не только пишет текст — она распределяет дефицитный офлайн-ресурс и умеет отказать.

## 7. Пилот без смешения эффектов

**Этап 1 — user-level RCT одного подтверждённого права.** `BAU control` vs `fixed right с тем же бюджетом` vs `PrivilegeRank`; 20–30 сопоставимых «Пятёрочек», точный размер после power analysis. Primary — доля пользователей с `≥N` qualified visits или частота; экономика — contribution margin per eligible user после reward и operations cost. Guardrails: stockouts, staff minutes, no-show, 95p checkout time, complaints, opt-out и fraud loss.

**Этап 2 — cluster-RCT store voice.** Магазины рандомизируются целиком: BAU feedback vs голосование с гарантированным SLA. Primary тот же; дополнительно return to favorite store, participation и execution trust. Не смешиваем этот эффект с user-level personalization.

**Stop-rule:** выключаем право, если оно не растит primary, ухудшает baseline service или полная стоимость поглощает margin. Synthetic uplift — проверка policy, не прогноз X5.

## 8. Почему это может выиграть и что ещё неизвестно

| Критерий жюри | Доказательство в PoC |
| --- | --- |
| Соответствие кейсу | Челлендж, progress/avatar, rank, referral, LLM, recommender, fraud и offline frequency связаны одним receipt-driven сценарием. |
| Практическая ценность | На поверхности удобство/экономия/влияние, а не игра; `no_action` и full operational cost защищают маржу. |
| Техническая обоснованность | Retrieval → grounded LLM → hard filters → ranker → global constrained allocation; три baseline и frozen eval. |
| Готовность | Четыре экрана, working pipeline, batch на 10 000, economics и fraud reason codes. |
| Защита | Другие команды покажут «LLM написал персональный квест»; мы покажем overload физического магазина и его корректное распределение. |

**Четыре blocking questions кейсодателю:**

1. Что именно означает «80% офлайн» и какая метрика текущей геймификации провалилась?
2. Какой дополнительный физический сервис можно реально квотировать: резерв SKU/корзины, pickup, assisted fast path или другое?
3. Какие store-level остатки, capabilities, очереди и staff-cost доступны хотя бы в пилоте?
4. Допустимы ли `no_action`, store voice с обязательным SLA и zero-money rewards?

**AI-след разработки:** AI-role-play и pain map с маркировкой synthetic; source matrix с оценкой причинности; генератор 10 000 профилей и edge cases; LLM JSON-contract, тесты и прототип. Человек проверяет источники, feasibility, экономику, безопасность и все финальные решения.

**Финальная позиция:** не доказываем, что «геймификация работает». Доказываем, что X5 может превратить пассивный игровой прогресс в исполнимое право любимой офлайн-точки и распределить его лучше generic challenge при том же бюджете.
