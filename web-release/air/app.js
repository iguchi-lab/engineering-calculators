import { debounce, fetchJson } from "/assets/common.js";
const form=document.querySelector("#air-form"),mode=document.querySelector("#mode"),button=document.querySelector("#calculate"),status=document.querySelector("#status"),metrics=document.querySelector("#metrics");
let activeRequest;
function updateFields(){
  const enabledNames=new Set(mode.value.split("-"));
  for(const name of ["ta","rh","td","x"]){ const wrapper=form.querySelector(`[data-field="${name}"]`),input=form.elements[name],enabled=enabledNames.has(name); wrapper.classList.toggle("hidden",!enabled); input.disabled=!enabled; }
}
async function calculate(){
  if(!form.reportValidity())return;
  activeRequest?.abort(); activeRequest=new AbortController(); button.disabled=true; status.className="status"; status.textContent="計算しています…";
  try {
    const query=new URLSearchParams(new FormData(form)),data=await fetchJson(`/api/air?${query}`,activeRequest.signal);
    for(const key of ["ta","rh","td","x","h","rho"])document.querySelector(`[data-result="${key}"]`).textContent=data[key];
    metrics.hidden=false; status.textContent="計算しました。";
  } catch(error) { if(error.name!=="AbortError"){ status.className="status error"; status.textContent=error.message; } }
  finally { button.disabled=false; }
}
const calculateSoon=debounce(calculate,300);
mode.addEventListener("change",()=>{updateFields();calculate();});
form.addEventListener("input",event=>{if(event.target!==mode)calculateSoon();});
form.addEventListener("submit",event=>{event.preventDefault();calculate();});
updateFields(); calculate();

