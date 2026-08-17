import json
import math
from typing import Any, Mapping


class ValidationError(ValueError):
    """An error caused by invalid API input."""


def query_parameters(event: Mapping[str, Any]) -> dict[str, str]:
    params = event.get("queryStringParameters") or {}
    if not isinstance(params, Mapping):
        raise ValidationError("クエリパラメータの形式が正しくありません。")
    return {str(key): str(value) for key, value in params.items() if value is not None}


def number(
    params: Mapping[str, str],
    name: str,
    *,
    minimum: float,
    maximum: float,
) -> float:
    raw = params.get(name)
    if raw is None or raw == "":
        raise ValidationError(f"{name} は必須です。")
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{name} は数値で指定してください。") from exc
    if not math.isfinite(value):
        raise ValidationError(f"{name} は有限の数値で指定してください。")
    if not minimum <= value <= maximum:
        raise ValidationError(f"{name} は {minimum:g}～{maximum:g} の範囲で指定してください。")
    return value


def response(status_code: int, payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
        "body": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
    }


def error_response(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, ValidationError):
        return response(400, {"error": {"code": "INVALID_INPUT", "message": str(exc)}})
    return response(500, {"error": {"code": "INTERNAL_ERROR", "message": "計算中にエラーが発生しました。"}})
