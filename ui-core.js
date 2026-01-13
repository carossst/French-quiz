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

        var insight = this.getResultsInsight ? this.getResultsInsight(resultsData) : "This quiz gave you a clear snapshot.";
        var action = this.getResultsAction ? this.getResultsAction(resultsData) : "Replay now and focus on the pattern.";

        // Visibilité safe par défaut: si non-premium et themes lockés, on l'affiche.
        // Ensuite setupResultsEvents() peut affiner (ou remplacer par next-unlock).
        var premiumNudgeHiddenClass =
            (!this.storageManager.isPremiumUser?.() && this._hasLockedThemes?.())
                ? ""
                : " hidden";


        // Phrase signature: stable, mémorisable
        var signatureTitle = "This is a real French diagnostic.";


        // Support line: 1 seule idée, dépend du score
        var signatureSub =
            (pct >= 80) ? "It confirms you can handle real French situations."
                : (pct >= 60) ? "It shows a solid base. One replay will stabilize it."
                    : (pct >= 40) ? "It reveals the pattern you need to lock in."
                        : "It highlights exactly what blocks you. One replay will make it click.";

        // Level box (kept, but avoid repeating the same low-score message)
        var levelLabel = this.getCECRLevel ? this.getCECRLevel(pct) : "Your level";
        var levelClass = this.getCECRColorClass ? this.getCECRColorClass(pct) : "bg-gray-50 border-gray-200 text-gray-800";

        var levelMsg = this.getCECRMessage ? this.getCECRMessage(pct) : "Keep practicing to progress.";
        if (pct < 50) {
            levelMsg = "This is a normal starting point with authentic French speed and nuance.";
        }


        // Waitlist / Early access (mailto). If not configured, do not render.
        var waitlistEmail = this._getWaitlistEmail ? this._getWaitlistEmail() : "";
        var waitlistHref = this._buildWaitlistMailto
            ? this._buildWaitlistMailto(resultsData, pct, scoreLine, levelLabel, titleTheme)
            : "";

        var waitlistHTML = "";
        if (waitlistEmail && waitlistHref) {
            waitlistHTML =
                '\n    <div class="tyf-stats-card mb-4" aria-label="Early access">' +
                '\n      <div class="flex items-center justify-between gap-3">' +
                '\n        <div class="text-sm text-gray-700">' +
                '\n          <strong class="text-gray-900">Want a more precise A1/A2 diagnostic?</strong> Get early access.' +
                '\n        </div>' +
                '\n        <div class="shrink-0">' +
                '\n          <a id="results-waitlist-link" class="text-sm underline font-semibold text-blue-700 hover:text-blue-900" href="' + this.escapeHTML(waitlistHref) + '">' +
                '\n            Request' +
                '\n          </a>' +
                '\n        </div>' +
                '\n      </div>' +
                '\n    </div>';
        }



        return (
            '\n<div class="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50" role="main" aria-label="Results screen">' +
            '\n  <div class="max-w-3xl mx-auto px-4 pt-6 pb-10">' +

            '\n    <div class="flex items-center justify-between gap-2 mb-4">' +
            '\n      <button id="back-to-theme-btn" type="button">' + this.getBackToThemeLabel() + '</button>' +
            '\n    </div>' +

            '\n    <div class="text-center mb-5">' +
            '\n      <h1 class="text-2xl md:text-3xl font-bold text-gray-900">Results</h1>' +
            '\n      <p class="text-sm text-gray-700 mt-1">Theme: <strong>' + this.escapeHTML(titleTheme) + '</strong></p>' +
            '\n    </div>' +

            // 1) Signature (remplace Honest diagnostic)
            '\n    <div class="tyf-stats-card tyf-nudge mb-4" aria-label="Summary">' +
            '\n      <div class="tyf-nudge-inner">' +
            '\n        <div>' +
            '\n          <div class="tyf-nudge-title">' + this.escapeHTML(signatureTitle) + '</div>' +
            '\n          <div class="tyf-nudge-sub">' + this.escapeHTML(signatureSub) + '</div>' +
            '\n        </div>' +
            '\n      </div>' +
            '\n    </div>' +

            // 2) Score + accuracy
            '\n    <div class="theme-card mb-4">' +
            '\n      <div class="flex items-center justify-between gap-3">' +
            '\n        <div>' +
            '\n          <div class="text-sm text-gray-600">Result</div>' +
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
                pct >= 70 ? 'Clear signal' :
                    pct >= 40 ? 'Useful signal' :
                        'Early signal'
            )) +
            '</span>' +
            '\n        </div>' +
            '\n      </div>' +
            '\n    </div>' +


            // 3) Level
            '\n    <div class="p-4 border rounded-lg mb-4 ' + levelClass + '">' +
            '\n      <div class="font-bold text-base">' + this.escapeHTML(levelLabel) + '</div>' +
            '\n      <div class="text-sm mt-1">' + this.escapeHTML(levelMsg) + '</div>' +
            '\n    </div>' +

            // NEW: waitlist / early access
            waitlistHTML +

            // 4) Insight
            '\n    <div class="tyf-stats-card tyf-nudge mb-3" aria-label="Your key insight">' +
            '\n      <div class="tyf-nudge-inner">' +
            '\n        <div>' +
            '\n          <div class="tyf-nudge-title">Your key insight</div>' +
            '\n          <div class="tyf-nudge-sub">' + this.escapeHTML(insight) + '</div>' +
            '\n        </div>' +
            '\n      </div>' +
            '\n    </div>' +

            // 5) Action immédiate
            '\n    <div class="tyf-stats-card tyf-nudge mb-4" aria-label="Next step">' +
            '\n      <div class="tyf-nudge-inner">' +
            '\n        <div>' +
            '\n          <div class="tyf-nudge-title">Do this now</div>' +
            '\n          <div class="tyf-nudge-sub">' + this.escapeHTML(action) + '</div>' +
            '\n        </div>' +
            '\n      </div>' +
            '\n    </div>' +

            // 6) CTA principal
            '\n    <div class="flex justify-center mb-2">' +
            this.generateNextActionButton(resultsData) +
            '\n    </div>' +
            '\n    <div class="text-xs text-gray-600 text-center mb-4">' +
            (this.escapeHTML(pct >= 70 ? "Keep momentum: 2 minutes." : "One replay makes the pattern stick.")) +
            '\n    </div>' +



            // 7) Tomorrow mantra
            '\n    <div class="tyf-stats-card tyf-nudge mb-5" aria-label="Come back tomorrow">' +
            '\n      <div class="tyf-nudge-inner">' +
            '\n        <div>' +
            '\n          <div class="tyf-nudge-title">Tomorrow</div>' +
            '\n          <div class="tyf-nudge-sub">One quiz a day. A clearer diagnostic.</div>' +
            '\n        </div>' +
            '\n      </div>' +
            '\n    </div>' +

            // 8) Secondary: next unlock / premium
            '\n    <div id="next-unlock-slot" class="mb-4"></div>' +

            '\n    <div id="premium-success-nudge" class="tyf-stats-card tyf-nudge mb-4' + premiumNudgeHiddenClass + '" aria-label="Premium success nudge">' +
            '\n      <div class="tyf-nudge-inner">' +
            '\n        <div>' +
            '\n          <div class="tyf-nudge-title">Unlock everything</div>' +
            '\n          <div class="tyf-nudge-sub">Premium unlocks all themes instantly. One payment. No subscription.</div>' +
            '\n        </div>' +
            '\n        <div class="shrink-0">' +
            '\n          <button id="results-premium-nudge-btn" type="button" class="text-sm underline font-semibold text-purple-700 hover:text-purple-900">' +
            '\n            Unlock all themes - ' + this._getPremiumPriceHTML() + ' one-time' +
            '\n          </button>' +
            '\n        </div>' +
            '\n      </div>' +
            '\n    </div>' +

            '\n    <div class="mt-3">' +
            '\n      <button id="toggle-details-btn" type="button" class="text-sm underline font-semibold text-slate-700 hover:text-slate-900">Review mistakes</button>' +
            '\n    </div>' +

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
            '\n    <div class="tyf-audio-panel">' +
            '\n      <audio class="question-audio hidden" preload="metadata">' +
            '\n        <source src="' + audioPathSafe + '" type="audio/mpeg">' +
            "Your browser does not support audio." +
            "\n      </audio>" +
            '\n      <button type="button" class="audio-play-btn quiz-button" aria-label="Play audio">Listen</button>' +
            '\n      <span class="tyf-audio-meta">Audio</span>' +
            "\n    </div>" +
            "\n  </div>" +
            "\n</div>"
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

        const audio = container.querySelector(".question-audio");
        const btn = container.querySelector(".audio-play-btn");
        if (!audio || !btn) return;

        const playNow = function () {
            audio.currentTime = 0;
            audio.play().then(function () {
                btn.textContent = "Replay";
                btn.disabled = false;
            }).catch(function (error) {
                console.error("Audio playback failed:", error);
                if (error && error.name === "NotAllowedError") {
                    btn.textContent = "Click to allow audio";
                    btn.disabled = false;
                } else if (error && error.name === "NotSupportedError") {
                    btn.textContent = "Format not supported";
                    btn.disabled = true;
                } else if (audio.error && audio.error.code === 4) {
                    btn.textContent = "Audio file not found";
                    btn.disabled = true;
                } else {
                    btn.textContent = "Audio error - try again";
                    btn.disabled = false;
                }
            });
        };

        btn.addEventListener("click", function () {
            btn.disabled = true;
            btn.textContent = "Loading...";

            if (audio.readyState >= 1) {
                playNow();
            } else {
                const timeoutId = setTimeout(function () {
                    console.error("Audio loading timeout");
                    btn.textContent = "Loading timeout";
                    btn.disabled = false;
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
                    btn.textContent = "Cannot load audio";
                    btn.disabled = true;
                }
            }
        });

        audio.addEventListener("error", function () {
            if (audio.error) {
                switch (audio.error.code) {
                    case 1: btn.textContent = "Audio loading cancelled"; break;
                    case 2: btn.textContent = "Network error"; break;
                    case 3: btn.textContent = "Audio format error"; break;
                    case 4: btn.textContent = "Audio file not found"; break;
                    default: btn.textContent = "Audio unavailable";
                }
            } else {
                btn.textContent = "Audio unavailable";
            }
            btn.disabled = true;
        });

        audio.addEventListener("ended", function () {
            btn.textContent = "Replay";
            btn.disabled = false;
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

            // Source de vérité: QuizManager gère la sélection + l’auto-validation + le score.
            // IMPORTANT: ne PAS reset questionStatus ici, ne PAS re-valider ici.
            this.quizManager.selectAnswer(index);

            // Next lock/unlock
            this.updateNavigationButtons();

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
        let cleaned = false;

        var getFocusable = function () {
            return modal.querySelectorAll(
                'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
            );
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

        var handleTabTrap = function (e) {
            if (e.key !== "Tab") return;

            // si le focus est sorti de la modal, on le ramène dedans
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
                modal.remove();
            }
        };

        modal.addEventListener("tyf:close", cleanup, { once: true });

        document.addEventListener("keydown", handleEscape);
        document.addEventListener("keydown", handleTabTrap);

        if (closeBtn) {
            closeBtn.addEventListener("click", function (e) {
                if (e) e.preventDefault();
                cleanup();
                modal.remove();
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
                modal.remove();
            }
        });
    };


    UICore.prototype.generateUnlockRoadmapHTML = function () {
        const currentFP = this.storageManager.getFrenchPoints?.() || 0;
        const isPremium = this.storageManager.isPremiumUser?.() || false;

        const stripeUrl = window.TYF_CONFIG?.stripePaymentUrl || "";
        const stripeUrlSafe = this.escapeHTML(String(stripeUrl || ""));

        const themeData = this.themeIndexCache || [];
        const self = this;

        // Helper local pour calculer cumulative (robuste si ids sont des strings)
        const getCumulativeForTheme = function (targetThemeId) {
            const targetId = Number(targetThemeId);
            let total = 0;

            for (let i = 0; i < themeData.length; i++) {
                const t = themeData[i];
                const id = Number(t && t.id);
                if (!Number.isFinite(id)) continue;

                if (id <= targetId && id !== 1) {
                    const themeCost = typeof self.storageManager.getThemeCost === "function"
                        ? self.storageManager.getThemeCost(id)
                        : 0;
                    total += (typeof themeCost === "number" ? themeCost : 0);
                }
            }
            return total;
        };

        const lastThemeId = (function () {
            let maxId = 10;
            for (let i = 0; i < themeData.length; i++) {
                const id = Number(themeData[i] && themeData[i].id);
                if (Number.isFinite(id)) maxId = Math.max(maxId, id);
            }
            return maxId;
        })();

        const totalNeeded = getCumulativeForTheme(lastThemeId);
        const remaining = Math.max(0, totalNeeded - currentFP);

        const FP_PER_DAY_ESTIMATE = (window.TYF_CONFIG && Number(window.TYF_CONFIG.fpPerDayEstimate)) || 8;
        const daysNeeded = remaining > 0
            ? Math.max(1, Math.ceil(remaining / Math.max(1, FP_PER_DAY_ESTIMATE)))
            : 0;

        let rows = '';

        themeData.forEach(function (theme) {
            const id = Number(theme && theme.id);
            if (!Number.isFinite(id)) return;

            const isFree = id === 1;
            const isUnlocked = self.storageManager.isThemeUnlocked?.(id) || isFree;
            const unlockStatus = isFree ? null : (self.storageManager.canUnlockTheme?.(id) || {});
            const cost = isFree ? 0 : (typeof self.storageManager.getThemeCost === "function"
                ? self.storageManager.getThemeCost(id)
                : null);
            const cumulative = isFree ? 0 : getCumulativeForTheme(id);

            let statusHTML = '';
            let bgColor = '';

            if (isFree) {
                statusHTML = '<div class="text-xs text-green-600">✓ Always free</div>';
                bgColor = "bg-green-50 border-green-300";
            } else if (isPremium || isUnlocked) {
                statusHTML = '<div class="text-xs text-blue-600">✓ Unlocked</div>';
                bgColor = "bg-blue-50 border-blue-300";
            } else if (unlockStatus?.reason === 'PREVIOUS_LOCKED') {
                statusHTML = '<div class="text-xs text-gray-500">🔒 Previous theme required</div>';
                bgColor = "bg-gray-50 border-gray-300";
            } else if (unlockStatus?.canUnlock) {
                statusHTML = '<div class="text-xs text-yellow-700">⬜ Ready to unlock with French Points</div>';
                bgColor = "bg-yellow-50 border-yellow-300";
            } else {
                statusHTML = '<div class="text-xs text-gray-500">🔒 Locked</div>';
                bgColor = "bg-gray-100 border-gray-300";
            }

            const safeIcon = self.escapeHTML(theme.icon || "");
            const safeName = self.escapeHTML(self.normalizeText(theme.name));

            rows +=
                '<div class="flex items-center justify-between p-3 mb-2 border rounded-lg ' + bgColor + '">' +
                '<div class="flex items-center gap-3">' +
                '<div class="text-2xl">' + safeIcon + '</div>' +
                '<div>' +
                '<div class="font-semibold text-gray-900">' +
                safeName +
                '</div>' +
                statusHTML +
                '</div>' +
                '</div>' +
                '<div class="text-right">';

            if (isFree) {
                rows += '<div class="text-sm font-bold text-green-600">FREE</div>';
            } else if (isPremium || isUnlocked) {
                rows += '<div class="text-sm font-bold text-blue-600">Unlocked</div>';
            } else {
                rows += (cost === null)
                    ? '<div class="text-sm font-bold text-gray-900">—</div>'
                    : '<div class="text-sm font-bold text-gray-900">' + cost + ' FP</div>';
                rows += '<div class="text-xs text-gray-500 hidden sm:block">Total: ' + cumulative + ' FP</div>';
            }

            rows += '</div></div>';
        });

        return (
            '<div id="roadmap-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="roadmap-title">' +
            '<div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen flex flex-col">' +

            '<div class="sticky top-0 bg-white border-b border-gray-200 p-6 pb-4">' +
            '<div class="flex items-center justify-between mb-2">' +
            '<h2 id="roadmap-title" class="text-2xl font-bold text-gray-900">🗺️ How unlocking works</h2>' +
            '<button id="close-roadmap-btn" type="button" aria-label="Close roadmap" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>' +
            '</div>' +
            '<div class="text-sm text-gray-600 mt-1 mb-3">' +
            'Unlocking keeps the quizzes meaningful and progressive. Premium gives the full diagnostic instantly.' +
            '</div>' +
            '<div class="text-sm text-gray-600 mb-3">You have <strong>' + currentFP + ' FP</strong>' +
            (isPremium ? ' • <span class="text-purple-600 font-semibold">Premium ✨</span>' : '') +
            '</div>' +
            (isPremium || !stripeUrlSafe ? '' :
                '<a href="' + stripeUrlSafe + '" target="_blank" rel="noopener noreferrer" class="quiz-button block w-full text-center mb-3">' +
                'Unlock all themes instantly - ' + this._getPremiumPriceHTML() +
                '</a>'
            ) +
            '</div>' +

            '<div class="flex-1 overflow-y-auto p-6 pt-4">' +
            rows +
            '</div>' +

            '<div class="sticky bottom-0 bg-white border-t border-gray-200 p-6 pt-4">' +
            '<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-sm text-blue-800">' +
            (isPremium ?
                '<strong>🎉 Premium Active:</strong> All themes unlocked!' :
                (remaining === 0 ?
                    '<strong>✅ You have enough French Points to unlock more themes!</strong>' :
                    '<div class="space-y-1">' +
                    '<div><strong>Free path:</strong> Unlock all themes in ~' + daysNeeded + ' days with regular play</div>' +
                    '<div><strong>Premium path:</strong> One-time $12 -> all themes unlocked instantly ⚡</div>' +
                    '</div>'
                )
            ) +
            '</div>' +
            (isPremium || !stripeUrlSafe ? '' :
                '<a href="' + stripeUrlSafe + '" target="_blank" rel="noopener noreferrer" ' +
                'class="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-center transition-colors">' +
                '🚀 Get Premium - ' + this._getPremiumPriceHTML() + '</a>'
            ) +
            (isPremium ? '' :
                '<div class="text-xs text-gray-500 text-center mt-4">' +
                'No subscription • No pressure • Learn at your pace' +
                '</div>'
            ) +
            '</div>' +

            '</div>' +
            '</div>'
        );
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

        return quizzes
            .map(function (quiz, idx) {
                const quizId = Number(quiz && quiz.id);
                if (!Number.isFinite(quizId)) return "";

                const quizNameSafe = self.escapeHTML(self.normalizeText(quiz.name || "Quiz"));
                const quizDescSafe = self.escapeHTML(self.normalizeText(quiz.description || ""));

                const isUnlocked =
                    typeof self.storageManager.isQuizUnlocked === "function"
                        ? self.storageManager.isQuizUnlocked(quizId)
                        : true;

                const isCompleted =
                    typeof self.storageManager.isQuizCompleted === "function"
                        ? self.storageManager.isQuizCompleted(quizId)
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

                const unlocked =
                    (typeof self.storageManager.isQuizUnlocked !== "function") ||
                    self.storageManager.isQuizUnlocked(quizId);

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

        // 1) NAV CRITIQUE D’ABORD (doit toujours marcher)
        this.addClickHandler("back-to-theme-btn", function () {
            self.showWelcomeScreen();
        });


        this.addClickHandler("toggle-details-btn", function () {
            const detailsDiv = document.getElementById("detailed-stats");
            const btn = document.getElementById("toggle-details-btn");
            if (detailsDiv) {
                const isHidden = detailsDiv.classList.contains("hidden");
                detailsDiv.classList.toggle("hidden");
                if (isHidden && !detailsDiv.dataset.loaded) {
                    self.generateDetailedReview();
                    detailsDiv.dataset.loaded = "1";
                }

                if (btn) {
                    btn.textContent = detailsDiv.classList.contains("hidden")
                        ? "Review mistakes"
                        : "Hide review";
                }

                if (!detailsDiv.classList.contains("hidden")) {
                    const hasNext = !!document.getElementById("next-quiz-btn");
                    const sec = document.getElementById("secondary-actions");
                    if (sec && hasNext) sec.classList.remove("hidden");
                }
            }
        });

        // 2) LE RESTE: PROTÉGÉ POUR NE PAS CASSER LES BOUTONS
        try {
            this.addClickHandler("next-quiz-btn", function () {
                const nextQuiz =
                    self.features && self.features.getNextQuizInTheme
                        ? self.features.getNextQuizInTheme()
                        : null;

                if (nextQuiz) {
                    self.storageManager?.markQuizStarted?.({ themeId: nextQuiz.themeId, quizId: nextQuiz.quizId });

                    self.quizManager.loadQuiz(nextQuiz.themeId, nextQuiz.quizId).catch(function (e) {
                        console.error("Failed to load next quiz:", e);
                        self.showError("Unable to load next quiz.");
                    });
                } else {
                    self.showQuizSelection();
                }
            });

            // 🔒 PREMIUM BUTTON: binder une fois, indépendamment de la logique d'affichage
            self.addClickHandler("results-premium-nudge-btn", function (e) {
                if (e && typeof e.preventDefault === "function") e.preventDefault();

                self._track("premium_nudge_clicked", { source: "results" });

                const stripeUrl = window.TYF_CONFIG?.stripePaymentUrl || "";
                if (stripeUrl) {
                    window.open(stripeUrl, "_blank", "noopener,noreferrer");
                    return;
                }
                if (self.features?.showPaywallModal) {
                    self.features.showPaywallModal("results-success");
                }
            });

            // 🔒 PREMIUM NUDGE OU PROGRESSION (EXCLUSIF)
            const canComputeNextUnlock =
                (typeof self.storageManager.canUnlockTheme === "function") &&
                (typeof self.storageManager.getFrenchPoints === "function") &&
                (typeof self.storageManager.getThemeCost === "function");

            const showPremiumOnly =
                !self.storageManager.isPremiumUser?.() &&
                self._hasLockedThemes?.() &&
                !canComputeNextUnlock;

            if (showPremiumOnly) {
                const nudge = document.getElementById("premium-success-nudge");
                if (nudge) {
                    nudge.classList.remove("hidden");
                    self._track("premium_nudge_visible", { source: "results" });
                }

            } else {
                // EXCLUSIF: si on entre dans la voie "next unlock", on cache le nudge premium
                const nudge = document.getElementById("premium-success-nudge");
                if (nudge) nudge.classList.add("hidden");

                const slot = document.getElementById("next-unlock-slot");
                if (slot) {
                    slot.innerHTML = "";

                    const canCompute =
                        (typeof self.storageManager.canUnlockTheme === "function") &&
                        (typeof self.storageManager.getFrenchPoints === "function") &&
                        (typeof self.storageManager.getThemeCost === "function");

                    if (canCompute) {
                        const themes = (self.themeIndexCache || [])
                            .filter(t => t && t.id != null)
                            .map(t => ({ ...t, id: Number(t.id) }))
                            .filter(t => Number.isFinite(t.id))
                            .sort((a, b) => a.id - b.id);

                        let nextId = null;
                        for (let i = 0; i < themes.length; i++) {
                            const t = themes[i];
                            if (t.id === 1) continue;

                            const unlocked = !!self.storageManager.isThemeUnlocked?.(t.id);
                            const prev = themes[i - 1];
                            const prevUnlocked = !prev
                                ? true
                                : (prev.id === 1 ? true : !!self.storageManager.isThemeUnlocked?.(prev.id));

                            if (!unlocked && prevUnlocked) {
                                nextId = t.id;
                                break;
                            }
                        }

                        if (nextId) {
                            const fp = Number(self.storageManager.getFrenchPoints()) || 0;
                            const cost = Number(self.storageManager.getThemeCost(nextId));

                            if (Number.isFinite(cost)) {
                                const needed = Math.max(0, cost - fp);

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
                                        '<div class="tyf-caption">Complete a few more quizzes, or unlock everything with Premium.</div>' +
                                        '</div>';
                                }
                            }
                        }
                    }
                }
            }

            ["retry-quiz-primary-btn", "retry-quiz-btn"].forEach(function (id) {
                self.addClickHandler(id, function () {
                    const currentThemeId = self.quizManager.currentThemeId;
                    const currentQuizId = self.quizManager.currentQuizId;

                    if (!currentThemeId || !currentQuizId) {
                        self.showQuizSelection();
                        return;
                    }

                    self.storageManager?.markQuizStarted?.({ themeId: currentThemeId, quizId: currentQuizId });

                    self.quizManager.loadQuiz(currentThemeId, currentQuizId).catch(function (e) {
                        console.error("Failed to reload quiz:", e);
                        self.showError("Unable to reload quiz.");
                    });
                });
            });

        } catch (e) {
            console.error("setupResultsEvents aborted (non-critical):", e);
            // Important: on ne casse pas la nav
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
        if (percentage >= 80) return "Strong range (confident in France)";
        if (percentage >= 60) return "Solid range (you will manage well)";
        if (percentage >= 50) return "Growing range (on your way)";
        return "Discovery range (good starting point)";
    };

    UICore.prototype.getCEFRMessage = function (percentage) {
        if (percentage >= 80) return "You handle authentic daily French very well.";
        if (percentage >= 60) return "You can deal with most everyday situations in French.";
        if (percentage >= 50) return "You are starting to grasp real-life French patterns.";
        return "Authentic French is challenging. Keep testing to progress step by step.";
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