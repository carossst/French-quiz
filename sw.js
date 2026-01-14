/* sw.js - Service Worker v3.2.1 pour Test Your French */

const APP_VERSION = "3.2.1";   // À incrémenter à chaque gros déploiement
const CACHE_PREFIX = "tyf";

const CACHE_NAME = `${CACHE_PREFIX}-cache-${APP_VERSION}`;
const DYNAMIC_CACHE = `${CACHE_PREFIX}-dynamic-${APP_VERSION}`;

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./config.js",
  "./main.js",
  "./ui-core.js",
  "./ui-features.js",
  "./ui-charts.js",
  "./quizManager.js",
  "./resourceManager.js",
  "./storage.js",
  "./metadata.json",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png",
  "./email.js",
  "./noscript.js",
  "./fallback.js"
];


// Détection environnement
const hostname = self.location.hostname;
const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
const isGitHubPages = hostname.includes("github.io");

const DEBUG = isLocalhost;

const log = DEBUG ? (...args) => console.log("[SW]", ...args) : () => { };
const warn = DEBUG ? (...args) => console.warn("[SW]", ...args) : () => { };
const error = DEBUG ? (...args) => console.error("[SW]", ...args) : () => { };


/* ============================================================
   INSTALL
============================================================ */
self.addEventListener("install", event => {
  log("Install - Cache:", CACHE_NAME, "Version:", APP_VERSION);
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache =>
        Promise.allSettled(
          ASSETS_TO_CACHE.map(asset =>
            cache.add(asset).catch(err => {
              warn(`Failed to cache ${asset}:`, err && err.message ? err.message : err);
              return null;
            })
          )
        )
      )
      .then(results => {
        const failed = results.filter(r => r.status === "rejected").length;
        const success = results.length - failed;
        log(`Precaching completed: ${success}/${results.length} assets cached`);
        if (failed > 0) warn(`${failed} assets failed to precache.`);
      })
      .catch(err => error("Critical precaching error:", err))
  );
});

/* ============================================================
   ACTIVATE
============================================================ */
self.addEventListener("activate", event => {
  log("Activate - Version:", APP_VERSION, "Cache:", CACHE_NAME);

  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key =>
              key.startsWith(`${CACHE_PREFIX}-`) &&
              key !== CACHE_NAME &&
              key !== DYNAMIC_CACHE
            )
            .map(key => {
              log(`Deleting old cache: ${key}`);
              return caches.delete(key);
            })
        )
      ),
      self.clients.claim(),
      cleanOldDynamicCache()
    ])
  );
});

/* ============================================================
   FETCH
============================================================ */
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Laisse passer les extensions navigateur
  if (!url.protocol.startsWith("http")) return;
  if (url.protocol === "chrome-extension:" || url.protocol === "moz-extension:") return;

  // HEAD en direct réseau
  if (request.method === "HEAD") {
    event.respondWith(fetch(request));
    return;
  }

  // Audio
  if (url.pathname.includes("/audio/") && /\.(mp3|ogg|wav)$/i.test(url.pathname)) {
    event.respondWith(handleAudioRequest(request));
    return;
  }

  // JSON (metadata + quizzes)
  if (url.pathname.endsWith(".json")) {
    event.respondWith(handleJsonRequest(request));
    return;
  }

  // Reste des fichiers statiques
  event.respondWith(handleStaticRequest(request));
});

/* ============================================================
   AUDIO REQUEST HANDLING
============================================================ */
async function handleAudioRequest(request) {
  log(`Audio request: ${request.url}`);

  try {
    const dynCache = await caches.open(DYNAMIC_CACHE);
    const cachedDyn = await dynCache.match(request);
    if (cachedDyn) {
      log(`Audio from dynamic cache: ${request.url}`);
      return cachedDyn;
    }

    const mainCache = await caches.open(CACHE_NAME);
    const cachedMain = await mainCache.match(request);
    if (cachedMain) {
      log(`Audio from main cache: ${request.url}`);
      return cachedMain;
    }

    log(`Audio fetch: ${request.url}`);
    const response = await fetch(request);

    if (response.ok) {
      await dynCache.put(request, response.clone());
      log(`Audio cached: ${request.url}`);
    }

    return response;

  } catch (err) {
    warn(`Audio request failed: ${request.url}`, err && err.message ? err.message : err);

    try {
      return await fetch(request);
    } catch {
      return new Response("Audio not found", {
        status: 404,
        statusText: "Audio file not found",
        headers: { "Content-Type": "text/plain" }
      });
    }
  }
}


/* ============================================================
   JSON REQUEST HANDLING
============================================================ */
async function handleJsonRequest(request) {
  log(`JSON request: ${request.url}`);

  try {
    const response = await fetch(request);

    if (response.ok) {
      const dynCache = await caches.open(DYNAMIC_CACHE);
      await dynCache.put(request, response.clone());
      log(`JSON cached: ${request.url}`);
      return response;
    }

    throw new Error(`HTTP ${response.status}`);

  } catch (err) {
    warn(`JSON network failed: ${request.url}`, err && err.message ? err.message : err);

    const dynCache = await caches.open(DYNAMIC_CACHE);
    const cachedDynamic = await dynCache.match(request);
    if (cachedDynamic) return cachedDynamic;

    const mainCache = await caches.open(CACHE_NAME);
    const cachedMain = await mainCache.match(request);
    if (cachedMain) return cachedMain;

    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
}


/* ============================================================
   STATIC REQUEST HANDLING
============================================================ */
async function handleStaticRequest(request) {
  const mainCache = await caches.open(CACHE_NAME);
  const cached = await mainCache.match(request);
  if (cached) {
    log(`Static from main cache: ${request.url}`);
    return cached;
  }

  const dynCache = await caches.open(DYNAMIC_CACHE);
  const cachedDynamic = await dynCache.match(request);
  if (cachedDynamic) {
    log(`Static from dynamic cache: ${request.url}`);
    return cachedDynamic;
  }

  try {
    const response = await fetch(request);
    let urlObj;

    try {
      urlObj = new URL(response.url);
    } catch {
      warn(`Invalid URL in response: ${response.url}`);
      return response;
    }

    const shouldCache =
      response.ok &&
      (response.type === "basic" || response.type === "cors") &&
      !urlObj.pathname.endsWith(".json") &&
      !urlObj.pathname.includes("/audio/");

    if (shouldCache) {
      await mainCache.put(request, response.clone());
      log(`Static cached: ${request.url}`);
    }

    return response;

  } catch (err) {
    error(`Static failed: ${request.url}`, err);

    if (request.headers.get("accept")?.includes("text/html")) {
      const offlineHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Offline - Test Your French</title>
          <style>
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
              background: #111f46;
              color: #ffffff;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              text-align: center;
              padding: 20px;
            }
            .btn {
              display: inline-block;
              background: #4CAF50;
              padding: 12px 24px;
              border-radius: 30px;
              color: #ffffff;
              text-decoration: none;
              margin-top: 16px;
            }
          </style>
        </head>
        <body>
          <div>
            <h1>Offline Mode</h1>
            <p>This page is not available offline yet.</p>
            <a href="./" class="btn">Retry</a>
          </div>
        </body>
        </html>
      `;
      return new Response(offlineHtml, {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    throw err;
  }
}


/* ============================================================
   MESSAGE HANDLER
============================================================ */
self.addEventListener("message", event => {
  log("Message:", event.data);

  switch (event.data && event.data.type) {
    case "SKIP_WAITING":
      self.skipWaiting();
      break;

    case "GET_VERSION":
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ version: APP_VERSION, cacheName: CACHE_NAME });
      }
      break;

    case "CLEAR_CACHE":
      if (event.ports && event.ports[0]) {
        clearAllCaches().then(() =>
          event.ports[0].postMessage({ success: true })
        );
      } else {
        clearAllCaches();
      }
      break;

    case "CACHE_AUDIO":
      if (Array.isArray(event.data.audioUrls)) {
        cacheAudioFiles(event.data.audioUrls).then(results => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({
              success: true,
              cached: results.filter(r => r.success).length,
              failed: results.filter(r => !r.success).length,
              details: results
            });
          }
        });
      } else {
        warn("CACHE_AUDIO called without valid audioUrls");
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: false, message: "Invalid audioUrls" });
        }
      }
      break;

    // ✅ NEW: notification scheduling (best-effort)
    case "SCHEDULE_NOTIFICATION": {
      const title = String(event.data.title || "Test Your French");
      const body = String(event.data.body || "");
      const delay = Number(event.data.delay || 0);

      const respond = (payload) => {
        try { event.ports && event.ports[0] && event.ports[0].postMessage(payload); } catch { }
      };

      // Guardrails
      if (!self.registration || typeof self.registration.showNotification !== "function") {
        warn("showNotification not available");
        respond({ success: false, scheduled: false, reason: "no_showNotification" });
        break;
      }

      // KISS: only reliable for short delays
      const MAX_RELIABLE_DELAY_MS = 5 * 60 * 1000; // 5 minutes
      const safeDelay = Math.max(0, delay);

      if (safeDelay > MAX_RELIABLE_DELAY_MS) {
        warn("Delay too long for reliable SW timer:", safeDelay);
        respond({ success: true, scheduled: false, reason: "delay_too_long", maxReliableMs: MAX_RELIABLE_DELAY_MS });
        break;
      }

      // Keep the SW alive (best effort) for the short delay
      event.waitUntil(new Promise((resolve) => {
        setTimeout(async () => {
          try {
            await self.registration.showNotification(title, {
              body,
              tag: "tyf-daily-chest",
              renotify: false
            });
            respond({ success: true, scheduled: true, delay: safeDelay });
          } catch (e) {
            error("Notification failed:", e);
            respond({ success: false, scheduled: false, reason: "showNotification_failed" });
          } finally {
            resolve();
          }
        }, safeDelay);
      }));

      break;
    }

    default:
      warn("Unknown message type:", event.data && event.data.type);
  }
});

/* ============================================================
   AUDIO PRECACHE
============================================================ */
async function cacheAudioFiles(urls) {
  const dynCache = await caches.open(DYNAMIC_CACHE);
  const results = [];

  for (const url of urls) {
    try {
      const exists = await dynCache.match(url);
      if (exists) {
        results.push({ url, success: true, status: "Already cached" });
        continue;
      }

      const response = await fetch(url);
      if (response.ok) {
        await dynCache.put(url, response.clone());
        results.push({ url, success: true, status: "Cached" });
      } else {
        results.push({ url, success: false, error: `HTTP ${response.status}` });
      }
    } catch (err) {
      results.push({ url, success: false, error: err && err.message ? err.message : String(err) });
    }
  }
  return results;
}



/* ============================================================
   CLEAR ALL CACHES
============================================================ */
async function clearAllCaches() {
  const names = await caches.keys();
  const toDelete = names.filter(n => n.startsWith(`${CACHE_PREFIX}-`));
  await Promise.all(toDelete.map(n => caches.delete(n)));
}

/* ============================================================
   CLEAN OLD DYNAMIC CACHE (>7 DAYS)
============================================================ */
async function cleanOldDynamicCache() {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const requests = await cache.keys();
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 jours

    for (const request of requests) {
      const response = await cache.match(request);
      if (!response) continue;

      const dateHeader = response.headers.get("date");
      const cacheDate = dateHeader ? new Date(dateHeader).getTime() : now;

      if (now - cacheDate > maxAge) {
        await cache.delete(request);
        log(`Cleaned old cache entry: ${request.url}`);
      }
    }
  } catch (err) {
    warn("Dynamic cache cleanup failed:", err);
  }
}


/* ============================================================
   GLOBAL ERROR HANDLERS
============================================================ */
self.addEventListener("error", e => error("SW error:", e.error));
self.addEventListener("unhandledrejection", e =>
  error("SW unhandled rejection:", e.reason)
);

/* ============================================================
   BOOT LOG
============================================================ */
log(`Service Worker loaded – Test Your French ready! Version: ${APP_VERSION}`);
