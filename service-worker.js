const CACHE_NAME = "my-wealth-v39";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./js/app.js",
  "./js/db.js",
  "./js/calculations.js",
  "./js/spreadsheet.js",
  "./icons/app-icon.svg"
];
const APP_SHELL_URLS = new Set(APP_SHELL.map((path) => new URL(path, self.location.href).href));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match("./index.html")));
    return;
  }

  if (!APP_SHELL_URLS.has(event.request.url)) return;
  event.respondWith(fetch(event.request, { cache: "no-store" })
    .then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    })
    .catch(() => caches.match(event.request)));
});
