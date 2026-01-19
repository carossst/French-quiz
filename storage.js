// storage.js - Version 3.0

// Daily chest — règle simple et fixe
const DAILY_REWARD_BASE = 1;

// Désactivation totale des mécaniques annexes
const DAILY_REWARD_STREAK_MULTIPLIER = 0;
const DAILY_REWARD_STREAK_BONUS_MAX = 0;
const DAILY_REWARD_BONUS_AMOUNT = 0;
const DAILY_REWARD_BONUS_CHANCE = 0;



//================================================================================
// REGION: CORE DATA MANAGEMENT
//================================================================================

// Renomme pour eviter le conflit avec l'API Web "StorageManager"
function StorageManager() {
  this.storageKey = "frenchQuizProgress";
  this.initialized = false;

  // APRES (storage.js - Version 3.0) — ajoute un bloc analytics KISS (gratuit, local)
  this.defaultData = {
    frenchPoints: 0,
    isPremiumUser: false,
    unlockedQuizzes: [101, 102, 103, 104, 105],
    lastDailyReward: null,     // compat legacy ISO
    lastDailyRewardAt: 0,      // source de vérité (timestamp)
    themeStats: {},
    streak: { lastActiveDate: null, count: 0, bestStreak: 0 },
    badges: [],
    history: [],
    settings: { timerEnabled: true },
    globalStats: {
      totalTimeSpent: 0,
      totalQuestions: 0,
      totalCorrect: 0,
      firstQuizDate: null,
      lastQuizDate: null
    },
    fpStats: {
      totalEarned: 0,
      totalSpent: 0,
      perfectQuizCount: 0,
      dailyRewardsCount: 0,
      streakDays: 0,
      sources: {
        quiz_completion: 0,
        perfect_quiz: 0,
        daily_reward: 0,
        premium_unlock: 0,
        other: 0
      }
    },

    // Analytics KISS (local only)
    analytics: {
      appLoads: 0,
      sessions: 0,
      lastSessionAt: 0,
      quizzesStarted: 0,
      quizzesCompleted: 0,
      quizzesAbandoned: 0,
      totalQuizTimeSec: 0,
      paywallShown: 0,
      paywallClicked: 0,
      premiumUnlocked: 0,
      activeDays: [],
      lastActiveDay: ""
    },

    // Dans defaultData (conversionTracking)
    conversionTracking: {
      sessionStart: 0,
      lastSeenAt: 0, // NEW: permet de découper de vraies sessions
      premiumQuizCompleted: 0,
      paywallShown: false,
      paywallShownCount: 0,
      lastPaywallShownAt: null,
      lastPaywallSource: null,
      totalQuizAttempted: 0,
      conversionClickedAt: null,
      lastQuizAttempt: { themeId: null, quizId: null, at: 0 },
      events: []
    },




    userProfile: {
      email: null,
      firstName: null,
      isAnonymous: true,
      registeredAt: null
    }
  };


  // Lance l'init ici (dans le constructeur)
  this.init();
}

StorageManager.prototype.init = function () {
  try {
    const saved = localStorage.getItem(this.storageKey);
    this.data = saved
      ? JSON.parse(saved)
      : JSON.parse(JSON.stringify(this.defaultData));

    // Assurer compatibilite avec anciennes versions
    this.ensureDataStructure();

    // Tracking session (après ensureDataStructure pour robustesse legacy)
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min
    const nowTs = Date.now();

    if (!this.data.conversionTracking || typeof this.data.conversionTracking !== "object") {
      this.data.conversionTracking = JSON.parse(
        JSON.stringify(this.defaultData.conversionTracking)
      );
    }

    const ct = this.data.conversionTracking;

    ct.sessionStart = Number(ct.sessionStart);
    if (!Number.isFinite(ct.sessionStart)) ct.sessionStart = 0;

    ct.lastSeenAt = Number(ct.lastSeenAt);
    if (!Number.isFinite(ct.lastSeenAt)) ct.lastSeenAt = 0;

    const isFirstSession = ct.sessionStart === 0;
    const isExpiredSession =
      ct.lastSeenAt > 0 && (nowTs - ct.lastSeenAt) > SESSION_TIMEOUT_MS;

    // Nouvelle session si 1ère fois OU si inactivité > seuil
    const isNewSession = isFirstSession || isExpiredSession;

    if (isNewSession) {
      ct.sessionStart = nowTs;
    }

    // Toujours mettre à jour lastSeenAt à l’ouverture
    ct.lastSeenAt = nowTs;

    // Analytics KISS (local only)
    if (typeof this.ensureAnalyticsStructure === "function") {
      this.ensureAnalyticsStructure();
    }
    if (this.data.analytics) {
      this.data.analytics.appLoads = Number(this.data.analytics.appLoads) || 0;
      this.data.analytics.appLoads += 1;

      if (isNewSession) {
        this.data.analytics.sessions = Number(this.data.analytics.sessions) || 0;
        this.data.analytics.sessions += 1;
        this.data.analytics.lastSessionAt = nowTs;
      }

      if (typeof this._touchAnalyticsActiveDay === "function") {
        this._touchAnalyticsActiveDay();
      }
    }



    this.initialized = true;
    this.save();
    if (window.TYF_CONFIG?.debug?.enabled) {
      console.log("StorageManager v3.0 initialized");
    }

  } catch (error) {
    console.error("Storage init failed:", error);
    this.data = JSON.parse(JSON.stringify(this.defaultData));
    this.initialized = true;
    this.save();
  }
};

StorageManager.prototype.ensureDataStructure = function () {
  // Durcir primitives (évite NaN / string)
  const fp = Number(this.data && this.data.frenchPoints);
  this.data.frenchPoints = Number.isFinite(fp) ? fp : 0;

  this.data.isPremiumUser = !!(this.data && this.data.isPremiumUser);

  // Arrays / objects critiques
  if (!Array.isArray(this.data.unlockedQuizzes)) {
    this.data.unlockedQuizzes = JSON.parse(JSON.stringify(this.defaultData.unlockedQuizzes));
  } else {
    // normaliser en nombres pour éviter includes() foireux si strings
    this.data.unlockedQuizzes = this.data.unlockedQuizzes
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x));
  }

  if (!this.data.themeStats || typeof this.data.themeStats !== "object" || Array.isArray(this.data.themeStats)) {
    this.data.themeStats = {};
  }


  if (!this.data.streak || typeof this.data.streak !== "object") {
    this.data.streak = JSON.parse(JSON.stringify(this.defaultData.streak));
  }
  if (typeof this.data.streak.lastActiveDate !== "string" && this.data.streak.lastActiveDate !== null) {
    this.data.streak.lastActiveDate = null;
  }
  if (typeof this.data.streak.count !== "number") this.data.streak.count = 0;
  if (typeof this.data.streak.bestStreak !== "number") this.data.streak.bestStreak = 0;

  if (!Array.isArray(this.data.badges)) {
    this.data.badges = [];
  }

  if (!Array.isArray(this.data.history)) {
    this.data.history = [];
  }

  if (!this.data.settings || typeof this.data.settings !== "object") {
    this.data.settings = JSON.parse(JSON.stringify(this.defaultData.settings));
  }

  // Stats objects
  if (!this.data.fpStats || typeof this.data.fpStats !== "object") {
    this.data.fpStats = JSON.parse(JSON.stringify(this.defaultData.fpStats));
  }

  const fpStats = this.data.fpStats;

  // numériques
  fpStats.totalEarned = Number(fpStats.totalEarned);
  fpStats.totalSpent = Number(fpStats.totalSpent);
  fpStats.perfectQuizCount = Number(fpStats.perfectQuizCount);
  fpStats.dailyRewardsCount = Number(fpStats.dailyRewardsCount);
  fpStats.streakDays = Number(fpStats.streakDays);

  if (!Number.isFinite(fpStats.totalEarned)) fpStats.totalEarned = 0;
  if (!Number.isFinite(fpStats.totalSpent)) fpStats.totalSpent = 0;
  if (!Number.isFinite(fpStats.perfectQuizCount)) fpStats.perfectQuizCount = 0;
  if (!Number.isFinite(fpStats.dailyRewardsCount)) fpStats.dailyRewardsCount = 0;
  if (!Number.isFinite(fpStats.streakDays)) fpStats.streakDays = 0;

  // sources (compat)
  if (!fpStats.sources || typeof fpStats.sources !== "object") {
    fpStats.sources = JSON.parse(JSON.stringify(this.defaultData.fpStats.sources));
  }
  ["quiz_completion", "perfect_quiz", "daily_reward", "premium_unlock", "other"].forEach((k) => {
    fpStats.sources[k] = Number(fpStats.sources[k]);
    if (!Number.isFinite(fpStats.sources[k])) fpStats.sources[k] = 0;
  });


  // Durcir champs optionnels fpStats
  if (fpStats._lastDailyRewardDayKey !== undefined && typeof fpStats._lastDailyRewardDayKey !== "string") {
    delete fpStats._lastDailyRewardDayKey;
  }



  if (!this.data.globalStats || typeof this.data.globalStats !== "object") {
    this.data.globalStats = JSON.parse(JSON.stringify(this.defaultData.globalStats));
  }
  // Durcir champs numériques (évite NaN)
  if (typeof this.data.globalStats.totalTimeSpent !== "number") this.data.globalStats.totalTimeSpent = 0;
  if (typeof this.data.globalStats.totalQuestions !== "number") this.data.globalStats.totalQuestions = 0;
  if (typeof this.data.globalStats.totalCorrect !== "number") this.data.globalStats.totalCorrect = 0;
  if (this.data.globalStats.firstQuizDate === undefined) this.data.globalStats.firstQuizDate = null;
  if (this.data.globalStats.lastQuizDate === undefined) this.data.globalStats.lastQuizDate = null;

  if (!this.data.userProfile || typeof this.data.userProfile !== "object") {
    this.data.userProfile = JSON.parse(JSON.stringify(this.defaultData.userProfile));
  }

  // Daily reward: source de vérité = lastDailyRewardAt (number)
  if (typeof this.data.lastDailyRewardAt !== "number" || !Number.isFinite(this.data.lastDailyRewardAt)) {
    this.data.lastDailyRewardAt = 0;
  }

  // Migration legacy: tyf:lastDailyRewardAt -> data.lastDailyRewardAt (une seule fois)
  if (!this.data.lastDailyRewardAt) {
    try {
      const legacy = Number(localStorage.getItem("tyf:lastDailyRewardAt") || 0);
      if (Number.isFinite(legacy) && legacy > 0) {
        this.data.lastDailyRewardAt = legacy;
        this.data.lastDailyReward = new Date(legacy).toISOString();
        localStorage.removeItem("tyf:lastDailyRewardAt");
      }
    } catch { }
  }

  // Compat ISO legacy (string ou null)
  if (this.data.lastDailyReward !== null && typeof this.data.lastDailyReward !== "string") {
    this.data.lastDailyReward = null;
  }


  // Durcir quizCache si présent
  if (!this.data.quizCache || typeof this.data.quizCache !== "object") {
    this.data.quizCache = {};
  }



  // Conversion tracking + champs optionnels
  if (!this.data.conversionTracking || typeof this.data.conversionTracking !== "object") {
    this.data.conversionTracking = JSON.parse(JSON.stringify(this.defaultData.conversionTracking));
  }

  // Dans ensureDataStructure() (conversionTracking)
  const ct = this.data.conversionTracking;

  // Durcir booleans/numbers
  ct.paywallShown = !!ct.paywallShown;

  ct.sessionStart = Number(ct.sessionStart);
  if (!Number.isFinite(ct.sessionStart)) ct.sessionStart = 0;

  ct.lastSeenAt = Number(ct.lastSeenAt);
  if (!Number.isFinite(ct.lastSeenAt)) ct.lastSeenAt = 0;


  ct.premiumQuizCompleted = Number(ct.premiumQuizCompleted);
  if (!Number.isFinite(ct.premiumQuizCompleted)) ct.premiumQuizCompleted = 0;

  ct.totalQuizAttempted = Number(ct.totalQuizAttempted);
  if (!Number.isFinite(ct.totalQuizAttempted)) ct.totalQuizAttempted = 0;

  if (ct.conversionClickedAt === undefined) ct.conversionClickedAt = null;

  ct.paywallShownCount = Number(ct.paywallShownCount);
  if (!Number.isFinite(ct.paywallShownCount)) ct.paywallShownCount = 0;

  if (ct.lastPaywallShownAt === undefined) ct.lastPaywallShownAt = null;
  if (ct.lastPaywallShownAt !== null) {
    const ts = Number(ct.lastPaywallShownAt);
    ct.lastPaywallShownAt = Number.isFinite(ts) ? ts : null;
  }

  if (ct.lastPaywallSource === undefined) ct.lastPaywallSource = null;
  if (ct.lastPaywallSource !== null && typeof ct.lastPaywallSource !== "string") ct.lastPaywallSource = null;

  if (!Array.isArray(ct.events)) ct.events = [];

  if (!ct.lastQuizAttempt || typeof ct.lastQuizAttempt !== "object") {
    ct.lastQuizAttempt = JSON.parse(JSON.stringify(this.defaultData.conversionTracking.lastQuizAttempt));
  }
  ct.lastQuizAttempt.themeId = (ct.lastQuizAttempt.themeId === null) ? null : Number(ct.lastQuizAttempt.themeId);
  ct.lastQuizAttempt.quizId = (ct.lastQuizAttempt.quizId === null) ? null : Number(ct.lastQuizAttempt.quizId);
  ct.lastQuizAttempt.at = Number(ct.lastQuizAttempt.at);

  if (ct.lastQuizAttempt.themeId !== null && !Number.isFinite(ct.lastQuizAttempt.themeId)) ct.lastQuizAttempt.themeId = null;
  if (ct.lastQuizAttempt.quizId !== null && !Number.isFinite(ct.lastQuizAttempt.quizId)) ct.lastQuizAttempt.quizId = null;
  if (!Number.isFinite(ct.lastQuizAttempt.at)) ct.lastQuizAttempt.at = 0;

  // Analytics KISS (compat + durcissement)
  if (typeof this.ensureAnalyticsStructure === "function") {
    this.ensureAnalyticsStructure();
  }

};




StorageManager.prototype.save = function () {
  if (!this.initialized) return false;

  try {
    let dataString = JSON.stringify(this.data);

    // Verification taille avant sauvegarde
    if (dataString.length > 5 * 1024 * 1024) {
      console.warn("Storage data too large, attempting cleanup...");
      this.cleanupOldData();
      // Recalculer après cleanup (sinon on réécrit l’ancien payload)
      dataString = JSON.stringify(this.data);
    }

    localStorage.setItem(this.storageKey, dataString);

    // Event pour UI reactivity
    if (typeof window !== "undefined") {
      const level = (typeof this.getUserLevel === "function") ? this.getUserLevel() : 1;
      const isPremium = (typeof this.isPremiumUser === "function") ? this.isPremiumUser() : false;

      window.dispatchEvent(
        new CustomEvent("storage-updated", {
          detail: {
            frenchPoints: this.data.frenchPoints,
            level: level,
            isPremium: isPremium
          }
        })
      );

    }
    return true;
  } catch (error) {
    // Gestion specifique quota depasse
    if (error.name === "QuotaExceededError" || error.code === 22) {
      console.warn("Storage quota exceeded, cleaning up...");
      this.emergencyCleanup();

      // Retry une fois apres nettoyage
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
        return true;
      } catch (retryError) {
        console.error("Storage save failed after cleanup:", retryError);
        this.showStorageFullWarning();
        return false;
      }
    }

    console.error("Storage save failed:", error);
    return false;
  }
};


// Nettoyage agressif en cas de quota
StorageManager.prototype.emergencyCleanup = function () {
  // Garder seulement les donnees essentielles
  if (this.data.history && this.data.history.length > 10) {
    // history est en "newest-first" (unshift), donc on garde les 10 plus récents
    this.data.history = this.data.history.slice(0, 10);
  }

  // Nettoyer le cache de quiz anciens
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (this.data.quizCache && typeof this.data.quizCache === "object" && !Array.isArray(this.data.quizCache)) {
    Object.keys(this.data.quizCache).forEach((key) => {
      const entry = this.data.quizCache[key];
      const ts = Number(entry && entry.timestamp);
      if (!Number.isFinite(ts) || ts < oneWeekAgo) {
        delete this.data.quizCache[key];
      }
    });
  }

};

StorageManager.prototype.cleanupOldData = function () {
  // Nettoyage "soft" avant emergencyCleanup
  if (this.data.history && this.data.history.length > 50) {
    this.data.history = this.data.history.slice(0, 50);
  }
};

StorageManager.prototype.showStorageFullWarning = function () {
  if (typeof window !== "undefined" && typeof window.showErrorMessage === "function") {
    window.showErrorMessage(
      "Storage full. Some data may not be saved. Clear browser data if the issue persists."
    );
  }
};

StorageManager.prototype.clearAllData = function () {
  this.data = JSON.parse(JSON.stringify(this.defaultData));

  // Reset coffre (clé historique)
  try { localStorage.removeItem("tyf:lastDailyRewardAt"); } catch { }

  // Optionnel: reset refus modal profil
  try { localStorage.removeItem("profileModalRefused"); } catch { }

  // Garantir la compat: timestamp number
  this.data.lastDailyRewardAt = 0;
  this.data.lastDailyReward = null;

  this.save();
  console.log("All data cleared");
};



StorageManager.prototype.exportData = function () {
  return JSON.stringify(
    {
      version: "3.0",
      timestamp: new Date().toISOString(),
      data: this.data
    },
    null,
    2
  );
};

// --- Analytics helpers (KISS, local only) ---
StorageManager.prototype.ensureAnalyticsStructure = function () {
  if (!this.data || typeof this.data !== "object") return;

  const def = (this.defaultData && this.defaultData.analytics) ? this.defaultData.analytics : null;
  if (!def) return;

  if (!this.data.analytics || typeof this.data.analytics !== "object" || Array.isArray(this.data.analytics)) {
    this.data.analytics = JSON.parse(JSON.stringify(def));
  }

  const a = this.data.analytics;

  // Numbers
  [
    "appLoads",
    "sessions",
    "lastSessionAt",
    "quizzesStarted",
    "quizzesCompleted",
    "quizzesAbandoned",
    "totalQuizTimeSec",
    "paywallShown",
    "paywallClicked",
    "premiumUnlocked"
  ].forEach((k) => {
    a[k] = Number(a[k]);
    if (!Number.isFinite(a[k]) || a[k] < 0) a[k] = 0;
  });

  // activeDays
  if (!Array.isArray(a.activeDays)) a.activeDays = [];
  a.activeDays = a.activeDays
    .map((x) => String(x || ""))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));

  // Limit (KISS)
  if (a.activeDays.length > 60) a.activeDays = a.activeDays.slice(0, 60);

  // lastActiveDay
  if (typeof a.lastActiveDay !== "string") a.lastActiveDay = "";
  if (a.lastActiveDay && !/^\d{4}-\d{2}-\d{2}$/.test(a.lastActiveDay)) a.lastActiveDay = "";
};

StorageManager.prototype._touchAnalyticsActiveDay = function () {
  if (!this.data || !this.data.analytics) return;

  // Utilise _getLocalDateKey si dispo, sinon fallback
  const dayKey =
    (typeof this._getLocalDateKey === "function")
      ? this._getLocalDateKey()
      : (function () {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return y + "-" + m + "-" + day;
      })();

  const a = this.data.analytics;
  a.lastActiveDay = dayKey;

  if (!Array.isArray(a.activeDays)) a.activeDays = [];
  if (!a.activeDays.includes(dayKey)) {
    a.activeDays.unshift(dayKey); // newest-first
    if (a.activeDays.length > 60) a.activeDays = a.activeDays.slice(0, 60);
  }
};

StorageManager.prototype.trackAnalytics = function (name, payload, options = {}) {
  if (!name) return false;

  if (typeof this.ensureAnalyticsStructure === "function") {
    this.ensureAnalyticsStructure();
  }
  if (!this.data || !this.data.analytics) return false;

  const a = this.data.analytics;
  const n = String(name);

  if (typeof this._touchAnalyticsActiveDay === "function") {
    this._touchAnalyticsActiveDay();
  }

  if (n === "quiz_started") a.quizzesStarted += 1;
  else if (n === "quiz_completed") {
    a.quizzesCompleted += 1;
    const sec = Number(payload && payload.timeSpentSec);
    if (Number.isFinite(sec) && sec > 0) a.totalQuizTimeSec += sec;
  }
  else if (n === "quiz_abandoned") a.quizzesAbandoned += 1;
  else if (n === "paywall_shown") a.paywallShown += 1;
  else if (n === "paywall_clicked") a.paywallClicked += 1;
  else if (n === "premium_unlocked") a.premiumUnlocked += 1;

  const inTx = (typeof this.isInTransaction === "function") ? this.isInTransaction() : false;
  if (!inTx && options.skipSave !== true) {
    this.save();
  }

  return true;
};


StorageManager.prototype.getAnalyticsSummary = function () {
  if (typeof this.ensureAnalyticsStructure === "function") {
    this.ensureAnalyticsStructure();
  }

  const a = (this.data && this.data.analytics) ? this.data.analytics : null;
  if (!a) {
    return {
      appLoads: 0,
      sessions: 0,
      activeDays30: 0,
      quizzesStarted: 0,
      quizzesCompleted: 0,
      completionRate: 0,
      avgQuizTimeSec: 0,
      paywallShown: 0,
      paywallClicked: 0,
      paywallCTR: 0,
      premiumUnlocked: 0
    };
  }

  const activeDays30 = (Array.isArray(a.activeDays) ? a.activeDays.slice(0, 30).length : 0);
  const completionRate =
    a.quizzesStarted > 0 ? Math.round((a.quizzesCompleted / a.quizzesStarted) * 100) : 0;

  const avgQuizTimeSec =
    a.quizzesCompleted > 0 ? Math.round(a.totalQuizTimeSec / a.quizzesCompleted) : 0;

  const paywallCTR =
    a.paywallShown > 0 ? Math.round((a.paywallClicked / a.paywallShown) * 100) : 0;

  return {
    appLoads: a.appLoads,
    sessions: a.sessions,
    lastSessionAt: a.lastSessionAt,
    activeDays30: activeDays30,
    lastActiveDay: a.lastActiveDay,
    quizzesStarted: a.quizzesStarted,
    quizzesCompleted: a.quizzesCompleted,
    quizzesAbandoned: a.quizzesAbandoned,
    completionRate: completionRate,
    totalQuizTimeSec: a.totalQuizTimeSec,
    avgQuizTimeSec: avgQuizTimeSec,
    paywallShown: a.paywallShown,
    paywallClicked: a.paywallClicked,
    paywallCTR: paywallCTR,
    premiumUnlocked: a.premiumUnlocked
  };
};

StorageManager.prototype.exportAnalytics = function () {
  return JSON.stringify(
    {
      version: "3.0",
      timestamp: new Date().toISOString(),
      analytics: (this.data && this.data.analytics) ? this.data.analytics : {}
    },
    null,
    2
  );
};



//================================================================================
// ENDREGION: CORE DATA MANAGEMENT
//================================================================================

//================================================================================
// REGION: FRENCH POINTS & PREMIUM SYSTEM
//================================================================================

StorageManager.prototype.getFrenchPoints = function () {
  const fp = Number(this.data && this.data.frenchPoints);
  return Number.isFinite(fp) ? fp : 0;
};



// Source unique: FP par niveau
const FP_PER_LEVEL = 50;

StorageManager.prototype.getLastQuizDate = function () {
  const iso =
    this.data &&
    this.data.globalStats &&
    this.data.globalStats.lastQuizDate;

  if (!iso || typeof iso !== "string") return null;

  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : null;
};

StorageManager.prototype.hasCompletedQuizToday = function () {
  const lastTs = this.getLastQuizDate();
  if (!lastTs) return false;

  return (
    this._getLocalDateKey(new Date(lastTs)) ===
    this._getLocalDateKey()
  );
};


StorageManager.prototype.getNextUnlockableTheme = function () {
  if (this.isPremiumUser()) return null;

  // prochain thème premium dans l’ordre (2..10)
  const unlockedCount = this.getUnlockedPremiumThemesCount();
  const nextThemeId = 2 + unlockedCount;

  if (nextThemeId > 10) return null;

  // Règle produit: on débloque le thème suivant seulement si le précédent est débloqué
  const prevThemeId = nextThemeId - 1;
  if (!this.isThemeUnlocked(prevThemeId)) {
    return { themeId: nextThemeId, reason: "PREVIOUS_LOCKED", cost: null };
  }

  const cost = this.getThemeCost(nextThemeId);
  return { themeId: nextThemeId, reason: "OK", cost: cost };
};



StorageManager.prototype.getFpToNextTheme = function () {
  const next = this.getNextUnlockableTheme();
  if (!next || next.reason !== "OK") return null;

  const fp = this.getFrenchPoints();

  return {
    themeId: next.themeId,
    cost: next.cost,
    currentFP: fp,
    missingFP: Math.max(0, next.cost - fp)
  };
};


StorageManager.prototype.getFpPerLevel = function () {
  return FP_PER_LEVEL;
};

StorageManager.prototype.getUserLevel = function () {
  const fp = Number(this.data && this.data.frenchPoints) || 0;
  return Math.max(1, Math.floor(fp / FP_PER_LEVEL) + 1);
};


StorageManager.prototype.addFrenchPoints = function (amount, reason = "unknown", options = {}) {
  if (typeof amount !== "number" || amount <= 0) return false;

  // Anti-farming: bloquer les anciens motifs + abus
  if (reason === "correct_answer" || reason === "correct_answers") return false;

  const oldLevel = this.getUserLevel();
  const before = Number(this.data && this.data.frenchPoints);
  this.data.frenchPoints = (Number.isFinite(before) ? before : 0) + amount;


  if (!this.data.fpStats || typeof this.data.fpStats !== "object") {
    this.data.fpStats = JSON.parse(JSON.stringify(this.defaultData.fpStats));
  }

  this.data.fpStats.totalEarned = Number(this.data.fpStats.totalEarned);
  if (!Number.isFinite(this.data.fpStats.totalEarned)) this.data.fpStats.totalEarned = 0;
  this.data.fpStats.totalEarned += amount;


  if (!this.data.fpStats.sources || typeof this.data.fpStats.sources !== "object") {
    this.data.fpStats.sources = JSON.parse(JSON.stringify(this.defaultData.fpStats.sources));
  }

  const r = String(reason || "other");
  const bucket =
    (r === "quiz_completion") ? "quiz_completion" :
      (r === "perfect_quiz") ? "perfect_quiz" :
        (r === "daily_reward") ? "daily_reward" :
          (r === "premium_unlock") ? "premium_unlock" :
            "other";

  this.data.fpStats.sources[bucket] = (Number(this.data.fpStats.sources[bucket]) || 0) + amount;

  if (reason === "perfect_quiz") {
    this.data.fpStats.perfectQuizCount++;
  }

  const newLevel = this.getUserLevel();

  const inTx = typeof this.isInTransaction === "function" ? this.isInTransaction() : false;

  // Events uniquement si autorisés (et idéalement pas en transaction)
  if (!options.skipEvents && !inTx) {
    this.dispatchFPEvent("fp-gained", { amount, reason, total: this.data.frenchPoints });

    if (newLevel > oldLevel) {
      this.dispatchFPEvent("level-up", { newLevel, oldLevel });
    }
  }

  // Save uniquement si pas en transaction et pas explicitement désactivé
  if (!inTx && options.skipSave !== true) {
    this.save();
  }

  if (!inTx) {
    console.log("+" + amount + " FP (" + reason + "). Total: " + this.data.frenchPoints);
  }
  return true;

};



StorageManager.prototype.getLevelProgress = function () {
  const level = this.getUserLevel();
  const currentLevelFP = (level - 1) * FP_PER_LEVEL;
  const current = (Number(this.data && this.data.frenchPoints) || 0) - currentLevelFP;
  const needed = FP_PER_LEVEL;

  let percentage = Math.round((current / needed) * 100);
  if (!Number.isFinite(percentage)) percentage = 0;
  percentage = Math.max(0, Math.min(100, percentage));

  return { level, current, needed, percentage };
};


StorageManager.prototype.isPremiumUser = function () {
  return this.data.isPremiumUser || false;
};

StorageManager.prototype.unlockPremiumWithCode = function (code) {
  const cleaned = String(code || "").trim().toUpperCase();
  if (!/^TYF-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleaned)) {
    return { success: false, error: "INVALID_CODE" };
  }




  const wasAlreadyPremium = this.isPremiumUser();
  if (wasAlreadyPremium) {
    // idempotent: déjà premium
    this.dispatchFPEvent("premium-unlocked", { wasAlreadyPremium: true });

    // Garantit la synchro UI même si elle n'écoute que storage-updated
    this.save();

    return { success: true, wasAlreadyPremium: true, bonusFP: 0 };
  }

  const oldLevel = this.getUserLevel();
  const fpBonus = 25;

  this.runInTransaction(() => {
    this.data.isPremiumUser = true;
    this.unlockAllQuizzes();

    // pas d’events intermédiaires, pas de save intermédiaire
    this.addFrenchPoints(fpBonus, "premium_unlock", { skipEvents: true });
  });

  const newLevel = this.getUserLevel();

  // Events après commit (propre)
  this.dispatchFPEvent("fp-gained", {
    amount: fpBonus,
    reason: "premium_unlock",
    total: this.data.frenchPoints
  });

  if (newLevel > oldLevel) {
    this.dispatchFPEvent("level-up", { newLevel, oldLevel });
  }

  this.dispatchFPEvent("premium-unlocked", { wasAlreadyPremium: false });

  // referral removed in MVP v3.0

  if (typeof this.trackAnalytics === "function") {
    this.trackAnalytics("premium_unlocked", { bonusFP: fpBonus });
  }

  return {
    success: true,
    wasAlreadyPremium: false,
    bonusFP: fpBonus
  };


};



StorageManager.prototype.unlockAllQuizzes = function () {
  // KISS: premium => on marque l'accès global via isPremiumUser,
  // mais on garde unlockedQuizzes cohérent pour compat legacy/UI.
  if (!Array.isArray(this.data.unlockedQuizzes)) this.data.unlockedQuizzes = [];

  for (let themeId = 1; themeId <= 10; themeId++) {
    const baseQuizId = themeId * 100 + 1; // marqueur de thème débloqué
    if (!this.data.unlockedQuizzes.includes(baseQuizId)) {
      this.data.unlockedQuizzes.push(baseQuizId);
    }
  }
};

StorageManager.prototype.isQuizUnlocked = function (quizId) {
  const themeId = Math.floor(quizId / 100);

  // Colors toujours gratuit
  if (quizId >= 101 && quizId <= 105) return true;

  // Premium users
  if (this.isPremiumUser()) return true;

  // Coherence: si le theme est debloque, tous ses quiz le sont
  if (this.isThemeUnlocked(themeId)) {
    const quizNumber = quizId % 100;
    return quizNumber >= 1 && quizNumber <= 5;
  }

  // Fallback legacy
  return this.data.unlockedQuizzes.includes(quizId);
};

StorageManager.prototype.getLastDailyRewardTimestamp = function () {
  // Source unique: this.data.lastDailyRewardAt
  if (
    typeof this.data?.lastDailyRewardAt === "number" &&
    this.data.lastDailyRewardAt > 0
  ) {
    return this.data.lastDailyRewardAt;
  }

  // Compat ISO legacy si besoin
  if (this.data?.lastDailyReward) {
    const parsed = Date.parse(this.data.lastDailyReward);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return 0;
};



StorageManager.prototype.getLastDailyRewardAt = function () {
  return this.getLastDailyRewardTimestamp();
};


StorageManager.prototype.setLastDailyRewardTimestamp = function (ts) {
  this.data.lastDailyRewardAt = ts;
  this.data.lastDailyReward = new Date(ts).toISOString(); // compat ancienne donnee
  // Pas de localStorage séparé: this.save() persiste déjà tout dans frenchQuizProgress
  // IMPORTANT: ne pas appeler save() ici (le caller gère la persistance)
};



StorageManager.prototype.getDailyRewardPoints = function () {
  return DAILY_REWARD_BASE;
};

// UI/Tooltip: afficher le montant réel "aujourd’hui" (base + streak bonus), sans effets de bord
StorageManager.prototype.getTodayDailyRewardAmount = function () {
  // Règle produit: coffre simple et fixe (pas de streak)
  return DAILY_REWARD_BASE;
};



// Calendaire local: 1 chest par jour (timezone de l'appareil)
StorageManager.prototype._getLocalDateKey = function (d) {
  const dt = d || new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`; // ex: 2026-01-04
};

StorageManager.prototype._getNextLocalMidnightTs = function () {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // demain 00:00:00 local
  return next.getTime();
};

// Retourne la dernière "dateKey" de reward si dispo (compat: derive depuis timestamp existant)
StorageManager.prototype.getLastDailyRewardDateKey = function () {
  // Si tu ajoutes plus tard un champ data.lastDailyRewardDateKey, tu peux le lire ici.
  const ts = this.getLastDailyRewardTimestamp();
  if (!ts) return null;
  return this._getLocalDateKey(new Date(ts));
};

StorageManager.prototype.getNextDailyRewardTime = function () {
  // Si disponible => maintenant. Sinon => prochain minuit local.
  return this.isDailyRewardAvailable() ? Date.now() : this._getNextLocalMidnightTs();
};

StorageManager.prototype.isDailyRewardAvailable = function () {
  const lastTs = this.getLastDailyRewardTimestamp();
  const nowTs = Date.now();

  // garde-fou: si l'horloge recule, on verrouille
  if (lastTs && nowTs < lastTs) return false;

  const lastKey = lastTs ? this._getLocalDateKey(new Date(lastTs)) : null;
  const todayKey = this._getLocalDateKey();

  if (!lastKey) return true;
  return lastKey !== todayKey;
};



// Débloque un thème ciblé (compatible avec l'UI qui clique un thème précis)
// Respecte: thème précédent débloqué + assez de FP
StorageManager.prototype.unlockTheme = function (themeId, costOverride) {
  // Colors gratuit
  if (themeId === 1) {
    return { success: true, cost: 0, themeId: 1, remainingFP: this.data.frenchPoints };
  }

  // Premium: tout est déjà ouvert, mais on reste cohérent côté retour
  if (this.isPremiumUser()) {
    return { success: true, cost: 0, themeId: themeId, remainingFP: this.data.frenchPoints };
  }

  // Si déjà débloqué, idempotent
  if (this.isThemeUnlocked(themeId)) {
    return { success: true, cost: 0, themeId: themeId, remainingFP: this.data.frenchPoints };
  }

  const check = this.canUnlockTheme(themeId);
  if (!check.canUnlock) {
    return {
      success: false,
      reason: check.reason || "LOCKED",
      cost: typeof check.cost === "number" ? check.cost : null,
      currentFP: this.data.frenchPoints
    };
  }

  const cost = (typeof costOverride === "number") ? costOverride : check.cost;
  if (typeof cost !== "number" || cost < 0) {
    return { success: false, reason: "INVALID_COST", cost: null, currentFP: this.data.frenchPoints };
  }

  if (this.data.frenchPoints < cost) {
    return {
      success: false,
      reason: "INSUFFICIENT_FP",
      cost: cost,
      currentFP: this.data.frenchPoints
    };
  }

  this.runInTransaction(() => {
    this.data.frenchPoints -= cost;

    if (!this.data.fpStats || typeof this.data.fpStats !== "object") {
      this.data.fpStats = JSON.parse(JSON.stringify(this.defaultData.fpStats));
    }
    this.data.fpStats.totalSpent = (Number(this.data.fpStats.totalSpent) || 0) + cost;

    const baseQuizId = themeId * 100 + 1;
    if (!Array.isArray(this.data.unlockedQuizzes)) this.data.unlockedQuizzes = [];
    if (!this.data.unlockedQuizzes.includes(baseQuizId)) {
      this.data.unlockedQuizzes.push(baseQuizId);
    }
  });

  // UI toast / tracking
  this.dispatchFPEvent("fp-spent", { amount: cost, reason: "theme_unlock", total: this.data.frenchPoints, themeId });


  this.dispatchFPEvent("theme-unlocked", {
    themeId: themeId,
    cost: cost,
    remainingFP: this.data.frenchPoints
  });

  return {
    success: true,
    cost: cost,
    themeId: themeId,
    remainingFP: this.data.frenchPoints
  };

};


StorageManager.prototype.canUnlockWithFP = function () {
  if (this.isPremiumUser()) return { canUnlock: true, cost: 0 };

  // Nombre de thèmes premium déjà débloqués (0..9)
  const unlockedThemes = this.getUnlockedPremiumThemesCount();
  const nextThemeId = 2 + unlockedThemes;

  if (nextThemeId > 10) {
    return { canUnlock: false, cost: 0, currentFP: this.data.frenchPoints, reason: "ALL_UNLOCKED" };
  }

  // Coût du prochain déverrouillage
  const cost = this.getUnlockCost(unlockedThemes);
  const canUnlock = this.data.frenchPoints >= cost;

  return { canUnlock, cost, currentFP: this.data.frenchPoints, nextThemeId };
};


// Remplace unlockQuizWithFP: ici on débloque le prochain THEME premium (2..10)
// et on marque le thème comme "unlocked" via le quiz de base (theme*100 + 1).
StorageManager.prototype.unlockQuizWithFP = function () {
  // Premium: rien à faire
  if (this.isPremiumUser()) {
    return { success: true, cost: 0, themeId: null, remainingFP: this.data.frenchPoints };
  }

  // Déterminer le prochain thème premium à débloquer
  const unlockedCount = this.getUnlockedPremiumThemesCount(); // 0..9
  const nextThemeId = 2 + unlockedCount;

  if (nextThemeId > 10) {
    return { success: false, reason: "ALL_UNLOCKED", cost: 0 };
  }

  // Vérifier règles (thème précédent + FP)
  const check = this.canUnlockTheme(nextThemeId);
  if (!check.canUnlock) {
    return {
      success: false,
      reason: check.reason || "LOCKED",
      cost: typeof check.cost === "number" ? check.cost : null,
      currentFP: this.data.frenchPoints
    };
  }


  // Dépenser FP
  const cost = check.cost;

  this.runInTransaction(() => {
    this.data.frenchPoints -= cost;

    if (!this.data.fpStats || typeof this.data.fpStats !== "object") {
      this.data.fpStats = JSON.parse(JSON.stringify(this.defaultData.fpStats));
    }
    this.data.fpStats.totalSpent = (Number(this.data.fpStats.totalSpent) || 0) + cost;

    const baseQuizId = nextThemeId * 100 + 1;
    if (!Array.isArray(this.data.unlockedQuizzes)) this.data.unlockedQuizzes = [];
    if (!this.data.unlockedQuizzes.includes(baseQuizId)) {
      this.data.unlockedQuizzes.push(baseQuizId);
    }
  });

  // UI toast / tracking
  this.dispatchFPEvent("fp-spent", { amount: cost, reason: "theme_unlock", total: this.data.frenchPoints, themeId: nextThemeId });


  this.dispatchFPEvent("theme-unlocked", {
    themeId: nextThemeId,
    cost: cost,
    remainingFP: this.data.frenchPoints
  });

  return {
    success: true,
    cost: cost,
    themeId: nextThemeId,
    remainingFP: this.data.frenchPoints
  };

};


StorageManager.prototype.isThemeUnlocked = function (themeId) {
  if (themeId === 1) return true; // Colors toujours gratuit
  const base = themeId * 100;
  // Compat: certaines anciennes versions ont pu stocker 200 au lieu de 201
  return this.data.unlockedQuizzes.includes(base + 1) || this.data.unlockedQuizzes.includes(base);
};




StorageManager.prototype.canUnlockTheme = function (themeId) {
  // Premium: tout est accessible, aucune règle de séquentialité
  if (this.isPremiumUser()) return { canUnlock: true, cost: 0, reason: "PREMIUM" };

  // Theme 1 (Colors) toujours gratuit
  if (themeId === 1) return { canUnlock: true, cost: 0, reason: "FREE" };

  // Déjà débloqué (via FP / legacy) => OK, pas de coût
  if (this.isThemeUnlocked(themeId)) return { canUnlock: true, cost: 0, reason: "ALREADY_UNLOCKED" };

  const cost =
    typeof this.getThemeCost === "function"
      ? this.getThemeCost(themeId)
      : this.getUnlockCost(Math.max(0, themeId - 2));

  // Règle produit: le thème précédent doit être débloqué (pas “terminé”)
  const previousThemeId = themeId - 1;
  const previousUnlocked = this.isThemeUnlocked(previousThemeId);

  if (!previousUnlocked) {
    return {
      canUnlock: false,
      cost: null,
      reason: "PREVIOUS_LOCKED",
      message: "Unlock theme " + previousThemeId + " first"
    };
  }

  const hasFP = this.data.frenchPoints >= cost;

  if (!hasFP) {
    return {
      canUnlock: false,
      cost: cost,
      currentFP: this.data.frenchPoints,
      reason: "INSUFFICIENT_FP",
      message: "Need " + (cost - this.data.frenchPoints) + " more FP"
    };
  }

  return {
    canUnlock: true,
    cost: cost,
    currentFP: this.data.frenchPoints,
    reason: "OK"
  };
};




// Helper de lecture
StorageManager.prototype.isThemeCompleted = function (themeId) {
  const stats = this.data.themeStats[themeId];
  return !!(stats && typeof stats.completed === "number" && stats.completed >= 5);
};


//================================================================================
// ENDREGION: FRENCH POINTS & PREMIUM SYSTEM
//================================================================================

//================================================================================
// REGION: DAILY REWARDS & GAMIFICATION
//================================================================================


StorageManager.prototype.getAvailableChests = function () {
  // Source unique: dérivé d'un état calculé une seule fois
  return this.isDailyRewardAvailable() ? 1 : 0;
};



StorageManager.prototype.collectDailyReward = function () {
  if (!this.isDailyRewardAvailable()) {
    return { success: false, reason: "DAILY_LOCKED", nextAt: this.getNextDailyRewardTime() };
  }

  const fpBefore = this.getFrenchPoints();
  const oldLevel = this.getUserLevel();

  // Règle fixe: 1 FP par jour, sans bonus, sans streak
  const earned = this.getTodayDailyRewardAmount(); // ou DAILY_REWARD_BASE


  // Transaction robuste: snapshot + rollback + un seul save
  this.runInTransaction(() => {
    this.addFrenchPoints(earned, "daily_reward", { skipEvents: true });
    this.setLastDailyRewardTimestamp(Date.now());

    if (!this.data.fpStats || typeof this.data.fpStats !== "object") {
      this.data.fpStats = JSON.parse(JSON.stringify(this.defaultData.fpStats));
    }
    this.data.fpStats.dailyRewardsCount = (Number(this.data.fpStats.dailyRewardsCount) || 0) + 1;

    // Neutralise toute mécanique de streak côté données
    this.data.fpStats.streakDays = 0;
  });

  const fpAfter = this.getFrenchPoints();
  const gained = Math.max(0, fpAfter - fpBefore);
  const newLevel = this.getUserLevel();

  if (gained > 0) {
    this.dispatchFPEvent("fp-gained", { amount: gained, reason: "daily_reward", total: fpAfter });
  }
  if (newLevel > oldLevel) {
    this.dispatchFPEvent("level-up", { newLevel, oldLevel });
  }

  this.dispatchFPEvent("daily-reward-collected", {
    earned: gained,
    total: fpAfter,
    streakDays: 0,
    nextAt: this.getNextDailyRewardTime()
  });

  return {
    success: true,
    earned: gained,
    fpEarned: gained,
    totalFP: fpAfter,
    nextAt: this.getNextDailyRewardTime(),
    streakDays: 0
  };
};





// Legacy - ne plus utiliser (streak coffre géré par updateStreakDaysFromPrevious)
StorageManager.prototype.updateStreakDays = function () {
  return; // deprecated
};



StorageManager.prototype.updateStreakDaysFromPrevious = function () {
  return; // streak daily chest désactivé (règle produit)
};

StorageManager.prototype.getBadges = function () {
  return Array.isArray(this.data.badges) ? [...this.data.badges] : [];
};

StorageManager.prototype.updateBadges = function (score, total, options = {}) {
  const newBadges = [];

  // FP milestones
  const fp = this.data.frenchPoints;
  const fpMilestones = [100, 250, 500, 1000];

  fpMilestones.forEach((milestone) => {
    const badgeId = "fp-" + milestone;
    if (fp >= milestone && !this.data.badges.includes(badgeId)) {
      newBadges.push(badgeId);
      this.data.badges.push(badgeId);
    }
  });

  // Perfect quiz
  if (score === total) {
    const badgeId = "perfect";
    if (!this.data.badges.includes(badgeId)) {
      newBadges.push(badgeId);
      this.data.badges.push(badgeId);
    }
  }

  // Streak badges: désactivés (règle produit: pas de streak daily chest)
  // (On garde le code “off” volontairement pour éviter des badges fantômes.)



  // Pas de dispatch ici: l’event badges-earned est émis après commit (markQuizCompleted).
  return newBadges;
};




//================================================================================
// REGION: QUIZ COMPLETION & PROGRESSION
//================================================================================

StorageManager.prototype.isQuizCompleted = function (quizId) {
  const id = Number(quizId);
  if (!Number.isFinite(id) || id <= 0) return false;

  const themeId = Math.floor(id / 100);
  const theme = this.data.themeStats && this.data.themeStats[themeId];
  const quizzes = theme && theme.quizzes;

  const key = String(id);
  return !!(quizzes && quizzes[key] !== undefined);
};



StorageManager.prototype.markQuizCompleted = function (
  themeId,
  quizId,
  score,
  total,
  timeSpent = 0
) {
  const tId = Number(themeId);
  const qId = Number(quizId);

  if (!Number.isFinite(tId) || tId <= 0) return false;
  if (!Number.isFinite(qId) || qId <= 0) return false;

  const now = new Date();
  const today = this._getLocalDateKey(now);

  const themeStats = this.data.themeStats[tId];
  const key = String(qId);

  const alreadyCompletedInTheme =
    !!(themeStats && themeStats.quizzes && themeStats.quizzes[key]);

  if (alreadyCompletedInTheme) return false;

  const fpBefore = this.getFrenchPoints();
  const oldLevel = this.getUserLevel();

  if (typeof total !== "number" || total <= 0) return false;
  if (typeof score !== "number" || score < 0) return false;

  const percentage = Math.round((score / total) * 100);
  let basePoints = 0;

  if (percentage >= 90) basePoints = 6;
  else if (percentage >= 70) basePoints = 5;
  else if (percentage >= 50) basePoints = 3;
  else basePoints = 2;

  let newBadges = [];

  this.runInTransaction(() => {
    this.addFrenchPoints(basePoints, "quiz_completion", { skipEvents: true });

    if (percentage === 100) {
      this.addFrenchPoints(3, "perfect_quiz", { skipEvents: true });
    }


    // source unique: IDs numériques
    this.updateThemeStats(tId, qId, score, total, timeSpent, now);
    this.updateGlobalStats(score, total, timeSpent, now);
    // this.updateStreak(today); // désactivé: streak = coffre (daily reward)

    newBadges = this.updateBadges(score, total, { skipEvents: true });

    this.addToHistory(tId, qId, score, total, timeSpent, now);

    if (!this.data.conversionTracking || typeof this.data.conversionTracking !== "object") {
      this.data.conversionTracking = JSON.parse(JSON.stringify(this.defaultData.conversionTracking));
    }
    if (typeof this.data.conversionTracking.premiumQuizCompleted !== "number") {
      this.data.conversionTracking.premiumQuizCompleted = 0;
    }
    if (qId > 105) {
      this.data.conversionTracking.premiumQuizCompleted++;
    }
  });

  const fpAfter = this.getFrenchPoints();
  const gained = Math.max(0, fpAfter - fpBefore);
  const newLevel = this.getUserLevel();

  if (gained > 0) {
    this.dispatchFPEvent("fp-gained", { amount: gained, reason: "quiz_completed", total: fpAfter });
  }

  if (newLevel > oldLevel) {
    this.dispatchFPEvent("level-up", { newLevel, oldLevel });
  }

  // event: IDs numériques (cohérent partout)
  this.dispatchFPEvent("quiz-completed", { themeId: tId, quizId: qId, score, total, percentage });

  if (newBadges && newBadges.length > 0) {
    this.dispatchFPEvent("badges-earned", { badges: this._formatBadgesForEvent(newBadges) });
  }

  if (typeof this.trackAnalytics === "function") {
    this.trackAnalytics("quiz_completed", {
      themeId: tId,
      quizId: qId,
      timeSpentSec: Number(timeSpent) || 0,
      percentage: percentage
    });
  }

  return true;

};



StorageManager.prototype.updateThemeStats = function (
  themeId,
  quizId,
  score,
  total,
  timeSpent,
  now
) {
  if (!this.data.themeStats[themeId]) {
    this.data.themeStats[themeId] = { quizzes: {}, completed: 0 };
  }

  const quizzes = this.data.themeStats[themeId].quizzes || {};
  this.data.themeStats[themeId].quizzes = quizzes;

  const key = String(quizId);
  const wasAlreadyCompleted = Object.prototype.hasOwnProperty.call(quizzes, key);

  if (!wasAlreadyCompleted) {
    this.data.themeStats[themeId].completed++;
  }

  quizzes[key] = {
    score: score,
    total: total,
    timeSpent: Number(timeSpent) || 0,
    date: now.toISOString(),
    accuracy: Math.round((score / total) * 100)
  };
};


StorageManager.prototype.updateGlobalStats = function (
  score,
  total,
  timeSpent,
  date
) {
  const t = Number(total) || 0;
  const s = Number(score) || 0;
  const ts = Number(timeSpent) || 0;

  this.data.globalStats.totalQuestions += t;
  this.data.globalStats.totalCorrect += s;
  this.data.globalStats.totalTimeSpent += ts;

  if (!this.data.globalStats.firstQuizDate) {
    this.data.globalStats.firstQuizDate = date.toISOString();
  }
  this.data.globalStats.lastQuizDate = date.toISOString();
};


// Legacy (v3.0): streak "quiz" désactivé. Le streak affiché/progressif est celui du coffre
// via fpStats.streakDays (updateStreakDaysFromPrevious). On garde ce code uniquement
// pour compat/debug ou si on réactive un jour le streak basé sur les quiz.
StorageManager.prototype.updateStreak = function (today) {
  if (this.data.streak.lastActiveDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yDate = this._getLocalDateKey(yesterday);

    if (this.data.streak.lastActiveDate === yDate) {
      this.data.streak.count++;
    } else {
      this.data.streak.count = 1;
    }

    this.data.streak.lastActiveDate = today;

    if (this.data.streak.count > this.data.streak.bestStreak) {
      this.data.streak.bestStreak = this.data.streak.count;
    }
  }
};


StorageManager.prototype.checkImprovement = function (themeId) {
  const themeData = this.data.themeStats[themeId];
  if (!themeData || !themeData.quizzes) return false;

  const quizzes = Object.values(themeData.quizzes);
  if (quizzes.length < 2) return false;

  quizzes.sort(function (a, b) {
    const ta = Date.parse(a && a.date) || 0;
    const tb = Date.parse(b && b.date) || 0;
    return ta - tb;
  });

  const recent = quizzes.slice(-2);

  if (
    !recent[0] ||
    !recent[1] ||
    recent[0].accuracy === undefined ||
    recent[1].accuracy === undefined
  ) {
    return false;
  }

  return recent[1].accuracy > recent[0].accuracy;
};

StorageManager.prototype.addToHistory = function (
  themeId,
  quizId,
  score,
  total,
  timeSpent,
  date
) {
  if (!this.data.history) this.data.history = [];

  this.data.history.unshift({
    date: date.toISOString(),
    themeId: themeId,
    quizId: quizId,
    score: score,
    total: total,
    timeSpent: Number(timeSpent) || 0,
    accuracy: Math.round((score / total) * 100)
  });


  if (this.data.history.length > 50) {
    this.data.history = this.data.history.slice(0, 50);
  }
};

//================================================================================
// ENDREGION: QUIZ COMPLETION & PROGRESSION
//================================================================================

//================================================================================
// REGION: CONVERSION TRACKING & BUSINESS
//================================================================================

StorageManager.prototype.track = function (eventName, payload) {
  if (!eventName) return false;

  if (!this.data.conversionTracking || typeof this.data.conversionTracking !== "object") {
    this.data.conversionTracking = JSON.parse(
      JSON.stringify(this.defaultData.conversionTracking)
    );
  }

  const ct = this.data.conversionTracking;
  if (!Array.isArray(ct.events)) ct.events = [];

  const ev = {
    name: String(eventName),
    at: Date.now(),
    payload: (payload && typeof payload === "object") ? payload : null
  };

  ct.events.unshift(ev);

  if (ct.events.length > 200) {
    ct.events = ct.events.slice(0, 200);
  }

  return true;
};


StorageManager.prototype.getSessionDuration = function () {
  if (!this.data.conversionTracking.sessionStart) return 0;
  return Math.floor(
    (Date.now() - this.data.conversionTracking.sessionStart) / (1000 * 60)
  );
};

StorageManager.prototype.markQuizStarted = function (payload) {
  if (!this.data.conversionTracking || typeof this.data.conversionTracking !== "object") {
    this.data.conversionTracking = JSON.parse(
      JSON.stringify(this.defaultData.conversionTracking)
    );
  }

  if (typeof this.data.conversionTracking.totalQuizAttempted !== "number") {
    this.data.conversionTracking.totalQuizAttempted = 0;
  }

  this.data.conversionTracking.totalQuizAttempted += 1;

  if (payload && typeof payload === "object") {
    const themeId = Number(payload.themeId);
    const quizId = Number(payload.quizId);
    this.data.conversionTracking.lastQuizAttempt = {
      themeId: Number.isFinite(themeId) ? themeId : null,
      quizId: Number.isFinite(quizId) ? quizId : null,
      at: Date.now()
    };
  } else if (!this.data.conversionTracking.lastQuizAttempt) {
    this.data.conversionTracking.lastQuizAttempt = { themeId: null, quizId: null, at: Date.now() };
  }

  this.track("quiz_started", payload && typeof payload === "object" ? payload : null);

  if (typeof this.trackAnalytics === "function") {
    this.trackAnalytics("quiz_started", payload && typeof payload === "object" ? payload : null);
  }

  this.save();
  return true;
};

// Paywall optimise: 20 min -> 15 min
StorageManager.prototype.shouldTriggerPaywall = function () {
  if (this.isPremiumUser()) return false;
  if (this.data.conversionTracking.paywallShown) return false;

  const sessionDuration = this.getSessionDuration();
  const premiumTasted = this.data.conversionTracking.premiumQuizCompleted > 0;

  const unlockedCount = this.getUnlockedPremiumThemesCount();
  const nextThemeId = 2 + unlockedCount;

  if (nextThemeId > 10) return false;

  const check = this.canUnlockTheme(nextThemeId);
  const canUnlock = !!(check && check.canUnlock === true);

  return sessionDuration >= 15 && premiumTasted && !canUnlock;
};

// markPaywallShown(source)
StorageManager.prototype.markPaywallShown = function (source) {
  if (!this.data.conversionTracking || typeof this.data.conversionTracking !== "object") {
    this.data.conversionTracking = JSON.parse(JSON.stringify(this.defaultData.conversionTracking));
  }

  const ct = this.data.conversionTracking;

  ct.paywallShown = true;
  ct.paywallShownCount = (Number(ct.paywallShownCount) || 0) + 1;
  ct.lastPaywallShownAt = Date.now();
  ct.lastPaywallSource = source ? String(source) : "unknown";

  this.track("paywall_shown", { source: ct.lastPaywallSource });

  if (typeof this.trackAnalytics === "function") {
    this.trackAnalytics("paywall_shown", { source: ct.lastPaywallSource });
  }

  this.save();
  return true;
};

StorageManager.prototype.getPremiumQuizCompleted = function () {
  return this.data.conversionTracking.premiumQuizCompleted || 0;
};




//================================================================================
// ENDREGION: CONVERSION TRACKING & BUSINESS
//================================================================================

//================================================================================
// REGION: USER PROFILE & SETTINGS
//================================================================================

StorageManager.prototype.setUserProfile = function (email, firstName) {
  if (!email || !firstName) {
    console.warn("Email and firstName are required");
    return false;
  }

  // Validation email basique (MVP)
  const emailValue = String(email).trim();
  const nameValue = String(firstName).trim();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailValue)) {
    console.warn("Invalid email format");
    return false;
  }

  this.data.userProfile = {
    email: emailValue,
    firstName: nameValue,
    isAnonymous: false,
    registeredAt: new Date().toISOString()
  };

  this.save();

  this.dispatchFPEvent("user-profile-updated", {
    email: this.data.userProfile.email,
    firstName: this.data.userProfile.firstName
  });

  console.log(
    "User profile saved: " +
    this.data.userProfile.firstName +
    " (" +
    this.data.userProfile.email +
    ")"
  );
  return true;
};


StorageManager.prototype.getUserProfile = function () {
  return this.data.userProfile || this.defaultData.userProfile;
};

StorageManager.prototype.isUserIdentified = function () {
  return !!(this.data.userProfile && !this.data.userProfile.isAnonymous);
};

StorageManager.prototype.getUserDisplayName = function () {
  const profile = this.getUserProfile();
  if (profile.isAnonymous) {
    return "Anonymous User";
  }
  return profile.firstName || "User";
};

// Email capture optimise: 5 quiz -> 3 quiz
StorageManager.prototype.shouldShowProfileModal = function () {
  if (this.isUserIdentified()) return false;

  const completedQuizzes = this.getCompletedQuizzesCount();
  if (completedQuizzes < 3) return false;

  const lastRefusal = localStorage.getItem("profileModalRefused");
  if (lastRefusal) {
    const today = new Date().toDateString();
    const refusalDate = new Date(lastRefusal).toDateString();
    if (today === refusalDate) return false;
  }

  return true;
};

StorageManager.prototype.markProfileModalRefused = function () {
  localStorage.setItem("profileModalRefused", new Date().toISOString());
};

StorageManager.prototype.getTimerPreference = function () {
  return this.data.settings && typeof this.data.settings.timerEnabled !== "undefined"
    ? this.data.settings.timerEnabled
    : true;
};

StorageManager.prototype.setTimerPreference = function (enabled) {
  if (!this.data.settings) this.data.settings = {};
  this.data.settings.timerEnabled = !!enabled;
  this.save();
};

//================================================================================
// ENDREGION: USER PROFILE & SETTINGS
//================================================================================

//================================================================================
// REGION: STATS & UI STATE
//================================================================================
StorageManager.prototype.getUIState = function () {
  const levelProgress = this.getLevelProgress();
  const completedQuizzes = this.getCompletedQuizzesCount();

  // Calculer UNE fois pour éviter les effets de bord temporels
  const dailyAvailable = this.isDailyRewardAvailable();

  // NEW: dernière activité quiz (ISO) -> clé locale YYYY-MM-DD
  const lastQuizIso = this.data?.globalStats?.lastQuizDate;
  let lastActiveDate = null;
  if (typeof lastQuizIso === "string" && lastQuizIso) {
    const ts = Date.parse(lastQuizIso);
    if (Number.isFinite(ts)) {
      lastActiveDate = this._getLocalDateKey(new Date(ts));
    }
  }

  return {
    frenchPoints: this.data.frenchPoints,
    level: levelProgress.level,
    levelProgress: levelProgress,
    isPremium: this.isPremiumUser(),
    completedQuizzes: completedQuizzes,
    completedThemes: this.getCompletedThemesCount(),

    // NEW: consommé par UICore.renderDailyGoalNudge
    lastActiveDate: lastActiveDate,


    currentStreak: Number(this.data.fpStats?.streakDays) || 0,
    bestStreak: 0,
    accuracy: this.getGlobalAccuracy(),
    badges: this.data.badges.length,
    dailyReward: {
      available: dailyAvailable,
      chests: dailyAvailable ? 1 : 0
    },
    perfectQuizzes: this.data.fpStats.perfectQuizCount,
    totalTimeSpent: this.data.globalStats.totalTimeSpent
  };
};


StorageManager.prototype.getGlobalStats = function () {
  return {
    completedQuizzes: this.getCompletedQuizzesCount(),
    completedThemes: this.getCompletedThemesCount(),
    avgAccuracy: this.getGlobalAccuracy(),
    currentStreak: Number(this.data.fpStats?.streakDays) || 0,
    bestStreak: 0, // option KISS: pas de best streak coffre pour l’instant
    frenchPoints: this.data.frenchPoints,
    userLevel: this.getUserLevel(),
    isPremium: this.isPremiumUser(),
    perfectQuizzes: this.data.fpStats.perfectQuizCount
  };
};


StorageManager.prototype.getThemeProgress = function (themeId) {
  const themeData = this.data.themeStats[themeId];
  if (!themeData) {
    return { completedCount: 0, total: 5, percentage: 0, accuracy: 0 };
  }

  const completed = themeData.completed || 0;
  const total = 5;
  const percentage = Math.round((completed / total) * 100);

  let totalCorrect = 0;
  let totalQuestions = 0;
  Object.values(themeData.quizzes || {}).forEach(function (quiz) {
    totalCorrect += quiz.score || 0;
    totalQuestions += quiz.total || 0;
  });
  const accuracy =
    totalQuestions > 0
      ? Math.round((totalCorrect / totalQuestions) * 100)
      : 0;

  return { completedCount: completed, total, percentage, accuracy };
};

StorageManager.prototype.getCompletedQuizzesCount = function () {
  return Object.values(this.data.themeStats || {}).reduce(function (sum, theme) {
    const completed = (theme && typeof theme === "object" && typeof theme.completed === "number")
      ? theme.completed
      : 0;
    return sum + completed;
  }, 0);
};


StorageManager.prototype.getCompletedThemesCount = function () {
  return Object.values(this.data.themeStats || {}).filter(function (theme) {
    return theme && typeof theme.completed === "number" && theme.completed >= 5;
  }).length;
};


StorageManager.prototype.getGlobalAccuracy = function () {
  const stats = this.data.globalStats;
  if (stats.totalQuestions === 0) return 0;
  return Math.round((stats.totalCorrect / stats.totalQuestions) * 100);
};

StorageManager.prototype.getVisualizationData = function () {
  // Calculer completedQuizzes depuis themeStats
  let completedCount = 0;
  for (const themeId in this.data.themeStats) {
    if (this.data.themeStats[themeId] && this.data.themeStats[themeId].quizzes) {
      completedCount += Object.keys(
        this.data.themeStats[themeId].quizzes
      ).length;
    }
  }

  return {
    frenchPoints: this.data.frenchPoints || 0,
    completedQuizzes: completedCount,
    globalAccuracy: this.getGlobalAccuracy(),
    badges: this.data.badges || [],
    history: this.data.history || [],
    level: this.getUserLevel()
  };
};

//================================================================================
// ENDREGION: STATS & UI STATE
//================================================================================
//================================================================================
// REGION: UTILITIES
//================================================================================

StorageManager.prototype._formatBadgesForEvent = function (badgeIds) {
  if (!Array.isArray(badgeIds)) return [];

  return badgeIds.map((id) => {
    const sid = String(id || "");
    const isStreak = sid.startsWith("streak-");
    const streakDays = isStreak ? Number(sid.replace("streak-", "")) : 0;

    return {
      id,
      name:
        id === "perfect" ? "Perfectionist" :
          isStreak && Number.isFinite(streakDays) && streakDays > 0 ? (streakDays + " days in a row") :
            id && String(id).startsWith("fp-") ? `French Points milestone (${String(id).replace("fp-", "")})` :
              "Badge earned",
      description:
        id === "perfect" ? "Scored 100% on a quiz" :
          isStreak && Number.isFinite(streakDays) && streakDays > 0 ? ("Collected the daily chest " + streakDays + " days in a row") :
            id && String(id).startsWith("fp-") ? "Reached a French Points milestone" :
              ""
    };
  });
};

StorageManager.prototype.beginTransaction = function () {
  this._txDepth = (this._txDepth || 0) + 1;
};

StorageManager.prototype.commitTransaction = function () {
  if (!this._txDepth) return;
  this._txDepth -= 1;
  if (this._txDepth === 0) {
    this.save();
  }
};

StorageManager.prototype.isInTransaction = function () {
  return (this._txDepth || 0) > 0;
};

StorageManager.prototype.dispatchFPEvent = function (eventName, detail) {
  if (typeof window === "undefined") return;

  try {
    window.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
  } catch (error) {
    console.error("Event dispatch failed: " + eventName, error);
  }
};

StorageManager.prototype.runInTransaction = function (fn) {
  const alreadyInTx = this.isInTransaction();

  // Snapshot UNIQUEMENT au premier niveau
  if (!alreadyInTx) {
    this._txSnapshot = JSON.parse(JSON.stringify(this.data));
  }

  if (!alreadyInTx) this.beginTransaction();

  try {
    const res = fn();
    if (!alreadyInTx) {
      this.commitTransaction(); // déclenche save()
      this._txSnapshot = null;
    }
    return res;
  } catch (e) {
    // Rollback garanti si on est au niveau racine
    if (!alreadyInTx && this._txSnapshot) {
      this.data = this._txSnapshot;
      this._txSnapshot = null;
      this._txDepth = 0;
    }
    throw e;
  }
};


//================================================================================
// ENDREGION: UTILITIES
//================================================================================

// stepIndex: 0 => Theme 2, 1 => Theme 3, etc.
// Paliers: 25/50/75/100 puis clamp à 100 pour tous les thèmes suivants (Theme 5..10).

StorageManager.prototype.getUnlockCost = function (stepIndex) {
  const costs = [25, 50, 75, 100];
  const i = Number(stepIndex);
  return costs[Math.min(Math.max(0, i), costs.length - 1)];
};


// Retourne le coût d'un thème spécifique basé sur sa position (informatif)
// Utilisé pour : roadmap, affichage (futur)
StorageManager.prototype.getThemeCost = function (themeId) {
  if (themeId === 1) return 0; // Colors gratuit
  const stepIndex = themeId - 2; // Theme 2 = step 0
  return this.getUnlockCost(stepIndex);
};

StorageManager.prototype.getUnlockedPremiumThemesCount = function () {
  // KISS + robust legacy:
  // on compte uniquement la progression séquentielle (2,3,4...) jusqu’au premier thème verrouillé.
  // évite qu’un ancien état “avec trous” casse nextThemeId et le paywall.
  let count = 0;
  for (let themeId = 2; themeId <= 10; themeId++) {
    if (!this.isThemeUnlocked(themeId)) break;
    count++;
  }
  return count;
};


// Cout du prochain deverrouillage de theme (base sur nb de themes deja unlock)
StorageManager.prototype.getNextThemeUnlockCost = function () {
  const unlockedCount = this.getUnlockedPremiumThemesCount();
  const nextThemeId = 2 + unlockedCount;

  if (nextThemeId > 10) return null;
  return this.getUnlockCost(unlockedCount);
};


/**
 * Check if there are unplayed free quizzes in Colors theme
 */
StorageManager.prototype.hasUnplayedFreeQuizzes = function () {
  const freeQuizIds = [101, 102, 103, 104, 105];
  for (let i = 0; i < freeQuizIds.length; i++) {
    const quizId = freeQuizIds[i];
    if (this.isQuizUnlocked(quizId) && !this.isQuizCompleted(quizId)) {
      return true;
    }
  }
  return false;
};

window.StorageManager = StorageManager;
