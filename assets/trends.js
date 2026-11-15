/* Trends page: a chart of any numeric value over the days (with an item picker)
   and five findings. Every number is computed here from data/history.csv;
   tracker/trends.py computes the same numbers in Python as a cross-check. */

(async () => {
  const { esc, fmtNum, fmtPct, fmtDate, cmp, NUMERIC, LABELS, store, runDates, rowsOn, compare } = TT;
  let rows;
  try { rows = await TT.loadHistory(); } catch (e) { TT.showError(e); return; }

  const dates = runDates(rows);
  const latestDate = dates[dates.length - 1] || "";
  const r4 = x => Math.round(x * 1e4) / 1e4;
  document.getElementById("span").textContent =
    `Every number on this page is computed in your browser from data/history.csv: ${rows.length.toLocaleString()} rows over ` +
    `${dates.length} run${dates.length === 1 ? "" : "s"} (${fmtDate(dates[0])} – ${fmtDate(latestDate)}).`;

  const charts = {};
  function draw(id, config) {
    if (charts[id]) charts[id].destroy();
    const text = TT.css("--text"), grid = TT.css("--border");
    config.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { labels: { color: text, boxWidth: 12 } } },
      scales: { x: { ticks: { color: text }, grid: { color: grid } }, y: { ticks: { color: text }, grid: { color: grid } } },
    }, config.options || {});
    charts[id] = new Chart(document.getElementById(id), config);
  }

  /* ================= explorer ================= */
  const items = [...new Map(rows.map(r => [r.item_id, r])).values()]
    .sort((a, b) => ["Index", "TXSE", "Watchlist", "Earnings this week"].indexOf(a.group) -
                    ["Index", "TXSE", "Watchlist", "Earnings this week"].indexOf(b.group) || cmp(a.item_id, b.item_id));
  const X = Object.assign({ col: "close", mode: "rebased", picked: ["^GSPC", "^IXIC", "^NYA", "TXS"] }, store.get("tt-trends", {}));
  const $ = id => document.getElementById(id);
  $("x-col").innerHTML = NUMERIC.map(k => `<option value="${k}">${esc(LABELS[k])}</option>`).join("");

  function renderPicker() {
    const q = $("x-q").value.trim().toLowerCase();
    $("x-items").innerHTML = items.filter(r => !q || r.item.toLowerCase().includes(q) || r.item_id.toLowerCase().includes(q))
      .map(r => `<label><input type="checkbox" value="${esc(r.item_id)}" ${X.picked.includes(r.item_id) ? "checked" : ""}>
        ${esc(r.item_id)} <span class="sub">${esc(r.item.length > 26 ? r.item.slice(0, 25) + "…" : r.item)}</span></label>`).join("");
  }
  function renderExplorer() {
    store.set("tt-trends", X);
    $("x-col").value = X.col; $("x-mode").value = X.mode;
    const pal = TT.palette();
    const datasets = X.picked.map((id, i) => {
      const series = dates.map(d => { const r = rows.find(x => x.date === d && x.item_id === id); return r ? r[X.col] : null; });
      let data = series;
      if (X.mode === "rebased") {
        const base = series.find(v => v !== null && v !== 0);
        data = series.map(v => (v === null || base === undefined ? null : r4((v / base) * 100)));
      }
      const name = (items.find(r => r.item_id === id) || {}).item || id;
      return { label: `${id} · ${name}`.slice(0, 40), data, borderColor: pal[i % pal.length], backgroundColor: pal[i % pal.length],
               spanGaps: true, tension: .2, pointRadius: 3 };
    });
    draw("x-chart", { type: "line", data: { labels: dates.map(d => fmtDate(d)), datasets },
      options: { plugins: { legend: { position: "bottom", labels: { color: TT.css("--text"), boxWidth: 12 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtNum(c.parsed.y)}` } } } } });
  }
  $("x-col").addEventListener("change", e => { X.col = e.target.value; renderExplorer(); });
  $("x-mode").addEventListener("change", e => { X.mode = e.target.value; renderExplorer(); });
  $("x-q").addEventListener("input", renderPicker);
  $("x-items").addEventListener("change", e => {
    const id = e.target.value;
    X.picked = e.target.checked ? [...X.picked, id] : X.picked.filter(x => x !== id);
    renderExplorer();
  });
  document.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => {
    const p = b.dataset.pick;
    X.picked = p === "none" ? [] : p === "stars" ? store.get("tt-stars", []) : items.filter(r => r.group === p).map(r => r.item_id);
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

  const finding = (id, title, body, how) =>
    `<section class="card finding"><h2>${title}</h2><p>${body}</p><p class="how">${how}</p>
     <div class="chart-box short"><canvas id="${id}"></canvas></div></section>`;
  const signColors = vals => vals.map(v => (v >= 0 ? TT.css("--up") : TT.css("--down")));
  const bar = (id, labels, data, opts = {}) => draw(id, { type: "bar",
    data: { labels, datasets: [{ label: opts.label || "", data, backgroundColor: opts.colors || signColors(data) }] },
    options: Object.assign({ indexAxis: opts.horizontal ? "y" : "x", plugins: { legend: { display: false },
      tooltip: { callbacks: { label: c => `${opts.label ? opts.label + ": " : ""}${opts.pct === false ? fmtNum(c.parsed[opts.horizontal ? "x" : "y"]) : fmtPct(c.parsed[opts.horizontal ? "x" : "y"])}` } } } }, opts.options || {}) });

  function renderFindings() {
    const out = [], after = [];
    const span = dates.length > 1 ? `between ${fmtDate(dates[0])} and ${fmtDate(latestDate)}` : `on ${fmtDate(latestDate)} (the only run so far)`;

    // 1. market scoreboard
    const mk = changeSinceFirst(r => r.group === "Index").sort((a, b) => b.pct - a.pct || cmp(a.id, b.id));
    if (mk.length) {
      const best = mk[0], worst = mk[mk.length - 1], tx = mk.find(m => m.id === "TXS");
      out.push(finding("f1", dates.length > 1
          ? `${esc(best.item)} leads the four markets, ${fmtPct(best.pct)} since the first run`
          : `Market scoreboard starts today: four markets, one baseline`,
        `${mk.map(m => `${esc(m.item)} ${fmtNum(m.first)} → ${fmtNum(m.last)} (<strong>${fmtPct(m.pct)}</strong>)`).join("; ")}.
         ${tx ? `The Texas Stock Exchange stand-in (TXS) sits ${mk.indexOf(tx) + 1} of ${mk.length}. ` : ""}
         The spread between the best and worst market is ${fmtNum(best.pct - worst.pct)} percentage points.`,
        `How: for each row in the Index group, the first and latest non-empty <code>close</code> in the history file;
         change = latest ÷ first − 1, ${span}.`));
      after.push(() => bar("f1", mk.map(m => m.item.replace("TXSE: Texas Equity Index ETF (TXS)", "TXSE (TXS)")), mk.map(m => m.pct),
        { label: "Change since first run" }));
    }

    // 2. TXSE leaders
    const tx = changeSinceFirst(r => r.group === "TXSE").sort((a, b) => b.pct - a.pct || cmp(a.id, b.id));
    if (tx.length) {
      const best = tx[0], worst = tx[tx.length - 1];
      const cfr = tx.find(t => t.id === "CFR");
      const ups = tx.filter(t => t.pct > 0).length, downs = tx.filter(t => t.pct < 0).length;
      out.push(finding("f2", dates.length > 1
          ? `${esc(best.id)} leads the TXSE listings (${fmtPct(best.pct)}); ${esc(worst.id)} trails (${fmtPct(worst.pct)})`
          : `${tx.length} TXSE listings are being tracked from today`,
        `Of ${tx.length} securities listed on the Texas Stock Exchange, ${ups} are up and ${downs} are down since the first run.
         ${cfr ? `Cullen/Frost (CFR), which moved its listing from the NYSE on Nov 12, 2026, went from ${fmtNum(cfr.first)} to ${fmtNum(cfr.last)} (${fmtPct(cfr.pct)}).` : ""}`,
        `How: every item in the TXSE group (stocks, preferreds and ETFs listed on TXSE), first and latest <code>close</code>
         (TXSE's official closing price); change = latest ÷ first − 1, ${span}.`));
      after.push(() => bar("f2", tx.map(t => t.id), tx.map(t => t.pct), { label: "Change since first run" }));
    }

    // 3. analyst upside
    const up = rowsOn(rows, latestDate).filter(r => r.upside_pct !== null)
      .map(r => ({ id: r.item_id, item: r.item, pct: r.upside_pct, ex: r.exchange })).sort((a, b) => b.pct - a.pct || cmp(a.id, b.id));
    if (up.length) {
      const top = up[0], bottom = up[up.length - 1];
      const sel = up.length > 12 ? [...up.slice(0, 6), ...up.slice(-6)] : up;
      const median = [...up].sort((a, b) => a.pct - b.pct)[Math.floor((up.length - 1) / 2)].pct;
      const txAvg = up.filter(u => u.ex === "TXSE");
      out.push(finding("f3", `Analysts see the most room in ${esc(top.id)} (${fmtPct(top.pct, 1)}); ${esc(bottom.id)} trades ${bottom.pct < 0 ? "above" : "closest to"} its target`,
        `In the latest run, ${up.length} stocks have a consensus price target. ${esc(top.item)} is ${fmtPct(top.pct, 1)} below its target,
         while ${esc(bottom.item)} is at ${fmtPct(bottom.pct, 1)}. The median upside is ${fmtPct(median, 1)}${txAvg.length
         ? `; the ${txAvg.length} TXSE stocks average ${fmtPct(txAvg.reduce((s, u) => s + u.pct, 0) / txAvg.length, 1)}` : ""}.`,
        `How: <code>upside_pct</code> on the latest date = consensus <code>target_price</code> ÷ <code>close</code> − 1.
         Chart: the 6 largest and 6 smallest values.`));
      after.push(() => bar("f3", sel.map(s => s.id), sel.map(s => s.pct), { label: "Upside to target", horizontal: true }));
    }

    // 4. biggest-move day
    const vol = dates.slice(1).map(d => {
      const ms = compare(rows, d).all.map(m => Math.abs(m.move_pct));
      return ms.length ? { d, avg: r4(ms.reduce((s, x) => s + x, 0) / ms.length), n: ms.length } : null;
    }).filter(Boolean);
    if (vol.length) {
      const top = [...vol].sort((a, b) => b.avg - a.avg || cmp(a.d, b.d))[0];
      const calm = vol.filter(v => v.avg === 0).length;
      out.push(finding("f4", `${fmtDate(top.d)} was the biggest-move day: the average item moved ${fmtNum(top.avg)}%`,
        `Across ${vol.length} run${vol.length === 1 ? "" : "s"} with a previous run to compare against, the average absolute move
         ranged up to ${fmtNum(top.avg)}% (${top.n} items compared that day). ${calm} run${calm === 1 ? " was" : "s were"} flat
         (weekends and holidays, when no closing price changes).`,
        `How: for each run date, the move rule (close ÷ close in the previous run − 1) for every item present in both runs;
         the bar is the mean of the absolute moves.`));
      after.push(() => bar("f4", vol.map(v => fmtDate(v.d)), vol.map(v => v.avg),
        { label: "Mean absolute move", colors: vol.map(() => TT.css("--c1")) }));
    } else {
      out.push(`<section class="card finding"><h2>The biggest-move day appears after the second run</h2>
        <p class="empty">Needs two runs to compare. The pipeline runs once a day.</p></section>`);
    }

    // 5. flags over time
    const fl = dates.map(d => {
      const day = rowsOn(rows, d);
      return { d, rise: day.filter(r => TT.flagsOf(r).includes("Expected to rise")).length,
               fall: day.filter(r => TT.flagsOf(r).includes("Expected to fall")).length,
               below: day.filter(r => TT.flagsOf(r).includes("Below expectations")).length,
               withEst: day.filter(r => r.eps_revisions_up !== null || r.eps_revisions_down !== null).length };
    });
    if (fl.length) {
      const L = fl[fl.length - 1], F = fl[0];
      out.push(finding("f5", `${L.below} of ${L.withEst} stocks with estimates are seeing more EPS cuts than raises`,
        `Latest run: ${L.rise} stocks flagged Expected to rise, ${L.fall} Expected to fall, ${L.below} Below expectations
         (${L.withEst ? fmtNum((L.below / L.withEst) * 100, 0) : 0}% of stocks with estimate data).
         ${fl.length > 1 ? `On the first run the counts were ${F.rise}, ${F.fall} and ${F.below}.` : ""}`,
        `How: per run date, the number of rows whose <code>signals</code> contain each flag; "with estimates" counts rows with a
         non-empty <code>eps_revisions_up</code> or <code>eps_revisions_down</code>.`));
      const pal = TT.palette();
      after.push(() => draw("f5", { type: "bar", data: { labels: fl.map(f => fmtDate(f.d)), datasets: [
        { label: "Expected to rise", data: fl.map(f => f.rise), backgroundColor: TT.css("--up") },
        { label: "Expected to fall", data: fl.map(f => f.fall), backgroundColor: TT.css("--down") },
        { label: "Below expectations", data: fl.map(f => f.below), backgroundColor: pal[3] }] } }));
    }

    document.getElementById("findings").innerHTML = out.join("");
    after.forEach(f => f());
  }

  renderPicker();
  renderExplorer();
  renderFindings();
  document.addEventListener("tt-theme", () => { renderExplorer(); renderFindings(); });
})();
