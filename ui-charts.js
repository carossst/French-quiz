// ui-charts.js - v3.0.4 - Duolingo-like Stats UI (NO inline CSS, KISS)
// Drop-in replacement. Uses input.css / style.css classes only.
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
      '\n<div class="tyf-page" role="main" aria-label="Statistics">' +
      '\n  <div class="tyf-stats-wrap">' +
      header +
      overview +
      badges +
      history +
      "\n  </div>" +
      "\n</div>\n"
    );
  };

  UICharts.prototype.loadDetailedStats = function () {
    this._loaded = true;
    return Promise.resolve();
  };

  // ----------------------------------------
  // HEADER
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
    try {
      if (
        this.storageManager &&
        typeof this.storageManager.getUserLevel === "function"
      ) {
        var lvl = this.storageManager.getUserLevel();
        if (typeof lvl === "number" && Number.isFinite(lvl) && lvl > 0) level = lvl;
      }
    } catch (e) { }

    return (
      '\n<header class="tyf-stats-hero">' +
      '\n  <div class="tyf-stats-hero-inner">' +
      '\n    <div class="tyf-hero-text">' +
      '\n      <div class="tyf-hero-title">Your French progress</div>' +
      '\n      <div class="tyf-hero-sub">' +
      this._escapeHTML(name) +
      ', you are at <span class="tyf-hero-level">Level ' +
      this._escapeHTML(String(level)) +
      "</span>.</div>" +
      '\n      <div class="tyf-hero-kicker">Small steps daily. Consistency beats intensity.</div>' +
      "\n    </div>" +
      '\n    <button id="back-to-welcome-btn" class="tyf-btn-secondary" type="button">Back to home</button>' +
      "\n  </div>" +
      "\n</header>"
    );
  };

  // ----------------------------------------
  // OVERVIEW
  // ----------------------------------------
  UICharts.prototype._renderOverviewCards = function (uiState, viz) {
    var fp = Number(uiState.frenchPoints);
    if (!Number.isFinite(fp)) fp = Number(viz.frenchPoints) || 0;

    try {
      if (
        this.storageManager &&
        typeof this.storageManager.getFrenchPoints === "function"
      ) {
        var smfp = this.storageManager.getFrenchPoints();
        if (typeof smfp === "number" && Number.isFinite(smfp)) fp = smfp;
      }
    } catch (e) { }

    var completedQuizzes = Number(uiState.completedQuizzes);
    if (!Number.isFinite(completedQuizzes))
      completedQuizzes = Number(viz.completedQuizzes) || 0;

    var accuracy = Number(uiState.accuracy);
    if (!Number.isFinite(accuracy)) accuracy = Number(viz.globalAccuracy) || 0;
    if (accuracy > 0 && accuracy <= 1) accuracy = accuracy * 100;


    var totalTimeSpent = Number(uiState.totalTimeSpent);
    if (!Number.isFinite(totalTimeSpent)) totalTimeSpent = Number(viz.totalTimeSpent) || 0;

    var perfect = Number(uiState.perfectQuizzes);
    if (!Number.isFinite(perfect)) perfect = Number(viz.perfectQuizzes) || 0;

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
      '\n<section aria-label="Overview" class="tyf-stats-grid">' +
      this._renderStatCard("✨", "French Points", String(fp), "Use FP to unlock themes") +
      this._renderStatCard("✅", "Quizzes completed", String(completedQuizzes), "Build real momentum") +
      this._renderStatCard(
        "🎯",
        "Average accuracy",
        String(this._clamp(Math.round(accuracy || 0), 0, 100)) + "%",
        "Track your level"
      ) +
      this._renderStatCard("💯", "Perfect quizzes", String(perfect), "100% score") +
      "\n</section>" +
      this._renderProgressCards(fp, accuracy, totalTimeSpent, isPremium)
    );
  };

  UICharts.prototype._renderStatCard = function (emoji, title, value, hint) {
    return (
      '\n<div class="tyf-stats-card">' +
      '\n  <div class="tyf-card-top">' +
      '\n    <div class="tyf-label">' +
      this._escapeHTML(title) +
      "</div>" +
      '\n    <div class="tyf-pill" aria-hidden="true">' +
      this._escapeHTML(emoji) +
      "</div>" +
      "\n  </div>" +
      '\n  <div class="tyf-value">' +
      this._escapeHTML(value) +
      "</div>" +
      '\n  <div class="tyf-hint">' +
      this._escapeHTML(hint || "") +
      "</div>" +
      "\n</div>"
    );
  };

  // ----------------------------------------
  // PROGRESS CARDS
  // ----------------------------------------
  UICharts.prototype._renderProgressCards = function (fp, accuracy, totalTimeSpent, isPremium) {
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
          typeof lp.needed === "number" &&
          Number.isFinite(lp.needed) &&
          typeof lp.current === "number" &&
          Number.isFinite(lp.current)
        ) {
          nextLabel = String(Math.max(0, lp.needed - lp.current));
        }
      }
    } catch (e) { }

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

      if (fpPerLevel == null) fpPerLevel = 50;

      var fpNum = Number(fp);
      if (!Number.isFinite(fpNum) || fpNum < 0) fpNum = 0;

      var within = fpNum % fpPerLevel;
      fpPct = this._clamp(Math.round((within / fpPerLevel) * 100), 0, 100);
      nextLabel = String(Math.max(0, fpPerLevel - within));
    }

    var safeNextLabel = nextLabel == null ? "0" : String(nextLabel);

    var accPct = this._clamp(Math.round(Number(accuracy) || 0), 0, 100);
    var timeLabel = this._formatMinutes(totalTimeSpent);

    return (
      '\n<section aria-label="Quick charts" class="tyf-stats-split">' +
      '\n  <div class="tyf-stats-card">' +
      '\n    <div class="tyf-row">' +
      '\n      <div class="tyf-row-title">Level progress</div>' +
      '\n      <div class="tyf-row-meta">Next level in ' +
      this._escapeHTML(safeNextLabel) +
      " FP</div>" +
      "\n    </div>" +
      this._renderBarDiv(fpPct, "Level progress: " + String(fpPct) + "%") +
      '\n    <div class="tyf-caption">You are ' +
      this._escapeHTML(String(fpPct)) +
      "% through the current level.</div>" +
      "\n  </div>" +
      '\n  <div class="tyf-stats-card">' +
      '\n    <div class="tyf-row">' +
      '\n      <div class="tyf-row-title">Accuracy</div>' +
      '\n      <div class="tyf-row-meta">Time spent: ' +
      this._escapeHTML(timeLabel) +
      "</div>" +
      "\n    </div>" +
      this._renderBarDiv(accPct, "Accuracy: " + String(accPct) + "%") +
      '\n    <div class="tyf-caption">Average accuracy: ' +
      this._escapeHTML(String(accPct)) +
      "%.</div>" +
      "\n  </div>" +
      "\n</section>" +
      (isPremium ? "" : this._renderPremiumNudgeCard())
    );
  };

  UICharts.prototype._widthClassFromPct = function (pct) {
    var p = Number(pct);
    if (!Number.isFinite(p)) p = 0;
    p = Math.max(0, Math.min(100, Math.round(p)));
    var snapped = Math.round(p / 5) * 5;
    if (snapped < 0) snapped = 0;
    if (snapped > 100) snapped = 100;
    return "w-pct-" + String(snapped);
  };

  UICharts.prototype._renderBarDiv = function (pct, ariaLabel) {
    var cls = this._widthClassFromPct(pct);

    return (
      '\n  <div class="tyf-track" role="img" aria-label="' +
      this._escapeAttr(String(ariaLabel || "Progress")) +
      '">' +
      '\n    <div class="tyf-fill ' +
      this._escapeAttr(cls) +
      '"></div>' +
      "\n  </div>"
    );
  };


  UICharts.prototype._renderPremiumNudgeCard = function () {
    var stripeUrl =
      global.TYF_CONFIG && global.TYF_CONFIG.stripePaymentUrl
        ? String(global.TYF_CONFIG.stripePaymentUrl)
        : "";

    if (!stripeUrl) return "";

    return (
      '\n<section aria-label="Premium" class="tyf-stats-card tyf-nudge">' +
      '\n  <div class="tyf-nudge-inner">' +
      '\n    <div>' +
      '\n      <div class="tyf-nudge-title">Unlock all themes</div>' +
      '\n      <div class="tyf-nudge-sub">One-time $12. No subscription.</div>' +
      "\n    </div>" +
      '<a href="' +
      this._escapeAttr(stripeUrl) +
      '" class="tyf-btn-primary" aria-label="Get Premium">Get Premium</a>' +
      "\n  </div>" +
      "\n</section>"
    );
  };

  // ----------------------------------------
  // BADGES
  // ----------------------------------------
  UICharts.prototype._renderBadges = function (badgesArray) {
    var badgeListRaw = Array.isArray(badgesArray) ? badgesArray : [];

    // Keep all badges, including streak-* (milestones can be irregular)
    var badgeList = badgeListRaw
      .map(function (b) { return b; })
      .filter(function (b) { return b != null && String(b) !== ""; });

    if (!badgeList || badgeList.length <= 0) return "";

    var maxBadges = 10;
    var shownBadges = badgeList.slice(0, maxBadges);
    var rendered = shownBadges.map(this._renderSingleBadge.bind(this)).join("");

    var badgeCountLabel =
      badgeList.length > maxBadges
        ? String(maxBadges) + "/" + String(badgeList.length)
        : String(badgeList.length);

    return (
      '\n<section aria-label="Badges" class="tyf-stats-card">' +
      '\n  <div class="tyf-section-head">' +
      '\n    <h2 class="tyf-section-title">Badges (' +
      this._escapeHTML(badgeCountLabel) +
      ")</h2>" +
      "\n  </div>" +
      '\n  <div class="tyf-badges">' +
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
      var n = Number(id.split("-")[1]);
      label = Number.isFinite(n) ? (String(n) + " French Points") : "French Points milestone";
    } else if (id === "first-quiz") {
      icon = "🎯";
      label = "First quiz completed";
    } else if (/^streak-\d+$/i.test(id)) {
      icon = "🔥";
      var s = Number(id.split("-")[1]);
      label = Number.isFinite(s) ? ("Streak: " + String(s) + " days") : "Streak milestone";
    }

    return (
      '\n  <div class="tyf-badge">' +
      '\n    <span aria-hidden="true">' +
      this._escapeHTML(icon) +
      "</span>" +
      "\n    <span>" +
      this._escapeHTML(label) +
      "</span>" +
      "\n  </div>"
    );
  };
  // ----------------------------------------
  // HISTORY
  // ----------------------------------------
  UICharts.prototype._renderHistory = function (historyArray) {
    var list = Array.isArray(historyArray) ? historyArray : [];

    if (list.length <= 0) {
      return (
        '\n<section aria-label="History" class="tyf-stats-card">' +
        '\n  <div class="tyf-section-head">' +
        '\n    <h2 class="tyf-section-title">History</h2>' +
        "\n  </div>" +
        '\n  <div class="tyf-empty">No completed quizzes yet. Finish a quiz to see your history here.</div>' +
        "\n</section>"
      );
    }

    var maxRows = 20;
    var shown = list.slice(0, maxRows);
    var rows = shown.map(this._renderHistoryRow.bind(this)).join("");

    var title =
      list.length > maxRows
        ? "Recent activity (last " + maxRows + ")"
        : "Recent activity";

    return (
      '\n<section aria-label="History" class="tyf-stats-card">' +
      '\n  <div class="tyf-section-head">' +
      '\n    <h2 class="tyf-section-title">' +
      this._escapeHTML(title) +
      "</h2>" +
      "\n  </div>" +
      '\n  <div class="tyf-table-wrap">' +
      '\n    <table class="tyf-table">' +
      '\n      <thead>' +
      '\n        <tr>' +
      '\n          <th>Date</th>' +
      '\n          <th>Theme</th>' +
      '\n          <th>Quiz</th>' +
      '\n          <th>Score</th>' +
      '\n          <th>Accuracy</th>' +
      "\n        </tr>" +
      "\n      </thead>" +
      '\n      <tbody>' +
      rows +
      "\n      </tbody>" +
      "\n    </table>" +
      "\n  </div>" +
      "\n</section>"
    );
  };

  UICharts.prototype._renderHistoryRow = function (entry) {
    var dateIso = entry && entry.date ? entry.date : "";
    var dateLabel = this._formatDateLocal(dateIso);

    var themeId = entry && entry.themeId != null ? Number(entry.themeId) : NaN;
    var quizId = entry && entry.quizId != null ? Number(entry.quizId) : NaN;

    var score = entry && typeof entry.score === "number" ? entry.score : null;
    var total = entry && typeof entry.total === "number" ? entry.total : null;

    var acc = entry && typeof entry.accuracy === "number" ? entry.accuracy : null;
    var accPct = null;
    if (acc != null) {
      var a = Number(acc);
      if (Number.isFinite(a)) {
        if (a > 0 && a <= 1) a = a * 100;
        accPct = this._clamp(Math.round(a), 0, 100);
      }
    }


    var themeName = this._getThemeName(themeId);

    var tag = "-";
    var tagClass = "tyf-tag";
    if (accPct != null) {
      if (accPct >= 90) {
        tag = "Great";
        tagClass = "tyf-tag tyf-tag-ok";
      } else if (accPct >= 70) {
        tag = "Good";
        tagClass = "tyf-tag tyf-tag-mid";
      } else {
        tag = "Keep going";
        tagClass = "tyf-tag tyf-tag-bad";
      }
    }

    return (
      "\n<tr>" +
      '\n  <td class="tyf-nowrap">' +
      this._escapeHTML(dateLabel || "-") +
      "</td>" +
      "\n  <td>" +
      this._escapeHTML(themeName) +
      "</td>" +
      "\n  <td>" +
      (Number.isFinite(quizId) ? this._escapeHTML(String(quizId)) : "-") +
      "</td>" +
      "\n  <td>" +
      (score != null && total != null
        ? this._escapeHTML(String(score) + "/" + String(total))
        : "-") +
      "</td>" +
      "\n  <td>" +
      (accPct != null
        ? '<span class="' +
        this._escapeAttr(tagClass) +
        ' tyf-mr-xs">' +
        this._escapeHTML(tag) +
        "</span>" +
        this._escapeHTML(String(accPct) + "%")
        : "-") +
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
    return this._escapeHTML(s);
  };

  UICharts.prototype._clamp = function (n, min, max) {
    var x = Number(n);
    if (!Number.isFinite(x)) x = 0;
    return Math.max(min, Math.min(max, x));
  };

  UICharts.prototype._parseDate = function (isoOrTs) {
    if (isoOrTs == null || isoOrTs === "") return null;
    if (typeof isoOrTs === "number") return new Date(isoOrTs);

    var s = String(isoOrTs || "");
    if (/^\d{10,13}$/.test(s)) return new Date(Number(s));

    return new Date(s);
  };

  UICharts.prototype._formatDateLocal = function (isoOrTs) {
    var d = this._parseDate(isoOrTs);
    if (!d || Number.isNaN(d.getTime())) return "";

    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
  };

  UICharts.prototype._normalizeMinutes = function (value) {
    var x = Number(value);
    if (!Number.isFinite(x) || x <= 0) return 0;
    return x;
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
