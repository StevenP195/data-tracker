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
  document.getElementById("span").textContent =
    `Every number on this page is computed in your browser from data/history.csv: ${rows.length.toLocaleString()} rows over ` +
    `${dates.length} run${dates.length === 1 ? "" : "s"}, ${fmtDate(dates[0])} to ${fmtDate(latestDate)}.`;

  const charts = {};
  const grid = () => ({ color: css("--hairline"), drawTicks: false });
  const axisX = (extra = {}) => Object.assign({ grid: { display: false }, border: { color: css("--axis") },
    ticks: { color: css("--muted"), padding: 6 } }, extra);
  const axisY = (extra = {}) => Object.assign({ grid: grid(), border: { display: false },
    ticks: { color: css("--muted"), padding: 8 } }, extra);
  function draw(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), config);
  }

  /* ================= explorer ================= */
  const MAX_SERIES = 8;   // the validated categorical palette has 8 slots; never cycled
  const items = [...new Map(rows.map(r => [r.item_id, r])).values()]
    .sort((a, b) => TT.GROUP_ORDER.indexOf(a.group) - TT.GROUP_ORDER.indexOf(b.group) || cmp(a.item_id, b.item_id));
  const nameOf = id => (items.find(r => r.item_id === id) || {}).item || id;
  const X = Object.assign({ col: "close", mode: "rebased", picked: ["^GSPC", "^IXIC", "^NYA", "TXS"], slots: {} },
                          store.get("tt-trends-v2", {}));
  // colour follows the item: each picked item keeps its slot until it is removed
  function slotFor(id) {
    if (X.slots[id] === undefined) {
      const used = new Set(X.picked.filter(p => p !== id).map(p => X.slots[p]));
      X.slots[id] = [...Array(MAX_SERIES).keys()].find(s => !used.has(s));
    }
    return X.slots[id];
  }
  const setPicked = ids => {
    X.picked = ids.slice(0, MAX_SERIES);
    X.slots = Object.fromEntries(Object.entries(X.slots).filter(([k]) => X.picked.includes(k)));
  };
  const $ = id => document.getElementById(id);
  $("x-col").innerHTML = NUMERIC.map(k => `<option value="${k}">${esc(LABELS[k])}</option>`).join("");

  function renderPicker() {
    const q = $("x-q").value.trim().toLowerCase();
    const full = X.picked.length >= MAX_SERIES;
    $("x-items").innerHTML = items.filter(r => !q || r.item.toLowerCase().includes(q) || r.item_id.toLowerCase().includes(q))
      .map(r => {
        const on = X.picked.includes(r.item_id);
        return `<label${!on && full ? ' style="opacity:.45"' : ""}><input type="checkbox" value="${esc(r.item_id)}" ${on ? "checked" : ""} ${!on && full ? "disabled" : ""}>
          <b style="font-weight:600;color:var(--ink)">${esc(r.item_id)}</b> ${esc(r.item.length > 24 ? r.item.slice(0, 23) + "…" : r.item)}</label>`;
      }).join("");
  }
  function renderExplorer() {
    store.set("tt-trends-v2", X);
    $("x-col").value = X.col; $("x-mode").value = X.mode;
    const pal = TT.seriesColors();
    const datasets = X.picked.map(id => {
      const s = TT.series(rows, id, X.col);
      let data = s;
      if (X.mode === "rebased") {
        const base = s.find(v => v !== null && v !== 0);
        data = s.map(v => (v === null || base === undefined ? null : r4((v / base) * 100)));
      }
      const color = pal[slotFor(id)];
      return { label: `${id}  ${nameOf(id)}`.slice(0, 38), data, borderColor: color, backgroundColor: color,
               borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: css("--surface"), pointBorderWidth: 2,
               spanGaps: true, tension: .25 };
    });
    const rebased = X.mode === "rebased";
    draw("x-chart", { type: "line", data: { labels: dates.map(fmtShort), datasets },
      options: { interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label.split("  ")[0]}: ${c.parsed.y === null ? "—" : rebased ? fmtNum(c.parsed.y, 1) : fmtNum(c.parsed.y)}` } } },
        scales: { x: axisX(), y: axisY({ title: { display: true, text: rebased ? "Index (first day = 100)" : LABELS[X.col], color: css("--muted") } }) } } });
    $("x-caption").innerHTML = `<b>Figure A.</b> ${esc(LABELS[X.col])}${rebased ? ", rebased to 100 on each item's first day" : ""}, by run date.`;
    $("x-note").textContent = `${X.picked.length} of ${MAX_SERIES} series`;
  }
  $("x-col").addEventListener("change", e => { X.col = e.target.value; renderExplorer(); });
  $("x-mode").addEventListener("change", e => { X.mode = e.target.value; renderExplorer(); });
  $("x-q").addEventListener("input", renderPicker);
  $("x-items").addEventListener("change", e => {
    const id = e.target.value;
    setPicked(e.target.checked ? [...X.picked, id] : X.picked.filter(x => x !== id));
    renderPicker(); renderExplorer();
  });
  document.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => {
    const p = b.dataset.pick;
    setPicked(p === "none" ? [] : p === "stars" ? store.get("tt-stars", []) : items.filter(r => r.group === p).map(r => r.item_id));
    renderPicker(); renderExplorer();
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

  let fig = 0;
  const finding = ({ id, label, title, body, caption, table, method, tall }) => {
    fig += 1;
    return `<section class="card finding">
      <div class="eyebrow">Finding ${fig} · ${label}</div>
      <h2>${title}</h2>
      <p class="body">${body}</p>
      ${id ? `<figure><div class="chart-box ${tall ? "" : "short"}"><canvas id="${id}"></canvas></div>
        <figcaption><span><b>Figure ${fig}.</b> ${caption}</span>${TT.scaleLegend()}</figcaption></figure>` : ""}
      ${table ? `<details class="data-table"><summary>View the data table</summary><div class="table-wrap"><table>${table}</table></div></details>` : ""}
      <p class="method"><b>Method</b>${method}</p>
    </section>`;
  };
  const tbl = (head, data) => `<thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ""}>${h}</th>`).join("")}</tr></thead>
    <tbody>${data.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;

  // bars coloured on the diverging scale: blue above zero, orange below, deeper = larger
  function divBars(id, labels, values, { horizontal = false, unit = "pct" } = {}) {
    const m = maxAbs(values);
    const fmt = v => (unit === "pct" ? fmtPct(v) : fmtNum(v));
    draw(id, { type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: values.map(v => divColor(v, m)),
        borderRadius: 4, borderSkipped: "start", maxBarThickness: 30, categoryPercentage: .8, barPercentage: .9 }] },
      options: { indexAxis: horizontal ? "y" : "x", plugins: { legend: { display: false },
          tooltip: { callbacks: { label: c => ` ${fmt(c.parsed[horizontal ? "x" : "y"])}` } } },
        scales: horizontal
          ? { x: axisY({ ticks: { color: css("--muted"), callback: v => `${v}%` } }), y: axisX({ grid: { display: false } }) }
          : { x: axisX(), y: axisY({ ticks: { color: css("--muted"), callback: v => `${v}%` } }) } } });
  }

  function renderFindings() {
    fig = 0;
    const out = [], after = [];
    const span = dates.length > 1 ? `between ${fmtDate(dates[0])} and ${fmtDate(latestDate)}` : `on ${fmtDate(latestDate)}, the only run so far`;

    // 1. market scoreboard
    const mk = changeSinceFirst(r => r.group === "Index").sort((a, b) => b.pct - a.pct || cmp(a.id, b.id));
    if (mk.length) {
      const best = mk[0], worst = mk[mk.length - 1], tx = mk.find(m => m.id === "TXS");
      const short = m => m.id === "TXS" ? "TXSE (TXS)" : m.item;
      out.push(finding({ id: "f1", label: "Market scoreboard",
        title: dates.length < 2 ? "The market scoreboard starts today"
          : best.pct >= 0 ? `${esc(short(best))} leads the four markets, ${fmtPct(best.pct)} since the first run`
          : `All four markets are down since the first run; ${esc(short(best))} has held up best (${fmtPct(best.pct)})`,
        body: `${mk.map(m => `${esc(short(m))} ${fmtNum(m.first)} → ${fmtNum(m.last)} (<strong>${fmtPct(m.pct)}</strong>)`).join("; ")}.
          ${tx ? `The Texas Stock Exchange proxy ranks ${mk.indexOf(tx) + 1} of ${mk.length}. ` : ""}The spread between the strongest and weakest market is
          <strong>${fmtNum(best.pct - worst.pct)} percentage points</strong>.`,
        caption: `Change in level since the first run, by market (${span}).`,
        table: tbl(["Market", "First", "Latest", "Change"], mk.map(m => [esc(short(m)), fmtNum(m.first), fmtNum(m.last), fmtPct(m.pct)])),
        method: `For each item in the Index group, the first and latest non-empty <code>close</code> in the history file; change = latest ÷ first − 1.`,
      }));
      after.push(() => divBars("f1", mk.map(short), mk.map(m => m.pct)));
    }

    // 2. TXSE leaders
    const tx = changeSinceFirst(r => r.group === "TXSE").sort((a, b) => b.pct - a.pct || cmp(a.id, b.id));
    if (tx.length) {
      const best = tx[0], worst = tx[tx.length - 1], cfr = tx.find(t => t.id === "CFR");
      const ups = tx.filter(t => t.pct > 0).length, downs = tx.filter(t => t.pct < 0).length;
      out.push(finding({ id: "f2", label: "Texas Stock Exchange", tall: true,
        title: dates.length > 1 ? `${esc(best.id)} leads the TXSE listings (${fmtPct(best.pct)}); ${esc(worst.id)} trails (${fmtPct(worst.pct)})`
                                : `${tx.length} TXSE listings are tracked from today`,
        body: `Of <strong>${tx.length}</strong> securities listed on the Texas Stock Exchange, <strong>${ups}</strong> are up and
          <strong>${downs}</strong> are down since the first run.
          ${cfr ? `Cullen/Frost (CFR), which moved its primary listing from the NYSE on November 12, 2026, went from ${fmtNum(cfr.first)} to ${fmtNum(cfr.last)} (<strong>${fmtPct(cfr.pct)}</strong>).` : ""}`,
        caption: `Change in TXSE official closing price since the first run, every TXSE listing (${span}).`,
        table: tbl(["Listing", "First", "Latest", "Change"], tx.map(t => [`${esc(t.id)} <span class="sub">${esc(t.item)}</span>`, fmtNum(t.first), fmtNum(t.last), fmtPct(t.pct)])),
        method: `Every item in the TXSE group (stocks, preferreds and ETFs listed on TXSE), first and latest <code>close</code> (TXSE's official closing price); change = latest ÷ first − 1.`,
      }));
      after.push(() => divBars("f2", tx.map(t => t.id), tx.map(t => t.pct)));
    }

    // 3. analyst upside
    const up = rowsOn(rows, latestDate).filter(r => r.upside_pct !== null)
      .map(r => ({ id: r.item_id, item: r.item, pct: r.upside_pct, ex: r.exchange })).sort((a, b) => b.pct - a.pct || cmp(a.id, b.id));
    if (up.length) {
      const top = up[0], bottom = up[up.length - 1];
      const sel = up.length > 14 ? [...up.slice(0, 7), ...up.slice(-7)] : up;
      const median = [...up].sort((a, b) => a.pct - b.pct)[Math.floor((up.length - 1) / 2)].pct;
      const txs = up.filter(u => u.ex === "TXSE");
      out.push(finding({ id: "f3", label: "Analyst expectations", tall: true,
        title: `Analysts see the most room in ${esc(top.id)} (${fmtPct(top.pct, 1)}); ${esc(bottom.id)} trades ${bottom.pct < 0 ? "above" : "closest to"} its target`,
        body: `In the latest run, <strong>${up.length}</strong> stocks carry a consensus price target. ${esc(top.item)} sits ${fmtPct(top.pct, 1)} below its target,
          while ${esc(bottom.item)} is at ${fmtPct(bottom.pct, 1)}. The median upside is <strong>${fmtPct(median, 1)}</strong>${txs.length
          ? `; the ${txs.length} TXSE stocks average <strong>${fmtPct(txs.reduce((s, u) => s + u.pct, 0) / txs.length, 1)}</strong>` : ""}.`,
        caption: `Upside to the consensus analyst target, latest run (${sel.length < up.length ? "the 7 largest and 7 smallest" : "all stocks"}).`,
        table: tbl(["Stock", "Exchange", "Upside to target"], up.map(u => [`${esc(u.id)} <span class="sub">${esc(u.item)}</span>`, esc(u.ex), fmtPct(u.pct, 1)])),
        method: `<code>upside_pct</code> on the latest date, which the build computes as consensus <code>target_price</code> ÷ <code>close</code> − 1.`,
      }));
      after.push(() => divBars("f3", sel.map(s => s.id), sel.map(s => s.pct), { horizontal: true }));
    }

    // 4. biggest-move day
    const vol = dates.slice(1).map(d => {
      const ms = compare(rows, d).all.map(m => m.move_pct);
      if (!ms.length) return null;
      const abs = ms.map(Math.abs);
      return { d, avg: r4(abs.reduce((s, x) => s + x, 0) / abs.length), n: ms.length,
               net: r4(ms.reduce((s, x) => s + x, 0) / ms.length), up: ms.filter(x => x > 0).length, down: ms.filter(x => x < 0).length };
    }).filter(Boolean);
    if (vol.length) {
      const top = [...vol].sort((a, b) => b.avg - a.avg || cmp(a.d, b.d))[0];
      const calm = vol.filter(v => v.avg === 0).length;
      out.push(finding({ id: "f4", label: "Volatility",
        title: `${fmtDate(top.d)} was the biggest-move day: the average item moved ${fmtNum(top.avg)}%`,
        body: `Across <strong>${vol.length}</strong> run${vol.length === 1 ? "" : "s"} with a previous run to compare against, the largest mean absolute move
          was <strong>${fmtNum(top.avg)}%</strong> (${top.n} items; ${top.up} rose, ${top.down} fell; average signed move ${fmtPct(top.net)}).
          ${calm} run${calm === 1 ? " was" : "s were"} flat: weekends and holidays, when no closing price changes.`,
        caption: `Average signed move per run: bar height is the mean move, shade is its direction and size.`,
        table: tbl(["Run", "Items", "Rose", "Fell", "Mean |move|", "Mean move"], vol.map(v => [fmtDate(v.d), v.n, v.up, v.down, `${fmtNum(v.avg)}%`, fmtPct(v.net)])),
        method: `For each run date, the move rule (close ÷ close in the previous run − 1) for every item present in both runs. The headline ranks runs by the mean
          of the absolute moves; the bars show the mean signed move.`,
      }));
      after.push(() => divBars("f4", vol.map(v => fmtShort(v.d)), vol.map(v => v.net)));
    } else {
      out.push(finding({ label: "Volatility", title: "The biggest-move day appears after the second run",
        body: `<span class="empty">This finding needs two runs to compare. The pipeline runs once a day.</span>`,
        method: `For each run date, the mean absolute move across items present in both runs.` }));
    }

    // 5. signals over time
    const fl = dates.map(d => {
      const day = rowsOn(rows, d);
      const n = f => day.filter(r => TT.flagsOf(r).includes(f)).length;
      return { d, rise: n("Expected to rise"), fall: n("Expected to fall"), below: n("Below expectations"),
               withEst: day.filter(r => r.eps_revisions_up !== null || r.eps_revisions_down !== null).length };
    });
    if (fl.length) {
      const L = fl[fl.length - 1], F = fl[0];
      out.push(finding({ id: "f5", label: "Estimate revisions",
        title: `${L.below} of ${L.withEst} stocks with estimates are seeing more EPS cuts than raises`,
        body: `Latest run: <strong>${L.rise}</strong> stocks flagged Expected to rise, <strong>${L.fall}</strong> Expected to fall and
          <strong>${L.below}</strong> Below expectations (${L.withEst ? fmtNum((L.below / L.withEst) * 100, 0) : 0}% of stocks with estimate data).
          ${fl.length > 1 ? `On the first run the counts were ${F.rise}, ${F.fall} and ${F.below}.` : ""}`,
        caption: `Number of stocks carrying each signal, by run. Solid blue: expected to rise; solid orange: expected to fall; dashed orange: below expectations.`,
        table: tbl(["Run", "Expected to rise", "Expected to fall", "Below expectations", "With estimates"], fl.map(f => [fmtDate(f.d), f.rise, f.fall, f.below, f.withEst])),
        method: `Per run date, the number of rows whose <code>signals</code> contain each flag; "with estimates" counts rows with a non-empty
          <code>eps_revisions_up</code> or <code>eps_revisions_down</code>.`,
      }));
      after.push(() => draw("f5", { type: "line", data: { labels: fl.map(f => fmtShort(f.d)), datasets: [
          { label: "Expected to rise", data: fl.map(f => f.rise), borderColor: css("--pos"), backgroundColor: css("--pos") },
          { label: "Expected to fall", data: fl.map(f => f.fall), borderColor: css("--neg"), backgroundColor: css("--neg") },
          { label: "Below expectations", data: fl.map(f => f.below), borderColor: css("--neg"), backgroundColor: css("--surface"),
            borderDash: [6, 4] }].map(d => Object.assign(d, { borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderWidth: 2, tension: .2 })) },
        options: { interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom" } },
          scales: { x: axisX(), y: axisY({ beginAtZero: true, ticks: { color: css("--muted"), precision: 0 } }) } } }));
    }

    document.getElementById("findings").innerHTML = out.join("");
    // findings 4 and 5 are not gain/loss shaded in the same way: drop the scale legend where it does not apply
    document.querySelectorAll("#f5").forEach(c => c.closest("figure").querySelector(".scale")?.remove());
    after.forEach(f => f());
  }

  renderPicker();
  renderExplorer();
  renderFindings();
  document.addEventListener("tt-theme", () => { renderExplorer(); renderFindings(); });
})();
