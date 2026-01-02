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
  warn: (...args) =>
    window.TYF_CONFIG?.debug?.enabled &&
    ["debug", "log", "warn"].includes(window.TYF_CONFIG.debug.logLevel) &&
    console.warn("[TYF Warning]", ...args),
  error: (...args) => console.error("[TYF Error]", ...args)
};


/**
 * showErrorMessage UNIQUE (évite les doubles définitions et les références cassées)
 * CSP-safe (pas d'inline handler)
 */
function showErrorMessage(message) {
  Logger.error(message);

  const existing = document.querySelector(".tyf-error-message");
  if (existing) existing.remove();

  const errorDiv = document.createElement("div");
  errorDiv.className =
    "tyf-error-message fixed top-5 left-1/2 transform -translate-x-1/2 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[10000] max-w-md text-center";
  errorDiv.setAttribute("role", "alert");
  errorDiv.setAttribute("aria-live", "assertive");

  const title = document.createElement("div");
  title.className = "font-bold mb-2";
  title.textContent = "⚠️ Error";

  const body = document.createElement("p");
  body.className = "text-sm mb-3";
  body.textContent = String(message || "Unknown error");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("data-close-overlay", "");
  btn.className =
    "bg-white text-red-600 px-3 py-1 rounded focus:outline-none focus:ring-2 focus:ring-white";
  btn.textContent = "Close";

  errorDiv.appendChild(title);
  errorDiv.appendChild(body);
  errorDiv.appendChild(btn);

  (document.getElementById("app-container") || document.body).appendChild(errorDiv);

  errorDiv.addEventListener("click", (e) => {
    const b = e.target.closest("[data-close-overlay]");
    if (b) {
      errorDiv.classList.add("tyf-error-message--out");
      setTimeout(() => errorDiv.remove(), 300);
    }
  });

  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.classList.add("tyf-error-message--out");
      setTimeout(() => errorDiv.remove(), 300);
    }
  }, 10000);
}


// Export global (utilisé partout)
window.showErrorMessage = showErrorMessage;


function initializeUXTracking() {
  try {
    if (window.TYF_CONFIG?.debug?.enabled) {
      const sessionTime = window.storageManager?.getSessionDuration?.();
      console.log("UX Session started -", sessionTime || 0, "minutes");
    }
  } catch (error) {
    console.warn("UX tracking failed:", error);
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

document.addEventListener("DOMContentLoaded", function () {
  Logger.log(
    `Initializing Test Your French v${window.TYF_CONFIG?.version || "2.6.0"} (${window.TYF_CONFIG?.environment || "unknown"})`
  );

  if (!validatePrerequisites() || !validateJavaScriptModules()) return;

  initServiceWorker();
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
  const requiredModules = ["StorageManager", "ResourceManager", "QuizManager", "UICore"];
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

    loadUserPreferences(quizManager, storageManager);
    setupGamificationEvents();

    Logger.debug("Managers initialized");

    const [metadata] = await Promise.all([resourceManager.loadMetadata(), uiCore.start()]);

    Logger.log(`Metadata loaded: ${metadata.themes?.length || 0} themes`);
    initializeAnalyticsIfPremium(storageManager);
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

function setupGamificationEvents() {
  cleanupGamificationEvents();

  const events = [
    ["badges-earned", handleBadgeEarned],
    ["fp-gained", handleFPGained],
    ["level-up", handleLevelUp],
    ["premium-unlocked", handlePremiumUnlocked]
  ];

  if (!window.TYF_EVENT_HANDLERS) window.TYF_EVENT_HANDLERS = [];

  // IMPORTANT: StorageManager dispatch avec window.dispatchEvent -> écouter sur window
  events.forEach(([eventName, handler]) => {
    window.addEventListener(eventName, handler);
    window.TYF_EVENT_HANDLERS.push({ eventName, handler });
  });

  Logger.debug("Gamification events setup");
}

function cleanupGamificationEvents() {
  if (window.TYF_EVENT_HANDLERS) {
    window.TYF_EVENT_HANDLERS.forEach(({ eventName, handler }) => {
      window.removeEventListener(eventName, handler);
    });
    window.TYF_EVENT_HANDLERS = [];
  }
}

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
