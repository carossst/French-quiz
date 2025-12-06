// js/config.js v3.0

const hostname = window.location.hostname;
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
const isGitHubPages = hostname.includes('github.io');

window.TYF_CONFIG = {
    version: "3.0",
    environment: isLocalhost ? "development" : (isGitHubPages ? "github-pages" : "production"),
    ga4Id: "G-MSVVBG559E",
    stripePaymentUrl: "https://buy.stripe.com/dRm5kD3g3cNocmq7Ig2Nq02",
    debug: {
        enabled: isLocalhost,
        logLevel: isLocalhost ? "debug" : "warn"
    },
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

window.resourceManagerConfig = {
    baseDataPath: './js/data/',
    cacheEnabled: !isLocalhost,
    audioCacheConfig: {
        maxSize: 50,            // Limite 50 fichiers audio en cache
        maxAge: 600000,         // 10 minutes de vie cache (600000ms)
        cleanupInterval: 300000 // Nettoyage automatique toutes les 5 minutes
    },
    timeoutConfig: {
        metadata: 8000,         // 8s timeout pour metadata.json
        quiz: 6000,             // 6s timeout pour quiz JSON  
        audio: 15000,           // 15s timeout pour fichiers MP3
        audioCheck: 3000        // 3s timeout pour verification existence audio
    }
};
