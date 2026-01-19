/*
 * main.js - v3.0 - Orchestrateur Principal
 */

const Logger = {
  debug: (...args) =>
    window.TYF_CONFIG?.debug?.enabled &&
    window.TYF_CONFIG.debug.logLevel === "debug" &&
    console.log("[TYF Debug]", ...args),

  log: (...args) =>
    window.TYF_CONFIG?.debug?.enabled &&
    ["debug", "log"].includes(window.TYF_CONFIG.debug.logLevel) &&
    console.log("[TYF]", ...args),

  // WARNINGS: toujours visibles (prod incluse)
  warn: (...args) =>
    (window.TYF_CONFIG?.debug?.enabled ||
      window.TYF_CONFIG?.environment === "staging") &&
    console.warn("[TYF Warning]", ...args),

  error: (...args) => console.error("[TYF Error]", ...args)
};

// Export global (utilisé par getLogger() dans les autres fichiers)
window.Logger = Logger;




function showErrorMessage(message) {
  const existing = document.querySelector(".tyf-global-error");
  if (existing) existing.remove();

  const errorDiv = document.createElement("div");
  // IMPORTANT: ne pas réutiliser feedback-content/incorrect (styles quiz)
  errorDiv.className = "tyf-global-error";
  errorDiv.setAttribute("role", "alert");
  errorDiv.setAttribute("aria-live", "assertive");

  // Layout overlay
  errorDiv.style.position = "fixed";
  errorDiv.style.top = "50%";
  errorDiv.style.left = "50%";
  errorDiv.style.transform = "translate(-50%, -50%)";
  errorDiv.style.zIndex = "var(--z-overlay)";
  errorDiv.style.maxWidth = "min(92%, 520px)";
  errorDiv.style.opacity = "1";

  // Lisibilité forcée (pas dépendant du CSS existant)
  errorDiv.style.background = "#fee2e2";
  errorDiv.style.color = "#7f1d1d";
  errorDiv.style.border = "1px solid #fecaca";
  errorDiv.style.borderRadius = "12px";
  errorDiv.style.padding = "14px 16px";
  errorDiv.style.boxShadow = "0 18px 50px rgba(0,0,0,0.18)";
  errorDiv.style.fontWeight = "600";
  errorDiv.style.lineHeight = "1.35";

  const body = document.createElement("div");
  body.textContent = String(message || "Unknown error");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tyf-btn-secondary";
  btn.style.marginTop = "0.75rem";
  btn.style.width = "100%";
  btn.textContent = "Close";
  btn.addEventListener("click", () => {
    errorDiv.style.opacity = "0";
    setTimeout(() => errorDiv.remove(), 200);
  });

  errorDiv.appendChild(body);
  errorDiv.appendChild(btn);

  (document.getElementById("app-container") || document.body).appendChild(errorDiv);

  setTimeout(() => {
    if (!errorDiv.parentNode) return;
    errorDiv.style.opacity = "0";
    setTimeout(() => errorDiv.remove(), 200);
  }, 10000);
}


// Export global (utilisé partout)
window.showErrorMessage = showErrorMessage;

/**
 * Service Worker registration (PWA)
 * À placer ici, AVANT DOMContentLoaded
 */
function initServiceWorker() {
  try {
    if (!("serviceWorker" in navigator)) {
      Logger.warn("Service Worker not supported");
      return;
    }

    window.addEventListener("load", function () {
      // Cache-bust SW script so browsers don't reuse an old sw.js from HTTP cache
      const v = encodeURIComponent(String(window.TYF_CONFIG?.version || "0"));

      // Root-domain PWA: always use absolute paths (avoids scope/path edge cases)
      const swUrl = `/sw.js?v=${v}`;

      navigator.serviceWorker
        .register(swUrl, {
          scope: "/",
          updateViaCache: "none" // critical: don't serve sw.js from cache
        })

        .then(function (registration) {
          Logger.log("✅ Service Worker registered:", registration.scope);

          // If there's a waiting SW, activate it immediately
          try {
            if (registration.waiting) {
              registration.waiting.postMessage({ type: "SKIP_WAITING" });
            }

            registration.addEventListener("updatefound", function () {
              const newWorker = registration.installing;
              if (!newWorker) return;

              newWorker.addEventListener("statechange", function () {
                if (newWorker.state === "installed") {
                  // New SW installed. If there's an existing controller, it's an update.
                  if (navigator.serviceWorker.controller) {
                    try {
                      registration.waiting &&
                        registration.waiting.postMessage({ type: "SKIP_WAITING" });
                    } catch { }
                  }
                }
              });
            });
          } catch { }

          // Reload once when the new SW takes control (ensures fresh assets)
          try {
            let reloaded = false;
            navigator.serviceWorker.addEventListener("controllerchange", function () {
              if (reloaded) return;

              // Only reload when we know we’re on the shell screen (avoid interrupting quizzes/modals)
              const isBusy =
                document.getElementById("sophie-paywall-modal") ||
                document.getElementById("premium-code-modal") ||
                document.getElementById("theme-preview-modal");

              if (isBusy) return;

              reloaded = true;
              window.location.reload();
            });
          } catch { }


          // Best effort: check updates hourly
          setInterval(function () {
            registration.update().catch(function () { });
          }, 60 * 60 * 1000);
        })
        .catch(function (err) {
          Logger.warn(
            "❌ Service Worker registration failed:",
            err && err.message ? err.message : err
          );
        });
    });
  } catch (e) {
    Logger.warn("Service Worker init failed:", e);
  }
}



// Exposition globale (cohérence avec le reste de main.js)
window.initServiceWorker = initServiceWorker;


function initializeUXTracking() {
  try {
    if (window.TYF_CONFIG?.debug?.enabled) {
      const sessionTime = window.storageManager?.getSessionDuration?.();
      Logger.debug("UX Session started -", sessionTime || 0, "minutes");
    }
  } catch (error) {
    Logger.warn("UX tracking failed:", error);
  }
}


window.addEventListener("error", (event) => {
  Logger.error("Global error:", event.error || event);
  const isDev = window.TYF_CONFIG?.debug?.enabled;
  const errorMsg = event.message || event.error?.message || "Unknown error";
  window.showErrorMessage(
    isDev
      ? `JavaScript Error: ${errorMsg}`
      : "Unable to load French assessment. Please refresh the page."
  );
});

window.addEventListener("unhandledrejection", (event) => {
  Logger.error("Unhandled promise rejection:", event.reason);
  const isDev = window.TYF_CONFIG?.debug?.enabled;
  const errorMsg = event.reason?.message || "Promise rejection";
  window.showErrorMessage(
    isDev
      ? `Promise Error: ${errorMsg}`
      : "An unexpected issue occurred. Please refresh the page."
  );
});

// PWA – Service Worker (appel indispensable)
// Doit être appelé dès que main.js est évalué (évite toute course)
initServiceWorker();

document.addEventListener("DOMContentLoaded", function () {
  Logger.log(
    `Initializing Test Your French v${window.TYF_CONFIG?.version || "2.6.0"} (${window.TYF_CONFIG?.environment || "unknown"})`
  );

  if (!validatePrerequisites() || !validateJavaScriptModules()) return;

  // Binder le lien Stripe du header depuis la config (source unique)
  try {
    const btn = document.getElementById("premium-unlock-btn");
    const stripeUrl = window.TYF_CONFIG?.stripePaymentUrl;

    const isValidStripeUrl =
      typeof stripeUrl === "string" &&
      stripeUrl.startsWith("https://buy.stripe.com/");

    if (btn && isValidStripeUrl) {
      btn.setAttribute("href", stripeUrl);
      // même onglet pour cohérence app
      btn.removeAttribute("target");
      btn.removeAttribute("rel");
    } else if (btn && stripeUrl && !isValidStripeUrl) {
      Logger.warn("Invalid Stripe payment URL in TYF_CONFIG");
      // ne pas écraser le fallback HTML
    } else if (btn && !stripeUrl) {
      Logger.warn("Stripe payment URL missing in TYF_CONFIG");
      // ne pas écraser le fallback HTML
    }
  } catch (e) {
    Logger.warn("Stripe header binding failed", e);
  }

  startApplication();
});



function validatePrerequisites() {
  if (!window.TYF_CONFIG) {
    Logger.error("TYF_CONFIG not found");
    window.showErrorMessage("Configuration error: Application settings not loaded.");
    return false;
  }

  if (!window.localStorage) {
    Logger.error("localStorage not supported");
    window.showErrorMessage("Your browser doesn't support local storage. Please use a modern browser.");
    return false;
  }

  const appContainer = document.getElementById("app-container");
  if (!appContainer) {
    Logger.error("App container not found");
    window.showErrorMessage("Critical error: App container not found.");
    return false;
  }

  return true;
}

function validateJavaScriptModules() {
  const requiredModules = ["StorageManager", "ResourceManager", "QuizManager", "UICore", "UIFeatures"];
  const missing = requiredModules.filter((name) => !window[name]);

  if (missing.length > 0) {
    Logger.error(`Missing modules: ${missing.join(", ")}`);
    window.showErrorMessage(
      `Unable to load assessment components: ${missing.join(", ")}. Please refresh the page.`
    );
    return false;
  }
  return true;
}



async function startApplication() {
  const appContainer = document.getElementById("app-container");

  showLoadingScreen(appContainer);

  let storageManager, resourceManager, quizManager, uiCore;

  try {
    storageManager = new window.StorageManager();
    // IMPORTANT: exposer pour le reste du code (UX tracking, debug, etc.)
    window.storageManager = storageManager;

    initializeUXTracking();

    resourceManager = new window.ResourceManager();
    quizManager = new window.QuizManager(resourceManager, storageManager, null);
    uiCore = new window.UICore(quizManager, appContainer, resourceManager, storageManager);
    quizManager.ui = uiCore;

    // Gamification events are handled inside UIFeatures (single source of truth)


    if (typeof window.loadUserPreferences === "function") {
      window.loadUserPreferences(quizManager, storageManager);
    } else {
      Logger.warn("loadUserPreferences is not defined - using defaults");
    }


    Logger.debug("Managers initialized");

    await uiCore.start();

    // si tu veux garder le log, récupère depuis uiCore.themeIndexCache
    Logger.log(`Metadata loaded: ${uiCore.themeIndexCache?.length || 0} themes`);

    if (typeof window.initializeAnalyticsIfPremium === "function") {
      window.initializeAnalyticsIfPremium(storageManager);
    } else {
      Logger.warn("initializeAnalyticsIfPremium not defined – analytics skipped");
    }

    Logger.log("✅ Application started successfully");

    if (window.trackMicroConversion) {
      const hasExistingData = localStorage.getItem("frenchQuizProgress");
      if (hasExistingData) window.trackMicroConversion("return_visit");
    }
  } catch (error) {
    Logger.error("Startup error:", error);
    window.showErrorMessage(
      `Unable to load French assessment data. Please check your connection and refresh. Error: ${error.message}`
    );
  }
}

// (removed) Gamification event wiring lives in UIFeatures to avoid globals and duplicate listeners


// supprimé : cleanupGamificationEvents (code mort)
// la gestion des events gamification est dans UIFeatures


if (window.TYF_CONFIG?.debug?.enabled) {
  window.TYF_DEBUG = {
    Logger,
    showErrorMessage: window.showErrorMessage,
    config: window.TYF_CONFIG,
    get ResourceManager() {
      return (
        window.RM_DEBUG || {
          status: "ResourceManager debug tools not loaded yet",
          note: "RM_DEBUG will be available after ResourceManager initialization"
        }
      );
    }
  };
}


// Afficher l'ecran de chargement
function showLoadingScreen(container) {
  container.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
      <div class="text-center">
        <div class="text-6xl mb-6 animate-bounce">🇫🇷</div>
        <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
        <h2 class="text-xl font-bold text-gray-800 mb-2">Loading Test Your French...</h2>
        <p class="text-gray-600">Preparing your authentic French assessment</p>
      </div>
    </div>`;
}
