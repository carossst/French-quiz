// ui-features.js v3 - UX refined features (XP, paywall, chest, feedback)

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

    // Conversion engine will start when XP system is initialized (controlled moment)


    // No auto-activation: user must paste code manually
}

// =======================================
// PRICING (UI ONLY – Stripe stays at $12)
// =======================================
UIFeatures.PRICE_DISPLAY = {
    label: "Launch price: $12 (regular $99)",
    current: "$12",
    regular: "$99"
};


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
    // ✅ Translate known keys to human text (KISS, UI-only)
    const keyMap = {
        validation_required: "Select an answer to continue.",
        premium_unlocked: "Premium unlocked.",
        daily_reward_locked: "Daily chest locked. One chest per calendar day.",
        DAILY_LOCKED: "Daily chest locked. One chest per calendar day."
    };

    const resolved =
        (typeof message === "string" && keyMap[message])
            ? keyMap[message]
            : message;

    if (this.uiCore && typeof this.uiCore.showFeedbackMessage === "function") {
        return this.uiCore.showFeedbackMessage(type, resolved);
    }

    // Minimal fallback: console
    try {
        const fn = type === "error" ? "error" : (type === "warn" ? "warn" : "log");
        console[fn]("[TYF]", resolved);
    } catch { }
};


UIFeatures.prototype.initializeNotifications = function () {
    // Intentionally empty. Avoid crashes on prod.
};

// Storage events binding (safe)
UIFeatures.prototype.setupStorageEvents = function () {
    if (this._onStorageUpdated) return;

    this._onStorageUpdated = () => {
        try { this.updateXPHeader(); } catch { }

        // Chest UI
        try { this.addChestIconToHeader(); } catch { }
        try { this.setupChestTooltip(); } catch { }   // ✅ rebinde quand le header vient d’être rendu

        // If tooltip is open, close it (avoids stale ETA text)
        try { this._closeChestTooltip?.(); } catch { }
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
    if (!messages.length) return "Keep going - you're building authentic French skills.";



    const key = "tyf-feedback-index";
    const safeThemeId = themeId ?? "global";
    const themeKey = `${safeThemeId}_${category}`;

    let indexMap;
    try { indexMap = JSON.parse(localStorage.getItem(key) || "{}"); }
    catch { indexMap = {}; }

    const currentIndex = Number(indexMap[themeKey]) || 0;
    const message = messages[currentIndex % messages.length];
    indexMap[themeKey] = currentIndex + 1;

    try { localStorage.setItem(key, JSON.stringify(indexMap)); } catch { }
    return message;
};

//================================================================================
// XP SYSTEM
//================================================================================
UIFeatures.prototype.initializeXPSystem = function () {
    this.showXPHeader();

    // Bind events first (then render once)
    this.setupStorageEvents();
    this.setupFPEvents();
    this.setupGamificationUXEvents();

    // UI elements
    this.addChestIconToHeader();
    this.setupChestTooltip();

    // Initial paint
    this.updateXPHeader();

    this.initializeNotifications();
    this.startConversionTimer();
};



UIFeatures.prototype.updateXPHeader = function () {
    // ✅ IDs réels dans index.html
    const fpEl = document.getElementById("user-fp");
    const levelEl = document.getElementById("user-level");

    const fp = Number(this.storageManager?.getFrenchPoints?.() ?? 0);
    const safeFP = Number.isFinite(fp) && fp >= 0 ? fp : 0;

    // Header UI: format "0 FP"
    if (fpEl) fpEl.textContent = `${safeFP} FP`;

    let level = Number(this.storageManager?.getUserLevel?.() ?? NaN);
    if (!Number.isFinite(level) || level <= 0) {
        // Fallback cohérent avec StorageManager (FP_PER_LEVEL = 50)
        level = 1 + Math.floor(safeFP / 50);
    }

    if (levelEl) levelEl.textContent = String(level);
};

UIFeatures.prototype.setupFPEvents = function () {
    if (this._onFPGained) return;

    this._onFPGained = (e) => {
        const amount = Number(e?.detail?.amount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) return;

        this.showFPGain(amount);
        try { this.updateXPHeader(); } catch { }
    };

    window.addEventListener("fp-gained", this._onFPGained);
};

// (SUPPRIMÉ) UIFeatures.prototype.bindHeaderPremiumCodeEntry


UIFeatures.prototype.setupGamificationUXEvents = function () {
    if (this._gamificationUXBound) return;
    this._gamificationUXBound = true;

    this._onBadgesEarned = (e) => {
        const badges = Array.isArray(e?.detail?.badges) ? e.detail.badges : [];
        if (!badges.length) return;

        const first = badges[0] || {};
        const name = first.name || "New badge";
        this.showFeedbackMessage("success", `Badge earned: ${name}`);
    };

    this._onLevelUp = (e) => {
        const lvl = e?.detail?.newLevel ?? null;
        if (!Number.isFinite(lvl)) return;

        const info = this.getLevelNarrative(lvl);

        this.showFeedbackMessage(
            "success",
            `Level ${lvl} — ${info.stage}\n${info.message}\nNext: ${info.next}`
        );

        try { this.updateXPHeader(); } catch { }
    };

    this._onPremiumUnlocked = () => {
        // 1) Stop conversion timer (sinon interval tourne pour rien)
        try { this.stopConversionTimer?.(); } catch { }

        // 2) Fermer tous les modals premium/paywall si ouverts (évite états incohérents)
        try { document.getElementById("sophie-paywall-modal")?.remove?.(); } catch { }
        try { document.getElementById("premium-code-modal")?.remove?.(); } catch { }
        try { document.getElementById("theme-preview-modal")?.remove?.(); } catch { }

        // 3) Feedback + refresh header
        this.showFeedbackMessage("success", "Premium unlocked.");
        try { this.updateXPHeader(); } catch { }

        // 4) Refresh UI principal (déterministe)
        try {
            if (this.uiCore?.showWelcomeScreen) this.uiCore.showWelcomeScreen();
            else if (this.uiCore?.showQuizSelection) this.uiCore.showQuizSelection();
        } catch { /* no-op */ }
    };

    this._onQuizCompleted = (e) => {
        try {
            if (this.storageManager?.isUserIdentified?.()) return;
            if (!this.storageManager?.shouldShowProfileModal?.()) return;
            this.showUserProfileModal();
        } catch { /* no-op */ }
    };


    window.addEventListener("badges-earned", this._onBadgesEarned);
    window.addEventListener("level-up", this._onLevelUp);
    window.addEventListener("premium-unlocked", this._onPremiumUnlocked);
    window.addEventListener("quiz-completed", this._onQuizCompleted);
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
        const info = (typeof this.getChestInfo === "function")
            ? this.getChestInfo()
            : { available: false, points: 1, etaText: "" };

        const available = !!info.available;

        const points = Number.isFinite(info.points) && info.points > 0 ? info.points : 1;
        const label = points === 1 ? "French Point" : "French Points";

        const eta = available
            ? ""
            : (info.etaText ? ` Available in ${info.etaText}.` : " Available tomorrow.");

        wrapper.setAttribute(
            "aria-label",
            available
                ? `Collect your daily chest (+${points} ${label}).`
                : `Daily chest locked. One chest per calendar day.${eta}`
        );
    };

    if (!this._chestHeaderHandlers) this._chestHeaderHandlers = {};
    const h = this._chestHeaderHandlers;

    // 1) If previously bound to a different node, unbind it
    if (h.node && h.node !== wrapper && h.onActivate) {
        try { h.node.removeEventListener("click", h.onActivate); } catch { }
        try { delete h.node.dataset.chestBound; } catch { }
        h.node = null;
        h.onActivate = null;
    }

    // 2) If already bound on THIS node, remove the old handler before rebinding
    //    (critical fix: avoid stale handlers when addChestIconToHeader is called again)
    if (h.node === wrapper && h.onActivate) {
        try { wrapper.removeEventListener("click", h.onActivate); } catch { }
    }

    // 3) Mark bound (do NOT early-return: we want to be able to refresh the handler safely)
    wrapper.dataset.chestBound = "1";
    h.node = wrapper;

    // 4) Create the fresh handler
    h.onActivate = (event) => {
        const availableNow =
            (typeof this.storageManager?.isDailyRewardAvailable === "function")
                ? !!this.storageManager.isDailyRewardAvailable()
                : !!this.getChestInfo?.().available;

        // Locked: toggle tooltip (mobile) - click reserved for collect when available
        if (!availableNow) {
            try { this._toggleChestTooltip?.(); } catch { }
            event.preventDefault?.();
            event.stopPropagation?.();
            updateState();
            return;
        }

        if (typeof this.collectDailyReward !== "function") return;

        if (wrapper.dataset.collecting === "1") return;
        wrapper.dataset.collecting = "1";

        try {
            // If tooltip was open, close it after collect
            try { this._closeChestTooltip?.(); } catch { }

            this.collectDailyReward();
            updateState();
        } finally {
            delete wrapper.dataset.collecting;
        }
    };

    // 5) Bind the fresh handler
    wrapper.addEventListener("click", h.onActivate);

    // 6) Always refresh aria-label state
    updateState();
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



    // Toast enfant (si container), sinon toast positionné
    toast.className =
        (container ? "" : "tyf-toast--floating ") +
        "tyf-toast tyf-toast--success";


    const amount = Number(points) || 0;
    const label = amount === 1 ? "French Point" : "French Points";
    toast.textContent = `+${amount} ${label}!`;

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
UIFeatures.prototype.stopConversionTimer = function () {
    if (this.paywallTimer) {
        clearInterval(this.paywallTimer);
        this.paywallTimer = null;
    }
};



UIFeatures.prototype.startConversionTimer = function () {
    if (this.paywallTimer) return; // guard
    if (this.storageManager.isPremiumUser?.()) return;

    this.paywallTimer = setInterval(() => {
        if (document.hidden) return;

        // Jamais avant un premier résultat (valeur perçue)
        const completed = Number(this.storageManager.getCompletedQuizzesCount?.() ?? 0);
        if (!Number.isFinite(completed) || completed < 1) return;

        // Anti-spam UI (10 min)
        if (this._lastPaywallAt && (Date.now() - this._lastPaywallAt) < 10 * 60 * 1000) return;

        if (this.storageManager.shouldTriggerPaywall?.()) {
            this._lastPaywallAt = Date.now();
            this.showSophiePaywall();
            this.storageManager.markPaywallShown?.("timer");
        }
    }, 30000);
};



UIFeatures.prototype.showSophiePaywall = function () {
    if (this.storageManager.isPremiumUser?.()) return;
    if (document.getElementById("sophie-paywall-modal")) return;

    const modal = this.createPaywallModal();
    if (!modal) return;

    // ✅ The paywall must be attached to the DOM
    document.body.appendChild(modal);

    // ✅ Focus trap owned by this modal (like the others)
    this._applyFocusTrap?.(modal);

    setTimeout(() => {
        try {
            const buyBtn = modal.querySelector("#paywall-buy-btn");
            const closeBtn = modal.querySelector('[data-action="close"]');
            (buyBtn || closeBtn || modal).focus?.();
        } catch { }
    }, 0);
};





UIFeatures.prototype.createPaywallModal = function () {
    const modal = document.createElement("div");
    modal.id = "sophie-paywall-modal";
    modal.className = "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "sophie-paywall-title");

    const sessionMinutes = Math.max(0, Math.round(Number(this.storageManager.getSessionDuration?.()) || 0));
    const currentFP = Number(this.storageManager.getFrenchPoints?.()) || 0;
    const nextCost =
        Number(this.storageManager.getNextThemeUnlockCost?.()) ||
        Number(this.storageManager.getUnlockCost?.(this.storageManager.getUnlockedPremiumThemesCount?.() || 0)) ||
        0;
    const daily =
        Number(this.storageManager.getDailyRewardPoints?.()) ||
        1;

    const rawWaitDays = Math.ceil((nextCost - currentFP) / Math.max(1, daily));
    const waitDays = Math.max(0, rawWaitDays);

    // Label safe pour UI (évite 0 days)
    const waitDaysLabel = waitDays <= 0 ? "" : `${waitDays} days`;

    modal.innerHTML = this.generateSophiePaywallHTML(sessionMinutes, waitDays, waitDaysLabel);
    this.setupPaywallEvents(modal);

    return modal;
};


UIFeatures.prototype.setupPaywallEvents = function (modal) {
    const previouslyFocused = document.activeElement;

    const cleanup = () => {
        try { document.removeEventListener("keydown", onEsc); } catch { }
        try { this._removeFocusTrap?.(modal); } catch { }
    };

    const close = (reason) => {
        try {
            this.storageManager?.track?.("paywall_close", {
                source: "sophie_modal",
                reason: reason || "unknown"
            });
        } catch { }

        cleanup();
        try { modal.remove(); } catch { }
        try { previouslyFocused?.focus?.(); } catch { }
    };

    const onEsc = (e) => { if (e.key === "Escape") close("escape"); };

    modal.querySelectorAll('[data-action="close"]').forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = btn.id || "";
            const label = (btn.textContent || "").trim();
            close(
                id === "paywall-continue-free-btn"
                    ? "continue_free"
                    : (label === "×" ? "close_x" : "close_btn")
            );
        });
    });

    modal.addEventListener("click", (e) => { if (e.target === modal) close("overlay"); });

    document.addEventListener("keydown", onEsc);
    modal._tyfEscHandler = onEsc;

    const buyBtn = modal.querySelector("#paywall-buy-btn");
    if (buyBtn) {
        buyBtn.addEventListener("click", () => {
            try { this.storageManager?.track?.("paywall_click_buy", { source: "sophie_modal" }); } catch { }
            const url = window?.TYF_CONFIG?.stripePaymentUrl;
            if (url) window.location.href = url;
        });
    }

    const codeBtn = modal.querySelector("#paywall-code-btn");
    if (codeBtn) {
        codeBtn.addEventListener("click", () => {
            try { this.storageManager?.track?.("paywall_click_code", { source: "sophie_modal" }); } catch { }
            close("code");
            this.showPremiumCodeModal?.();
        });
    }
};


UIFeatures.prototype.generateSophiePaywallHTML = function (sessionMinutes, waitDays, waitDaysLabel) {
    const freePaceLine = waitDaysLabel
        ? `• Free pace: about ${waitDaysLabel} to unlock the next theme`
        : `• Free pace: keep playing for free`;

    const continueFreeText = waitDaysLabel
        ? `Keep playing free (about ${waitDaysLabel})`
        : `Keep playing free`;


    return `
    <div class="bg-white rounded-2xl p-8 max-w-md mx-4 text-center relative">
      <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600" aria-label="Close" data-action="close">×</button>

      <div class="text-5xl mb-4">📊</div>
      <h2 id="sophie-paywall-title" class="text-xl font-bold text-gray-800 mb-4">Want to assess all French domains?</h2>

      <div class="bg-orange-50 rounded-lg p-4 mb-6 text-left">
        <div class="text-orange-800 text-sm space-y-2">
          <div>⏱ <strong>You've already invested ${sessionMinutes} minutes</strong></div>
          <div>${freePaceLine}</div>
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

      <div class="text-sm text-gray-500 mb-1">
  Launch price: <strong>${UIFeatures.PRICE_DISPLAY.current}</strong>
  <span class="ml-1">(regular <span class="line-through">${UIFeatures.PRICE_DISPLAY.regular}</span>)</span>
</div>

<div class="text-3xl font-bold text-blue-600 mb-2">${UIFeatures.PRICE_DISPLAY.current} one-time</div>
<div class="text-sm text-gray-600 mb-6">Your time is worth more than 40 cents per day</div>


    <button
  id="paywall-buy-btn"
  class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors mb-3">
  Unlock all themes – ${UIFeatures.PRICE_DISPLAY.current}
</button>


<button
  id="paywall-code-btn"
  class="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-medium py-3 px-6 rounded-lg transition-colors mb-3">
  I have a premium code
</button>

<button
  id="paywall-continue-free-btn"
  data-action="close"
  class="tyf-btn-secondary w-full">
  Continue for free
</button>



    </div>
  `;
};


//================================================================================
// RESULTS-LEVEL FP HANDLING
//================================================================================

// (ne PAS redéfinir initializeXPSystem ici)
// on garde la version unique déjà définie plus haut.

// showFPGain reste ici, OK.





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
        optionsContainer.setAttribute("role", "radiogroup");

        // Mode 2: l’utilisateur doit pouvoir changer d’avis après validation.
        // Donc: PAS de aria-disabled, et on garde des options focusables.
        options.forEach((o, i) => {
            o.setAttribute("role", "radio");
            o.setAttribute("aria-checked", i === Number(selectedIndex) ? "true" : "false");

            // KISS a11y: seule l’option sélectionnée est tab-focusable
            o.setAttribute("tabindex", i === Number(selectedIndex) ? "0" : "-1");
        });
    }



    container.innerHTML = this.generateSimpleFeedback(isCorrect, question);
    container.classList.remove("hidden");

    // Compact + predictable sizing (avoid class accumulation across renders)
    container.classList.remove("w-full", "max-w-md", "mx-auto", "mt-6", "px-3");
    container.classList.add("w-full", "max-w-md", "mx-auto", "mt-4", "px-3");

    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    container.tabIndex = -1;
    requestAnimationFrame(() => container.focus({ preventScroll: true }));

};

UIFeatures.prototype.generateSimpleFeedback = function (isCorrect, question) {
    const hasOptions = Array.isArray(question?.options);
    const validIdx =
        Number.isInteger(question?.correctIndex) &&
        hasOptions &&
        question.correctIndex >= 0 &&
        question.correctIndex < question.options.length;

    const strip = (s) => String(s).replace(/^\s*[A-D]\s*[\.)]\s*/i, "").trim();
    const rawCorrect = validIdx ? String(question.options[question.correctIndex]) : "-";
    const safeCorrect = this.escapeHTML(strip(rawCorrect));

    const safeExplanation =
        typeof question?.explanation === "string"
            ? this.escapeHTML(question.explanation)
            : "";

    const explanationBlock = safeExplanation
        ? (
            `<div class="mt-2 text-sm ${isCorrect ? "text-green-900/90" : "text-red-900/90"} text-left">` +
            `<span class="mr-1" aria-hidden="true">💡</span>${safeExplanation}` +
            `</div>`
        )
        : "";

    if (isCorrect) {
        return (
            `<div class="feedback-content correct text-center rounded-xl border border-green-200 bg-green-50 text-green-900 px-4 py-3">` +
            `<div class="text-xl mb-1">✅</div>` +
            `<div class="text-base font-bold mb-1">Correct.</div>` +
            explanationBlock +
            `</div>`
        );
    }

    return (
        `<div class="feedback-content incorrect text-center rounded-xl border border-red-200 bg-red-50 text-red-900 px-4 py-3">` +
        `<div class="text-xl mb-1">✗</div>` +
        `<div class="text-base font-bold mb-1">Not quite.</div>` +
        `<div class="text-sm text-red-900/90 mb-1">Correct answer: <strong>${safeCorrect}</strong></div>` +
        explanationBlock +
        `</div>`
    );
};



//================================================================================
// THEME HANDLING
//================================================================================

UIFeatures.prototype.handleThemeClick = function (theme) {
    if (!theme || !theme.id) return;

    const goTheme = () => {
        if (this.uiCore?.quizManager) this.uiCore.quizManager.currentThemeId = theme.id;
        this.uiCore?.showQuizSelection?.();
    };

    // Accessible
    if (this.storageManager?.isThemeUnlocked?.(theme.id) || this.storageManager?.isPremiumUser?.()) {
        goTheme();
        return;
    }

    // Ask StorageManager if unlock is possible (FP gating / prerequisites)
    const unlockStatus =
        (typeof this.storageManager?.canUnlockTheme === "function")
            ? this.storageManager.canUnlockTheme(theme.id)
            : null;

    // If unlockable with FP AND an unlock method exists, show a modal that offers FP unlock
    const canUnlockWithFP =
        unlockStatus && (unlockStatus.canUnlock === true || unlockStatus.allowed === true || unlockStatus.ok === true);

    const hasUnlockMethod =
        (typeof this.storageManager?.unlockTheme === "function");


    if (canUnlockWithFP && hasUnlockMethod) {
        this.showThemePreviewModal?.(theme, { mode: "fp", unlockStatus });
        return;
    }

    // Not enough FP (or blocked): show preview with correct message
    if (unlockStatus?.reason === "INSUFFICIENT_FP") {
        this.showThemePreviewModal?.(theme, { mode: "insufficient_fp", unlockStatus });
        return;
    }

    if (unlockStatus?.reason === "PREVIOUS_LOCKED") {
        this.showFeedbackMessage?.("warn", "Unlock the previous theme first.");
        return;
    }


    if (unlockStatus?.reason === "LOCKED" || unlockStatus?.reason === "PREREQUISITE") {
        this.showFeedbackMessage?.("warn", "Keep progressing to unlock this theme.");
        return;
    }

    // Default: premium preview
    this.showThemePreviewModal?.(theme, { mode: "premium", unlockStatus });
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
            if (isUnlocked(q.id) && !isCompleted(q.id)) return { themeId, quizId: q.id };
        }
    }

    for (let i = 0; i < quizzes.length; i++) {
        const q = quizzes[i];
        if (isUnlocked(q.id) && !isCompleted(q.id)) return { themeId, quizId: q.id };
    }

    return null;
};

UIFeatures.prototype.showThemePreviewModal = function (theme, opts) {
    // Guard: single instance
    try {
        const existing = document.getElementById("theme-preview-modal");
        if (existing) existing.remove();
    } catch { }

    const modal = this.createThemePreviewModal?.(theme, opts);
    if (!modal) return;

    document.body.appendChild(modal);

    // Focus trap is owned here (single source of truth)
    this._applyFocusTrap?.(modal);

    // Put focus inside (first actionable)
    setTimeout(() => {
        try {
            const primary =
                modal.querySelector("#fp-unlock-btn:not([disabled])")
                || modal.querySelector("#premium-buy-btn")
                || modal.querySelector("#premium-code-btn")
                || modal.querySelector('[data-action="close"]')
                || modal;
            primary?.focus?.();
        } catch { }
    }, 0);
};



//================================================================================
// DAILY REWARD
//================================================================================

UIFeatures.prototype.setupDailyReward = function () {
    if (window.TYF_CONFIG?.debug?.enabled) {
        console.debug('[TYF] Daily reward system: chest icon in header');
    }
};

UIFeatures.prototype.collectDailyReward = function () {
    if (typeof this.storageManager?.collectDailyReward !== "function") return { success: false };

    const result = this.storageManager.collectDailyReward();

    if (result && result.success) {
        this._lastDailyRewardAtCache = Date.now();

        // Fermer tooltip (évite texte "Available now" qui reste affiché)
        try { this._closeChestTooltip?.(); } catch { }

        const amount = Number(result.earned ?? result.fpEarned ?? result.pointsEarned ?? 0);

        if (amount > 0) this.showDailyRewardAnimation(amount);

        // Refresh header + état aria + handlers
        try { this.updateXPHeader(); } catch { }
        try { this.addChestIconToHeader(); } catch { }
        try { this.setupChestTooltip(); } catch { }
    }

    return result;
};



//================================================================================
// PAYWALL HELPERS
//================================================================================

UIFeatures.prototype.handlePurchase = function () {
    const stripeUrl = window.TYF_CONFIG?.stripePaymentUrl || "https://buy.stripe.com/your-payment-link";
    window.location.href = stripeUrl;
    try {
        if (window.gtag) {
            gtag('event', 'stripe_clicked', {
                session_duration: this.storageManager.getSessionDuration?.(),
                premium_assessments_completed: this.storageManager.getPremiumQuizCompleted?.()
            });
        }
    } catch { /* no-op */ }
};


//================================================================================
// COMPLETION MESSAGES
//================================================================================

UIFeatures.prototype.getCompletionMessage = function (percentage, fpEarned) {
    let message = "";
    const pct = Number(percentage) || 0;
    const score = Math.round(pct * 20 / 100);
    const isMobile = window.innerWidth < 640;

    // 1) Résultat : simple, lisible, sans marketing
    if (pct >= 90) {
        message = isMobile ? `Excellent! (${score}/20)` : `Excellent. Near-native level (${score}/20)`;
        if (pct < 100) {
            message += isMobile
                ? `\nTry once more for 100%.`
                : `\nOne more try for a perfect score.`;
        }
    } else if (pct >= 70) {
        message = isMobile ? `Very good! (${score}/20)` : `Very good. Solid progress (${score}/20)`;
    } else if (pct >= 50) {
        message = isMobile ? `Good job! (${score}/20)` : `Good job. Keep going (${score}/20)`;
    } else {
        message = isMobile ? `Good start! (${score}/20)` : `Good start. This builds real listening skills (${score}/20)`;
    }

    // 2) Récompense : seulement ce qui est connu
    const earned = Number(fpEarned) || 0;
    if (earned > 0) message += `\n+${earned} French Points earned`;

    // 3) Streak (optionnel) : uniquement si Storage expose une valeur fiable
    let streakDay = null;
    try {
        if (typeof this.storageManager?.getStreakDay === "function") streakDay = Number(this.storageManager.getStreakDay());
        else if (typeof this.storageManager?.getDailyStreak === "function") streakDay = Number(this.storageManager.getDailyStreak());
    } catch { streakDay = null; }

    if (Number.isFinite(streakDay) && streakDay > 0) {
        message += `\nStreak: day ${streakDay}`;
    }

    // 4) Projection légère (pas de Premium ici)
    message += isMobile ? `\nCome back tomorrow.` : `\nCome back tomorrow for your daily chest.`;

    return message;
};



//================================================================================
// THEME PREVIEW MODAL
//================================================================================

UIFeatures.prototype.createThemePreviewModal = function (theme, opts) {
    const mode = opts?.mode || "premium";
    const unlockStatus = opts?.unlockStatus || null;

    const modal = document.createElement("div");
    modal.id = "theme-preview-modal";
    modal.className = "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "theme-preview-title");

    // Best-effort cost display (don’t invent logic: only show if we can derive a number)
    const currentFP = Number(this.storageManager?.getFrenchPoints?.() ?? 0);
    const safeFP = Number.isFinite(currentFP) && currentFP >= 0 ? currentFP : 0;

    const costCandidate =
        Number(unlockStatus?.cost) ||
        Number(unlockStatus?.requiredFP) ||
        Number(unlockStatus?.requiredPoints) ||
        Number(this.storageManager?.getThemeCost?.(theme?.id)) ||
        NaN;



    const hasCost = Number.isFinite(costCandidate) && costCandidate > 0;
    const costText = hasCost ? `${costCandidate} French Points` : "";

    const headerLine =
        mode === "fp"
            ? `You can unlock this theme with French Points.`
            : (mode === "insufficient_fp"
                ? `Not enough French Points yet.`
                : `This theme is part of Premium access.`);

    const fpLine =
        mode === "fp"
            ? (hasCost ? `Cost: ${costText}. You have ${safeFP}.` : `Use French Points to unlock.`)
            : (mode === "insufficient_fp"
                ? (hasCost ? `Cost: ${costText}. You have ${safeFP}.` : `Keep earning French Points.`)
                : "");

    const canUnlockFp =
        !!unlockStatus && (unlockStatus.canUnlock === true || unlockStatus.allowed === true || unlockStatus.ok === true);

    const showFPButton =
        (mode === "fp" || mode === "insufficient_fp")
        && canUnlockFp
        && (typeof this.storageManager?.unlockTheme === "function");

    const fpDisabled = (mode === "insufficient_fp");

    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-8 max-w-md mx-4 text-center relative">
            <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600" data-action="close">
                <span aria-hidden="true" class="text-lg">✕</span>
            </button>

            <div class="text-4xl mb-4">${theme.icon || "🔒"}</div>

            <h2 id="theme-preview-title" class="text-xl font-bold text-gray-800 mb-3">
                Unlock ${theme.name || "this theme"}?
            </h2>

            <p class="text-gray-600 mb-2">${headerLine}</p>
            ${fpLine ? `<p class="text-sm text-gray-500 mb-4">${fpLine}</p>` : ""}

            <div class="text-sm text-gray-500 mb-6">
                Launch price: <strong>${UIFeatures.PRICE_DISPLAY.current}</strong>
                (regular <span class="line-through">${UIFeatures.PRICE_DISPLAY.regular}</span>)
            </div>

                        <div class="space-y-3">
                ${showFPButton ? `
                <button
                    id="fp-unlock-btn"
                    class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg ${fpDisabled ? "opacity-50 cursor-not-allowed" : ""}"
                    ${fpDisabled ? "disabled" : ""}>
                    Unlock with French Points${hasCost ? ` – ${costCandidate} FP` : ""}
                </button>` : ""}

                <button
                    id="premium-code-btn"
                    class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg">
                    Enter premium code
                </button>

                <button
                    id="premium-buy-btn"
                    class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg">
                    Unlock all themes – ${UIFeatures.PRICE_DISPLAY.current}
                </button>

                <button
                    id="colors-first-btn"
                    class="w-full text-gray-600 hover:text-gray-800 py-2">
                    Continue with free Colors theme
                </button>
            </div>
        </div>`;


    this.setupThemePreviewEvents(modal, theme, { mode, unlockStatus });
    return modal;
};



UIFeatures.prototype.setupThemePreviewEvents = function (modal, theme, opts) {
    const previouslyFocused = document.activeElement;

    const onEsc = (e) => {
        if (e.key === "Escape") close();
    };

    const cleanup = () => {
        document.removeEventListener("keydown", onEsc);
        // Focus trap is owned here on close (but applied in showThemePreviewModal)
        try { this._removeFocusTrap?.(modal); } catch { }
    };

    const close = () => {
        cleanup();
        try { modal.remove(); } catch { }
        try { previouslyFocused?.focus?.(); } catch { }
    };

    modal.querySelectorAll('[data-action="close"], [data-action="cancel"]').forEach(btn =>
        btn.addEventListener("click", close)
    );
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    document.addEventListener("keydown", onEsc);
    modal._tyfEscHandler = onEsc;

    // FP unlock button
    const fpBtn = modal.querySelector("#fp-unlock-btn");
    if (fpBtn) {
        fpBtn.addEventListener("click", () => {
            if (fpBtn.disabled) return;

            let result = { success: false };
            try {
                if (typeof this.storageManager?.unlockTheme === "function") {
                    result = this.storageManager.unlockTheme(theme.id);
                }
            } catch { result = { success: false }; }

            if (result && result.success) {
                this.showFeedbackMessage?.("success", "Theme unlocked.");
                try { this.updateXPHeader?.(); } catch { }
                close();

                if (this.uiCore?.quizManager) this.uiCore.quizManager.currentThemeId = theme.id;
                this.uiCore?.showQuizSelection?.();
                return;
            }

            const r = result?.reason;
            if (r === "PREVIOUS_LOCKED") this.showFeedbackMessage?.("warn", "Unlock the previous theme first.");
            else if (r === "INSUFFICIENT_FP") this.showFeedbackMessage?.("warn", "Not enough French Points yet.");
            else this.showFeedbackMessage?.("warn", "Locked for now.");
        });
    }


    const codeBtn = modal.querySelector("#premium-code-btn");
    if (codeBtn) codeBtn.addEventListener("click", () => { close(); this.showPremiumCodeModal?.(); });


    const buyBtn = modal.querySelector("#premium-buy-btn");
    if (buyBtn) buyBtn.addEventListener("click", () => {
        const url = window?.TYF_CONFIG?.stripePaymentUrl;
        if (url) window.location.href = url;
    });

    const colorsBtn = modal.querySelector("#colors-first-btn");
    if (colorsBtn) colorsBtn.addEventListener("click", () => {
        close();
        if (this.uiCore?.quizManager) this.uiCore.quizManager.currentThemeId = 1;
        this.uiCore?.showQuizSelection?.();
    });
};



//================================================================================
// PREMIUM CODE MODAL
//================================================================================

UIFeatures.prototype.showPremiumCodeModal = function () {
    const existingModal = document.getElementById("premium-code-modal");
    if (existingModal) {
        try { existingModal.querySelector("#premium-code-input")?.focus?.(); } catch { }
        return;
    }

    const modal = document.createElement('div');
    modal.id = "premium-code-modal";
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
    <div class="bg-white rounded-2xl p-8 max-w-sm mx-4 text-center relative" role="dialog" aria-modal="true" aria-labelledby="premium-code-title">
      <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600" aria-label="Close" data-action="close">
        <span aria-hidden="true" class="text-lg">✕</span>
      </button>
     <h2 id="premium-code-title" class="text-xl font-bold text-gray-800 mb-4">Enter Premium Code</h2>
      <div class="mb-4">
      <input
  id="premium-code-input"
  type="text"
  inputmode="text"
  autocomplete="off"
  autocapitalize="characters"
  spellcheck="false"
  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
  placeholder="Enter your code">

      </div>
      <div class="space-y-3">
        <button id="validate-code-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg">Validate Code</button>
        <button id="buy-premium-btn" class="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-medium py-3 px-6 rounded-lg">Buy Premium</button>
        <button data-action="cancel" class="w-full text-gray-600 hover:text-gray-800 py-2">Cancel</button>
      </div>
    </div>`;

    const previouslyFocused = document.activeElement;

    // Define first to avoid TDZ crash if user closes instantly
    const onEsc = (e) => { if (e.key === 'Escape') close(); };

    const cleanup = () => {
        try { document.removeEventListener('keydown', onEsc); } catch { }
        this._removeFocusTrap?.(modal);
    };

    const close = () => {
        cleanup();
        try { modal.remove(); } catch { }
        try { previouslyFocused?.focus?.(); } catch { }
    };

    document.body.appendChild(modal);

    // ✅ Focus trap (après insertion DOM)
    this._applyFocusTrap?.(modal);

    modal.querySelectorAll('[data-action="close"], [data-action="cancel"]').forEach(btn => btn.addEventListener('click', close));
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    document.addEventListener('keydown', onEsc);

    // ✅ store for destroy() emergency cleanup
    modal._tyfEscHandler = onEsc;

    const input = modal.querySelector('#premium-code-input');

    try {
        const saved = localStorage.getItem("tyf:vanityCode");
        if (input && saved && !input.value) input.value = saved;
    } catch { }

    // Ne pas persister le code tant qu'il n'est pas validé
    // (tu peux garder le préfill si tu veux, mais pas l'auto-save)

    // if (input) {
    //     input.addEventListener("input", () => {
    //         try { localStorage.setItem("tyf:vanityCode", input.value.trim()); } catch { }
    //     });
    // }

    const validateBtn = modal.querySelector('#validate-code-btn');
    if (validateBtn && input) {
        validateBtn.addEventListener('click', () => {
            const code = input.value.trim();

            const result = this.storageManager?.unlockPremiumWithCode
                ? this.storageManager.unlockPremiumWithCode(code)
                : { success: false };

            if (result && result.success) {
                // Fermer la modal immédiatement.
                // Le handler global "premium-unlocked" s’occupe du reste.
                close();
                return;
            }

            // Invalid code
            input.classList.add("tyf-input-error");
            input.value = "";
            input.placeholder = "Invalid code - try again";

            const clearError = () => {
                input.classList.remove("tyf-input-error");
                input.removeEventListener("input", clearError);
            };
            input.addEventListener("input", clearError);
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
    if (this.storageManager?.isUserIdentified?.()) return;
    if (!this.storageManager?.shouldShowProfileModal?.()) return;

    // ✅ Guard: avoid duplicates
    if (document.getElementById("user-profile-modal")) return;

    const modal = this.createUserProfileModal?.();

    if (!modal) {
        this.showFeedbackMessage?.("warn", "Profile modal unavailable.");
        return;
    }

    document.body.appendChild(modal);

    // ✅ Focus trap (après insertion DOM)
    this._applyFocusTrap?.(modal);

    setTimeout(() => {
        const firstInput = modal.querySelector('#user-email');
        if (firstInput) firstInput.focus();
    }, 300);
};


UIFeatures.prototype.closeUserProfileModal = function (modal) {
    // ✅ cleanup escape handler si présent (évite fuite + double handlers)
    try {
        if (modal && modal._tyfProfileEscapeHandler) {
            document.removeEventListener('keydown', modal._tyfProfileEscapeHandler);
            modal._tyfProfileEscapeHandler = null;
        }
    } catch { }

    // ✅ remove focus trap
    try { this._removeFocusTrap?.(modal); } catch { }

    modal.classList.add('animate-fade-out');
    setTimeout(() => {
        try { modal.remove(); } catch { }
    }, 300);
};


UIFeatures.prototype.generateUserProfileHTML = function () {
    const completedAssessments = Number(this.storageManager?.getCompletedQuizzesCount?.() ?? 0);
    const quizLabel = completedAssessments === 1 ? "quiz" : "quizzes";

    return `
        <div class="bg-white rounded-2xl p-8 max-w-sm mx-4 text-center relative animate-fade-in">
            <div class="text-4xl mb-4">🎉</div>
            <h2 id="profile-modal-title" class="text-xl font-bold text-gray-800 mb-3">
                Excellent progress!
            </h2>
            <p class="text-gray-600 mb-6">
                You've completed ${completedAssessments} authentic ${quizLabel}! Save your progress to keep going.
            </p>
            
            <div class="space-y-4 mb-6">
                <div>
                    <label for="user-email" class="block text-sm font-medium text-gray-700 mb-2">
                        Email
                    </label>
                    <input
                        type="email"
                        id="user-email"
                        autocomplete="email"
                        inputmode="email"
                        placeholder="julie@example.com"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                </div>

                <div>
                    <label for="user-firstname" class="block text-sm font-medium text-gray-700 mb-2">
                        First Name
                    </label>
                    <input
                        type="text"
                        id="user-firstname"
                        autocomplete="given-name"
                        placeholder="Julie"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
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

    if (!emailInput || !firstNameInput || !saveBtn || !skipBtn) return;

    const validateInputs = () => {
        const email = (emailInput.value || "").trim();
        const firstName = (firstNameInput.value || "").trim();
        const isValid = /^\S+@\S+\.\S+$/.test(email) && firstName.length >= 2;


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

        const canSave = typeof this.storageManager?.setUserProfile === "function";
        if (!canSave) {
            this.showFeedbackMessage('error', '❌ Error saving profile');
            return;
        }

        if (this.storageManager.setUserProfile(email, firstName)) {
            this.showFeedbackMessage('success', `👋 Hi ${firstName}! Your progress is saved`);
            this.closeUserProfileModal(modal);
        } else {
            this.showFeedbackMessage('error', '❌ Error saving profile');
        }

    });

    skipBtn.addEventListener('click', () => {
        try { this.storageManager?.markProfileModalRefused?.(); } catch { }
        this.closeUserProfileModal(modal);

    });

    const escapeHandler = (e) => {
        if (e.key !== 'Escape') return;
        try { this.storageManager?.markProfileModalRefused?.(); } catch { }
        this.closeUserProfileModal(modal);
        document.removeEventListener('keydown', escapeHandler);
    };



    document.addEventListener('keydown', escapeHandler);

    // ✅ remove on close too
    modal._tyfProfileEscapeHandler = escapeHandler;


    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !saveBtn.disabled) {
            saveBtn.click();
        }
    });
};

UIFeatures.prototype.createUserProfileModal = function () {
    const modal = document.createElement("div");
    modal.id = "user-profile-modal";
    modal.className = "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "profile-modal-title");

    modal.innerHTML = this.generateUserProfileHTML();

    // CRITIQUE: sinon boutons/validation ne marchent pas
    this.setupUserProfileEvents(modal);

    // Click outside = skip/refuse
    modal.addEventListener("click", (e) => {
        if (e.target !== modal) return;
        try { this.storageManager?.markProfileModalRefused?.(); } catch { }
        this.closeUserProfileModal(modal);
    });

    return modal;
};




UIFeatures.prototype.updateUserGreeting = function () {
    const userGreeting = document.getElementById('user-greeting');
    if (!userGreeting) return;

    const displayName =
        (typeof this.storageManager.getUserDisplayName === "function")
            ? this.storageManager.getUserDisplayName()
            : "";

    userGreeting.textContent = displayName ? `Hi ${displayName}!` : "Hi!";
};


// (SUPPRIMÉ) NOTIFICATIONS: code mort en MVP v3.0.
// On garde l'UI du coffre (tooltip + click collect) uniquement.





//================================================================================
// UTILITIES
//================================================================================


UIFeatures.prototype._getFocusableIn = function (root) {
    if (!root) return [];
    const selectors = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    return Array.from(root.querySelectorAll(selectors))
        .filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
};

UIFeatures.prototype._applyFocusTrap = function (modal) {
    if (!modal) return;
    if (modal.dataset.focusTrapBound === "1") return;
    modal.dataset.focusTrapBound = "1";

    const getFocusables = () => this._getFocusableIn(modal);

    const onKeyDown = (e) => {
        if (e.key !== "Tab") return;

        const focusables = getFocusables();
        if (!focusables.length) {
            e.preventDefault();
            return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        // Shift+Tab on first => go to last
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
            return;
        }

        // Tab on last => go to first
        if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
            return;
        }
    };

    // Store handler ref on the node for clean removal
    modal._tyfTrapHandler = onKeyDown;
    modal.addEventListener("keydown", onKeyDown);

    // Ensure something inside is focused
    setTimeout(() => {
        try {
            const focusables = getFocusables();
            (focusables[0] || modal).focus?.();
        } catch { }
    }, 0);
};

UIFeatures.prototype._removeFocusTrap = function (modal) {
    if (!modal) return;
    const h = modal._tyfTrapHandler;
    if (h) {
        modal.removeEventListener("keydown", h);
        modal._tyfTrapHandler = null;
    }
    delete modal.dataset.focusTrapBound;
};

UIFeatures.prototype.formatDuration = function (ms) {
    // Return empty string when already due (prevents "in now")
    if (!Number.isFinite(ms) || ms <= 0) return '';
    const h = Math.floor(ms / 3600000);
    const m = Math.ceil((ms % 3600000) / 60000);
    if (h <= 0) return `${m} min`;
    if (m === 60) return `${h + 1} h`;
    return `${h} h ${m} min`;
};




UIFeatures.prototype.getChestInfo = function () {
    const points = Number(
        (typeof this.storageManager?.getTodayDailyRewardAmount === "function")
            ? this.storageManager.getTodayDailyRewardAmount()
            : 1
    ) || 1;


    // Source of truth: StorageManager (calendar-based)
    const available = (typeof this.storageManager?.isDailyRewardAvailable === "function")
        ? !!this.storageManager.isDailyRewardAvailable()
        : false;

    const nextReadyTs = (typeof this.storageManager?.getNextDailyRewardTime === "function")
        ? Number(this.storageManager.getNextDailyRewardTime())
        : 0;

    const safeNext = Number.isFinite(nextReadyTs) ? nextReadyTs : 0;
    const etaText = available ? "" : this.formatDuration(safeNext - Date.now());

    return { available, points, etaText };
};






UIFeatures.prototype.setupChestTooltip = function () {
    const trigger = document.getElementById("daily-chest-wrapper");
    if (!trigger) return;

    // ✅ Auto-create tooltip nodes if missing (fix: tooltip never shows / click does nothing when locked)
    let tip = document.getElementById("daily-chest-tooltip");
    let tipText = document.getElementById("daily-chest-tooltip-text");

    if (!tip || !tipText) {
        // Remove any partial remnants
        try { tip?.remove?.(); } catch { }

        tip = document.createElement("div");
        tip.id = "daily-chest-tooltip";
        tip.className = "hidden tyf-tooltip-panel";
        tip.setAttribute("role", "tooltip");
        tip.setAttribute("aria-hidden", "true");

        tipText = document.createElement("div");
        tipText.id = "daily-chest-tooltip-text";
        tipText.className = "tyf-message"; // ton design system gère déjà pre-line

        tip.appendChild(tipText);
        document.body.appendChild(tip);
    }

    // ✅ Make trigger focusable / button-like (helps keyboard + consistent tooltip behavior)
    if (!trigger.hasAttribute("tabindex")) trigger.setAttribute("tabindex", "0");
    if (!trigger.hasAttribute("role")) trigger.setAttribute("role", "button");

    if (!this._chestTooltipHandlers) this._chestTooltipHandlers = {};
    const h = this._chestTooltipHandlers;

    // If we previously bound to a different trigger (rerender), unbind everything first
    if (h.node && h.node !== trigger) {
        try {
            h.node.removeEventListener("pointerenter", h.onPointerEnter);
            h.node.removeEventListener("pointerleave", h.onPointerLeave);
            h.node.removeEventListener("focus", h.onFocus);
            h.node.removeEventListener("blur", h.onBlur);
            h.node.removeEventListener("keydown", h.onKeydown);
            delete h.node.dataset.chestTooltipBound;
        } catch { }

        try {
            document.removeEventListener("click", h.onDocClick);
            document.removeEventListener("keydown", h.onDocKeydown);
            window.removeEventListener("resize", h.onResize);
            window.removeEventListener("scroll", h.onScroll, h._scrollOptions || false);
        } catch { }

        h.node = null;
    }

    // Rebind if rerender changed tooltip nodes
    if (trigger.dataset.chestTooltipBound === "1") {
        if (h.tip !== tip || h.tipText !== tipText) {
            try {
                trigger.removeEventListener("pointerenter", h.onPointerEnter);
                trigger.removeEventListener("pointerleave", h.onPointerLeave);
                trigger.removeEventListener("focus", h.onFocus);
                trigger.removeEventListener("blur", h.onBlur);
                trigger.removeEventListener("keydown", h.onKeydown);
            } catch { }

            try {
                document.removeEventListener("click", h.onDocClick);
                document.removeEventListener("keydown", h.onDocKeydown);
                window.removeEventListener("resize", h.onResize);
                window.removeEventListener("scroll", h.onScroll, h._scrollOptions || false);
            } catch { }

            try { delete trigger.dataset.chestTooltipBound; } catch { }
        } else {
            return;
        }
    }

    trigger.dataset.chestTooltipBound = "1";

    if (!tip.id) tip.id = "daily-chest-tooltip";
    trigger.setAttribute("aria-controls", tip.id);

    const isTouchLike = () => {
        try {
            const mqCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
            const mqNoHover = window.matchMedia && window.matchMedia("(hover: none)").matches;
            return !!(mqCoarse || mqNoHover);
        } catch {
            return false;
        }
    };

    const buildText = () => {
        const info = this.getChestInfo();
        const label = info.points === 1 ? "French Point" : "French Points";

        const etaLine = info.available
            ? "Available now. Click to collect."
            : (info.etaText ? `Available in ${info.etaText}.` : "Available tomorrow.");

        return `🎁 One chest per calendar day.\nReward: +${info.points} ${label}.\nNo accumulation.\n${etaLine}`;
    };

    // ✅ Position tooltip near the trigger (fixed tooltip)
    const position = () => {
        try {
            const r = trigger.getBoundingClientRect();
            const centerX = r.left + (r.width / 2);

            // Explicit fixed positioning
            tip.style.position = "fixed";
            tip.style.transform = "translateX(-50%)";

            // Measure tooltip box
            const tipRect = tip.getBoundingClientRect();
            const half = tipRect.width / 2;

            // Horizontal clamp (12px margin)
            const minLeft = 12 + half;
            const maxLeft = window.innerWidth - 12 - half;
            const left = Math.round(Math.min(maxLeft, Math.max(minLeft, centerX)));

            // Vertical placement: prefer below, but flip above if needed (12px margins)
            const margin = 12;
            const belowTop = Math.round(r.bottom + 8);
            const aboveTop = Math.round(r.top - 8 - tipRect.height);

            const fitsBelow = (belowTop + tipRect.height + margin) <= window.innerHeight;
            const top = fitsBelow ? belowTop : Math.max(margin, aboveTop);

            tip.style.left = `${left}px`;
            tip.style.top = `${top}px`;
            tip.style.transform = "translateX(-50%)";
        } catch { }
    };

    const open = () => {
        tipText.textContent = buildText();

        // Make it measurable without flashing
        tip.classList.remove("hidden");
        tip.style.visibility = "hidden";

        // ✅ Force layout so getBoundingClientRect() is reliable (prevents 0 width/height first open)
        void tip.offsetWidth;

        position();

        // Now show it for real
        tip.style.visibility = "";
        tip.setAttribute("aria-hidden", "false");
        trigger.setAttribute("aria-expanded", "true");
    };

    const close = () => {
        tip.style.visibility = "";
        tip.classList.add("hidden");
        tip.setAttribute("aria-hidden", "true");
        trigger.setAttribute("aria-expanded", "false");
    };

    const toggle = () => (tip.classList.contains("hidden") ? open() : close());

    this._openChestTooltip = () => open();
    this._closeChestTooltip = () => close();
    this._toggleChestTooltip = () => toggle();

    h.onPointerEnter = () => { if (!isTouchLike()) open(); };
    h.onPointerLeave = () => { if (!isTouchLike()) close(); };
    h.onFocus = () => { if (!isTouchLike()) open(); };
    h.onBlur = () => { if (!isTouchLike()) close(); };

    h.onDocClick = (e) => {
        if (!isTouchLike()) return;
        if (trigger.contains(e.target) || tip.contains(e.target)) return;
        close();
    };

    h.onDocKeydown = (e) => { if (e.key === "Escape") close(); };
    h.onResize = () => { close(); };
    h.onScroll = () => { close(); };

    trigger.addEventListener("pointerenter", h.onPointerEnter);
    trigger.addEventListener("pointerleave", h.onPointerLeave);
    trigger.addEventListener("focus", h.onFocus);
    trigger.addEventListener("blur", h.onBlur);

    h.onKeydown = (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();

        const availableNow =
            (typeof this.storageManager?.isDailyRewardAvailable === "function")
                ? !!this.storageManager.isDailyRewardAvailable()
                : !!this.getChestInfo?.().available;

        if (availableNow && typeof this.collectDailyReward === "function") {
            try { this._closeChestTooltip?.(); } catch { }
            this.collectDailyReward();
            try { this.updateXPHeader?.(); } catch { }
            return;
        }

        this._toggleChestTooltip?.();
    };

    trigger.addEventListener("keydown", h.onKeydown);

    document.addEventListener("click", h.onDocClick);
    document.addEventListener("keydown", h.onDocKeydown);
    window.addEventListener("resize", h.onResize);

    h._scrollOptions = { passive: true };
    window.addEventListener("scroll", h.onScroll, h._scrollOptions);

    close();

    h.tip = tip;
    h.tipText = tipText;
    h.node = trigger;
};


UIFeatures.prototype.getLevelNarrative = function (level) {
    if (level <= 5) {
        return {
            stage: "Survival French",
            message: "You can handle basic, predictable spoken French.",
            next: "More variety, less context."
        };
    }

    if (level <= 10) {
        return {
            stage: "Everyday French",
            message: "You follow everyday conversations without translating every word.",
            next: "Faster speech and informal expressions."
        };
    }

    if (level <= 15) {
        return {
            stage: "Fast Native Speech",
            message: "You're exposed to fast, natural French.",
            next: "Unfiltered conversations and ambiguity."
        };
    }

    return {
        stage: "Unfiltered French",
        message: "You can handle real-world French without simplification.",
        next: "Nuance, precision, edge cases."
    };
};


//================================================================================
// CLEANUP
//================================================================================
UIFeatures.prototype.destroy = function () {
    if (this.paywallTimer) {
        clearInterval(this.paywallTimer);
        this.paywallTimer = null;
    }

    // Notifications désactivées pour MVP v3.0
    // this.stopNotificationArmingLoop?.();

    // (SUPPRIMÉ) Premium button cleanup (_premiumBtnHandlers)
    // Rien à nettoyer ici: pas de handlers premium installés dans UIFeatures.

    if (this._onStorageUpdated) {
        window.removeEventListener("storage-updated", this._onStorageUpdated);
        this._onStorageUpdated = null;
    }

    if (this._onFPGained) {
        window.removeEventListener("fp-gained", this._onFPGained);
        this._onFPGained = null;
    }

    if (this._onBadgesEarned) {
        window.removeEventListener("badges-earned", this._onBadgesEarned);
        this._onBadgesEarned = null;
    }

    if (this._onLevelUp) {
        window.removeEventListener("level-up", this._onLevelUp);
        this._onLevelUp = null;
    }

    if (this._onPremiumUnlocked) {
        window.removeEventListener("premium-unlocked", this._onPremiumUnlocked);
        this._onPremiumUnlocked = null;
    }

    this._gamificationUXBound = false;

    if (this._onVisibilityChange) {
        document.removeEventListener("visibilitychange", this._onVisibilityChange);
        this._onVisibilityChange = null;
    }

    if (this._onQuizCompleted) {
        window.removeEventListener("quiz-completed", this._onQuizCompleted);
        this._onQuizCompleted = null;
    }


    // Tooltip cleanup
    const th = this._chestTooltipHandlers;
    const trigger = document.getElementById("daily-chest-wrapper");

    if (th) {
        const node = th.node || trigger;

        if (node) {
            try { node.removeEventListener("pointerenter", th.onPointerEnter); } catch { }
            try { node.removeEventListener("pointerleave", th.onPointerLeave); } catch { }
            try { node.removeEventListener("focus", th.onFocus); } catch { }
            try { node.removeEventListener("blur", th.onBlur); } catch { }
            try { node.removeEventListener("keydown", th.onKeydown); } catch { }

            try { delete node.dataset.chestTooltipBound; } catch { }
            try { node.removeAttribute("aria-controls"); } catch { }
            try { node.removeAttribute("aria-expanded"); } catch { }
        }

        try { document.removeEventListener("click", th.onDocClick); } catch { }
        try { document.removeEventListener("keydown", th.onDocKeydown); } catch { }
        try { window.removeEventListener("resize", th.onResize); } catch { }

        // remove scroll with same options
        try { window.removeEventListener("scroll", th.onScroll, th._scrollOptions || false); } catch { }

        // close tooltip visually if still present
        try { document.getElementById("daily-chest-tooltip")?.classList.add("hidden"); } catch { }

        this._chestTooltipHandlers = null;
    }

    // Disarm exposed helpers (avoid calls after destroy)
    this._openChestTooltip = null;
    this._closeChestTooltip = null;
    this._toggleChestTooltip = null;

    // Chest header cleanup
    const hh = this._chestHeaderHandlers;
    if (hh && hh.node) {
        try {
            if (hh.onActivate) hh.node.removeEventListener("click", hh.onActivate);
        } catch { }

        try { delete hh.node.dataset.chestBound; } catch { }
        try { hh.node.removeAttribute("aria-label"); } catch { }

        hh.node = null;
        hh.onActivate = null;
    }
    this._chestHeaderHandlers = null;

    // Modal cleanup (consistent: remove Esc handler + focus trap + node)
    // Modal cleanup (consistent: remove Esc handler + focus trap + node)
    const cleanupModal = (id) => {
        try {
            const m = document.getElementById(id);
            if (!m) return;

            // Esc handler (registered on document)
            try {
                if (m._tyfEscHandler) document.removeEventListener("keydown", m._tyfEscHandler);
                m._tyfEscHandler = null;
            } catch { }

            // ✅ Also remove profile modal escape handler
            try {
                if (m._tyfProfileEscapeHandler) document.removeEventListener("keydown", m._tyfProfileEscapeHandler);
                m._tyfProfileEscapeHandler = null;
            } catch { }


            // Focus trap (registered on modal)
            try { this._removeFocusTrap?.(m); } catch { }

            try { m.remove(); } catch { }
        } catch { }
    };

    cleanupModal("sophie-paywall-modal");
    cleanupModal("premium-code-modal");
    cleanupModal("theme-preview-modal");
    cleanupModal("user-profile-modal");
};


// ===================================================
// Global export (must run at file load)
// ===================================================
window.UIFeatures = UIFeatures;
