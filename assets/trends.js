/* Trends page: a chart of any numeric value over the days (with an item picker)
   and five findings. Every number is computed here from data/history.csv;
   tracker/trends.py computes the same numbers in Python as a cross-check. */

(async () => {
  const { esc, fmtNum, fmtPct, fmtDate, fmtShort, cmp, NUMERIC, LABELS, store, runDates, rowsOn, compare,
          divColor, maxAbs, css } = TT;
  let rows;
  try { rows = await TT.loadHistory(); } catch (e) { TT.showError(e); return; }
  TT.applyChartTheme();

  const dates = runDates(rows);
  const latestDate = dates[dates.length - 1] || "";
  const r4 = x => Math.round(x * 1e4) / 1e4;
  document.getElementById("span").innerHTML =
    `<b>${dates.length}</b> run${dates.length === 1 ? "" : "s"} · <b>${fmtShort(dates[0])} – ${fmtShort(latestDate)}</b> · ` +
    `${rows.length.toLocaleString()} rows · computed in your browser from <code>data/history.csv</code>`;

  const charts = {};
  const axisX = (extra = {}) => Object.assign({ grid: { display: false }, border: { color: css("--axis") },
    ticks: { color: css("--muted"), padding: 4, font: { size: 11 } } }, extra);
  const axisY = (extra = {}) => Object.assign({ grid: { color: css("--hairline"), drawTicks: false }, border: { display: false },
    ticks: { color: css("--muted"), padding: 6, font: { size: 11 } } }, extra);
  const pctTicks = { color: css("--muted"), padding: 6, font: { size: 11 }, callback: v => `${v}%` };
  function draw(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), config);
  }

  /* ================= explorer ================= */
  const MAX_SERIES = 8;   // the validated categorical palette has 8 slots; never cycled
  const items = [...new Map(rows.map(r => [r.item_id, r])).values()]
    .sort((a, b) => TT.GROUP_ORDER.indexOf(a.group) - TT.GROUP_ORDER.indexOf(b.group) || cmp(a.item_id, b.item_id));
  const nameOf = id => (items.find(r => r.item_id === id) || {}).item || id;
  const label = id => id === "^GSPC" ? "S&P 500" : id === "^IXIC" ? "NASDAQ" : id === "^NYA" ? "NYSE" : id === "TXS" ? "TXSE" : id;
  const X = Object.assign({ col: "close", mode: "rebased", picked: ["^GSPC", "^IXIC", "^NYA", "TXS"], slots: {} },
                          store.get("tt-trends-v2", {}));
  function slotFor(id) {   // colour follows the item until it is removed
    if (X.slots[id] === undefined) {
      const used = new Set(X.picked.filter(p => p !== id).map(p => X.slots[p]));
      X.slots[id] = [...Array(MAX_SERIES).keys()].find(s => !used.has(s));
    }
    return X.slots[id];
  }
  const setPicked = ids => {
    X.picked = [...new Set(ids)].slice(0, MAX_SERIES);
    X.slots = Object.fromEntries(Object.entries(X.slots).filter(([k]) => X.picked.includes(k)));
  };
  const $ = id => document.getElementById(id);
  $("x-col").innerHTML = NUMERIC.map(k => `<option value="${k}">${esc(LABELS[k])}</option>`).join("");

  const lastChange = (id) => {   // value shown on the chip: change over the window for the chosen column
    const s = TT.series(rows, id, X.col).filter(v => v !== null);
    return s.length > 1 && s[0] ? (s[s.length - 1] / s[0] - 1) * 100 : null;
  };

  function renderSeriesBar() {
    const pal = TT.seriesColors();
    const full = X.picked.length >= MAX_SERIES;
    $("x-series").innerHTML = X.picked.map(id => {
      const ch = lastChange(id);
      return `<span class="s-chip" title="${esc(nameOf(id))}"><i style="background:${pal[slotFor(id)]}"></i>${esc(label(id))}
        ${ch === null ? "" : `<span class="v ${TT.dir(ch)}">${fmtPct(ch, 1)}</span>`}
        <button data-remove="${esc(id)}" aria-label="Remove ${esc(id)}">×</button></span>`;
    }).join("") + `<span class="add-box"><input type="search" id="x-add" placeholder="${full ? "8 of 8 series" : "+ Add ticker"}"
        ${full ? "disabled" : ""} autocomplete="off" aria-label="Add a ticker"><div class="suggest" id="x-suggest"></div></span>`;
    const input = $("x-add"), box = $("x-suggest");
    let active = 0, matches = [];
    const show = () => {
      const q = input.value.trim().toLowerCase();
      matches = items.filter(r => !X.picked.includes(r.item_id) &&
        (!q || r.item_id.toLowerCase().includes(q) || r.item.toLowerCase().includes(q))).slice(0, 8);
      active = 0;
      box.innerHTML = matches.map((r, i) => `<button data-add="${esc(r.item_id)}" class="${i === 0 ? "active" : ""}">
        <b>${esc(r.item_id)}</b><span>${esc(r.item.length > 30 ? r.item.slice(0, 29) + "…" : r.item)}</span></button>`).join("")
        || `<button disabled>No match</button>`;
      box.classList.add("open");
    };
    input.addEventListener("focus", show);
    input.addEventListener("input", show);
    input.addEventListener("keydown", e => {
      const btns = box.querySelectorAll("button[data-add]");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % Math.max(btns.length, 1);
        btns.forEach((b, i) => b.classList.toggle("active", i === active));
      } else if (e.key === "Enter" && matches[active]) { add(matches[active].item_id); }
      else if (e.key === "Escape") { box.classList.remove("open"); input.blur(); }
    });
    input.addEventListener("blur", () => setTimeout(() => box.classList.remove("open"), 150));
    box.addEventListener("mousedown", e => { const b = e.target.closest("[data-add]"); if (b) { e.preventDefault(); add(b.dataset.add); } });
  }
  function add(id) { setPicked([...X.picked, id]); renderExplorer(); setTimeout(() => $("x-add")?.focus(), 0); }

  function renderExplorer() {
    store.set("tt-trends-v2", X);
    $("x-col").value = X.col;
    $("x-mode").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === X.mode));
    renderSeriesBar();
    const pal = TT.seriesColors();
    const rebased = X.mode === "rebased";
    const datasets = X.picked.map(id => {
      const s = TT.series(rows, id, X.col);
      const base = s.find(v => v !== null && v !== 0);
      const data = rebased ? s.map(v => (v === null || base === undefined ? null : r4((v / base) * 100))) : s;
      const color = pal[slotFor(id)];
      return { label: label(id), data, borderColor: color, backgroundColor: color, borderWidth: 2,
               pointRadius: dates.length > 20 ? 0 : 3, pointHoverRadius: 5, pointBorderColor: css("--surface"), pointBorderWidth: 1.5,
               spanGaps: true, tension: .2 };
    });
    draw("x-chart", { type: "line", data: { labels: dates.map(fmtShort), datasets },
      options: { interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false },   // the chips above are the legend
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}  ${c.parsed.y === null ? "—" : rebased ? fmtNum(c.parsed.y, 2) : fmtNum(c.parsed.y)}` } } },
        scales: { x: axisX(), y: axisY({ position: "right" }) } } });
  }
  $("x-col").addEventListener("change", e => { X.col = e.target.value; renderExplorer(); });
  $("x-mode").addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if (b) { X.mode = b.dataset.mode; renderExplorer(); } });
  $("x-series").addEventListener("click", e => {
    const b = e.target.closest("[data-remove]");
    if (b) { setPicked(X.picked.filter(x => x !== b.dataset.remove)); renderExplorer(); }
  });
  document.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => {
    const p = b.dataset.pick;
    setPicked(p === "none" ? [] : p === "stars" ? store.get("tt-stars", []) : items.filter(r => r.group === p).map(r => r.item_id));
    renderExplorer();
  }));

  /* ================= findings (same rules as tracker/trends.py) ================= */
  function changeSinceFirst(keep) {
    const first = new Map(), last = new Map();
    for (const r of [...rows].sort((a, b) => cmp(a.date, b.date))) {
      if (r.close === null || !keep(r)) continue;
      if (!first.has(r.item_id)) first.set(r.item_id, { item: r.item, close: r.close });
      last.set(r.item_id, r.close);
    }
    return [...first].filter(([, f]) => f.close).map(([id, f]) =>
      ({ id, item: f.item, first: f.close, last: last.get(id), pct: r4((last.get(id) / f.close - 1) * 100) }));
  }

  /* one panel: label + short finding (the heading), chart, then a one-line
     explanation with the numbers and how they are computed, and the data table */
  const panel = ({ id, labelText, headline, kpi = "", size = "chart-md", wide = false, note, table }) => `
    <section class="panel${wide ? " wide" : ""}">
      <div class="panel-head">
        <div class="panel-title"><span class="panel-label">${labelText}</span><h2 class="panel-headline">${headline}</h2></div>
        ${kpi ? `<span class="kpi">${kpi}</span>` : ""}
      </div>
      ${id ? `<div class="panel-body"><div class="${size}"><canvas id="${id}"></canvas></div></div>` : ""}
      <div class="panel-foot"><p class="calc">${note}</p>
        ${table ? `<details><summary>Data ▾</summary><div class="table-wrap"><table>${table}</table></div></details>` : ""}</div>
    </section>`;
  const tbl = (head, data) => `<thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ""}>${h}</th>`).join("")}</tr></thead>
    <tbody>${data.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;

  // bars on the diverging scale: blue above zero, orange below, deeper = larger
  function divBars(id, labels, values, { horizontal = false } = {}) {
    const m = maxAbs(values);
    draw(id, { type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: values.map(v => divColor(v, m)),
        borderRadius: 3, borderSkipped: "start", maxBarThickness: 26, categoryPercentage: .82, barPercentage: .9 }] },
      options: { indexAxis: horizontal ? "y" : "x", plugins: { legend: { display: false },
          tooltip: { callbacks: { label: c => ` ${fmtPct(c.parsed[horizontal ? "x" : "y"])}` } } },
        scales: horizontal ? { x: axisY({ ticks: pctTicks }), y: axisX() } : { x: axisX(), y: axisY({ ticks: pctTicks }) } } });
  }
  const kpiSpan = (v, d = 2) => `<span class="${TT.dir(v)}">${fmtPct(v, d)}</span>`;

  function renderFindings() {
    const out = [], after = [];
    const win = dates.length > 1 ? `${fmtShort(dates[0])} → ${fmtShort(latestDate)}` : fmtShort(latestDate);

    // 1. market scoreboard
    const mk = changeSinceFirst(r => r.group === "Index").sort((a, b) => b.pct - a.pct || cmp(a.id, b.id));
    if (mk.length) {
      const best = mk[0], worst = mk[mk.length - 1];
      out.push(panel({ id: "f1", labelText: "Markets",
        headline: dates.length < 2 ? "Baseline set" : `${label(best.id)} ${best.pct >= 0 ? "leads" : "held up best"}`,
        kpi: kpiSpan(best.pct),
        note: `${mk.map(m => `${label(m.id)} <b>${fmtPct(m.pct)}</b>`).join(" · ")}; spread ${fmtNum(best.pct - worst.pct)} pts.
          <br>Calc: latest ÷ first <code>close</code> − 1 per Index item, ${win}.`,
        table: tbl(["Market", "First", "Latest", "Change"], mk.map(m => [esc(label(m.id)), fmtNum(m.first), fmtNum(m.last), fmtPct(m.pct)])),
      }));
      after.push(() => divBars("f1", mk.map(m => label(m.id)), mk.map(m => m.pct)));
    }

    // 2. TXSE leaders
    const tx = changeSinceFirst(r => r.group === "TXSE").sort((a, b) => b.pct - a.pct || cmp(a.id, b.id));
    if (tx.length) {
      const best = tx[0], worst = tx[tx.length - 1], cfr = tx.find(t => t.id === "CFR");
      const ups = tx.filter(t => t.pct > 0).length, downs = tx.filter(t => t.pct < 0).length;
      out.push(panel({ id: "f2", labelText: "TXSE", wide: true,
        headline: dates.length < 2 ? `${tx.length} listings tracked` : `${best.id} leads, ${worst.id} lags`,
        kpi: `<span class="up">${ups}▲</span> <span class="down">${downs}▼</span>`,
        note: `${best.id} <b>${fmtPct(best.pct)}</b>, ${worst.id} <b>${fmtPct(worst.pct)}</b> of ${tx.length} listings${cfr ? `; CFR <b>${fmtPct(cfr.pct)}</b> (${fmtNum(cfr.first)} → ${fmtNum(cfr.last)})` : ""}.
          <br>Calc: latest ÷ first TXSE official <code>close</code> − 1, every TXSE listing, ${win}.`,
        table: tbl(["Listing", "First", "Latest", "Change"], tx.map(t => [`${esc(t.id)} <span class="sub">${esc(t.item)}</span>`, fmtNum(t.first), fmtNum(t.last), fmtPct(t.pct)])),
      }));
      after.push(() => divBars("f2", tx.map(t => t.id), tx.map(t => t.pct)));
    }

    // 3. analyst upside
    const up = rowsOn(rows, latestDate).filter(r => r.upside_pct !== null)
      .map(r => ({ id: r.item_id, item: r.item, pct: r.upside_pct, ex: r.exchange })).sort((a, b) => b.pct - a.pct || cmp(a.id, b.id));
    if (up.length) {
      const top = up[0], bottom = up[up.length - 1];
      const sel = up.length > 12 ? [...up.slice(0, 6), ...up.slice(-6)] : up;
      const median = [...up].sort((a, b) => a.pct - b.pct)[Math.floor((up.length - 1) / 2)].pct;
      const txs = up.filter(u => u.ex === "TXSE");
      out.push(panel({ id: "f3", labelText: "Analyst upside", size: "chart-md",
        headline: `Most upside: ${top.id}`, kpi: kpiSpan(top.pct, 1),
        note: `Median <b>${fmtPct(median, 1)}</b> across ${up.length} stocks${txs.length ? `; TXSE avg <b>${fmtPct(txs.reduce((s, u) => s + u.pct, 0) / txs.length, 1)}</b>` : ""};
          lowest ${bottom.id} <b>${fmtPct(bottom.pct, 1)}</b>. Chart: top and bottom 6.
          <br>Calc: <code>upside_pct</code> = consensus <code>target_price</code> ÷ <code>close</code> − 1, latest run.`,
        table: tbl(["Stock", "Exchange", "Upside"], up.map(u => [`${esc(u.id)} <span class="sub">${esc(u.item)}</span>`, esc(u.ex), fmtPct(u.pct, 1)])),
      }));
      after.push(() => divBars("f3", sel.map(s => s.id), sel.map(s => s.pct), { horizontal: true }));
    }

    // 4. biggest-move day
    const vol = dates.slice(1).map(d => {
      const ms = compare(rows, d).all.map(m => m.move_pct);
      if (!ms.length) return null;
      return { d, avg: r4(ms.reduce((s, x) => s + Math.abs(x), 0) / ms.length), n: ms.length,
               net: r4(ms.reduce((s, x) => s + x, 0) / ms.length), up: ms.filter(x => x > 0).length, down: ms.filter(x => x < 0).length };
    }).filter(Boolean);
    if (vol.length) {
      const top = [...vol].sort((a, b) => b.avg - a.avg || cmp(a.d, b.d))[0];
      out.push(panel({ id: "f4", labelText: "Volatility", headline: `Biggest day: ${fmtShort(top.d)}`, kpi: `${fmtNum(top.avg)}% avg |move|`,
        note: `${top.n} items: ${top.up} up, ${top.down} down, mean move <b>${fmtPct(top.net)}</b>. Bars: mean signed move per run.
          <br>Calc: mean of |close ÷ previous-run close − 1| across items in both runs.`,
        table: tbl(["Run", "Items", "Up", "Down", "Mean |move|", "Mean move"], vol.map(v => [fmtDate(v.d), v.n, v.up, v.down, `${fmtNum(v.avg)}%`, fmtPct(v.net)])),
      }));
      after.push(() => divBars("f4", vol.map(v => fmtShort(v.d)), vol.map(v => v.net)));
    } else {
      out.push(panel({ labelText: "Volatility", headline: "Needs a second run",
        note: `Calc: mean of |close ÷ previous-run close − 1| across items in both runs. Appears after the next daily run.` }));
    }

    // 5. signals over time
    const fl = dates.map(d => {
      const day = rowsOn(rows, d);
      const n = f => day.filter(r => TT.flagsOf(r).includes(f)).length;
      return { d, rise: n("Expected to rise"), fall: n("Expected to fall"), below: n("Below expectations"),
               withEst: day.filter(r => r.eps_revisions_up !== null || r.eps_revisions_down !== null).length };
    });
    if (fl.length) {
      const L = fl[fl.length - 1];
      out.push(panel({ id: "f5", labelText: "EPS revisions", headline: `${L.below} of ${L.withEst} see cuts`,
        kpi: `${L.withEst ? fmtNum((L.below / L.withEst) * 100, 0) : 0}%`,
        note: `Latest: rise <b>${L.rise}</b> · fall <b>${L.fall}</b> · below expectations <b>${L.below}</b> (dashed).
          <br>Calc: rows per run whose <code>signals</code> include each flag; base = rows with EPS revision data.`,
        table: tbl(["Run", "Rise", "Fall", "Below exp.", "With estimates"], fl.map(f => [fmtDate(f.d), f.rise, f.fall, f.below, f.withEst])),
      }));
      after.push(() => draw("f5", { type: "line", data: { labels: fl.map(f => fmtShort(f.d)), datasets: [
          { label: "Expected to rise", data: fl.map(f => f.rise), borderColor: css("--pos"), backgroundColor: css("--pos") },
          { label: "Expected to fall", data: fl.map(f => f.fall), borderColor: css("--neg"), backgroundColor: css("--neg") },
          { label: "Below expectations", data: fl.map(f => f.below), borderColor: css("--neg"), backgroundColor: css("--surface"), borderDash: [5, 4] },
        ].map(d => Object.assign(d, { borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: .2 })) },
        options: { interaction: { mode: "index", intersect: false },
          plugins: { legend: { position: "top", align: "end", labels: { font: { size: 11 } } } },
          scales: { x: axisX(), y: axisY({ beginAtZero: true, ticks: { color: css("--muted"), precision: 0, font: { size: 11 } } }) } } }));
    }

    // grid order: Markets + Analyst upside side by side, TXSE full width, then Volatility + EPS revisions
    const order = out.length === 5 ? [0, 2, 1, 3, 4] : out.map((_, i) => i);
    $("findings").innerHTML = order.map(i => out[i]).join("");
    after.forEach(f => f());
  }

  renderExplorer();
  renderFindings();
  document.addEventListener("tt-theme", () => { renderExplorer(); renderFindings(); });
})();
