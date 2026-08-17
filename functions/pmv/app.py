import logging
import math
from typing import Any

from functions.common import ValidationError, error_response, number, query_parameters, response

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)


def calculate_pmv_ppd(
    air_temperature: float,
    mean_radiant_temperature: float,
    air_speed: float,
    relative_humidity: float,
    metabolic_rate: float,
    clothing: float,
    external_work: float = 0.0,
) -> tuple[float, float]:
    """Calculate PMV and PPD using the ISO 7730 Fanger model."""
    water_vapor_pressure = relative_humidity * 10.0 * math.exp(
        16.6536 - 4030.183 / (air_temperature + 235.0)
    )
    clothing_insulation = 0.155 * clothing
    metabolic_heat = metabolic_rate * 58.15
    external_heat = external_work * 58.15
    internal_heat = metabolic_heat - external_heat

    clothing_area_factor = (
        1.0 + 1.29 * clothing_insulation
        if clothing_insulation <= 0.078
        else 1.05 + 0.645 * clothing_insulation
    )
    forced_convection = 12.1 * math.sqrt(air_speed)
    air_kelvin = air_temperature + 273.0
    radiant_kelvin = mean_radiant_temperature + 273.0
    initial_clothing_temperature = air_kelvin + (35.5 - air_temperature) / (
        3.5 * clothing_insulation + 0.1
    )

    p1 = clothing_insulation * clothing_area_factor
    p2 = p1 * 3.96
    p3 = p1 * 100.0
    p4 = p1 * air_kelvin
    p5 = 308.7 - 0.028 * internal_heat + p2 * (radiant_kelvin / 100.0) ** 4
    xn = initial_clothing_temperature / 100.0
    xf = initial_clothing_temperature / 50.0

    heat_transfer = forced_convection
    for _ in range(150):
        xf = (xf + xn) / 2.0
        natural_convection = 2.38 * abs(100.0 * xf - air_kelvin) ** 0.25
        heat_transfer = max(forced_convection, natural_convection)
        xn = (p5 + p4 * heat_transfer - p2 * xf**4) / (100.0 + p3 * heat_transfer)
        if abs(xn - xf) <= 0.00015:
            break
    else:
        raise ArithmeticError("PMV calculation did not converge")

    clothing_surface_temperature = 100.0 * xn - 273.0
    skin_diffusion = 0.00305 * (5733.0 - 6.99 * internal_heat - water_vapor_pressure)
    sweating = 0.42 * (internal_heat - 58.15) if internal_heat > 58.15 else 0.0
    latent_respiration = 1.7e-5 * metabolic_heat * (5867.0 - water_vapor_pressure)
    dry_respiration = 0.0014 * metabolic_heat * (34.0 - air_temperature)
    radiation = 3.96 * clothing_area_factor * (xn**4 - (radiant_kelvin / 100.0) ** 4)
    convection = clothing_area_factor * heat_transfer * (
        clothing_surface_temperature - air_temperature
    )
    transfer_coefficient = 0.303 * math.exp(-0.036 * metabolic_heat) + 0.028
    pmv = transfer_coefficient * (
        internal_heat
        - skin_diffusion
        - sweating
        - latent_respiration
        - dry_respiration
        - radiation
        - convection
    )
    ppd = 100.0 - 95.0 * math.exp(-0.03353 * pmv**4 - 0.2179 * pmv**2)
    return pmv, ppd


def sensation(pmv: float) -> dict[str, str]:
    if pmv < -2.5:
        return {"en": "Cold", "ja": "寒い"}
    if pmv < -1.5:
        return {"en": "Cool", "ja": "涼しい"}
    if pmv < -0.5:
        return {"en": "Slightly Cool", "ja": "やや寒い"}
    if pmv <= 0.5:
        return {"en": "Neutral", "ja": "中立"}
    if pmv <= 1.5:
        return {"en": "Slightly Warm", "ja": "やや暑い"}
    if pmv <= 2.5:
        return {"en": "Warm", "ja": "暑い"}
    return {"en": "Hot", "ja": "非常に暑い"}


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    try:
        params = query_parameters(event)
        values = {
            "ta": number(params, "ta", minimum=10.0, maximum=40.0),
            "rh": number(params, "rh", minimum=0.0, maximum=100.0),
            "mrt": number(params, "mrt", minimum=10.0, maximum=50.0),
            "v": number(params, "v", minimum=0.0, maximum=3.0),
            "clo": number(params, "clo", minimum=0.0, maximum=2.0),
            "met": number(params, "met", minimum=0.8, maximum=4.0),
        }
        pmv, ppd = calculate_pmv_ppd(
            values["ta"], values["mrt"], values["v"], values["rh"], values["met"], values["clo"]
        )
        return response(
            200,
            {
                "pmv": round(pmv, 1),
                "ppd": round(ppd),
                "sensation": sensation(pmv),
                "input": values,
            },
        )
    except ValidationError as exc:
        return error_response(exc)
    except Exception as exc:  # Lambda boundary: log details, return a stable public error.
        LOGGER.exception("PMV calculation failed")
        return error_response(exc)
