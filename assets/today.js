/* Today page: last run, source status, counts, latest values with change since
   the previous run, and the biggest moves (move rule in app.js). */

(async () => {
  const { esc, fmtNum, fmtPct, fmtTime, fmtDate, fmtShort, delta, chips, compare, rowsOn, cmp, heat, maxAbs, divColor } = TT;
  let status, rows;
  try { [status, rows] = await Promise.all([TT.loadStatus(), TT.loadHistory()]); }
  catch (e) { TT.showError(e); return; }

  const dates = TT.runDates(rows);
  const latestDate = dates[dates.length - 1] || "";
  const c = compare(rows, latestDate);
  const latest = rowsOn(rows, latestDate);
  const byId = new Map(latest.map(r => [r.item_id, r]));
  const moveOf = new Map(c.all.map(m => [m.item_id, m]));
  const tick = id => `<span class="ticker">${esc(id)}</span>`;

  function render() {
    document.getElementById("eyebrow").textContent = `Daily market report · ${fmtDate(latestDate)}`;
    document.getElementById("run-line").innerHTML =
      `Last run <strong>${esc(fmtTime(status.run_time))}</strong>` +
      (c.prevDate ? `, compared with the run of ${esc(fmtDate(c.prevDate))}.` : ". This is the first run, so there is nothing to compare yet.");

    /* ---- markets ---- */
    const MARKETS = [["^GSPC", "S&P 500", ""], ["^IXIC", "Nasdaq Composite", ""], ["^NYA", "NYSE Composite", ""],
                     ["TXS", "TXSE", "via TXS ETF"]];
    document.getElementById("markets").innerHTML = MARKETS.map(([id, name, tag]) => {
      const r = byId.get(id), m = moveOf.get(id);
      if (!r) return `<div class="market"><div class="name">${esc(name)}</div><div class="level">—</div></div>`;
      return `<div class="market">
        <div class="name"><span>${esc(name)}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ""}</div>
        <div class="level">${fmtNum(r.close)}</div>
        <div class="delta">${m ? delta(m.move_pct) : delta(r.change_pct)} <span class="sub">${m ? "since previous run" : "on the day"}</span></div>
        <div class="meta">Day ${fmtPct(r.change_pct)} · as of ${esc(fmtShort(r.price_date))} · ${dates.length} run${dates.length === 1 ? "" : "s"}</div>
        ${TT.spark(TT.series(rows, id))}
      </div>`;
    }).join("");

    /* ---- counts from status.json ---- */
    const okCount = status.sources.filter(s => s.ok).length;
    const stat = (label, value, note = "") =>
      `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div><div class="note">${note}</div></div>`;
    document.getElementById("stats").innerHTML = [
      stat("Items tracked", status.items, "in the latest run"),
      stat("Sources healthy", `${okCount} / ${status.sources.length}`, okCount === status.sources.length ? "all responded" : "see Sources"),
      stat("Days with data", status.days_with_success, `since ${fmtShort(status.first_run_date)}`),
      stat("Appeared", status.new_today.length, "since previous run"),
      stat("Disappeared", status.gone_today.length, "since previous run"),
    ].join("");

    /* ---- biggest moves: diverging bars centred on zero ---- */
    document.getElementById("moves-sub").textContent = c.prevDate
      ? `${fmtDate(c.prevDate)} → ${fmtDate(c.date)} · top ${c.moves.length} by absolute % change in close` : "";
    document.getElementById("moves-legend").innerHTML = TT.scaleLegend("Fell", "Rose");
    const mMax = maxAbs(c.moves.map(m => m.move_pct));
    document.getElementById("moves").innerHTML = c.moves.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Item</th><th>Exchange</th><th class="num">Old close</th><th class="num">New close</th>
        <th style="width:38%">Move</th><th class="num">%</th></tr></thead>
      <tbody>${c.moves.map(m => {
        const w = (Math.abs(m.move_pct) / mMax) * 50;
        const bar = `<div style="position:relative;height:14px;background:linear-gradient(90deg,transparent calc(50% - .5px),var(--axis) calc(50% - .5px),var(--axis) calc(50% + .5px),transparent calc(50% + .5px))">
          <div title="${fmtPct(m.move_pct)}" style="position:absolute;top:2px;height:10px;border-radius:${m.move_pct > 0 ? "0 4px 4px 0" : "4px 0 0 4px"};
            ${m.move_pct > 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`};background:${divColor(m.move_pct, mMax)}"></div></div>`;
        return `<tr><td><span class="item-name">${esc(m.item)}</span>${tick(m.item_id)}</td><td>${esc(m.exchange)}</td>
          <td class="num">${fmtNum(m.old)}</td><td class="num">${fmtNum(m.new)}</td><td>${bar}</td>
          <td class="num">${delta(m.move_pct)}</td></tr>`;
      }).join("")}</tbody></table></div>`
      : `<p class="empty">${c.prevDate ? "No closing prices changed since the previous run (the market was closed)." : "Moves appear after the second run."}</p>`;

    /* ---- signals ---- */
    const flagCol = (flag, sortKey, desc, show, meter) => {
      const list = latest.filter(r => TT.flagsOf(r).includes(flag))
        .sort((a, b) => (desc ? -1 : 1) * ((a[sortKey] ?? -Infinity) - (b[sortKey] ?? -Infinity)) || cmp(a.item_id, b.item_id));
      const top = maxAbs(list.map(r => meter ? meter(r) : null));
      return `<div class="flag-col"><h3><span>${esc(flag)}</span><span class="n">${list.length}</span></h3>
        <ul>${list.map(r => {
          const mv = meter ? meter(r) : null;
          return `<li><div><span class="item-name">${esc(r.item)}</span>${tick(r.item_id)}${r.exchange === "TXSE" ? ' <span class="chip txse">TXSE</span>' : ""}
            ${mv !== null && top ? `<div class="meter"><i style="width:${(Math.abs(mv) / top) * 100}%;background:${divColor(mv, top)}"></i></div>` : ""}</div>
            <span class="val">${show(r)}</span></li>`;
        }).join("") || '<li class="empty">None this run.</li>'}</ul></div>`;
    };
    document.getElementById("flags").innerHTML = [
      flagCol("Earnings this week", "market_cap_b", true,
        r => `<span class="sub">${esc(fmtShort(r.earnings_date))}</span>${r.eps_forecast !== null ? ` · EPS ${fmtNum(r.eps_forecast)}` : ""}`),
      flagCol("Expected to rise", "upside_pct", true, r => delta(r.upside_pct, 1), r => r.upside_pct),
      flagCol("Expected to fall", "upside_pct", false,
        r => r.upside_pct !== null ? delta(r.upside_pct, 1) : `short ${delta(r.short_change_pct, 0)}`,
        r => r.upside_pct ?? r.short_change_pct),
      flagCol("Below expectations", "eps_revisions_down", true,
        r => `<span class="up">${r.eps_revisions_up ?? 0}↑</span> <span class="down">${r.eps_revisions_down ?? 0}↓</span>`,
        r => (r.eps_revisions_up ?? 0) - (r.eps_revisions_down ?? 0)),
    ].join("");

    /* ---- sources ---- */
    document.getElementById("sources").innerHTML = `
      <thead><tr><th>Source</th><th>Format</th><th>Status</th><th class="num">Records</th></tr></thead>
      <tbody>${status.sources.map(s => `<tr title="${esc(s.error)}"><td>${esc(s.name)}</td><td>${esc(s.format)}</td>
        <td><span class="status ${s.ok ? "ok" : "fail"}">${s.ok ? "✓ OK" : "✕ Failed"}</span></td>
        <td class="num">${s.count.toLocaleString()}</td></tr>`).join("")}</tbody>`;

    /* ---- appeared / gone ---- */
    const names = new Map(rows.map(r => [r.item_id, r.item]));
    const list = (title, ids) => `<h3>${title} <span class="sub">(${ids.length})</span></h3>` + (ids.length
      ? `<p>${ids.map(i => `<span class="item-name">${esc(names.get(i) || i)}</span>${tick(i)}`).join(" · ")}</p>`
      : `<p class="empty">None.</p>`);
    document.getElementById("changes").innerHTML =
      list("Appeared", status.new_today) + list("Disappeared", status.gone_today) +
      `<p class="sub">Earnings-week names rotate as the week changes; new TXSE listings appear automatically.</p>`;

    /* ---- latest values, grouped, with shaded change cells ---- */
    document.getElementById("latest-legend").innerHTML = TT.scaleLegend();
    const sorted = [...latest].sort((a, b) =>
      TT.GROUP_ORDER.indexOf(a.group) - TT.GROUP_ORDER.indexOf(b.group) || cmp(a.item_id, b.item_id));
    const mvMax = maxAbs(c.all.map(m => m.move_pct)), dMax = maxAbs(latest.map(r => r.change_pct)),
          uMax = maxAbs(latest.map(r => r.upside_pct));
    let group = "";
    document.getElementById("latest").innerHTML = `
      <thead><tr><th>Item</th><th>Exchange</th><th class="num">Close</th><th class="num">Since prev. run</th>
        <th class="num">Day change</th><th class="num">Upside to target</th><th>Signals</th></tr></thead>
      <tbody>${sorted.map(r => {
        const m = moveOf.get(r.item_id), prev = c.prevById.get(r.item_id);
        const head = r.group !== group ? `<tr class="group-row"><td colspan="7">${esc((group = r.group))}</td></tr>` : "";
        return head + `<tr><td><span class="item-name">${esc(r.item)}</span>${tick(r.item_id)}</td><td>${esc(r.exchange)}</td>
          <td class="num">${fmtNum(r.close)}</td>
          <td class="num heat" style="${m ? heat(m.move_pct, mvMax) : ""}" title="${prev ? `previous close ${fmtNum(prev.close)}` : "new item"}">${m ? fmtPct(m.move_pct) : prev ? "—" : "new"}</td>
          <td class="num heat" style="${heat(r.change_pct, dMax)}">${fmtPct(r.change_pct)}</td>
          <td class="num heat" style="${heat(r.upside_pct, uMax)}">${fmtPct(r.upside_pct, 1)}</td><td>${chips(r)}</td></tr>`;
      }).join("")}</tbody>`;
  }
  render();
  document.addEventListener("tt-theme", render);
})();
