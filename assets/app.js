/* Shared code for all three pages: navigation bar, theme, data loading, CSV
   parsing, the move rule, number formats, the diverging color scale, chart
   theming, and service worker registration. */

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
  const GROUP_ORDER = ["Index", "TXSE", "Watchlist", "Earnings this week"];

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
      <div class="offline-banner">Offline: showing the last data this device loaded.</div>
      <div class="nav-inner">
        <a class="brand" href="index.html"><img src="assets/icons/icon-192.png" alt="">
          <span><span class="brand-name">Data Tracker</span>
          <span class="brand-tag">Markets · Earnings · Texas Stock Exchange</span></span></a>
        <nav class="nav-links">${links}</nav>
        <button class="icon-btn" id="theme-btn" title="Switch light / dark">◐</button>
      </div>`;
    document.getElementById("theme-btn").addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next); store.set("tt-theme", next);
      applyChartTheme();
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
  const series = (rows, id, col = "close") => {
    const byDate = new Map(rows.filter(r => r.item_id === id).map(r => [r.date, r[col]]));
    return runDates(rows).map(d => byDate.has(d) ? byDate.get(d) : null);
  };

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
  const fmtShort = s => s ? new Date(toDay(s)).toLocaleDateString(undefined,
    { month: "short", day: "numeric", timeZone: "UTC" }) : "—";
  const fmtTime = iso => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
  const fmtNum = (v, d = 2) => v === null || v === undefined || Number.isNaN(v) ? "—"
    : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtInt = v => v === null || v === undefined ? "—" : Math.round(v).toLocaleString();
  const fmtPct = (v, d = 2) => v === null || v === undefined ? "—"
    : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtNum(Math.abs(v), d)}%`;
  const dir = v => v === null || v === undefined || v === 0 ? "flat" : v > 0 ? "up" : "down";
  const arrow = v => v === null || v === undefined || v === 0 ? "" : v > 0 ? "▲ " : "▼ ";
  const delta = (v, d = 2) => `<span class="${dir(v)}">${arrow(v)}${fmtPct(v, d)}</span>`;
  const fmtCol = (k, v) => {
    if (v === null || v === undefined) return "—";
    if (/_pct$/.test(k)) return fmtPct(v);
    if (["volume", "analysts_buy", "analysts_hold", "analysts_sell", "eps_revisions_up", "eps_revisions_down",
         "short_interest"].includes(k)) return fmtInt(v);
    return fmtNum(v);
  };
  const chips = r => flagsOf(r).map(f => `<span class="chip ${FLAG_CLASS[f] || ""}">${esc(f)}</span>`).join("");
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ---------- the diverging color scale ----------
     Blue for values above zero, burnt orange below, interpolated in OKLab from the
     ramp's light step (small magnitude) to its deep step (large magnitude).
     t = |value| / maxAbs, so the deepest shade is the largest move on screen. */
  const hex2rgb = h => { h = h.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
  const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const delin = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  function toOklab(hex) {
    const [r, g, b] = hex2rgb(hex).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function fromOklab([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
          s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                 -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    return "#" + rgb.map(c => Math.round(Math.min(1, Math.max(0, delin(c))) * 255).toString(16).padStart(2, "0")).join("");
  }
  const mix = (a, b, t) => { const A = toOklab(a), B = toOklab(b); return fromOklab(A.map((x, i) => x + (B[i] - x) * t)); };
  function divColor(v, maxAbs) {
    if (v === null || v === undefined || !maxAbs || v === 0) return css("--mid");
    const t = Math.min(1, Math.abs(v) / maxAbs);
    return v > 0 ? mix(css("--pos-lo"), css("--pos-hi"), t) : mix(css("--neg-lo"), css("--neg-hi"), t);
  }
  /* table cell tint: same scale, blended into the surface so the text stays legible */
  function heat(v, maxAbs) {
    if (v === null || v === undefined || !maxAbs || v === 0) return "";
    const t = Math.min(1, Math.abs(v) / maxAbs);
    return `background-color: color-mix(in oklab, var(${v > 0 ? "--pos" : "--neg"}) ${Math.round(5 + 33 * t)}%, var(--surface));`;
  }
  const maxAbs = vals => Math.max(0, ...vals.filter(v => v !== null && v !== undefined && Number.isFinite(v)).map(Math.abs));
  const seriesColors = () => ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"].map(css);
  const scaleLegend = (lo = "Loss", hi = "Gain") =>
    `<span class="scale">${lo}<span class="bar" aria-hidden="true"></span>${hi}</span>`;

  /* sparkline: a 2px line over the runs, blue if the last value is above the first, orange if below */
  function spark(values) {
    const pts = values.map((v, i) => [i, v]).filter(([, v]) => v !== null);
    if (pts.length < 2) return `<svg class="spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="18" x2="100" y2="18" stroke="var(--hairline)" stroke-width="2" stroke-dasharray="3 3"/></svg>`;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)], [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const X = x => ((x - x0) / (x1 - x0 || 1)) * 100, Y = y => 32 - ((y - y0) / (y1 - y0 || 1)) * 28;
    const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(2)},${Y(y).toFixed(2)}`).join("");
    const col = ys[ys.length - 1] >= ys[0] ? "var(--pos)" : "var(--neg)";
    return `<svg class="spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
      <path d="${d}L100,36L0,36Z" fill="${col}" opacity=".10"/>
      <path d="${d}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
  }

  /* ---------- Chart.js theme (recessive axes, hairline grid, page fonts) ---------- */
  function applyChartTheme() {
    if (typeof Chart === "undefined") return;
    const d = Chart.defaults;
    d.font.family = css("--sans") || "Inter, system-ui, sans-serif";
    d.font.size = 12;
    d.color = css("--muted");
    d.borderColor = css("--hairline");
    d.animation = false;
    d.maintainAspectRatio = false;
    d.plugins.legend.labels.color = css("--ink-2");
    d.plugins.legend.labels.usePointStyle = true;
    d.plugins.legend.labels.pointStyle = "rectRounded";
    d.plugins.legend.labels.boxWidth = 10;
    d.plugins.legend.labels.boxHeight = 10;
    const tt = d.plugins.tooltip;
    tt.backgroundColor = css("--surface");
    tt.titleColor = css("--ink");
    tt.bodyColor = css("--ink-2");
    tt.borderColor = css("--border");
    tt.borderWidth = 1;
    tt.padding = 10;
    tt.cornerRadius = 6;
    tt.titleFont = { family: d.font.family, weight: "600", size: 12 };
    tt.bodyFont = { family: d.font.family, size: 12 };
    tt.boxPadding = 4;
    tt.usePointStyle = true;
  }

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
  document.addEventListener("DOMContentLoaded", () => { renderNav(); applyChartTheme(); });

  return { NUMERIC, LABELS, FLAGS, FLAG_CLASS, GROUP_ORDER, store, loadStatus, loadHistory, parseCSV, cmp, runDates,
           rowsOn, flagsOf, series, compare, esc, fmtDate, fmtShort, fmtTime, fmtNum, fmtInt, fmtPct, fmtCol, dir,
           arrow, delta, chips, css, divColor, heat, maxAbs, seriesColors, scaleLegend, spark, applyChartTheme,
           showError, currentTheme };
})();
