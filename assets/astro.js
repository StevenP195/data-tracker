/* Astronauts: original SVG characters used across the tracker (style inspired by the
   project's Space City references; no images or logos are copied).

     ASTRO.flagBadge()   astronaut in a skyline badge with a waving Texas flag (Today)
     ASTRO.rocketRider() astronaut riding a rocket past a rising chart (Trends)
     ASTRO.floater()     tethered astronaut floating and waving (Browse, empty states)
     ASTRO.helmet()      small helmet with the skyline in the visor (section icons)

   Any element with data-astro="<name>" is filled on page load. The flag waves with
   SMIL; everything is paused for viewers who ask for reduced motion. */

const ASTRO = (() => {
  const NAVY = "#0d1b3d", SUIT = "#f4f7fb", SUIT2 = "#dfe7f2", TRIM = "#3a5aa8", CYAN = "#6fd6f5", GOLD = "#f2b33d";
  let uid = 0;
  const id = p => `${p}-${++uid}`;

  function star(cx, cy, r, fill = "#fff") {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .42 : r;
      p.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
    }
    return `<polygon points="${p.join(" ")}" fill="${fill}"/>`;
  }
  const glow = (fid, blur = 2.5) => `<filter id="${fid}" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="${blur}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  /* a suit limb: navy outline under a white stroke */
  const limb = (d, w = 15, extra = "") => `<g ${extra}><path d="${d}" fill="none" stroke="${NAVY}" stroke-width="${w + 3}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="${SUIT}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/></g>`;

  /* helmet with the skyline reflected in the visor, centred on (cx, cy) */
  function helmetAt(cx, cy, r, vid) {
    const vx = cx - r * .72, vy = cy - r * .58, vw = r * 1.44, vh = r * 1.18;
    const towers = [[.08, .55], [.22, .35], [.37, .6], [.5, .22], [.66, .45], [.8, .62]]
      .map(([fx, fy]) => `<rect x="${(vx + vw * fx).toFixed(1)}" y="${(vy + vh * fy).toFixed(1)}" width="${(vw * .12).toFixed(1)}" height="${(vh * (1 - fy)).toFixed(1)}"/>`).join("");
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${SUIT}" stroke="${NAVY}" stroke-width="2.2"/>
      <rect x="${vx.toFixed(1)}" y="${vy.toFixed(1)}" width="${vw.toFixed(1)}" height="${vh.toFixed(1)}" rx="${(r * .55).toFixed(1)}" fill="#0f2350" stroke="${NAVY}" stroke-width="2"/>
      <clipPath id="${vid}"><rect x="${vx.toFixed(1)}" y="${vy.toFixed(1)}" width="${vw.toFixed(1)}" height="${vh.toFixed(1)}" rx="${(r * .55).toFixed(1)}"/></clipPath>
      <g clip-path="url(#${vid})" fill="#3e6aa8">${towers}</g>
      <path d="M${(vx + vw * .14).toFixed(1)},${(vy + vh * .3).toFixed(1)} Q${(vx + vw * .3).toFixed(1)},${(vy + vh * .08).toFixed(1)} ${(vx + vw * .52).toFixed(1)},${(vy + vh * .1).toFixed(1)}"
        fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>
      <circle cx="${cx - r - 2}" cy="${cy + 2}" r="${(r * .14).toFixed(1)}" fill="${SUIT2}" stroke="${NAVY}" stroke-width="1.4"/>
      <circle cx="${cx + r + 2}" cy="${cy + 2}" r="${(r * .14).toFixed(1)}" fill="${SUIT2}" stroke="${NAVY}" stroke-width="1.4"/>`;
  }

  /* ---------- the Texas flag: three panels on a travelling wave ---------- */
  function texasFlag(px, py, W = 84, H = 56, shadeId) {
    const A = 5.5, lambda = W * 0.9, phases = [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2];
    const dy = (x, ph) => A * (x / W) * Math.sin((2 * Math.PI * x) / lambda - ph);
    const xs = (a, b) => { const out = []; for (let x = a; x < b; x += 3.5) out.push(x); out.push(b); return out; };
    const shape = (x0, x1, y0, y1, ph) => {
      const top = xs(x0, x1).map(x => `${(px + x).toFixed(2)},${(py + y0 + dy(x, ph)).toFixed(2)}`);
      const bot = xs(x0, x1).reverse().map(x => `${(px + x).toFixed(2)},${(py + y1 + dy(x, ph)).toFixed(2)}`);
      return `M${top.join("L")}L${bot.join("L")}Z`;
    };
    const anim = (x0, x1, y0, y1) =>
      `<animate attributeName="d" dur="1.7s" repeatCount="indefinite" values="${phases.map(ph => shape(x0, x1, y0, y1, ph)).join(";")}"/>`;
    const part = (x0, x1, y0, y1, fill, extra = "") => `<path d="${shape(x0, x1, y0, y1, 0)}" fill="${fill}" ${extra}>${anim(x0, x1, y0, y1)}</path>`;
    const band = W / 3, sx = band / 2, sy = H / 2;
    return `<g class="tx-flag">
      ${part(0, band, 0, H, "#1f3f8f")}
      ${part(band, W, 0, H / 2, "#f7f9fc")}
      ${part(band, W, H / 2, H, "#c8203a")}
      <g>${star(px + sx, py + sy, 10.5, "#ffffff")}
        <animateTransform attributeName="transform" type="translate" dur="1.7s" repeatCount="indefinite"
          values="${phases.map(ph => `0 ${dy(sx, ph).toFixed(2)}`).join(";")}"/></g>
      ${part(0, W, 0, H, `url(#${shadeId})`, 'opacity=".55"')}
      ${part(0, W, 0, H, "none", `stroke="${NAVY}" stroke-width="1.6" stroke-linejoin="round"`)}
    </g>`;
  }

  /* ---------- 1. flag-bearer in a skyline badge ---------- */
  function flagBadge() {
    const clip = id("badge"), sky = id("bsky"), shade = id("shade"), gl = id("glow"), visor = id("visor");
    const back = [[34, 22, 70], [58, 18, 52], [78, 24, 92], [104, 16, 60], [150, 20, 76], [172, 26, 100], [200, 18, 64]]
      .map(([x, w, h]) => `<rect x="${x}" y="${222 - h}" width="${w}" height="${h}" fill="#8fb3dc"/>`).join("");
    const front = [[42, 20, 46], [64, 26, 64], [92, 14, 82], [140, 22, 58], [164, 18, 86], [186, 24, 50]]
      .map(([x, w, h]) => `<path d="M${x},222V${222 - h + 8}L${x + w / 2},${222 - h}L${x + w},${222 - h + 8}V222Z" fill="#5d84bd"/>`).join("");
    return `<svg class="astro astro-flag" viewBox="0 0 262 262" role="img" aria-label="Astronaut holding a waving Texas flag over the Houston skyline">
      <defs>
        <clipPath id="${clip}"><circle cx="120" cy="152" r="98"/></clipPath>
        <linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe4f6"/><stop offset="1" stop-color="#eef8fe"/></linearGradient>
        <linearGradient id="${shade}" x1="0" x2="1">
          <stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".3" stop-color="#fff" stop-opacity=".35"/>
          <stop offset=".5" stop-color="#000" stop-opacity=".18"/><stop offset=".75" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity=".15"/>
          <animateTransform attributeName="gradientTransform" type="translate" values="-.3 0;.3 0;-.3 0" dur="3.4s" repeatCount="indefinite"/>
        </linearGradient>
        ${glow(gl)}
      </defs>
      <circle cx="120" cy="152" r="104" fill="#0b1b3c" stroke="${CYAN}" stroke-width="3" filter="url(#${gl})"/>
      <g clip-path="url(#${clip})">
        <rect x="0" y="40" width="262" height="230" fill="url(#${sky})"/>
        ${back}${front}
        <path d="M10,222 Q120,206 230,222 V270 H10 Z" fill="#14244a"/>
        ${star(70, 240, 3.5, GOLD)}${star(168, 236, 3, GOLD)}
        <circle cx="120" cy="246" r="1.6" fill="#cfe8f7"/><circle cx="96" cy="232" r="1.2" fill="#cfe8f7"/><circle cx="150" cy="252" r="1.4" fill="#cfe8f7"/>
      </g>
      <circle cx="120" cy="152" r="98" fill="none" stroke="${GOLD}" stroke-width="3" stroke-dasharray="190 470" stroke-dashoffset="-40" stroke-linecap="round"/>
      <circle cx="120" cy="152" r="98" fill="none" stroke="${TRIM}" stroke-width="3" stroke-dasharray="150 470" stroke-dashoffset="-330" stroke-linecap="round"/>
      <g class="astro-float">
        <line x1="170" y1="244" x2="170" y2="22" stroke="${NAVY}" stroke-width="5" stroke-linecap="round"/>
        <line x1="170" y1="244" x2="170" y2="22" stroke="${SUIT2}" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="170" cy="20" r="3.4" fill="${GOLD}" stroke="${NAVY}" stroke-width="1.2"/>
        ${texasFlag(172, 24, 84, 56, shade)}
        <g filter="url(#${gl})">
          <rect x="22" y="52" width="70" height="46" rx="6" fill="rgba(111,214,245,.16)" stroke="${CYAN}" stroke-width="2"/>
          <g fill="${CYAN}" opacity=".75"><rect x="30" y="84" width="6" height="8"/><rect x="40" y="78" width="6" height="14"/>
            <rect x="50" y="81" width="6" height="11"/><rect x="60" y="72" width="6" height="20"/><rect x="70" y="66" width="6" height="26"/></g>
          <path d="M29,82 L44,70 L54,75 L80,58" fill="none" stroke="#9ef0ff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M80,58 l-8,1 M80,58 l-2,7" stroke="#9ef0ff" stroke-width="2.4" stroke-linecap="round"/>
        </g>
        <rect x="90" y="104" width="60" height="62" rx="9" fill="${SUIT2}" stroke="${NAVY}" stroke-width="2"/>
        ${limb("M110,178 L106,226", 17)}${limb("M131,178 L136,226", 17)}
        <rect x="93" y="222" width="26" height="15" rx="6" fill="${SUIT}" stroke="${NAVY}" stroke-width="2"/>
        <rect x="124" y="222" width="26" height="15" rx="6" fill="${SUIT}" stroke="${NAVY}" stroke-width="2"/>
        <path d="M95,234 H117 M126,234 H148" stroke="${TRIM}" stroke-width="3"/>
        <rect x="101" y="196" width="12" height="9" rx="3" fill="${SUIT2}" stroke="${NAVY}" stroke-width="1.4"/>
        <rect x="129" y="196" width="12" height="9" rx="3" fill="${SUIT2}" stroke="${NAVY}" stroke-width="1.4"/>
        ${limb("M100,122 L80,132 L66,110", 14)}
        ${limb("M141,122 L158,138 L168,140", 14)}
        <circle cx="64" cy="105" r="8" fill="${SUIT}" stroke="${NAVY}" stroke-width="2"/>
        <circle cx="168" cy="141" r="7.5" fill="${SUIT}" stroke="${NAVY}" stroke-width="2"/>
        <rect x="96" y="108" width="50" height="76" rx="13" fill="${SUIT}" stroke="${NAVY}" stroke-width="2"/>
        <path d="M103,112 L114,132 M139,112 L128,132" stroke="${TRIM}" stroke-width="4" stroke-linecap="round"/>
        <rect x="107" y="128" width="28" height="20" rx="3" fill="#e2e9f3" stroke="${NAVY}" stroke-width="1.6"/>
        <circle cx="115" cy="138" r="3" fill="${CYAN}"/><rect x="121" y="134" width="9" height="3" rx="1" fill="${TRIM}"/>
        <rect x="121" y="140" width="6" height="3" rx="1" fill="${GOLD}"/>
        <rect x="96" y="168" width="50" height="8" fill="${TRIM}" stroke="${NAVY}" stroke-width="1.6"/>
        <rect x="114" y="167" width="14" height="10" rx="2" fill="${SUIT2}" stroke="${NAVY}" stroke-width="1.4"/>
        <rect x="104" y="100" width="34" height="10" rx="4" fill="${SUIT2}" stroke="${NAVY}" stroke-width="1.6"/>
        ${helmetAt(121, 78, 29, visor)}
      </g>
    </svg>`;
  }

  /* ---------- 2. astronaut riding a rocket past a rising chart ---------- */
  function rocketRider() {
    const gl = id("rglow"), visor = id("rvisor");
    const bars = [[132, 22], [152, 34], [172, 28], [192, 50], [212, 64]]
      .map(([x, h]) => `<rect x="${x}" y="${176 - h}" width="13" height="${h}" rx="2" fill="#5aa9ff" opacity=".35" stroke="#5aa9ff" stroke-width="1.4"/>`).join("");
    return `<svg class="astro astro-rider" viewBox="0 0 240 190" role="img" aria-label="Astronaut riding a rocket past a rising chart">
      <defs>${glow(gl, 2.2)}</defs>
      <g filter="url(#${gl})">${bars}
        <path d="M118,168 L152,128 L170,140 L222,86" fill="none" stroke="#5aa9ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M222,86 l-14,2 M222,86 l-3,14" stroke="#5aa9ff" stroke-width="4" stroke-linecap="round"/></g>
      <g class="astro-float"><g transform="translate(100 112) rotate(-34)">
        <g class="flame"><path d="M-76,0 Q-112,-16 -128,0 Q-112,16 -76,0 Z" fill="#f59a3c"/><path d="M-76,0 Q-98,-8 -108,0 Q-98,8 -76,0 Z" fill="#ffe08a"/></g>
        <path d="M-62,-20 L-84,-40 L-48,-22 Z M-62,20 L-84,40 L-48,22 Z" fill="${NAVY}"/>
        <path d="M-76,0 C-62,-26 40,-30 72,0 C40,30 -62,26 -76,0 Z" fill="#f0962e" stroke="${NAVY}" stroke-width="2.4"/>
        <path d="M44,-21 C58,-16 68,-8 72,0 C68,8 58,16 44,21 Z" fill="${NAVY}"/>
        <path d="M-76,0 C-62,-26 40,-30 72,0" fill="none" stroke="#ffd08a" stroke-width="2" opacity=".6" transform="translate(0 4)"/>
        <circle cx="6" cy="2" r="14" fill="${NAVY}" stroke="${SUIT}" stroke-width="2"/>${star(6, 3, 8.5, "#ffffff")}
        <!-- rider -->
        ${limb("M-18,-20 L-6,4 L8,6", 13)}
        <rect x="-36" y="-62" width="34" height="44" rx="10" fill="${SUIT}" stroke="${NAVY}" stroke-width="2"/>
        <rect x="-44" y="-58" width="12" height="34" rx="4" fill="${SUIT2}" stroke="${NAVY}" stroke-width="1.6"/>
        <rect x="-26" y="-46" width="14" height="10" rx="2" fill="#e2e9f3" stroke="${NAVY}" stroke-width="1.4"/>
        <circle cx="-21" cy="-41" r="2" fill="${CYAN}"/>
        ${limb("M-8,-52 L10,-62 L16,-80", 11)}
        <circle cx="16" cy="-84" r="6.5" fill="${SUIT}" stroke="${NAVY}" stroke-width="2"/>
        <rect x="14" y="-96" width="5" height="9" rx="2.5" fill="${SUIT}" stroke="${NAVY}" stroke-width="1.6"/>
        ${helmetAt(-18, -80, 20, visor)}
      </g></g>
    </svg>`;
  }

  /* ---------- 3. tethered astronaut floating and waving ---------- */
  function floater() {
    const visor = id("fvisor");
    return `<svg class="astro astro-floater" viewBox="0 0 170 170" role="img" aria-label="Astronaut floating and waving">
      <path d="M8,160 C40,150 34,118 62,108" fill="none" stroke="${CYAN}" stroke-width="2.2" stroke-dasharray="5 4" opacity=".8"/>
      ${star(146, 22, 5, GOLD)}${star(22, 40, 3.5, "#cfe8f7")}${star(150, 120, 3, "#cfe8f7")}
      <g class="astro-float"><g transform="rotate(-14 90 90)">
        <rect x="64" y="70" width="52" height="54" rx="10" fill="${SUIT2}" stroke="${NAVY}" stroke-width="2"/>
        ${limb("M80,122 L74,148", 14)}${limb("M100,122 L112,144", 14)}
        <rect x="64" y="144" width="20" height="12" rx="5" fill="${SUIT}" stroke="${NAVY}" stroke-width="1.8"/>
        <rect x="104" y="140" width="20" height="12" rx="5" fill="${SUIT}" stroke="${NAVY}" stroke-width="1.8" transform="rotate(20 114 146)"/>
        ${limb("M72,86 L56,104 L54,118", 12)}
        <circle cx="54" cy="121" r="6.5" fill="${SUIT}" stroke="${NAVY}" stroke-width="1.8"/>
        <g class="wave-arm">${limb("M108,86 L124,78 L132,58", 12)}
          <circle cx="133" cy="54" r="6.5" fill="${SUIT}" stroke="${NAVY}" stroke-width="1.8"/></g>
        <rect x="70" y="78" width="40" height="50" rx="11" fill="${SUIT}" stroke="${NAVY}" stroke-width="2"/>
        <rect x="80" y="94" width="20" height="14" rx="2" fill="#e2e9f3" stroke="${NAVY}" stroke-width="1.4"/>
        <circle cx="86" cy="101" r="2.4" fill="${CYAN}"/><rect x="91" y="98" width="6" height="2.5" fill="${GOLD}"/>
        <path d="M70,116 H110" stroke="${TRIM}" stroke-width="5"/>
        ${helmetAt(90, 58, 22, visor)}
      </g></g>
    </svg>`;
  }

  /* ---------- 4. helmet icon ---------- */
  function helmet() {
    return `<svg class="astro astro-helmet" viewBox="0 0 60 60" aria-hidden="true">
      <rect x="18" y="46" width="24" height="8" rx="3" fill="${SUIT2}" stroke="${NAVY}" stroke-width="1.6"/>
      ${helmetAt(30, 28, 20, id("hvisor"))}</svg>`;
  }

  const MAKERS = { flag: flagBadge, rider: rocketRider, floater, helmet };

  function fill(root = document) {
    root.querySelectorAll("[data-astro]").forEach(el => {
      if (el.dataset.astroDone) return;
      const make = MAKERS[el.dataset.astro];
      if (!make) return;
      el.innerHTML = make();
      el.dataset.astroDone = "1";
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) el.querySelectorAll("svg").forEach(s => s.pauseAnimations?.());
    });
  }
  document.addEventListener("DOMContentLoaded", () => fill());

  return { flagBadge, rocketRider, floater, helmet, fill };
})();
