export function debounce(callback, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), wait);
  };
}

export async function fetchJson(url, signal) {
  const response = await fetch(url, { signal, headers: { accept: "application/json" } });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("サーバーから正しい応答を受け取れませんでした。");
  }
  if (!response.ok) {
    throw new Error(payload?.error?.message || `計算に失敗しました（${response.status}）。`);
  }
  return payload;
}

export function bindRangeOutputs(root = document) {
  root.querySelectorAll("input[type=range]").forEach((input) => {
    const output = root.querySelector(`[data-value-for="${input.id}"]`);
    const update = () => { if (output) output.value = input.value; };
    input.addEventListener("input", update);
    update();
  });
}

