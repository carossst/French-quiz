// ui-charts.js - v3.0- Stats screen (no streak UI) + badges filtered + KISS charts (coherent with UICore/UIFeatures)
(function (global) {
  function UICharts(uiCore, storageManager, resourceManager) {
    if (!uiCore) throw new Error("UICharts: uiCore is required");
    if (!storageManager) throw new Error("UICharts: storageManager is required");
    if (!resourceManager) throw new Error("UICharts: resourceManager is required");

    this.uiCore = uiCore;
    this.storageManager = storageManager;
    this.resourceManager = resourceManager;

    this._loaded = false;
  }

  UICharts.prototype.generateFullStatsPage = function () {
    var uiState = {};
    try {
      uiState =
        (this.storageManager.getUIState && this.storageManager.getUIState()) || {};
    } catch (e) {
      uiState = {};
    }

    var viz = {};
    try {
      viz =
        (this.storageManager.getVisualizationData &&
          this.storageManager.getVisualizationData()) ||
        {};
    } catch (e) {
      viz = {};
    }

    var header = this._renderStatsHeader(uiState);
    var overview = this._renderOverviewCards(uiState, viz);
    var badges = this._renderBadges(viz.badges);
    var history = this._renderHistory(viz.history);

    return (
      '\n<div class="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50" role="main" aria-label="Statistics">' +
      '\n  <div class="max-w-6xl mx-auto px-4 pt-6 pb-10 space-y-4">' +
      header +
      overview +
      badges +
      history +
      "\n  </div>" +
      "\n</div>\n"
    );
  };

  UICharts.prototype.loadDetailedStats = function () {
    // KISS: no async data fetch for now. Keep the hook for future.
    this._loaded = true;
    return Promise.resolve();
  };

  // ----------------------------------------
  // HEADER (NO STREAK)
  // ----------------------------------------
  UICharts.prototype._renderStatsHeader = function (uiState) {
    var name = "Player";
    try {
      if (
        this.storageManager.getUserDisplayName &&
        typeof this.storageManager.getUserDisplayName === "function"
      ) {
        name = this.storageManager.getUserDisplayName() || "Player";
      }
    } catch (e) {
      name = "Player";
    }

    var level = Number(uiState.level) || Number(uiState.userLevel) || 1;

    // Prefer source of truth (used by XP header)
    try {
      if (this.storageManager && typeof this.storageManager.getUserLevel === "function") {
        var lvl = this.storageManager.getUserLevel();
        if (typeof lvl === "number" && Number.isFinite(lvl) && lvl > 0) level = lvl;
      }
    } catch (e) { }

    return (
      '\n<header class="theme-card flex flex-col md:flex-row md:items-center md:justify-between gap-3">' +
      '\n  <div>' +
      '\n    <h1 class="text-xl md:text-2xl font-bold text-gray-900 mb-1">Your French progress</h1>' +
      '\n    <p class="text-sm text-gray-700">' +
      this._escapeHTML(name) +
      ', you are currently at <span class="font-semibold">Level ' +
      this._escapeHTML(String(level)) +
      "</span>." +
      "\n    </p>" +
      '\n    <p class="text-xs text-gray-500 mt-1">Keep going. Consistency beats intensity.</p>' +
      "\n  </div>" +
      '\n  <button id="back-to-welcome-btn" class="quiz-button whitespace-nowrap">Back to home</button>' +
      "\n</header>"
    );
  };

  // ----------------------------------------
  // OVERVIEW
  // ----------------------------------------
  UICharts.prototype._renderOverviewCards = function (uiState, viz) {
    var fp = Number(uiState.frenchPoints);
    if (!Number.isFinite(fp)) fp = Number(viz.frenchPoints) || 0;

    // Prefer storageManager source of truth when available
    try {
      if (this.storageManager && typeof this.storageManager.getFrenchPoints === "function") {
        var smfp = this.storageManager.getFrenchPoints();
        if (typeof smfp === "number" && Number.isFinite(smfp)) fp = smfp;
      }
    } catch (e) { }

    var completedQuizzes = Number(uiState.completedQuizzes);
    if (!Number.isFinite(completedQuizzes))
      completedQuizzes = Number(viz.completedQuizzes) || 0;

    var accuracy = Number(uiState.accuracy);
    if (!Number.isFinite(accuracy)) accuracy = Number(viz.globalAccuracy) || 0;

    var totalTimeSpent = Number(uiState.totalTimeSpent);
    if (!Number.isFinite(totalTimeSpent)) totalTimeSpent = Number(viz.totalTimeSpent) || 0;


    var perfect = Number(uiState.perfectQuizzes);
    if (!Number.isFinite(perfect)) perfect = Number(viz.perfectQuizzes) || 0;

    // Source of truth for premium: storageManager.isPremiumUser()
    var isPremium = false;
    try {
      if (this.storageManager && typeof this.storageManager.isPremiumUser === "function") {
        isPremium = !!this.storageManager.isPremiumUser();
      } else {
        isPremium = !!(uiState.isPremiumUser || uiState.isPremium);
      }
    } catch (e) {
      isPremium = !!(uiState.isPremiumUser || uiState.isPremium);
    }

    return (
      '\n<section aria-label="Overview" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">' +
      this._renderStatCard("French Points", String(fp), "Unlock themes faster") +
      this._renderStatCard("Quizzes completed", String(completedQuizzes), "Build a real history") +
      this._renderStatCard("Average accuracy", String(accuracy) + "%", "Track your level") +
      this._renderStatCard("Perfect quizzes", String(perfect), "100% score") +
      "\n</section>" +
      this._renderMiniCharts(fp, completedQuizzes, accuracy, totalTimeSpent, isPremium)
    );
  };

  UICharts.prototype._renderStatCard = function (title, value, hint) {
    return (
      '\n<div class="theme-card">' +
      '\n  <div class="text-xs text-gray-600 mb-1">' +
      this._escapeHTML(title) +
      "</div>" +
      '\n  <div class="text-2xl font-bold text-gray-900 mb-1">' +
      this._escapeHTML(value) +
      "</div>" +
      '\n  <div class="text-xs text-gray-500">' +
      this._escapeHTML(hint || "") +
      "</div>" +
      "\n</div>"
    );
  };

  // Simple, dependency-free mini charts (SVG bars)
  UICharts.prototype._renderMiniCharts = function (
    fp,
    completedQuizzes,
    accuracy,
    totalTimeSpent,
    isPremium
  ) {
    // Prefer source of truth from storageManager.getLevelProgress()
    var fpPct = null;
    var nextLabel = null;

    try {
      if (this.storageManager && typeof this.storageManager.getLevelProgress === "function") {
        var lp = this.storageManager.getLevelProgress();

        if (lp && typeof lp.percentage === "number" && Number.isFinite(lp.percentage)) {
          fpPct = this._clamp(Math.round(lp.percentage), 0, 100);
        }

        if (lp && typeof lp.remaining === "number" && Number.isFinite(lp.remaining)) {
          nextLabel = String(Math.max(0, lp.remaining));
        } else if (
          lp &&
          typeof lp.needed === "number" && Number.isFinite(lp.needed) &&
          typeof lp.current === "number" && Number.isFinite(lp.current)
        ) {
          nextLabel = String(Math.max(0, lp.needed - lp.current));
        }
      }
    } catch (e) { }

    // Fallback ONLY if StorageManager cannot provide level progress.
    // If one is missing, recompute both to keep the UI coherent.
    if (fpPct == null || nextLabel == null) {
      var fpPerLevel = null;

      try {
        if (this.storageManager && typeof this.storageManager.getFpPerLevel === "function") {
          var v = this.storageManager.getFpPerLevel();
          if (typeof v === "number" && Number.isFinite(v) && v > 0) fpPerLevel = v;
        } else if (global.TYF_CONFIG && typeof global.TYF_CONFIG.fpPerLevel === "number") {
          var c = Number(global.TYF_CONFIG.fpPerLevel);
          if (Number.isFinite(c) && c > 0) fpPerLevel = c;
        }
      } catch (e) { }

      if (fpPerLevel == null) fpPerLevel = 100;

      var fpNum = Number(fp);
      if (!Number.isFinite(fpNum) || fpNum < 0) fpNum = 0;

      var within = fpNum % fpPerLevel;

      fpPct = this._clamp(Math.round((within / fpPerLevel) * 100), 0, 100);
      nextLabel = String(Math.max(0, fpPerLevel - within));
    }

    var safeNextLabel = (nextLabel == null) ? "0" : String(nextLabel);

    var accPct = this._clamp(Math.round(Number(accuracy) || 0), 0, 100);
    var timeLabel = this._formatMinutes(totalTimeSpent);

    void completedQuizzes;

    return (
      '\n<section aria-label="Quick charts" class="grid grid-cols-1 lg:grid-cols-2 gap-3">' +
      '\n  <div class="theme-card">' +
      '\n    <div class="flex items-center justify-between mb-2">' +
      '\n      <div class="text-sm font-bold text-gray-900">Level progress</div>' +
      '\n      <div class="text-xs text-gray-500">Next level in ' +
      this._escapeHTML(safeNextLabel) +
      ' FP</div>' +
      '\n    </div>' +
      this._renderBarSVG(fpPct) +
      '\n    <div class="text-xs text-gray-500 mt-2">You are ' +
      this._escapeHTML(String(fpPct)) +
      '% through the current level.</div>' +
      '\n  </div>' +
      '\n  <div class="theme-card">' +
      '\n    <div class="flex items-center justify-between mb-2">' +
      '\n      <div class="text-sm font-bold text-gray-900">Accuracy</div>' +
      '\n      <div class="text-xs text-gray-500">Time spent: ' +
      this._escapeHTML(timeLabel) +
      '</div>' +
      '\n    </div>' +
      this._renderBarSVG(accPct) +
      '\n    <div class="text-xs text-gray-500 mt-2">Your average accuracy is ' +
      this._escapeHTML(String(accPct)) +
      '%.</div>' +
      '\n  </div>' +
      '\n</section>' +
      (isPremium ? '' : this._renderPremiumNudgeCard())
    );
  };



  UICharts.prototype._renderBarSVG = function (pct) {
    // Decorative chart (text already provides the value)
    var w = 320;
    var h = 12;
    var p = Number(pct);
    if (!Number.isFinite(p)) p = 0;
    p = Math.max(0, Math.min(100, p));
    var fill = Math.round((w * p) / 100);

    return (
      '\n<div class="w-full overflow-hidden text-blue-600" aria-hidden="true">' +
      '\n  <svg viewBox="0 0 ' +
      w +
      " " +
      h +
      '" width="100%" height="' +
      h +
      '">' +
      '\n    <rect x="0" y="0" width="' +
      w +
      '" height="' +
      h +
      '" rx="6" ry="6" fill="rgba(0,0,0,0.08)"></rect>' +
      '\n    <rect x="0" y="0" width="' +
      fill +
      '" height="' +
      h +
      '" rx="6" ry="6" fill="currentColor"></rect>' +
      "\n  </svg>" +
      "\n</div>"
    );
  };



  UICharts.prototype._renderPremiumNudgeCard = function () {
    var stripeUrl = global.TYF_CONFIG && global.TYF_CONFIG.stripePaymentUrl
      ? String(global.TYF_CONFIG.stripePaymentUrl)
      : "";

    if (!stripeUrl) return "";

    return (
      '\n<section aria-label="Premium" class="theme-card">' +
      '\n  <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">' +
      '\n    <div>' +
      '\n      <div class="text-sm font-bold text-gray-900">Want everything unlocked?</div>' +
      '\n      <div class="text-xs text-gray-600 mt-1">One-time $12. No subscription.</div>' +
      "\n    </div>" +
      '\n    <a href="' +
      this._escapeAttr(stripeUrl) +
      '" class="quiz-button whitespace-nowrap text-center">' +
      "Get Premium" +
      "</a>" +
      "\n  </div>" +
      "\n</section>"
    );
  };

  // ----------------------------------------
  // BADGES (FILTER STREAK)
  // ----------------------------------------
  UICharts.prototype._renderBadges = function (badgesArray) {
    var badgeListRaw = Array.isArray(badgesArray) ? badgesArray : [];

    // Hide streak-related badges in Stats UI (storage keeps them)
    var badgeList = badgeListRaw.filter(function (id) {
      return !/^streak-\d+$/i.test(String(id || ""));
    });

    // If we have no explicit list, do not show the section (avoid misleading counts)
    if (!badgeList || badgeList.length <= 0) return "";

    var maxBadges = 10;
    var shownBadges = badgeList.slice(0, maxBadges);

    var rendered = shownBadges
      .map(this._renderSingleBadge.bind(this))
      .join("");

    var badgeCountLabel =
      badgeList.length > maxBadges
        ? String(maxBadges) + "/" + String(badgeList.length)
        : String(badgeList.length);

    return (
      '\n<section aria-label="Badges" class="theme-card">' +
      '\n  <div class="flex items-center justify-between mb-2">' +
      '\n    <h2 class="text-sm font-bold text-gray-900">Badges (' +
      this._escapeHTML(badgeCountLabel) +
      ")</h2>" +
      "\n  </div>" +
      '\n  <div class="flex flex-wrap gap-2">' +
      rendered +
      "\n  </div>" +
      "\n</section>"
    );

  };

  UICharts.prototype._renderSingleBadge = function (badgeId) {
    var id = String(badgeId || "");
    var icon = "🏅";
    var label = "Badge earned";

    if (id === "perfect") {
      icon = "💯";
      label = "Perfect score";
    } else if (/^fp-\d+$/i.test(id)) {
      icon = "✨";
      label = "French Points milestone";
      var n = Number(id.split("-")[1]);
      if (Number.isFinite(n)) label = n + " French Points";
    } else if (id === "first-quiz") {
      icon = "🎯";
      label = "First quiz completed";
    }

    return (
      '\n  <div class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 border border-blue-100 text-xs text-blue-700">' +
      "\n    <span>" +
      this._escapeHTML(icon) +
      "</span>" +
      "\n    <span>" +
      this._escapeHTML(label) +
      "</span>" +
      "\n  </div>"
    );
  };

  // ----------------------------------------
  // HISTORY (SIMPLE, READABLE)
  // ----------------------------------------
  UICharts.prototype._renderHistory = function (historyArray) {
    var list = Array.isArray(historyArray) ? historyArray : [];
    if (list.length <= 0) {
      return (
        '\n<section aria-label="History" class="theme-card">' +
        '\n  <h2 class="text-sm font-bold text-gray-900 mb-2">History</h2>' +
        '\n  <div class="text-sm text-gray-600">No completed quizzes yet. Finish a quiz to see your history here.</div>' +
        "\n</section>"
      );
    }

    var maxRows = 20;
    var shown = list.slice(0, maxRows);

    var rows = shown
      .map(this._renderHistoryRow.bind(this))
      .join("");

    var title =
      list.length > maxRows ? "Recent activity (last " + maxRows + ")" : "Recent activity";

    return (
      '\n<section aria-label="History" class="theme-card">' +
      '\n  <h2 class="text-sm font-bold text-gray-900 mb-2">' +
      this._escapeHTML(title) +
      "</h2>" +
      '\n  <div class="overflow-x-auto">' +
      '\n    <table class="min-w-full text-sm">' +
      '\n      <thead>' +
      '\n        <tr class="text-left text-xs text-gray-500 border-b">' +
      '\n          <th class="py-2 pr-4">Date</th>' +
      '\n          <th class="py-2 pr-4">Theme</th>' +
      '\n          <th class="py-2 pr-4">Quiz</th>' +
      '\n          <th class="py-2 pr-4">Score</th>' +
      '\n          <th class="py-2">Accuracy</th>' +
      "\n        </tr>" +
      "\n      </thead>" +
      '\n      <tbody class="divide-y divide-gray-100">' +
      rows +
      "\n      </tbody>" +
      "\n    </table>" +
      "\n  </div>" +
      "\n</section>"
    );
  };

  UICharts.prototype._renderHistoryRow = function (entry) {
    var dateIso = entry && entry.date ? entry.date : "";
    var dateLabel = this._formatDate(dateIso);

    var themeId = entry && entry.themeId != null ? Number(entry.themeId) : NaN;
    var quizId = entry && entry.quizId != null ? Number(entry.quizId) : NaN;

    var score = entry && typeof entry.score === "number" ? entry.score : null;
    var total = entry && typeof entry.total === "number" ? entry.total : null;

    var acc = entry && typeof entry.accuracy === "number" ? entry.accuracy : null;

    var themeName = this._getThemeName(themeId);

    return (
      "\n<tr>" +
      '\n  <td class="py-2 pr-4 text-gray-700 whitespace-nowrap">' +
      this._escapeHTML(dateLabel || "-") +
      "</td>" +
      '\n  <td class="py-2 pr-4 text-gray-700">' +
      this._escapeHTML(themeName) +
      "</td>" +
      '\n  <td class="py-2 pr-4 text-gray-700">' +
      (Number.isFinite(quizId) ? this._escapeHTML(String(quizId)) : "-") +
      "</td>" +
      '\n  <td class="py-2 pr-4 text-gray-700">' +
      (score != null && total != null
        ? this._escapeHTML(String(score) + "/" + String(total))
        : "-") +
      "</td>" +
      '\n  <td class="py-2 text-gray-700">' +
      (acc != null ? this._escapeHTML(String(acc) + "%") : "-") +
      "</td>" +
      "\n</tr>"
    );
  };

  UICharts.prototype._getThemeName = function (themeId) {
    if (!Number.isFinite(themeId)) return "Theme";

    try {
      if (this.resourceManager && typeof this.resourceManager.getThemeById === "function") {
        var t = this.resourceManager.getThemeById(themeId);
        if (t && t.name) return String(t.name);
      }
    } catch (e) { }

    return "Theme " + themeId;
  };



  // ----------------------------------------
  // HELPERS
  // ----------------------------------------
  UICharts.prototype._escapeHTML = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  UICharts.prototype._escapeAttr = function (s) {
    // Same as HTML escape for safety in attributes
    return this._escapeHTML(s);
  };

  UICharts.prototype._clamp = function (n, min, max) {
    var x = Number(n);
    if (!Number.isFinite(x)) x = 0;
    return Math.max(min, Math.min(max, x));
  };

  UICharts.prototype._formatDate = function (isoOrTs) {
    if (isoOrTs == null || isoOrTs === "") return "";

    var d = null;

    // Accept ISO strings OR timestamps (number or numeric string)
    if (typeof isoOrTs === "number") {
      d = new Date(isoOrTs);
    } else {
      var s = String(isoOrTs || "");
      if (/^\d{10,13}$/.test(s)) d = new Date(Number(s));
      else d = new Date(s);
    }

    if (!d || Number.isNaN(d.getTime())) return "";

    // Stable, readable format without locale surprises
    var yyyy = d.getUTCFullYear();
    var mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    var dd = String(d.getUTCDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;

  };

  UICharts.prototype._normalizeMinutes = function (value) {
    var x = Number(value);
    if (!Number.isFinite(x) || x <= 0) return 0;
    return x; // Toujours en minutes (source: quizManager.js)
  };

  UICharts.prototype._formatMinutes = function (mins) {
    var m = this._normalizeMinutes(mins);
    if (!Number.isFinite(m) || m <= 0) return "0 min";
    if (m < 60) return Math.round(m) + " min";
    var h = Math.floor(m / 60);
    var r = Math.floor(m % 60);
    return h + " h " + r + " min";
  };




  global.UICharts = UICharts;
})(window);
