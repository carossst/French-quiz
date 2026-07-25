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

    // Waitlist / Early access (A1/A2 etc.) - ultra simple (mailto)
    // Tu reçois les demandes dans ta boîte, réponse manuelle au début.
    waitlist: {
        enabled: true,
        toEmail: "bonjour@testyourfrench.com",
        subjectPrefix: "[TYF Early Access]",
        topicLabel: "A1/A2-specific diagnostic"
    },

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
            dailyReminder: true,
            // Public by design (embedded client-side, same key sent to the
            // push service on every subscribe call). The matching private
            // key lives only in the push server's Cloudflare secrets.
            vapidPublicKey: "BLFmfN-qDruGto2Fztfy2hoiJ8hUx_4fT6zJxYAwPQzaFcXhRoljHcXHFtRyeK3ELOvgIZeQrwoYPr6HSPgs_f4",
            // TODO: replace with the real Worker URL after deploying
            // testyourfrench-push (see its README) - looks like
            // "https://testyourfrench-push.<subdomain>.workers.dev".
            subscribeUrl: "https://testyourfrench-push.example.workers.dev/subscribe",
            unsubscribeUrl: "https://testyourfrench-push.example.workers.dev/unsubscribe"
        }
    }
};

// ===============================
// TYF_BRAND – shared product claims
// ===============================
window.TYF_BRAND = window.TYF_BRAND || {
    creatorLine: "Created by Carole, a real French native from Paris. Includes native French audio. Not AI-generated."
};

// Auto-inject brand lines into static pages (index.html, success.html, etc.)
(function () {
    function applyBrandText() {
        try {
            var brand = window.TYF_BRAND || {};
            var text = String(brand.creatorLine || "").trim();
            if (!text) return;

            var nodes = document.querySelectorAll('[data-tyf-brand="creatorLine"]');
            if (!nodes || !nodes.length) return;

            nodes.forEach(function (el) {
                if (!el) return;
                el.textContent = text;
            });
        } catch (e) {
            // silent
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyBrandText);
    } else {
        applyBrandText();
    }
})();


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
// TYF_WORDING – shared UI copy
// ===============================
window.TYF_WORDING = window.TYF_WORDING || {
    premium: {
        ctaEnter: "Enter a premium code",
        ctaAlreadyHave: "I already have a code"
    }
};


// ===============================
// TYF_UTILS – shared helpers
// ===============================
window.TYF_UTILS = {
    normalizeText: function (s) {
        var str = String(s == null ? "" : s);

        // Fix UTF-8 mojibake (ex: "ÃŠtre" -> "Être")
        // Only run when markers appear to avoid unnecessary transforms
        if (/[ÃÂ]/.test(str)) {
            try {
                str = decodeURIComponent(escape(str));
            } catch (e) {
                // keep original if conversion fails
            }
        }

        return str
            .replace(/â€“|â€”|[–—]/g, "-")
            .replace(/[·•]/g, "|")
            .replace(/\u00A0/g, " ")
            .replace(/[’]/g, "'")
            .replace(/\s+/g, " ")
            .replace(/[“”]/g, '"')
            .trim();
    }
};


// ===============================
// GA4 - micro-conversion tracking
// (forwards the events already instrumented throughout the app to GA4;
// no-ops silently if gtag failed to load, e.g. ad/tracker blockers)
// ===============================
window.trackMicroConversion = function (eventName, payload) {
    try {
        if (typeof gtag !== "function" || !eventName) return;
        gtag("event", String(eventName), payload || {});
    } catch (e) {
        // silent
    }
};

window.initializeAnalyticsIfPremium = function (storageManager) {
    try {
        if (typeof gtag !== "function") return;
        var isPremium = !!(storageManager && typeof storageManager.isPremiumUser === "function" && storageManager.isPremiumUser());
        gtag("set", "user_properties", { premium_user: isPremium });
    } catch (e) {
        // silent
    }
};
