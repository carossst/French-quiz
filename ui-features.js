// ui-features.js v3.2 - UX refined features (XP, paywall, chest, feedback)

function UIFeatures(uiCore, storageManager, resourceManager) {
    if (!uiCore) throw new Error("UIFeatures: uiCore parameter is required");
    if (!storageManager) throw new Error("UIFeatures: storageManager parameter is required");
    if (!resourceManager) throw new Error("UIFeatures: resourceManager parameter is required");

    this.uiCore = uiCore;
    this.storageManager = storageManager;
    this.resourceManager = resourceManager;

    this.paywallTimer = null;

    this.feedbackMessages = {
        lowPerformance: [
            "That's real French - great job testing yourself!",
            "Even expats struggle at first!",
            "You're discovering your real level, that's the goal!",
            "French authenticity is earned!",
            "Each test reveals your improvement points!"
        ],
        goodPerformance: [
            "You're starting to get authentic French!",
            "Good level! You'll manage well in France!",
            "You already master quite a bit!",
            "This confirms your knowledge!",
            "Solid level in this area!"
        ],
        strongPerformance: [
            "You're going to rock it in France!",
            "You really master this domain!",
            "Authentic level confirmed!",
            "You can go with confidence!",
            "Bravo, that's native-level French!"
        ]
    };

    // Start conversion engine
    this.startConversionTimer();
}

//================================================================================
// SMALL SAFE HELPERS (avoid "is not a function" crashes)
//================================================================================

// DOM helper: set text/value safely
UIFeatures.prototype.setText = function (id, value) {
    const el = document.getElementById(id);
    if (!el) return;

    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.value = value;
    } else {
        el.textContent = value;
    }
};

// Escape HTML (required by generateSimpleFeedback)
UIFeatures.prototype.escapeHTML = function (str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

// Feedback toast fallback (delegates to uiCore if available)
UIFeatures.prototype.showFeedbackMessage = function (type, message) {
    if (this.uiCore && typeof this.uiCore.showFeedbackMessage === "function") {
        return this.uiCore.showFeedbackMessage(type, message);
    }
    // Minimal fallback: console + optional alert for errors
    try {
        const fn = type === "error" ? "error" : (type === "warn" ? "warn" : "log");
        console[fn]("[TYF]", message);
    } catch { }
};

// Optional: XP progress indicator (no-op unless uiCore provides one)
UIFeatures.prototype.updateFPProgressIndicator = function () {
    // If you later implement a dedicated indicator, do it here.
};

// Optional: notifications (no-op unless implemented)
UIFeatures.prototype.initializeNotifications = function () {
    // Intentionally empty. Avoid crashes on prod.
};

// Storage events binding (safe)
UIFeatures.prototype.setupStorageEvents = function () {
    if (this._onStorageUpdated) return;
    this._onStorageUpdated = () => {
        try { this.updateXPHeader(); } catch { }
    };
    window.addEventListener("storage-updated", this._onStorageUpdated);
};

//================================================================================
// ROTATING FEEDBACK SYSTEM
//================================================================================
UIFeatures.prototype.getRotatedFeedbackMessage = function (percentage, themeId) {
    const pct = Number(percentage) || 0;
    const category = pct >= 60 ? "strongPerformance" : (pct >= 40 ? "goodPerformance" : "lowPerformance");
    const messages = this.feedbackMessages?.[category] || [];
    if (!messages.length) return "Keep going!";

    const key = "tyf-feedback-index";
    const safeThemeId = themeId ?? "global";
    const themeKey = `${safeThemeId}_${category}`;
    this._feedbackIndexMap = this._feedbackIndexMap || {};

    let indexMap;
    try { indexMap = JSON.parse(localStorage.getItem(key) || "{}") || {}; }
    catch { indexMap = this._feedbackIndexMap; }

    const currentIndex = Number(indexMap[themeKey]) || 0;
    const message = messages[currentIndex % messages.length];
    indexMap[themeKey] = currentIndex + 1;

    try { localStorage.setItem(key, JSON.stringify(indexMap)); }
    catch { this._feedbackIndexMap = indexMap; }

    return message;
};

//================================================================================
// XP SYSTEM
//================================================================================
UIFeatures.prototype.initializeXPSystem = function () {
    this.showXPHeader();
    this.updateXPHeader();
    this.setupStorageEvents();
    this.initializeNotifications();
    this.updateFPProgressIndicator();

    this.setupChestTooltip();
};

UIFeatures.prototype.showXPHeader = function () {
    const xpHeader = document.getElementById("xp-header");
    if (xpHeader) xpHeader.classList.remove("hidden");
};

// Daily chest in header
UIFeatures.prototype.addChestIconToHeader = function () {
    const wrapper = document.getElementById("daily-chest-wrapper");
    if (!wrapper) return;

    const updateState = () => {
        const available = (typeof this.storageManager.isDailyRewardAvailable === "function")
            ? !!this.storageManager.isDailyRewardAvailable()
            : true;

        wrapper.style.opacity = available ? "1" : "0.5";
        wrapper.style.cursor = available ? "pointer" : "default";
        wrapper.setAttribute("aria-disabled", available ? "false" : "true");
    };

    // Prevent stacking listeners
    if (wrapper.dataset.chestBound === "1") {
        updateState();
        return;
    }
    wrapper.dataset.chestBound = "1";

    const activate = (event) => {
        if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;

        // Prevent page scroll on Space
        if (event.type === "keydown" && event.key === " ") {
            event.preventDefault();
        }

        if (typeof this.storageManager.isDailyRewardAvailable === "function" &&
            !this.storageManager.isDailyRewardAvailable()) {
            updateState();
            return;
        }

        if (typeof this.storageManager.collectDailyReward !== "function") return;

        const result = this.storageManager.collectDailyReward();

        if (result && result.success) {
            const amount = Number(result.fpEarned ?? 0);
            if (amount > 0) this.showDailyRewardAnimation(amount);
            this.updateXPHeader();
        }

        updateState();
    };


    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("tabindex", "0");
    wrapper.setAttribute("aria-label", "Collect your daily French Points");

    wrapper.addEventListener("click", activate);
    wrapper.addEventListener("keydown", activate);

    updateState();
};


UIFeatures.prototype.updateXPHeader = function () {
    const fp = Number(this.storageManager.getFrenchPoints?.() ?? 0);
    const level = Number(this.storageManager.getUserLevel?.() ?? 1);
    const progress = this.storageManager.getLevelProgress?.() || { percentage: 0, remaining: null };

    this.setText("user-level", level);

    const fpEl = document.getElementById("user-fp");
    if (fpEl) fpEl.textContent = `${fp} French Points`;

    this.updateFPProgressIndicator();

    const progressBar = document.getElementById("xp-progress-bar");
    if (progressBar) {
        for (const c of [...progressBar.classList]) {
            if (c.startsWith("w-pct-")) progressBar.classList.remove(c);
        }
        const pct = Number.isFinite(progress.percentage) ? progress.percentage : 0;
        const pct5 = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
        progressBar.classList.add(`w-pct-${pct5}`);
    }

    this.addChestIconToHeader();
};

//================================================================================
// DAILY REWARD TOAST
//================================================================================
UIFeatures.prototype.showDailyRewardAnimation = function (points) {
    const containerId = "daily-reward-toast";
    const container = document.getElementById(containerId);

    // Si un container existe déjà dans le HTML, on y injecte un toast enfant.
    // Sinon, on crée un toast standalone (fallback).
    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    const isMobile = window.innerWidth < 640;

    // Toast enfant (si container), sinon toast positionné
    toast.className = container
        ? (isMobile
            ? "bg-green-600 text-white px-3 py-2 rounded-lg text-sm shadow-md"
            : "bg-green-600 text-white px-4 py-2 rounded-lg shadow-md")
        : (isMobile
            ? "fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-3 py-2 rounded-lg text-sm z-50"
            : "fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg z-50");

    toast.textContent = `+${points} French Points!`;

    if (container) {
        // Nettoyer les anciens toasts dans le container (optionnel mais propre)
        while (container.firstChild) container.removeChild(container.firstChild);
        container.appendChild(toast);
    } else {
        document.body.appendChild(toast);
    }

    setTimeout(() => {
        try { toast.remove(); } catch { /* no-op */ }
    }, 2000);
};



//================================================================================
// CONVERSION SYSTEM (PAYWALL)
//================================================================================
UIFeatures.prototype.startConversionTimer = function () {
    const start = () => {
        if (this.paywallTimer || document.hidden) return;

        this.paywallTimer = setInterval(() => {
            if (document.hidden) return;
            if (document.getElementById("sophie-paywall-modal")) return;

            const shouldTrigger = this.storageManager.shouldTriggerPaywall?.();

            const freeLeft = this.storageManager.getThemeProgress
                ? ((this.storageManager.getThemeProgress(1)?.completedCount || 0) < 5)
                : true;

            const hasUnplayedFreeQuizzes =
                (typeof this.storageManager.hasUnplayedFreeQuizzes === "function")
                    ? this.storageManager.hasUnplayedFreeQuizzes()
                    : freeLeft;

            if (shouldTrigger && !hasUnplayedFreeQuizzes) {
                this.showSophiePaywall();
                this.storageManager.markPaywallShown?.();
                stop();
            }
        }, 30000);
    };

    const stop = () => {
        if (this.paywallTimer) {
            clearInterval(this.paywallTimer);
            this.paywallTimer = null;
        }
    };

    document.addEventListener("visibilitychange", () => { document.hidden ? stop() : start(); });
    start();
};

UIFeatures.prototype.showSophiePaywall = function () {
    if (this.storageManager.isPremiumUser?.()) return;
    if (document.getElementById("sophie-paywall-modal")) return;

    const modal = this.createPaywallModal();
    document.body.appendChild(modal);

    setTimeout(() => {
        const buyBtn = modal.querySelector("#paywall-buy-btn");
        if (buyBtn) buyBtn.focus();
    }, 100);
};

UIFeatures.prototype.createPaywallModal = function () {
    const modal = document.createElement("div");
    modal.id = "sophie-paywall-modal";
    modal.className = "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
    modal.setAttribute("role", "dialog");

    const sessionMinutes = Math.max(0, Math.round(Number(this.storageManager.getSessionDuration?.()) || 0));
    const currentFP = Number(this.storageManager.getFrenchPoints?.()) || 0;
    const nextCost =
        Number(this.storageManager.getNextThemeUnlockCost?.()) ||
        Number(this.storageManager.getUnlockCost?.(this.storageManager.getUnlockedPremiumThemesCount?.() || 0)) ||
        0;
    const daily =
        Number(this.storageManager.getDailyRewardPoints?.()) ||
        Number(this.storageManager.getDailyRewardMin?.()) ||
        3;


    const waitDays = Math.max(0, Math.ceil((nextCost - currentFP) / Math.max(1, daily)));

    modal.innerHTML = this.generateSophiePaywallHTML(sessionMinutes, waitDays);
    this.setupPaywallEvents(modal);

    return modal;
};

UIFeatures.prototype.setupPaywallEvents = function (modal) {
    const cleanup = () => document.removeEventListener("keydown", onEsc);
    const close = () => { cleanup(); modal.remove(); };

    modal.querySelectorAll('[data-action="close"]').forEach(btn => btn.addEventListener("click", close));
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    const onEsc = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onEsc);

    const buyBtn = modal.querySelector("#paywall-buy-btn");
    if (buyBtn) {
        buyBtn.addEventListener("click", () => {
            const url = window?.TYF_CONFIG?.stripePaymentUrl;
            if (url) window.location.href = url;
        });
    }
};

UIFeatures.prototype.generateSophiePaywallHTML = function (sessionMinutes, waitDays) {
    return `
        <div class="bg-white rounded-2xl p-8 max-w-md mx-4 text-center relative">
            <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600" data-action="close">×</button>

            <div class="text-5xl mb-4">📊</div>
            <h2 class="text-xl font-bold text-gray-800 mb-4">Want to assess all French domains?</h2>

            <div class="bg-orange-50 rounded-lg p-4 mb-6 text-left">
                <div class="text-orange-800 text-sm space-y-2">
                    <div>⏱ <strong>You've already invested ${sessionMinutes} minutes</strong></div>
                    <div>• At free pace: ${waitDays} days waiting</div>
                    <div>★ With Premium: Complete Quiz now</div>
                </div>
            </div>

            <div class="bg-blue-50 rounded-lg p-4 mb-6">
                <div class="text-blue-800 text-sm">
                    ✓ 9 additional quiz themes<br>
                    ✓ 45 authentic French quizzes<br>
                    ✓ Native audio practice<br>
                    ✓ Realistic feedback
                </div>
            </div>

            <div class="text-2xl font-bold text-blue-600 mb-2">$12</div>
            <div class="text-sm text-gray-600 mb-6">Your time is worth more than 40 cents per day</div>

            <button id="paywall-buy-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors mb-3">
                Unlock all themes - $12
            </button>

            <button data-action="close" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-4 rounded-lg transition-colors">
                Continue free (${waitDays} days)
            </button>
        </div>`;
};

//================================================================================
// RESULTS-LEVEL FP HANDLING
//================================================================================
UIFeatures.prototype.handleResultsFP = function (resultsData) {
    const points = Number(resultsData && resultsData.score);
    if (!Number.isFinite(points) || points <= 0) return;
    this.showFPGain(points);
};

UIFeatures.prototype.showFPGain = function (amount) {
    const elem = document.createElement("div");
    elem.className =
        "fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-xl font-bold text-blue-600 z-50 pointer-events-none";

    const label = amount === 1 ? "French Point" : "French Points";
    elem.textContent = `+${amount} ${label}`;

    document.body.appendChild(elem);

    try {
        if (window.trackMicroConversion) {
            window.trackMicroConversion("fp_earned", { amount });
        }
    } catch { }

    setTimeout(() => elem.remove(), 1500);
};


//================================================================================
// ASSESSMENT FEEDBACK (PER QUESTION)
//================================================================================
UIFeatures.prototype.showQuestionFeedback = function (question, selectedIndex) {
    const container = document.getElementById("feedback-container");
    if (!container) return;

    const scope = container.closest(".quiz-wrapper") || document;
    const optionsContainer = scope.querySelector(".options-container");
    const options = scope.querySelectorAll(".option");

    const correctIndex = Number(question?.correctIndex);
    const isValid = Number.isInteger(correctIndex) && options[correctIndex];
    const isCorrect = isValid && correctIndex === Number(selectedIndex);

    options.forEach((opt, i) => {
        opt.classList.remove("correct-validated", "incorrect-validated", "selected");
        if (!isValid) return;
        if (i === correctIndex) opt.classList.add("correct-validated");
        else if (i === Number(selectedIndex)) opt.classList.add("incorrect-validated");
    });

    if (optionsContainer) {
        optionsContainer.classList.add("is-validated");
        optionsContainer.setAttribute("aria-disabled", "true");
        options.forEach(o => {
            o.setAttribute("tabindex", "-1");
            o.setAttribute("aria-checked", "false");
        });
    }

    container.innerHTML = this.generateSimpleFeedback(isCorrect, question);
    container.classList.remove("hidden");
    // container.classList.add("as-toast"); // Removed - feedback displays inline below question
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    container.tabIndex = -1;
    requestAnimationFrame(() => container.focus({ preventScroll: true }));
};

UIFeatures.prototype.generateSimpleFeedback = function (isCorrect, question) {
    const hasOptions = Array.isArray(question?.options);
    const validIdx = Number.isInteger(question?.correctIndex) && hasOptions &&
        question.correctIndex >= 0 && question.correctIndex < question.options.length;

    const strip = (s) => String(s).replace(/^\s*[A-D]\s*[\.)]\s*/i, "").trim();
    const rawCorrect = validIdx ? String(question.options[question.correctIndex]) : "-";
    const safeCorrect = this.escapeHTML(strip(rawCorrect));
    const safeExplanation = typeof question?.explanation === "string" ? this.escapeHTML(question.explanation) : "";

    if (isCorrect) {
        return `
      <div class="feedback-content correct text-center">
        <div class="text-2xl mb-1">✅</div>
        <div class="text-lg font-bold text-white mb-1">Excellent!</div>
        ${safeExplanation ? `
          <div class="mt-3 p-3 bg-white/10 rounded-lg border border-white/20">
            <div class="flex items-start gap-2">
              <span class="text-lg">💡</span>
              <div class="text-left">
                <div class="text-sm font-semibold text-white mb-1">Did you know?</div>
                <div class="text-sm text-white opacity-95">${safeExplanation}</div>
              </div>
            </div>
          </div>` : ""}
      </div>`;
    }

    return `
    <div class="feedback-content incorrect text-center">
      <div class="text-2xl mb-1">✗</div>
      <div class="text-lg font-bold text-white mb-1">Keep learning!</div>
      <div class="text-base text-white opacity-95 mb-1">Correct answer: <strong>${safeCorrect}</strong></div>
      ${safeExplanation ? `
        <div class="mt-2 text-sm text-white opacity-90">
          <span>💡 </span>${safeExplanation}
        </div>` : ""}
    </div>`;
};

//================================================================================
// THEME HANDLING
//================================================================================
UIFeatures.prototype.handleThemeClick = function (theme) {
    const unlockStatus = this.storageManager.canUnlockTheme?.(theme.id) || { canUnlock: false, reason: "UNKNOWN" };

    const goTheme = () => {
        if (this.uiCore?.quizManager) this.uiCore.quizManager.currentThemeId = theme.id;
        if (this.uiCore?.showQuizSelection) this.uiCore.showQuizSelection();
    };

    if (this.storageManager.isThemeUnlocked?.(theme.id) || this.storageManager.isPremiumUser?.()) {
        goTheme();
        return;
    }

    if (unlockStatus.reason === "PREVIOUS_LOCKED") {
        this.showThemePreviewModal(theme);
        return;
    }

    if (unlockStatus.reason === "INSUFFICIENT_FP") {
        const currentFP = Number(this.storageManager.getFrenchPoints?.() ?? 0);
        const needed = Number(unlockStatus.cost ?? 0) - currentFP;

        let message = `${theme.name} needs ${unlockStatus.cost} French Points\n\n` +
            `You have: ${currentFP} French Points\n` +
            `Missing: ${needed} French Points\n\n`;

        if (needed <= 5) {
            message += `So close! Take more quizzes or tomorrow's bonus!\n\n`;
            message += `Or get instant access to all themes ($12) - click header link`;
        } else if (needed <= 15) {
            message += `A few more quizzes and daily bonuses!\n\n`;
            message += `Or get instant access to all themes ($12) - click header link\n\n`;
            message += `Don't forget your daily chests!`;
        } else {
            message += `Or get instant access to all themes ($12) - click header link\n\n`;
            message += `Free path: complete quizzes to earn French Points + daily chest bonuses`;
        }

        alert(message);
        return;
    }

    if (unlockStatus.canUnlock) {
        const currentFP = Number(this.storageManager.getFrenchPoints?.() ?? 0);
        const cost = Number(unlockStatus.cost ?? 0);

        const confirmMessage = `Unlock "${theme.name}" for ${cost} FP?\n\n` +
            `You have ${currentFP} FP\n` +
            `After unlock: ${Math.max(0, currentFP - cost)} FP remaining\n\n` +
            `This unlocks 5 authentic French quizzes`;

        if (confirm(confirmMessage)) {
            if (typeof this.storageManager.unlockTheme !== "function") {
                this.showFeedbackMessage("error", "Unlock failed (missing storage method)");
                return;
            }

            const res = this.storageManager.unlockTheme(theme.id, cost);

            if (res && res.success) {
                const remaining = Number(res.remainingFP ?? this.storageManager.getFrenchPoints?.() ?? 0);
                alert(`Unlocked "${theme.name}"!\n\n5 new authentic French quizzes available\n${remaining} French Points remaining`);
                this.updateXPHeader();
                setTimeout(() => {
                    if (this.uiCore?.showWelcomeScreen) this.uiCore.showWelcomeScreen();
                    else window.location.reload();
                }, 100);
            } else {
                this.showFeedbackMessage("error", "Unlock failed - please try again");
            }
        }
        return;
    }


    this.showThemePreviewModal(theme);
};

UIFeatures.prototype.getNextQuizInTheme = function () {
    if (!this.uiCore || !this.uiCore.quizManager || !this.resourceManager) return null;

    const themeId = this.uiCore.quizManager.currentThemeId;
    const currentQuizId = this.uiCore.quizManager.currentQuizId;
    if (!themeId) return null;

    const theme = (typeof this.resourceManager.getThemeById === "function")
        ? this.resourceManager.getThemeById(themeId)
        : null;

    if (!theme || !Array.isArray(theme.quizzes)) return null;

    const quizzes = theme.quizzes;

    const isUnlocked = (id) =>
        typeof this.storageManager.isQuizUnlocked === "function"
            ? this.storageManager.isQuizUnlocked(id)
            : true;

    const isCompleted = (id) =>
        typeof this.storageManager.isQuizCompleted === "function"
            ? this.storageManager.isQuizCompleted(id)
            : false;

    const startIndex = quizzes.findIndex(q => q.id === currentQuizId);

    if (startIndex >= 0 && startIndex < quizzes.length - 1) {
        for (let i = startIndex + 1; i < quizzes.length; i++) {
            const q = quizzes[i];
            if (isUnlocked(q.id)) return { themeId, quizId: q.id };
        }
    }

    for (let i = 0; i < quizzes.length; i++) {
        const q = quizzes[i];
        if (isUnlocked(q.id) && !isCompleted(q.id)) return { themeId, quizId: q.id };
    }

    return null;
};

UIFeatures.prototype.showThemePreviewModal = function (theme) {
    const modal = this.createThemePreviewModal?.(theme);
    if (modal) document.body.appendChild(modal);
};

//================================================================================
// DAILY REWARD
//================================================================================

UIFeatures.prototype.setupDailyReward = function () {
    if (window.TYF_CONFIG?.debug?.enabled) {
        console.debug('🎁 Daily reward system updated - using chest icon in header');
    }
};

UIFeatures.prototype.collectDailyReward = function () {
    const result = this.storageManager.collectDailyReward();
    if (result.success) {
        this.showDailyRewardAnimation(result.fpEarned || result.pointsEarned);
        this.updateXPHeader();
    }
};

//================================================================================
// PAYWALL HELPERS
//================================================================================

UIFeatures.prototype.handlePurchase = function () {
    const stripeUrl = window.TYF_CONFIG?.stripePaymentUrl || "https://buy.stripe.com/your-payment-link";
    window.open(stripeUrl, '_blank');
    try {
        if (window.gtag) {
            gtag('event', 'stripe_clicked', {
                session_duration: this.storageManager.getSessionDuration?.(),
                premium_assessments_completed: this.storageManager.getPremiumQuizCompleted?.()
            });
        }
    } catch { /* no-op */ }
};

UIFeatures.prototype.closePaywall = function (modal) {
    modal.remove();
};

//================================================================================
// COMPLETION MESSAGES
//================================================================================

UIFeatures.prototype.getCompletionMessage = function (percentage, fpEarned) {
    let message = "";
    const score = Math.round(percentage * 20 / 100);
    const isMobile = window.innerWidth < 640;

    if (percentage >= 90) {
        message = isMobile ? `Excellent! (${score}/20)` : `Excellent! Near-native level (${score}/20)`;
    } else if (percentage >= 70) {
        message = isMobile ? `Fantastic! (${score}/20)` : `Fantastic work! Real skills developing (${score}/20)`;
    } else if (percentage >= 50) {
        message = isMobile ? `Great work! (${score}/20)` : `Great work! You're building skills (${score}/20)`;
    } else {
        message = isMobile ? `Great start! (${score}/20)` : `Great start! Real French progress (${score}/20)`;
    }

    message += `\n+${fpEarned} French Points earned`;

    const currentFP = this.storageManager.getFrenchPoints();

    if (this.storageManager.isPremiumUser()) {
        message += `\n🚀 Premium active - unlimited learning!`;
        message += `\n🏆 You're mastering authentic French`;
    } else if (currentFP < 10) {
        message += `\n🌟 You're building authentic skills!`;
        message += isMobile ?
            `\n✨ Love this? All themes $12` :
            `\n✨ Love the progress? Get all themes instantly $12`;
    } else if (currentFP < 25) {
        message += `\n🔥 Your French breakthrough is happening!`;
        message += isMobile ?
            `\n✨ Ready to accelerate? All themes $12` :
            `\n✨ Ready to accelerate your progress? All themes $12`;
    } else {
        message += `\n🏆 Your dedication shows in every quiz`;
        message += isMobile ?
            `\n✨ Complete your journey - All themes $12` :
            `\n✨ Complete your French journey - All themes $12`;
    }

    return message;
};

//================================================================================
// THEME PREVIEW MODAL
//================================================================================

UIFeatures.prototype.createThemePreviewModal = function (theme) {
    const modal = document.createElement('div');
    modal.id = 'theme-preview-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.setAttribute('role', 'dialog');

    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-8 max-w-md mx-4 text-center relative">
            <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600" data-action="close">
                <span aria-hidden="true" class="text-lg">✕</span>
            </button>
            
            <div class="text-4xl mb-4">${theme.icon}</div>
            <h2 class="text-xl font-bold text-gray-800 mb-4">Unlock ${theme.name}?</h2>
            
            <div class="bg-blue-50 rounded-lg p-4 mb-6">
                <div class="text-blue-800 text-sm space-y-2">
                    <div>🎯 <strong>5 progressive quizzes</strong></div>
                    <div>🎧 <strong>Authentic French audio</strong></div>
                    <div>📊 <strong>Real situation testing</strong></div>
                </div>
            </div>
            
            <div class="space-y-3">
                <button id="premium-code-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg">
                    🔓 I have a premium code
                </button>
                
                <button id="premium-buy-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg">
                    💳 Get Premium Access ($12)
                </button>
                
                <button id="colors-first-btn" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-4 rounded-lg">
                    🆓 Try Colors theme first
                </button>
            </div>
        </div>`;

    this.setupThemePreviewEvents(modal, theme);
    return modal;
};

UIFeatures.prototype.setupThemePreviewEvents = function (modal, theme) {
    const cleanup = () => document.removeEventListener('keydown', onEsc);
    const close = () => { cleanup(); modal.remove(); };

    modal.querySelectorAll('[data-action="close"]').forEach(btn => btn.addEventListener('click', close));
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onEsc);

    const codeBtn = modal.querySelector('#premium-code-btn');
    if (codeBtn) codeBtn.addEventListener('click', () => { close(); this.showPremiumCodeModal(); });

    const buyBtn = modal.querySelector('#premium-buy-btn');
    if (buyBtn) buyBtn.addEventListener('click', () => {
        const url = window?.TYF_CONFIG?.stripePaymentUrl;
        if (url) window.location.href = url;
    });

    const colorsBtn = modal.querySelector('#colors-first-btn');
    if (colorsBtn) colorsBtn.addEventListener('click', () => {
        close();
        if (this.uiCore?.quizManager) this.uiCore.quizManager.currentThemeId = 1;
        if (this.uiCore?.showQuizSelection) this.uiCore.showQuizSelection();
    });
};

//================================================================================
// PREMIUM CODE MODAL
//================================================================================

UIFeatures.prototype.showPremiumCodeModal = function () {
    const existing = document.querySelector('#premium-code-input');
    if (existing) { existing.focus(); return; }

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
    <div class="bg-white rounded-2xl p-8 max-w-sm mx-4 text-center relative" role="dialog" aria-modal="true">
      <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600" aria-label="Close" data-action="close">
        <span aria-hidden="true" class="text-lg">✕</span>
      </button>
      <h2 class="text-xl font-bold text-gray-800 mb-4">Enter Premium Code</h2>
      <div class="mb-4">
       <input id="premium-code-input" type="text" inputmode="text" autocomplete="off" autocapitalize="characters"
       aria-label="Premium code" maxlength="20"
       class="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
       placeholder="Enter your code">
      </div>
      <div class="space-y-3">
        <button id="validate-code-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg">Validate Code</button>
        <button id="buy-premium-btn" class="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-medium py-3 px-6 rounded-lg">Buy Premium</button>
        <button data-action="cancel" class="w-full text-gray-600 hover:text-gray-800 py-2">Cancel</button>
      </div>
    </div>`;

    const cleanup = () => document.removeEventListener('keydown', onEsc);
    const close = () => { cleanup(); modal.remove(); };

    document.body.appendChild(modal);
    modal.querySelectorAll('[data-action="close"], [data-action="cancel"]').forEach(btn => btn.addEventListener('click', close));
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onEsc);

    const input = modal.querySelector('#premium-code-input');
    const validateBtn = modal.querySelector('#validate-code-btn');
    if (validateBtn && input) {
        validateBtn.addEventListener('click', () => {
            const code = input.value.trim();
            const result = this.storageManager?.unlockPremiumWithCode
                ? this.storageManager.unlockPremiumWithCode(code)
                : { success: false };
            if (result.success) { this.showFeedbackMessage?.('success', '🎉 Premium unlocked!'); close(); }
            else { input.classList.add('border-red-400'); input.value = ''; input.placeholder = 'Invalid code - try again'; }
        });
    }
    const buyBtn = modal.querySelector('#buy-premium-btn');
    if (buyBtn) buyBtn.addEventListener('click', () => {
        const url = window?.TYF_CONFIG?.stripePaymentUrl;
        if (url) window.location.href = url;
    });
};

//================================================================================
// USER PROFILE MODAL
//================================================================================

UIFeatures.prototype.showUserProfileModal = function () {
    if (this.storageManager.isUserIdentified()) return;
    if (!this.storageManager.shouldShowProfileModal()) return;

    const modal = this.createUserProfileModal();
    document.body.appendChild(modal);

    setTimeout(() => {
        const firstInput = modal.querySelector('#user-email');
        if (firstInput) firstInput.focus();
    }, 300);
};

UIFeatures.prototype.createUserProfileModal = function () {
    const modal = document.createElement('div');
    modal.id = 'user-profile-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'profile-modal-title');

    modal.innerHTML = this.generateUserProfileHTML();
    this.setupUserProfileEvents(modal);

    return modal;
};

UIFeatures.prototype.generateUserProfileHTML = function () {
    const completedAssessments = this.storageManager.getCompletedQuizzesCount();

    return `
        <div class="bg-white rounded-2xl p-8 max-w-sm mx-4 text-center relative animate-fade-in">
            <div class="text-4xl mb-4">🎉</div>
            <h2 id="profile-modal-title" class="text-xl font-bold text-gray-800 mb-3">
                Excellent progress!
            </h2>
            <p class="text-gray-600 mb-6">
                You've completed ${completedAssessments} authentic quiz! Save your progress to keep going.
            </p>
            
            <div class="space-y-4 mb-6">
                <div>
                    <label for="user-email" class="block text-sm font-medium text-gray-700 mb-2">
                        Email
                    </label>
                    <input type="email" id="user-email" 
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                           placeholder="your@email.com">
                </div>
                
                <div>
                    <label for="user-firstname" class="block text-sm font-medium text-gray-700 mb-2">
                        First Name
                    </label>
                    <input type="text" id="user-firstname" 
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                           placeholder="Julie">
                </div>
            </div>
            
            <div class="space-y-3">
                <button id="save-profile-btn" 
                        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors">
                    💾 Save my progress
                </button>
                
                <button id="skip-profile-btn" 
                        class="w-full text-gray-600 hover:text-gray-800 py-2 transition-colors">
                    Continue without saving
                </button>
            </div>
            
            <div class="text-xs text-gray-500 mt-4">
                <span aria-hidden="true" class="mr-1">🔒</span>
                Your data stays private and local
            </div>
        </div>`;
};

UIFeatures.prototype.setupUserProfileEvents = function (modal) {
    const emailInput = modal.querySelector('#user-email');
    const firstNameInput = modal.querySelector('#user-firstname');
    const saveBtn = modal.querySelector('#save-profile-btn');
    const skipBtn = modal.querySelector('#skip-profile-btn');

    const validateInputs = () => {
        const email = emailInput.value.trim();
        const firstName = firstNameInput.value.trim();
        const isValid = email.includes('@') && firstName.length >= 2;

        saveBtn.disabled = !isValid;
        saveBtn.classList.toggle('opacity-50', !isValid);
        saveBtn.classList.toggle('cursor-not-allowed', !isValid);
    };

    emailInput.addEventListener('input', validateInputs);
    firstNameInput.addEventListener('input', validateInputs);
    validateInputs();

    saveBtn.addEventListener('click', () => {
        const email = emailInput.value.trim();
        const firstName = firstNameInput.value.trim();

        if (this.storageManager.setUserProfile(email, firstName)) {
            this.showFeedbackMessage('success', `👋 Hi ${firstName}! Your progress is saved`);
            this.closeUserProfileModal(modal);
        } else {
            this.showFeedbackMessage('error', '❌ Error saving profile');
        }
    });

    skipBtn.addEventListener('click', () => {
        this.storageManager.markProfileModalRefused();
        this.closeUserProfileModal(modal);
    });

    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            this.storageManager.markProfileModalRefused();
            this.closeUserProfileModal(modal);
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);

    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !saveBtn.disabled) {
            saveBtn.click();
        }
    });
};

UIFeatures.prototype.closeUserProfileModal = function (modal) {
    modal.classList.add('animate-fade-out');
    setTimeout(() => {
        modal.remove();
    }, 300);
};

UIFeatures.prototype.updateUserGreeting = function () {
    const userGreeting = document.getElementById('user-greeting');
    if (userGreeting) {
        const displayName = this.storageManager.getUserDisplayName();
        userGreeting.textContent = `Hi ${displayName}!`;
    }
};

//================================================================================
// NOTIFICATIONS
//================================================================================

UIFeatures.prototype.requestNotificationPermission = function () {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                if (window.TYF_CONFIG?.debug?.enabled) console.debug('Notifications enabled ✅');
                this.scheduleNextNotification();
            } else {
                if (window.TYF_CONFIG?.debug?.enabled) console.debug('Notifications denied ❌');
            }
        });
    }
};

UIFeatures.prototype.scheduleNextNotification = function () {
    if (!window.isSecureContext) return;
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const message = {
        type: 'SCHEDULE_NOTIFICATION',
        title: '🎁 Test Your French',
        body: 'Your daily chest is waiting! Free French Points!',
        delay: 24 * 60 * 60 * 1000
    };

    navigator.serviceWorker.ready.then(registration => {
        if (!registration?.active) return;
        try {
            const channel = new MessageChannel();
            registration.active.postMessage(message, [channel.port2]);
        } catch {
            registration.active.postMessage(message);
        }
    }).catch(() => {/* no-op */ });
};

//================================================================================
// UTILITIES
//================================================================================

UIFeatures.prototype.formatDuration = function (ms) {
    if (!Number.isFinite(ms) || ms <= 0) return 'now';
    const h = Math.floor(ms / 3600000);
    const m = Math.ceil((ms % 3600000) / 60000);
    if (h <= 0) return `${m} min`;
    if (m === 60) return `${h + 1} h`;
    return `${h} h ${m} min`;
};

UIFeatures.prototype.getChestInfo = function () {
    let nextReadyTs = this.storageManager?.getNextDailyRewardTime?.() ?? null;

    if (!nextReadyTs) {
        const lastTs =
            this.storageManager?.getLastDailyRewardTimestamp?.()
            ?? Number(localStorage.getItem('tyf:lastDailyRewardAt') || 0);
        const cooldown = this.storageManager?.getDailyRewardCooldownMs?.() ?? 24 * 60 * 60 * 1000;
        nextReadyTs = lastTs ? (lastTs + cooldown) : Date.now();
    }

    const msLeft = nextReadyTs - Date.now();
    const availableFromStore = this.storageManager?.isDailyRewardAvailable?.() || false;
    const available = availableFromStore || msLeft <= 0;
    const etaText = available ? '' : this.formatDuration(msLeft);

    return { available, points: 3, etaText };
};

// APRÈS (ui-features.js - setupChestTooltip)
// Objectif: tooltip sur le chest, sans casser le click "collect" sur mobile quand le reward est dispo.
UIFeatures.prototype.setupChestTooltip = function () {
    const trigger = document.getElementById("daily-chest-wrapper");
    const tip = document.getElementById("daily-chest-tooltip");
    const tipText = document.getElementById("daily-chest-tooltip-text");

    if (!trigger || !tip || !tipText) return;
    if (trigger.dataset.bound === "1") return;
    trigger.dataset.bound = "1";

    if (!tip.id) tip.id = "daily-chest-tooltip";
    trigger.setAttribute("aria-controls", tip.id);

    const isTouchLike = () => {
        try {
            const mqCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
            const mqNoHover = window.matchMedia && window.matchMedia("(hover: none)").matches;
            return !!(mqCoarse || mqNoHover);
        } catch { return false; }
    };

    const buildText = () => {
        const info = this.getChestInfo();
        const etaLine = info.available ? "Available now." : `Available in ${info.etaText}.`;
        return `🎁 One daily chest (calendar streak).\nMinimum: ${info.points} French Points. Bonus possible.\n${etaLine}`;
    };

    const open = () => {
        tipText.textContent = buildText();
        tip.classList.remove("hidden");
        trigger.setAttribute("aria-expanded", "true");
        trigger.setAttribute("aria-describedby", tip.id);
    };

    const close = () => {
        tip.classList.add("hidden");
        trigger.setAttribute("aria-expanded", "false");
        trigger.removeAttribute("aria-describedby");
    };

    const toggle = () => tip.classList.contains("hidden") ? open() : close();

    // Desktop hover + focus
    trigger.addEventListener("pointerenter", () => { if (!isTouchLike()) open(); });
    trigger.addEventListener("pointerleave", () => { if (!isTouchLike()) close(); });
    trigger.addEventListener("focus", () => { if (!isTouchLike()) open(); });
    trigger.addEventListener("blur", () => { if (!isTouchLike()) close(); });

    // Mobile tap:
    // - si reward dispo: on laisse le click "collect" existant faire son job
    // - sinon: tap = toggle tooltip (évite conflit click handlers)
    trigger.addEventListener("click", (e) => {
        if (!isTouchLike()) return;

        const available = (typeof this.storageManager?.isDailyRewardAvailable === "function")
            ? !!this.storageManager.isDailyRewardAvailable()
            : this.getChestInfo().available;

        if (available) return;

        e.preventDefault();
        e.stopPropagation();
        toggle();
    });

    // Outside click closes (touch only)
    document.addEventListener("click", (e) => {
        if (!isTouchLike()) return;
        if (trigger.contains(e.target) || tip.contains(e.target)) return;
        close();
    });

    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, { passive: true });
};



UIFeatures.prototype.setupResultsEventListeners = function () {
    document.querySelector('.quiz-wrapper')?.classList.add('results-compact');

    const backBtn = document.getElementById('back-to-themes-btn');
    if (backBtn) backBtn.addEventListener('click', () => {
        if (this.uiCore?.showThemeSelection) this.uiCore.showThemeSelection();
    });

    const toggleBtn = document.getElementById('toggle-details-btn');
    const details = document.getElementById('detailed-stats');
    if (toggleBtn && details) {
        toggleBtn.addEventListener('click', () => details.classList.toggle('hidden'));
    }
};

//================================================================================
// CLEANUP
//================================================================================

UIFeatures.prototype.destroy = function () {
    if (this.paywallTimer) {
        clearInterval(this.paywallTimer);
        this.paywallTimer = null;
    }
    if (this._onStorageUpdated) {
        window.removeEventListener('storage-updated', this._onStorageUpdated);
        this._onStorageUpdated = null;
    }
};

window.UIFeatures = UIFeatures;
