const DEFAULT_SETTINGS = {
    base_input: true,
    base_output: true,
    base_model: true,
    base_created: true,
  
    col_usage: true,
    col_cost: true,
    col_id: false,
    col_temperature: false,
    col_presence_penalty: false,
    col_frequency_penalty: false,
    col_metadata: false,
    usd_to_eur: 0.87
  };
  
  const BASE_TOGGLES = [
    { key: "base_input", label: "Input" },
    { key: "base_output", label: "Output" },
    { key: "base_model", label: "Model" },
    { key: "base_created", label: "Created" }
  ];
  
  const COL_TOGGLES = [
    { key: "col_usage", label: "Usage (Total + hover breakdown)" },
    { key: "col_cost", label: "Cost (EUR estimate + hover breakdown)" },
    { key: "col_id", label: "ID" },
    { key: "col_temperature", label: "Temperature" },
    { key: "col_presence_penalty", label: "Presence penalty" },
    { key: "col_frequency_penalty", label: "Frequency penalty" },
    { key: "col_metadata", label: "Metadata (chips + hover JSON)" }
  ];
  
  const baseList = document.getElementById("baseList");
  const colList = document.getElementById("colList");
  const costSettings = document.getElementById("costSettings");
  const statusEl = document.getElementById("status");
  const resetBtn = document.getElementById("resetBtn");
  
  function setStatus(status) {
    statusEl.textContent = status || "";
    if (status) setTimeout(() => (statusEl.textContent = ""), 1200);
  }
  
  async function getSettings() {
    const keys = Object.keys(DEFAULT_SETTINGS);
    const stored = await chrome.storage.local.get(keys);
    const result = {};
    for (const key of keys) result[key] = typeof stored[key] === "undefined" ? DEFAULT_SETTINGS[key] : stored[key];
    return result;
  }
  
  async function setSetting(key, value) {
    await chrome.storage.local.set({ [key]: value });
    await notifyActiveTab();
  }
  
  async function notifyActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "OLE_SETTINGS_UPDATED" }).catch(() => {});
  }
  
  function makeToggleRow({ key, label }, settings) {
    const row = document.createElement("div");
    row.className = "row";

    const labelEl = document.createElement("div");
    labelEl.className = "label";
    labelEl.textContent = label;

    const toggle = document.createElement("div");
    toggle.className = "toggle";
    const knob = document.createElement("div");
    knob.className = "knob";
    toggle.appendChild(knob);

    function apply(value) {
      toggle.classList.toggle("on", !!value);
    }

    apply(settings[key]);

    toggle.addEventListener("click", async () => {
      const current = !!(await chrome.storage.local.get(key))[key];
      const next = !current;
      await setSetting(key, next);
      apply(next);
      setStatus("Applied");
    });

    row.appendChild(labelEl);
    row.appendChild(toggle);
    return row;
  }

  function normalizeUsdToEur(value) {
    const parsed = typeof value === "number" ? value : parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SETTINGS.usd_to_eur;
    return Math.round(parsed * 100) / 100;
  }

  function makeRateRow(settings) {
    const row = document.createElement("div");
    row.className = "row";

    const labelWrap = document.createElement("div");
    const labelEl = document.createElement("div");
    labelEl.className = "label";
    labelEl.textContent = "USD → EUR rate";
    const hintEl = document.createElement("div");
    hintEl.className = "hint";
    hintEl.textContent = "1 USD = X EUR";
    labelWrap.appendChild(labelEl);
    labelWrap.appendChild(hintEl);

    const input = document.createElement("input");
    input.type = "number";
    input.className = "rateInput";
    input.step = "0.01";
    input.min = "0.01";
    input.max = "10";
    input.inputMode = "decimal";
    input.value = normalizeUsdToEur(settings.usd_to_eur);

    async function applyRate() {
      const next = normalizeUsdToEur(input.value);
      input.value = next;
      await setSetting("usd_to_eur", next);
      setStatus("Applied");
    }

    input.addEventListener("change", applyRate);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });

    row.appendChild(labelWrap);
    row.appendChild(input);
    return row;
  }
  
  async function render() {
    const settings = await getSettings();
    baseList.innerHTML = "";
    colList.innerHTML = "";
    costSettings.innerHTML = "";

    for (const toggle of BASE_TOGGLES) baseList.appendChild(makeToggleRow(toggle, settings));
    for (const toggle of COL_TOGGLES) colList.appendChild(makeToggleRow(toggle, settings));
    costSettings.appendChild(makeRateRow(settings));
  }
  
  resetBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({ ...DEFAULT_SETTINGS });
    await notifyActiveTab();
    await render();
    setStatus("Reset");
  });
  
  render();
  