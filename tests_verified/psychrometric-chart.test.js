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
});
