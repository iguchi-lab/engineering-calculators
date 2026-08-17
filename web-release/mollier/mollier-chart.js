const SVG_NS = "http://www.w3.org/2000/svg";
const KELVIN_OFFSET = 273.15;
const PA_PER_MPA = 1e6;
const MAX_PROPERTY = 1e100;

const finiteProperty = (value) => Number.isFinite(value) && Math.abs(value) < MAX_PROPERTY;

function property(coolprop, output, input1, value1, input2, value2, fluid) {
  const result = coolprop.PropsSI(output, input1, value1, input2, value2, fluid);
  if (!finiteProperty(result)) throw new Error(`${output}を計算できませんでした。`);
  return result;
}

function constantProperty(coolprop, output, fluid) {
  return property(coolprop, output, "", 0, "", 0, fluid);
}

function safeProperty(coolprop, output, input1, value1, input2, value2, fluid) {
  try {
    const result = coolprop.PropsSI(output, input1, value1, input2, value2, fluid);
    return finiteProperty(result) ? result : null;
  } catch {
    return null;
  }
}

function sequence(start, end, count) {
  if (count < 2) return [start];
  return Array.from({ length: count }, (_, index) => start + (end - start) * index / (count - 1));
}

function logSequence(start, end, count) {
  const startLog = Math.log(start);
  const endLog = Math.log(end);
  return sequence(startLog, endLog, count).map(Math.exp);
}

function propertySeries(coolprop, output, input1, value1, input2, values2, fluid, xScale = 1) {
  return values2.map((value2) => {
    const result = safeProperty(coolprop, output, input1, value1, input2, value2, fluid);
    return result == null ? null : result / xScale;
  });
}

function validateOptions(options) {
  const values = [
    options.evaporatingTemperature,
    options.condensingTemperature,
    options.superheat,
    options.subcooling,
    options.pressureMin,
    options.pressureMax,
  ];
  if (!values.every(Number.isFinite)) throw new Error("入力値を確認してください。");
  if (options.condensingTemperature <= options.evaporatingTemperature) {
    throw new Error("凝縮温度は蒸発温度より高くしてください。");
  }
  if (options.superheat < 0 || options.subcooling < 0) {
    throw new Error("過熱度と過冷却度は0以上にしてください。");
  }
  if (options.pressureMin <= 0 || options.pressureMax <= options.pressureMin) {
    throw new Error("圧力範囲を確認してください。");
  }
}

export function calculateMollierData(coolprop, options) {
  validateOptions(options);
  const fluid = options.fluid;
  const curvePoints = options.curvePoints ?? 140;
  const pressurePoints = options.pressurePoints ?? 100;
  const tripleTemperature = constantProperty(coolprop, "Ttriple", fluid);
  const criticalTemperature = constantProperty(coolprop, "Tcrit", fluid);
  const evaporatingTemperatureK = options.evaporatingTemperature + KELVIN_OFFSET;
  const condensingTemperatureK = options.condensingTemperature + KELVIN_OFFSET;

  if (!(tripleTemperature < evaporatingTemperatureK && evaporatingTemperatureK < criticalTemperature)) {
    throw new Error("蒸発温度は三重点と臨界点の間にしてください。");
  }
  if (!(tripleTemperature < condensingTemperatureK && condensingTemperatureK < criticalTemperature)) {
    throw new Error("凝縮温度は三重点と臨界点の間にしてください。");
  }

  const saturationStart = Math.max(tripleTemperature + 0.05, -52.15 + KELVIN_OFFSET);
  const saturationTemperatures = sequence(saturationStart, criticalTemperature - 0.05, curvePoints);
  const saturatedLiquid = [];
  const saturatedVapor = [];
  for (const temperature of saturationTemperatures) {
    const pressure = property(coolprop, "P", "T", temperature, "Q", 0, fluid) / PA_PER_MPA;
    saturatedLiquid.push({
      h: property(coolprop, "H", "T", temperature, "Q", 0, fluid) / 1000,
      p: pressure,
    });
    saturatedVapor.push({
      h: property(coolprop, "H", "T", temperature, "Q", 1, fluid) / 1000,
      p: pressure,
    });
  }

  const pressuresPa = logSequence(
    options.pressureMin * PA_PER_MPA,
    options.pressureMax * PA_PER_MPA,
    pressurePoints,
  );

  const entropyLines = [2.0, 2.2, 2.4].map((entropy) => ({
    value: entropy,
    points: propertySeries(coolprop, "H", "S", entropy * 1000, "P", pressuresPa, fluid, 1000)
      .map((h, index) => h == null ? null : { h, p: pressuresPa[index] / PA_PER_MPA }),
  }));

  const temperatureLines = [-20, 0, 20, 40, 60, 80, 100].map((temperature) => ({
    value: temperature,
    points: propertySeries(
      coolprop,
      "H",
      "T",
      temperature + KELVIN_OFFSET,
      "P",
      pressuresPa,
      fluid,
      1000,
    ).map((h, index) => h == null ? null : { h, p: pressuresPa[index] / PA_PER_MPA }),
  }));

  const evaporatingPressure = property(
    coolprop, "P", "T", evaporatingTemperatureK, "Q", 1, fluid,
  );
  const condensingPressure = property(
    coolprop, "P", "T", condensingTemperatureK, "Q", 0, fluid,
  );
  if (evaporatingPressure / PA_PER_MPA < options.pressureMin
      || condensingPressure / PA_PER_MPA > options.pressureMax) {
    throw new Error("サイクル圧力が表示圧力範囲外です。圧力範囲を広げてください。");
  }

  const compressorInletTemperature = evaporatingTemperatureK + options.superheat;
  const condenserExitTemperature = condensingTemperatureK - options.subcooling;
  const h1 = property(coolprop, "H", "T", compressorInletTemperature, "P", evaporatingPressure, fluid);
  const s1 = property(coolprop, "S", "T", compressorInletTemperature, "P", evaporatingPressure, fluid);
  const h2 = property(coolprop, "H", "S", s1, "P", condensingPressure, fluid);
  const h3 = property(coolprop, "H", "T", condenserExitTemperature, "P", condensingPressure, fluid);
  const rawStates = [
    [1, "圧縮機入口", h1, evaporatingPressure],
    [2, "圧縮機出口", h2, condensingPressure],
    [3, "凝縮器出口", h3, condensingPressure],
    [4, "膨張弁出口", h3, evaporatingPressure],
  ];
  const states = rawStates.map(([number, name, enthalpy, pressure]) => ({
    number,
    name,
    h: enthalpy / 1000,
    p: pressure / PA_PER_MPA,
    t: property(coolprop, "T", "H", enthalpy, "P", pressure, fluid) - KELVIN_OFFSET,
    s: property(coolprop, "S", "H", enthalpy, "P", pressure, fluid) / 1000,
  }));

  const compressionPressures = logSequence(evaporatingPressure, condensingPressure, 80);
  const compression = propertySeries(
    coolprop, "H", "S", s1, "P", compressionPressures, fluid, 1000,
  ).map((h, index) => h == null ? null : {
    h,
    p: compressionPressures[index] / PA_PER_MPA,
  });

  return {
    fluid,
    pressureMin: options.pressureMin,
    pressureMax: options.pressureMax,
    saturatedLiquid,
    saturatedVapor,
    entropyLines,
    temperatureLines,
    states,
    compression,
  };
}

function svgElement(name, attributes = {}, text = "") {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  return element;
}

function pathData(points, project) {
  let data = "";
  let drawing = false;
  for (const point of points) {
    if (!point || !Number.isFinite(point.h) || !Number.isFinite(point.p)) {
      drawing = false;
      continue;
    }
    const [x, y] = project(point);
    data += `${drawing ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    drawing = true;
  }
  return data;
}

function appendPath(group, points, project, attributes) {
  const d = pathData(points, project);
  if (d) group.append(svgElement("path", { d, fill: "none", ...attributes }));
}

function lastPoint(points) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index]) return points[index];
  }
  return null;
}

export function renderMollierDiagram(svg, data) {
  const width = 960;
  const height = 640;
  const margin = { top: 50, right: 54, bottom: 66, left: 76 };
  const hMin = 100;
  const hMax = 700;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const logMin = Math.log(data.pressureMin);
  const logMax = Math.log(data.pressureMax);
  const project = ({ h, p }) => [
    margin.left + (h - hMin) * plotWidth / (hMax - hMin),
    margin.top + (logMax - Math.log(p)) * plotHeight / (logMax - logMin),
  ];

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("xmlns", SVG_NS);
  svg.append(svgElement("title", { id: "mollier-title" }, `p-h線図（${data.fluid}）`));
  svg.append(svgElement("desc", { id: "mollier-description" }, "冷媒の飽和線、等温線、等エントロピー線と理想冷凍サイクルを示します。"));
  svg.append(svgElement("rect", { width, height, fill: "#ffffff" }));
  svg.append(svgElement("text", {
    x: width / 2, y: 27, "text-anchor": "middle", fill: "#17212b",
    "font-size": 19, "font-weight": 700,
  }, `p-h線図（${data.fluid}）`));

  const clipId = "mollier-plot-clip";
  const defs = svgElement("defs");
  const clip = svgElement("clipPath", { id: clipId });
  clip.append(svgElement("rect", {
    x: margin.left, y: margin.top, width: plotWidth, height: plotHeight,
  }));
  defs.append(clip);
  svg.append(defs);

  const plot = svgElement("g", { "clip-path": `url(#${clipId})` });
  svg.append(plot);
  const pressureTicks = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 2, 3, 4, 5, 6, 8, 10]
    .filter((value) => value >= data.pressureMin && value <= data.pressureMax);
  for (const pressure of pressureTicks) {
    const [, y] = project({ h: hMin, p: pressure });
    plot.append(svgElement("line", {
      x1: margin.left, y1: y, x2: margin.left + plotWidth, y2: y,
      stroke: Number.isInteger(pressure) ? "#94a3b8" : "#d7dee5",
      "stroke-width": Number.isInteger(pressure) ? 0.8 : 0.45,
    }));
  }
  for (let enthalpy = hMin; enthalpy <= hMax; enthalpy += 50) {
    const [x] = project({ h: enthalpy, p: data.pressureMin });
    plot.append(svgElement("line", {
      x1: x, y1: margin.top, x2: x, y2: margin.top + plotHeight,
      stroke: enthalpy % 100 === 0 ? "#cbd5e1" : "#e8edf1",
      "stroke-width": enthalpy % 100 === 0 ? 0.7 : 0.4,
    }));
  }

  for (const line of data.temperatureLines) {
    appendPath(plot, line.points, project, {
      stroke: "#4f8bd6", "stroke-width": 0.85, "stroke-dasharray": "5 3",
    });
    const point = lastPoint(line.points);
    if (point) {
      const [x, y] = project(point);
      plot.append(svgElement("text", {
        x: x - 5, y: y - 5, "text-anchor": "end", fill: "#2563a5", "font-size": 10,
      }, `${line.value}℃`));
    }
  }
  for (const line of data.entropyLines) {
    appendPath(plot, line.points, project, { stroke: "#9f3c3c", "stroke-width": 0.9 });
    const point = lastPoint(line.points);
    if (point) {
      const [x, y] = project(point);
      plot.append(svgElement("text", {
        x: x - 5, y: y + 12, "text-anchor": "end", fill: "#8b2f2f", "font-size": 10,
      }, `s=${line.value.toFixed(1)}`));
    }
  }

  appendPath(plot, data.saturatedLiquid, project, {
    stroke: "#111827", "stroke-width": 1.5, "stroke-dasharray": "6 3",
  });
  appendPath(plot, data.saturatedVapor, project, {
    stroke: "#111827", "stroke-width": 1.5, "stroke-dasharray": "6 3",
  });

  const byNumber = Object.fromEntries(data.states.map((state) => [state.number, state]));
  appendPath(plot, [byNumber[4], byNumber[1]], project, { stroke: "#dc2626", "stroke-width": 2 });
  appendPath(plot, data.compression, project, { stroke: "#dc2626", "stroke-width": 2 });
  appendPath(plot, [byNumber[2], byNumber[3]], project, { stroke: "#dc2626", "stroke-width": 2 });
  appendPath(plot, [byNumber[3], byNumber[4]], project, { stroke: "#dc2626", "stroke-width": 2 });
  for (const state of data.states) {
    const [x, y] = project(state);
    plot.append(svgElement("circle", {
      cx: x, cy: y, r: 6, fill: "#dc2626", stroke: "#ffffff", "stroke-width": 2,
    }));
    plot.append(svgElement("text", {
      x: x + 8, y: y - 8, fill: "#b91c1c", "font-size": 12, "font-weight": 700,
      stroke: "#ffffff", "stroke-width": 3, "paint-order": "stroke",
    }, String(state.number)));
  }

  const axes = svgElement("g", { fill: "#334155", "font-size": 11 });
  svg.append(axes);
  axes.append(svgElement("rect", {
    x: margin.left, y: margin.top, width: plotWidth, height: plotHeight,
    fill: "none", stroke: "#17212b", "stroke-width": 1,
  }));
  for (let enthalpy = hMin; enthalpy <= hMax; enthalpy += 100) {
    const [x, y] = project({ h: enthalpy, p: data.pressureMin });
    axes.append(svgElement("line", { x1: x, y1: y, x2: x, y2: y + 6, stroke: "#17212b" }));
    axes.append(svgElement("text", { x, y: y + 22, "text-anchor": "middle" }, String(enthalpy)));
  }
  for (const pressure of pressureTicks) {
    const [x, y] = project({ h: hMin, p: pressure });
    axes.append(svgElement("line", { x1: x - 6, y1: y, x2: x, y2: y, stroke: "#17212b" }));
    axes.append(svgElement("text", { x: x - 10, y: y + 4, "text-anchor": "end" }, String(pressure)));
  }
  axes.append(svgElement("text", {
    x: margin.left + plotWidth / 2, y: height - 16, "text-anchor": "middle",
    "font-size": 14, "font-weight": 650,
  }, "比エンタルピー h [kJ/kg]"));
  axes.append(svgElement("text", {
    x: 18, y: margin.top + plotHeight / 2,
    transform: `rotate(-90 18 ${margin.top + plotHeight / 2})`,
    "text-anchor": "middle", "font-size": 14, "font-weight": 650,
  }, "圧力 P [MPa]（対数目盛）"));

  const legend = svgElement("g", { "font-size": 11 });
  svg.append(legend);
  const legendItems = [
    ["#111827", "6 3", "飽和液線・飽和蒸気線"],
    ["#4f8bd6", "5 3", "等温線"],
    ["#9f3c3c", "", "等エントロピー線"],
    ["#dc2626", "", "理想冷凍サイクル"],
  ];
  legendItems.forEach(([color, dash, label], index) => {
    const y = margin.top + 18 + index * 19;
    legend.append(svgElement("line", {
      x1: margin.left + 12, y1: y, x2: margin.left + 45, y2: y,
      stroke: color, "stroke-width": 2, "stroke-dasharray": dash,
    }));
    legend.append(svgElement("text", {
      x: margin.left + 51, y: y + 4, fill: "#334155",
      stroke: "#ffffff", "stroke-width": 3, "paint-order": "stroke",
    }, label));
  });
}

export function downloadMollierSvg(svg, filename = "mollier-diagram.svg") {
  const serialized = new XMLSerializer().serializeToString(svg);
  const blob = new Blob(
    [`<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`],
    { type: "image/svg+xml;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
