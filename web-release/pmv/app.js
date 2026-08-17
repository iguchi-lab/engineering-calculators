import { bindRangeOutputs, debounce, fetchJson } from "/assets/common.js";
const form=document.querySelector("#pmv-form"),button=document.querySelector("#calculate"),status=document.querySelector("#status"),result=document.querySelector("#result");
let activeRequest;
bindRangeOutputs(form);
async function calculate(){
  activeRequest?.abort(); activeRequest=new AbortController(); button.disabled=true; status.className="status"; status.textContent="計算しています…";
  try {
    const query=new URLSearchParams(new FormData(form));
    const data=await fetchJson(`/api/pmv?${query}`,activeRequest.signal);
    document.querySelector("#pmv-result").textContent=data.pmv.toFixed(1);
    document.querySelector("#ppd-result").textContent=data.ppd;
    document.querySelector("#sensation").textContent=`${data.sensation.ja} / ${data.sensation.en}`;
    result.hidden=false; status.textContent="計算しました。";
  } catch(error) { if(error.name!=="AbortError"){ status.className="status error"; status.textContent=error.message; } }
  finally { button.disabled=false; }
}
const calculateSoon=debounce(calculate,250);
form.addEventListener("input",calculateSoon);
form.addEventListener("submit",event=>{event.preventDefault();calculate();});
calculate();
