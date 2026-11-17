/* Service worker: makes the site installable and usable offline.

   - Online: every request goes to the network (so the pages always load the
     latest data files), and the response is cached.
   - Offline: the last cached copy is served; data files are marked with an
     X-TT-Offline header so the pages show an "offline" banner. */

const CACHE = "data-tracker-v4";
const SHELL = [
  "./", "index.html", "browse.html", "trends.html", "manifest.webmanifest",
  "assets/style.css", "assets/space.css", "assets/space.js", "assets/app.js", "assets/today.js", "assets/browse.js", "assets/trends.js",
  "assets/vendor/chart.umd.min.js",
  "assets/fonts/Inter-400-700.woff2", "assets/fonts/SourceSerif4-400-700.woff2",
  "assets/fonts/IBMPlexMono-400.woff2", "assets/fonts/IBMPlexMono-500.woff2",
  "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/maskable-512.png",
  "data/status.json", "data/history.csv",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

async function offlineCopy(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (!hit) {
    if (request.mode === "navigate") return cache.match("index.html");
    return Response.error();
  }
  const headers = new Headers(hit.headers);
  headers.set("X-TT-Offline", "1");
  return new Response(await hit.blob(), { status: hit.status, statusText: hit.statusText, headers });
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    try {
      // a navigation Request can't be re-sent with options, so fetch by URL
      const fresh = await fetch(req.url, { cache: "no-cache", credentials: "same-origin" });
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      return offlineCopy(req);
    }
  })());
});
