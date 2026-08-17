import logging
import math
from typing import Any, Callable

from functions.common import ValidationError, error_response, number, query_parameters, response

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

STANDARD_PRESSURE_PA = 101_325.0
DRY_AIR_GAS_CONSTANT = 287.042
WATER_VAPOR_GAS_CONSTANT = 461.52
HUMIDITY_RATIO_COEFFICIENT = 0.621945


def saturation_pressure(temperature_c: float) -> float:
    """ASHRAE saturation vapor pressure in Pa for -100 to 200 deg C."""
    temperature_k = temperature_c + 273.15
    if not 173.15 <= temperature_k <= 473.15:
        raise ValidationError("温度は -100～200 ℃ の範囲で指定してください。")
    if temperature_k <= 273.15:
        coefficients = (-5674.5359, 6.3925247, -0.009677843, 6.2215701e-7, 2.0747825e-9, -9.484024e-13)
        ln_pressure = (
            coefficients[0] / temperature_k
            + coefficients[1]
            + coefficients[2] * temperature_k
            + coefficients[3] * temperature_k**2
            + coefficients[4] * temperature_k**3
            + coefficients[5] * temperature_k**4
            + 4.1635019 * math.log(temperature_k)
        )
    else:
        ln_pressure = (
            -5800.2206 / temperature_k
            + 1.3914993
            - 0.048640239 * temperature_k
            + 4.1764768e-5 * temperature_k**2
            - 1.4452093e-8 * temperature_k**3
            + 6.5459673 * math.log(temperature_k)
        )
    return math.exp(ln_pressure)


def bisect(function: Callable[[float], float], low: float, high: float) -> float:
    low_value = function(low)
    high_value = function(high)
    if low_value == 0:
        return low
    if high_value == 0:
        return high
    if low_value * high_value > 0:
        raise ValidationError("指定された条件から状態点を求められません。")
    for _ in range(100):
        middle = (low + high) / 2.0
        value = function(middle)
        if abs(value) < 0.001 or high - low < 1e-7:
            return middle
        if low_value * value <= 0:
            high = middle
        else:
            low = middle
            low_value = value
    return (low + high) / 2.0


def dew_point_from_vapor_pressure(vapor_pressure: float) -> float:
    if vapor_pressure <= 0:
        raise ValidationError("水蒸気圧は0より大きい必要があります。")
    return bisect(lambda temperature: saturation_pressure(temperature) - vapor_pressure, -100.0, 100.0)


def vapor_pressure_from_humidity_ratio(humidity_ratio: float, pressure: float) -> float:
    return pressure * humidity_ratio / (HUMIDITY_RATIO_COEFFICIENT + humidity_ratio)


def solve_state(params: dict[str, str]) -> dict[str, float]:
    mode = params.get("mode", "ta-rh")
    pressure = number(params, "pressure", minimum=60_000.0, maximum=120_000.0) if "pressure" in params else STANDARD_PRESSURE_PA

    if mode == "ta-rh":
        ta = number(params, "ta", minimum=-50.0, maximum=80.0)
        rh = number(params, "rh", minimum=0.1, maximum=100.0)
        vapor_pressure = saturation_pressure(ta) * rh / 100.0
    elif mode == "ta-td":
        ta = number(params, "ta", minimum=-50.0, maximum=80.0)
        td = number(params, "td", minimum=-80.0, maximum=80.0)
        if td > ta:
            raise ValidationError("露点温度は乾球温度以下にしてください。")
        vapor_pressure = saturation_pressure(td)
        rh = 100.0 * vapor_pressure / saturation_pressure(ta)
    elif mode == "ta-x":
        ta = number(params, "ta", minimum=-50.0, maximum=80.0)
        humidity_ratio_g = number(params, "x", minimum=0.01, maximum=100.0)
        vapor_pressure = vapor_pressure_from_humidity_ratio(humidity_ratio_g / 1000.0, pressure)
        rh = 100.0 * vapor_pressure / saturation_pressure(ta)
    elif mode == "rh-x":
        rh = number(params, "rh", minimum=0.1, maximum=100.0)
        humidity_ratio_g = number(params, "x", minimum=0.01, maximum=100.0)
        vapor_pressure = vapor_pressure_from_humidity_ratio(humidity_ratio_g / 1000.0, pressure)
        target_saturation = vapor_pressure / (rh / 100.0)
        ta = dew_point_from_vapor_pressure(target_saturation)
    elif mode == "rh-td":
        rh = number(params, "rh", minimum=0.1, maximum=100.0)
        td = number(params, "td", minimum=-80.0, maximum=80.0)
        vapor_pressure = saturation_pressure(td)
        ta = dew_point_from_vapor_pressure(vapor_pressure / (rh / 100.0))
    else:
        raise ValidationError("mode は ta-rh、ta-td、ta-x、rh-x、rh-td のいずれかを指定してください。")

    if vapor_pressure >= pressure:
        raise ValidationError("水蒸気分圧が大気圧以上になる条件は指定できません。")
    if not 0.0 < rh <= 100.0:
        raise ValidationError("指定された条件では相対湿度が0～100%の範囲外になります。")

    humidity_ratio = HUMIDITY_RATIO_COEFFICIENT * vapor_pressure / (pressure - vapor_pressure)
    td = dew_point_from_vapor_pressure(vapor_pressure)
    enthalpy = 1.006 * ta + humidity_ratio * (2501.0 + 1.86 * ta)
    temperature_k = ta + 273.15
    density = (pressure - vapor_pressure) / (DRY_AIR_GAS_CONSTANT * temperature_k) + vapor_pressure / (
        WATER_VAPOR_GAS_CONSTANT * temperature_k
    )
    return {
        "ta": round(ta, 2),
        "rh": round(rh, 2),
        "td": round(td, 2),
        "x": round(humidity_ratio * 1000.0, 3),
        "h": round(enthalpy, 2),
        "rho": round(density, 4),
        "pressure": round(pressure, 1),
    }


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    try:
        return response(200, solve_state(query_parameters(event)))
    except ValidationError as exc:
        return error_response(exc)
    except Exception as exc:
        LOGGER.exception("Moist-air calculation failed")
        return error_response(exc)
