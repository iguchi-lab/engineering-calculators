import { debounce, fetchJson } from "/assets/common.js";
import { downloadChartSvg, renderPsychrometricChart } from "./psychrometric-chart.js";

const form=document.querySelector("#air-form"),mode=document.querySelector("#mode"),button=document.querySelector("#calculate"),status=document.querySelector("#status"),metrics=document.querySelector("#metrics"),chart=document.querySelector("#psychrometric-chart"),chartStatus=document.querySelector("#chart-status"),downloadButton=document.querySelector("#download-chart");
let activeRequest;

function updateFields(){
  const enabledNames=new Set(mode.value.split("-"));
  for(const name of ["ta","rh","td","x"]){
    const wrapper=form.querySelector(`[data-field="${name}"]`),input=form.elements[name],enabled=enabledNames.has(name);
    wrapper.classList.toggle("hidden",!enabled);
    input.disabled=!enabled;
  }
}

async function calculate(){
  if(!form.reportValidity())return;
  activeRequest?.abort();
  activeRequest=new AbortController();
  button.disabled=true;
  status.className="status";
  status.textContent="計算しています…";
  try {
    const query=new URLSearchParams(new FormData(form)),data=await fetchJson(`/api/air?${query}`,activeRequest.signal);
    for(const key of ["ta","rh","td","x","h","rho"])document.querySelector(`[data-result="${key}"]`).textContent=data[key];
    metrics.hidden=false;
    status.textContent="計算しました。";
    const pressureKpa=Number(form.elements.pressure.value)/1000;
    const plotted=renderPsychrometricChart(chart,data,pressureKpa);
    chartStatus.textContent=plotted ? "計算結果を赤い点で表示しています。" : "計算結果は線図の表示範囲外です。";
    downloadButton.disabled=false;
  } catch(error) {
    if(error.name!=="AbortError"){
      status.className="status error";
      status.textContent=error.message;
    }
  } finally {
    button.disabled=false;
  }
}

const calculateSoon=debounce(calculate,300);
mode.addEventListener("change",()=>{updateFields();calculate();});
form.addEventListener("input",event=>{if(event.target!==mode)calculateSoon();});
form.addEventListener("submit",event=>{event.preventDefault();calculate();});
downloadButton.addEventListener("click",()=>downloadChartSvg(chart));
updateFields();
calculate();
