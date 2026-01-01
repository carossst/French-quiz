// storage.js - Version 3.0

// Daily reward config
const DAILY_REWARD_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h rolling
const DAILY_REWARD_MIN = 3;
const DAILY_REWARD_BONUS_AMOUNT = 1;
const DAILY_REWARD_BONUS_CHANCE = 0.30;

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
    unlockedQuizzes: [101, 102, 103, 104, 105], // Colors gratuit
    lastDailyReward: null,
    completedQuizzes: [],
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
      sessionStart: Date.now(),
      premiumQuizCompleted: 0,
      paywallShown: false,
      totalQuizAttempted: 0,
      conversionClickedAt: null
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
  }
};

StorageManager.prototype.ensureDataStructure = function () {
  // Arrays / objects critiques
  if (!Array.isArray(this.data.unlockedQuizzes)) {
    this.data.unlockedQuizzes = JSON.parse(JSON.stringify(this.defaultData.unlockedQuizzes));
  }
  if (!this.data.themeStats || typeof this.data.themeStats !== "object") {
    this.data.themeStats = {};
  }
  if (!this.data.streak || typeof this.data.streak !== "object") {
    this.data.streak = JSON.parse(JSON.stringify(this.defaultData.streak));
  }
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
  if (!this.data.globalStats || typeof this.data.globalStats !== "object") {
    this.data.globalStats = JSON.parse(JSON.stringify(this.defaultData.globalStats));
  }
  if (!this.data.userProfile || typeof this.data.userProfile !== "object") {
    this.data.userProfile = JSON.parse(JSON.stringify(this.defaultData.userProfile));
  }

  // Conversion tracking + champs optionnels
  if (!this.data.conversionTracking || typeof this.data.conversionTracking !== "object") {
    this.data.conversionTracking = JSON.parse(JSON.stringify(this.defaultData.conversionTracking));
  }
  if (typeof this.data.conversionTracking.totalQuizAttempted !== "number") {
    this.data.conversionTracking.totalQuizAttempted = 0;
  }
  if (this.data.conversionTracking.conversionClickedAt === undefined) {
    this.data.conversionTracking.conversionClickedAt = null;
  }
};


StorageManager.prototype.save = function () {
  if (!this.initialized) return false;

  try {
    const dataString = JSON.stringify(this.data);

    // Verification taille avant sauvegarde
    if (dataString.length > 5 * 1024 * 1024) {
      console.warn("Storage data too large, attempting cleanup...");
      this.cleanupOldData();
    }

    localStorage.setItem(this.storageKey, dataString);

    // Event pour UI reactivity
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("storage-updated", {
          detail: {
            frenchPoints: this.data.frenchPoints,
            level: this.getUserLevel(),
            isPremium: this.data.isPremiumUser
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
  if (this.data.quizCache) {
    Object.keys(this.data.quizCache).forEach(key => {
      if (this.data.quizCache[key].timestamp < oneWeekAgo) {
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
  return this.data.frenchPoints || 0;
};

StorageManager.prototype.addFrenchPoints = function (amount, reason = "unknown") {
  if (typeof amount !== "number" || amount <= 0) return false;

  // Anti-farming: bloquer les anciens motifs + abus
  if (reason === "correct_answer" || reason === "correct_answers") return false;

  const oldLevel = this.getUserLevel();
  this.data.frenchPoints += amount;
  this.data.fpStats.totalEarned += amount;

  if (reason === "perfect_quiz") {
    this.data.fpStats.perfectQuizCount++;
  }

  const newLevel = this.getUserLevel();

  this.dispatchFPEvent("fp-gained", {
    amount,
    reason,
    total: this.data.frenchPoints
  });

  if (newLevel > oldLevel) {
    this.dispatchFPEvent("level-up", { newLevel, oldLevel });
  }

  this.save();
  console.log("+" + amount + " FP (" + reason + "). Total: " + this.data.frenchPoints);
  return true;
};

StorageManager.prototype.getUserLevel = function () {
  const fp = this.data.frenchPoints || 0;
  return Math.floor(fp / 50) + 1;
};

StorageManager.prototype.getLevelProgress = function () {
  const level = this.getUserLevel();
  const currentLevelFP = (level - 1) * 50;
  const current = this.data.frenchPoints - currentLevelFP;
  const needed = 50;
  const percentage = Math.round((current / needed) * 100);

  return { level, current, needed, percentage };
};

StorageManager.prototype.isPremiumUser = function () {
  return this.data.isPremiumUser || false;
};

StorageManager.prototype.unlockPremiumWithCode = function (code) {
  const validCodes = ["FRENCHCHALLENGE"];

  if (!code || !validCodes.includes(code.trim())) {
    return { success: false, error: "INVALID_CODE" };
  }

  const wasAlreadyPremium = this.isPremiumUser();
  this.data.isPremiumUser = true;
  this.unlockAllQuizzes();

  if (!wasAlreadyPremium) {
    this.addFrenchPoints(25, "premium_unlock");
  }

  this.dispatchFPEvent("premium-unlocked", { wasAlreadyPremium });

  // Declenchement du modal de parrainage si nouveau premium
  if (!wasAlreadyPremium && typeof window !== "undefined") {
    setTimeout(function () {
      const modal = document.getElementById("referral-modal");
      if (modal) {
        modal.classList.remove("hidden");
      }
    }, 2000);
  }

  this.save();

  return {
    success: true,
    wasAlreadyPremium,
    bonusFP: wasAlreadyPremium ? 0 : 25
  };
};

StorageManager.prototype.unlockAllQuizzes = function () {
  const allQuizzes = [];
  for (let theme = 1; theme <= 10; theme++) {
    for (let quiz = 1; quiz <= 5; quiz++) {
      allQuizzes.push(theme * 100 + quiz);
    }
  }
  this.data.unlockedQuizzes = allQuizzes;
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
  // number recommande
  if (
    typeof this.data?.lastDailyRewardAt === "number" &&
    this.data.lastDailyRewardAt > 0
  ) {
    return this.data.lastDailyRewardAt;
  }
  // compat ISO
  if (this.data?.lastDailyReward) {
    const parsed = Date.parse(this.data.lastDailyReward);
    if (!Number.isNaN(parsed)) return parsed;
  }
  // compat localStorage (cle historique)
  const ls = Number(localStorage.getItem("tyf:lastDailyRewardAt") || 0);
  return Number.isFinite(ls) ? ls : 0;
};

StorageManager.prototype.getLastDailyRewardAt = function () {
  return this.getLastDailyRewardTimestamp();
};

StorageManager.prototype.setLastDailyRewardTimestamp = function (ts) {
  this.data.lastDailyRewardAt = ts;
  this.data.lastDailyReward = new Date(ts).toISOString(); // compat ancienne donnee
  localStorage.setItem("tyf:lastDailyRewardAt", String(ts));
  if (typeof this.save === "function") {
    this.save();
  }
};

StorageManager.prototype.getDailyRewardCooldownMs = function () {
  return DAILY_REWARD_COOLDOWN_MS;
};

StorageManager.prototype.getNextDailyRewardTime = function () {
  const last = this.getLastDailyRewardTimestamp();
  return last ? last + this.getDailyRewardCooldownMs() : Date.now();
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
      cost: typeof check.cost === "number" ? check.cost : 0,
      currentFP: this.data.frenchPoints
    };
  }

  // Dépenser FP
  const cost = check.cost;
  this.data.frenchPoints -= cost;

  // Marquer le thème comme débloqué (base quiz)
  const baseQuizId = nextThemeId * 100 + 1;
  if (!this.data.unlockedQuizzes.includes(baseQuizId)) {
    this.data.unlockedQuizzes.push(baseQuizId);
  }

  // IMPORTANT: ne PAS incrémenter premiumQuizCompleted ici (ce n'est pas un quiz complété)

  this.save();

  return {
    success: true,
    cost: cost,
    themeId: nextThemeId,
    remainingFP: this.data.frenchPoints
  };
};


SStorageManager.prototype.isThemeUnlocked = function (themeId) {
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
  return !!(stats && stats.completed > 0);
};

//================================================================================
// ENDREGION: FRENCH POINTS & PREMIUM SYSTEM
//================================================================================

//================================================================================
// REGION: DAILY REWARDS & GAMIFICATION
//================================================================================

StorageManager.prototype.isDailyRewardAvailable = function () {
  return Date.now() >= this.getNextDailyRewardTime();
};

StorageManager.prototype.getAvailableChests = function () {
  // Nouveau modele: un seul coffre toutes les 24 h (0 ou 1)
  return this.isDailyRewardAvailable() ? 1 : 0;
};

StorageManager.prototype.collectDailyReward = function () {
  if (!this.isDailyRewardAvailable()) {
    return {
      success: false,
      reason: "COOLDOWN",
      nextReadyTs: this.getNextDailyRewardTime()
    };
  }

  // Min garanti + bonus interne
  const bonus =
    Math.random() < DAILY_REWARD_BONUS_CHANCE ? DAILY_REWARD_BONUS_AMOUNT : 0;
  const earned = DAILY_REWARD_MIN + bonus;

  this.addFrenchPoints(earned, "daily_reward");
  this.data.fpStats.dailyRewardsCount += 1;

  // Sauvegarder l'ancienne date AVANT de la mettre à jour
  const previousRewardDate = this.data.lastDailyReward;

  // Horodater maintenant (rolling 24h) AVANT updateStreakDays
  this.setLastDailyRewardTimestamp(Date.now());

  // Calculer streak avec l'ancienne date
  this.updateStreakDaysFromPrevious(previousRewardDate);

  this.dispatchFPEvent("daily-reward-collected", {
    chestsCollected: 1,
    fpEarned: earned,
    streakDays: this.data.fpStats.streakDays
  });

  this.save();

  return {
    success: true,
    chestsCollected: 1,
    fpEarned: earned,
    streakDays: this.data.fpStats.streakDays,
    nextReadyTs: this.getNextDailyRewardTime()
  };
};

StorageManager.prototype.updateStreakDays = function () {
  if (this.data.lastDailyReward) {
    const lastDate = new Date(this.data.lastDailyReward);
    const now = new Date();
    const daysDiff = Math.floor(
      (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff === 1) {
      this.data.fpStats.streakDays++;
    } else if (daysDiff > 1) {
      this.data.fpStats.streakDays = 1;
    }
  } else {
    this.data.fpStats.streakDays = 1;
  }
};

StorageManager.prototype.updateStreakDaysFromPrevious = function (previousDate) {
  if (previousDate) {
    const lastDate = new Date(previousDate);
    const now = new Date();
    const daysDiff = Math.floor(
      (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff === 1) {
      this.data.fpStats.streakDays++;
    } else if (daysDiff > 1) {
      this.data.fpStats.streakDays = 1;
    }
  } else {
    this.data.fpStats.streakDays = 1;
  }
};

StorageManager.prototype.getBadges = function () {
  return Array.isArray(this.data.badges) ? [...this.data.badges] : [];
};

StorageManager.prototype.updateBadges = function (score, total) {
  const newBadges = [];

  // FP milestones
  const fp = this.data.frenchPoints;
  const fpMilestones = [100, 250, 500, 1000];

  fpMilestones.forEach(milestone => {
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
  if (this.data.streak.count >= 3 && !this.data.badges.includes("streak-3")) {
    newBadges.push("streak-3");
    this.data.badges.push("streak-3");
  }

  if (newBadges.length > 0) {
    this.dispatchFPEvent("badges-earned", { badges: newBadges });
  }
};

//================================================================================
// REGION: QUIZ COMPLETION & PROGRESSION
//================================================================================

StorageManager.prototype.isQuizCompleted = function (quizId) {
  // Ne pas calculer themeId, le chercher dans les stats
  for (const themeId in this.data.themeStats) {
    if (
      this.data.themeStats[themeId] &&
      this.data.themeStats[themeId].quizzes &&
      this.data.themeStats[themeId].quizzes[quizId] !== undefined
    ) {
      return true;
    }
  }
  return false;
};

StorageManager.prototype.markQuizCompleted = function (
  themeId,
  quizId,
  score,
  total,
  timeSpent = 0
) {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  const isFirstCompletion = !this.isQuizCompleted(quizId);

  if (isFirstCompletion) {
    const percentage = Math.round((score / total) * 100);
    let basePoints = 0;

    // Systeme progressif assez strict
    if (percentage >= 90) {
      basePoints = 6;
    } else if (percentage >= 70) {
      basePoints = 5;
    } else if (percentage >= 50) {
      basePoints = 3;
    } else {
      basePoints = 2;
    }

    // Attribution des points de base
    this.addFrenchPoints(basePoints, "quiz_completion");

    // Bonus perfect score reduit
    if (percentage === 100) {
      this.addFrenchPoints(1, "perfect_quiz");
    }

    this.updateThemeStats(themeId, quizId, score, total, timeSpent, now);
    this.updateGlobalStats(score, total, timeSpent, now);
    this.updateStreak(today);
    this.updateBadges(score, total);
    this.addToHistory(themeId, quizId, score, total, timeSpent, now);

    if (quizId > 105) {
      this.data.conversionTracking.premiumQuizCompleted++;
    }

    this.save();
  }
  return isFirstCompletion;
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

  const wasAlreadyCompleted =
    this.data.themeStats[themeId].quizzes[quizId] !== undefined;

  if (!wasAlreadyCompleted) {
    this.data.themeStats[themeId].completed++;
  }

  this.data.themeStats[themeId].quizzes[quizId] = {
    score: score,
    total: total,
    timeSpent: timeSpent,
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
  this.data.globalStats.totalQuestions += total;
  this.data.globalStats.totalCorrect += score;
  this.data.globalStats.totalTimeSpent += timeSpent;

  if (!this.data.globalStats.firstQuizDate) {
    this.data.globalStats.firstQuizDate = date.toISOString();
  }
  this.data.globalStats.lastQuizDate = date.toISOString();
};

StorageManager.prototype.updateStreak = function (today) {
  if (this.data.streak.lastActiveDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yDate = yesterday.toISOString().split("T")[0];

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

// Paywall optimise: 20 min -> 15 min
StorageManager.prototype.shouldTriggerPaywall = function () {
  if (this.data.isPremiumUser) return false;
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

  return {
    frenchPoints: this.data.frenchPoints,
    level: levelProgress.level,
    levelProgress: levelProgress,
    isPremium: this.data.isPremiumUser,
    completedQuizzes: completedQuizzes,
    completedThemes: this.getCompletedThemesCount(),
    currentStreak: this.data.streak.count,
    bestStreak: this.data.streak.bestStreak,
    accuracy: this.getGlobalAccuracy(),
    badges: this.data.badges.length,
    dailyReward: {
      available: this.isDailyRewardAvailable(),
      chests: this.getAvailableChests()
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
    isPremium: this.data.isPremiumUser,
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
  return Object.values(this.data.themeStats).reduce(function (sum, theme) {
    return sum + (theme.completed || 0);
  }, 0);
};

StorageManager.prototype.getCompletedThemesCount = function () {
  return Object.values(this.data.themeStats).filter(function (theme) {
    return theme && theme.completed >= 5;
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

StorageManager.prototype.dispatchFPEvent = function (eventName, detail) {
  if (typeof window === "undefined") return;

  try {
    window.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
  } catch (error) {
    console.error("Event dispatch failed: " + eventName, error);
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
// Ne change PAS la logique de canUnlockTheme (qui reste "next unlock cost")
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

// Fin du fichier StorageManager

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

