/*
 * main.js - v3.0 - Orchestrateur Principal
 */

const Logger = {
  debug: (...args) => window.TYF_CONFIG?.debug?.enabled && window.TYF_CONFIG.debug.logLevel === 'debug' && console.log('[TYF Debug]', ...args),
  log: (...args) => window.TYF_CONFIG?.debug?.enabled && ['debug', 'log'].includes(window.TYF_CONFIG.debug.logLevel) && console.log('[TYF]', ...args),
  warn: (...args) => window.TYF_CONFIG?.debug?.enabled && ['debug', 'log', 'warn'].includes(window.TYF_CONFIG.debug.logLevel) && console.warn('[TYF Warning]', ...args),
  error: (...args) => console.error('[TYF Error]', ...args)
};

(function () {
  const originalShowErrorMessage = window.showErrorMessage;
  window.showErrorMessage = function (message) {
    console.error("Intercepted showErrorMessage:", message);
    // console.trace(); // Disabled for CSP compliance
    if (originalShowErrorMessage) {
      originalShowErrorMessage(message);
    }
  };
})();


function initializeUXTracking() {
  try {
    if (window.TYF_CONFIG?.debug?.enabled) {
      const sessionTime = window.storageManager?.getSessionDuration?.();
      console.log('“Š UX Session started -', sessionTime || 0, 'minutes');
    }
  } catch (error) {
    console.warn('UX tracking failed:', error);
  }
}
function track(event, data) {
  const events = JSON.parse(localStorage.getItem('tyf_events') || '[]');
  events.push({
    event: event,
    data: data || {},
    timestamp: new Date().toISOString(),
    sessionId: sessionStorage.getItem('sessionId') || Date.now().toString()
  });
  localStorage.setItem('tyf_events', JSON.stringify(events));
  console.log('“Š Tracked:', event, data);
}

window.addEventListener('error', (event) => {
  Logger.error('Global error:', event.error || event);
  const isDev = window.TYF_CONFIG?.debug?.enabled;
  const errorMsg = event.message || event.error?.message || 'Unknown error';
  showErrorMessage(isDev ? `JavaScript Error: ${errorMsg}` : "Unable to load French assessment. Please refresh the page.");
});

window.addEventListener('unhandledrejection', (event) => {
  Logger.error('Unhandled promise rejection:', event.reason);
  const isDev = window.TYF_CONFIG?.debug?.enabled;
  const errorMsg = event.reason?.message || 'Promise rejection';
  showErrorMessage(isDev ? `Promise Error: ${errorMsg}` : "An unexpected issue occurred. Please refresh the page.");
});

document.addEventListener('DOMContentLoaded', function () {
  Logger.log(`Initializing Test Your French v${window.TYF_CONFIG?.version || '2.6.0'} (${window.TYF_CONFIG?.environment || 'unknown'})`);

  if (!validatePrerequisites() || !validateJavaScriptModules()) return;

  initServiceWorker();
  startApplication();
});

function validatePrerequisites() {
  if (!window.TYF_CONFIG) {
    Logger.error("TYF_CONFIG not found");
    showErrorMessage("Configuration error: Application settings not loaded.");
    return false;
  }

  if (!window.localStorage) {
    Logger.error("localStorage not supported");
    showErrorMessage("Your browser doesn't support local storage. Please use a modern browser.");
    return false;
  }

  const appContainer = document.getElementById('app-container');
  if (!appContainer) {
    Logger.error("App container not found");
    showErrorMessage("Critical error: App container not found.");
    return false;
  }

  return true;
}


function validateJavaScriptModules() {
  const requiredModules = ['StorageManager', 'ResourceManager'];
  const missing = requiredModules.filter(name => !window[name]);

  if (missing.length > 0) {
    Logger.error(`Missing modules: ${missing.join(', ')}`);
    showErrorMessage(`Unable to load assessment components: ${missing.join(', ')}. Please refresh the page.`);
    return false;
  }
  return true;
}

/**
 * Tracker les micro-conversions sans impact UX
 */
window.trackMicroConversion = function (action, details = {}) {
  const events = {
    'quiz_completed': 'Quiz termine',
    'premium_preview': 'Apercu premium vu',
    'fp_earned': 'Points gagnes',
    'return_visit': 'Retour utilisateur',
    'theme_clicked': 'Theme explore'
  };

  // Envoi a GA4 (si premium user et GA4 active)
  if (window.gtag && window.ga4Initialized) {
    gtag('event', action, {
      'event_category': 'Engagement',
      'event_label': events[action] || action,
      'custom_parameters': details
    });
  }

  // Stockage local pour scoring engagement
  try {
    let score = JSON.parse(localStorage.getItem('engagementScore') || '{}');
    score[action] = (score[action] || 0) + 1;
    score.lastAction = new Date().toISOString();
    score.totalActions = (score.totalActions || 0) + 1;
    localStorage.setItem('engagementScore', JSON.stringify(score));
  } catch (error) {
    console.warn('Tracking error:', error);
  }
};

async function startApplication() {
  const appContainer = document.getElementById('app-container');

  // Afficher loader tout de suite
  showLoadingScreen(appContainer);

  let storageManager, resourceManager, quizManager, uiCore;

  try {
    // Initialiser tout en meme temps
    storageManager = new window.StorageManager();
    initializeUXTracking();
    resourceManager = new window.ResourceManager();
    quizManager = new window.QuizManager(resourceManager, storageManager, null);
    uiCore = new window.UICore(quizManager, appContainer, resourceManager, storageManager);
    quizManager.ui = uiCore;

    loadUserPreferences(quizManager, storageManager);
    setupGamificationEvents();

    Logger.debug("Managers initialized");

    // Charger metadonnees ET demarrer UI en meme temps
    const [metadata] = await Promise.all([
      resourceManager.loadMetadata(),
      uiCore.start()
    ]);

    Logger.log(`Metadata loaded: ${metadata.themes?.length || 0} themes`);
    initializeAnalyticsIfPremium(storageManager);
    Logger.log("âœ… Application started successfully");


    // Tracker les retours d'utilisateurs
    if (window.trackMicroConversion) {
      const hasExistingData = localStorage.getItem('frenchQuizProgress');
      if (hasExistingData) {
        window.trackMicroConversion('return_visit');
      }
    }

  } catch (error) {
    Logger.error("Startup error:", error);
    showErrorMessage(`Unable to load French assessment data. Please check your connection and refresh. Error: ${error.message}`);
  }
}



function loadUserPreferences(quizManager, storageManager) {
  try {
    quizManager.timerEnabled = storageManager.getTimerPreference();
    Logger.debug(`Timer preference: ${quizManager.timerEnabled}`);
  } catch (error) {
    Logger.warn("Failed to load preferences:", error);
    quizManager.timerEnabled = true;
  }
}

function setupGamificationEvents() {
  cleanupGamificationEvents();

  const events = [
    ['badges-earned', handleBadgeEarned],
    ['fp-gained', handleFPGained],
    ['level-up', handleLevelUp],
    ['premium-unlocked', handlePremiumUnlocked]
  ];

  // Initialiser le tableau si necessaire
  if (!window.TYF_EVENT_HANDLERS) window.TYF_EVENT_HANDLERS = [];

  // UNE SEULE FOIS le forEach
  events.forEach(([eventName, handler]) => {
    document.addEventListener(eventName, handler);
    // Garder la reference pour cleanup
    window.TYF_EVENT_HANDLERS.push({ eventName, handler });
  });

  Logger.debug("Gamification events setup");
}

function cleanupGamificationEvents() {
  if (window.TYF_EVENT_HANDLERS) {
    window.TYF_EVENT_HANDLERS.forEach(({ eventName, handler }) => {
      document.removeEventListener(eventName, handler);
    });
    window.TYF_EVENT_HANDLERS = [];
  }
}

function handleBadgeEarned(event) {
  const badges = event.detail?.badges;
  if (badges?.length) {
    showNotification('badges', badges.length === 1 ? `… Badge earned: ${badges[0]}` : `… ${badges.length} badges earned!`);
  }
}

function handleFPGained(event) {
  if (event.detail?.amount) {
    updateXPHeaderIfVisible();
  }
}

function handleLevelUp(event) {
  if (event.detail?.newLevel) {
    showNotification('level-up', `Ž‰ Level Up! You reached level ${event.detail.newLevel}!`);
  }
}

function handlePremiumUnlocked(event) {
  showNotification('premium', '”“ Premium unlocked! All themes available!');
}

function initializeAnalyticsIfPremium(storageManager) {
  try {
    if (storageManager.isPremiumUser() && window.initGA4) {
      window.initGA4();
      Logger.debug("GA4 initialized for premium user");
    } else {
      Logger.debug("GA4 skipped - privacy-first approach");
    }
  } catch (error) {
    Logger.warn("Analytics initialization error:", error);
  }
}

function updateXPHeaderIfVisible() {
  const xpHeader = document.getElementById('xp-header');
  if (xpHeader && !xpHeader.classList.contains('hidden')) {
    window.dispatchEvent(new CustomEvent('storage-updated'));
  }
}

function showNotification(type, message) {
  const container = document.getElementById('badges-notification');
  if (!container) return;

  const colors = {
    badges: 'bg-green-500',
    'level-up': 'bg-yellow-500',
    premium: 'bg-purple-500'
  };

  const notification = document.createElement('div');
  notification.className = `${colors[type] || 'bg-blue-500'} text-white p-3 rounded-md shadow-lg mb-2 transform transition-all duration-300`;
  notification.setAttribute('role', 'status');
  notification.setAttribute('aria-live', 'polite');
  notification.innerHTML = `<div class="font-bold text-sm">${message}</div>`;

  container.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('translate-y-full', 'opacity-0');
    setTimeout(() => notification.remove(), 300);
  }, type === 'premium' ? 6000 : 4000);
}

function initServiceWorker() {
  if (!window.TYF_CONFIG?.serviceWorker?.enabled || !('serviceWorker' in navigator)) {
    Logger.debug("Service Worker disabled or unsupported");
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      Logger.debug('ServiceWorker registered:', registration.scope);

      if (window.TYF_CONFIG.serviceWorker.showUpdateNotifications) {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              if (confirm('New version available. Update now?')) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
                window.location.reload();
              }
            }
          });
        });
      }
    } catch (error) {
      Logger.warn('ServiceWorker registration failed:', error);
    }
  });
}

window.showErrorMessage = function (message) {
  Logger.error(message);

  const existing = document.querySelector('.tyf-error-message');
  if (existing) existing.remove();

  const errorDiv = document.createElement('div');
  errorDiv.className = 'tyf-error-message fixed top-5 left-1/2 transform -translate-x-1/2 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[10000] max-w-md text-center';
  errorDiv.setAttribute('role', 'alert');
  errorDiv.setAttribute('aria-live', 'assertive');

  errorDiv.innerHTML = `
  <div class="font-bold mb-2">âš ï¸ Error</div>
  <p class="text-sm mb-3">${message}</p>
  <button data-close-overlay class="bg-white text-red-600 px-3 py-1 rounded focus:outline-none focus:ring-2 focus:ring-white">Close</button>
`;

  (document.getElementById('app-container') || document.body).appendChild(errorDiv);

  // Fermeture (CSP-safe)
  errorDiv.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-close-overlay]');
    if (btn) {
      errorDiv.classList.add('tyf-error-message--out');
      setTimeout(() => errorDiv.remove(), 300);
    }
  });

  // Auto-dismiss
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.classList.add('tyf-error-message--out');
      setTimeout(() => errorDiv.remove(), 300);
    }
  }, 10000);

}

if (window.TYF_CONFIG?.debug?.enabled) {
  window.TYF_DEBUG = {
    Logger,
    showErrorMessage,
    config: window.TYF_CONFIG,
    // NOUVEAU v2.6.0: Integration ResourceManager debug tools
    get ResourceManager() {
      // Lazy getter pour eviter probleme d'ordre de chargement
      return window.RM_DEBUG || {
        status: 'ResourceManager debug tools not loaded yet',
        note: 'RM_DEBUG will be available after ResourceManager initialization'
      };
    }
  };
}
window.showErrorMessage = showErrorMessage;




// Afficher l'ecran de chargement
function showLoadingScreen(container) {
  container.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
      <div class="text-center">
        <div class="text-6xl mb-6 animate-bounce">‡«‡·</div>
        <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
        <h2 class="text-xl font-bold text-gray-800 mb-2">Loading Test Your French...</h2>
        <p class="text-gray-600">Preparing your authentic French assessment</p>
      </div>
    </div>`;
}