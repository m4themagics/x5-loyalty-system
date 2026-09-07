# Документация

## Продукт

| Документ | О чём |
| --- | --- |
| [project-description.md](project/project-description.md) | Полное описание продукта: механика, экономика, границы PoC |
| [item-pool.md](project/item-pool.md) | Каталог 24 предметов, редкости, составы семи рецептов |
| [product-materials.md](project/product-materials.md) | Пользовательские и операторские сценарии |
| [case-brief.md](project/case-brief.md) | Исходный кейс, дословно |
| [plan.md](project/plan.md) | Разделение работ и приёмка |
| [poc-status.md](project/poc-status.md) | Что реализовано, а что осталось гипотезой |
| [context-pack.md](project/context-pack.md) | Рабочий контекст проекта |

## Движок решений

Контракты, границы и результаты независимой оценки описаны отдельно:

- [recsys/README.md](../recsys/README.md) — обзор движка и что подтверждают проверки
- [recsys/contract/README.md](../recsys/contract/README.md) — общий контракт webapp ↔ Python
- [recsys/engine/README.md](../recsys/engine/README.md) — выбор задания, Ads-аукцион, экономика
- [recsys/eval/README.md](../recsys/eval/README.md) — релевантность, симуляции, offline learned RecSys

## Запуск и проверки

Установка и запуск — в [корневом README](../README.md). Все проверки разом:

```bash
bun run check
```

## Картинки документации

Скриншоты и анимации в `assets/screenshots/` снимаются с работающего приложения командой
`bun run docs:shots`. Съёмка живёт в `webapp/scripts/docs-shots/` и берёт селекторы из общих
помощников e2e, поэтому не расходится с интерфейсом. Пересоберите картинки после заметных
изменений экранов.

Исходники маскота лежат в `assets/mascot-source/`: четыре позы и две накладки косметики.
Готовые слои для приложения собраны из них в `webapp/public/assets/character/`.
