/* sw.js â€” Service Worker v3.0 pour Test Your French */


const CACHE_NAME = "tyf-cache-v3.0";
const DYNAMIC_CACHE = "tyf-dynamic-v3.0";

const ASSETS_TO_CACHE = [

  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./js/main.js",
  "./js/ui-core.js",
  "./js/ui-features.js",
  "./js/ui-charts.js",
  "./js/quizManager.js",
  "./js/resourceManager.js",
  "./js/storage.js",
  "./js/data/metadata.json",
  "./icons/icon-192x192.png",
];

// self.location au lieu de location
const hostname = self.location.hostname;
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
const isGitHubPages = hostname.includes('github.io');

// Detection environnement 
const DEBUG = isLocalhost;
const log = DEBUG ? (...args) => console.log('[SW]', ...args) : () => { };
const warn = (...args) => console.warn('[SW]', ...args);
const error = (...args) => console.error('[SW]', ...args);

// Ã‰vÃ©nement 'install' (inchangÃ©)
self.addEventListener("install", event => {
  log("Install - Version:", CACHE_NAME);
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        log(`Precaching app shell - Cache: ${CACHE_NAME}`);
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(asset =>
            cache.add(asset).catch(err => {
              warn(`Failed to cache ${asset}:`, err.message);
              return null;
            })
          )
        );
      })
      .then(results => {
        const failed = results.filter(r => r.status === 'rejected').length;
        const success = results.length - failed;
        log(`Precaching completed: ${success}/${results.length} assets cached`);
        if (failed > 0) {
          warn(`${failed} assets failed to precache but SW installation continues`);
        }
        if (success === 0 && results.length > 0) {
          error("All assets failed to precache. Offline mode will likely not work.");
        }
      })
      .catch(err => {
        error("Critical precaching error:", err);
      })
  );
});

// Ã‰vÃ©nement 'activate' (inchangÃ©)
self.addEventListener("activate", event => {
  log("Activate - Version:", CACHE_NAME);

  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => {
        log("Existing caches:", keys);
        return Promise.all(
          keys
            .filter(key => key.startsWith('tyf-') && key !== CACHE_NAME && key !== DYNAMIC_CACHE)
            .map(key => {
              log(`Deleting old cache: ${key}`);
              return caches.delete(key);
            })
        );
      }),
      self.clients.claim()
      ,
      cleanOldDynamicCache()
    ])
  );
});

// Ã‰vÃ©nement 'fetch' (inchangÃ©)
self.addEventListener("fetch", event => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (!requestUrl.protocol.startsWith("http")) {
    return;
  }
  if (requestUrl.protocol === "chrome-extension:" || requestUrl.protocol === "moz-extension:") {
    return;
  }

  if (request.method === 'HEAD') {
    event.respondWith(fetch(request));
    return;
  }

  if (requestUrl.pathname.includes('/audio/') && /\.(mp3|ogg|wav)$/i.test(requestUrl.pathname)) {
    event.respondWith(handleAudioRequest(request));
    return;
  }

  if (requestUrl.pathname.endsWith('.json')) {
    event.respondWith(handleJsonRequest(request));
    return;
  }

  event.respondWith(handleStaticRequest(request));
});

// ðŸ”§ CORRECTION 4 : handleAudioRequest - retour audio correct, pas JSON
async function handleAudioRequest(request) {
  log(`Audio request: ${request.url}`);

  try {
    const cachedResponse = await caches.match(request, { cacheName: DYNAMIC_CACHE });
    if (cachedResponse) {
      log(`Audio served from dynamic cache: ${request.url}`);
      return cachedResponse;
    }

    const cachedMainResponse = await caches.match(request, { cacheName: CACHE_NAME });
    if (cachedMainResponse) {
      log(`Audio served from main cache: ${request.url}`);
      return cachedMainResponse;
    }

    log(`Audio fetch from network: ${request.url}`);
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
      log(`Audio cached in dynamic cache: ${request.url}`);
      return response;
    }

    warn(`Audio network response not ok: ${request.url} Status: ${response.status}`);
    return response;
  } catch (error) {
    warn(`Audio request failed (network error?): ${request.url}`, error.message);

    // ðŸ”§ CORRIGÃ‰ : Laisser passer au rÃ©seau ou retour HTTP propre
    try {
      // Tentative finale sur le rÃ©seau sans cache
      return await fetch(request);
    } catch (networkError) {
      // Si vraiment impossible, retour 404 propre sans body null
      return new Response('Audio not found', {
        status: 404,
        statusText: 'Audio file not found',
        headers: { 'Content-Type': 'text/plain' }
      });

    }
  }

}

// handleJsonRequest (inchangÃ©)
async function handleJsonRequest(request) {
  log(`JSON request: ${request.url}`);

  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
      log(`JSON cached in dynamic cache: ${request.url}`);
      return response;
    }

    throw new Error(`Network response not ok: ${response.status}`);

  } catch (error) {
    warn(`JSON network failed: ${request.url}`, error.message);

    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      log(`JSON served from cache: ${request.url}`);
      return cachedResponse;
    }

    const cachedMainResponse = await caches.match(request, { cacheName: CACHE_NAME });
    if (cachedMainResponse) {
      log(`JSON served from main cache: ${request.url}`);
      return cachedMainResponse;
    }

    log(`JSON fallback to network: ${request.url}`);
    return fetch(request);
  }
}

// handleStaticRequest (inchangÃ©)
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request, { cacheName: CACHE_NAME });

  if (cachedResponse) {
    log(`Static served from main cache: ${request.url}`);
    return cachedResponse;
  }

  const cachedDynamicResponse = await caches.match(request, { cacheName: DYNAMIC_CACHE });
  if (cachedDynamicResponse) {
    log(`Static served from dynamic cache: ${request.url}`);
    return cachedDynamicResponse;
  }

  log(`Static fetch from network: ${request.url}`);

  try {
    const response = await fetch(request);

    let responseUrl;
    try {
      responseUrl = new URL(response.url);
    } catch (error) {
      warn(`Invalid URL: ${response.url}`);
      return response;
    }

    const isCachableAsset = response.ok &&
      (response.type === 'basic' || response.type === 'cors') &&
      responseUrl &&
      !responseUrl.pathname.endsWith('.json') &&
      !responseUrl.pathname.includes('/audio/');

    if (isCachableAsset) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
      log(`Static cached in main cache: ${request.url}`);
    }

    return response;
  } catch (error) {
    error(`Static network failed: ${request.url}`, error);

    if (request.headers.get('accept')?.includes('text/html')) {
      const offlineHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>Test Your French - Offline</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: 'Segoe UI', Arial, sans-serif; 
              text-align: center; 
              padding: 50px 20px; 
              background: linear-gradient(135deg, #111f46, #5b7cb9); 
              color: white; 
              min-height: 100vh; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              margin: 0; 
            }
            .offline-container { 
              max-width: 500px; 
              background: rgba(255,255,255,0.1); 
              padding: 40px; 
              border-radius: 20px; 
              box-shadow: 0 8px 32px rgba(0,0,0,0.3); 
              backdrop-filter: blur(10px); 
            }
            .offline-icon { 
              font-size: 64px; 
              margin-bottom: 30px; 
              animation: pulse 2s infinite; 
            }
            h1 { 
              color: white; 
              margin-bottom: 20px; 
              font-size: 2em; 
            }
            p { 
              line-height: 1.6; 
              margin-bottom: 30px; 
              opacity: 0.9; 
            }
            .retry-btn { 
              background: #4CAF50; 
              color: white; 
              border: none; 
              padding: 15px 30px; 
              border-radius: 50px; 
              cursor: pointer; 
              font-size: 16px; 
              transition: all 0.3s ease; 
            }
            .retry-btn:hover { 
              background: #45a049; 
              transform: translateY(-2px); 
            }
            @keyframes pulse {
              0% { transform: scale(1); } 
              50% { transform: scale(1.1); } 
              100% { transform: scale(1); } 
            }
          </style>
        </head>
        <body>
          <div class="offline-container">
            <div class="offline-icon">ðŸŒ</div>
            <h1>Test Your French</h1>
            <h2>Offline Mode</h2>
            <p>This page is not available offline yet. Please check your internet connection and try again.</p>
          <a href="/" class="retry-btn">ðŸ”„ Retry</a>

          </div>
        </body>
        </html>`;

      return new Response(offlineHtml, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        status: 503,
        statusText: 'Service Unavailable - Offline'
      });
    }

    throw error;
  }
}

// Gestion messages (inchangÃ©)
self.addEventListener('message', event => {
  log("Message received:", event.data);

  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      log("skipWaiting() executed via message.");
      break;
    case 'GET_VERSION':
      event.ports[0].postMessage({ version: CACHE_NAME });
      log("Sent version:", CACHE_NAME);
      break;
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        event.ports[0].postMessage({ success: true, message: 'All caches cleared' });
        log("All application caches cleared via message.");
      }).catch(err => {
        event.ports[0].postMessage({ success: false, message: `Failed to clear caches: ${err.message}` });
        error("Failed to clear caches via message:", err);
      });
      break;
    case 'CACHE_AUDIO':
      if (event.data.audioUrls && Array.isArray(event.data.audioUrls)) {
        log(`Received request to cache ${event.data.audioUrls.length} audio files.`);
        cacheAudioFiles(event.data.audioUrls).then(results => {
          event.ports[0].postMessage({
            success: true,
            cached: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            details: results
          });
          log(`Audio cache request finished. Cached: ${results.filter(r => r.success).length}, Failed: ${results.filter(r => !r.success).length}`);
        }).catch(err => {
          event.ports[0].postMessage({ success: false, message: `Failed to initiate audio cache: ${err.message}` });
          error("Failed to initiate audio cache:", err);
        });
      } else {
        warn("Received CACHE_AUDIO message but audioUrls is missing or not an array.");
        event.ports[0].postMessage({ success: false, message: 'Invalid data for CACHE_AUDIO' });
      }
      break;
    case 'PRECACHE_ASSETS':
      if (event.data.assets && Array.isArray(event.data.assets)) {
        log(`Received request to precache ${event.data.assets.length} assets.`);
        caches.open(CACHE_NAME).then(cache => {
          return Promise.allSettled(
            event.data.assets.map(asset =>
              cache.add(asset).catch(err => {
                warn(`Failed to precache asset ${asset} via message:`, err.message);
                return null;
              })
            )
          );
        }).then(results => {
          const failed = results.filter(r => r.status === 'rejected').length;
          const success = results.length - failed;
          log(`Asset precaching via message completed: ${success}/${results.length} assets cached.`);
          event.ports[0].postMessage({
            success: true,
            cached: success,
            failed: failed
          });
        }).catch(err => {
          error("Critical asset precaching error via message:", err);
          event.ports[0].postMessage({ success: false, message: `Critical precaching error: ${err.message}` });
        });
      } else {
        warn("Received PRECACHE_ASSETS message but assets list is missing or not an array.");
        event.ports[0].postMessage({ success: false, message: 'Invalid data for PRECACHE_ASSETS' });
      }
      break;
    case 'SCHEDULE_NOTIFICATION':
      if (event.data.title && event.data.body) {
        scheduleNotification(event.data.title, event.data.body, event.data.delay || 86400000);
        event.ports[0].postMessage({ success: true, message: 'Notification scheduled' });
      } else {
        event.ports[0].postMessage({ success: false, message: 'Missing notification data' });
      }
      break;
    default:
      warn("Received unknown message type:", event.data.type);
      event.ports[0].postMessage({ success: false, message: 'Unknown message type' });
      break;
  }
});

// cacheAudioFiles (inchangÃ©)
async function cacheAudioFiles(audioUrls) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const results = [];

  for (const url of audioUrls) {
    try {
      const existingResponse = await caches.match(url, { cacheNames: [CACHE_NAME, DYNAMIC_CACHE] });
      if (existingResponse) {
        log(`Audio already in cache, skipping precache: ${url}`);
        results.push({ url, success: true, status: 'Already cached' });
        continue;
      }

      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response.clone());
        results.push({ url, success: true, status: 'Cached' });
        log(`Audio pre-cached: ${url}`);
      } else {
        warn(`Failed to fetch audio for precaching: ${url} Status: ${response.status}`);
        results.push({ url, success: false, error: `HTTP ${response.status}` });
      }
    } catch (error) {
      results.push({ url, success: false, error: error.message });
      warn(`Failed to pre-cache audio (network error?): ${url}`, error.message);
    }
  }

  return results;
}

// clearAllCaches (inchangÃ©)
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  const appCacheNames = cacheNames.filter(name => name.startsWith('tyf-'));

  await Promise.all(
    appCacheNames.map(name => {
      log(`Deleting cache: ${name}`);
      return caches.delete(name);
    })
  );
  log("All application caches cleared.");
}

// Gestion erreurs globales (inchangÃ©)
self.addEventListener('error', event => {
  error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  error('Unhandled promise rejection:', event.reason);
});

// SystÃ¨me notifications (inchangÃ©)
async function scheduleNotification(title, body, delay = 86400000) {
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      log('Notification permission denied');
      return;
    }
  }

  if (Notification.permission === 'granted') {
    setTimeout(() => {
      self.registration.showNotification(title, {
        body: body,
        icon: './icons/icon-192x192.png',
        badge: './icons/icon-72x72.png',
        tag: 'daily-reminder',
        requireInteraction: false,
        silent: false
      });
    }, delay);

    log(`Notification scheduled: "${title}" in ${delay / 1000}s`);
  }
}

// Nettoie le cache dynamique (fichiers > 7 jours)
async function cleanOldDynamicCache() {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const requests = await cache.keys();
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 jours

    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const dateHeader = response.headers.get('date');
        const cacheDate = dateHeader ? new Date(dateHeader).getTime() : now;

        if (now - cacheDate > maxAge) {
          await cache.delete(request);
          log(`Cleaned old cache entry: ${request.url}`);
        }
      }
    }
  } catch (error) {
    warn('Cache cleanup failed:', error);
  }
}
// Message de chargement
log('Service Worker v3.0 loaded successfully - Test Your French ready! ðŸ‡«ðŸ‡·');