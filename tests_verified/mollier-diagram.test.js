import test from "node:test";
import assert from "node:assert/strict";

import CoolPropModule from "../web-release/mollier/vendor/coolprop-8.0.0/coolprop.js";
import { calculateMollierData } from "../web-release/mollier/mollier-chart.js";

const coolprop = await CoolPropModule();

test("CoolProp WASM provides the R32 critical temperature", () => {
  const critical = coolprop.PropsSI("Tcrit", "", 0, "", 0, "R32");
  assert.ok(Math.abs(critical - 351.255) < 0.05);
});

test("Mollier data preserves the ideal refrigeration cycle invariants", () => {
  const data = calculateMollierData(coolprop, {
    fluid: "R32",
    evaporatingTemperature: 6.85,
    condensingTemperature: 51.85,
    superheat: 5,
    subcooling: 5,
    pressureMin: 0.3,
    pressureMax: 5,
    curvePoints: 30,
    pressurePoints: 24,
  });

  assert.equal(data.states.length, 4);
  const byNumber = Object.fromEntries(data.states.map((state) => [state.number, state]));
  assert.ok(Math.abs(byNumber[1].p - byNumber[4].p) < 1e-9);
  assert.ok(Math.abs(byNumber[2].p - byNumber[3].p) < 1e-9);
  assert.ok(Math.abs(byNumber[3].h - byNumber[4].h) < 1e-9);
  assert.ok(Math.abs(byNumber[1].s - byNumber[2].s) < 1e-7);
  assert.equal(data.saturatedLiquid.length, 30);
  assert.equal(data.saturatedVapor.length, 30);
});
