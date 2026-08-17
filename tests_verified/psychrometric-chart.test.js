import test from "node:test";
import assert from "node:assert/strict";

import {
  chartTemperature,
  humidityRatio,
  renderPsychrometricChart,
  saturationPressure,
} from "../web-release/air/psychrometric-chart.js";

class MockSvgNode {
  constructor(name) {
    this.name = name;
    this.attributes = {};
    this.children = [];
    this.textContent = "";
  }

  setAttribute(key, value) {
    this.attributes[key] = String(value);
  }

  append(child) {
    this.children.push(child);
  }

  replaceChildren(...children) {
    this.children = children;
  }
}

globalThis.document = {
  createElementNS(_namespace, name) {
    return new MockSvgNode(name);
  },
};

function findNodes(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  for (const child of node.children) findNodes(child, predicate, matches);
  return matches;
}

test("Tetens saturation pressure matches the Python source equation", () => {
  assert.ok(Math.abs(saturationPressure(25) - 3.1678) < 0.001);
});

test("lower pressure increases humidity ratio", () => {
  assert.ok(humidityRatio(25, 50, 80) > humidityRatio(25, 50, 101.325));
});

test("oblique transform is finite at the reference temperature", () => {
  assert.equal(chartTemperature(50, 0.02), 50);
});

test("dry-bulb lines lean left below the reference temperature", () => {
  assert.ok(chartTemperature(20, 0.02) < chartTemperature(20, 0.005));
});

test("chart renders SVG paths and the calculated state marker", () => {
  const svg = new MockSvgNode("svg");
  const plotted = renderPsychrometricChart(svg, {
    ta: 25,
    rh: 50,
    x: 9.88,
    h: 50.32,
  }, 101.325);

  assert.equal(plotted, true);
  assert.equal(svg.attributes.viewBox, "0 0 960 640");
  assert.ok(svg.children.length > 5);
  assert.ok(svg.children.some((child) => child.name === "g"));
  assert.equal(findNodes(svg, (node) => node.attributes["data-role"] === "enthalpy-axis").length, 1);
  const enthalpyTitle = findNodes(svg, (node) => node.attributes["data-role"] === "enthalpy-title")[0];
  assert.equal(enthalpyTitle.textContent, "比エンタルピー h [kJ/kg(DA)]");
  assert.equal(enthalpyTitle.attributes["data-axis-offset"], "24");
  const enthalpyLines = findNodes(svg, (node) => node.attributes["data-role"] === "enthalpy-line");
  assert.equal(enthalpyLines.length, 13);
  assert.ok(enthalpyLines.every((node) => node.attributes["data-axis-hit"] === "true"));
  assert.ok(enthalpyLines.every((node) => node.attributes.d.startsWith("M")));
  const saturationLine = findNodes(
    svg,
    (node) => node.attributes["data-role"] === "relative-humidity-line"
      && node.attributes["data-rh"] === "100",
  )[0];
  const fortyDegreeLine = findNodes(
    svg,
    (node) => node.attributes["data-role"] === "dry-bulb-line"
      && node.attributes["data-temperature"] === "40",
  )[0];
  assert.ok(saturationLine.attributes.d.endsWith(",52.00"));
  assert.ok(fortyDegreeLine.attributes.d.endsWith(",52.00"));
  const enthalpyTicks = findNodes(svg, (node) => node.attributes["data-role"] === "enthalpy-tick");
  assert.equal(enthalpyTicks.length, 12);
  assert.deepEqual(enthalpyTicks.map((node) => node.textContent), [
    "10", "20", "30", "40", "50", "60", "70", "80", "90", "100", "110", "120",
  ]);
});
