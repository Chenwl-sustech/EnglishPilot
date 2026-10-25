/* Offline application files only. Learning records and recordings stay in IndexedDB. */
const PREFIX = "englishpilot-pwa-";
const VERSION = new URL(self.location.href).searchParams.get("v");
const NAME = PREFIX + VERSION;
const absolute = (path) => new URL(path, self.location.origin).href;
const json = (value, options = {}) =>
  new Response(JSON.stringify(value), {
    ...options,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...options.headers,
    },
  });
const unavailable = () =>
  json(
    { error: "当前离线，在线服务不可用；本机练习与录音仍保留。" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
function allowed(path) {
  const url = new URL(path, self.location.origin);
  return (
    url.origin === self.location.origin &&
    !url.search &&
    !url.hash &&
    (url.pathname.startsWith("/_next/static/") ||
      [
        "/",
        "/today",
        "/dashboard",
        "/vocabulary",
        "/grammar",
        "/listening",
        "/reading",
        "/speaking",
        "/writing",
        "/exams",
        "/mistakes",
        "/teacher",
        "/analytics",
        "/plan",
        "/settings",
        "/assessment",
        "/calendar",
        "/mini-test",
        "/import-listening",
        "/manifest.webmanifest",
        "/icon.svg",
        "/icons/icon-192.png",
        "/icons/icon-512.png",
        "/icons/maskable-512.png",
        "/apple-touch-icon.png",
      ].includes(url.pathname))
  );
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(absolute("/offline-assets.json"), {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("离线资源清单不可用");
      const info = await response.json();
      if (
        !VERSION ||
        info.version !== VERSION ||
        !Array.isArray(info.urls) ||
        !info.urls.length ||
        info.urls.length > 1500 ||
        !info.urls.every((p) => typeof p === "string" && allowed(p))
      )
        throw new Error("离线资源清单无效");
      const cache = await caches.open(NAME);
      try {
        for (let n = 0; n < info.urls.length; n += 6) {
          await Promise.all(
            info.urls.slice(n, n + 6).map(async (path) => {
              const url = absolute(path),
                result = await fetch(url, {
                  cache: "reload",
                  credentials: "same-origin",
                });
              if (!result.ok || result.redirected)
                throw new Error("离线资源未完整下载");
              await cache.put(url, result);
            }),
          );
        }
        await cache.put(absolute("/offline-assets.json"), json(info));
      } catch (error) {
        await caches.delete(NAME);
        throw error;
      }
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const own = (await caches.keys()).filter((k) => k.startsWith(PREFIX));
      await Promise.all(
        own
          .slice(0, -2)
          .filter((k) => k !== NAME)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE")
    event.waitUntil(self.skipWaiting());
  else if (event.data?.type === "CLAIM_CLIENTS")
    event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const api = url.pathname.startsWith("/api/"),
    flight = request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  event.respondWith(
    (async () => {
      if (api || flight) {
        try {
          return await fetch(request);
        } catch {
          return unavailable();
        }
      }
      const cache = await caches.open(NAME);
      if (url.pathname === "/offline-assets.json") {
        try {
          return await fetch(request);
        } catch {
          return (await cache.match(absolute(url.pathname))) || unavailable();
        }
      }
      if (request.mode !== "navigate") {
        const saved = await cache.match(absolute(url.pathname));
        if (saved) return saved;
        try {
          return await fetch(request);
        } catch {
          return unavailable();
        }
      }
      try {
        return await fetch(request);
      } catch {
        return (
          (await cache.match(absolute(url.pathname))) ||
          (await cache.match(absolute("/today"))) ||
          unavailable()
        );
      }
    })(),
  );
});
