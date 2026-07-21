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

let settings = { ...DEFAULT_SETTINGS };

const recordsByAnyId = new Map();
const seenUnique = new Set();
const tokenHistory = [];
let tokenAvgWindow = 0; // 0=All, 10=Last 10, 30=Last 30

function isLogsPage() {
  return location.pathname.startsWith("/logs");
}

async function loadSettings() {
  const keys = Object.keys(DEFAULT_SETTINGS);
  const stored = await chrome.storage.local.get(keys);
  const result = {};
  for (const key of keys) result[key] = typeof stored[key] === "undefined" ? DEFAULT_SETTINGS[key] : stored[key];
  settings = result;
  return result;
}

function getUsdToEur() {
  const rate = settings.usd_to_eur;
  if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) return rate;
  return typeof DEFAULT_USD_TO_EUR === "number" ? DEFAULT_USD_TO_EUR : 0.87;
}

function ensureInjectedScript() {
  if (window.__OLE_INJECTED__ || document.getElementById("ole-inject")) return;
  const script = document.createElement("script");
  script.id = "ole-inject";
  script.src = chrome.runtime.getURL("inject.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

function ensureStyles() {
  if (document.getElementById("ole-style")) return;

  const style = document.createElement("style");
  style.id = "ole-style";
  style.textContent = `
    .ole-usage-pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04);
      font-size: 12px;
      line-height: 1;
      user-select: none;
      max-width: 100%;
      cursor: default;
    }
    .ole-usage-pill .ole-usage-main {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0.95;
    }

    .ole-tooltip-portal {
      position: fixed;
      z-index: 2147483647;
      display: none;
      min-width: 220px;
      max-width: 320px;
      padding: 10px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(16,16,18,0.98);
      box-shadow: 0 16px 40px rgba(0,0,0,0.55);
      color: rgba(255,255,255,0.92);
      font-size: 12px;
      pointer-events: none;
    }
    .ole-tooltip-title {
      font-weight: 650;
      margin-bottom: 8px;
      opacity: 0.95;
    }
    .ole-tooltip-row {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      padding: 3px 0;
      opacity: 0.92;
    }
    .ole-tooltip-strong {
      font-weight: 650;
      opacity: 0.98;
      margin-top: 6px;
      padding-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.10);
    }

    .ole-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      max-width: 100%;
      overflow: hidden;
      white-space: nowrap;
    }
    .ole-chip {
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04);
      font-size: 12px;
      line-height: 1.2;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 0 1 auto;
    }
    .ole-chip-muted { opacity: 0.7; }

    .ole-meta-pop {
      position: fixed;
      z-index: 2147483647;
      display: none;
      width: 420px;
      max-width: min(520px, calc(100vw - 24px));
      max-height: min(460px, calc(100vh - 24px));
      overflow: auto;
      padding: 12px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(16,16,18,0.98);
      box-shadow: 0 16px 40px rgba(0,0,0,0.55);
      color: rgba(255,255,255,0.92);
      font-size: 12px;
      pointer-events: none;
    }
    .ole-meta-pop pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      line-height: 1.35;
      opacity: 0.95;
    }

    .ole-stats-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.03);
      color: rgba(255,255,255,0.9);
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
    }
    .ole-stats-pill b { font-weight: 650; }
    .ole-stats-pill .ole-dot {
      width: 4px; height: 4px; border-radius: 999px;
      background: rgba(255,255,255,0.45); display: inline-block;
    }

    .ole-stats-select {
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.03);
      color: rgba(255,255,255,0.9);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      line-height: 1;
      outline: none;
      cursor: pointer;
    }
    .ole-stats-select option {
      background: rgb(16,16,18);
      color: rgba(255,255,255,0.92);
    }
  `;
  document.documentElement.appendChild(style);
}


let usagePortal = null;
let costPortal = null;
let metaPortal = null;

function ensureCostPortal() {
  if (costPortal) return costPortal;
  const portal = document.createElement("div");
  portal.className = "ole-tooltip-portal";
  document.body.appendChild(portal);
  costPortal = portal;
  return portal;
}

function ensureUsagePortal() {
  if (usagePortal) return usagePortal;
  const portal = document.createElement("div");
  portal.className = "ole-tooltip-portal";
  document.body.appendChild(portal);
  usagePortal = portal;
  return portal;
}

function ensureMetaPortal() {
  if (metaPortal) return metaPortal;
  const portal = document.createElement("div");
  portal.className = "ole-meta-pop";
  const pre = document.createElement("pre");
  portal.appendChild(pre);
  document.body.appendChild(portal);
  metaPortal = portal;
  return portal;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function positionPortal(portal, anchorEl) {
  portal.style.display = "block";

  const rect = anchorEl.getBoundingClientRect();
  const padding = 10;
  const portalRect = portal.getBoundingClientRect();
  const left = clamp(rect.left, padding, window.innerWidth - portalRect.width - padding);

  const topCandidate = rect.bottom + 10;
  const top =
    topCandidate + portalRect.height + padding <= window.innerHeight
      ? topCandidate
      : clamp(rect.top - portalRect.height - 10, padding, window.innerHeight - portalRect.height - padding);

  portal.style.left = `${left}px`;
  portal.style.top = `${top}px`;
}

function hideCostPortal() {
  if (!costPortal) return;
  costPortal.style.display = "none";
}

function showCostPortal(anchorEl, costResult, modelLabel) {
  const portal = ensureCostPortal();
  portal.innerHTML = "";

  const title = document.createElement("div");
  title.className = "ole-tooltip-title";
  title.textContent = "Cost breakdown (EUR)";

  portal.appendChild(title);

  if (modelLabel) {
    const modelRow = document.createElement("div");
    modelRow.className = "ole-tooltip-row";
    modelRow.innerHTML = `<span>Model</span><span>${modelLabel}</span>`;
    portal.appendChild(modelRow);
  }

  const { breakdown, usdToEur, modelKey } = costResult;
  const toEur = (usd) => usd * usdToEur;

  const rows = [
    ["Input (uncached)", breakdown.uncached, breakdown.uncachedCost],
    ["Cached input", breakdown.cached, breakdown.cachedCost],
    ["Cache write", breakdown.cacheWrite, breakdown.cacheWriteCost],
    ["Output", breakdown.output, breakdown.outputCost]
  ];

  for (const [label, tokens, usdCost] of rows) {
    if (!tokens && !usdCost) continue;
    const row = document.createElement("div");
    row.className = "ole-tooltip-row";
    row.innerHTML = `<span>${label}${tokens ? ` (${tokens})` : ""}</span><span>${formatEur(toEur(usdCost))}</span>`;
    portal.appendChild(row);
  }

  const totalRow = document.createElement("div");
  totalRow.className = "ole-tooltip-row ole-tooltip-strong";
  totalRow.innerHTML = `<span>Total</span><span>${formatEur(costResult.totalEur)}</span>`;
  portal.appendChild(totalRow);

  const note = document.createElement("div");
  note.style.marginTop = "8px";
  note.style.opacity = "0.72";
  note.style.fontSize = "11px";
  note.textContent = `OpenAI list price (${modelKey}) × ${usdToEur.toFixed(2)} USD/EUR`;
  portal.appendChild(note);

  positionPortal(portal, anchorEl);
}

function showUsagePortal(anchorEl, usage) {
  const portal = ensureUsagePortal();
  portal.innerHTML = "";

  const title = document.createElement("div");
  title.className = "ole-tooltip-title";
  title.textContent = "Token breakdown";

  const inputRow = document.createElement("div");
  inputRow.className = "ole-tooltip-row";
  inputRow.innerHTML = `<span>Input</span><span>${usage?.inTok ?? ""}</span>`;

  const outputRow = document.createElement("div");
  outputRow.className = "ole-tooltip-row";
  outputRow.innerHTML = `<span>Output</span><span>${usage?.outTok ?? ""}</span>`;

  portal.appendChild(title);
  portal.appendChild(inputRow);
  portal.appendChild(outputRow);

  if (typeof usage?.cachedTok === "number" && usage.cachedTok > 0) {
    const cachedRow = document.createElement("div");
    cachedRow.className = "ole-tooltip-row";
    cachedRow.innerHTML = `<span>Cached</span><span>${usage.cachedTok}</span>`;
    portal.appendChild(cachedRow);
  }

  if (typeof usage?.cacheWriteTok === "number" && usage.cacheWriteTok > 0) {
    const cacheWriteRow = document.createElement("div");
    cacheWriteRow.className = "ole-tooltip-row";
    cacheWriteRow.innerHTML = `<span>Cache write</span><span>${usage.cacheWriteTok}</span>`;
    portal.appendChild(cacheWriteRow);
  }

  if (typeof usage?.reasoningTok === "number" && usage.reasoningTok > 0) {
    const reasoningRow = document.createElement("div");
    reasoningRow.className = "ole-tooltip-row";
    reasoningRow.innerHTML = `<span>Reasoning</span><span>${usage.reasoningTok}</span>`;
    portal.appendChild(reasoningRow);
  }

  const totalRow = document.createElement("div");
  totalRow.className = "ole-tooltip-row ole-tooltip-strong";
  totalRow.innerHTML = `<span>Total</span><span>${usage?.totalTok ?? ""}</span>`;

  portal.appendChild(totalRow);

  positionPortal(portal, anchorEl);
}

function hideUsagePortal() {
  if (!usagePortal) return;
  usagePortal.style.display = "none";
}

function showMetaPortal(anchorEl, metadata) {
  const portal = ensureMetaPortal();
  const pre = portal.querySelector("pre");
  let text = "";
  try {
    text = JSON.stringify(metadata, null, 2);
  } catch {
    text = String(metadata);
  }
  pre.textContent = text;
  positionPortal(portal, anchorEl);
}

function hideMetaPortal() {
  if (!metaPortal) return;
  metaPortal.style.display = "none";
}


function getHeaderContainer() {
  return document.querySelector(".O-gng");
}

function getHeaderCells() {
  const header = getHeaderContainer();
  if (!header) return [];
  return Array.from(header.querySelectorAll(".nuDb6"));
}

function findBaseColumnIndex(label) {
  const cells = getHeaderCells();
  return cells.findIndex((cell) => (cell.textContent || "").trim().toLowerCase() === label.toLowerCase());
}

function getAllRowAnchors() {
  return Array.from(document.querySelectorAll('a[href^="/logs/"]'));
}

function getRowCells(row) {
  return Array.from(row.children).filter((el) => el.classList?.contains("D9q75"));
}

function setBaseColumnVisibleByIndex(index, isVisible) {
  if (index < 0) return;

  const headerCells = getHeaderCells();
  if (headerCells[index]) headerCells[index].style.display = isVisible ? "" : "none";

  const rows = getAllRowAnchors();
  for (const row of rows) {
    const cells = getRowCells(row);
    if (cells[index]) cells[index].style.display = isVisible ? "" : "none";
  }
}

function applyBaseColumnVisibility() {
  const columnMap = [
    { key: "base_input", label: "Input" },
    { key: "base_output", label: "Output" },
    { key: "base_model", label: "Model" },
    { key: "base_created", label: "Created" }
  ];

  for (const column of columnMap) {
    const index = findBaseColumnIndex(column.label);
    const visible = !!settings?.[column.key];
    setBaseColumnVisibleByIndex(index, visible);
  }
}


function getModelFromRow(row) {
  const modelIndex = findBaseColumnIndex("Model");
  if (modelIndex < 0 || !row) return null;
  const cells = getRowCells(row);
  const text = (cells[modelIndex]?.textContent || "").trim();
  return text || null;
}

function resolveRecordModel(record, row) {
  return record?.model || getModelFromRow(row) || null;
}

function getInjectedColumnDefs() {
  const columnDefs = [];

  if (settings?.col_usage) {
    columnDefs.push({
      key: "col_usage",
      label: "Usage",
      width: "130px",
      getNode: (record) => renderUsageCell(record)
    });
  }

  if (settings?.col_cost) {
    columnDefs.push({
      key: "col_cost",
      label: "Cost",
      width: "110px",
      getNode: (record, rowId, row) => renderCostCell(record, row)
    });
  }

  if (settings?.col_id) {
    columnDefs.push({
      key: "col_id",
      label: "ID",
      width: "240px",
      getText: (record) => record?.id || record?.requestId || ""
    });
  }

  if (settings?.col_temperature) {
    columnDefs.push({
      key: "col_temperature",
      label: "Temperature",
      width: "120px",
      getText: (record) => (typeof record?.temperature === "number" ? String(record.temperature) : "")
    });
  }

  if (settings?.col_presence_penalty) {
    columnDefs.push({
      key: "col_presence_penalty",
      label: "Presence",
      width: "120px",
      getText: (record) => (typeof record?.presencePenalty === "number" ? String(record.presencePenalty) : "")
    });
  }

  if (settings?.col_frequency_penalty) {
    columnDefs.push({
      key: "col_frequency_penalty",
      label: "Frequency",
      width: "120px",
      getText: (record) => (typeof record?.frequencyPenalty === "number" ? String(record.frequencyPenalty) : "")
    });
  }

  if (settings?.col_metadata) {
    columnDefs.push({
      key: "col_metadata",
      label: "Metadata",
      width: "360px",
      getNode: (record) => renderMetadataCell(record)
    });
  }

  return columnDefs;
}

function applyHeaderForInjectedColumns() {
  const header = getHeaderContainer();
  if (!header) return;

  for (const headerCell of Array.from(header.querySelectorAll("[data-ole-header='1']"))) headerCell.remove();

  const columnDefs = getInjectedColumnDefs();
  for (const def of columnDefs) {
    const cell = document.createElement("div");
    cell.className = "nuDb6";
    cell.setAttribute("data-ole-header", "1");
    cell.setAttribute("data-align", "left");
    cell.style.setProperty("--logs-table-column-width", def.width || "auto");
    cell.style.setProperty("--logs-table-column-min-width", "auto");
    cell.textContent = def.label;
    header.appendChild(cell);
  }
}

function extractIdFromRowHref(row) {
  const href = row.getAttribute("href") || "";
  const match = href.match(/^\/logs\/(.+)$/);
  return match ? match[1] : null;
}

let injectedStamp = 0;
function bumpInjectedStamp() {
  injectedStamp += 1;
}
function getInjectedStamp() {
  return String(injectedStamp);
}

function getRecordCacheKey(record, row) {
  if (!record) return `none:${getModelFromRow(row) || ""}`;
  const usage = record.usage || {};
  const model = resolveRecordModel(record, row) || "";
  return `${record.id || ""}:${record.requestId || ""}:${model}:${usage.totalTok}:${usage.inTok}:${usage.outTok}:${usage.cachedTok}:${usage.cacheWriteTok}`;
}

function applyInjectedColumnsToRow(row) {
  const rowId = extractIdFromRowHref(row);
  if (!rowId) return;

  const stamp = getInjectedStamp();
  const record = recordsByAnyId.get(rowId) || null;
  const recordKey = getRecordCacheKey(record, row);

  if (row.getAttribute("data-ole-stamp") === stamp && row.getAttribute("data-ole-record-key") === recordKey) {
    return;
  }

  for (const cell of Array.from(row.querySelectorAll("[data-ole-cell='1']"))) cell.remove();

  const columnDefs = getInjectedColumnDefs();

  for (const def of columnDefs) {
    const cell = document.createElement("div");
    cell.className = "D9q75";
    cell.setAttribute("data-ole-cell", "1");
    cell.setAttribute("data-text-color", "secondary");
    cell.setAttribute("data-align", "left");
    cell.style.setProperty("--logs-table-item-width", def.width || "auto");
    cell.style.setProperty("--logs-table-item-min-width", "auto");

    if (def.getNode) cell.appendChild(def.getNode(record, rowId, row));
    else cell.textContent = def.getText ? def.getText(record, rowId) : "";

    row.appendChild(cell);
  }

  row.setAttribute("data-ole-stamp", stamp);
  row.setAttribute("data-ole-record-key", recordKey);
}

function applyInjectedColumnsToAllRows() {
  for (const row of getAllRowAnchors()) applyInjectedColumnsToRow(row);
}


function shorten(value, max = 22) {
  const str = String(value);
  if (str.length <= max) return str;
  return str.slice(0, max) + "…";
}

function renderMetadataCell(rec) {
  const metadata = rec?.metadata;
  const wrapper = document.createElement("div");
  wrapper.className = "ole-meta";
  if (!metadata || typeof metadata !== "object") return wrapper;

  const entries = Object.entries(metadata);
  const visibleEntries = entries.slice(0, 3);
  const remainingCount = entries.length - visibleEntries.length;

  for (const [key, value] of visibleEntries) {
    const chip = document.createElement("span");
    chip.className = "ole-chip";
    chip.textContent = `${key}: ${shorten(value, 28)}`;
    wrapper.appendChild(chip);
  }

  if (remainingCount > 0) {
    const moreChip = document.createElement("span");
    moreChip.className = "ole-chip ole-chip-muted";
    moreChip.textContent = `+${remainingCount}`;
    wrapper.appendChild(moreChip);
  }

  wrapper.addEventListener("mouseenter", () => showMetaPortal(wrapper, metadata));
  wrapper.addEventListener("mouseleave", () => hideMetaPortal());

  return wrapper;
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return { inTok: null, outTok: null, totalTok: null, cachedTok: null, cacheWriteTok: null, reasoningTok: null };
  }

  const inTokCustom = typeof usage.inTok === "number" ? usage.inTok : null;
  const outTokCustom = typeof usage.outTok === "number" ? usage.outTok : null;
  const totalTokCustom = typeof usage.totalTok === "number" ? usage.totalTok : null;
  const cachedTokCustom = typeof usage.cachedTok === "number" ? usage.cachedTok : null;
  const cacheWriteTokCustom = typeof usage.cacheWriteTok === "number" ? usage.cacheWriteTok : null;
  const reasoningTokCustom = typeof usage.reasoningTok === "number" ? usage.reasoningTok : null;

  const inTokOpenAI =
    typeof usage.prompt_tokens === "number"
      ? usage.prompt_tokens
      : typeof usage.input_tokens === "number"
        ? usage.input_tokens
        : null;
  const outTokOpenAI =
    typeof usage.completion_tokens === "number"
      ? usage.completion_tokens
      : typeof usage.output_tokens === "number"
        ? usage.output_tokens
        : null;
  const totalTokOpenAI = typeof usage.total_tokens === "number" ? usage.total_tokens : null;
  const cachedTokOpenAI =
    typeof usage.input_tokens_details?.cached_tokens === "number"
      ? usage.input_tokens_details.cached_tokens
      : typeof usage.prompt_tokens_details?.cached_tokens === "number"
        ? usage.prompt_tokens_details.cached_tokens
        : typeof usage.cache_read_tokens === "number"
          ? usage.cache_read_tokens
          : null;
  const cacheWriteTokOpenAI =
    typeof usage.input_tokens_details?.cache_write_tokens === "number"
      ? usage.input_tokens_details.cache_write_tokens
      : typeof usage.prompt_tokens_details?.cache_write_tokens === "number"
        ? usage.prompt_tokens_details.cache_write_tokens
        : null;
  const reasoningTokOpenAI =
    typeof usage.output_tokens_details?.reasoning_tokens === "number"
      ? usage.output_tokens_details.reasoning_tokens
      : null;

  const inTok = inTokCustom ?? inTokOpenAI;
  const outTok = outTokCustom ?? outTokOpenAI;
  const totalTok =
    totalTokCustom ?? totalTokOpenAI ?? (typeof inTok === "number" && typeof outTok === "number" ? inTok + outTok : null);
  const cachedTok = cachedTokCustom ?? cachedTokOpenAI;
  const cacheWriteTok = cacheWriteTokCustom ?? cacheWriteTokOpenAI;
  const reasoningTok = reasoningTokCustom ?? reasoningTokOpenAI;

  return { inTok, outTok, totalTok, cachedTok, cacheWriteTok, reasoningTok };
}

function renderUsageCell(record) {
  const usageData = normalizeUsage(record?.usage);

  const wrapper = document.createElement("div");
  wrapper.className = "ole-usage-pill";

  const mainText = document.createElement("div");
  mainText.className = "ole-usage-main";
  mainText.textContent = usageData.totalTok == null ? "…" : `Total: ${usageData.totalTok}`;
  wrapper.appendChild(mainText);

  wrapper.addEventListener("mouseenter", () => showUsagePortal(wrapper, usageData));
  wrapper.addEventListener("mouseleave", () => hideUsagePortal());

  return wrapper;
}

function renderCostCell(record, row) {
  const usageData = normalizeUsage(record?.usage);
  const model = resolveRecordModel(record, row);
  const costResult = calculateCostUsd(model, usageData, getUsdToEur());

  const wrapper = document.createElement("div");
  wrapper.className = "ole-usage-pill";

  const mainText = document.createElement("div");
  mainText.className = "ole-usage-main";

  if (!model) {
    mainText.textContent = "…";
  } else if (!costResult) {
    mainText.textContent = "N/A";
    wrapper.title = `No pricing data for model: ${model}`;
  } else {
    mainText.textContent = formatEur(costResult.totalEur);
  }

  wrapper.appendChild(mainText);

  if (costResult) {
    wrapper.addEventListener("mouseenter", () => showCostPortal(wrapper, costResult, model));
    wrapper.addEventListener("mouseleave", () => hideCostPortal());
  }

  return wrapper;
}

let statsEl = null;

function isValidTokNumber(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function pushTokenHistoryFromRec(rec, uniqueKey) {
  if (seenUnique.has(uniqueKey)) return;

  const usage = normalizeUsage(rec?.usage);

  const hasIn = isValidTokNumber(usage.inTok);
  const hasOut = isValidTokNumber(usage.outTok);
  const hasTotal = isValidTokNumber(usage.totalTok);

  if (!hasIn && !hasOut && !hasTotal) return;

  const inTokens = hasIn ? usage.inTok : 0;
  const outTokens = hasOut ? usage.outTok : 0;
  const totalTokens = hasTotal ? usage.totalTok : inTokens + outTokens;

  if (!isValidTokNumber(totalTokens)) return;

  seenUnique.add(uniqueKey);
  tokenHistory.push({ inTok: inTokens, outTok: outTokens, totalTok: totalTokens });
}

function computeAverages() {
  const windowSize = tokenAvgWindow;

  if (tokenHistory.length === 0) {
    return { avgIn: 0, avgOut: 0, avgTotal: 0, count: 0, windowSize };
  }

  let items = tokenHistory;

  if (windowSize > 0) {
    const start = Math.max(0, tokenHistory.length - windowSize);
    items = tokenHistory.slice(start);
  }

  items = items.filter((item) => isValidTokNumber(item.totalTok));

  const count = items.length;
  if (count === 0) {
    return { avgIn: 0, avgOut: 0, avgTotal: 0, count: 0, windowSize };
  }

  let sumIn = 0;
  let sumOut = 0;
  let sumTotal = 0;

  for (const item of items) {
    sumIn += item.inTok;
    sumOut += item.outTok;
    sumTotal += item.totalTok;
  }

  return {
    avgIn: Math.round(sumIn / count),
    avgOut: Math.round(sumOut / count),
    avgTotal: Math.round(sumTotal / count),
    count,
    windowSize
  };
}

function findFilterBarRoot() {
  return document.querySelector("div._38YGU");
}

function ensureStatsInjected() {
  const root = findFilterBarRoot();
  if (!root) return;

  if (statsEl && statsEl.isConnected) return;

  const pill = document.createElement("div");
  pill.className = "ole-stats-pill";
  pill.setAttribute("data-ole-stats", "1");
  pill.title = "Loaded records average (updates as more logs load).";
  pill.innerHTML = `
    <span><b>Token avg</b></span>
    <select class="ole-stats-select" id="ole-token-avg-select" title="Averaging window">
      <option value="0">All</option>
      <option value="10">Last 10</option>
      <option value="30">Last 30</option>
    </select>
    <span class="ole-dot"></span>
    <span>In: <b>0</b></span>
    <span>Out: <b>0</b></span>
    <span>Total: <b>0</b></span>
    <span class="ole-dot"></span>
    <span>n=<b>0</b></span>
  `;

  const select = pill.querySelector("#ole-token-avg-select");
  select.value = String(tokenAvgWindow);
  select.addEventListener("change", () => {
    const value = Number(select.value);
    tokenAvgWindow = Number.isFinite(value) ? value : 0;
    updateStatsInjected();
  });

  const form = root.querySelector("form");
  (form || root).appendChild(pill);

  statsEl = pill;
}

function updateStatsInjected() {
  if (!statsEl || !statsEl.isConnected) return;

  const { avgIn, avgOut, avgTotal, count, windowSize } = computeAverages();

  statsEl.title = windowSize === 0 ? "All loaded records average" : `Last ${windowSize} loaded records average`;

  const boldElements = statsEl.querySelectorAll("b");
  if (boldElements.length >= 5) {
    boldElements[1].textContent = String(avgIn);
    boldElements[2].textContent = String(avgOut);
    boldElements[3].textContent = String(avgTotal);
    boldElements[4].textContent = String(count);
  }
}

function handleRecordsBatch(records) {
  let changed = false;

  for (const record of records) {
    const id = record?.id || null;
    const requestId = record?.requestId || null;
    if (!id && !requestId) continue;

    if (id) recordsByAnyId.set(id, record);
    if (requestId) recordsByAnyId.set(requestId, record);

    const uniqueKey = id || requestId;
    pushTokenHistoryFromRec(record, uniqueKey);

    changed = true;
  }

  if (!changed) return;

  bumpInjectedStamp();
  ensureStatsInjected();
  updateStatsInjected();

  applyInjectedColumnsToAllRows();
}

let tableObserver = null;

function observeTableAndHrefChanges() {
  if (tableObserver) tableObserver.disconnect();

  let scheduled = false;
  const scheduleApply = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensureStatsInjected();
      updateStatsInjected();
      applyBaseColumnVisibility();
      applyHeaderForInjectedColumns();
      applyInjectedColumnsToAllRows();
    });
  };

  tableObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        if (mutation.addedNodes?.length || mutation.removedNodes?.length) scheduleApply();
      }

      if (mutation.type === "attributes") {
        const target = mutation.target;
        if (target instanceof HTMLElement && target.matches && target.matches('a[href^="/logs/"]')) {
          applyInjectedColumnsToRow(target);
        } else {
          scheduleApply();
        }
      }
    }
  });

  tableObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href"]
  });
}

function initMessageBridge() {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (data?.type === "OLE_DASHBOARD_CHAT_COMPLETIONS_BATCH") {
      const records = data?.payload?.records || [];
      handleRecordsBatch(records);
    }
  });
}

function setupLiveUpdates() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    let touched = false;
    for (const key of Object.keys(changes)) {
      if (key.startsWith("col_") || key.startsWith("base_") || key === "usd_to_eur") {
        touched = true;
        break;
      }
    }
    if (!touched) return;

    loadSettings().then(() => {
      bumpInjectedStamp();
      applyBaseColumnVisibility();
      applyHeaderForInjectedColumns();
      applyInjectedColumnsToAllRows();
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "OLE_SETTINGS_UPDATED") {
      loadSettings().then(() => {
        bumpInjectedStamp();
        applyBaseColumnVisibility();
        applyHeaderForInjectedColumns();
        applyInjectedColumnsToAllRows();
      });
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      hideUsagePortal();
      hideCostPortal();
      hideMetaPortal();
    },
    { passive: true }
  );

  window.addEventListener(
    "resize",
    () => {
      hideUsagePortal();
      hideCostPortal();
      hideMetaPortal();
    },
    { passive: true }
  );
}

async function start() {
  if (!isLogsPage()) return;

  ensureStyles();
  ensureInjectedScript();
  setupLiveUpdates();

  await loadSettings();

  bumpInjectedStamp();
  applyBaseColumnVisibility();
  applyHeaderForInjectedColumns();
  applyInjectedColumnsToAllRows();

  ensureStatsInjected();
  updateStatsInjected();

  observeTableAndHrefChanges();

  let tries = 0;
  const retryInterval = setInterval(() => {
    tries += 1;
    ensureStatsInjected();
    applyInjectedColumnsToAllRows();
    if (statsEl?.isConnected || tries >= 30) clearInterval(retryInterval);
  }, 500);
}

if (isLogsPage()) {
  initMessageBridge();
  start();
}
