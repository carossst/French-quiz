// ui-charts.js v3.1 - Simplified stats UI (aligned with UICore v3.1)

// Debug logger (respects global debug config)
const _chartsLog =
  window.TYF_CONFIG?.debug?.enabled && window.TYF_CONFIG?.debug?.charts !== false
    ? (...args) => console.log("[UICharts]", ...args)
    : () => { };

// Constructor
function UICharts(uiCore, storageManager, resourceManager) {
  if (!uiCore || !storageManager || !resourceManager) {
    throw new Error("UICharts: missing dependencies");
  }
  this.uiCore = uiCore;
  this.storageManager = storageManager;
  this.resourceManager = resourceManager;

  _chartsLog("UICharts v3.1 initialized");
}

/* -------------------------------------------------------------------------
 * Public API expected by UICore
 * ------------------------------------------------------------------------- */

// Called by UICore.showStatsScreen() to generate the full stats HTML
UICharts.prototype.generateFullStatsPage = function () {
  const viz = this.storageManager.getVisualizationData
    ? this.storageManager.getVisualizationData()
    : {
      frenchPoints: 0,
      completedQuizzes: 0,
      globalAccuracy: 0,
      badges: [],
      history: [],
      level: 1
    };

  const uiState = this.storageManager.getUIState
    ? this.storageManager.getUIState()
    : {
      frenchPoints: viz.frenchPoints,
      level: viz.level,
      currentStreak: 0,
      bestStreak: 0,
      completedQuizzes: viz.completedQuizzes,
      accuracy: viz.globalAccuracy,
      badges: Array.isArray(viz.badges) ? viz.badges.length : 0,
      totalTimeSpent: 0
    };

  const layout = this._getLayoutInfo();
  const historyItems = Array.isArray(viz.history) ? viz.history : [];
  const recentHistory = this._normalizeHistory(historyItems).slice(0, 8);
  const hasHistory = recentHistory.length > 0;
  const hasBadges =
    (Array.isArray(viz.badges) && viz.badges.length > 0) || uiState.badges > 0;

  return `
  <div id="stats-root"
       class="bg-gradient-to-br from-blue-50 to-purple-50"
       role="main"
       aria-label="Your French stats"
       style="height:calc(100vh - var(--tyf-header-h,0px)); overflow:auto;">
    <div class="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-4 ${layout.stackColumns ? "" : "lg:flex-row"
    }">
      
      <!-- Main column -->
      <section class="${layout.stackColumns ? "" : "flex-1"
    } flex flex-col gap-4 min-h-0">
        ${this._renderStatsHeader(uiState)}
        ${this._renderSummaryCards(uiState)}
        ${this._renderPremiumCTA(uiState)}
      </section>

      <!-- Side column -->
      <aside class="${layout.stackColumns ? "" : "w-full lg:w-80"
    } flex flex-col gap-4 min-h-0">
        ${hasHistory ? this._renderRecentHistory(recentHistory) : this._renderEmptyHistory()}
        ${hasBadges ? this._renderBadges(viz.badges, uiState.badges) : ""}
      </aside>
    </div>
  </div>`;
};

// Called after HTML is in the DOM
UICharts.prototype.loadDetailedStats = function () {
  _chartsLog("loadDetailedStats()");
  this._wireStatsEvents();
};

/* -------------------------------------------------------------------------
 * Layout + helpers
 * ------------------------------------------------------------------------- */

UICharts.prototype._getLayoutInfo = function () {
  const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
  const H = window.innerHeight || 0;
  const stack = !isDesktop || H < 640;
  return { stackColumns: stack };
};

UICharts.prototype._wireStatsEvents = function () {
  const backBtn = document.getElementById("back-to-welcome-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      try {
        this.uiCore.showWelcomeScreen();
      } catch (e) {
        _chartsLog("Error returning to welcome:", e);
      }
    });
  }

  const continueFreeBtn = document.getElementById("stats-continue-free-btn");
  if (continueFreeBtn) {
    continueFreeBtn.addEventListener("click", () => {
      // Just close stats and go back home
      try {
        this.uiCore.showWelcomeScreen();
      } catch (e) {
        _chartsLog("Error on continue-free:", e);
      }
    });
  }
};

/* -------------------------------------------------------------------------
 * Header + summary
 * ------------------------------------------------------------------------- */

UICharts.prototype._renderStatsHeader = function (uiState) {
  const name =
    (this.storageManager.getUserDisplayName &&
      this.storageManager.getUserDisplayName()) ||
    "Player";

  const level = Number(uiState.level) || 1;
  const streak = Number(uiState.currentStreak) || 0;
  const bestStreak = Number(uiState.bestStreak) || 0;

  let streakText = "Start your streak today.";
  if (streak > 0 && bestStreak <= streak) {
    streakText = `New record streak: ${streak} day${streak > 1 ? "s" : ""} of activity.`;
  } else if (streak > 0) {
    streakText = `Current streak: ${streak} day${streak > 1 ? "s" : ""
      }. Best: ${bestStreak} days.`;
  }

  return `
    <header class="theme-card flex items-center justify-between gap-4">
      <div>
        <h1 class="text-xl md:text-2xl font-bold text-gray-900 mb-1">
          Your French progress
        </h1>
        <p class="text-sm text-gray-700">
          ${this._escapeHTML(name)}, you are currently at <span class="font-semibold">Level ${level}</span>.
        </p>
        <p class="text-xs text-gray-500 mt-1">
          ${streakText}
        </p>
      </div>
      <button id="back-to-welcome-btn"
              class="quiz-button whitespace-nowrap">
        Back to home
      </button>
    </header>`;
};

UICharts.prototype._renderSummaryCards = function (uiState) {
  const fp = Number(uiState.frenchPoints) || 0;
  const level = Number(uiState.level) || 1;
  const accuracy = Number(uiState.accuracy) || 0;
  const completed = Number(uiState.completedQuizzes) || 0;
  const totalTime = Number(uiState.totalTimeSpent) || 0;

  const hours = totalTime / 3600;
  const friendlyTime =
    hours < 1
      ? `${Math.round(totalTime / 60)} min`
      : `${hours.toFixed(1)} h`;

  const levelLabel = this._getLevelLabel(level, accuracy, completed);
  const accLabel =
    accuracy >= 80
      ? "You understand most authentic French in this context."
      : accuracy >= 60
        ? "You can manage real-life situations, with some gaps."
        : accuracy >= 40
          ? "You are building a foundation in real French."
          : "You are discovering authentic French – keep going.";

  return `
    <section aria-label="Key stats" class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <article class="theme-card text-center">
        <div class="text-xs text-gray-500 mb-1 uppercase tracking-wide">Level</div>
        <div class="text-2xl font-bold text-blue-700 mb-1">${level}</div>
        <div class="text-xs text-gray-600">
          ${levelLabel}
        </div>
      </article>

      <article class="theme-card text-center">
        <div class="text-xs text-gray-500 mb-1 uppercase tracking-wide">French Points</div>
        <div class="text-2xl font-bold text-purple-700 mb-1">${fp}</div>
        <div class="text-xs text-gray-600">
          Earned by completing authentic quizzes.
        </div>
      </article>

      <article class="theme-card text-center">
        <div class="text-xs text-gray-500 mb-1 uppercase tracking-wide">Accuracy</div>
        <div class="text-2xl font-bold text-green-700 mb-1">${accuracy}%</div>
        <div class="text-xs text-gray-600">
          ${accLabel}
        </div>
      </article>

      <article class="theme-card text-center">
        <div class="text-xs text-gray-500 mb-1 uppercase tracking-wide">Assessments</div>
        <div class="text-2xl font-bold text-amber-700 mb-1">${completed}</div>
        <div class="text-xs text-gray-600">
          ${friendlyTime} of focused practice.
        </div>
      </article>
    </section>`;
};

UICharts.prototype._getLevelLabel = function (level, accuracy, completed) {
  if (completed < 3) return "Keep testing to stabilise your level.";
  if (accuracy >= 80) return "Authentic usage is becoming natural.";
  if (accuracy >= 60) return "You manage most everyday situations in French.";
  if (accuracy >= 40) return "You are on your way – keep going.";
  return "Each quiz gives you a clearer picture.";
};

/* -------------------------------------------------------------------------
 * Premium CTA
 * ------------------------------------------------------------------------- */

UICharts.prototype._renderPremiumCTA = function (uiState) {
  const isPremium = !!uiState.isPremium;
  const completed = Number(uiState.completedQuizzes) || 0;

  if (isPremium) {
    return `
      <section aria-label="Premium active" class="theme-card flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <span class="text-3xl">🔓</span>
          <div class="text-left">
            <h2 class="text-base md:text-lg font-bold text-gray-900">Premium access active</h2>
            <p class="text-xs md:text-sm text-gray-700">
              You can now explore all quiz themes freely and track your progress everywhere.
            </p>
          </div>
        </div>
        <div class="text-xs text-gray-500">
          Keep completing authentic quizzes to consolidate your level.
        </div>
      </section>`;
  }

  let subtitle =
    "Your time is valuable. Unlock every quiz for the price of a few coffees.";
  if (completed === 0) {
    subtitle =
      "Start with free quizzes. Upgrade to explore every domain of daily French.";
  } else if (completed >= 10) {
    subtitle =
      "You are investing serious effort. Premium lets you channel it into all key domains.";
  }

  return `
    <section aria-label="Premium upgrade" class="theme-card flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <span class="text-3xl">⭐</span>
        <div class="text-left">
          <h2 class="text-base md:text-lg font-bold text-gray-900">
            Unlock all quiz themes - $12
          </h2>
          <p class="text-xs md:text-sm text-gray-700">
            ${subtitle}
          </p>
        </div>
      </div>
      <div class="flex flex-col items-stretch gap-2 w-full md:w-auto">
        <a href="${window.TYF_CONFIG?.stripePaymentUrl || "https://buy.stripe.com/"
    }"
           class="quiz-button text-center">
          Get full access
        </a>
        <button type="button"
                class="text-xs text-gray-500 hover:text-gray-700 underline"
                id="stats-continue-free-btn">
          Continue with free path
        </button>
      </div>
    </section>`;
};

/* -------------------------------------------------------------------------
 * History
 * ------------------------------------------------------------------------- */

UICharts.prototype._normalizeHistory = function (history) {
  if (!Array.isArray(history)) return [];
  const items = history
    .filter((item) => item && item.themeId != null)
    .map((item) => {
      const ts = Date.parse(item.date || "");
      let accuracy = 0;
      if (typeof item.accuracy === "number") {
        accuracy = Math.round(item.accuracy);
      } else if (
        Number.isFinite(item.score) &&
        Number.isFinite(item.total) &&
        item.total > 0
      ) {
        accuracy = Math.round((item.score / item.total) * 100);
      }

      return {
        ...item,
        _ts: Number.isFinite(ts) ? ts : 0,
        accuracy
      };
    });

  items.sort((a, b) => b._ts - a._ts);
  return items;
};

UICharts.prototype._renderRecentHistory = function (items) {
  const rows = items.map((item) => this._renderHistoryRow(item)).join("");

  return `
    <section aria-label="Recent assessments" class="theme-card">
      <h2 class="text-sm font-bold text-gray-900 mb-2">
        Recent assessments
      </h2>
      <div class="space-y-1 max-h-80 overflow-auto pr-1">
        ${rows}
      </div>
    </section>`;
};

UICharts.prototype._renderEmptyHistory = function () {
  return `
    <section aria-label="Recent assessments" class="theme-card">
      <h2 class="text-sm font-bold text-gray-900 mb-2">
        Recent assessments
      </h2>
      <p class="text-xs text-gray-600">
        Your results will appear here once you complete your first quizzes.
      </p>
    </section>`;
};

UICharts.prototype._renderHistoryRow = function (item) {
  const themeName = this._getThemeName(item.themeId);
  const quizLabel = this._getQuizLabel(item.themeId, item.quizId);
  const accuracy = Number(item.accuracy) || 0;

  const sentiment =
    accuracy >= 80 ? "🌟" : accuracy >= 60 ? "✅" : accuracy >= 40 ? "📈" : "🧭";

  let timeAgo = "Recently";
  if (item.date) {
    const ts = Date.parse(item.date);
    if (Number.isFinite(ts)) {
      const hours = Math.floor((Date.now() - ts) / 3600000);
      if (hours < 1) timeAgo = "Now";
      else if (hours < 24) timeAgo = "Today";
      else timeAgo = `${Math.floor(hours / 24)}d ago`;
    }
  }

  return `
    <article class="flex items-center gap-2 p-2 bg-gray-50 rounded mb-1 last:mb-0">
      <span class="text-lg">${sentiment}</span>
      <div class="flex-1 min-w-0">
        <div class="flex justify-between gap-2 text-xs">
          <span class="font-semibold text-gray-800 truncate">
            ${this._escapeHTML(themeName)}
          </span>
          <span class="text-gray-500 whitespace-nowrap">
            ${timeAgo}
          </span>
        </div>
        <div class="flex justify-between gap-2 text-xs mt-0.5">
          <span class="text-gray-600 truncate">
            ${this._escapeHTML(quizLabel)}
          </span>
          <span class="font-semibold ${accuracy >= 80
      ? "text-green-600"
      : accuracy >= 60
        ? "text-blue-600"
        : accuracy >= 40
          ? "text-amber-600"
          : "text-red-600"
    }">
            ${accuracy}%
          </span>
        </div>
      </div>
    </article>`;
};

UICharts.prototype._getThemeName = function (themeId) {
  if (!Number.isFinite(Number(themeId))) return "Theme";
  const id = Number(themeId);

  // Prefer UICore theme index if available
  const themes = Array.isArray(this.uiCore.themeIndexCache)
    ? this.uiCore.themeIndexCache
    : null;

  if (themes) {
    const found = themes.find((t) => Number(t.id) === id);
    if (found && found.name) return String(found.name);
  }

  return `Theme ${id}`;
};

UICharts.prototype._getQuizLabel = function (themeId, quizId) {
  if (!Number.isFinite(Number(quizId))) return "Quiz";
  const tId = Number(themeId);
  const qId = Number(quizId);

  // Try to resolve from UICore themeIndexCache if quizzes metadata exists
  const themes = Array.isArray(this.uiCore.themeIndexCache)
    ? this.uiCore.themeIndexCache
    : null;

  if (themes) {
    const theme = themes.find((t) => Number(t.id) === tId);
    if (theme && Array.isArray(theme.quizzes)) {
      const quiz = theme.quizzes.find((q) => Number(q.id) === qId);
      if (quiz && quiz.name) return String(quiz.name);
    }
  }

  const shortId = qId % 100;
  return `Quiz ${shortId || qId}`;
};

/* -------------------------------------------------------------------------
 * Badges
 * ------------------------------------------------------------------------- */

UICharts.prototype._renderBadges = function (
  badgesArray,
  badgesCountFromUIState
) {
  const count = Array.isArray(badgesArray)
    ? badgesArray.length
    : Number(badgesCountFromUIState) || 0;
  if (count <= 0) return "";

  const badgeList = Array.isArray(badgesArray) ? badgesArray : [];
  const rendered = badgeList
    .slice(0, 8)
    .map((id) => this._renderSingleBadge(id))
    .join("");

  return `
    <section aria-label="Badges" class="theme-card">
      <h2 class="text-sm font-bold text-gray-900 mb-2">
        Badges (${count})
      </h2>
      <div class="flex flex-wrap gap-2">
        ${rendered}
      </div>
    </section>`;
};

UICharts.prototype._renderSingleBadge = function (badgeId) {
  const id = String(badgeId || "");
  let icon = "🏅";
  let label = "Badge earned";

  if (id === "first-quiz") {
    icon = "🎯";
    label = "First quiz completed";
  } else if (id === "perfect") {
    icon = "💯";
    label = "Perfect score";
  } else if (id === "streak-3") {
    icon = "🔥";
    label = "3-day streak";
  }

  return `
    <div class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 border border-blue-100 text-xs text-blue-700">
      <span>${icon}</span>
      <span>${this._escapeHTML(label)}</span>
    </div>`;
};

/* -------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------- */

UICharts.prototype._escapeHTML = function (str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

UICharts.prototype.updateStat = function (id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

// Optional init hook (kept for backward compatibility)
UICharts.prototype.init = function () {
  _chartsLog("UICharts.init()");
};

// Expose globally
window.UICharts = UICharts;
