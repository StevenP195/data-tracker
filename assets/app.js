/* Shared code for all three pages: navigation bar, theme, data loading, CSV
   parsing, the move rule, number formats, and service worker registration. */

const TT = (() => {
  const PAGES = [
    { href: "index.html", label: "Today" },
    { href: "browse.html", label: "Browse" },
    { href: "trends.html", label: "Trends" },
  ];
  // must match config.NUMERIC_COLUMNS in tracker/config.py
  const NUMERIC = ["close", "change_pct", "volume", "high_52w", "low_52w", "pct_off_high",
    "target_price", "upside_pct", "analysts_buy", "analysts_hold", "analysts_sell",
    "eps_forecast", "eps_revisions_up", "eps_revisions_down", "last_surprise_pct",
    "market_cap_b", "short_interest", "short_change_pct", "days_to_cover"];
  const LABELS = {
    close: "Close", change_pct: "Day change %", volume: "Volume", high_52w: "52-wk high", low_52w: "52-wk low",
    pct_off_high: "% off 52-wk high", target_price: "Analyst target", upside_pct: "Upside to target %",
    analysts_buy: "Buy ratings", analysts_hold: "Hold ratings", analysts_sell: "Sell ratings",
    eps_forecast: "EPS forecast (qtr)", eps_revisions_up: "EPS revisions up", eps_revisions_down: "EPS revisions down",
    last_surprise_pct: "Last EPS surprise %", market_cap_b: "Market cap ($B)", short_interest: "Short interest (sh)",
    short_change_pct: "Short interest change %", days_to_cover: "Days to cover",
  };
  const TOP_MOVES = 10;  // config.TOP_MOVES
  const FLAGS = ["Earnings this week", "Expected to rise", "Expected to fall", "Below expectations"];
  const FLAG_CLASS = { "Earnings this week": "earn", "Expected to rise": "rise", "Expected to fall": "fall",
                       "Below expectations": "below" };

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* blocked */ } },
  };

  /* ---------- theme ---------- */
  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  applyTheme(store.get("tt-theme", "auto"));
  const currentTheme = () => document.documentElement.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  /* ---------- navigation (one bar, injected on every page) ---------- */
  function renderNav() {
    const here = location.pathname.split("/").pop() || "index.html";
    const links = PAGES.map(p =>
      `<a href="${p.href}"${p.href === here ? ' aria-current="page"' : ""}>${p.label}</a>`).join("");
    const el = document.getElementById("nav");
    el.className = "nav";
    el.innerHTML = `
      <div class="offline-banner">Offline — showing the last data this device loaded.</div>
      <div class="nav-inner">
        <a class="brand" href="index.html"><img src="assets/icons/icon-192.png" alt="">
          <span>Data Tracker</span> <small>· Markets, earnings &amp; the TXSE</small></a>
        <nav class="nav-links">${links}</nav>
        <button class="icon-btn" id="theme-btn" title="Toggle light / dark">◐</button>
      </div>`;
    document.getElementById("theme-btn").addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next); store.set("tt-theme", next);
      document.dispatchEvent(new CustomEvent("tt-theme"));
    });
  }

  /* ---------- data ---------- */
  async function fetchData(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    if (res.headers.get("X-TT-Offline")) document.body.classList.add("offline");
    return res;
  }
  const loadStatus = async () => (await fetchData("data/status.json")).json();
  async function loadHistory() {
    const rows = parseCSV(await (await fetchData("data/history.csv")).text());
    for (const r of rows) for (const k of NUMERIC) r[k] = r[k] === "" || r[k] === undefined ? null : Number(r[k]);
    return rows;
  }

  /* RFC 4180 CSV parser -> array of objects keyed by header */
  function parseCSV(text) {
    const rows = []; let row = [], field = "", i = 0, q = false;
    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
      i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    const [head, ...body] = rows.filter(r => r.length > 1 || r[0] !== "");
    return (body || []).map(r => Object.fromEntries(head.map((h, k) => [h, r[k] ?? ""])));
  }

  /* ---------- history helpers ---------- */
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);   // code-point order, same as Python
  const runDates = rows => [...new Set(rows.map(r => r.date))].sort();
  const rowsOn = (rows, d) => rows.filter(r => r.date === d);
  const flagsOf = r => (r.signals || "").split(";").map(s => s.trim()).filter(Boolean);

  /* The move rule (same as tracker/moves.py):
     move % = (close in the latest run / close in the previous run - 1) x 100,
     ranked by absolute size, ties by item_id; top TOP_MOVES non-zero moves. */
  function compare(rows, date) {
    const dates = runDates(rows);
    date = date || dates[dates.length - 1];
    const earlier = dates.filter(d => d < date);
    const prevDate = earlier.length ? earlier[earlier.length - 1] : "";
    const today = new Map(rowsOn(rows, date).map(r => [r.item_id, r]));
    const prev = new Map(rowsOn(rows, prevDate).map(r => [r.item_id, r]));
    const all = [];
    for (const [id, r] of today) {
      const p = prev.get(id);
      if (!p || r.close === null || !p.close) continue;
      all.push({ item_id: id, item: r.item, exchange: r.exchange, group: r.group, old: p.close, new: r.close,
                 move_pct: Math.round((r.close / p.close - 1) * 100 * 1e4) / 1e4 });
    }
    all.sort((a, b) => Math.abs(b.move_pct) - Math.abs(a.move_pct) || cmp(a.item_id, b.item_id));
    return {
      date, prevDate, all, moves: all.filter(m => m.move_pct !== 0).slice(0, TOP_MOVES),
      appeared: prevDate ? [...today.keys()].filter(k => !prev.has(k)).sort(cmp) : [],
      gone: prevDate ? [...prev.keys()].filter(k => !today.has(k)).sort(cmp) : [],
      prevById: prev,
    };
  }

  /* ---------- formatting ---------- */
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toDay = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const fmtDate = s => s ? new Date(toDay(s)).toLocaleDateString(undefined,
    { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";
  const fmtTime = iso => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
  const fmtNum = (v, d = 2) => v === null || v === undefined || Number.isNaN(v) ? "—"
    : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtInt = v => v === null || v === undefined ? "—" : Math.round(v).toLocaleString();
  const fmtPct = (v, d = 2) => v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${fmtNum(v, d)}%`;
  const dir = v => v === null || v === undefined || v === 0 ? "flat" : v > 0 ? "up" : "down";
  const fmtCol = (k, v) => {
    if (v === null || v === undefined) return "—";
    if (/_pct$/.test(k)) return fmtPct(v);
    if (["volume", "analysts_buy", "analysts_hold", "analysts_sell", "eps_revisions_up", "eps_revisions_down",
         "short_interest"].includes(k)) return fmtInt(v);
    return fmtNum(v);
  };
  const chips = r => flagsOf(r).map(f => `<span class="chip ${FLAG_CLASS[f] || ""}">${esc(f)}</span>`).join("");
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const palette = () => ["--c1", "--c2", "--c3", "--c4", "--c5", "--c6"].map(css);

  function showError(err) {
    document.querySelector("main").insertAdjacentHTML("afterbegin", `<div class="card"><h2>Could not load the data</h2>
      <p class="sub">${esc(err.message)}. If you opened the file directly, run
      <code>python -m tracker serve</code> and visit http://localhost:8000.</p></div>`);
  }

  /* ---------- install / offline ---------- */
  if ("serviceWorker" in navigator) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  addEventListener("offline", () => document.body.classList.add("offline"));
  addEventListener("online", () => document.body.classList.remove("offline"));
  document.addEventListener("DOMContentLoaded", renderNav);

  return { NUMERIC, LABELS, FLAGS, FLAG_CLASS, store, loadStatus, loadHistory, parseCSV, cmp, runDates, rowsOn,
           flagsOf, compare, esc, fmtDate, fmtTime, fmtNum, fmtInt, fmtPct, fmtCol, dir, chips, css, palette,
           showError, currentTheme };
})();
