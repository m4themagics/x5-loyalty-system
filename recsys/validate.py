"""Validates decision fixtures against schema/action.schema.json: required, enum, extra fields, types."""
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
        errors.append(f"{path.name}: required field {key} is missing")

    arm, fill, surface = action.get("experiment_arm"), action.get("sponsored_result"), action.get("surface_result")
    if arm == "holdout" and (fill != "not_applicable" or surface != "none"):
        errors.append(f"{path.name}: a holdout cannot have an ad result or an exposure")
    if fill == "filled" and surface != "sponsored":
        errors.append(f"{path.name}: a campaign was selected but the surface is not sponsored")
    if surface == "sponsored" and fill != "filled":
        errors.append(f"{path.name}: a sponsored surface without a selected campaign")
    if arm == "holdout" and action.get("ghost") is None:
        errors.append(f"{path.name}: the holdout has no ghost record")
    if arm != "holdout" and action.get("ghost") is not None:
        errors.append(f"{path.name}: a ghost record outside a holdout")
    for key, value in action.items():
        spec = props.get(key)
        if spec is None:
            errors.append(f"{path.name}: field {key} is not in the schema")
            continue
        if "enum" in spec and value not in spec["enum"]:
            errors.append(f"{path.name}: {key}={value!r} is outside the enum")
        if spec.get("type") == "number" and not isinstance(value, (int, float)):
            errors.append(f"{path.name}: {key} must be a number")
        if key == "objective_scores" and isinstance(value, dict):
            missing = {"media_net", "x5_incremental_value", "total"} - value.keys()
            if missing:
                errors.append(f"{path.name}: objective_scores is missing {', '.join(sorted(missing))}")
        if key == "propensity" and isinstance(value, dict):
            missing = {"experiment", "action_given_serve", "logging"} - value.keys()
            if missing:
                errors.append(f"{path.name}: propensity is missing {', '.join(sorted(missing))}")
            else:
                expected = value["experiment"] * value["action_given_serve"] * (value.get("creative_given_campaign") or 1.0)
                if abs(expected - value["logging"]) > 1e-3:
                    errors.append(f"{path.name}: the logging propensity does not equal the product of its factors")

print("\n".join(errors) if errors else f"fixtures are valid against the schema: {len(list((root/'fixtures').glob('*.json')))} files")
sys.exit(1 if errors else 0)
