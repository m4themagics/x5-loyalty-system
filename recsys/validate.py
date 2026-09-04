"""Проверяет фикстуры против schema/action.schema.json: required, enum, additionalProperties, типы."""
import json, pathlib, sys

root = pathlib.Path(__file__).parent
schema = json.loads((root / "schema/action.schema.json").read_text(encoding="utf-8"))
props, required = schema["properties"], set(schema["required"])
errors = []

for path in sorted((root / "fixtures").glob("*.json")):
    doc = json.loads(path.read_text(encoding="utf-8"))
    action = doc.get("action")
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

print("\n".join(errors) if errors else f"фикстуры валидны по схеме: {len(list((root/'fixtures').glob('*.json')))} файлов")
sys.exit(1 if errors else 0)
