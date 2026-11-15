/* Today page: last run, source status, counts, latest values with change since
   the previous run, and the biggest moves (move rule in app.js). */

(async () => {
  const { esc, fmtNum, fmtPct, fmtTime, fmtDate, dir, chips, compare, rowsOn, cmp } = TT;
  let status, rows;
  try { [status, rows] = await Promise.all([TT.loadStatus(), TT.loadHistory()]); }
  catch (e) { TT.showError(e); return; }

  const dates = TT.runDates(rows);
  const latestDate = dates[dates.length - 1] || "";
  const c = compare(rows, latestDate);
  const latest = rowsOn(rows, latestDate);
  const byId = new Map(latest.map(r => [r.item_id, r]));
  const moveOf = id => c.all.find(m => m.item_id === id);

  document.getElementById("run-line").innerHTML =
    `Last run <strong>${esc(fmtTime(status.run_time))}</strong>` +
    (c.prevDate ? ` · compared with the run of ${esc(fmtDate(c.prevDate))}` : " · first run, nothing to compare yet");

  /* ---- markets ---- */
  const MARKETS = [["^GSPC", "S&P 500"], ["^IXIC", "Nasdaq Composite"], ["^NYA", "NYSE Composite"],
                   ["TXS", "Texas Stock Exchange (TXS ETF)"]];
  document.getElementById("markets").innerHTML = MARKETS.map(([id, name]) => {
    const r = byId.get(id), m = moveOf(id);
    if (!r) return `<div class="market"><div class="name">${esc(name)}</div><div class="level">—</div></div>`;
    return `<div class="market ${id === "TXS" ? "txse" : ""}">
      <div class="name">${esc(name)}</div>
      <div class="level">${fmtNum(r.close)}</div>
      <div class="${dir(r.change_pct)}">${fmtPct(r.change_pct)} on the day</div>
      <div class="sub">${m ? `${fmtPct(m.move_pct)} since previous run` : "—"} · as of ${esc(fmtDate(r.price_date))}</div>
    </div>`;
  }).join("");

  /* ---- counts from status.json ---- */
  const okCount = status.sources.filter(s => s.ok).length;
  const stat = (label, value, note = "") =>
    `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div><div class="note">${note}</div></div>`;
  document.getElementById("stats").innerHTML = [
    stat("Items tracked", status.items, "in the latest run"),
    stat("Sources ok", `${okCount}/${status.sources.length}`),
    stat("Days with data", status.days_with_success, `since ${fmtDate(status.first_run_date)}`),
    stat("New today", status.new_today.length, "items that appeared"),
    stat("Gone today", status.gone_today.length, "items that disappeared"),
  ].join("");

  /* ---- flags ---- */
  const flagCol = (flag, sortKey, desc, show) => {
    const list = latest.filter(r => TT.flagsOf(r).includes(flag))
      .sort((a, b) => (desc ? -1 : 1) * ((a[sortKey] ?? -Infinity) - (b[sortKey] ?? -Infinity)) || cmp(a.item_id, b.item_id));
    return `<div class="flag-col"><h3><span class="chip ${TT.FLAG_CLASS[flag]}">${esc(flag)}</span> ${list.length}</h3>
      <ul>${list.map(r => `<li><span>${esc(r.item)} <span class="ticker">${esc(r.item_id)}</span>${r.exchange === "TXSE" ? ' <span class="chip txse">TXSE</span>' : ""}</span>
      <span>${show(r)}</span></li>`).join("") || '<li class="empty">None this run.</li>'}</ul></div>`;
  };
  document.getElementById("flags").innerHTML = [
    flagCol("Earnings this week", "market_cap_b", true,
      r => `${esc(fmtDate(r.earnings_date).replace(/, \d{4}$/, ""))}${r.eps_forecast !== null ? ` · EPS ${fmtNum(r.eps_forecast)}` : ""}`),
    flagCol("Expected to rise", "upside_pct", true, r => `<span class="up">${fmtPct(r.upside_pct, 1)}</span> to target`),
    flagCol("Expected to fall", "upside_pct", false, r => r.upside_pct !== null
      ? `<span class="${dir(r.upside_pct)}">${fmtPct(r.upside_pct, 1)}</span> to target`
      : `short ${fmtPct(r.short_change_pct, 0)}`),
    flagCol("Below expectations", "eps_revisions_down", true,
      r => `${r.eps_revisions_up ?? 0}↑ / <span class="down">${r.eps_revisions_down ?? 0}↓</span> revisions`),
  ].join("");

  /* ---- biggest moves ---- */
  document.getElementById("moves-sub").textContent =
    c.prevDate ? `(${fmtDate(c.prevDate)} → ${fmtDate(c.date)}, top ${c.moves.length} by absolute % change in close)` : "";
  document.getElementById("moves").innerHTML = c.moves.length ? `
    <thead><tr><th>Item</th><th>Exchange</th><th class="num">Old close</th><th class="num">New close</th><th class="num">Move</th></tr></thead>
    <tbody>${c.moves.map(m => `<tr><td>${esc(m.item)} <span class="ticker">${esc(m.item_id)}</span></td><td>${esc(m.exchange)}</td>
      <td class="num">${fmtNum(m.old)}</td><td class="num">${fmtNum(m.new)}</td>
      <td class="num ${dir(m.move_pct)}">${fmtPct(m.move_pct)}</td></tr>`).join("")}</tbody>`
    : `<tbody><tr><td class="empty">${c.prevDate ? "No closing prices changed since the previous run (market closed)." : "Moves appear after the second run."}</td></tr></tbody>`;

  /* ---- sources ---- */
  document.getElementById("sources").innerHTML = `
    <thead><tr><th>Source</th><th>Format</th><th>Status</th><th class="num">Records</th></tr></thead>
    <tbody>${status.sources.map(s => `<tr title="${esc(s.error)}"><td>${esc(s.name)}</td><td>${esc(s.format)}</td>
      <td class="${s.ok ? "ok" : "fail"}">${s.ok ? "OK" : "Failed"}</td><td class="num">${s.count.toLocaleString()}</td></tr>`).join("")}</tbody>`;

  /* ---- appeared / gone ---- */
  const names = new Map(rows.map(r => [r.item_id, r.item]));
  const list = (title, ids) => `<h3>${title} (${ids.length})</h3>` + (ids.length
    ? `<p>${ids.map(i => `${esc(names.get(i) || i)} <span class="ticker">${esc(i)}</span>`).join(" · ")}</p>`
    : `<p class="empty">None.</p>`);
  document.getElementById("changes").innerHTML =
    list("Appeared", status.new_today) + list("Disappeared", status.gone_today) +
    `<p class="sub">Earnings-week names rotate in and out as the week changes.</p>`;

  /* ---- latest values ---- */
  const ORDER = ["Index", "TXSE", "Watchlist", "Earnings this week"];
  const sorted = [...latest].sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || cmp(a.item_id, b.item_id));
  document.getElementById("latest").innerHTML = `
    <thead><tr><th>Item</th><th>Group</th><th>Exchange</th><th class="num">Close</th><th class="num">Since prev. run</th>
      <th class="num">Day change</th><th class="num">Upside to target</th><th>Flags</th></tr></thead>
    <tbody>${sorted.map(r => {
      const m = moveOf(r.item_id), prev = c.prevById.get(r.item_id);
      return `<tr><td>${esc(r.item)} <span class="ticker">${esc(r.item_id)}</span></td><td>${esc(r.group)}</td><td>${esc(r.exchange)}</td>
        <td class="num">${fmtNum(r.close)}</td>
        <td class="num ${m ? dir(m.move_pct) : "flat"}" title="${prev ? `previous close ${fmtNum(prev.close)}` : "new item"}">${m ? fmtPct(m.move_pct) : prev ? "—" : "new"}</td>
        <td class="num ${dir(r.change_pct)}">${fmtPct(r.change_pct)}</td>
        <td class="num ${dir(r.upside_pct)}">${fmtPct(r.upside_pct, 1)}</td><td>${chips(r)}</td></tr>`;
    }).join("")}</tbody>`;
})();
