// config.js v3.0 - Configuration globale Test Your French

const hostname = window.location.hostname;
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
const isGitHubPages = hostname.includes('github.io');

window.TYF_CONFIG = {
    version: "3.0",
    environment: isLocalhost
        ? "development"
        : (isGitHubPages ? "github-pages" : "production"),

    // Analytics
    ga4Id: "G-MSVVBG559E",

    // Stripe Checkout - achat tous thèmes
    stripePaymentUrl: "https://buy.stripe.com/cNi00jeYLeVwcmq3s02Nq03",

    // Mode debug uniquement en local
    debug: {
        enabled: isLocalhost,
        logLevel: isLocalhost ? "debug" : "warn"
    },

    // Service Worker / PWA
    serviceWorker: {
        enabled: !isLocalhost,
        autoUpdate: true,
        showUpdateNotifications: true,
        notifications: {
            enabled: true,
            dailyReminder: true
        }
    }
};

// Configuration ResourceManager
window.resourceManagerConfig = {
    // IMPORTANT : tous les JSON sont à la racine
    // metadata.json, quiz_XXX.json, etc. → "./..."
    baseDataPath: './',

    cacheEnabled: !isLocalhost,

    audioCacheConfig: {
        maxSize: 50,            // Limite 50 fichiers audio en cache
        maxAge: 600000,         // 10 minutes (600000 ms)
        cleanupInterval: 300000 // Nettoyage automatique toutes les 5 minutes
    },

    timeoutConfig: {
        metadata: 8000,         // 8s timeout pour metadata.json
        quiz: 6000,             // 6s timeout pour quiz JSON
        audio: 15000,           // 15s timeout pour fichiers MP3
        audioCheck: 3000        // 3s timeout pour vérification existence audio
    }
};

// ===============================
// TYF_UTILS – shared helpers
// ===============================
window.TYF_UTILS = {
    normalizeText: function (s) {
        return String(s || "")
            .replace(/â€“|â€”|[–—]/g, "-")
            .replace(/[·•]/g, "|")
            .replace(/\u00A0/g, " ")
            .replace(/[’]/g, "'")
            .replace(/\s+/g, " ")
            .replace(/[“”]/g, '"')
            .trim();
    }
};
