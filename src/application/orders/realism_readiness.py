"""Auditable progress toward the internal trading-realism target."""

from __future__ import annotations

import importlib
import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[3]
TARGETS_PATH = BASE_DIR / "config" / "internal_trading_realism_targets.json"


def _resolve_object(module, dotted_name: str):
    value = module
    for part in dotted_name.split("."):
        value = getattr(value, part)
    return value


def build_internal_trading_realism_readiness() -> dict:
    definition = json.loads(TARGETS_PATH.read_text(encoding="utf-8"))
    items = definition.get("items") or []
    weight = 100.0 / len(items) if items else 0.0
    rows = []
    for item in items:
        missing = []
        validation_required = bool(item.get("validation_required"))
        if validation_required:
            missing.append(str(item.get("evidence") or "runtime validation evidence"))
        else:
            module_name = str(item.get("module") or "")
            try:
                module = importlib.import_module(module_name)
            except Exception as exc:
                module = None
                missing.append(f"{module_name}: {type(exc).__name__}")
            if module is not None:
                for object_name in item.get("objects") or []:
                    try:
                        _resolve_object(module, str(object_name))
                    except AttributeError:
                        missing.append(f"{module_name}.{object_name}")
            for relative_path in item.get("paths") or []:
                if not (BASE_DIR / str(relative_path)).is_file():
                    missing.append(str(relative_path))
        complete = not missing
        rows.append({
            "id": item.get("id"), "name": item.get("name"),
            "weight_pct": round(weight, 2), "current_pct": round(weight if complete else 0.0, 2),
            "complete": complete, "required_for_target": bool(item.get("required_for_target", True)),
            "validation_required": validation_required, "missing": missing,
        })
    implementation_pct = round(sum(row["current_pct"] for row in rows), 1)
    target = int(definition.get("target_pct") or 95)
    required_complete = all(row["complete"] for row in rows if row["required_for_target"])
    validation_complete = all(row["complete"] for row in rows if row["validation_required"])
    code_target_achieved = implementation_pct >= target and required_complete
    return {
        "name": definition.get("name"), "target_pct": target,
        "current_pct": implementation_pct,
        "implementation_pct": implementation_pct,
        "code_target_achieved": code_target_achieved,
        # Never claim the trading objective itself is achieved from imports or
        # unit tests alone. Runtime evidence must close every validation item.
        "operational_validation_complete": validation_complete,
        "target_achieved": code_target_achieved and validation_complete,
        "status": (
            "validated" if code_target_achieved and validation_complete
            else "implementation_complete_validation_pending" if code_target_achieved
            else "implementation_incomplete"
        ),
        "measurement": (
            "20 equally weighted controls. current_pct measures implementation only; "
            "target_achieved also requires runtime validation evidence."
        ),
        "items": rows,
        "remaining": [row for row in rows if not row["complete"]],
    }
