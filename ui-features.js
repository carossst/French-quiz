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
    this.setupChestTooltip();
    this.updateXPHeader();
    this.bindHeaderPremiumCodeEntry(); // ✅ DOM prêt ici
    this.setupStorageEvents();
    this.initializeNotifications();
    this.startConversionTimer(); // démarrage contrôlé ici

    // Notifications désactivées pour MVP v3.0
    // TODO v3.1: implémenter startNotificationArmingLoop si notifications push activées


    // écouter les gains FP réels (StorageManager.addFrenchPoints)
    this.setupFPEvents();
    this.setupGamificationUXEvents();
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

// Header premium button: prevent Stripe navigation when premium is already active
UIFeatures.prototype.bindHeaderPremiumCodeEntry = function () {
    const btn = document.getElementById("premium-unlock-btn");
    if (!btn) return;

    // Si on a déjà bind sur un autre node (rerender), nettoyer avant
    if (this._premiumBtnHandlers?.node && this._premiumBtnHandlers.node !== btn) {
        try {
            if (this._premiumBtnHandlers.onClick) {
                this._premiumBtnHandlers.node.removeEventListener(
                    "click",
                    this._premiumBtnHandlers.onClick
                );
            }
            delete this._premiumBtnHandlers.node.dataset.premiumBound;
        } catch { }
        this._premiumBtnHandlers = null;
    }

    if (btn.dataset.premiumBound === "1") return;
    btn.dataset.premiumBound = "1";

    if (!this._premiumBtnHandlers) this._premiumBtnHandlers = {};
    const h = this._premiumBtnHandlers;

    h.onClick = (e) => {
        const isPremium =
            (typeof this.storageManager.isPremiumUser === "function")
                ? !!this.storageManager.isPremiumUser()
                : false;

        if (!isPremium) return;
        e.preventDefault();
        e.stopPropagation?.();
    };

    h.onKeyDown = (e) => {
        const key = e.key;
        if (key !== "Enter" && key !== " ") return;

        const isPremium =
            (typeof this.storageManager.isPremiumUser === "function")
                ? !!this.storageManager.isPremiumUser()
                : false;

        if (!isPremium) return;
        e.preventDefault();
        e.stopPropagation?.();
    };

    btn.addEventListener("click", h.onClick);
    btn.addEventListener("keydown", h.onKeyDown);
    h.node = btn;

};


UIFeatures.prototype.setupGamificationUXEvents = function () {
    if (this._gamificationUXBound) return;
    this._gamificationUXBound = true;

    this._onBadgesEarned = (e) => {
        const badges = Array.isArray(e?.detail?.badges) ? e.detail.badges : [];
        if (!badges.length) return;

        // Simple feedback: one message max (avoid spam)
        const first = badges[0] || {};
        const name = first.name || "New badge";
        this.showFeedbackMessage("success", `Badge earned: ${name}`);
    };

    this._onLevelUp = (e) => {
        const lvl = e?.detail?.newLevel ?? e?.detail?.level ?? null;
        const label = (lvl !== null && lvl !== undefined) ? `Level up: ${lvl}` : "Level up";
        this.showFeedbackMessage("success", label);
        try { this.updateXPHeader(); } catch { }
    };

    this._onPremiumUnlocked = () => {
        this.showFeedbackMessage("success", "Premium unlocked");
        try { this.updateXPHeader(); } catch { }
    };

    window.addEventListener("badges-earned", this._onBadgesEarned);
    window.addEventListener("level-up", this._onLevelUp);
    window.addEventListener("premium-unlocked", this._onPremiumUnlocked);
};


UIFeatures.prototype.showXPHeader = function () {
    const xpHeader = document.getElementById("xp-header");
    if (xpHeader) xpHeader.classList.remove("hidden");
};

// Daily chest in header
UIFeatures.prototype.addChestIconToHeader = function () {
    const wrapper = document.getElementById("daily-chest-wrapper");
    if (!wrapper) return;

    // daily-chest-wrapper is a <button> by design (see index.html)

    const updateState = () => {
        const info = (typeof this.getChestInfo === "function")
            ? this.getChestInfo()
            : { available: false, points: 1, etaText: "" };

        const available = (typeof this.storageManager.isDailyRewardAvailable === "function")
            ? !!this.storageManager.isDailyRewardAvailable()
            : !!info.available;

        wrapper.style.opacity = available ? "1" : "0.5";
        wrapper.dataset.state = available ? "available" : "locked";

        const points = Number.isFinite(info.points) && info.points > 0 ? info.points : 1;
        const label = points === 1 ? "French Point" : "French Points";

        wrapper.setAttribute(
            "aria-label",
            available
                ? `Collect your daily chest (+${points} ${label})`
                : `Daily chest locked. Available tomorrow. Reward: +${points} ${label}.`
        );
    };

    if (!this._chestHeaderHandlers) this._chestHeaderHandlers = {};
    const h = this._chestHeaderHandlers;

    if (h.node && h.node !== wrapper && h.onActivate) {
        try {
            h.node.removeEventListener("click", h.onActivate);
            delete h.node.dataset.chestBound;
        } catch { }
        h.node = null;
    }

    if (wrapper.dataset.chestBound === "1") {
        updateState();
        return;
    }
    wrapper.dataset.chestBound = "1";

    h.onActivate = (event) => {
        const availableNow =
            (typeof this.storageManager.isDailyRewardAvailable === "function")
                ? !!this.storageManager.isDailyRewardAvailable()
                : !!this.getChestInfo?.().available;

        // 🔒 Coffre verrouillé → tooltip
        if (!availableNow) {
            try { this._toggleChestTooltip?.(); } catch { }
            event.preventDefault?.();
            event.stopPropagation?.();
            updateState();
            return;
        }

        // 🎁 Coffre dispo → collecte
        if (typeof this.storageManager.collectDailyReward !== "function") return;

        if (wrapper.dataset.collecting === "1") return;
        wrapper.dataset.collecting = "1";

        try {
            const result = this.storageManager.collectDailyReward();
            if (result?.success) {
                const amount = Number(result.earned ?? 0);
                if (amount > 0) this.showDailyRewardAnimation(amount);
                this.updateXPHeader();
            }
            updateState();
        } finally {
            delete wrapper.dataset.collecting;
        }
    };

    wrapper.addEventListener("click", h.onActivate);
    h.node = wrapper;

    updateState();
};




UIFeatures.prototype.updateXPHeader = function () {
    const fp = Number(this.storageManager.getFrenchPoints?.() ?? 0);
    const level = Number(this.storageManager.getUserLevel?.() ?? 1);
    const progress = this.storageManager.getLevelProgress?.() || { percentage: 0, remaining: null };

    this.setText("user-level", level);

    const fpEl = document.getElementById("user-fp");
    if (fpEl) {
        const label = fp === 1 ? "French Point" : "French Points";
        fpEl.textContent = `${fp} ${label}`;
    }


    // ✅ Update premium CTA state in header
    const premiumBtn = document.getElementById("premium-unlock-btn");
    const isPremium = (typeof this.storageManager.isPremiumUser === "function")
        ? !!this.storageManager.isPremiumUser()
        : false;

    if (premiumBtn) {
        // mémoriser le HTML initial une seule fois (baseline)
        if (!premiumBtn.dataset.defaultHtml) {
            premiumBtn.dataset.defaultHtml = premiumBtn.innerHTML;
        }

        if (isPremium) {
            // ✅ ne pas détruire le HTML initial: on remplace, mais on a la baseline
            premiumBtn.innerHTML = "💎 Premium";
            premiumBtn.setAttribute("aria-label", "Premium is active");
            premiumBtn.setAttribute("aria-disabled", "true");
            premiumBtn.style.pointerEvents = "none";
            premiumBtn.style.opacity = "0.85";
            premiumBtn.setAttribute("tabindex", "-1");
        } else {
            // ✅ restore baseline correctement
            premiumBtn.innerHTML = premiumBtn.dataset.defaultHtml;
            premiumBtn.setAttribute("aria-label", "Unlock premium access for $12 one-time payment");
            premiumBtn.removeAttribute("aria-disabled");
            premiumBtn.style.pointerEvents = "";
            premiumBtn.style.opacity = "";
            premiumBtn.removeAttribute("tabindex");
        }
    }


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
UIFeatures.prototype.startConversionTimer = function () {
    const start = () => {
        if (this.paywallTimer || document.hidden) return;

        this.paywallTimer = setInterval(() => {
            // App en arrière-plan → on ne fait rien
            if (document.hidden) return;

            // Paywall déjà affiché → on ne spam pas
            if (document.getElementById("sophie-paywall-modal")) return;

            // ✅ STOP IMMÉDIAT si Premium activé entre temps
            if (this.storageManager.isPremiumUser?.()) {
                stop();
                return;
            }

            const shouldTrigger = this.storageManager.shouldTriggerPaywall?.();

            // Sécurité : s’il reste des quiz gratuits jouables, on ne déclenche pas
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
        }, 30000); // check toutes les 30s, KISS
    };

    const stop = () => {
        if (this.paywallTimer) {
            clearInterval(this.paywallTimer);
            this.paywallTimer = null;
        }
    };

    // Pause / reprise automatique selon visibilité onglet
    if (!this._onVisibilityChange) {
        this._onVisibilityChange = () => {
            document.hidden ? stop() : start();
        };
        document.addEventListener("visibilitychange", this._onVisibilityChange);
    }

    start();
};



UIFeatures.prototype.showSophiePaywall = function () {
    if (this.storageManager.isPremiumUser?.()) return;
    if (document.getElementById("sophie-paywall-modal")) return;

    const modal = this.createPaywallModal();
    document.body.appendChild(modal);

    setTimeout(() => {
        try {
            const buyBtn = modal.querySelector("#paywall-buy-btn");
            const closeBtn = modal.querySelector('[data-action="close"]');
            (buyBtn || closeBtn || modal).focus?.();
        } catch { }
    }, 0);
};


// APRÈS — createPaywallModal()
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
        document.removeEventListener("keydown", onEsc);
        this._removeFocusTrap?.(modal);
    };

    const close = () => {
        cleanup();
        modal.remove();
        try { previouslyFocused?.focus?.(); } catch { }
    };

    modal.querySelectorAll('[data-action="close"]').forEach(btn => btn.addEventListener("click", close));
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    const onEsc = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onEsc);

    // ✅ Focus trap (Tab stays inside modal)
    this._applyFocusTrap?.(modal);

    const buyBtn = modal.querySelector("#paywall-buy-btn");
    if (buyBtn) {
        buyBtn.addEventListener("click", () => {
            const url = window?.TYF_CONFIG?.stripePaymentUrl;
            if (url) window.location.href = url;
        });
    }

    const codeBtn = modal.querySelector("#paywall-code-btn");
    if (codeBtn) {
        codeBtn.addEventListener("click", () => {
            close(); // cleanup + focus restore
            this.showPremiumCodeModal();
        });
    }

};


UIFeatures.prototype.generateSophiePaywallHTML = function (sessionMinutes, waitDays, waitDaysLabel) {
    const freePaceLine = waitDaysLabel
        ? `• At free pace: ${waitDaysLabel} waiting`
        : `• At free pace: keep playing for free`;

    const continueFreeText = waitDaysLabel
        ? `Continue free (${waitDaysLabel})`
        : `Continue free`;

    return `
    <div class="bg-white rounded-2xl p-8 max-w-md mx-4 text-center relative">
      <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600" data-action="close">×</button>

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
  data-action="close"
  class="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-4 rounded-lg transition-colors">
  ${continueFreeText}
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
        optionsContainer.setAttribute("aria-disabled", "true");
        options.forEach((o, i) => {
            o.setAttribute("tabindex", "-1");
            o.setAttribute("aria-checked", i === Number(selectedIndex) ? "true" : "false");
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

    // APRÈS (dynamique avec getChestInfo, cohérent partout)
    if (unlockStatus.reason === "INSUFFICIENT_FP") {
        const currentFP = Number(this.storageManager.getFrenchPoints?.() ?? 0);
        const needed = Number(unlockStatus.cost ?? 0) - currentFP;

        const chestInfo = this.getChestInfo?.() || { points: 1 };
        const chestPoints = Number.isFinite(chestInfo.points) && chestInfo.points > 0 ? chestInfo.points : 1;
        const chestLabel = chestPoints === 1 ? "French Point" : "French Points";

        let message = `${theme.name} needs ${unlockStatus.cost} French Points\n\n` +
            `You have: ${currentFP} French Points\n` +
            `Missing: ${needed} French Points\n\n`;

        if (needed <= 5) {
            message += `So close! Take a few more quizzes or collect tomorrow's chest (+${chestPoints} ${chestLabel}).\n\n`;
            message += `Or get instant access to all themes ($12) - click header link`;
        } else if (needed <= 15) {
            message += `A few more quizzes + your daily chest (+${chestPoints} ${chestLabel}).\n\n`;
            message += `Or get instant access to all themes ($12) - click header link\n\n`;
            message += `Daily chest: 1 per 24h (no accumulation).`;
        } else {
            message += `Or get instant access to all themes ($12) - click header link\n\n`;
            message += `Free path: quizzes + one daily chest (+${chestPoints} ${chestLabel}, no accumulation)`;
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
            if (isUnlocked(q.id) && !isCompleted(q.id)) return { themeId, quizId: q.id };
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
    if (!modal) return;
    document.body.appendChild(modal);
    this._applyFocusTrap?.(modal); // ✅ focus initial fiable
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
    const result = this.storageManager.collectDailyReward();
    if (result && result.success) {
        const amount = Number(result.earned ?? result.fpEarned ?? result.pointsEarned ?? 0);
        if (amount > 0) this.showDailyRewardAnimation(amount);
        this.updateXPHeader();
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

// Supprimé: closePaywall (inutile et dangereux car ne fait pas cleanup / focus restore)


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

    const currentFP = Number(this.storageManager.getFrenchPoints?.() ?? 0);
    const isPremium = (typeof this.storageManager.isPremiumUser === "function")
        ? !!this.storageManager.isPremiumUser()
        : false;

    if (isPremium) {
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

// APRÈS — createThemePreviewModal()
UIFeatures.prototype.createThemePreviewModal = function (theme) {
    const modal = document.createElement('div');
    modal.id = 'theme-preview-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'theme-preview-title');

    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-8 max-w-md mx-4 text-center relative">
            <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600" data-action="close">
                <span aria-hidden="true" class="text-lg">✕</span>
            </button>

            <div class="text-4xl mb-4">${theme.icon}</div>
            <h2 id="theme-preview-title" class="text-xl font-bold text-gray-800 mb-4">
  Unlock ${theme.name}?
</h2>

<p class="text-gray-600 mb-2">
  This theme is part of Premium access.
</p>

<div class="text-sm text-gray-500 mb-6">
  Launch price: <strong>${UIFeatures.PRICE_DISPLAY.current}</strong>
  (regular <span class="line-through">${UIFeatures.PRICE_DISPLAY.regular}</span>)
</div>


<div class="space-y-3">
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

    this.setupThemePreviewEvents(modal, theme);
    return modal;
};



UIFeatures.prototype.setupThemePreviewEvents = function (modal, theme) {
    const previouslyFocused = document.activeElement;

    const cleanup = () => {
        document.removeEventListener('keydown', onEsc);
        this._removeFocusTrap?.(modal);
    };

    const close = () => {
        cleanup();
        modal.remove();
        try { previouslyFocused?.focus?.(); } catch { }
    };

    modal.querySelectorAll('[data-action="close"]').forEach(btn => btn.addEventListener('click', close));
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onEsc);

    // ✅ Focus trap
    this._applyFocusTrap?.(modal);

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

    const previouslyFocused = document.activeElement;

    const cleanup = () => {
        document.removeEventListener('keydown', onEsc);
        this._removeFocusTrap?.(modal);
    };

    const close = () => {
        cleanup();
        modal.remove();
        try { previouslyFocused?.focus?.(); } catch { }
    };

    // ✅ Focus trap
    this._applyFocusTrap?.(modal);


    document.body.appendChild(modal);
    modal.querySelectorAll('[data-action="close"], [data-action="cancel"]').forEach(btn => btn.addEventListener('click', close));
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onEsc);

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

            if (result.success) {
                this.showFeedbackMessage?.("success", "🎉 Premium unlocked!");
                try { this.updateXPHeader?.(); } catch { }

                // Fermer le modal code
                close();

                // Si un paywall est ouvert, le fermer (sinon l’utilisateur reste bloqué visuellement)
                try {
                    const paywall = document.getElementById("sophie-paywall-modal");
                    if (paywall) paywall.remove();
                } catch { }

                // Rafraîchir l’écran pour refléter les thèmes désormais accessibles
                try {
                    if (this.uiCore?.showWelcomeScreen) {
                        this.uiCore.showWelcomeScreen();
                    } else if (this.uiCore?.showQuizSelection) {
                        this.uiCore.showQuizSelection();
                    } else {
                        window.location.reload();
                    }
                } catch {
                    window.location.reload();
                }

            } else {
                input.classList.add("border-red-400");
                input.value = "";
                input.placeholder = "Invalid code - try again";
                try { localStorage.removeItem("tyf:vanityCode"); } catch { }
            }

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


    const modal =
        this.createUserProfileModal?.()
        || this.uiCore?.createUserProfileModal?.();

    if (!modal) return;

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
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'profile-modal-title');

    modal.innerHTML = this.generateUserProfileHTML();
    this.setupUserProfileEvents(modal);

    return modal;
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

    if (!emailInput || !firstNameInput || !saveBtn || !skipBtn) return;

    const validateInputs = () => {
        const email = (emailInput.value || "").trim();
        const firstName = (firstNameInput.value || "").trim();
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
        this.storageManager.markProfileModalRefused();
        this.closeUserProfileModal(modal);
    });

    const escapeHandler = (e) => {
        if (e.key !== 'Escape') return;
        this.storageManager.markProfileModalRefused();
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

UIFeatures.prototype.closeUserProfileModal = function (modal) {
    // ✅ cleanup escape handler si présent (évite fuite + double handlers)
    try {
        if (modal && modal._tyfProfileEscapeHandler) {
            document.removeEventListener('keydown', modal._tyfProfileEscapeHandler);
            modal._tyfProfileEscapeHandler = null;
        }
    } catch { }

    modal.classList.add('animate-fade-out');
    setTimeout(() => {
        try { modal.remove(); } catch { }
    }, 300);
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


// APRÈS
// Helper générique: à mettre une seule fois dans ui-features.js (près des UTILITIES)
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
    if (!Number.isFinite(ms) || ms <= 0) return 'now';
    const h = Math.floor(ms / 3600000);
    const m = Math.ceil((ms % 3600000) / 60000);
    if (h <= 0) return `${m} min`;
    if (m === 60) return `${h + 1} h`;
    return `${h} h ${m} min`;
};

UIFeatures.prototype.getChestInfo = function () {
    const points = Number(this.storageManager?.getDailyRewardPoints?.());
    const safePoints = Number.isFinite(points) && points > 0 ? points : 1;

    const isSameLocalDay = (a, b) => {
        const da = new Date(a);
        const db = new Date(b);
        return da.getFullYear() === db.getFullYear()
            && da.getMonth() === db.getMonth()
            && da.getDate() === db.getDate();
    };

    // 1) Source de vérité si dispo
    const availableFromStore =
        (typeof this.storageManager?.isDailyRewardAvailable === "function")
            ? !!this.storageManager.isDailyRewardAvailable()
            : null;

    // 2) Fallback calendaire: dispo si pas collecté aujourd’hui
    const lastTs =
        Number(this.storageManager?.getLastDailyRewardTimestamp?.())
        || Number(localStorage.getItem("tyf:lastDailyRewardAt") || 0);

    const availableFallback = !lastTs ? true : !isSameLocalDay(lastTs, Date.now());
    const available = (availableFromStore !== null) ? availableFromStore : availableFallback;

    // 3) Next ready time: storage si dispo, sinon minuit local
    const nextReadyTs =
        (typeof this.storageManager?.getNextDailyRewardTime === "function")
            ? Number(this.storageManager.getNextDailyRewardTime())
            : (() => {
                const now = new Date();
                const next = new Date(now);
                next.setHours(24, 0, 0, 0);
                return next.getTime();
            })();

    const msLeft = Number.isFinite(nextReadyTs) ? (nextReadyTs - Date.now()) : 0;
    const etaText = available ? "" : this.formatDuration(msLeft);

    return { available, points: safePoints, etaText };
};




UIFeatures.prototype.setupChestTooltip = function () {
    const trigger = document.getElementById("daily-chest-wrapper");
    const tip = document.getElementById("daily-chest-tooltip");
    const tipText = document.getElementById("daily-chest-tooltip-text");

    if (!trigger || !tip || !tipText) return;

    if (!this._chestTooltipHandlers) this._chestTooltipHandlers = {};
    const h = this._chestTooltipHandlers;

    // If we previously bound to a different trigger (rerender), unbind everything first
    if (h.node && h.node !== trigger) {
        try {
            h.node.removeEventListener("pointerenter", h.onPointerEnter);
            h.node.removeEventListener("pointerleave", h.onPointerLeave);
            h.node.removeEventListener("focus", h.onFocus);
            h.node.removeEventListener("blur", h.onBlur);
            delete h.node.dataset.chestTooltipBound;
        } catch { }

        try {
            document.removeEventListener("click", h.onDocClick);
            document.removeEventListener("keydown", h.onDocKeydown);
            window.removeEventListener("resize", h.onResize);
            window.removeEventListener("scroll", h.onScroll, { passive: true });
        } catch { }

        h.node = null;
    }


    // Si déjà bind, mais tip/tipText a changé (rerender), on doit rebind
    if (trigger.dataset.chestTooltipBound === "1") {
        if (h.tip !== tip || h.tipText !== tipText) {
            // force cleanup minimal puis rebind
            try {
                trigger.removeEventListener("pointerenter", h.onPointerEnter);
                trigger.removeEventListener("pointerleave", h.onPointerLeave);
                trigger.removeEventListener("focus", h.onFocus);
                trigger.removeEventListener("blur", h.onBlur);
            } catch { }

            try {
                document.removeEventListener("click", h.onDocClick);
                document.removeEventListener("keydown", h.onDocKeydown);
                window.removeEventListener("resize", h.onResize);
                window.removeEventListener("scroll", h.onScroll, { passive: true });
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
        const etaLine = info.available ? "Available now." : `Available in ${info.etaText}.`;
        return `🎁 One chest per day (resets at midnight).\nReward: +${info.points} ${label}.\nNo accumulation.\n${etaLine}`;
    };

    const open = () => {
        tipText.textContent = buildText();
        tip.classList.remove("hidden");
        tip.setAttribute("aria-hidden", "false");
        trigger.setAttribute("aria-expanded", "true");
    };

    const close = () => {
        tip.classList.add("hidden");
        tip.setAttribute("aria-hidden", "true");
        trigger.setAttribute("aria-expanded", "false");
    };

    const toggle = () => (tip.classList.contains("hidden") ? open() : close());

    // Expose helpers KISS pour addChestIconToHeader()
    this._openChestTooltip = () => open();
    this._closeChestTooltip = () => close();
    this._toggleChestTooltip = () => toggle(); // utile mobile


    h.onPointerEnter = () => {
        if (!isTouchLike()) open();
    };
    h.onPointerLeave = () => {
        if (!isTouchLike()) close();
    };
    h.onFocus = () => {
        if (!isTouchLike()) open();
    };
    h.onBlur = () => {
        if (!isTouchLike()) close();
    };

    // Mobile-only: only toggles when chest is locked (if unlocked, click is reserved for collect)
    // supprimé : h.onTriggerClick
    // La logique "mobile click -> tooltip quand locked" est gérée par addChestIconToHeader()
    // via this._toggleChestTooltip().


    h.onDocClick = (e) => {
        if (!isTouchLike()) return;
        if (trigger.contains(e.target) || tip.contains(e.target)) return;
        close();
    };

    h.onDocKeydown = (e) => {
        if (e.key === "Escape") close();
    };
    h.onResize = () => close();
    h.onScroll = () => close();

    trigger.addEventListener("pointerenter", h.onPointerEnter);
    trigger.addEventListener("pointerleave", h.onPointerLeave);
    trigger.addEventListener("focus", h.onFocus);
    trigger.addEventListener("blur", h.onBlur);

    // IMPORTANT:
    // - Do NOT add a click handler here by default.
    // - Click is handled by addChestIconToHeader for collect (or mobile tooltip when locked).
    // If you want tooltip-on-click when locked, uncomment:
    // trigger.addEventListener("click", h.onTriggerClick);

    document.addEventListener("click", h.onDocClick);
    document.addEventListener("keydown", h.onDocKeydown);
    window.addEventListener("resize", h.onResize);
    window.addEventListener("scroll", h.onScroll, { passive: true });


    // Ensure initial state is closed
    close();

    h.tip = tip;
    h.tipText = tipText;
    h.node = trigger;

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

    // Premium button cleanup
    const pb = this._premiumBtnHandlers;
    if (pb?.node) {
        try { if (pb.onClick) pb.node.removeEventListener("click", pb.onClick); } catch { }
        try { if (pb.onKeyDown) pb.node.removeEventListener("keydown", pb.onKeyDown); } catch { }
        try { delete pb.node.dataset.premiumBound; } catch { }
    }
    this._premiumBtnHandlers = null;


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

    // Tooltip cleanup
    const th = this._chestTooltipHandlers;
    const trigger = document.getElementById("daily-chest-wrapper");

    if (th) {
        // 1) Unbind du node réellement bindé si on l'a (meilleur que re-query le DOM)
        const node = th.node || trigger;

        if (node) {
            try { node.removeEventListener("pointerenter", th.onPointerEnter); } catch { }
            try { node.removeEventListener("pointerleave", th.onPointerLeave); } catch { }
            try { node.removeEventListener("focus", th.onFocus); } catch { }
            try { node.removeEventListener("blur", th.onBlur); } catch { }

            try { delete node.dataset.chestTooltipBound; } catch { }
            try { node.removeAttribute("aria-controls"); } catch { }
            try { node.removeAttribute("aria-expanded"); } catch { }
        }

        // 2) Unbind global listeners même si le node a disparu
        try { document.removeEventListener("click", th.onDocClick); } catch { }
        try { document.removeEventListener("keydown", th.onDocKeydown); } catch { }
        try { window.removeEventListener("resize", th.onResize); } catch { }
        try { window.removeEventListener("scroll", th.onScroll, { passive: true }); } catch { }

        this._chestTooltipHandlers = null;
    }

    // ✅ Désarme le toggle exposé (évite appels après destroy)
    this._toggleChestTooltip = null;



    // Chest header cleanup
    const hh = this._chestHeaderHandlers;
    if (hh?.node) {
        try {
            if (hh.onActivate) hh.node.removeEventListener("click", hh.onActivate);
            if (hh.onKeyDown) hh.node.removeEventListener("keydown", hh.onKeyDown);
        } catch { }

        try { delete hh.node.dataset.chestBound; } catch { }
    }
    this._chestHeaderHandlers = null;


    try { document.getElementById("sophie-paywall-modal")?.remove?.(); } catch { }
    try { document.getElementById("premium-code-modal")?.remove?.(); } catch { }
    try { document.getElementById("theme-preview-modal")?.remove?.(); } catch { }
};

// ===================================================
// Global export (must run at file load)
// ===================================================
window.UIFeatures = UIFeatures;
