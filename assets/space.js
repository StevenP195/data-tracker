/* Space City artwork: an original Houston-style skyline, a star field, a rocket and
   the Houston desk icons, all drawn as inline SVG (no images, no logos).
   Used by the Today hero, the Houston desk cards and the footer on every page. */

const SPACE = (() => {
  /* deterministic pseudo-random numbers, so the sky looks the same on every load */
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  /* buildings across a 1000-unit-wide strip: [x, width, height, roof] */
  const TOWERS = [
    [10, 46, 92, "flat"], [60, 58, 150, "slant"], [122, 38, 112, "flat"], [164, 52, 205, "spire"],
    [220, 62, 172, "gable"], [286, 44, 122, "flat"], [334, 72, 236, "crown"], [410, 42, 142, "flat"],
    [456, 30, 98, "flat"], [492, 108, 58, "dome"], [604, 56, 192, "gable"], [664, 40, 132, "flat"],
    [708, 66, 252, "spire"], [778, 46, 162, "slant"], [828, 60, 118, "flat"], [892, 52, 182, "crown"],
    [948, 46, 96, "flat"],
  ];

  function towerPath([x, w, h, roof], base, k) {
    const H = h * k, top = base - H, r = x + w;
    switch (roof) {
      case "slant": return `M${x},${base}V${top + 18 * k}L${r},${top}V${base}Z`;
      case "spire": return `M${x},${base}V${top + 14 * k}L${x + w * .3},${top + 14 * k}L${x + w / 2},${top - 30 * k}L${x + w * .7},${top + 14 * k}L${r},${top + 14 * k}V${base}Z`;
      case "gable": {   // stepped, gothic-style crown
        const s = 9 * k, q = w / 6;
        return `M${x},${base}V${top + 3 * s}H${x + q}V${top + 2 * s}H${x + 2 * q}V${top + s}H${x + 2.5 * q}L${x + w / 2},${top - s}L${x + 3.5 * q},${top + s}H${x + 4 * q}V${top + 2 * s}H${x + 5 * q}V${top + 3 * s}H${r}V${base}Z`;
      }
      case "crown": return `M${x},${base}V${top + 10 * k}L${x + 6},${top}H${r - 6}L${r},${top + 10 * k}V${base}Z`;
      case "dome": return `M${x},${base}V${top + 22 * k}Q${x + w / 2},${top - 12 * k} ${r},${top + 22 * k}V${base}Z`;
      default: return `M${x},${base}V${top}H${r}V${base}Z`;
    }
  }

  /* the skyline: dark fills with a glowing outline and a scatter of lit windows */
  function skyline({ height = 160, k = .62, windows = true, glow = true, id = "sk" } = {}) {
    const base = height, rand = rng(7);
    const paths = TOWERS.map(t => towerPath(t, base, k));
    let win = "";
    if (windows) {
      for (const [x, w, h, roof] of TOWERS) {
        if (roof === "dome") continue;
        const top = base - h * k + 18 * k;
        for (let yy = top + 6; yy < base - 8; yy += 9) for (let xx = x + 6; xx < x + w - 6; xx += 8) {
          const v = rand();
          if (v < .23) win += `<rect x="${xx.toFixed(1)}" y="${yy.toFixed(1)}" width="3" height="4" rx=".6" fill="${v < .07 ? "var(--sky-gold)" : "var(--sky-window)"}" opacity="${(.35 + v * 2).toFixed(2)}"/>`;
        }
      }
    }
    return `<g class="skyline">
      ${glow ? `<g filter="url(#${id}-glow)">${paths.map(d => `<path d="${d}" fill="none" stroke="var(--sky-line)" stroke-width="2.2"/>`).join("")}</g>` : ""}
      ${paths.map(d => `<path d="${d}" fill="var(--sky-tower)" stroke="var(--sky-line)" stroke-width="1.1" stroke-linejoin="round"/>`).join("")}
      <g class="windows">${win}</g>
      <line x1="0" y1="${base - .5}" x2="1000" y2="${base - .5}" stroke="var(--sky-line)" stroke-width="1.4" opacity=".8"/>
    </g>`;
  }

  function glowFilter(id, blur = 3) {
    return `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${blur}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  }

  /* stars, a couple of constellations, and four-point sparkles */
  function sky({ width = 1000, height = 280, count = 70, seed = 11 } = {}) {
    const rand = rng(seed);
    let out = "";
    const pts = [];
    for (let i = 0; i < count; i++) {
      const x = rand() * width, y = rand() * height * .78, r = .5 + rand() * 1.3;
      pts.push([x, y]);
      out += `<circle class="${i % 3 === 0 ? "twinkle" : ""}" style="animation-delay:${(rand() * 4).toFixed(2)}s" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="var(--sky-star)" opacity="${(.35 + rand() * .6).toFixed(2)}"/>`;
    }
    const cons = [[3, 9, 14, 21, 17], [40, 44, 51, 47]].map(ix => ix.map(i => pts[i % pts.length]));
    out += cons.map(c => `<polyline points="${c.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="var(--sky-line)" stroke-width=".7" opacity=".35"/>`).join("");
    for (let i = 0; i < 5; i++) {
      const x = rand() * width, y = rand() * height * .6, s = 3 + rand() * 4;
      out += `<path class="twinkle" style="animation-delay:${(rand() * 3).toFixed(2)}s" d="M${x},${y - s}L${x + s * .25},${y - s * .25}L${x + s},${y}L${x + s * .25},${y + s * .25}L${x},${y + s}L${x - s * .25},${y + s * .25}L${x - s},${y}L${x - s * .25},${y - s * .25}Z" fill="${i % 2 ? "var(--sky-gold)" : "var(--sky-star)"}" opacity=".8"/>`;
    }
    return out;
  }

  /* five-point star (the lone star) */
  function star(cx, cy, r, fill = "var(--sky-gold)") {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .42 : r;
      p.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
    }
    return `<polygon points="${p.join(" ")}" fill="${fill}" stroke="#fff3" stroke-width=".8"/>`;
  }

  /* a small rocket pointing up the y-axis, centred on its window */
  function rocket() {
    return `<g class="rocket">
      <path class="flame" d="M-4.5,15 Q0,34 4.5,15 Z" fill="#f59a3c"/><path class="flame" d="M-2.4,15 Q0,26 2.4,15 Z" fill="#ffe08a"/>
      <path d="M-7,6 L-13,17 L-6,14 Z M7,6 L13,17 L6,14 Z" fill="#e8742a"/>
      <path d="M0,-20 C9,-11 8.5,7 6,15 H-6 C-8.5,7 -9,-11 0,-20 Z" fill="#f3f6fb" stroke="#0d1b3d" stroke-width="1"/>
      <path d="M-6.6,6 H6.6" stroke="#e8742a" stroke-width="2"/>
      <circle cy="-5" r="3.6" fill="#7fd3f2" stroke="#0d1b3d" stroke-width="1.2"/>
    </g>`;
  }

  /* desk icons (simple line drawings, 48 x 48) */
  const ICONS = {
    "Space City": `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".5"/>
      <ellipse cx="24" cy="24" rx="21" ry="7" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".35" transform="rotate(-24 24 24)"/>
      <g transform="translate(24 25) rotate(35) scale(.95)">${rocket()}</g></svg>`,
    "Texas Energy": `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 42h36"/><path d="M14 42l6-20 6 20"/><path d="M16 35h8"/><path d="M8 18l26-6"/><circle cx="20" cy="15.5" r="2.2"/>
      <path d="M34 12c3 0 5 2 5 5v4"/><path d="M39 21v6"/><rect x="35" y="27" width="8" height="7" rx="1.5"/><path d="M38 30.5l2-2.5v3.5l2-2.5"/></svg>`,
    "Texas Banks": `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
      <path d="M6 18L24 7l18 11z"/><path d="M8 42h32M10 38h28"/><path d="M12 21v15M19 21v15M29 21v15M36 21v15"/>
      <g transform="translate(24 14) scale(.36)" stroke="none">${star(0, 0, 11, "var(--gold)").replace(/stroke="#fff3"/, "")}</g></svg>`,
    "Market Pulse": `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 30a18 18 0 0 1 36 0"/><path d="M24 30l9-10"/><circle cx="24" cy="30" r="2.4" fill="currentColor"/>
      <path d="M4 40h8l3-6 4 10 4-14 3 10h18"/></svg>`,
  };

  /* the Today hero: sky, skyline, the lone star, and a glowing trendline with the rocket at its tip */
  function hero(values, { up = true } = {}) {
    const W = 1000, H = 300;
    const pts = values.filter(v => v !== null);
    const lo = Math.min(...pts), hi = Math.max(...pts);
    const x0 = 470, x1 = 930, yTop = 46, yBot = 150;
    const coords = pts.length > 1
      ? pts.map((v, i) => [x0 + (x1 - x0) * i / (pts.length - 1), hi === lo ? (yTop + yBot) / 2 : yBot - (v - lo) / (hi - lo) * (yBot - yTop)])
      : [[x0, (yTop + yBot) / 2], [x1, (yTop + yBot) / 2]];
    // ticks: small candle-like bars under the line give it a trading-chart texture
    const rand = rng(3);
    let candles = "";
    for (let i = 0; i < 26; i++) {
      const t = i / 25, x = x0 + (x1 - x0) * t;
      const seg = Math.min(coords.length - 2, Math.floor(t * (coords.length - 1)));
      const f = t * (coords.length - 1) - seg;
      const y = coords[seg][1] + (coords[seg + 1][1] - coords[seg][1]) * f;
      const h = 8 + rand() * 18;
      candles += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${(y + 6).toFixed(1)}" y2="${(y + 6 + h).toFixed(1)}" stroke="var(--trend)" stroke-width="3" stroke-linecap="round" opacity="${(.18 + rand() * .25).toFixed(2)}"/>`;
    }
    const d = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
    const [ex, ey] = coords[coords.length - 1], [px, py] = coords[coords.length - 2];
    const ang = Math.atan2(ey - py, ex - px) * 180 / Math.PI + 90;
    return `<svg class="hero-art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>${glowFilter("hero-glow", 3.2)}${glowFilter("sk-glow", 2.4)}
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky-top)"/><stop offset="1" stop-color="var(--sky-bottom)"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#hero-sky)"/>
      <g class="stars">${sky({ width: W, height: H })}</g>
      <g class="trend" style="--trend:${up ? "var(--pos-hero)" : "var(--neg-hero)"}">
        ${candles}
        <path d="${d}" fill="none" stroke="var(--trend)" stroke-width="3.2" stroke-linejoin="round" filter="url(#hero-glow)"/>
        ${coords.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="var(--sky-top)" stroke="var(--trend)" stroke-width="2"/>`).join("")}
      </g>
      <g class="hero-rocket" transform="translate(${ex.toFixed(1)} ${(ey - 2).toFixed(1)}) rotate(${ang.toFixed(1)}) translate(0 -14) scale(1.15)">${rocket()}</g>
      <g transform="translate(0 ${H - 140})">${skyline({ height: 140, k: .5, id: "sk" })}</g>
      <g class="lone-star" filter="url(#hero-glow)">${star(552, 232, 17)}</g>
    </svg>`;
  }

  /* footer: a thin skyline on every page */
  function footerArt() {
    return `<svg class="footer-art" viewBox="0 0 1000 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>${glowFilter("ft-glow", 2)}</defs>
      <g transform="translate(0 0)">${skyline({ height: 120, k: .44, id: "ft", windows: true })}</g>
      ${star(552, 92, 9)}</svg>`;
  }

  return { skyline, sky, star, rocket, hero, footerArt, ICONS };
})();

document.addEventListener("DOMContentLoaded", () => {
  const f = document.querySelector("footer");
  if (f) f.insertAdjacentHTML("beforebegin", `<div class="footer-sky">${SPACE.footerArt()}</div>`);
});
