import CoolPropModule from "./vendor/coolprop-8.0.0/coolprop.js";
import {
  calculateMollierData,
  downloadMollierSvg,
  renderMollierDiagram,
} from "./mollier-chart.js";

const form = document.querySelector("#mollier-form");
const button = document.querySelector("#calculate");
const status = document.querySelector("#status");
const svg = document.querySelector("#mollier-chart");
const stateTable = document.querySelector("#state-table");
const downloadButton = document.querySelector("#download-chart");
let latestFluid = "R32";

const coolPropPromise = CoolPropModule({
  locateFile(file) {
    return new URL(`./vendor/coolprop-8.0.0/${file}`, import.meta.url).href;
  },
});

function formOptions() {
  return {
    fluid: form.elements.fluid.value,
    evaporatingTemperature: Number(form.elements.evaporatingTemperature.value),
    condensingTemperature: Number(form.elements.condensingTemperature.value),
    superheat: Number(form.elements.superheat.value),
    subcooling: Number(form.elements.subcooling.value),
    pressureMin: Number(form.elements.pressureMin.value),
    pressureMax: Number(form.elements.pressureMax.value),
  };
}

function renderStates(states) {
  stateTable.replaceChildren();
  for (const state of states) {
    const row = document.createElement("tr");
    const values = [
      state.number,
      state.name,
      state.t.toFixed(2),
      state.p.toFixed(3),
      state.h.toFixed(2),
      state.s.toFixed(4),
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    stateTable.append(row);
  }
}

async function calculate() {
  if (!form.reportValidity()) return;
  button.disabled = true;
  downloadButton.disabled = true;
  status.className = "status";
  status.textContent = "CoolPropで冷媒物性を計算しています…";
  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    const coolprop = await coolPropPromise;
    const options = formOptions();
    const data = calculateMollierData(coolprop, options);
    renderMollierDiagram(svg, data);
    renderStates(data.states);
    latestFluid = data.fluid;
    status.textContent = `${data.fluid}のp-h線図を作成しました。`;
    downloadButton.disabled = false;
  } catch (error) {
    status.className = "status error";
    status.textContent = error instanceof Error ? error.message : "線図を作成できませんでした。";
  } finally {
    button.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  calculate();
});
downloadButton.addEventListener("click", () => {
  downloadMollierSvg(svg, `mollier-diagram-${latestFluid}.svg`);
});

calculate();
