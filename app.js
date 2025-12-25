const LS_KEY = "unitflow_logs_v1";

const $ = (id) => document.getElementById(id);

const tabs = Array.from(document.querySelectorAll(".tab"));
const panes = {
  today: $("tab-today"),
  week: $("tab-week"),
  new: $("tab-new")
};

function nowISO() {
  return new Date().toISOString();
}
function startOfToday() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.getTime();
}
function startOfWeek() {
  const d = new Date();
  const day = d.getDay(); // 0 Sun
  const diff = (day === 0 ? 6 : day - 1); // Mon as start
  d.setDate(d.getDate() - diff);
  d.setHours(0,0,0,0);
  return d.getTime();
}

function loadLogs() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveLogs(logs) {
  localStorage.setItem(LS_KEY, JSON.stringify(logs));
}

function phiLikely(text) {
  if (!text) return false;
  // simple pattern warnings (not blocking)
  const patterns = [
    /\b(MRN|medical record)\b/i,
    /\bDOB\b/i,
    /\b\d{2}\/\d{2}\/\d{4}\b/,         // date
    /\broom\s?#?\d+\b/i,
    /\bbed\s?#?\d+\b/i
  ];
  return patterns.some(r => r.test(text));
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

  todayLogs.forEach(l => $("todayList").appendChild(entryNode(l)));
  weekLogs.forEach(l => $("weekList").appendChild(entryNode(l)));
}

function entryNode(l) {
  const el = document.createElement("div");
  el.className = "item";
  const sevClass = l.severity === "High" ? "high" : (l.severity === "Medium" ? "med" : "low");
  const when = new Date(l.ts).toLocaleString();
  const qty = (l.qty !== "" && l.qty != null) ? ` • Qty: ${l.qty}` : "";
  const unit = l.unit ? ` • ${escapeHtml(l.unit)}` : "";
  const shift = l.shift ? ` • ${escapeHtml(l.shift)}` : "";

  el.innerHTML = `
    <div class="left">
      <div><strong>${escapeHtml(l.type || "Entry")}</strong></div>
      <div class="meta">${when}${shift}${unit}${qty}</div>
      ${l.notes ? `<div class="meta">${escapeHtml(l.notes)}</div>` : ""}
    </div>
    <div class="badge ${sevClass}">${escapeHtml(l.severity || "Low")}</div>
  `;
  return el;
}

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

tabs.forEach(t => t.addEventListener("click", () => setTab(t.dataset.tab)));

$("saveBtn").addEventListener("click", () => {
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    ts: Date.now(),
    shift: $("shift").value.trim(),
    unit: $("unit").value.trim(),
    type: $("type").value,
    severity: $("severity").value,
    qty: $("qty").value,
    notes: $("notes").value.trim()
  };

  // show warning (non-blocking)
  const warn = phiLikely(entry.notes) || phiLikely(entry.unit);
  $("phiWarn").hidden = !warn;

  const logs = loadLogs();
  logs.push(entry);
  saveLogs(logs);

  clearForm(false);
  render();
  setTab("today");
});

function clearForm(hideWarn=true) {
  $("shift").value = "";
  $("unit").value = "";
  $("type").value = "Replenishment";
  $("severity").value = "Low";
  $("qty").value = "";
  $("notes").value = "";
  if (hideWarn) $("phiWarn").hidden = true;
}

$("clearFormBtn").addEventListener("click", () => clearForm(true));

$("exportCsvBtn").addEventListener("click", () => {
  const logs = loadLogs().sort((a,b) => (a.ts||0) - (b.ts||0));
  const header = ["timestamp","shift","unit","type","severity","qty","notes"];
  const rows = logs.map(l => ([
    new Date(l.ts).toISOString(),
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
  a.download = `unitflow_logs_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

$("printBtn").addEventListener("click", () => window.print());

$("purgeBtn").addEventListener("click", () => {
  const ok = confirm("Clear ALL logs from this device? This cannot be undone.");
  if (!ok) return;
  localStorage.removeItem(LS_KEY);
  render();
  setTab("today");
});

// PWA install prompt
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("installBtn").hidden = false;
});
$("installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("installBtn").hidden = true;
});

// Register service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
}

render();
