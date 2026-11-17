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
    document.getElementById("eyebrow").textContent = `Space City desk · Houston, TX · ${fmtDate(latestDate)}`;
    document.getElementById("run-line").innerHTML =
      `Last run <strong>${esc(fmtTime(status.run_time))}</strong>` +
      (c.prevDate ? `, compared with the run of ${esc(fmtDate(c.prevDate))}.` : ". This is the first run, so there is nothing to compare yet.");
    renderHero();
    renderDesk();

    /* ---- markets ---- */
    const MARKETS = [["^GSPC", "S&P 500", ""], ["^IXIC", "Nasdaq Composite", ""], ["^NYA", "NYSE Composite", ""],
                     ["TXS", "TXSE", "via TXS ETF"]];
    document.getElementById("markets").innerHTML = MARKETS.map(([id, name, tag]) => {
      const r = byId.get(id), m = moveOf.get(id);
      if (!r) return `<div class="market"><div class="name">${esc(name)}</div><div class="level">—</div></div>`;
      return `<div class="market">
        <div class="name"><span>${esc(name)}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ""}</div>
        <div class="level">${TT.countNum(r.close, { from: c.prevById.get(id)?.close ?? null })}</div>
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
      stat("Items tracked", TT.countNum(status.items, { fmt: "int", d: 0 }), "in the latest run"),
      stat("Sources healthy", `${okCount} / ${status.sources.length}`, okCount === status.sources.length ? "all responded" : "see Sources"),
      stat("Days with data", TT.countNum(status.days_with_success, { fmt: "int", d: 0 }), `since ${fmtShort(status.first_run_date)}`),
      stat("Appeared", TT.countNum(status.new_today.length, { fmt: "int", d: 0 }), "since previous run"),
      stat("Disappeared", TT.countNum(status.gone_today.length, { fmt: "int", d: 0 }), "since previous run"),
    ].join("");

    /* ---- biggest moves: diverging bars centred on zero ---- */
    document.getElementById("moves-sub").textContent = c.prevDate
      ? `${fmtDate(c.prevDate)} → ${fmtDate(c.date)} · top ${c.moves.length} by absolute % change in close` : "";
    document.getElementById("moves-legend").innerHTML = TT.scaleLegend("Fell", "Rose");
    const mMax = maxAbs(c.moves.map(m => m.move_pct));
    document.getElementById("moves").innerHTML = c.moves.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Item</th><th>Exchange</th><th class="num">Old close</th><th class="num">New close</th>
        <th style="width:38%">Move</th><th class="num">%</th></tr></thead>
      <tbody>${c.moves.map((m, i) => {
        const w = (Math.abs(m.move_pct) / mMax) * 50;
        const bar = `<div style="position:relative;height:14px;background:linear-gradient(90deg,transparent calc(50% - .5px),var(--axis) calc(50% - .5px),var(--axis) calc(50% + .5px),transparent calc(50% + .5px))">
          <div class="mbar ${m.move_pct > 0 ? "pos" : "neg"}" title="${fmtPct(m.move_pct)}" style="position:absolute;top:2px;height:10px;border-radius:${m.move_pct > 0 ? "0 4px 4px 0" : "4px 0 0 4px"};
            ${m.move_pct > 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`};background:${divColor(m.move_pct, mMax)}"></div></div>`;
        return `<tr class="moves-row" style="--i:${i}"><td><span class="item-name">${esc(m.item)}</span>${tick(m.item_id)}</td><td>${esc(m.exchange)}</td>
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
        <ul>${list.map((r, i) => {
          const mv = meter ? meter(r) : null;
          return `<li style="--i:${Math.min(i, 12)}"><div><span class="item-name">${esc(r.item)}</span>${tick(r.item_id)}${r.exchange === "TXSE" ? ' <span class="chip txse">TXSE</span>' : ""}
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
  /* ---- hero: the four markets as one composite trendline over the night skyline ---- */
  function renderHero() {
    const ids = ["^GSPC", "^IXIC", "^NYA", "TXS"];
    const rebased = ids.map(id => { const s = TT.series(rows, id); const b = s.find(v => v); return s.map(v => (v && b ? v / b * 100 : null)); });
    const composite = dates.map((_, i) => {
      const v = rebased.map(s => s[i]).filter(x => x !== null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    });
    const pts = composite.filter(v => v !== null);
    const up = pts.length < 2 || pts[pts.length - 1] >= pts[0];
    const hero = document.getElementById("hero");
    hero.querySelector(".hero-art")?.remove();
    hero.insertAdjacentHTML("afterbegin", SPACE.hero(composite, { up }));
    const NAMES = { "^GSPC": "S&P", "^IXIC": "NASDAQ", "^NYA": "NYSE", "TXS": "TXSE" };
    document.getElementById("hero-quotes").innerHTML = ids.map(id => {
      const m = moveOf.get(id), r = byId.get(id);
      const v = m ? m.move_pct : r ? r.change_pct : null;
      return `<span class="q"><b>${NAMES[id]}</b>${delta(v)}</span>`;
    }).join("");
  }

  /* ---- Houston desk: three industry baskets and the market pulse gauge ---- */
  function renderDesk() {
    // move since the previous run; an item new this run (no previous close) uses its day change instead
    const moveVal = r => { const m = moveOf.get(r.item_id); return m ? m.move_pct : r.change_pct; };
    const since = c.prevDate ? "since previous run" : "on the day";
    const DESKS = [
      ["Space City", "space", "Houston's space economy"],
      ["Texas Energy", "energy", "Houston majors, services and Texas midstream"],
      ["Texas Banks", "banks", "TXSE-listed Texas banks, including Frost"],
    ];
    const cards = DESKS.map(([desk, cls, blurb], d) => {
      const members = latest.filter(r => r.houston === desk).map(r => ({ id: r.item_id, v: moveVal(r) })).filter(x => x.v !== null)
        .sort((a, b) => b.v - a.v || cmp(a.id, b.id));
      const avg = members.length ? members.reduce((s, x) => s + x.v, 0) / members.length : null;
      const shown = members.length > 6 ? [...members.slice(0, 3), ...members.slice(-3)] : members;
      const top = maxAbs(members.map(x => x.v));
      const rowsHtml = shown.map((x, i) => {
        const w = top ? Math.abs(x.v) / top * 50 : 0;
        return `<li style="--i:${i}"><span class="t">${esc(x.id)}</span><span class="zbar"><i class="${x.v >= 0 ? "pos" : "neg"}"
          style="${x.v >= 0 ? `left:50%` : `right:50%`};width:${w}%;background:${divColor(x.v, top)}"></i></span><span class="v">${delta(x.v)}</span></li>`;
      }).join("");
      return `<a class="desk-card ${cls}" style="--d:${d}" href="browse.html?desk=${encodeURIComponent(desk)}" title="Open ${esc(desk)} in Browse">
        <div class="top"><span class="icon">${SPACE.ICONS[desk]}</span><div><h3>${esc(desk)}</h3><div class="sub">${esc(blurb)}</div></div></div>
        <div class="big">${avg === null ? "—" : delta(avg)}</div><div class="sub">average of ${members.length} ${members.some(x => !moveOf.has(x.id)) && c.prevDate ? "(new items: day change)" : since}</div>
        <ul>${rowsHtml}</ul>
        <span class="more">${members.length > shown.length ? `Best 3 and worst 3 of ${members.length} · ` : ""}View in Browse →</span></a>`;
    });

    // market pulse: share of tracked items that rose (breadth), as a gauge
    const all = latest.map(moveVal).filter(v => v !== null);
    const ups = all.filter(v => v > 0).length, downs = all.filter(v => v < 0).length;
    const breadth = ups + downs ? ups / (ups + downs) : .5;
    const mean = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
    const mood = breadth >= .6 ? "Bullish" : breadth <= .4 ? "Bearish" : "Neutral";
    const seg = [];
    for (let i = 0; i < 24; i++) {
      const a0 = Math.PI * (1 - i / 24), a1 = Math.PI * (1 - (i + 1) / 24) + .01, R = 80, r = 62;
      const p = (a, rad) => `${(100 + rad * Math.cos(a)).toFixed(2)},${(100 - rad * Math.sin(a)).toFixed(2)}`;
      seg.push(`<path d="M${p(a0, R)}A${R},${R} 0 0 1 ${p(a1, R)}L${p(a1, r)}A${r},${r} 0 0 0 ${p(a0, r)}Z" fill="${divColor((i + .5) / 12 - 1, 1)}"/>`);
    }
    const angle = -90 + 180 * breadth;
    cards.push(`<div class="desk-card pulse" style="--d:3">
      <div class="top"><span class="icon">${SPACE.ICONS["Market Pulse"]}</span><div><h3>Market pulse</h3><div class="sub">Breadth of all ${all.length} items ${since}</div></div></div>
      <svg class="gauge" viewBox="0 0 200 116" role="img" aria-label="${Math.round(breadth * 100)} percent of items rose: ${mood}">
        ${seg.join("")}
        <text x="16" y="114">Bearish</text><text x="184" y="114" text-anchor="end">Bullish</text>
        <g class="needle" data-angle="${angle.toFixed(1)}" style="transform:rotate(${angle.toFixed(1)}deg)">
          <path d="M98,100 L100,30 L102,100 Z" fill="var(--ink)"/></g>
        <circle cx="100" cy="100" r="6" fill="var(--ink)"/><circle cx="100" cy="100" r="2.5" fill="var(--surface)"/>
      </svg>
      <div class="pulse-read"><b>${mood}</b>${TT.countNum(breadth * 100, { d: 0, suffix: "% advancing" })} ·
        <span class="up">${ups}▲</span> <span class="down">${downs}▼</span> · mean ${delta(mean)}</div>
    </div>`);
    document.getElementById("desk").innerHTML = cards.join("");
    document.getElementById("desk-legend").innerHTML = TT.scaleLegend();
    const needle = document.querySelector(".gauge .needle");
    TT.onReveal(needle.closest(".desk-card"), instant => {
      if (instant) return;
      needle.style.transition = "none"; needle.style.transform = "rotate(-90deg)";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        needle.style.transition = ""; needle.style.transform = `rotate(${needle.dataset.angle}deg)`;
      }));
    });
  }

  render();
  TT.animate();
  TT.animate(document.getElementById("desk"));
  document.addEventListener("tt-theme", render);
})();
