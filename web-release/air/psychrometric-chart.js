const SVG_NS = "http://www.w3.org/2000/svg";

export const CP_DA = 1.006;
export const H_FG = 2501.0;
export const CP_V = 1.86;

export function saturationPressure(temperatureC) {
  return 0.61078 * Math.exp((17.27 * temperatureC) / (temperatureC + 237.3));
}

export function humidityRatio(temperatureC, relativeHumidityPercent, pressureKpa = 101.325) {
  const vaporPressure = relativeHumidityPercent * saturationPressure(temperatureC) / 100;
  if (pressureKpa <= 0 || vaporPressure >= pressureKpa) return Number.NaN;
  return 0.622 * vaporPressure / (pressureKpa - vaporPressure);
}

export function humidityFromEnthalpy(temperatureC, enthalpyKjKg) {
  return (enthalpyKjKg - CP_DA * temperatureC) / (H_FG + CP_V * temperatureC);
}

export function chartTemperature(temperatureC, humidityKgKg) {
  return temperatureC + humidityKgKg * CP_V * (temperatureC - 50) / CP_DA;
}

function svgElement(name, attributes = {}, text = "") {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  return element;
}

function sequence(start, end, step) {
  const values = [];
  for (let value = start; value <= end + step / 10; value += step) values.push(value);
  return values;
}

function makePath(points, project) {
  let path = "";
  let drawing = false;
  for (const point of points) {
    if (!point) {
      drawing = false;
      continue;
    }
    const [x, y] = project(point[0], point[1]);
    path += `${drawing ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    drawing = true;
  }
  return path;
}

function addPath(group, points, project, attributes) {
  const d = makePath(points, project);
  if (d) group.append(svgElement("path", { d, fill: "none", ...attributes }));
}

export function renderPsychrometricChart(svg, state, pressureKpa = 101.325) {
  const width = 960;
  const height = 640;
  const margin = { top: 52, right: 90, bottom: 64, left: 58 };
  const xMin = -10.3;
  const xMax = 51;
  const yMin = 0;
  const yMax = 0.037;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const project = (x, y) => [
    margin.left + (x - xMin) * plotWidth / (xMax - xMin),
    margin.top + (yMax - y) * plotHeight / (yMax - yMin),
  ];
  const visible = (x, y) => Number.isFinite(x) && Number.isFinite(y)
    && x >= xMin && x <= xMax && y >= yMin && y <= yMax;
  const enthalpyAxisSlope = (0.037 - 0.004) / (29 - (-10.3));
  const enthalpyAxisIntercept = 0.004 - enthalpyAxisSlope * (-10.3);
  const enthalpyAxisHumidity = (x) => enthalpyAxisSlope * x + enthalpyAxisIntercept;
  const [enthalpyAxisStartX, enthalpyAxisStartY] = project(-10.3, 0.004);
  const [enthalpyAxisEndX, enthalpyAxisEndY] = project(29, 0.037);
  const enthalpyAxisDx = enthalpyAxisEndX - enthalpyAxisStartX;
  const enthalpyAxisDy = enthalpyAxisEndY - enthalpyAxisStartY;
  const enthalpyAxisLength = Math.hypot(enthalpyAxisDx, enthalpyAxisDy);
  const enthalpyAxisAngle = Math.atan2(enthalpyAxisDy, enthalpyAxisDx) * 180 / Math.PI;
  const enthalpyAxisNormalX = -enthalpyAxisDy / enthalpyAxisLength;
  const enthalpyAxisNormalY = enthalpyAxisDx / enthalpyAxisLength;
  const findEnthalpyAxisIntersection = (enthalpy) => {
    let previous = null;
    for (const temperature of sequence(-20, 60, 0.05)) {
      const humidity = humidityFromEnthalpy(temperature, enthalpy);
      const x = chartTemperature(temperature, humidity);
      const delta = humidity - enthalpyAxisHumidity(x);
      const crossedAxis = previous
        && ((previous.delta <= 0 && delta >= 0) || (previous.delta >= 0 && delta <= 0));
      if (crossedAxis) {
        const fraction = previous.delta / (previous.delta - delta);
        const intersectionTemperature = previous.temperature
          + fraction * (temperature - previous.temperature);
        const intersectionHumidity = humidityFromEnthalpy(intersectionTemperature, enthalpy);
        const intersectionX = chartTemperature(intersectionTemperature, intersectionHumidity);
        return visible(intersectionX, intersectionHumidity)
          ? { temperature: intersectionTemperature, x: intersectionX, humidity: intersectionHumidity }
          : null;
      }
      previous = { temperature, delta };
    }
    return null;
  };

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("xmlns", SVG_NS);
  svg.append(svgElement("title", { id: "chart-title" }, `湿り空気線図、気圧 ${pressureKpa.toFixed(3)} kPa`));
  svg.append(svgElement("desc", { id: "chart-description" }, "乾球温度、相対湿度、重量絶対湿度、比エンタルピーと計算状態点を示します。"));
  svg.append(svgElement("rect", { x: 0, y: 0, width, height, fill: "#ffffff" }));

  const clipId = "psychrometric-plot-clip";
  const defs = svgElement("defs");
  const clipPath = svgElement("clipPath", { id: clipId });
  clipPath.append(svgElement("rect", { x: margin.left, y: margin.top, width: plotWidth, height: plotHeight }));
  defs.append(clipPath);
  svg.append(defs);

  svg.append(svgElement("text", {
    x: width / 2, y: 28, "text-anchor": "middle", fill: "#17212b", "font-size": 19, "font-weight": 700,
  }, `湿り空気線図（h-x） P=${pressureKpa.toFixed(3)} kPa`));

  const grid = svgElement("g", { "clip-path": `url(#${clipId})` });
  svg.append(grid);

  for (const humidity of sequence(0.002, 0.036, 0.002)) {
    const points = sequence(-10, 50, 0.5).map((temperature) => {
      const saturation = humidityRatio(temperature, 100, pressureKpa);
      const x = chartTemperature(temperature, humidity);
      return humidity <= saturation && visible(x, humidity) ? [x, humidity] : null;
    });
    addPath(grid, points, project, { stroke: "#cbd5e1", "stroke-width": 0.8, "stroke-dasharray": "4 3" });
  }

  for (const temperature of sequence(-10, 50, 2)) {
    const points = sequence(0, 100, 2).map((rh) => {
      const humidity = humidityRatio(temperature, rh, pressureKpa);
      const x = chartTemperature(temperature, humidity);
      return visible(x, humidity) ? [x, humidity] : null;
    });
    addPath(grid, points, project, {
      stroke: temperature % 10 === 0 ? "#b45353" : "#f0b8b8",
      "stroke-width": temperature % 10 === 0 ? 0.9 : 0.55,
    });
  }

  for (const enthalpy of sequence(0, 120, 10)) {
    const calculatedAxisPoint = findEnthalpyAxisIntersection(enthalpy);
    const axisStartTemperature = (
      -10.3 + 0.004 * CP_V * 50 / CP_DA
    ) / (1 + 0.004 * CP_V / CP_DA);
    const axisPoint = calculatedAxisPoint ?? (enthalpy === 0
      ? { temperature: axisStartTemperature, x: -10.3, humidity: 0.004 }
      : null);
    const points = axisPoint ? [[axisPoint.x, axisPoint.humidity]] : [];
    const startTemperature = axisPoint ? axisPoint.temperature + 0.05 : -10;
    for (const temperature of sequence(startTemperature, 50, 0.1)) {
      const humidity = humidityFromEnthalpy(temperature, enthalpy);
      const x = chartTemperature(temperature, humidity);
      const reachesInsideChart = humidity >= 0
        && humidity <= enthalpyAxisHumidity(x)
        && visible(x, humidity);
      if (reachesInsideChart) points.push([x, humidity]);
    }
    addPath(grid, points, project, {
      stroke: "#5b8fd9", "stroke-width": 0.85,
      "data-role": "enthalpy-line",
      "data-enthalpy": enthalpy,
      "data-axis-hit": String(Boolean(axisPoint)),
    });

    if (axisPoint && enthalpy > 0) {
      const [tickX, tickY] = project(axisPoint.x, axisPoint.humidity);
      const tickHalfLength = 4;
      grid.append(svgElement("line", {
        x1: tickX - enthalpyAxisNormalX * tickHalfLength,
        y1: tickY - enthalpyAxisNormalY * tickHalfLength,
        x2: tickX + enthalpyAxisNormalX * tickHalfLength,
        y2: tickY + enthalpyAxisNormalY * tickHalfLength,
        stroke: "#1d4ed8", "stroke-width": 1,
        "data-role": "enthalpy-scale",
      }));
      const labelOffset = 11;
      const labelX = tickX - enthalpyAxisNormalX * labelOffset;
      const labelY = tickY - enthalpyAxisNormalY * labelOffset;
      grid.append(svgElement("text", {
        x: labelX, y: labelY + 3, "text-anchor": "middle",
        fill: "#1d4ed8", "font-size": 10, "font-weight": 650,
        transform: `rotate(${enthalpyAxisAngle} ${labelX} ${labelY + 3})`,
        "data-role": "enthalpy-tick",
      }, String(enthalpy)));
    }
  }

  for (const rh of sequence(10, 100, 10)) {
    const points = sequence(-10, 50, 0.25).map((temperature) => {
      const humidity = humidityRatio(temperature, rh, pressureKpa);
      const x = chartTemperature(temperature, humidity);
      return visible(x, humidity) ? [x, humidity] : null;
    });
    addPath(grid, points, project, {
      stroke: rh === 100 ? "#17212b" : "#52616f",
      "stroke-width": rh === 100 ? 1.5 : 0.9,
      "stroke-dasharray": rh === 100 ? "" : "3 2",
    });
    const labelTemperature = rh >= 60 ? 34 : 46;
    const labelHumidity = humidityRatio(labelTemperature, rh, pressureKpa);
    const labelX = chartTemperature(labelTemperature, labelHumidity);
    if (visible(labelX, labelHumidity)) {
      const [x, y] = project(labelX, labelHumidity);
      grid.append(svgElement("text", { x: x + 4, y: y - 3, fill: "#374151", "font-size": 10 }, `${rh}%`));
    }
  }

  grid.append(svgElement("line", {
    x1: enthalpyAxisStartX, y1: enthalpyAxisStartY,
    x2: enthalpyAxisEndX, y2: enthalpyAxisEndY,
    stroke: "#17212b", "stroke-width": 1.4,
    "data-role": "enthalpy-axis",
  }));
  const [enthalpyTitleBaseX, enthalpyTitleBaseY] = project(3, enthalpyAxisHumidity(3));
  const enthalpyTitleOffset = 24;
  const enthalpyTitleX = enthalpyTitleBaseX + enthalpyAxisNormalX * enthalpyTitleOffset;
  const enthalpyTitleY = enthalpyTitleBaseY + enthalpyAxisNormalY * enthalpyTitleOffset;
  grid.append(svgElement("text", {
    x: enthalpyTitleX, y: enthalpyTitleY,
    "text-anchor": "middle", fill: "#17212b",
    "font-size": 13, "font-weight": 700,
    transform: `rotate(${enthalpyAxisAngle} ${enthalpyTitleX} ${enthalpyTitleY})`,
    stroke: "#ffffff", "stroke-width": 4, "paint-order": "stroke",
    "data-role": "enthalpy-title",
    "data-axis-offset": enthalpyTitleOffset,
  }, "比エンタルピー h [kJ/kg(DA)]"));

  const axes = svgElement("g", { fill: "#334155", "font-size": 11 });
  svg.append(axes);
  axes.append(svgElement("rect", {
    x: margin.left, y: margin.top, width: plotWidth, height: plotHeight,
    fill: "none", stroke: "#17212b", "stroke-width": 1,
  }));
  for (const temperature of sequence(-10, 50, 10)) {
    const [x, y] = project(temperature, 0);
    axes.append(svgElement("line", { x1: x, y1: y, x2: x, y2: y + 6, stroke: "#17212b" }));
    axes.append(svgElement("text", { x, y: y + 22, "text-anchor": "middle" }, String(temperature)));
  }
  for (const humidity of sequence(0, 0.036, 0.004)) {
    const [x, y] = project(xMax, humidity);
    axes.append(svgElement("line", { x1: x, y1: y, x2: x + 6, y2: y, stroke: "#17212b" }));
    axes.append(svgElement("text", { x: x + 10, y: y + 4 }, humidity.toFixed(3)));
  }
  axes.append(svgElement("text", {
    x: margin.left + plotWidth / 2, y: height - 16, "text-anchor": "middle",
    "font-size": 14, "font-weight": 650,
  }, "乾球温度 td [℃]"));
  axes.append(svgElement("text", {
    x: width - 14, y: margin.top + plotHeight / 2,
    transform: `rotate(90 ${width - 14} ${margin.top + plotHeight / 2})`,
    "text-anchor": "middle", "font-size": 14, "font-weight": 650,
  }, "重量絶対湿度 x [kg/kg(DA)]"));

  const stateTemperature = Number(state?.ta);
  const stateHumidity = Number(state?.x) / 1000;
  const stateRh = Number(state?.rh);
  const stateEnthalpy = Number(state?.h);
  const stateX = chartTemperature(stateTemperature, stateHumidity);
  if (visible(stateX, stateHumidity)) {
    const [x, y] = project(stateX, stateHumidity);
    const marker = svgElement("g");
    marker.append(svgElement("circle", {
      cx: x, cy: y, r: 7, fill: "#dc2626", stroke: "#ffffff", "stroke-width": 2,
    }));
    const labelX = Math.min(x + 12, width - 260);
    const labelY = Math.max(y - 14, margin.top + 18);
    marker.append(svgElement("rect", {
      x: labelX - 5, y: labelY - 16, width: 245, height: 25,
      rx: 5, fill: "#ffffff", stroke: "#fecaca",
    }));
    marker.append(svgElement("text", {
      x: labelX, y: labelY + 1, fill: "#b91c1c", "font-size": 12, "font-weight": 700,
    }, `${stateTemperature.toFixed(1)} ℃ / ${stateRh.toFixed(1)} % / ${stateEnthalpy.toFixed(1)} kJ/kg(DA)`));
    svg.append(marker);
    return true;
  }
  return false;
}

export function downloadChartSvg(svg, filename = "psychrometric-chart.svg") {
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
