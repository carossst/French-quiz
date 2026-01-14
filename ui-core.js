// ui-core.js v3.0 - UX Roadmap Modal + Refined flow (new user -> quiz -> results -> stats)

(function (global) {
    function UICore(quizManager, appContainer, resourceManager, storageManager) {
        if (!quizManager || !appContainer || !resourceManager || !storageManager) {
            throw new Error("UICore: Missing critical dependencies");
        }

        this.quizManager = quizManager;
        this.appContainer = appContainer;
        this.resourceManager = resourceManager;
        this.storageManager = storageManager;

        this.themeIndexCache = null;
        this.currentScreen = null;
        this.isInitialized = false;
        this.features = null;
        this.charts = null;

        this._roadmapListenerAttached = false;

        this._xpSystemInitialized = false;

    }
    /* ----------------------------------------
       GENERIC ERROR HANDLING
       ---------------------------------------- */
    UICore.prototype.showError = function (message) {
        if (typeof window.showErrorMessage === "function") {
            window.showErrorMessage(message);
        } else {
            console.error("UICore Error:", message);
        }
    };

    /* ----------------------------------------
       FEEDBACK TOASTS (KISS)
       ---------------------------------------- */
    UICore.prototype.showFeedbackMessage = function (type, message) {
        const container = document.getElementById("toast-container");

        // Fallback: if no toast UI exists, don't crash
        if (!container) {
            console.log("[TYF]", type, message);
            return;
        }

        const safeType = String(type || "info");
        const safeMsg = String(message == null ? "" : message);

        const toast = document.createElement("div");
        toast.className = "tyf-toast tyf-toast--" + safeType;
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        toast.textContent = safeMsg;

        container.appendChild(toast);

        setTimeout(function () {
            if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3000);
    };


    /* ----------------------------------------
       TEXT NORMALIZATION
       ---------------------------------------- */
    UICore.prototype.normalizeText = function (s) {
        if (window.TYF_UTILS && typeof window.TYF_UTILS.normalizeText === "function") {
            return window.TYF_UTILS.normalizeText(s);
        }
        return String(s || "").trim();
    };

    UICore.prototype.escapeHTML = function (s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };

    /* ----------------------------------------
       TRACKING + DATE HELPERS (KISS)
       ---------------------------------------- */
    UICore.prototype._track = function (eventName, payload) {
        try {
            if (typeof window.trackMicroConversion === "function") {
                window.trackMicroConversion(eventName, payload || {});
            }
        } catch (e) {
            // silent fail
        }
    };

    UICore.prototype._todayKey = function () {
        try {
            var d = new Date();
            var y = d.getFullYear();
            var m = String(d.getMonth() + 1).padStart(2, "0");
            var day = String(d.getDate()).padStart(2, "0");
            return y + "-" + m + "-" + day; // local YYYY-MM-DD
        } catch (e) {
            return "";
        }
    };


    UICore.prototype._isSameDay = function (a, b) {
        return String(a || "").slice(0, 10) === String(b || "").slice(0, 10);
    };

    UICore.prototype._getLastActiveDateFromUIState = function (uiState) {
        // compatible with likely shapes: uiState.streak.lastActiveDate OR uiState.lastActiveDate
        if (!uiState) return null;
        if (uiState.streak && uiState.streak.lastActiveDate) return uiState.streak.lastActiveDate;
        if (uiState.lastActiveDate) return uiState.lastActiveDate;
        return null;
    };

    UICore.prototype._hasLockedThemes = function () {
        try {
            if (!this.themeIndexCache || !this.themeIndexCache.length) return false;
            if (!this.storageManager || typeof this.storageManager.isThemeUnlocked !== "function") return false;

            const isPremium = !!(this.storageManager.isPremiumUser && this.storageManager.isPremiumUser());
            if (isPremium) return false;

            for (let i = 0; i < this.themeIndexCache.length; i++) {
                const t = this.themeIndexCache[i];
                const id = Number(t && t.id);
                if (!Number.isFinite(id) || id === 1) continue;
                const unlocked = !!this.storageManager.isThemeUnlocked(id);
                if (!unlocked) return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    };

    UICore.prototype._getThemeIdForQuickStart = function () {
        const sm = this.storageManager || {};
        const isPremium = !!sm.isPremiumUser?.();

        const themes = (this.themeIndexCache || [])
            .map(function (t) { return Number(t && t.id); })
            .filter(function (id) { return Number.isFinite(id); })
            .sort(function (a, b) { return a - b; });

        // Premium: reprendre le thème courant si valide, sinon 1
        if (isPremium) {
            const current = Number(this.quizManager && this.quizManager.currentThemeId);
            return Number.isFinite(current) ? current : 1;
        }

        // Non-premium: si thème courant est déjà débloqué (ou Colors), on le garde
        const current = Number(this.quizManager && this.quizManager.currentThemeId);
        if (Number.isFinite(current)) {
            if (current === 1) return 1;
            if (typeof sm.isThemeUnlocked === "function" && sm.isThemeUnlocked(current)) return current;
        }

        // Sinon: prendre le premier thème débloqué (>1)
        if (typeof sm.isThemeUnlocked === "function") {
            for (let i = 0; i < themes.length; i++) {
                const id = themes[i];
                if (id > 1 && sm.isThemeUnlocked(id)) return id;
            }
        }

        // Fallback strict: Colors (seul free)
        return 1;
    };


    UICore.prototype._getPremiumPrice = function () {
        try {
            const pd = (window.UIFeatures && window.UIFeatures.PRICE_DISPLAY) ? window.UIFeatures.PRICE_DISPLAY : null;
            const current = (pd && pd.current) ? String(pd.current) : "$12";
            // FIX: PRICE_DISPLAY uses "regular" (not "anchor")
            const anchor = (pd && (pd.regular || pd.anchor)) ? String(pd.regular || pd.anchor) : "$99";
            return { current: current, anchor: anchor };
        } catch (e) {
            return { current: "$12", anchor: "$99" };
        }
    };


    UICore.prototype._getPremiumPriceHTML = function () {
        const p = this._getPremiumPrice();
        return '<span class="line-through">' + this.escapeHTML(p.anchor) + '</span> ' + this.escapeHTML(p.current);
    };

    UICore.prototype._getWaitlistEmail = function () {
        try {
            const cfg = window.TYF_CONFIG && window.TYF_CONFIG.waitlist ? window.TYF_CONFIG.waitlist : null;
            if (!cfg || cfg.enabled === false) return "";
            const email = String(cfg.toEmail || "").trim();
            return email || "";
        } catch (e) {
            return "";
        }
    };

    UICore.prototype._buildWaitlistMailto = function (resultsData, pct, scoreLine, levelLabel, titleTheme) {
        try {
            const cfg = window.TYF_CONFIG && window.TYF_CONFIG.waitlist ? window.TYF_CONFIG.waitlist : null;
            if (!cfg || cfg.enabled === false) return "";

            const toEmail = String(cfg.toEmail || "").trim();
            if (!toEmail) return "";

            const prefix = String(cfg.subjectPrefix || "[TYF Early Access]").trim();
            const topic = String(cfg.topicLabel || "A1/A2-specific diagnostic").trim();

            const safeTheme = String(titleTheme || "Theme").trim();
            const safeLevel = String(levelLabel || "Your level").trim();

            const quizId = resultsData && resultsData.quizId != null ? String(resultsData.quizId) : "";
            const themeId = resultsData && resultsData.themeId != null ? String(resultsData.themeId) : "";

            const subject = prefix + " " + topic;

            const bodyLines = [
                "Hi Carole,",
                "",
                "I want early access to an A1/A2-style diagnostic.",
                "",
                "My last result:",
                "- Theme: " + safeTheme + (themeId ? " (themeId " + themeId + ")" : ""),
                "- Quiz: " + (quizId ? quizId : "N/A"),
                "- Score: " + String(scoreLine || ""),
                "- Accuracy: " + String(Math.round(Number(pct) || 0)) + "%",
                "- Estimated level: " + safeLevel,
                "",
                "What I want next:",
                "- Target level: A1 / A2 / B1 / B2 (choose)",
                "- Goal: exam prep / travel / work / daily life (choose)",
                "",
                "Thanks!"
            ];

            const body = bodyLines.join("\n");

            return "mailto:" + toEmail +
                "?subject=" + encodeURIComponent(subject) +
                "&body=" + encodeURIComponent(body);

        } catch (e) {
            return "";
        }
    };







    /* ----------------------------------------
       LIFECYCLE
       ---------------------------------------- */
    UICore.prototype.start = async function () {
        if (this.isInitialized) return;
        try {
            await this.loadThemeIndex();
            this.initializeDependencies();
            this.showWelcomeScreen();
            this.isInitialized = true;
        } catch (error) {
            this.showError("Unable to load application. Please refresh.");
            console.error("UICore start error:", error);
            throw error;
        }
    };

    UICore.prototype.initializeDependencies = function () {
        // UIFeatures (UI-only layer)
        if (typeof window.UIFeatures === "function" && !this.features) {
            this.features = new window.UIFeatures(this, this.storageManager, this.resourceManager);
        }

        // UICharts (stats screen)
        if (typeof window.UICharts === "function" && !this.charts) {
            this.charts = new window.UICharts(this, this.storageManager, this.resourceManager);
        }
    };

    UICore.prototype.generateWelcomeHTML = function () {
        var uiState = { completedQuizzes: 0 };

        try {
            uiState = this.storageManager.getUIState() || uiState;
        } catch (e) {
            console.error("UICore: getUIState failed, fallback to new user welcome", e);
        }

        var isNewUser = Number(uiState.completedQuizzes) === 0;

        return isNewUser
            ? this.generateNewUserWelcome()
            : this.generateReturningUserWelcome(uiState);
    };



    UICore.prototype.loadThemeIndex = async function () {
        const metadata = (await this.resourceManager.loadMetadata()) || {};
        this.themeIndexCache = Array.isArray(metadata.themes) ? metadata.themes : [];
    };


    /* ----------------------------------------
       SCREEN RENDERING
       ---------------------------------------- */
    UICore.prototype.showScreen = function (screenId, htmlGenerator) {
        try {
            this.currentScreen = screenId;
            this.appContainer.setAttribute("data-screen", screenId);

            const html = htmlGenerator.call(this);
            this.appContainer.innerHTML = html;

            // Reset scroll to top (smooth only for welcome & stats)
            const smoothScreens = ["welcome", "stats"];

            try {
                window.scrollTo({
                    top: 0,
                    behavior: smoothScreens.includes(screenId) ? "smooth" : "auto"
                });
            } catch (e) {
                window.scrollTo(0, 0);
            }


            this.setupScreenEvents(screenId);
        } catch (error) {
            this.showError("Unable to load " + screenId + " screen");
            console.error("UICore.showScreen error:", error);
        }
    };

    UICore.prototype.setupScreenEvents = function (screenId) {
        switch (screenId) {
            case "welcome":
                this.setupWelcomeEvents();

                var isReturningWelcome = !!document.getElementById("themes-grid");

                // IMPORTANT:
                // Rien dans UIFeatures ne doit pouvoir casser l'écran Welcome
                try {
                    if (this.features && isReturningWelcome) {

                        // 1) XP header (peut échouer sans casser le reste)
                        try {
                            if (typeof this.features.showXPHeader === "function") {
                                this.features.showXPHeader();
                            }
                        } catch (e) {
                            console.error("showXPHeader failed (non-blocking):", e);
                        }

                        // 2) IMPORTANT: le DOM est recréé à chaque showScreen()
                        // → rebind UI du coffre + tooltip à CHAQUE render (même si showXPHeader a planté)
                        try {
                            if (typeof this.features.addChestIconToHeader === "function") {
                                this.features.addChestIconToHeader();
                            }
                        } catch (e) {
                            console.error("addChestIconToHeader failed (non-blocking):", e);
                        }

                        try {
                            if (typeof this.features.setupChestTooltip === "function") {
                                this.features.setupChestTooltip();
                            }
                        } catch (e) {
                            console.error("setupChestTooltip failed (non-blocking):", e);
                        }

                        // 3) Listeners globaux = une seule fois
                        if (!this._xpSystemInitialized && typeof this.features.initializeXPSystem === "function") {
                            this.features.initializeXPSystem();
                            this._xpSystemInitialized = true;
                        }

                        // 4) Update header (safe)
                        try {
                            if (typeof this.features.updateXPHeader === "function") {
                                this.features.updateXPHeader();
                            }
                        } catch (e) {
                            console.error("updateXPHeader failed (non-blocking):", e);
                        }
                    }
                } catch (e) {
                    console.error("Welcome UIFeatures failed (non-blocking):", e);
                }

                // Daily goal nudge (ne doit jamais casser l’écran)
                try {
                    if (typeof this.renderDailyGoalNudge === "function") {
                        this.renderDailyGoalNudge();
                    }
                } catch (e) {
                    console.error("renderDailyGoalNudge failed (non-blocking):", e);
                }

                // CTA principal (ne doit jamais casser l’écran)
                try {
                    if (typeof this.renderPrimaryCTA === "function") {
                        this.renderPrimaryCTA();
                    }
                } catch (e) {
                    console.error("renderPrimaryCTA failed (non-blocking):", e);
                }
                break;

            case "quiz-selection":
                this.setupQuizSelectionEvents();
                break;

            case "quiz":
                this.setupQuizEvents();
                break;

            case "results":
                this.setupResultsEvents();
                break;

            case "stats":
                this.setupStatsEvents();
                break;
        }
    };






    /* ----------------------------------------
       WELCOME (NEW VS RETURNING USER)
       ---------------------------------------- */
    UICore.prototype.showWelcomeScreen = function () {
        this.showScreen("welcome", this.generateWelcomeHTML);
    };


    UICore.prototype.getCreatorLine = function () {
        try {
            var brand = window.TYF_BRAND || {};
            var s = String(brand.creatorLine || "").trim();
            return s || "";
        } catch (e) {
            return "";
        }
    };


    // Returning visitor: direct access to themes + stats
    UICore.prototype.generateReturningUserWelcome = function (uiState) {
        const progressTextRaw = this.getProgressText(uiState);
        const progressText = this.escapeHTML(progressTextRaw);

        return (
            '\n<div class="bg-gradient-to-br from-blue-50 to-purple-50 min-h-screen lg:h-screen lg:flex lg:flex-col" role="main" aria-label="Themes screen">' +
            '\n  <div class="max-w-6xl mx-auto px-4 pt-4 pb-6 lg:pt-2 lg:pb-4 lg:flex-1 lg:flex lg:flex-col">' +

            '\n    <div class="text-center mb-4 lg:mb-2">' +
            '\n      <h1 class="text-xl md:text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>' +
            '\n      <p class="text-sm text-gray-700">' +
            progressText +
            '</p>' +
            '\n      <p class="text-xs text-gray-600 mt-2">' +
            '\n        ' + this.escapeHTML(this.getCreatorLine()) +
            '\n      </p>' +



            '\n    </div>' +

            // CTA principal (piloté par renderPrimaryCTA)
            '\n    <div id="primary-cta-slot" class="mb-4"></div>' +

            '\n    <section id="themes-section" aria-label="Available themes" class="lg:flex-1">' +
            '\n      <h2 class="text-lg lg:text-xl font-bold text-gray-800 mb-3 lg:mb-2 text-center">Choose your next theme</h2>' +
            '\n      <div id="themes-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-2">' +
            this.generateSimpleThemesGrid() +
            '\n      </div>' +
            '\n    </section>' +

            '\n    <div class="text-center mt-4 lg:mt-2 shrink-0">' +
            '\n      <button id="view-stats-btn" type="button">' +
            'View your statistics and history' +
            '</button>' +
            '\n    </div>' +

            // Daily goal nudge (piloté par renderDailyGoalNudge)
            '\n    <div id="daily-goal-slot" class="mt-3 lg:mt-2 shrink-0"></div>' +

            '\n    <div class="text-center mt-3 shrink-0">' +
            '\n      <button id="show-roadmap-btn" type="button" class="text-xs text-gray-500 hover:text-gray-800 underline">' +
            'How unlocking improves your progress' +
            '</button>' +
            '\n    </div>' +

            '\n  </div>' +
            '\n</div>\n'
        );
    };




    UICore.prototype.generateResultsHTML = function (resultsData) {
        resultsData = resultsData || {};

        var pctNum = Number(resultsData.percentage);
        var pct = Number.isFinite(pctNum) ? pctNum : 0;

        var scoreNum = Number(resultsData.score);
        var score = Number.isFinite(scoreNum) ? scoreNum : null;

        var totalNum = Number(resultsData.total);
        var total = Number.isFinite(totalNum) ? totalNum : null;

        var scoreLine = "";
        if (score != null && total != null) scoreLine = score + " / " + total;
        else scoreLine = Math.round(pct) + "%";

        var titleTheme =
            (this.getCurrentThemeName && this.getCurrentThemeName())
                ? this.getCurrentThemeName()
                : (resultsData.themeName ? this.normalizeText(resultsData.themeName) : "This theme");

        // One-liner synthesis (no repetition)
        var signatureSub =
            (pct >= 80) ? "You can handle real-speed French. Keep momentum."
                : (pct >= 60) ? "One replay will stabilize your understanding."
                    : (pct >= 40) ? "You found the pattern. Replay once to lock it in."
                        : "This is normal. One anchor word will flip the meaning on replay.";

        var levelLabel = this.getCECRLevel ? this.getCECRLevel(pct) : "Your level";
        var levelClass = this.getCECRColorClass ? this.getCECRColorClass(pct) : "bg-gray-50 border-gray-200 text-gray-800";
        var levelMsg = this.getCECRMessage ? this.getCECRMessage(pct) : "Keep practicing to progress.";
        if (pct < 50) levelMsg = "This is normal with real-speed French. Replay once and focus on one anchor word.";


        // Action card (single, concrete)
        var action = this.getResultsAction ? this.getResultsAction(resultsData) : "Replay now and focus on the pattern.";

        // Reward line (best-effort, no placeholders)
        // Goal: show LAST quiz reward if available, not total FP.
        var lastReward = null;
        try {
            // Prefer an explicit getter if you add it later
            if (typeof this.storageManager.getLastReward === "function") {
                lastReward = this.storageManager.getLastReward();
            } else {
                // Fallback: look inside UI state or raw data if exposed
                var uiState = (this.storageManager.getUIState && this.storageManager.getUIState()) || {};
                if (uiState && uiState.lastReward) lastReward = uiState.lastReward;
                if (!lastReward && this.storageManager.data && this.storageManager.data.lastReward) {
                    lastReward = this.storageManager.data.lastReward;
                }
            }
        } catch (e) {
            lastReward = null;
        }

        var streakDays = null;
        try {
            var uiState2 = (this.storageManager.getUIState && this.storageManager.getUIState()) || {};
            var s = null;
            if (uiState2 && uiState2.fpStats && uiState2.fpStats.streakDays != null) s = uiState2.fpStats.streakDays;
            if (uiState2 && uiState2.currentStreak != null) s = uiState2.currentStreak;
            streakDays = (s == null) ? null : (Number(s) || 0);
        } catch (e) {
            streakDays = null;
        }

        var rewardBits = [];
        // Show earned points only if the snapshot exists and is numeric
        if (lastReward && lastReward.amount != null && Number.isFinite(Number(lastReward.amount))) {
            rewardBits.push("+" + String(Number(lastReward.amount)) + " French Points earned");
        }
        if (streakDays != null && streakDays > 0) rewardBits.push("Streak: day " + String(streakDays));
        var rewardLine = rewardBits.length ? rewardBits.join(" | ") : "";


        // Waitlist (kept but moved to Options)
        var waitlistEmail = this._getWaitlistEmail ? this._getWaitlistEmail() : "";
        var waitlistHref = this._buildWaitlistMailto
            ? this._buildWaitlistMailto(resultsData, pct, scoreLine, levelLabel, titleTheme)
            : "";

        var waitlistHTML = "";
        if (waitlistEmail && waitlistHref) {
            waitlistHTML =
                '\n      <div class="tyf-stats-card" aria-label="Early access">' +
                '\n        <div class="flex items-center justify-between gap-3">' +
                '\n          <div class="text-sm text-gray-700">' +
                '\n            <strong class="text-gray-900">Want a more precise A1/A2 diagnostic?</strong> Get early access.' +
                '\n          </div>' +
                '\n          <div class="shrink-0">' +
                '\n            <a id="results-waitlist-link" class="text-sm underline font-semibold text-blue-700 hover:text-blue-900" href="' + this.escapeHTML(waitlistHref) + '">' +
                '\n              Request' +
                '\n            </a>' +
                '\n          </div>' +
                '\n        </div>' +
                '\n      </div>';
        }

        // Premium visibility stays secondary
        var isPremium = false;
        try {
            if (typeof this.storageManager.isPremiumUser === "function") {
                isPremium = !!this.storageManager.isPremiumUser();
            } else if (this.storageManager.data && this.storageManager.data.isPremiumUser != null) {
                isPremium = !!this.storageManager.data.isPremiumUser;
            }
        } catch (e) {
            isPremium = false;
        }

        var hasLockedThemes = false;
        try {
            hasLockedThemes = (typeof this._hasLockedThemes === "function") ? !!this._hasLockedThemes() : false;
        } catch (e) {
            hasLockedThemes = false;
        }

        var premiumNudgeHiddenClass = (!isPremium && hasLockedThemes) ? "" : " hidden";


        // Conversion rule (best-effort): if user can unlock next theme now, make it the primary CTA
        var nextId = null;
        var needed = null;

        // 1) Prefer Storage (more reliable than scanning themeIndexCache)
        try {
            if (typeof this.storageManager.getNextUnlockableTheme === "function") {
                var nextThemeObj = this.storageManager.getNextUnlockableTheme();
                if (nextThemeObj && nextThemeObj.id != null) nextId = Number(nextThemeObj.id);
            }
            if (nextId == null && typeof this.storageManager.getFpToNextTheme === "function") {
                var missing = Number(this.storageManager.getFpToNextTheme());
                if (Number.isFinite(missing)) needed = Math.max(0, missing);
            }
        } catch (e) {
            nextId = null;
            needed = null;
        }

        // 2) Fallback: compute from costs if needed not known
        try {
            if (nextId != null && (needed == null) &&
                (typeof this.storageManager.getFrenchPoints === "function") &&
                (typeof this.storageManager.getThemeCost === "function")) {
                var fpNow = Number(this.storageManager.getFrenchPoints()) || 0;
                var cost = Number(this.storageManager.getThemeCost(nextId));
                if (Number.isFinite(cost)) needed = Math.max(0, cost - fpNow);
            }
        } catch (e) {
            // keep needed null
        }

        // 3) Last resort: scan themeIndexCache (only if nextId still unknown)
        if (nextId == null) {
            try {
                var themes = (this.themeIndexCache || [])
                    .filter(function (t) { return t && t.id != null; })
                    .map(function (t) {
                        var copy = {};
                        for (var k in t) copy[k] = t[k];
                        copy.id = Number(t.id);
                        return copy;
                    })
                    .filter(function (t) { return Number.isFinite(t.id); })
                    .sort(function (a, b) { return a.id - b.id; });

                for (var i = 0; i < themes.length; i++) {
                    var t = themes[i];
                    if (t.id === 1) continue;

                    var unlocked = (typeof this.storageManager.isThemeUnlocked === "function") ? !!this.storageManager.isThemeUnlocked(t.id) : false;
                    var prev = themes[i - 1];
                    var prevUnlocked = !prev
                        ? true
                        : (prev.id === 1 ? true : ((typeof this.storageManager.isThemeUnlocked === "function") ? !!this.storageManager.isThemeUnlocked(prev.id) : false));

                    if (!unlocked && prevUnlocked) { nextId = t.id; break; }
                }

                if (nextId != null && needed == null &&
                    (typeof this.storageManager.getFrenchPoints === "function") &&
                    (typeof this.storageManager.getThemeCost === "function")) {
                    var fpNow2 = Number(this.storageManager.getFrenchPoints()) || 0;
                    var cost2 = Number(this.storageManager.getThemeCost(nextId));
                    if (Number.isFinite(cost2)) needed = Math.max(0, cost2 - fpNow2);
                }
            } catch (e) {
                nextId = null;
                needed = null;
            }
        }

        var primaryCTAHTML = "";
        if (nextId != null && needed === 0) {
            primaryCTAHTML =
                '\n<button id="results-unlock-next-btn" type="button" class="quiz-button">Unlock next theme</button>';
        } else {
            primaryCTAHTML = this.generateNextActionButton(resultsData);
        }


        return (
            '\n<div class="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50" role="main" aria-label="Results screen">' +
            '\n  <div class="max-w-3xl mx-auto px-4 pt-6 pb-10">' +

            // Header nav: back to theme selection + home
            '\n    <div class="flex items-center justify-between gap-2 mb-4">' +
            '\n      <button id="back-to-theme-btn" type="button">' + this.getBackToThemeLabel() + '</button>' +
            '\n      <button id="back-home-btn" type="button" class="text-sm underline font-semibold text-slate-700 hover:text-slate-900">Home</button>' +
            '\n    </div>' +

            '\n    <div class="text-center mb-4">' +
            '\n      <h1 class="text-2xl md:text-3xl font-bold text-gray-900">Quiz recap</h1>' +
            '\n      <p class="text-sm text-gray-700 mt-1">Theme: <strong>' + this.escapeHTML(titleTheme) + '</strong></p>' +
            '\n    </div>' +


            // 1) RESULT (single card): score + badge + level + one line
            '\n    <div class="theme-card mb-4" aria-label="Result summary">' +
            '\n      <div class="flex items-center justify-between gap-3">' +
            '\n        <div>' +
            '\n          <div class="text-sm text-gray-600">Score</div>' +
            '\n          <div class="text-2xl font-extrabold text-gray-900">' + this.escapeHTML(scoreLine) +
            ' <span class="text-base font-semibold text-gray-600">(' + Math.round(pct) + '%)</span></div>' +
            '\n        </div>' +
            '\n        <div class="shrink-0">' +
            '\n          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ' +
            (pct >= 70 ? 'bg-green-100 text-green-800' :
                pct >= 40 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-slate-100 text-slate-700') +
            '">' +
            (this.escapeHTML(
                pct >= 70 ? 'Strong result' :
                    pct >= 40 ? 'Good diagnosis' :
                        'Starting point'
            )) +
            '</span>' +
            '\n        </div>' +
            '\n      </div>' +

            '\n      <div class="mt-3 p-3 border rounded-lg ' + levelClass + '">' +
            '\n        <div class="font-bold text-sm">' + this.escapeHTML(levelLabel) + '</div>' +
            '\n        <div class="text-sm mt-1">' + this.escapeHTML(levelMsg) + '</div>' +
            '\n      </div>' +

            '\n      <div class="text-sm text-gray-700 mt-3">' +
            '\n        <strong class="text-gray-900">Takeaway:</strong> ' + this.escapeHTML(signatureSub) +
            '\n      </div>' +

            '\n    </div>' +
            // 2) ACTION (single card) + CTA immediately after (no scroll needed)
            '\n    <div class="tyf-stats-card tyf-nudge mb-3" aria-label="Next step">' +
            '\n      <div class="tyf-nudge-inner">' +
            '\n        <div>' +
            '\n          <div class="tyf-nudge-title">Do this now</div>' +
            '\n          <div class="tyf-nudge-sub">' + this.escapeHTML(action) + '</div>' +
            '\n        </div>' +
            '\n      </div>' +
            '\n    </div>' +

            '\n    <div class="flex justify-center mb-2">' +
            primaryCTAHTML +
            '\n    </div>' +

            (rewardLine
                ? '\n    <div class="text-xs text-gray-600 text-center mb-3">' + this.escapeHTML(rewardLine) + '</div>'
                : '\n    <div class="text-xs text-gray-600 text-center mb-3">' +
                this.escapeHTML(pct >= 70 ? "Keep momentum: 2 minutes." : "One replay makes the pattern stick.") +
                '\n    </div>') +

            // Review mistakes stays visible but secondary (no wall of text)
            '\n    <div class="flex justify-center mb-4">' +
            '\n      <button id="toggle-details-btn" type="button" class="text-sm underline font-semibold text-slate-700 hover:text-slate-900">Review mistakes</button>' +
            '\n    </div>' +

            // 3) OPTIONS (always visible, no accordion)
            '\n    <div class="mt-2 space-y-3" aria-label="Options">' +
            '\n      <div id="next-unlock-slot"></div>' +

            '\n      <div id="premium-success-nudge" class="tyf-stats-card tyf-nudge' + premiumNudgeHiddenClass + '" aria-label="Premium success nudge">' +
            '\n        <div class="tyf-nudge-inner">' +
            '\n          <div>' +
            '\n            <div class="tyf-nudge-title">Unlock everything</div>' +
            '\n            <div class="tyf-nudge-sub">One payment. No subscription. All themes instantly.</div>' +
            '\n          </div>' +
            '\n          <div class="shrink-0">' +
            '\n            <button id="results-premium-nudge-btn" type="button" class="text-sm underline font-semibold text-purple-700 hover:text-purple-900">' +
            '\n              Unlock all themes - ' + this._getPremiumPriceHTML() + ' one-time' +
            '\n            </button>' +
            '\n          </div>' +
            '\n        </div>' +
            '\n      </div>' +

            (waitlistHTML ? waitlistHTML : "") +
            '\n    </div>' +


            // Details panel stays as-is
            '\n    <div id="secondary-actions" class="hidden mt-4 text-center">' +
            '\n      <button id="retry-quiz-btn" type="button" class="text-sm underline">Retry this quiz</button>' +
            '\n    </div>' +

            '\n    <div id="detailed-stats" class="hidden mt-3">' +
            '\n      <div id="questions-review"></div>' +
            '\n    </div>' +

            '\n  </div>' +
            '\n</div>\n'
        );
    };



    /* ----------------------------------------
       RESULTS SCREEN
       ---------------------------------------- */
    UICore.prototype.showResults = function (resultsData) {
        resultsData = resultsData || {};

        this.showScreen("results", function () {
            const html = this.generateResultsHTML(resultsData);

            // Refresh XP header (level / FP / streak) shortly after rendering
            setTimeout(() => {
                try {
                    if (this.features && typeof this.features.updateXPHeader === "function") {
                        this.features.updateXPHeader();
                    }
                } catch (e) {
                    console.error("updateXPHeader failed on results (non-blocking):", e);
                }
            }, 200);

            // Micro-conversion tracking (single entrypoint)
            try {
                this._track("quiz_completed", {
                    themeId: resultsData.themeId,
                    quizId: resultsData.quizId,
                    percentage: resultsData.percentage,
                    score: resultsData.score,
                    total: resultsData.total,
                    timeSpentSec: resultsData.timeSpentSec
                });
            } catch (e) {
                // silent fail
            }

            return html;
        });
    };




    UICore.prototype.generateNewUserWelcome = function () {
        return (
            '\n<section class="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center" role="main" aria-label="Welcome screen">' +
            '\n  <div class="max-w-3xl text-center px-6 py-12">' +
            '\n    <h1 class="text-3xl md:text-4xl font-bold text-blue-700 mb-3">' +
            "\n      A real diagnostic of your French" +

            "\n    </h1>" +

            '\n    <p class="text-sm text-gray-700 mb-4">' +
            '\n      ' + this.escapeHTML(this.getCreatorLine()) +
            '\n    </p>' +




            '\n    <div class="bg-blue-50 border-l-4 border-blue-400 p-4 mb-5 rounded-r-lg text-left md:text-center">' +
            '\n      <p class="text-blue-800 font-medium">' +
            "\n        Take one short quiz based on real-life situations in France." +
            "\n        Start with the free <strong>Colors</strong> theme and learn what trips you up." +
            "\n      </p>" +
            "\n    </div>" +

            '\n    <div class="tyf-stats-card tyf-nudge mb-5" aria-label="What you will learn">' +
            '\n      <div class="tyf-nudge-inner">' +
            '\n        <div>' +
            '\n          <div class="tyf-nudge-title">What you will learn in 2 minutes</div>' +
            '\n          <ul class="text-sm text-gray-700 mt-2 space-y-1">' +
            '\n            <li>Speed vs vocabulary: which one blocks you first</li>' +
            '\n            <li>The pattern you should replay to improve fast</li>' +
            '\n          </ul>' +
            '\n        </div>' +
            '\n      </div>' +
            '\n    </div>' +

            '\n    <div class="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-5 mb-5">' +
            '\n      <div class="flex items-center justify-center gap-2 mb-2">' +
            '\n        <span class="text-2xl">✨</span>' +
            '\n        <h2 class="text-lg font-bold text-gray-900">How it works</h2>' +
            '\n        <span class="text-2xl">✨</span>' +
            '\n      </div>' +
            '\n      <div class="text-sm text-gray-700 space-y-1">' +
            '\n        <p><strong class="text-purple-700">Quizzes</strong> -> earn French Points</p>' +
            '\n        <p><strong class="text-purple-700">Unlock</strong> -> access new themes (or go Premium)</p>' +
            '\n        <p><strong class="text-purple-700">Progress</strong> -> see your level history</p>' +
            '\n      </div>' +
            '\n    </div>' +

            '\n    <p class="text-base text-gray-700 mb-6">' +
            "\n      No signup. No account. A clear diagnostic of your real French." +

            "\n    </p>" +

            '\n    <button id="start-first-quiz-btn" type="button" class="quiz-button w-full sm:w-auto">' +
            "\n      Start the free Colors quiz" +
            "\n    </button>" +
            "\n  </div>" +
            "\n</section>\n"
        );
    };






    /* ----------------------------------------
       QUIZ SCREEN
       ---------------------------------------- */
    UICore.prototype.showQuizScreen = function () {
        this.showScreen("quiz", this.generateQuizHTML);

        // Banner (practice mode): visible uniquement si le quiz est déjà complété
        try {
            const quizId = Number(this.quizManager && this.quizManager.currentQuizId);
            const canCheck = typeof this.storageManager?.isQuizCompleted === "function";
            const isPractice = Number.isFinite(quizId) && canCheck && !!this.storageManager.isQuizCompleted(quizId);

            if (isPractice) {
                this.setQuizBanner("info", "🔄 Practice mode: train freely. Points on first run only.");
            } else {
                this.clearQuizBanner();
            }
        } catch (e) {
            this.clearQuizBanner();
        }

        const self = this;
        setTimeout(function () {
            // Source de vérité: QuizManager démarre le timing, puis délègue le rendu à UI (UICore.renderCurrentQuestion)
            if (self.quizManager && typeof self.quizManager.renderCurrentQuestion === "function") {
                self.quizManager.renderCurrentQuestion();
            } else {
                self.renderCurrentQuestion();
            }

        }, 80);
    };



    UICore.prototype.generateQuizHTML = function () {
        const progress =
            (this.quizManager.getQuizProgress && this.quizManager.getQuizProgress()) || {
                current: 1,
                total: 10,
                percentage: 0
            };

        var pctNum = Number(progress && progress.percentage);
        var pct = Number.isFinite(pctNum) ? pctNum : 0;

        // ✅ Nom du thème (fallback safe)
        var themeName = (this.getCurrentThemeName && this.getCurrentThemeName())
            ? this.getCurrentThemeName()
            : "themes";

        return (
            '\n<div class="quiz-wrapper" role="main" aria-label="Quiz screen">' +

            '\n  <div class="flex items-center justify-between gap-3 mb-4">' +

            '\n    <div class="text-sm font-extrabold text-slate-700 shrink-0">' +
            '      <span id="quiz-progress-count" class="inline-flex items-center gap-2">' +
            '        <span class="inline-flex items-center justify-center px-3 py-1 rounded-full bg-slate-100 border border-slate-200">' +
            '          <span id="quiz-progress-value">' + progress.current + '/' + progress.total + '</span>' +
            '        </span>' +
            '      </span>' +
            '    </div>' +

            // ✅ Fix layout: pas de collision, wrap autorisé dans le texte du bouton Back
            '\n    <div class="flex items-center gap-2 flex-nowrap min-w-0">' +
            '      <button id="go-themes-btn" type="button" class="min-w-0 text-left whitespace-normal leading-tight">' +
            '        Back to ' + this.escapeHTML(themeName) +
            '      </button>' +
            '      <button id="home-quiz-btn" type="button" class="shrink-0">' +
            '        Home' +
            '      </button>' +
            '    </div>' +

            '\n  </div>' +

            // NEW: banner (practice mode)
            '\n  <div id="quiz-banner" class="tyf-card-soft hidden" role="status" aria-live="polite"></div>' +

            '\n  <div class="w-full h-2 bg-slate-200 rounded-full mb-5" aria-hidden="true">' +
            '    <div id="quiz-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct) + '" class="h-2 rounded-full transition-all"></div>' +
            '  </div>' +

            '\n  <div id="question-container" class="space-y-4"></div>' +
            '\n  <div id="feedback-container" class="mt-3 w-full max-w-lg mx-auto pt-2" role="status" aria-live="polite"></div>' +

            '\n  <div id="nav-hint" class="mt-3 text-sm text-gray-600 hidden" role="status" aria-live="polite"></div>' +

            '\n  <div class="tyf-quiz-actions">' +
            '    <button id="prev-question-btn" type="button">Previous</button>' +
            '    <button id="next-question-btn" type="button">Next</button>' +
            '  </div>' +

            "\n</div>"
        );
    };


    UICore.prototype.setQuizBanner = function (type, text) {
        const el = document.getElementById("quiz-banner");
        if (!el) return;

        el.textContent = String(text == null ? "" : text);
        el.classList.remove("hidden");
    };

    UICore.prototype.clearQuizBanner = function () {
        const el = document.getElementById("quiz-banner");
        if (!el) return;

        el.textContent = "";
        el.classList.add("hidden");
    };




    UICore.prototype.getCurrentIndexSafe = function () {
        var qm = this.quizManager;
        var idx = Number(qm && qm.currentIndex);
        return Number.isFinite(idx) ? idx : 0;
    };

    UICore.prototype.getAnswerAt = function (index) {
        var qm = this.quizManager;
        var arr = (qm && Array.isArray(qm.userAnswers)) ? qm.userAnswers : [];
        return arr[index];
    };

    UICore.prototype.getStatusAt = function (index) {
        var qm = this.quizManager;
        var arr = (qm && Array.isArray(qm.questionStatus)) ? qm.questionStatus : [];
        return arr[index];
    };


    UICore.prototype.getResultsInsight = function (resultsData) {
        try {
            var qm = this.quizManager;
            var quiz = qm && qm.currentQuiz;
            var questions = quiz && Array.isArray(quiz.questions) ? quiz.questions : [];
            var statusArr = qm && Array.isArray(qm.questionStatus) ? qm.questionStatus : [];

            var total = questions.length;
            if (!total || !statusArr.length) {
                return "Clear snapshot. One replay will show you what changes the meaning.";
            }

            var validatedCount = 0;
            var incorrectCount = 0;

            var audioTotal = 0, audioIncorrect = 0;
            var nonAudioTotal = 0, nonAudioIncorrect = 0;

            // Simple fatigue signal: compare last third vs first two thirds
            var lastThirdStart = Math.floor((2 * total) / 3);
            var incorrectLate = 0;
            var validatedLate = 0;

            for (var i = 0; i < total; i++) {
                var q = questions[i] || {};
                var st = statusArr[i] || null;

                var validated = !!(st && st.validated === true);
                var isIncorrect = validated && (st.isCorrect === false);

                if (validated) validatedCount++;
                if (isIncorrect) incorrectCount++;

                var hasAudio = !!q.audio;
                if (hasAudio) {
                    audioTotal++;
                    if (isIncorrect) audioIncorrect++;
                } else {
                    nonAudioTotal++;
                    if (isIncorrect) nonAudioIncorrect++;
                }

                if (i >= lastThirdStart && validated) {
                    validatedLate++;
                    if (isIncorrect) incorrectLate++;
                }
            }

            var pct = Number(resultsData && resultsData.percentage);
            pct = Number.isFinite(pct) ? pct : 0;

            if (validatedCount === 0) {
                return "Nothing was validated here. Replay once and validate each answer to get a real diagnostic.";
            }

            var audioErrRate = audioTotal ? (audioIncorrect / audioTotal) : 0;
            var nonAudioErrRate = nonAudioTotal ? (nonAudioIncorrect / nonAudioTotal) : 0;

            // 1) Audio clearly harder
            if (audioTotal > 0 && audioErrRate >= Math.max(0.34, nonAudioErrRate + 0.20)) {
                return "Audio is your current bottleneck. You know the idea, but the key word passes too fast.";
            }

            // 2) Audio impacts mid-range accuracy
            if (audioTotal > 0 && pct >= 50 && pct < 80 && audioIncorrect > 0) {
                return "You’re close. In audio, the choices feel similar at real speed, so you lose accuracy.";
            }

            // 3) Fatigue/pressure at the end
            if (validatedLate >= 3 && (incorrectLate / Math.max(1, validatedLate)) >= 0.67 && incorrectCount >= 3) {
                return "You start strong, then you rush near the end. Totally normal. One calm decision per question fixes it.";
            }

            // 4) Default: close calls, nuance, distractors
            if (pct < 50) {
                return "These misses are close calls. One word flips the meaning. One replay will make it obvious.";
            }

            return "Most misses are close choices. You’re building nuance, not memorizing basics. That is progress.";
        } catch (e) {
            return "Clear snapshot. One replay will show you what changes the meaning.";
        }
    };



    UICore.prototype.getResultsAction = function (resultsData) {
        try {
            var insight = this.getResultsInsight(resultsData) || "";
            var pct = Number(resultsData && resultsData.percentage);
            pct = Number.isFinite(pct) ? pct : 0;

            // Audio-focused actions
            var insightLc = String(insight || "").toLowerCase();

            if (insightLc.indexOf("audio is your current bottleneck") !== -1 || insightLc.indexOf("audio is your bottleneck") !== -1) {
                return "Replay now. Before you answer, catch 2 anchor words in the audio. Then choose fast.";
            }
            if (insightLc.indexOf("in audio") !== -1 && insightLc.indexOf("lose accuracy") !== -1) {
                return "Replay now. Do 1 clean listen, decide quickly, and do not change your mind.";
            }


            // End-of-quiz rush
            if (insight.indexOf("rush near the end") !== -1) {
                return "Replay now. For the last questions, pause 2 seconds before you choose. Make one calm decision.";
            }

            // Low score: explanation-driven replay
            if (pct < 50) {
                return "Replay now and open the detailed analysis. Find the single word that flips the meaning.";
            }

            // Default: pattern-building
            return "Replay now and use the explanations to spot what makes the distractor tempting.";
        } catch (e) {
            return "Replay this quiz once and focus on the pattern.";
        }
    };


    UICore.prototype.renderCurrentQuestion = function () {
        const question = this.quizManager.getCurrentQuestion();
        if (!question) {
            console.error("UICore: No current question to render");
            return;
        }

        const feedbackContainer = document.getElementById("feedback-container");
        if (feedbackContainer) {
            feedbackContainer.classList.add("hidden");
            feedbackContainer.innerHTML = "";
        }

        const questionContainer = document.getElementById("question-container");
        if (!questionContainer) {
            console.error("UICore: #question-container not found");
            return;
        }

        // Stop any previous audio before rerender (prevents "ghost" playback)
        try {
            document.querySelectorAll(".question-audio").forEach(function (a) {
                try {
                    a.pause();
                    a.currentTime = 0;
                } catch (e) { }
            });
        } catch (e) { }

        questionContainer.innerHTML = this.generateQuestionHTML(question);
        this.setupQuestionEvents();


        // Re-appliquer la sélection précédente (si existante)
        const idx = this.getCurrentIndexSafe ? this.getCurrentIndexSafe() : 0;
        const ans = this.getAnswerAt ? this.getAnswerAt(idx) : null;

        if (typeof ans === "number") {
            const opt = document.querySelector('.option[data-option-index="' + ans + '"]');
            if (opt) {
                opt.classList.add("selected");
                opt.setAttribute("aria-checked", "true");
                const indicator = opt.querySelector(".option-indicator-dot");
                if (indicator) {
                    indicator.classList.remove("scale-0");
                    indicator.classList.add("scale-100");
                }
            }
        }


        this.updateQuizProgress();

    };


    UICore.prototype.generateQuestionHTML = function (question) {
        const rawQuestionText = question.question || question.text || "Question text missing";
        const questionText = this.escapeHTML(rawQuestionText);

        const hasAudio = !!question.audio;
        const questionNumber = (Number(this.quizManager && this.quizManager.currentIndex) || 0) + 1;

        const questionsArr =
            this.quizManager &&
                this.quizManager.currentQuiz &&
                Array.isArray(this.quizManager.currentQuiz.questions)
                ? this.quizManager.currentQuiz.questions
                : [];
        const totalQuestions = questionsArr.length;

        const quizName =
            this.quizManager && this.quizManager.currentQuiz
                ? this.escapeHTML(this.normalizeText(this.quizManager.currentQuiz.name))
                : "";

        const hintHTML = question.hint ? this.escapeHTML(question.hint) : "";

        return (
            '\n<div class="question-content">' +
            (hasAudio ? this.generateAudioHTML(question.audio) : "") +
            '\n  <div class="question-header mb-4">' +
            '\n    <div class="flex items-center justify-between mb-4">' +
            '\n      <span class="text-sm font-medium text-gray-600">' +
            quizName +
            " | Question " +
            questionNumber +
            " of " +
            totalQuestions +
            "</span>" +
            '\n      <span class="text-sm text-blue-600 font-medium">Choose the best answer</span>' +
            "\n    </div>" +
            '\n    <h2 class="text-xl md:text-2xl font-bold text-gray-900 leading-relaxed">' +
            questionText +
            "</h2>" +
            "\n  </div>" +
            '\n  <div class="options-container space-y-3" role="radiogroup" aria-label="Answer choices">' +
            (Array.isArray(question.options) ? question.options.map(this.generateOptionHTML.bind(this)).join("") : "") +
            "\n  </div>" +
            (hintHTML
                ? '\n  <div class="question-hint mt-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">' +
                '\n    <div class="flex items-start">' +
                '\n      <div class="font-medium text-blue-800 mr-2">Hint:</div>' +
                '\n      <div class="text-blue-700 text-sm">' +
                hintHTML +
                "</div>" +
                "\n    </div>" +
                "\n  </div>"
                : "") +
            "\n</div>"
        );
    };


    UICore.prototype.generateAudioHTML = function (audioFilename) {
        const themeId = this.quizManager.currentThemeId;
        const audioPath = this.resourceManager.getAudioPath(themeId, audioFilename);

        if (!audioPath) {
            console.error("No audio path generated for", audioFilename, "theme", themeId);
            return "";
        }

        const audioPathSafe = this.escapeHTML(String(audioPath || ""));

        return (
            '\n<div class="question-audio-container mb-5">' +
            '\n  <div class="flex justify-center">' +
            '\n    <div class="tyf-audio-player">' +
            '\n      <audio class="question-audio sr-only" preload="metadata">' +
            '\n        <source src="' + audioPathSafe + '" type="audio/mpeg">' +
            '\n        Your browser does not support audio.' +
            '\n      </audio>' +

            '\n      <div class="tyf-audio-controls">' +
            '\n        <button type="button" class="audio-play-btn tyf-audio-btn" data-state="idle" aria-label="Play audio">▶</button>' +
            '\n        <button type="button" class="audio-stop-btn tyf-audio-stop" aria-label="Stop audio">Stop</button>' +
            '\n        <span class="tyf-audio-time" aria-label="Audio time">0:00</span>' +
            '\n      </div>' +

            '\n      <div class="tyf-track" aria-hidden="true">' +
            '\n        <div class="tyf-fill" style="width:0%"></div>' +
            '\n      </div>' +
            '\n    </div>' +
            '\n  </div>' +
            '\n</div>'
        );
    };





    UICore.prototype._stripChoiceLabel = function (s) {
        return String(s).replace(/^[A-D]\s*[.)]\s*/i, "").trim();
    };

    UICore.prototype.generateOptionHTML = function (option, index) {
        const letters = ["A", "B", "C", "D"];
        const letter = letters[index] || String(index + 1);

        const safe = (option === null || option === undefined) ? "" : String(option);
        const clean = this._stripChoiceLabel(safe);
        const cleanEsc = this.escapeHTML(clean);

        return (
            '\n<div class="option" data-option-index="' + index + '" role="radio" aria-checked="false" tabindex="0">' +
            '\n  <div class="flex items-center">' +
            '\n    <div class="option-indicator w-5 h-5 rounded-full mr-4 flex-shrink-0" aria-hidden="true">' +
            '\n      <div class="option-indicator-dot w-full h-full rounded-full transform scale-0 transition-transform"></div>' +
            "\n    </div>" +
            '\n    <span class="option-letter text-lg font-bold text-gray-600 mr-3">' + letter + ".</span>" +
            '\n    <span class="option-text text-gray-900 font-medium flex-1">' + (cleanEsc || "-") + "</span>" +
            "\n  </div>" +
            "\n</div>"
        )
    };


    UICore.prototype.setupQuestionEvents = function () {
        const options = document.querySelectorAll(".option");
        const self = this;

        options.forEach(function (optionEl, index) {
            optionEl.addEventListener("click", function () {
                self._lastInputWasKeyboard = false;
                self.selectOption(index, optionEl);
            });

            optionEl.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    self._lastInputWasKeyboard = true;
                    self.selectOption(index, optionEl);
                    return;
                }

                if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                    e.preventDefault();
                    const next = options[(index + 1) % options.length];
                    if (next) next.focus();
                    return;
                }
                if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    const prev = options[(index - 1 + options.length) % options.length];
                    if (prev) prev.focus();
                    return;



                }
            });
        });

        const container = document.querySelector(".question-audio-container");
        if (!container) return;

        // Anti-doublon: setupQuestionEvents() est rappelé à chaque render
        if (container.dataset.audioBound === "1") return;
        container.dataset.audioBound = "1";

        const audio = container.querySelector(".question-audio");
        const playBtn = container.querySelector(".audio-play-btn");
        const stopBtn = container.querySelector(".audio-stop-btn");
        if (!audio || !playBtn) return;

        // === PLAYER UI (progress + time) ===
        const progressFill = container.querySelector(".tyf-fill");
        const timeLabel = container.querySelector(".tyf-audio-time");

        const formatTime = function (sec) {
            if (!Number.isFinite(sec)) return "0:00";
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60).toString().padStart(2, "0");
            return m + ":" + s;
        };

        const updateTimeUI = function () {
            if (!timeLabel) return;
            const cur = audio.currentTime || 0;
            const dur = audio.duration || 0;
            timeLabel.textContent = formatTime(cur) + " / " + formatTime(dur);
        };

        const updateProgressUI = function () {
            if (!progressFill || !audio.duration) return;
            const pct = Math.min(100, Math.max(0, (audio.currentTime / audio.duration) * 100));
            progressFill.style.width = pct + "%";
        };


        const setPlayBtnState = function (state) {
            // state: "idle" | "loading" | "playing" | "ready" | "error"
            if (state === "loading") {
                playBtn.disabled = true;
                playBtn.textContent = "… Loading";
                playBtn.setAttribute("aria-busy", "true");
                return;
            }

            playBtn.setAttribute("aria-busy", "false");

            if (state === "playing") {
                playBtn.disabled = false;
                playBtn.textContent = "↻ Replay";
                return;
            }
            if (state === "ready") {
                playBtn.disabled = false;
                playBtn.textContent = "▶ Play";
                return;
            }
            if (state === "error") {
                playBtn.disabled = false;
                playBtn.textContent = "⚠ Audio error";
                return;
            }

            // idle
            playBtn.disabled = false;
            playBtn.textContent = "▶ Play";
        };


        const stopAudio = function () {
            try {
                audio.pause();
                audio.currentTime = 0;
            } catch (e) { }
            setPlayBtnState("ready");
        };

        const playNow = function () {
            try {
                audio.currentTime = 0;
            } catch (e) { }

            updateProgressUI();
            updateTimeUI();

            audio.play().then(function () {
                setPlayBtnState("playing");
                updateProgressUI();
                updateTimeUI();
            }).catch(function (error) {
                console.error("Audio playback failed:", error);

                // Cas courant mobile: interaction requise
                if (error && error.name === "NotAllowedError") {
                    playBtn.textContent = "Tap to allow audio";
                    playBtn.disabled = false;
                    return;
                }

                // Format/ressource
                if (error && error.name === "NotSupportedError") {
                    playBtn.textContent = "Format not supported";
                    playBtn.disabled = true;
                    return;
                }

                if (audio.error && audio.error.code === 4) {
                    playBtn.textContent = "Audio file not found";
                    playBtn.disabled = true;
                    return;
                }

                setPlayBtnState("error");
            });
        };

        playBtn.addEventListener("click", function () {
            setPlayBtnState("loading");

            if (audio.readyState >= 1) {
                playNow();
                return;
            }

            const timeoutId = setTimeout(function () {
                console.error("Audio loading timeout");
                playBtn.textContent = "Loading timeout";
                playBtn.disabled = false;
            }, 10000);

            const onReady = function () {
                clearTimeout(timeoutId);
                playNow();
            };

            audio.addEventListener("loadedmetadata", onReady, { once: true });
            audio.addEventListener("canplay", onReady, { once: true });

            try {
                audio.load();
            } catch (loadError) {
                console.error("Audio load() failed:", loadError);
                clearTimeout(timeoutId);
                playBtn.textContent = "Cannot load audio";
                playBtn.disabled = true;
            }
        });

        if (stopBtn) {
            stopBtn.addEventListener("click", function (e) {
                if (e) e.preventDefault();
                try {
                    audio.pause();
                    audio.currentTime = 0;
                } catch (e) { }
                updateProgressUI();
                updateTimeUI();
                setPlayBtnState("ready");
            });
        }


        // Si l'audio plante pendant/avant lecture
        audio.addEventListener("error", function () {
            if (audio.error) {
                switch (audio.error.code) {
                    case 1: playBtn.textContent = "Audio cancelled"; break;
                    case 2: playBtn.textContent = "Network error"; break;
                    case 3: playBtn.textContent = "Audio format error"; break;
                    case 4: playBtn.textContent = "Audio file not found"; break;
                    default: playBtn.textContent = "Audio unavailable";
                }
            } else {
                playBtn.textContent = "Audio unavailable";
            }
            playBtn.disabled = true;
        });

        // Si l'audio plante pendant/avant lecture
        audio.addEventListener("loadedmetadata", function () {
            updateTimeUI();
            updateProgressUI();
        });

        audio.addEventListener("timeupdate", function () {
            updateTimeUI();
            updateProgressUI();
        });

        audio.addEventListener("ended", function () {
            updateProgressUI();
            updateTimeUI();
            setPlayBtnState("ready");
        });

    };



    UICore.prototype.selectOption = function (index, optionElement) {
        try {
            document.querySelectorAll(".option").forEach(function (opt) {
                opt.classList.remove("selected");
                opt.setAttribute("aria-checked", "false");
                const indicator = opt.querySelector(".option-indicator-dot");
                if (indicator) {
                    indicator.classList.remove("scale-100");
                    indicator.classList.add("scale-0");
                }
            });

            optionElement.classList.add("selected");
            optionElement.setAttribute("aria-checked", "true");
            const indicator = optionElement.querySelector(".option-indicator-dot");
            if (indicator) {
                indicator.classList.remove("scale-0");
                indicator.classList.add("scale-100");
            }

            this.quizManager.selectAnswer(index);

            // Next lock/unlock (QuizManager peut valider après-coup)
            this.updateNavigationButtons();
            setTimeout(() => {
                try { this.updateNavigationButtons(); } catch (e) { }
            }, 0);

            // Focus Next UNIQUEMENT si action clavier
            if (this._lastInputWasKeyboard) {
                const nextBtn = document.getElementById("next-question-btn");
                if (nextBtn && !nextBtn.disabled) nextBtn.focus();
            }
        } catch (error) {
            console.error("Error selecting option:", error);
        }
    };



    UICore.prototype.showQuestionFeedback = function (question, selectedIndex) {
        const feedbackContainer = document.getElementById("feedback-container");
        if (feedbackContainer) feedbackContainer.classList.remove("hidden");

        if (this.features && this.features.showQuestionFeedback) {
            this.features.showQuestionFeedback(question, selectedIndex);
            return;
        }
        console.warn("UIFeatures.showQuestionFeedback missing - no feedback rendered.");
    };


    /* ----------------------------------------
       THEME GRID & THEME STATE
       ---------------------------------------- */
    UICore.prototype.getThemeStateClass = function (theme) {
        const id = Number(theme && theme.id);

        if (id === 1) return "section-theme-free";

        const isPremium = !!this.storageManager.isPremiumUser?.();
        if (isPremium) return "section-theme-premium";

        const isUnlocked = !!this.storageManager.isThemeUnlocked?.(id);
        if (isUnlocked) return "section-theme-unlocked";

        return "section-theme-locked";
    };


    UICore.prototype.generateSimpleThemesGrid = function () {
        if (!this.themeIndexCache || this.themeIndexCache.length === 0) {
            return '<div class="text-center text-gray-500 col-span-full">Loading themes...</div>';
        }

        var self = this;

        return this.themeIndexCache
            .map(function (theme) {
                const id = Number(theme && theme.id);

                const nameRaw = self.normalizeText(theme && theme.name);
                const descRaw = self.normalizeText((theme && theme.description) || "");

                const name = self.escapeHTML(nameRaw);
                const desc = self.escapeHTML(descRaw);

                const stateClass = self.getThemeStateClass(theme);
                const isLocked = stateClass === "section-theme-locked";

                // Accessibilité + clavier
                // IMPORTANT: même verrouillé, le tile doit rester activable (pour ouvrir paywall/roadmap)
                const tabIndexAttr = ' tabindex="0"';

                // Label lisible (pas de HTML)
                const ariaLabel =
                    (nameRaw ? nameRaw : "Theme") +
                    (isLocked ? " (locked, opens unlock options)" : "");

                // Visuel (NE PAS bloquer les events: paywall + "See roadmap" doivent rester cliquables)
                const lockedClass = isLocked ? " select-none opacity-80" : "";

                return (
                    '\n<div class="theme-item ' +
                    stateClass +
                    lockedClass +
                    '" data-theme-id="' +
                    id +
                    '" role="button"' +
                    tabIndexAttr +
                    ' aria-label="' +
                    self.escapeHTML(ariaLabel) +
                    '"' +
                    '>' +
                    '\n  <div class="text-center">' +
                    '\n    <div class="text-2xl mb-2">' +
                    self.escapeHTML(theme.icon || "") +
                    "</div>" +
                    '\n    <h3 class="text-sm font-bold mb-1">' +
                    name +
                    "</h3>" +
                    '\n    <p class="text-xs text-gray-600 line-clamp-2">' +
                    desc +
                    "</p>" +
                    "\n    " +
                    self.getThemeProgressDisplay(id) +
                    "\n  </div>" +
                    "\n</div>"
                );
            })
            .join("");
    };



    UICore.prototype.getThemeProgressDisplay = function (themeId) {
        const idNum = Number(themeId);
        if (!Number.isFinite(idNum)) {
            return '<div class="text-xs text-gray-500 mt-2"></div>';
        }

        // Theme gratuit (Colors)
        if (idNum === 1) {
            return '<div class="text-xs text-green-600 mt-2">Free</div>';
        }

        // Premium = tout débloqué
        const isPremium = !!this.storageManager.isPremiumUser?.();
        if (isPremium) {
            return '<div class="text-xs text-blue-600 mt-2">Unlocked</div>';
        }

        // Thème déjà débloqué
        if (this.storageManager.isThemeUnlocked &&
            this.storageManager.isThemeUnlocked(idNum)) {

            if (typeof this.storageManager.getThemeProgress === "function") {
                const progress = this.storageManager.getThemeProgress(idNum) || {
                    completedCount: 0,
                    total: 0
                };

                const colorClass =
                    progress.completedCount > 0 ? "text-green-600" : "text-blue-600";

                return (
                    '<div class="text-xs ' +
                    colorClass +
                    ' mt-2">Completed ' +
                    progress.completedCount +
                    "/" +
                    progress.total +
                    "</div>"
                );
            }

            return '<div class="text-xs text-blue-600 mt-2">Unlocked</div>';
        }

        // Si pas de logique French Points → fallback premium
        if (typeof this.storageManager.canUnlockTheme !== "function") {
            return '<div class="text-xs text-gray-500 mt-2">Unlock with Premium</div>';

        }

        // Déterminer le prochain thème atteignable (ordre par id)
        const themeData = this.themeIndexCache || [];
        const self = this;

        const nextThemeId = (function () {
            const list = (themeData || [])
                .filter(t => t && t.id != null)
                .map(t => ({ ...t, id: Number(t.id) }))
                .filter(t => Number.isFinite(t.id))
                .sort((a, b) => a.id - b.id);

            for (let i = 0; i < list.length; i++) {
                const t = list[i];
                if (t.id === 1) continue;

                const unlocked = !!self.storageManager.isThemeUnlocked?.(t.id);
                const prev = list[i - 1];
                const prevUnlocked = !prev
                    ? true
                    : (prev.id === 1 ? true : !!self.storageManager.isThemeUnlocked?.(prev.id));

                if (!unlocked && prevUnlocked) return t.id;

            }
            return null;
        })();

        const unlockStatus = this.storageManager.canUnlockTheme(idNum) || {};

        // Bloqué par progression (thème précédent non complété)
        if (unlockStatus.reason === "PREVIOUS_LOCKED") {
            const list = (this.themeIndexCache || [])
                .filter(t => t && t.id != null)
                .map(t => ({ ...t, id: Number(t.id) }))
                .filter(t => Number.isFinite(t.id))
                .sort((a, b) => a.id - b.id);

            const idx = list.findIndex(t => t.id === idNum);
            const prev = idx > 0 ? list[idx - 1] : null;
            const previousTheme = prev ? this.normalizeText(prev.name) : "the previous theme";
            const previousThemeSafe = this.escapeHTML(previousTheme);

            return (
                '<div class="text-xs text-gray-400 mt-2">' +
                '🔒 Complete <strong>' + previousThemeSafe + '</strong> first | ' +
                '<a href="#" class="text-purple-600 hover:underline" data-action="show-roadmap" role="button" tabindex="0">' +
                'See roadmap</a>' +
                '</div>'
            );



        }

        // Thème atteignable mais pas assez de FP
        if (idNum === nextThemeId && unlockStatus.reason === "INSUFFICIENT_FP") {
            const fp = typeof this.storageManager.getFrenchPoints === "function"
                ? Number(this.storageManager.getFrenchPoints()) || 0
                : 0;

            const themeCost = typeof this.storageManager.getThemeCost === "function"
                ? Number(this.storageManager.getThemeCost(idNum))
                : Number(unlockStatus.cost);

            if (Number.isFinite(themeCost)) {
                const needed = Math.max(0, themeCost - fp);

                return (
                    '<div class="text-xs text-gray-500 mt-2">' +
                    needed +
                    ' more French Points needed or go Premium.</div>'
                );
            }
        }

        // Thème atteignable et prêt à être débloqué
        if (idNum === nextThemeId && unlockStatus.canUnlock && Number.isFinite(unlockStatus.cost)) {
            return (
                '<div class="text-xs text-blue-600 mt-2">' +
                'Unlock with ' + unlockStatus.cost + ' French Points or go Premium.' +
                '</div>'
            );
        }

        // Sinon: ne rien afficher (évite le bruit cognitif)
        return '<div class="text-xs text-gray-500 mt-2"></div>';
    };

    /* ----------------------------------------
       ROADMAP MODAL (HTML GENERATOR)
       ---------------------------------------- */
    UICore.prototype.generateUnlockRoadmapHTML = function () {
        var priceHTML = "";
        try {
            priceHTML = this._getPremiumPriceHTML ? this._getPremiumPriceHTML() : "$99 $12";
        } catch (e) {
            priceHTML = "$99 $12";
        }

        return (
            '\n<div id="roadmap-modal" class="tyf-modal-backdrop" role="dialog" aria-modal="true" aria-label="Unlock roadmap">' +
            '\n  <div class="tyf-modal" role="document">' +

            '\n    <div class="flex items-start justify-between gap-3 mb-3">' +
            '\n      <h2 class="text-lg font-bold text-gray-900">How unlocking works</h2>' +
            '\n      <button id="close-roadmap-btn" type="button" class="text-sm underline">Close</button>' +
            '\n    </div>' +

            '\n    <p class="text-sm text-gray-700 mb-4">Two ways to unlock themes. Pick what fits you.</p>' +

            '\n    <div class="space-y-3">' +
            '\n      <div class="tyf-card-soft p-4">' +
            '\n        <div class="font-bold text-gray-900 mb-1">Option 2: Premium (all themes instantly)</div>' +
            '\n        <div class="text-sm text-gray-700">One payment. No subscription. Unlock everything now.</div>' +
            '\n        <button id="roadmap-premium-pay-btn" type="button" class="text-sm underline font-semibold text-purple-700 hover:text-purple-900 mt-2">' +
            '\n          <strong>Today:</strong> ' + priceHTML + ' one-time' +
            '\n        </button>' +
            '\n      </div>' +
            '\n    </div>' +

            (function () {
                var wording = (window.TYF_WORDING && window.TYF_WORDING.premium) || {};
                return (
                    '\n    <div class="mt-4 flex flex-col sm:flex-row gap-2">' +
                    '\n      <button id="roadmap-enter-code-btn" type="button" class="quiz-button w-full sm:w-auto whitespace-normal">' +
                    (wording.ctaEnter || "Enter a premium code") +
                    '</button>' +
                    '\n      <button id="roadmap-enter-code-btn-bottom" type="button" class="text-sm underline w-full sm:w-auto">' +
                    (wording.ctaAlreadyHave || "I already have a code") +
                    '</button>' +
                    '\n    </div>'
                );
            })() +

            '\n  </div>' +
            '\n</div>'
        );
    };

    UICore.prototype.showUnlockRoadmap = function () {
        const existing = document.getElementById("roadmap-modal");
        if (existing) {
            let ev;
            try {
                ev = new Event("tyf:close", { bubbles: true });
            } catch (e) {
                ev = document.createEvent("Event");
                ev.initEvent("tyf:close", true, true);
            }
            existing.dispatchEvent(ev);
            if (existing.parentNode) existing.parentNode.removeChild(existing);
        }

        const previousActiveElement = document.activeElement;
        const prevBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const wrapper = document.createElement("div");
        wrapper.innerHTML = this.generateUnlockRoadmapHTML();

        const modal = wrapper.firstElementChild;
        if (!modal) {
            document.body.style.overflow = prevBodyOverflow || "";
            return;
        }

        document.body.appendChild(modal);

        const closeBtn = modal.querySelector("#close-roadmap-btn");
        const codeBtnTop = modal.querySelector("#roadmap-enter-code-btn");
        const codeBtnBottom = modal.querySelector("#roadmap-enter-code-btn-bottom");
        const premiumBtn = modal.querySelector("#roadmap-premium-pay-btn");
        let cleaned = false;

        var self = this;

        var getFocusable = function () {
            return modal.querySelectorAll(
                'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
            );
        };

        var handleTabTrap = function (e) {
            if (e.key !== "Tab") return;

            if (!modal.contains(document.activeElement)) {
                e.preventDefault();
                const focusable = getFocusable();
                if (focusable && focusable[0]) focusable[0].focus();
                else if (closeBtn) closeBtn.focus();
                return;
            }

            const focusable = getFocusable();
            if (!focusable || focusable.length === 0) {
                e.preventDefault();
                if (closeBtn) closeBtn.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        var handleEscape = function (e) {
            if (e.key === "Escape" || e.key === "Esc") {
                cleanup();
                try { modal.remove(); } catch (err) { }
            }
        };

        var cleanup = function () {
            if (cleaned) return;
            cleaned = true;

            document.removeEventListener("keydown", handleEscape);
            document.removeEventListener("keydown", handleTabTrap);

            document.body.style.overflow = prevBodyOverflow || "";

            try {
                if (previousActiveElement && typeof previousActiveElement.focus === "function") {
                    previousActiveElement.focus();
                }
            } catch (e) { }
        };

        var openCodeModal = function (e) {
            if (e) e.preventDefault();

            cleanup();
            try { modal.remove(); } catch (err) { }

            if (self.features && typeof self.features.showPremiumCodeModal === "function") {
                self.features.showPremiumCodeModal();
                return;
            }

            if (window.uiCore && window.uiCore.features && typeof window.uiCore.features.showPremiumCodeModal === "function") {
                window.uiCore.features.showPremiumCodeModal();
                return;
            }

            if (typeof window.showErrorMessage === "function") {
                window.showErrorMessage("Code entry is unavailable. Please refresh the page.");
            } else {
                console.error("Code entry is unavailable.");
            }
        };

        var openPremiumPay = function (e) {
            if (e) e.preventDefault();

            try { self._track("roadmap_premium_clicked", { source: "roadmap" }); } catch (err) { }

            cleanup();
            try { modal.remove(); } catch (err) { }

            const stripeUrl = window.TYF_CONFIG && window.TYF_CONFIG.stripePaymentUrl ? window.TYF_CONFIG.stripePaymentUrl : "";
            if (stripeUrl) {
                window.open(stripeUrl, "_blank", "noopener,noreferrer");
                return;
            }

            if (self.features && typeof self.features.showPaywallModal === "function") {
                self.features.showPaywallModal("roadmap-premium");
                return;
            }

            if (typeof window.showErrorMessage === "function") {
                window.showErrorMessage("Payment is unavailable. Please refresh the page.");
            } else {
                console.error("Payment is unavailable.");
            }
        };

        if (codeBtnTop) codeBtnTop.addEventListener("click", openCodeModal);
        if (codeBtnBottom) codeBtnBottom.addEventListener("click", openCodeModal);
        if (premiumBtn) premiumBtn.addEventListener("click", openPremiumPay);

        modal.addEventListener("tyf:close", cleanup, { once: true });

        document.addEventListener("keydown", handleEscape);
        document.addEventListener("keydown", handleTabTrap);

        if (closeBtn) {
            closeBtn.addEventListener("click", function (e) {
                if (e) e.preventDefault();
                cleanup();
                try { modal.remove(); } catch (err) { }
            });
            setTimeout(function () { closeBtn.focus(); }, 100);
        } else {
            setTimeout(function () {
                const focusable = getFocusable();
                if (focusable && focusable[0]) focusable[0].focus();
            }, 100);
        }

        modal.addEventListener("click", function (e) {
            if (e.target === modal) {
                e.preventDefault();
                e.stopPropagation();
                cleanup();
                try { modal.remove(); } catch (err) { }
            }
        });
    };



    /* ----------------------------------------
       QUIZ SELECTION (INSIDE A THEME)
       ---------------------------------------- */
    UICore.prototype.showQuizSelection = function () {
        this.showScreen("quiz-selection", this.generateQuizSelectionHTML);
    };

    UICore.prototype.generateQuizSelectionHTML = function () {
        const themeId = this.quizManager.currentThemeId;
        const theme = (this.themeIndexCache || []).find(function (t) {
            return Number(t.id) === Number(themeId);
        });

        if (!theme) {
            return this.generateErrorHTML("Theme not found");
        }

        // Sécurisation stricte des données venant du metadata.json
        const themeNameSafe = this.escapeHTML(this.normalizeText(theme.name));
        const themeDescSafe = this.escapeHTML(this.normalizeText(theme.description || ""));

        // FIX: quizzes peut être undefined
        const quizzes = Array.isArray(theme.quizzes) ? theme.quizzes : [];

        return (
            '\n<div class="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50" role="main" aria-label="Quiz selection">' +
            '\n  <div class="max-w-4xl mx-auto px-4 pt-6 pb-10">' +

            '\n    <div class="flex gap-4 mb-6">' +
            '\n      <button id="back-to-home-btn" class="text-blue-600 hover:text-blue-800 font-medium py-2 px-6 rounded-lg border border-blue-200 hover:border-blue-300 transition-colors">' +
            'Home' +
            '</button>' +
            '\n    </div>' +

            '\n    <div class="text-center mb-5">' +
            '\n      <div class="text-2xl mb-2">' +
            this.escapeHTML(theme.icon || "") +
            '</div>' +
            '\n      <h1 class="text-2xl md:text-3xl font-extrabold text-gray-900 mb-2 leading-tight">' +
            themeNameSafe +
            '</h1>' +
            '\n      <p class="text-sm md:text-base text-gray-700 max-w-2xl mx-auto line-clamp-2">' +
            themeDescSafe +
            '</p>' +
            '\n    </div>' +


            '\n    <div id="quizzes-grid" class="grid grid-cols-1 md:grid-cols-2 gap-6" aria-label="Quizzes in this theme">' +
            (quizzes.length
                ? this.generateQuizCards(quizzes)
                : '<div class="col-span-full text-center text-gray-600 p-8">No quizzes found for this theme.</div>'
            ) +
            '\n    </div>' +

            '\n  </div>' +
            '\n</div>'
        );
    };



    UICore.prototype.generateQuizCards = function (quizzes) {
        const self = this;

        // Sécurité absolue : garantir un tableau
        quizzes = Array.isArray(quizzes) ? quizzes : [];

        if (!quizzes.length) return "";

        // ✅ Règle produit: si le thème est déverrouillé, tous les quiz le sont aussi
        const themeId = Number(self.quizManager && self.quizManager.currentThemeId);
        const isPremium = !!self.storageManager.isPremiumUser?.();
        const themeUnlocked =
            (Number.isFinite(themeId) && themeId === 1) ||
            isPremium ||
            !!self.storageManager.isThemeUnlocked?.(themeId);

        return quizzes
            .map(function (quiz, idx) {
                const quizId = Number(quiz && quiz.id);
                if (!Number.isFinite(quizId)) return "";

                const quizNameSafe = self.escapeHTML(self.normalizeText(quiz.name || "Quiz"));
                const quizDescSafe = self.escapeHTML(self.normalizeText(quiz.description || ""));

                // ✅ Thème unlocked => quiz unlocked (court-circuit total)
                const isUnlocked = themeUnlocked
                    ? true
                    : (typeof self.storageManager.isQuizUnlocked === "function"
                        ? !!self.storageManager.isQuizUnlocked(quizId)
                        : true);

                const isCompleted =
                    typeof self.storageManager.isQuizCompleted === "function"
                        ? !!self.storageManager.isQuizCompleted(quizId)
                        : false;

                const classes =
                    "quiz-item theme-card transition-all " +
                    (isUnlocked ? "hover:shadow-lg cursor-pointer" : "opacity-60 cursor-not-allowed");

                const ariaDisabled = isUnlocked ? "false" : "true";

                return (
                    '\n<div class="' +
                    classes +
                    '" data-quiz-id="' +
                    quizId +
                    '" role="button" tabindex="0" aria-disabled="' +
                    ariaDisabled +
                    '">' +

                    '\n  <div class="flex items-center justify-between mb-4">' +
                    '\n    <span class="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">' +
                    (idx + 1) +
                    '</span>' +
                    (isCompleted
                        ? '\n    <span class="text-green-600 text-sm font-medium">Done</span>'
                        : '') +
                    (!isUnlocked
                        ? '\n    <span class="text-gray-400 text-sm font-medium">Locked</span>'
                        : '') +
                    '\n  </div>' +

                    '\n  <h3 class="font-bold text-lg mb-2">' +
                    quizNameSafe +
                    '</h3>' +

                    '\n  <p class="text-gray-600 text-sm">' +
                    quizDescSafe +
                    '</p>' +

                    '\n</div>'
                );
            })
            .join("");
    };

    /* ----------------------------------------
       STATS SCREEN
       ---------------------------------------- */
    UICore.prototype.showStatsScreen = function () {
        if (!this.charts) {
            console.error("UICharts not initialized");
            this.showError("Statistics are temporarily unavailable. Please refresh the page.");
            return;
        }

        this.showScreen("stats", function () {
            try {
                return this.charts.generateFullStatsPage();
            } catch (error) {
                console.error("Error generating stats page:", error);
                return this.generateFallbackStatsHTML();
            }
        });

    };

    UICore.prototype.generateFallbackStatsHTML = function () {
        return (
            '\n<div class="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">' +
            '\n  <div class="max-w-2xl mx-auto">' +
            '\n    <div class="theme-card text-center">' +
            '\n      <h2 class="text-xl font-bold mb-4">Your progress</h2>' +
            '\n      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">' +
            '\n        <p class="text-blue-700">Statistics are being prepared...</p>' +
            "\n      </div>" +
            '\n      <button id="back-to-welcome-btn" class="quiz-button">' +
            "Back to home" +
            "</button>" +
            "\n    </div>" +
            "\n  </div>" +
            "\n</div>"
        );
    };

    /* ----------------------------------------
       EVENT WIRING
       ---------------------------------------- */
    UICore.prototype.setupStatsEvents = function () {
        const self = this;

        this.addClickHandler("back-to-welcome-btn", this.showWelcomeScreen.bind(this));

        // NEW: best action from stats (rendered in UICharts, wired here)
        this.addClickHandler("stats-quickstart-btn", function () {
            self._track("stats_quickstart_clicked", { source: "stats" });

            const themeId = self._getThemeIdForQuickStart();
            self.quizManager.currentThemeId = themeId;
            self.showQuizSelection();
        });

        if (this.charts && this.charts.loadDetailedStats) {
            setTimeout(this.charts.loadDetailedStats.bind(this.charts), 100);
        }
    };


    UICore.prototype.renderDailyGoalNudge = function () {
        const slot = document.getElementById("daily-goal-slot");
        if (!slot) return;

        let uiState = {};
        try {
            uiState = this.storageManager.getUIState?.() || {};
        } catch (e) {
            uiState = {};
        }

        const today = this._todayKey();
        const lastActive = this._getLastActiveDateFromUIState(uiState);
        const activeToday = this._isSameDay(lastActive, today);

        // Si déjà actif aujourd'hui, on n'affiche rien (nudge = friction inutile)
        if (activeToday) {
            slot.innerHTML = "";
            return;
        }

        slot.innerHTML =
            '\n<div class="tyf-stats-card tyf-nudge">' +
            '\n  <div class="tyf-nudge-inner">' +
            '\n    <div>' +
            '\n      <div class="tyf-nudge-title">Daily goal: 1 quiz today</div>' +
            '\n      <div class="tyf-nudge-sub">One quick quiz. No pressure. Keep momentum.</div>' +
            '\n    </div>' +
            '\n    <div class="w-full sm:w-auto">' +
            '\n      <button id="daily-goal-start-btn" type="button" class="quiz-button w-full sm:w-auto whitespace-normal">Choose a quiz</button>' +
            '\n    </div>' +
            '\n  </div>' +
            '\n</div>';


        const btn = document.getElementById("daily-goal-start-btn");
        const self = this;

        if (btn) {
            btn.addEventListener("click", function (e) {
                e.preventDefault();

                self._track("daily_goal_start_clicked", { source: "welcome" });

                const themeId = self._getThemeIdForQuickStart();
                self.quizManager.currentThemeId = themeId;
                self.showQuizSelection();
            });
        }
    };


    UICore.prototype.renderPrimaryCTA = function () {
        const slot = document.getElementById("primary-cta-slot");
        if (!slot) return;

        const self = this;

        let uiState = null;
        try {
            uiState = this.storageManager.getUIState?.() || {};
        } catch (e) {
            uiState = {};
        }

        slot.innerHTML =
            '<div class="tyf-stats-card tyf-nudge">' +
            '<div class="tyf-nudge-inner">' +
            '<div>' +
            '<div class="tyf-nudge-title">Continue with a quick quiz</div>' +
            '<div class="tyf-nudge-sub">Pick a quiz and keep momentum.</div>' +
            '</div>' +
            '<div class="w-full sm:w-auto">' +
            '<button id="primary-cta-continue-btn" type="button" class="quiz-button w-full sm:w-auto whitespace-normal">Choose a quiz</button>' +
            '</div>' +
            '</div></div>';

        this.addClickHandler("primary-cta-continue-btn", function () {
            const themeId = self._getThemeIdForQuickStart();
            self.quizManager.currentThemeId = themeId;
            self.showQuizSelection();
        });
    };




    // ----------------------------------------
    // THEME TILE EVENTS (welcome screen)
    // ----------------------------------------
    UICore.prototype.setupThemeClickEvents = function () {
        const self = this;

        const tiles = document.querySelectorAll('.theme-item[data-theme-id]');
        if (!tiles || !tiles.length) return;

        tiles.forEach(function (tile) {
            // Anti-doublon
            if (tile.dataset.themeBound === "1") return;
            tile.dataset.themeBound = "1";

            const activate = function (e) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }

                // Si clic sur le lien "See roadmap" à l’intérieur, on laisse la délégation roadmap gérer
                try {
                    if (e && e.target && e.target.closest && e.target.closest('[data-action="show-roadmap"]')) {
                        return;
                    }
                } catch (err) { }

                const themeId = Number(tile.dataset.themeId);
                if (!Number.isFinite(themeId)) {
                    console.error("Invalid themeId on tile:", tile.dataset.themeId);
                    return;
                }

                const isPremium = !!self.storageManager.isPremiumUser?.();
                const isFree = themeId === 1;
                const isUnlocked = isFree || isPremium || !!self.storageManager.isThemeUnlocked?.(themeId);

                if (isUnlocked) {
                    self._track("theme_opened", { source: "welcome", themeId: themeId });
                    self.quizManager.currentThemeId = themeId;
                    self.showQuizSelection();
                    return;
                }

                // Locked theme: ouvrir le roadmap (prioritaire), sinon paywall
                self._track("theme_locked_clicked", { source: "welcome", themeId: themeId });

                if (typeof self.showUnlockRoadmap === "function") {
                    self.showUnlockRoadmap();
                    return;
                }
                if (self.features && typeof self.features.showPaywallModal === "function") {
                    self.features.showPaywallModal("locked-theme-" + themeId);
                }
            };

            tile.addEventListener("click", activate);

            tile.addEventListener("keydown", function (e) {
                const k = e && e.key;
                if (k === "Enter" || k === " ") {
                    activate(e);
                }
            });
        });
    };


    UICore.prototype.setupWelcomeEvents = function () {
        const self = this;

        // New user button
        // QuizManager.loadQuiz() appelle déjà showQuizScreen() en interne (ligne 76)
        this.addClickHandler("start-first-quiz-btn", function () {
            const themeId = 1;
            const quizId = 101;

            self.quizManager.currentThemeId = themeId;

            // Track "attempt" at quiz start (not completion)
            self.storageManager?.markQuizStarted?.({ themeId: themeId, quizId: quizId });

            self.quizManager.loadQuiz(themeId, quizId).catch(function (e) {
                console.error("Failed to load quiz:", e);
                self.showError("Quiz could not be loaded. Check quiz JSON path and metadata.");
            });
        });

        // Returning user: stats button
        this.bindEvent("view-stats-btn", "showStatsScreen");

        // NOUVEAU: Roadmap button (P0)
        this.addClickHandler("show-roadmap-btn", function () {
            self.showUnlockRoadmap();
        });

        // Event delegation pour "See roadmap" (scope: appContainer, pas document)
        if (!this._roadmapListenerAttached) {
            const handler = function (e) {
                const target = e.target.closest('[data-action="show-roadmap"]');
                if (!target) return;

                const isKey = e && e.type === "keydown";
                if (isKey) {
                    const k = e.key;
                    if (k !== "Enter" && k !== " ") return;
                }

                e.preventDefault();
                e.stopPropagation();

                if (typeof self.showUnlockRoadmap === "function") {
                    self.showUnlockRoadmap();
                }
            };

            this._roadmapDelegatedHandler = handler;

            this.appContainer.addEventListener("click", handler);
            this.appContainer.addEventListener("keydown", handler);

            this._roadmapListenerAttached = true;
        }

        // Theme tiles
        if (typeof this.setupThemeClickEvents === "function") {
            this.setupThemeClickEvents();
        }
    };


    UICore.prototype.setupQuizSelectionEvents = function () {
        const self = this;
        this.bindEvent("back-to-home-btn", "showWelcomeScreen");


        const quizCards = document.querySelectorAll(".quiz-item[data-quiz-id]");
        quizCards.forEach(function (card) {
            card.setAttribute("role", "button");
            // Ne pas forcer tabindex ici: le HTML gère déjà le focus (actuellement tabindex="0" même si locked).

            const activate = function (e) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }

                const quizId = parseInt(card.dataset.quizId, 10);
                if (!Number.isFinite(quizId)) {
                    console.error("Invalid quizId on card:", card.dataset.quizId);
                    return;
                }

                const themeId = self.quizManager && self.quizManager.currentThemeId;
                if (!Number.isFinite(Number(themeId))) {
                    console.error("Invalid themeId in QuizManager:", themeId);
                    self.showError("Theme not found. Please go back and try again.");
                    return;
                }

                // ✅ Règle produit: thème unlocked => tous les quiz unlocked
                const themeIdNum = Number(themeId);
                const isPremium = !!self.storageManager.isPremiumUser?.();
                const themeUnlocked =
                    (Number.isFinite(themeIdNum) && themeIdNum === 1) ||
                    isPremium ||
                    !!self.storageManager.isThemeUnlocked?.(themeIdNum);

                const unlocked = themeUnlocked
                    ? true
                    : ((typeof self.storageManager.isQuizUnlocked !== "function") ||
                        !!self.storageManager.isQuizUnlocked(quizId));

                if (unlocked) {
                    self.storageManager?.markQuizStarted?.({ themeId: Number(themeId), quizId: quizId });

                    self.quizManager.loadQuiz(themeId, quizId).catch(function (err) {
                        console.error("Failed to load quiz:", err);
                        self.showError("Quiz could not be loaded.");
                    });
                } else if (self.features && self.features.showPaywallModal) {
                    self.features.showPaywallModal("unlock-quiz-" + quizId);
                }


            };

            card.addEventListener("click", activate);
            card.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") activate(e);
            });
        });

    };


    UICore.prototype.setupQuizEvents = function () {
        const self = this;

        const addClick = function (id, handler) {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener("click", function (e) {
                e.preventDefault();
                if (el.disabled) return;

                el.disabled = true;
                el.setAttribute("aria-disabled", "true");

                Promise.resolve()
                    .then(handler)
                    .finally(function () {
                        // Si l’écran a changé, le node peut ne plus exister dans le DOM
                        if (!document.body.contains(el)) return;
                        el.disabled = false;
                        el.removeAttribute("aria-disabled");
                    });
            });

        };

        // BUG FIX: goBackToSelection robuste (force currentThemeId si manquant)
        const goBackToSelection = function () {
            // ✅ Pause timing uniquement quand on quitte l'écran quiz (pas Next/Previous/Finish)
            if (self.quizManager && typeof self.quizManager.pauseTiming === "function") {
                self.quizManager.pauseTiming();
            }

            const themeId =
                self.quizManager?.currentThemeId ||
                Math.floor((self.quizManager?.currentQuizId || 0) / 100);

            if (themeId) {
                self.quizManager.currentThemeId = themeId;
                self.showQuizSelection();
            } else {
                self.showWelcomeScreen();
            }
        };

        // Quiz screen IDs: go-themes-btn / home-quiz-btn (pas quit-quiz-btn / back-to-themes-btn)
        addClick("go-themes-btn", goBackToSelection);
        addClick("home-quiz-btn", function () {
            // ✅ Pause timing uniquement quand on quitte l'écran quiz
            if (self.quizManager && typeof self.quizManager.pauseTiming === "function") {
                self.quizManager.pauseTiming();
            }

            self.showWelcomeScreen();
        });

        addClick("prev-question-btn", function () {
            if (self.quizManager && self.quizManager.previousQuestion) {
                self.quizManager.previousQuestion();
            }
        });

        addClick("next-question-btn", function () {
            if (self.quizManager && self.quizManager.nextQuestion) {
                self.quizManager.nextQuestion();
            }
        });
    };



    UICore.prototype.setupResultsEvents = function () {
        const self = this;

        // Back to theme selection (label matches action)
        this.addClickHandler("back-to-theme-btn", function () {
            const themeId =
                self.quizManager?.currentThemeId ||
                Math.floor((self.quizManager?.currentQuizId || 0) / 100);

            if (themeId) {
                self.quizManager.currentThemeId = Number(themeId);
                self.showQuizSelection();
                return;
            }
            self.showWelcomeScreen();
        });

        // Home is explicit
        this.addClickHandler("back-home-btn", function () {
            self.showWelcomeScreen();
        });

        // Review mistakes (secondary)
        this.addClickHandler("toggle-details-btn", function () {
            const detailsDiv = document.getElementById("detailed-stats");
            const btn = document.getElementById("toggle-details-btn");
            if (!detailsDiv) return;

            const wasHidden = detailsDiv.classList.contains("hidden");
            detailsDiv.classList.toggle("hidden");

            if (wasHidden && !detailsDiv.dataset.loaded) {
                try {
                    self.generateDetailedReview();
                    detailsDiv.dataset.loaded = "1";
                } catch (e) {
                    console.error("generateDetailedReview failed:", e);
                }
            }

            if (btn) {
                btn.textContent = detailsDiv.classList.contains("hidden")
                    ? "Review mistakes"
                    : "Hide review";
            }

            // Make secondary actions visible when review is open (if present)
            if (!detailsDiv.classList.contains("hidden")) {
                const sec = document.getElementById("secondary-actions");
                if (sec) sec.classList.remove("hidden");

                // Best-effort focus: move focus to first actionable element inside the panel
                setTimeout(function () {
                    try {
                        const focusable = detailsDiv.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
                        if (focusable) focusable.focus();
                    } catch (e) { }
                }, 0);
            }
        });

        /// Options are always visible now -> no toggle needed.


        try {
            // Primary CTA: unlock next theme (if present)
            this.addClickHandler("results-unlock-next-btn", function () {
                try { self._track("results_unlock_next_clicked", { source: "results" }); } catch (e) { }
                // Themes screen lives under Welcome (returning user)
                self.showWelcomeScreen();
            });

            // Next quiz
            this.addClickHandler("next-quiz-btn", function () {
                const nextQuiz =
                    self.features && typeof self.features.getNextQuizInTheme === "function"
                        ? self.features.getNextQuizInTheme()
                        : null;

                if (nextQuiz) {
                    try {
                        self.storageManager?.markQuizStarted?.({ themeId: nextQuiz.themeId, quizId: nextQuiz.quizId });
                    } catch (e) { }

                    self.quizManager.loadQuiz(nextQuiz.themeId, nextQuiz.quizId).catch(function (e) {
                        console.error("Failed to load next quiz:", e);
                        self.showError("Unable to load next quiz.");
                    });
                } else {
                    self.showQuizSelection();
                }
            });

            // Premium (secondary)
            self.addClickHandler("results-premium-nudge-btn", function (e) {
                if (e && typeof e.preventDefault === "function") e.preventDefault();

                try { self._track("premium_nudge_clicked", { source: "results" }); } catch (e) { }

                const stripeUrl = window.TYF_CONFIG?.stripePaymentUrl || "";
                if (stripeUrl) {
                    window.open(stripeUrl, "_blank", "noopener,noreferrer");
                    return;
                }
                if (self.features && typeof self.features.showPaywallModal === "function") {
                    self.features.showPaywallModal("results-success");
                }
            });

            // Safe premium flags (avoid isPremiumUser?.() assumptions)
            let isPremium = false;
            try {
                if (typeof self.storageManager.isPremiumUser === "function") {
                    isPremium = !!self.storageManager.isPremiumUser();
                } else if (self.storageManager.data && self.storageManager.data.isPremiumUser != null) {
                    isPremium = !!self.storageManager.data.isPremiumUser;
                }
            } catch (e) {
                isPremium = false;
            }

            let hasLockedThemes = false;
            try {
                hasLockedThemes = (typeof self._hasLockedThemes === "function") ? !!self._hasLockedThemes() : false;
            } catch (e) {
                hasLockedThemes = false;
            }

            // Next unlock slot (secondary) — prefer Storage helpers, fallback to nothing
            const slot = document.getElementById("next-unlock-slot");
            if (slot) {
                slot.innerHTML = "";

                let nextId = null;
                let needed = null;

                try {
                    if (typeof self.storageManager.getNextUnlockableTheme === "function") {
                        const nextThemeObj = self.storageManager.getNextUnlockableTheme();
                        if (nextThemeObj && nextThemeObj.id != null) nextId = Number(nextThemeObj.id);
                    }
                } catch (e) { }

                try {
                    if (typeof self.storageManager.getFpToNextTheme === "function") {
                        const missing = Number(self.storageManager.getFpToNextTheme());
                        if (Number.isFinite(missing)) needed = Math.max(0, missing);
                    }
                } catch (e) { }

                // If we have nextId but no needed, compute from cost/fp
                try {
                    if (nextId != null && needed == null &&
                        typeof self.storageManager.getFrenchPoints === "function" &&
                        typeof self.storageManager.getThemeCost === "function") {
                        const fp = Number(self.storageManager.getFrenchPoints()) || 0;
                        const cost = Number(self.storageManager.getThemeCost(nextId));
                        if (Number.isFinite(cost)) needed = Math.max(0, cost - fp);
                    }
                } catch (e) { }

                if (nextId != null && needed != null) {
                    if (needed <= 0) {
                        slot.innerHTML =
                            '<div class="tyf-stats-card tyf-nudge">' +
                            '<div class="tyf-nudge-inner">' +
                            '<div>' +
                            '<div class="tyf-nudge-title">Ready to unlock your next theme</div>' +
                            '<div class="tyf-nudge-sub">You have enough French Points. Go back and unlock it.</div>' +
                            '</div>' +
                            '<div class="shrink-0">' +
                            '<button id="results-back-unlock-btn" type="button" class="quiz-button">Back to themes</button>' +
                            '</div>' +
                            '</div>' +
                            '</div>';

                        self.addClickHandler("results-back-unlock-btn", function () {
                            self.showWelcomeScreen();
                        });
                    } else {
                        slot.innerHTML =
                            '<div class="tyf-stats-card">' +
                            '<div class="tyf-row">' +
                            '<div class="tyf-row-title">Next unlock</div>' +
                            '<div class="tyf-row-meta">' + needed + ' FP to go</div>' +
                            '</div>' +
                            '<div class="tyf-caption">Complete a few more quizzes to unlock your next theme.</div>' +
                            '</div>';
                    }
                }
            }

            // Keep premium nudge visibility purely driven by HTML + locked themes
            // (Premium stays secondary; no competing primary logic here)
            try {
                if (!isPremium && hasLockedThemes) {
                    const nudge = document.getElementById("premium-success-nudge");
                    if (nudge && !nudge.classList.contains("hidden")) {
                        self._track("premium_nudge_visible", { source: "results" });
                    }
                }
            } catch (e) { }

            ["retry-quiz-primary-btn", "retry-quiz-btn"].forEach(function (id) {
                self.addClickHandler(id, function () {
                    const currentThemeId = self.quizManager.currentThemeId;
                    const currentQuizId = self.quizManager.currentQuizId;

                    if (!currentThemeId || !currentQuizId) {
                        self.showQuizSelection();
                        return;
                    }

                    try {
                        self.storageManager?.markQuizStarted?.({ themeId: currentThemeId, quizId: currentQuizId });
                    } catch (e) { }

                    self.quizManager.loadQuiz(currentThemeId, currentQuizId).catch(function (e) {
                        console.error("Failed to reload quiz:", e);
                        self.showError("Unable to reload quiz.");
                    });
                });
            });

        } catch (e) {
            console.error("setupResultsEvents aborted (non-critical):", e);
        }
    };







    /* ----------------------------------------
       PROGRESS / NAVIGATION
       ---------------------------------------- */
    UICore.prototype.updateQuizProgress = function () {
        try {
            const progress = this.quizManager.getQuizProgress();

            const bar = document.getElementById("quiz-progress-bar");
            if (bar) {
                const pctNum = Number(progress && progress.percentage);
                const pct = Number.isFinite(pctNum) ? pctNum : 0;

                bar.setAttribute("aria-valuenow", String(Math.round(pct)));

                // KISS: Tailwind purge-safe (pas de classes dynamiques)
                bar.style.width = Math.max(0, Math.min(100, pct)) + "%";

            }

            // ID stable: on update seulement la valeur
            const value = document.getElementById("quiz-progress-value");
            if (value) value.textContent = progress.current + "/" + progress.total;

            if (typeof this.updateNavigationButtons === "function") {
                this.updateNavigationButtons();
            }
        } catch (err) {
            console.error("Error updating quiz progress:", err);
        }
    };


    /* ----------------------------------------
    PROGRESS / NAVIGATION
    ---------------------------------------- */
    UICore.prototype.updateNavigationButtons = function () {
        var prevBtn = document.getElementById("prev-question-btn");
        var nextBtn = document.getElementById("next-question-btn");
        var qm = this.quizManager;

        // Previous
        if (prevBtn) {
            var prevDisabled =
                qm && typeof qm.isFirstQuestion === "function"
                    ? !!qm.isFirstQuestion()
                    : false;

            prevBtn.disabled = prevDisabled;
            prevBtn.setAttribute("aria-disabled", prevDisabled ? "true" : "false");
        }

        // Next
        if (nextBtn) {
            var idx = (this.getCurrentIndexSafe ? this.getCurrentIndexSafe() : 0);
            var status = (this.getStatusAt ? this.getStatusAt(idx) : null);

            // NEW SHAPE: { validated, selectedIndex, isCorrect }
            var isValidated = !!(status && status.validated === true);

            // Invalid state: no quiz / no question / options missing
            var currentQuestion =
                (qm && typeof qm.getCurrentQuestion === "function" && qm.getCurrentQuestion()) || null;

            var optionsOk =
                !!(currentQuestion && Array.isArray(currentQuestion.options) && currentQuestion.options.length > 0);

            var isInvalid = !qm || !optionsOk;

            // Last question?
            var total = 0;
            try {
                total =
                    qm && qm.currentQuiz && Array.isArray(qm.currentQuiz.questions)
                        ? qm.currentQuiz.questions.length
                        : 0;
            } catch (e) {
                total = 0;
            }

            var isLast = total ? (idx >= total - 1) : false;

            var nextDisabled = !isValidated || isInvalid;
            nextBtn.disabled = nextDisabled;
            nextBtn.setAttribute("aria-disabled", nextDisabled ? "true" : "false");
            nextBtn.textContent = isLast ? "Finish quiz" : "Next";

            // Micro-hint a11y/UX : zone dédiée (ne doit pas écraser le feedback correct/incorrect)
            var nh = document.getElementById("nav-hint");
            if (nh) {
                if (!isValidated && !isInvalid) {
                    nh.dataset.hint = "1";
                    nh.classList.remove("hidden");
                    nh.textContent = "Select an answer to continue.";
                } else if (nh.dataset.hint === "1") {
                    nh.dataset.hint = "0";
                    nh.classList.add("hidden");
                    nh.textContent = "";
                }
            }
        }
    };

    /* ----------------------------------------
       DETAILED REVIEW
       ---------------------------------------- */
    UICore.prototype.generateDetailedReview = function () {
        try {
            var reviewContainer = document.getElementById("questions-review");
            if (!reviewContainer || !this.quizManager || !this.quizManager.currentQuiz) {
                if (reviewContainer) {
                    reviewContainer.innerHTML =
                        '<h4 class="font-bold text-gray-800 mb-3">Question review</h4>' +
                        '<div class="text-sm text-gray-600">Detailed review unavailable for this quiz.</div>';
                }
                return;
            }

            var self = this;

            var questions = Array.isArray(this.quizManager.currentQuiz.questions)
                ? this.quizManager.currentQuiz.questions
                : [];

            var userAnswers = Array.isArray(this.quizManager.userAnswers) ? this.quizManager.userAnswers : [];
            var questionStatus = Array.isArray(this.quizManager.questionStatus) ? this.quizManager.questionStatus : [];

            var reviewHTML = questions
                .map(function (question, index) {
                    var userAnswerIndex = userAnswers[index];
                    var st = questionStatus[index] || null;

                    // NEW SHAPE: { validated, selectedIndex, isCorrect }
                    var validated = !!(st && st.validated === true);
                    var isCorrect = validated && (st.isCorrect === true);
                    var isIncorrect = validated && (st.isCorrect === false);

                    // Supporte "correctIndex" (ton format) + fallback "answerIndex"
                    var correctIndex =
                        (typeof question.correctIndex === "number")
                            ? question.correctIndex
                            : ((typeof question.answerIndex === "number") ? question.answerIndex : null);

                    var qTextRaw = (question.question || question.text || "");
                    var qText = self.escapeHTML(qTextRaw);

                    var userAnswerRaw =
                        (question.options && typeof userAnswerIndex === "number")
                            ? question.options[userAnswerIndex]
                            : null;

                    var correctAnswerRaw =
                        (question.options && typeof correctIndex === "number")
                            ? question.options[correctIndex]
                            : null;

                    var userAnswerClean = userAnswerRaw ? self._stripChoiceLabel(userAnswerRaw) : (validated ? "Not answered" : "Not validated");
                    var correctAnswerClean = correctAnswerRaw ? self._stripChoiceLabel(correctAnswerRaw) : "";

                    var userAnswerHTML = self.escapeHTML(userAnswerClean);
                    var correctAnswerHTML = self.escapeHTML(correctAnswerClean);

                    var explanationHTML = question.explanation
                        ? self.escapeHTML(String(question.explanation))
                        : "";

                    // État (inclut validated=false)
                    var stateLabel = isCorrect ? "Correct" : (isIncorrect ? "Incorrect" : "Not validated");
                    var stateClass = isCorrect ? "text-green-600" : (isIncorrect ? "text-red-600" : "text-gray-600");
                    var cardClass = isCorrect
                        ? "border-green-200 bg-green-50"
                        : (isIncorrect ? "border-red-200 bg-red-50" : "border-gray-200 bg-white");

                    return (
                        '\n<div class="review-question mb-4 p-4 border rounded-lg ' + cardClass + '">' +
                        '\n  <div class="flex items-start justify-between mb-3">' +
                        '\n    <h4 class="font-medium text-gray-800">Question ' + (index + 1) + '</h4>' +
                        '\n    <span class="text-sm font-bold ' + stateClass + '">' + stateLabel + '</span>' +
                        '\n  </div>' +
                        '\n  <p class="text-gray-700 mb-3">' + qText + '</p>' +
                        '\n  <div class="space-y-2">' +
                        '\n    <div class="text-sm">' +
                        '\n      <span class="text-gray-600">Your answer:</span>' +
                        '\n      <span class="ml-2 ' + (isCorrect ? "text-green-600" : (isIncorrect ? "text-red-600" : "text-gray-700")) + ' font-medium">' +
                        userAnswerHTML +
                        '</span>' +
                        '\n    </div>' +
                        (isIncorrect && correctAnswerClean
                            ? '\n    <div class="text-sm">' +
                            '\n      <span class="text-gray-600">Correct answer:</span>' +
                            '\n      <span class="ml-2 text-green-600 font-medium">' +
                            correctAnswerHTML +
                            '</span>' +
                            '\n    </div>'
                            : "") +
                        (explanationHTML
                            ? '\n    <div class="text-sm text-gray-600 mt-2 p-2 bg-blue-50 rounded">' +
                            '<strong>Explanation:</strong> ' + explanationHTML +
                            '</div>'
                            : "") +
                        '\n  </div>' +
                        '\n</div>'
                    );
                })
                .join("");

            var headerHTML = '<h4 class="font-bold text-gray-800 mb-3">Question review</h4>';
            reviewContainer.innerHTML = headerHTML + (reviewHTML || "");

        } catch (error) {
            console.error("Error generating detailed review:", error);
        }
    };




    /* ----------------------------------------
       TEXT HELPERS (PROGRESS / CEFR STYLE)
       ---------------------------------------- */

    UICore.prototype.getCurrentThemeName = function () {
        const id = Number(this.quizManager?.currentThemeId);
        if (!Number.isFinite(id)) return null;

        const theme =
            (this.resourceManager &&
                typeof this.resourceManager.getThemeById === "function" &&
                this.resourceManager.getThemeById(id)) ||
            (this.themeIndexCache || []).find(t => Number(t.id) === id);

        return theme ? this.normalizeText(theme.name) : null;
    };

    UICore.prototype.getBackToThemeLabel = function () {
        const name = this.getCurrentThemeName();
        return name ? "Back to " + name : "Back";
    };

    UICore.prototype.getProgressText = function (uiState) {
        const n = Math.max(0, Number(uiState && uiState.completedQuizzes) || 0);

        if (n < 1) {
            return "Start with a first quiz to see where you stand.";
        } else if (n < 5) {
            return (
                "You have completed " +
                n +
                " assessment" +
                (n > 1 ? "s." : ".") +
                " Keep testing your French level."
            );
        } else if (n < 20) {
            return "Great progress so far - " + n + " assessments completed.";
        }
        return "Impressive history - " + n + " assessments completed.";
    };


    UICore.prototype.generateNextActionButton = function (resultsData) {
        if (resultsData.percentage >= 70) {
            return (
                '\n<button id="next-quiz-btn" type="button" class="quiz-button">' +
                "Next quiz" +
                "</button>"
            );
        }

        return (
            '\n<button id="retry-quiz-primary-btn" type="button" class="quiz-button">' +
            "Retry quiz" +
            "</button>"
        );
    };




    // Single source of truth (CEFR naming)
    UICore.prototype.getCEFRLevel = function (percentage) {
        if (percentage >= 80) return "Confident (real-life French)";
        if (percentage >= 60) return "Solid (daily situations)";
        if (percentage >= 50) return "Building (needs one replay)";
        return "Baseline (good place to start)";
    };

    UICore.prototype.getCEFRMessage = function (percentage) {
        if (percentage >= 80) return "You can handle real-life French with speed and nuance.";
        if (percentage >= 60) return "You manage most everyday situations. One replay improves stability.";
        if (percentage >= 50) return "You are building the right patterns. Replay once and lock in one key word.";
        return "Real-speed French is tough at first. Replay once and focus on one anchor word.";
    };


    UICore.prototype.getCEFRColorClass = function (percentage) {
        if (percentage >= 80) return "bg-green-50 border-green-200 text-green-800";
        if (percentage >= 60) return "bg-blue-50 border-blue-200 text-blue-800";
        if (percentage >= 50) return "bg-orange-50 border-orange-200 text-orange-800";
        return "bg-gray-50 border-gray-200 text-gray-800";
    };

    // Backward compatibility (CECR typo in callers) - keep forever
    UICore.prototype.getCECRLevel = function (percentage) {
        return this.getCEFRLevel(percentage);
    };
    UICore.prototype.getCECRMessage = function (percentage) {
        return this.getCEFRMessage(percentage);
    };
    UICore.prototype.getCECRColorClass = function (percentage) {
        return this.getCEFRColorClass(percentage);
    };


    /* ----------------------------------------
       UTILITIES
       ---------------------------------------- */
    UICore.prototype.generateErrorHTML = function (message) {
        return (
            '\n<div class="min-h-screen flex items-center justify-center bg-gray-50">' +
            '\n  <div class="max-w-md text-center p-6 bg-white rounded-lg shadow">' +
            '\n    <h1 class="text-xl font-bold mb-4 text-gray-900">Oops</h1>' +
            '\n    <p class="text-gray-700 mb-4">' +
            this.escapeHTML(message || "An error occurred.") +
            "</p>" +
            '\n    <button id="back-to-home-btn" class="quiz-button">Home</button>' +
            "\n  </div>" +
            "\n</div>"
        );
    };


    UICore.prototype.addClickHandler = function (elementId, handler) {
        const el = document.getElementById(elementId);
        if (!el) return;

        // Anti-doublon simple (KISS)
        if (el.dataset.clickBound === "1") return;
        el.dataset.clickBound = "1";

        el.addEventListener("click", function (e) {
            if (e && typeof e.preventDefault === "function") e.preventDefault();
            if (el.disabled) return;
            handler(e);
        });
    };





    // MODIFIÉ: bindEvent utilise addClickHandler (binding unique)
    UICore.prototype.bindEvent = function (elementId, action) {
        const self = this;
        this.addClickHandler(elementId, function () {
            switch (action) {
                case "showWelcomeScreen":
                    self.showWelcomeScreen();
                    break;
                case "showStatsScreen":
                    self.showStatsScreen();
                    break;
                case "showQuizSelection":
                    self.showQuizSelection();
                    break;
                default:
                    console.warn("Unknown action:", action);
            }
        });
    };

    if (global.TYF_CONFIG && global.TYF_CONFIG.debug && global.TYF_CONFIG.debug.enabled) {
        console.log("UICore v3.0 loaded");
    }


    global.UICore = UICore;
})(window);