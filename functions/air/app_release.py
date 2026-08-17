"""Release entry point with a numerically safe dew-point search boundary."""

from typing import Any

from functions.air import app as core


def dew_point_from_vapor_pressure(vapor_pressure: float) -> float:
    if vapor_pressure <= 0:
        raise core.ValidationError("水蒸気圧は0より大きい必要があります。")
    return core.bisect(
        lambda temperature: core.saturation_pressure(temperature) - vapor_pressure,
        -99.9,
        100.0,
    )


# solve_state resolves this function from the core module's global namespace.
core.dew_point_from_vapor_pressure = dew_point_from_vapor_pressure

solve_state = core.solve_state


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    return core.lambda_handler(event, context)

