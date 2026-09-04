"""Проверяет фикстуры решений против schema/action.schema.json: required, enum, лишние поля, типы."""
import json, pathlib, sys

root = pathlib.Path(__file__).parent
schema = json.loads((root / "schema/action.schema.json").read_text(encoding="utf-8"))
props, required = schema["properties"], set(schema["required"])
errors = []

for path in sorted((root / "fixtures").glob("*.json")):
    doc = json.loads(path.read_text(encoding="utf-8"))
    action = doc.get("decision")
    if action is None:
        continue
    for key in required - action.keys():
        errors.append(f"{path.name}: нет обязательного поля {key}")

    arm, fill, surface = action.get("experiment_arm"), action.get("sponsored_result"), action.get("surface_result")
    if arm == "holdout" and (fill != "not_applicable" or surface != "none"):
        errors.append(f"{path.name}: холдаут не может иметь рекламного результата или показа")
    if fill == "filled" and surface != "sponsored":
        errors.append(f"{path.name}: кампания выбрана, но показ не sponsored")
    if surface == "sponsored" and fill != "filled":
        errors.append(f"{path.name}: sponsored-показ без выбранной кампании")
    if arm == "holdout" and action.get("ghost") is None:
        errors.append(f"{path.name}: у холдаута нет ghost-записи")
    if arm != "holdout" and action.get("ghost") is not None:
        errors.append(f"{path.name}: ghost записан не для холдаута")
    for key, value in action.items():
        spec = props.get(key)
        if spec is None:
            errors.append(f"{path.name}: поле {key} нет в схеме")
            continue
        if "enum" in spec and value not in spec["enum"]:
            errors.append(f"{path.name}: {key}={value!r} вне enum")
        if spec.get("type") == "number" and not isinstance(value, (int, float)):
            errors.append(f"{path.name}: {key} должно быть числом")
        if key == "objective_scores" and isinstance(value, dict):
            missing = {"media_net", "x5_incremental_value", "total"} - value.keys()
            if missing:
                errors.append(f"{path.name}: в objective_scores нет {', '.join(sorted(missing))}")
        if key == "propensity" and isinstance(value, dict):
            missing = {"experiment", "action_given_serve", "logging"} - value.keys()
            if missing:
                errors.append(f"{path.name}: в propensity нет {', '.join(sorted(missing))}")
            else:
                expected = value["experiment"] * value["action_given_serve"] * (value.get("creative_given_campaign") or 1.0)
                if abs(expected - value["logging"]) > 1e-3:
                    errors.append(f"{path.name}: logging propensity не равна произведению множителей")

print("\n".join(errors) if errors else f"фикстуры валидны по схеме: {len(list((root/'fixtures').glob('*.json')))} файлов")
sys.exit(1 if errors else 0)
