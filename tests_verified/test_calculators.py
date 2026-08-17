import json

import pytest

from functions.air.app_release import lambda_handler as air_handler
from functions.air.app_release import solve_state
from functions.pmv.app import calculate_pmv_ppd
from functions.pmv.app import lambda_handler as pmv_handler


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        ((20, 20, 0.2, 50, 1.0, 1.0), (-1.1, 32)),
        ((25, 25, 0.1, 50, 1.2, 0.5), (0.1, 5)),
        ((30, 32, 0.3, 70, 1.4, 0.7), (2.1, 79)),
    ],
)
def test_pmv_current_api_reference_points(values, expected):
    pmv, ppd = calculate_pmv_ppd(*values)
    assert round(pmv, 1) == pytest.approx(expected[0], abs=0.1)
    assert round(ppd) == pytest.approx(expected[1], abs=2)


def test_air_standard_reference_point():
    state = solve_state({"mode": "ta-rh", "ta": "25", "rh": "50"})
    assert state["td"] == pytest.approx(13.86, abs=0.1)
    assert state["x"] == pytest.approx(9.88, abs=0.1)
    assert state["h"] == pytest.approx(50.3, abs=0.3)
    assert state["rho"] == pytest.approx(1.177, abs=0.01)


def test_air_reverse_calculation():
    state = solve_state({"mode": "rh-x", "rh": "60", "x": "10"})
    assert state["ta"] == pytest.approx(22.2, abs=0.2)
    assert state["td"] == pytest.approx(14.0, abs=0.2)


def test_invalid_values_return_400():
    air = air_handler({"queryStringParameters": {"mode": "ta-rh", "ta": "25", "rh": "150"}}, None)
    pmv = pmv_handler({"queryStringParameters": {"ta": "20", "rh": "150", "mrt": "20", "v": ".2", "clo": "1", "met": "1"}}, None)
    assert air["statusCode"] == pmv["statusCode"] == 400
    assert json.loads(air["body"])["error"]["code"] == "INVALID_INPUT"

