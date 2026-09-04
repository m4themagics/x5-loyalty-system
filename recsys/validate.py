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
            missing = {"media_value", "x5_value", "penalties", "total"} - value.keys()
            if missing:
                errors.append(f"{path.name}: в objective_scores нет {', '.join(sorted(missing))}")

print("\n".join(errors) if errors else f"фикстуры валидны по схеме: {len(list((root/'fixtures').glob('*.json')))} файлов")
sys.exit(1 if errors else 0)
