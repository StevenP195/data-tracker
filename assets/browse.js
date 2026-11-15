/* Browse page: latest values for every item, with filters (exchange, group,
   flag), name search, sort by every numeric column (up and down), and a
   starred shortlist saved in localStorage. */

(async () => {
  const { esc, fmtCol, dir, chips, cmp, NUMERIC, LABELS, store } = TT;
  let rows;
  try { rows = await TT.loadHistory(); } catch (e) { TT.showError(e); return; }

  const dates = TT.runDates(rows);
  const latestDate = dates[dates.length - 1] || "";
  const latest = TT.rowsOn(rows, latestDate);
  document.getElementById("as-of").textContent =
    `Latest values for all ${latest.length} items, from the run of ${TT.fmtDate(latestDate)}.`;

  const SHOWN = ["close", "change_pct", "upside_pct", "target_price", "analysts_buy", "analysts_hold", "analysts_sell",
    "eps_forecast", "eps_revisions_up", "eps_revisions_down", "last_surprise_pct", "pct_off_high", "volume",
    "market_cap_b", "short_change_pct", "days_to_cover", "high_52w", "low_52w", "short_interest"];
  const KEY = "tt-browse";
  const saved = store.get(KEY, {});
  const state = Object.assign({ q: "", exchange: "", group: "", flag: "", sort: "change_pct", dir: "desc", onlyStars: false }, saved);
  let stars = new Set(store.get("tt-stars", []));

  const $ = id => document.getElementById(id);
  const options = (el, label, values) => {
    el.innerHTML = `<option value="">${label}</option>` + values.map(v => `<option>${esc(v)}</option>`).join("");
  };
  options($("f-exchange"), "All exchanges", [...new Set(latest.map(r => r.exchange).filter(Boolean))].sort());
  options($("f-group"), "All groups", ["Index", "TXSE", "Watchlist", "Earnings this week"].filter(g => latest.some(r => r.group === g)));
  options($("f-flag"), "Any flag", TT.FLAGS);
  $("sort-col").innerHTML = NUMERIC.map(k => `<option value="${k}">${esc(LABELS[k])}</option>`).join("");

  function syncControls() {
    $("q").value = state.q; $("f-exchange").value = state.exchange; $("f-group").value = state.group;
    $("f-flag").value = state.flag; $("sort-col").value = state.sort; $("sort-dir").value = state.dir;
    $("only-stars").setAttribute("aria-pressed", state.onlyStars);
  }

  function render() {
    store.set(KEY, state);
    const q = state.q.trim().toLowerCase();
    const list = latest.filter(r =>
      (!q || r.item.toLowerCase().includes(q) || r.item_id.toLowerCase().includes(q)) &&
      (!state.exchange || r.exchange === state.exchange) &&
      (!state.group || r.group === state.group) &&
      (!state.flag || TT.flagsOf(r).includes(state.flag)) &&
      (!state.onlyStars || stars.has(r.item_id)));
    const k = state.sort, sign = state.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const x = a[k], y = b[k];
      if (x === null && y === null) return cmp(a.item_id, b.item_id);
      if (x === null) return 1;       // empty values always last
      if (y === null) return -1;
      return sign * (x - y) || cmp(a.item_id, b.item_id);
    });
    $("count").textContent = `${list.length} of ${latest.length} items · ${stars.size} starred`;

    const th = c => `<th class="num sortable ${c === k ? "sorted" : ""}" data-col="${c}">${esc(LABELS[c])}<span class="arrow">${c === k ? (state.dir === "asc" ? "▲" : "▼") : "↕"}</span></th>`;
    $("table").innerHTML = `<thead><tr><th>★</th><th>Item</th><th>Exchange</th><th>Group</th><th>Flags</th>${SHOWN.map(th).join("")}<th>Earnings</th><th>EPS qtr</th><th>Price date</th></tr></thead>
      <tbody>${list.map(r => `<tr>
        <td><button class="star" data-id="${esc(r.item_id)}" aria-pressed="${stars.has(r.item_id)}" title="Add to shortlist">${stars.has(r.item_id) ? "★" : "☆"}</button></td>
        <td>${esc(r.item)} <span class="ticker">${esc(r.item_id)}</span></td><td>${esc(r.exchange)}</td><td>${esc(r.group)}</td><td>${chips(r)}</td>
        ${SHOWN.map(c => `<td class="num ${/_pct$/.test(c) ? dir(r[c]) : ""}">${fmtCol(c, r[c])}</td>`).join("")}
        <td>${r.earnings_date ? esc(TT.fmtDate(r.earnings_date)) + (r.earnings_time ? ` <span class="sub">${esc(r.earnings_time)}</span>` : "") : "—"}</td>
        <td>${esc(r.eps_qtr) || "—"}</td><td>${esc(TT.fmtDate(r.price_date))}</td></tr>`).join("")
        || `<tr><td colspan="30" class="empty">No items match these filters.</td></tr>`}</tbody>`;
  }

  $("q").addEventListener("input", e => { state.q = e.target.value; render(); });
  for (const [id, key] of [["f-exchange", "exchange"], ["f-group", "group"], ["f-flag", "flag"], ["sort-col", "sort"], ["sort-dir", "dir"]]) {
    $(id).addEventListener("change", e => { state[key] = e.target.value; render(); });
  }
  $("only-stars").addEventListener("click", () => { state.onlyStars = !state.onlyStars; syncControls(); render(); });
  $("reset").addEventListener("click", () => {
    Object.assign(state, { q: "", exchange: "", group: "", flag: "", sort: "change_pct", dir: "desc", onlyStars: false });
    syncControls(); render();
  });
  $("table").addEventListener("click", e => {
    const star = e.target.closest(".star");
    if (star) {
      const id = star.dataset.id;
      stars.has(id) ? stars.delete(id) : stars.add(id);
      store.set("tt-stars", [...stars]);
      render();
      return;
    }
    const head = e.target.closest("th.sortable");
    if (head) {
      const col = head.dataset.col;
      state.dir = state.sort === col && state.dir === "desc" ? "asc" : "desc";
      state.sort = col;
      syncControls(); render();
    }
  });
  syncControls();
  render();
})();
