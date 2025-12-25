const LS_KEY = "unitflow_logs_v1";
const LS_AUTHOR_KEY = "unitflow_author_v1";

const $ = (id) => document.getElementById(id);

const tabs = Array.from(document.querySelectorAll(".tab"));
const panes = {
  today: $("tab-today"),
  week: $("tab-week"),
  new: $("tab-new")
};

// --- Selection Mode State ---
let selectMode = false;
let selectionScope = "today"; // "today" or "week"
let selectedIds = new Set();

/* ---------- Date Helpers ---------- */
function startOfToday() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.getTime();
}

function startOfWeek() {
  const d = new Date();
  const day = d.getDay(); // 0 Sun
  const diff = (day === 0 ? 6 : day - 1); // Monday start
  d.setDate(d.getDate() - diff);
  d.setHours(0,0,0,0);
  return d.getTime();
}

/* ---------- Storage ---------- */
function loadLogs() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}

function saveLogs(logs) {
  localStorage.setItem(LS_KEY, JSON.stringify(logs));
}

function loadAuthor() {
  return (localStorage.getItem(LS_AUTHOR_KEY) || "").trim();
}

function saveAuthor(name) {
  localStorage.setItem(LS_AUTHOR_KEY, (name || "").trim());
}

/* ---------- PHI Guard ---------- */
function phiLikely(text) {
  if (!text) return false;
  const patterns = [
    /\b(MRN|medical record)\b/i,
    /\bDOB\b/i,
    /\b\d{2}\/\d{2}\/\d{4}\b/,
    /\broom\s?#?\d+\b/i,
    /\bbed\s?#?\d+\b/i
  ];
  return patterns.some(r => r.test(text));
}

/* ---------- Utils ---------- */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function setTab(name) {
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  Object.entries(panes).forEach(([k, pane]) => pane.classList.toggle("active", k === name));
}

/* ---------- Selection Mode Helpers ---------- */
function setSelecting(on, scope) {
  selectMode = on;
  selectionScope = scope || selectionScope;

  document.body.classList.toggle("selecting", selectMode);
  document.body.dataset.scope = selectionScope;

  selectedIds.clear();
  clearSelectedUI();
  $("actionBar").hidden = true;
  $("selectedCount").textContent = "0 selected";

  // keep user on the correct tab when entering select mode
  if (selectMode) setTab(selectionScope);

  // re-render so checkboxes enable/disable correctly
  render();
}

function clearSelectedUI() {
  document.querySelectorAll(".item.selected").forEach(n => n.classList.remove("selected"));
  document.querySelectorAll(".selectBox:checked").forEach(cb => { cb.checked = false; });
}

function updateActionBar() {
  $("selectedCount").textContent = `${selectedIds.size} selected`;
  $("actionBar").hidden = !(selectMode && selectedIds.size > 0);
}

function syncSelectedUI() {
  document.querySelectorAll(".item").forEach(item => {
    const id = item.dataset.id;
    const cb = item.querySelector(".selectBox");
    if (!cb) return;

    // Disable checkboxes if not in select mode
    cb.disabled = !selectMode;

    const isSelected = selectedIds.has(id);
    cb.checked = isSelected;
    item.classList.toggle("selected", isSelected);
  });
  updateActionBar();
}

function getSelectedLogs() {
  const logs = loadLogs();
  return logs.filter(l => selectedIds.has(l.id));
}

/* ---------- Rendering ---------- */
function entryNode(l, scope) {
  const el = document.createElement("div");
  el.className = "item";
  el.dataset.id = l.id;
  el.dataset.scope = scope;

  const sevClass = l.severity === "High" ? "high" : (l.severity === "Medium" ? "med" : "low");
  const when = new Date(l.ts).toLocaleString();
  const who = l.author ? ` • ${escapeHtml(l.author)}` : "";
  const qty = (l.qty !== "" && l.qty != null) ? ` • Qty: ${escapeHtml(l.qty)}` : "";
  const unit = l.unit ? ` • ${escapeHtml(l.unit)}` : "";
  const shift = l.shift ? ` • ${escapeHtml(l.shift)}` : "";

  el.innerHTML = `
    <div class="item-top">
      <input type="checkbox" class="selectBox" data-id="${escapeHtml(l.id)}" aria-label="Select entry" />
      <div class="left">
        <div><strong>${escapeHtml(l.type || "Entry")}</strong></div>
        <div class="meta">${escapeHtml(when)}${who}${shift}${unit}${qty}</div>
        ${l.notes ? `<div class="meta">${escapeHtml(l.notes)}</div>` : ""}
      </div>
    </div>
    <div class="badge ${sevClass}">${escapeHtml(l.severity || "Low")}</div>
  `;

  return el;
}

function render() {
  const logs = loadLogs().sort((a,b) => (b.ts || 0) - (a.ts || 0));
  const todayStart = startOfToday();
  const weekStart = startOfWeek();

  const todayLogs = logs.filter(l => (l.ts || 0) >= todayStart);
  const weekLogs  = logs.filter(l => (l.ts || 0) >= weekStart);

  $("todayCount").textContent = `${todayLogs.length} entr${todayLogs.length === 1 ? "y" : "ies"}`;
  $("weekCount").textContent  = `${weekLogs.length} entr${weekLogs.length === 1 ? "y" : "ies"}`;

  $("todayList").innerHTML = todayLogs.length ? "" : `<p class="sub">No entries yet today.</p>`;
  $("weekList").innerHTML  = weekLogs.length ? ""  : `<p class="sub">No entries yet this week.</p>`;

  todayLogs.forEach(l => $("todayList").appendChild(entryNode(l, "today")));
  weekLogs.forEach(l => $("weekList").appendChild(entryNode(l, "week")));

  // Make sure checkbox state matches mode
  syncSelectedUI();
}

/* ---------- Form ---------- */
function clearForm(hideWarn=true) {
  // author stays
  $("shift").value = "";
  $("unit").value = "";
  $("type").value = "Replenishment";
  $("severity").value = "Low";
  $("qty").value = "";
  $("notes").value = "";
  if (hideWarn) $("phiWarn").hidden = true;
}

/* ---------- Export ---------- */
function exportCsvFromLogs(logs, filenamePrefix) {
  const header = ["timestamp","author","shift","unit","type","severity","qty","notes"];
  const rows = logs.map(l => ([
    new Date(l.ts).toISOString(),
    l.author || "",
    l.shift || "",
    l.unit || "",
    l.type || "",
    l.severity || "",
    (l.qty ?? ""),
    (l.notes || "").replaceAll("\n"," ").trim()
  ]));

  const csv = [header, ...rows]
    .map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function exportSelectedCsv() {
  const selected = getSelectedLogs().sort((a,b) => (a.ts||0) - (b.ts||0));
  if (!selected.length) return;
  exportCsvFromLogs(selected, "unitflow_selected");
}

function exportAllCsv() {
  const logs = loadLogs().sort((a,b) => (a.ts||0) - (b.ts||0));
  if (!logs.length) return;
  exportCsvFromLogs(logs, "unitflow_all");
}

/* ---------- Print ---------- */
function printSelected() {
  if (selectedIds.size === 0) return;

  // Ensure we are on the correct tab before printing
  setTab(selectionScope);
  document.body.classList.add("printing-selected");

  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove("printing-selected"), 400);
  }, 50);
}

function printAll() {
  document.body.classList.remove("printing-selected");
  window.print();
}

/* ---------- Selected Table View (HTML) ---------- */
function openSelectedTable() {
  const selected = getSelectedLogs().sort((a,b) => (a.ts||0) - (b.ts||0));
  if (!selected.length) return;

  const title = `UnitFlow — Selected (${selectionScope === "today" ? "Today" : "Week"})`;
  const generated = new Date().toLocaleString();

  const rowsHtml = selected.map(l => {
    const when = new Date(l.ts).toLocaleString();
    return `
      <tr>
        <td>${escapeHtml(when)}</td>
        <td>${escapeHtml(l.author || "")}</td>
        <td>${escapeHtml(l.shift || "")}</td>
        <td>${escapeHtml(l.unit || "")}</td>
        <td>${escapeHtml(l.type || "")}</td>
        <td>${escapeHtml(l.severity || "")}</td>
        <td>${escapeHtml(l.qty ?? "")}</td>
        <td>${escapeHtml((l.notes || "").trim())}</td>
      </tr>
    `;
  }).join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 16px; }
    h1 { margin: 0 0 6px 0; font-size: 18px; }
    .meta { margin: 0 0 14px 0; color: #555; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
    th { background: #f5f5f5; text-align: left; }
    .tip { margin-top: 12px; font-size: 12px; color: #555; }
    @media print { .tip { display: none; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Generated: ${escapeHtml(generated)} • Items: ${selected.length}</p>

  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Author</th>
        <th>Shift</th>
        <th>Unit</th>
        <th>Type</th>
        <th>Severity</th>
        <th>Qty</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <p class="tip">Tip: iPhone → Share → Print → pinch/zoom preview → Share → Save to Files (PDF).</p>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Pop-up blocked. Please allow pop-ups for this site, then try again.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}

/* ---------- Tabs (FIX: always exit select mode) ---------- */
tabs.forEach(t => t.addEventListener("click", (e) => {
  e.preventDefault();
  const target = t.dataset.tab;

  // KEY FIX: leaving select mode prevents tab bar from feeling "dead" on iOS
  if (selectMode) setSelecting(false);

  setTab(target);
}));

/* ---------- Init ---------- */
// Prefill author
const savedAuthor = loadAuthor();
if ($("author")) $("author").value = savedAuthor;

// Save entry
$("saveBtn").addEventListener("click", () => {
  const authorInput = ($("author") ? $("author").value.trim() : "");
  if (authorInput) saveAuthor(authorInput);

  const entry = {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    ts: Date.now(),
    author: authorInput || loadAuthor(),
    shift: $("shift").value.trim(),
    unit: $("unit").value.trim(),
    type: $("type").value,
    severity: $("severity").value,
    qty: $("qty").value,
    notes: $("notes").value.trim()
  };

  const warn = phiLikely(entry.notes) || phiLikely(entry.unit);
  $("phiWarn").hidden = !warn;

  const logs = loadLogs();
  logs.push(entry);
  saveLogs(logs);

  clearForm(false);
  render();
  setTab("today");
});

$("clearFormBtn").addEventListener("click", () => clearForm(true));

// Enter selection mode
$("selectTodayBtn").addEventListener("click", () => setSelecting(true, "today"));
$("selectWeekBtn").addEventListener("click", () => setSelecting(true, "week"));

// Cancel selection
$("cancelSelectBtn").addEventListener("click", () => setSelecting(false));

// Checkbox selection (delegated)
document.addEventListener("change", (e) => {
  const cb = e.target;
  if (!cb.classList || !cb.classList.contains("selectBox")) return;

  // Ignore checkbox changes if not in select mode
  if (!selectMode) {
    cb.checked = false;
    return;
  }

  const id = cb.dataset.id;
  const item = cb.closest(".item");
  if (!id || !item) return;

  // Only allow selecting inside current scope
  if (item.dataset.scope !== selectionScope) {
    cb.checked = false;
    return;
  }

  if (cb.checked) selectedIds.add(id);
  else selectedIds.delete(id);

  item.classList.toggle("selected", cb.checked);
  updateActionBar();
});

// Selected actions
$("viewSelectedBtn").addEventListener("click", openSelectedTable);
$("exportSelectedBtn").addEventListener("click", exportSelectedCsv);
$("printSelectedBtn").addEventListener("click", printSelected);

// All actions
$("exportCsvBtnAll").addEventListener("click", exportAllCsv);
$("printBtnAll").addEventListener("click", printAll);

// Purge
$("purgeBtn").addEventListener("click", () => {
  if (!confirm("Clear ALL logs from this device?")) return;
  localStorage.removeItem(LS_KEY);
  selectedIds.clear();
  setSelecting(false);
  render();
  setTab("today");
});

// First render
render();
