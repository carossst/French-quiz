// storage.js - Version 3.0

// Daily reward: 1 FP par jour (système calendaire depuis v3.0)
const DAILY_REWARD_MIN = 1;

// Bonus (désactivé par défaut) — évite ReferenceError dans collectDailyReward()
const DAILY_REWARD_BONUS_AMOUNT = 0;
const DAILY_REWARD_BONUS_CHANCE = 0;


//================================================================================
// REGION: CORE DATA MANAGEMENT
//================================================================================

// Renomme pour eviter le conflit avec l'API Web "StorageManager"
function StorageManager() {
  this.storageKey = "frenchQuizProgress";
  this.initialized = false;

  // Donnees par defaut (dans le constructeur)
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
      perfectQuizCount: 0,
      dailyRewardsCount: 0,
      streakDays: 0
    },
    conversionTracking: {
      sessionStart: 0,
      premiumQuizCompleted: 0,
      paywallShown: false,
      totalQuizAttempted: 0,
      conversionClickedAt: null,
      lastQuizAttempt: { themeId: null, quizId: null, at: 0 }
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

    // Tracking session
    if (!this.data.conversionTracking || !this.data.conversionTracking.sessionStart) {
      if (!this.data.conversionTracking) {
        this.data.conversionTracking = JSON.parse(
          JSON.stringify(this.defaultData.conversionTracking)
        );
      }
      this.data.conversionTracking.sessionStart = Date.now();
    }

    this.initialized = true;
    this.save();
    console.log("StorageManager v3.0 initialized");
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

  if (!this.data.themeStats || typeof this.data.themeStats !== "object") {
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

  // Durcir fpStats numériques
  const fpStats = this.data.fpStats;
  fpStats.totalEarned = Number(fpStats.totalEarned);
  fpStats.perfectQuizCount = Number(fpStats.perfectQuizCount);
  fpStats.dailyRewardsCount = Number(fpStats.dailyRewardsCount);
  fpStats.streakDays = Number(fpStats.streakDays);

  if (!Number.isFinite(fpStats.totalEarned)) fpStats.totalEarned = 0;
  if (!Number.isFinite(fpStats.perfectQuizCount)) fpStats.perfectQuizCount = 0;
  if (!Number.isFinite(fpStats.dailyRewardsCount)) fpStats.dailyRewardsCount = 0;
  if (!Number.isFinite(fpStats.streakDays)) fpStats.streakDays = 0;

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

  const ct = this.data.conversionTracking;

  // Durcir booleans/numbers
  ct.paywallShown = !!ct.paywallShown;

  ct.sessionStart = Number(ct.sessionStart);
  if (!Number.isFinite(ct.sessionStart)) ct.sessionStart = 0;

  ct.premiumQuizCompleted = Number(ct.premiumQuizCompleted);
  if (!Number.isFinite(ct.premiumQuizCompleted)) ct.premiumQuizCompleted = 0;

  ct.totalQuizAttempted = Number(ct.totalQuizAttempted);
  if (!Number.isFinite(ct.totalQuizAttempted)) ct.totalQuizAttempted = 0;

  if (ct.conversionClickedAt === undefined) ct.conversionClickedAt = null;

  if (!ct.lastQuizAttempt || typeof ct.lastQuizAttempt !== "object") {
    ct.lastQuizAttempt = JSON.parse(JSON.stringify(this.defaultData.conversionTracking.lastQuizAttempt));
  }
  ct.lastQuizAttempt.themeId = (ct.lastQuizAttempt.themeId === null) ? null : Number(ct.lastQuizAttempt.themeId);
  ct.lastQuizAttempt.quizId = (ct.lastQuizAttempt.quizId === null) ? null : Number(ct.lastQuizAttempt.quizId);
  ct.lastQuizAttempt.at = Number(ct.lastQuizAttempt.at);

  if (ct.lastQuizAttempt.themeId !== null && !Number.isFinite(ct.lastQuizAttempt.themeId)) ct.lastQuizAttempt.themeId = null;
  if (ct.lastQuizAttempt.quizId !== null && !Number.isFinite(ct.lastQuizAttempt.quizId)) ct.lastQuizAttempt.quizId = null;
  if (!Number.isFinite(ct.lastQuizAttempt.at)) ct.lastQuizAttempt.at = 0;



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
    this.data.fpStats = { totalEarned: 0, perfectQuizCount: 0, dailyRewardsCount: 0, streakDays: 0 };
  }
  this.data.fpStats.totalEarned += amount;

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

  console.log("+" + amount + " FP (" + reason + "). Total: " + this.data.frenchPoints);
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





// Utilisé par la paywall pour estimer un "rythme gratuit" simple (min garanti)
StorageManager.prototype.getDailyRewardPoints = function () {
  return DAILY_REWARD_MIN;
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

    const baseQuizId = themeId * 100 + 1;
    if (!Array.isArray(this.data.unlockedQuizzes)) this.data.unlockedQuizzes = [];
    if (!this.data.unlockedQuizzes.includes(baseQuizId)) {
      this.data.unlockedQuizzes.push(baseQuizId);
    }
  });

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

    const baseQuizId = nextThemeId * 100 + 1;
    if (!Array.isArray(this.data.unlockedQuizzes)) this.data.unlockedQuizzes = [];
    if (!this.data.unlockedQuizzes.includes(baseQuizId)) {
      this.data.unlockedQuizzes.push(baseQuizId);
    }
  });

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
  // Theme 1 (Colors) toujours gratuit
  if (themeId === 1) return { canUnlock: true, reason: "FREE" };

  // Coût FIXE du thème ciblé (Theme 2 = 25, Theme 3 = 50, etc.)
  const cost =
    typeof this.getThemeCost === "function"
      ? this.getThemeCost(themeId)
      : this.getUnlockCost(Math.max(0, themeId - 2));

  // Verifier que le theme precedent est debloque
  const previousThemeId = themeId - 1;
  const previousCompleted = this.isThemeUnlocked(previousThemeId);

  if (!previousCompleted) {
    // Game master: pas de coût “actionnable” tant que la marche précédente n’est pas ouverte
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

  const prevTs = this.getLastDailyRewardTimestamp();
  const fpBefore = this.getFrenchPoints();
  const oldLevel = this.getUserLevel();

  let earned = DAILY_REWARD_MIN;
  if (DAILY_REWARD_BONUS_AMOUNT > 0 && DAILY_REWARD_BONUS_CHANCE > 0) {
    if (Math.random() < DAILY_REWARD_BONUS_CHANCE) earned += DAILY_REWARD_BONUS_AMOUNT;
  }

  // Transaction robuste: snapshot + rollback + un seul save
  this.runInTransaction(() => {
    this.addFrenchPoints(earned, "daily_reward", { skipEvents: true });
    this.setLastDailyRewardTimestamp(Date.now());

    if (!this.data.fpStats || typeof this.data.fpStats !== "object") {
      this.data.fpStats = JSON.parse(JSON.stringify(this.defaultData.fpStats));
    }
    this.data.fpStats.dailyRewardsCount = (Number(this.data.fpStats.dailyRewardsCount) || 0) + 1;

    this.updateStreakDaysFromPrevious(prevTs || 0);
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
    streakDays: this.data.fpStats.streakDays,
    nextAt: this.getNextDailyRewardTime()
  });

  return {
    success: true,
    earned: gained,
    fpEarned: gained,
    totalFP: fpAfter,
    nextAt: this.getNextDailyRewardTime(),
    streakDays: this.data.fpStats.streakDays
  };
};





// Legacy - ne plus utiliser (streak coffre géré par updateStreakDaysFromPrevious)
StorageManager.prototype.updateStreakDays = function () {
  return; // deprecated
};


StorageManager.prototype.updateStreakDaysFromPrevious = function (previousTs) {
  const dayKey = (d) => {
    const x = new Date(d);
    return (
      x.getFullYear() +
      "-" +
      String(x.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(x.getDate()).padStart(2, "0")
    );
  };

  const todayKey = dayKey(Date.now());

  // Premier coffre
  if (!previousTs) {
    this.data.fpStats.streakDays = 1;
    this.data.fpStats._lastDailyRewardDayKey = todayKey;
    return;
  }

  const prevKey = dayKey(previousTs);

  if (prevKey === todayKey) {
    this.data.fpStats._lastDailyRewardDayKey = todayKey;
    return;
  }

  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterdayKey = dayKey(y);

  if (prevKey === yesterdayKey) {
    this.data.fpStats.streakDays = (Number(this.data.fpStats.streakDays) || 0) + 1;
  } else {
    this.data.fpStats.streakDays = 1;
  }

  this.data.fpStats._lastDailyRewardDayKey = todayKey;
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

  // Streak badges
  if ((Number(this.data.fpStats?.streakDays) || 0) >= 3 && !this.data.badges.includes("streak-3")) {
    newBadges.push("streak-3");
    this.data.badges.push("streak-3");
  }


  const inTx = typeof this.isInTransaction === "function" ? this.isInTransaction() : false;

  // APRÈS — mapping #1 (dans updateBadges) : mapping remplacé + accolades/retours corrigés
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

  return !!(quizzes && quizzes[id] !== undefined);
};


// APRÈS — storage.js: markQuizCompleted() sans double dispatch incohérent
// Objectif: garder l’event "badges-earned" mais avec payload détaillé (objets) au lieu de strings.

StorageManager.prototype.markQuizCompleted = function (
  themeId,
  quizId,
  score,
  total,
  timeSpent = 0
) {
  const now = new Date();
  const today = this._getLocalDateKey(now);

  // Vérification STRICTE par thème
  const themeStats = this.data.themeStats[themeId];
  const alreadyCompletedInTheme =
    !!(themeStats && themeStats.quizzes && themeStats.quizzes[quizId]);

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
      this.addFrenchPoints(1, "perfect_quiz", { skipEvents: true });
    }

    this.updateThemeStats(themeId, quizId, score, total, timeSpent, now);
    this.updateGlobalStats(score, total, timeSpent, now);
    this.updateStreak(today);

    newBadges = this.updateBadges(score, total, { skipEvents: true });

    this.addToHistory(themeId, quizId, score, total, timeSpent, now);

    if (!this.data.conversionTracking || typeof this.data.conversionTracking !== "object") {
      this.data.conversionTracking = JSON.parse(JSON.stringify(this.defaultData.conversionTracking));
    }
    if (typeof this.data.conversionTracking.premiumQuizCompleted !== "number") {
      this.data.conversionTracking.premiumQuizCompleted = 0;
    }
    if (quizId > 105) {
      this.data.conversionTracking.premiumQuizCompleted++;
    }
  });


  const fpAfter = this.getFrenchPoints();
  const gained = Math.max(0, fpAfter - fpBefore);
  const newLevel = this.getUserLevel();

  // Events FP coherents (ui-features.js ecoute fp-gained et level-up)
  if (gained > 0) {
    this.dispatchFPEvent("fp-gained", { amount: gained, reason: "quiz_completion", total: fpAfter });
  }
  if (newLevel > oldLevel) {
    this.dispatchFPEvent("level-up", { newLevel, oldLevel });
  }

  this.dispatchFPEvent("quiz-completed", { themeId, quizId, score, total, percentage });

  if (newBadges && newBadges.length > 0) {
    this.dispatchFPEvent("badges-earned", { badges: this._formatBadgesForEvent(newBadges) });
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

  // Compat: accepte un objet { themeId, quizId } mais reste optionnel
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

  this.save();
};




// Paywall optimise: 20 min -> 15 min
StorageManager.prototype.shouldTriggerPaywall = function () {
  if (this.isPremiumUser()) return false;
  if (this.data.conversionTracking.paywallShown) return false;

  const sessionDuration = this.getSessionDuration();
  const premiumTasted = this.data.conversionTracking.premiumQuizCompleted > 0;
  const canUnlockResult = this.canUnlockWithFP();
  const canUnlock = canUnlockResult.canUnlock;

  return sessionDuration >= 15 && premiumTasted && !canUnlock;
};

StorageManager.prototype.markPaywallShown = function () {
  this.data.conversionTracking.paywallShown = true;
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

  this.data.userProfile = {
    email: email.trim(),
    firstName: firstName.trim(),
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

  return {
    frenchPoints: this.data.frenchPoints,
    level: levelProgress.level,
    levelProgress: levelProgress,
    isPremium: this.isPremiumUser(),
    completedQuizzes: completedQuizzes,
    completedThemes: this.getCompletedThemesCount(),
    currentStreak: this.data.streak.count,
    bestStreak: this.data.streak.bestStreak,
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
    currentStreak: this.data.streak.count,
    bestStreak: this.data.streak.bestStreak,
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
  return badgeIds.map((id) => ({
    id,
    name:
      id === "perfect" ? "Perfectionist" :
        id === "streak-3" ? "3-day streak" :
          id && String(id).startsWith("fp-") ? `French Points milestone (${String(id).replace("fp-", "")})` :
            "Badge earned",
    description:
      id === "perfect" ? "Scored 100% on a quiz" :
        id === "streak-3" ? "Collected chests 3 days in a row" :
          id && String(id).startsWith("fp-") ? "Reached a French Points milestone" :
            ""
  }));
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

StorageManager.prototype.getUnlockCost = function (premiumQuizCount) {
  const costs = [25, 50, 75, 100];
  return costs[Math.min(premiumQuizCount, costs.length - 1)];
};

// Retourne le coût d'un thème spécifique basé sur sa position (informatif)
// Utilisé pour : roadmap, affichage (futur)
StorageManager.prototype.getThemeCost = function (themeId) {
  if (themeId === 1) return 0; // Colors gratuit
  const stepIndex = themeId - 2; // Theme 2 = step 0
  return this.getUnlockCost(stepIndex);
};

// Compte les themes premium (2..10) deja debloques
StorageManager.prototype.getUnlockedPremiumThemesCount = function () {
  let count = 0;
  for (let themeId = 2; themeId <= 10; themeId++) {
    if (this.isThemeUnlocked(themeId)) count++;
  }
  return count;
};

// Cout du prochain deverrouillage de theme (base sur nb de themes deja unlock)
StorageManager.prototype.getNextThemeUnlockCost = function () {
  return this.getUnlockCost(this.getUnlockedPremiumThemesCount());
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
