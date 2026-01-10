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

// APRÈS
// (SUPPRIMÉ) XP progress indicator: on a "Level" au début, pas besoin de barre/progress ici.


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
    this.addChestIconToHeader();   // ✅ bind click collect + state aria + wrapper dataset
    this.setupChestTooltip();      // ✅ tooltip hover/focus + mobile toggle quand locked
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


UIFeatures.prototype.updateXPHeader = function () {
    // Elements
    const fpEl = document.getElementById("user-fp");
    const levelEl = document.getElementById("user-level");
    const premiumBtn = document.getElementById("premium-unlock-btn");
    const chestWrapper = document.getElementById("daily-chest-wrapper");

    // ---------- FP ----------
    const fp = Number(this.storageManager?.getFrenchPoints?.() ?? 0);
    const safeFP = Number.isFinite(fp) && fp >= 0 ? fp : 0;

    if (fpEl) fpEl.textContent = `${safeFP} FP`;

    // ---------- LEVEL ----------
    let level =
        Number(this.storageManager?.getUserLevel?.() ?? this.storageManager?.getLevel?.() ?? NaN);

    if (!Number.isFinite(level) || level <= 0) {
        level = 1 + Math.floor(safeFP / 25);
    }
    if (levelEl) levelEl.textContent = String(level);

    // ---------- CHEST (visual state only; collect logic ailleurs) ----------
    if (chestWrapper) {
        try {
            const info = this.getChestInfo?.() || { available: false, points: 1, etaText: "" };
            const available = !!info.available;

            chestWrapper.classList.toggle("chest-icon--available", available);
            chestWrapper.style.opacity = available ? "1" : "0.5";
            chestWrapper.dataset.state = available ? "available" : "locked";
        } catch { }
    }

    // ---------- PREMIUM CTA (Stripe link) ----------
    if (premiumBtn) {
        const isPremium = !!this.storageManager?.isPremiumUser?.();

        if (!premiumBtn.dataset.originalHref) {
            premiumBtn.dataset.originalHref = premiumBtn.getAttribute("href") || "";
        }

        if (isPremium) {
            premiumBtn.setAttribute("aria-disabled", "true");
            premiumBtn.setAttribute("tabindex", "-1");
            premiumBtn.classList.add("opacity-50", "pointer-events-none", "cursor-default");
            premiumBtn.setAttribute("title", "Premium active");
            premiumBtn.setAttribute("href", "#");
            premiumBtn.setAttribute("aria-label", "Premium already unlocked");
        } else {
            premiumBtn.setAttribute("aria-disabled", "false");
            premiumBtn.removeAttribute("tabindex");
            premiumBtn.classList.remove("opacity-50", "pointer-events-none", "cursor-default");
            premiumBtn.removeAttribute("title");
            premiumBtn.setAttribute("href", premiumBtn.dataset.originalHref || "");
            premiumBtn.setAttribute(
                "aria-label",
                `Unlock premium access for ${UIFeatures.PRICE_DISPLAY.current}. Launch price. Regular price ${UIFeatures.PRICE_DISPLAY.regular}.`
            );
        }
    }
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

UIFeatures.prototype.bindHeaderPremiumCodeEntry = function () {
    const btn = document.getElementById("premium-unlock-btn");
    if (!btn) return;

    if (btn.dataset.premiumBound === "1") return;
    btn.dataset.premiumBound = "1";

    if (!this._premiumBtnHandlers) this._premiumBtnHandlers = {};
    this._premiumBtnHandlers.node = btn;
};

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

    const updateState = () => {
        const info = (typeof this.getChestInfo === "function")
            ? this.getChestInfo()
            : { available: false, points: 1, etaText: "" };

        const available = (typeof this.storageManager.isDailyRewardAvailable === "function")
            ? !!this.storageManager.isDailyRewardAvailable()
            : !!info.available;

        wrapper.classList.add("chest-icon");
        wrapper.classList.toggle("chest-icon--available", available);

        wrapper.style.opacity = available ? "1" : "0.5";
        wrapper.dataset.state = available ? "available" : "locked";

        const points = Number.isFinite(info.points) && info.points > 0 ? info.points : 1;
        const label = points === 1 ? "French Point" : "French Points";

        // APRÈS (addChestIconToHeader → updateState aria-label, calendar-based + ETA)
        const eta = info.etaText ? ` Available in ${info.etaText}.` : "";
        wrapper.setAttribute(
            "aria-label",
            available
                ? `Collect your daily chest (+${points} ${label})`
                : `Daily chest locked. One chest per calendar day. Reward: +${points} ${label}.${eta}`
        );

    };

    if (!this._chestHeaderHandlers) this._chestHeaderHandlers = {};
    const h = this._chestHeaderHandlers;

    if (h.node && h.node !== wrapper && h.onActivate) {
        try { h.node.removeEventListener("click", h.onActivate); } catch { }
        try { delete h.node.dataset.chestBound; } catch { }
        h.node = null;
    }

    if (wrapper.dataset.chestBound === "1") {
        updateState();
        return;
    }
    wrapper.dataset.chestBound = "1";

    h.node = wrapper;

    h.onActivate = (event) => {
        const availableNow =
            (typeof this.storageManager.isDailyRewardAvailable === "function")
                ? !!this.storageManager.isDailyRewardAvailable()
                : !!this.getChestInfo?.().available;

        // Locked: mobile toggle tooltip (click reserved for collect when available)
        if (!availableNow) {
            try { this.setupChestTooltip?.(); } catch { }
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
            // ✅ si le tooltip était ouvert (mobile), on le ferme après collecte
            try { this._closeChestTooltip?.(); } catch { }

            this.collectDailyReward();
            updateState();
        } finally {
            delete wrapper.dataset.collecting;
        }
    };

    wrapper.addEventListener("click", h.onActivate);
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
// APRÈS — startConversionTimer() complet (fix TDZ: stop défini avant usage)
UIFeatures.prototype.startConversionTimer = function () {
    const stop = () => {
        if (this.paywallTimer) {
            clearInterval(this.paywallTimer);
            this.paywallTimer = null;
        }
    };

    const start = () => {
        if (this.paywallTimer || document.hidden) return;

        this.paywallTimer = setInterval(() => {
            if (document.hidden) return;
            if (document.getElementById("sophie-paywall-modal")) return;

            if (this.storageManager.isPremiumUser?.()) {
                stop();
                return;
            }

            const shouldTrigger = this.storageManager.shouldTriggerPaywall?.();

            const hasUnplayedFreeQuizzes =
                (typeof this.storageManager.hasUnplayedFreeQuizzes === "function")
                    ? !!this.storageManager.hasUnplayedFreeQuizzes()
                    : true;

            if (shouldTrigger && !hasUnplayedFreeQuizzes) {
                this.showSophiePaywall();
                this.storageManager.markPaywallShown?.();
                stop();
            }
        }, 30000);
    };

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

    // Focus trap: ici, parce que le modal est garanti dans le DOM
    this._applyFocusTrap?.(modal);

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

    // ⛔️ SUPPRIMÉ: le modal est append ailleurs (showSophiePaywall)
    // document.body.appendChild(modal);

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
            close();
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
        optionsContainer.setAttribute("role", "radiogroup");
        optionsContainer.setAttribute("aria-disabled", "true");

        options.forEach((o, i) => {
            o.setAttribute("role", "radio");
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
    const safeExplanation = typeof question?.explanation === "string"
        ? this.escapeHTML(question.explanation)
        : "";

    if (isCorrect) {
        return `
      <div class="feedback-content correct text-center">
        <div class="text-2xl mb-1">✅</div>
        <div class="text-lg font-bold mb-1">Excellent!</div>

        ${safeExplanation ? `
          <div class="mt-3 p-3 bg-white/10 rounded-lg border border-white/20">
            <div class="flex items-start gap-2">
              <span class="text-lg">💡</span>
              <div class="text-left">
                <div class="text-sm font-semibold mb-1">Did you know?</div>
                <div class="text-sm opacity-95">${safeExplanation}</div>
              </div>
            </div>
          </div>` : ""}
      </div>`;
    }

    return `
      <div class="feedback-content incorrect text-center">
        <div class="text-2xl mb-1">✗</div>
        <div class="text-lg font-bold mb-1">Keep learning!</div>
        <div class="text-base opacity-95 mb-1">
          Correct answer: <strong>${safeCorrect}</strong>
        </div>
        ${safeExplanation ? `
          <div class="mt-2 text-sm opacity-90">
            <span>💡 </span>${safeExplanation}
          </div>` : ""}
      </div>`;
};



//================================================================================
// THEME HANDLING
//================================================================================
// APRÈS (fix strict KISS)
// 1) Tu SUPPRIMES entièrement le bloc ci-dessus (il ne doit pas exister en dehors de handleThemeClick)
// 2) Tu gardes une seule logique unlock DANS handleThemeClick, sans alert(), et avec showFeedbackMessage.
// 3) Tu fixes la fermeture de la fonction (pas de "};" fantôme).

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
        const needed = Math.max(0, Number(unlockStatus.cost ?? 0) - currentFP);

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
            message += `Daily chest: 1 per day (resets at midnight, no accumulation).`;
        } else {
            message += `Or get instant access to all themes ($12) - click header link\n\n`;
            message += `Free path: quizzes + one daily chest (+${chestPoints} ${chestLabel}, resets at midnight, no accumulation)`;
        }

        this.showFeedbackMessage("info", message);
        return;
    }

    if (unlockStatus.canUnlock) {
        const currentFP = Number(this.storageManager.getFrenchPoints?.() ?? 0);
        const cost = Number(unlockStatus.cost ?? 0);

        const confirmMessage = `Unlock "${theme.name}" for ${cost} FP?\n\n` +
            `You have ${currentFP} FP\n` +
            `After unlock: ${Math.max(0, currentFP - cost)} FP remaining\n\n` +
            `This unlocks 5 authentic French quizzes`;

        if (!confirm(confirmMessage)) return;

        if (typeof this.storageManager.unlockTheme !== "function") {
            this.showFeedbackMessage("error", "Unlock failed (missing storage method)");
            return;
        }

        const res = this.storageManager.unlockTheme(theme.id, cost);

        if (res && res.success) {
            const remaining = Number(res.remainingFP ?? this.storageManager.getFrenchPoints?.() ?? 0);

            this.showFeedbackMessage(
                "success",
                `Unlocked "${theme.name}"! 5 new authentic French quizzes available. ${remaining} FP remaining.`
            );

            try { this.updateXPHeader(); } catch { }

            setTimeout(() => {
                if (this.uiCore?.showWelcomeScreen) this.uiCore.showWelcomeScreen();
                else window.location.reload();
            }, 100);
        } else {
            this.showFeedbackMessage("error", "Unlock failed - please try again");
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
    this._applyFocusTrap?.(modal);
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

        const amount = Number(
            result.earned ?? result.fpEarned ?? result.pointsEarned ?? 0
        );

        if (amount > 0) this.showDailyRewardAnimation(amount);
        try { this.updateXPHeader(); } catch { }
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

    // ⛔️ SUPPRIMÉ: déjà append dans showThemePreviewModal()
    // document.body.appendChild(modal);

    // ✅ Focus trap: déjà géré dans showThemePreviewModal()


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
       <input id="premium-code-input" type="text"
         class="w-full"
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

    document.body.appendChild(modal);

    // ✅ Focus trap (après insertion DOM)
    this._applyFocusTrap?.(modal);

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

            // APRÈS — showPremiumCodeModal() (bloc corrigé)
            if (result.success) {
                this.showFeedbackMessage?.("success", "🎉 Premium unlocked!");
                try { this.updateXPHeader?.(); } catch { }

                close();

                try {
                    const paywall = document.getElementById("sophie-paywall-modal");
                    if (paywall) paywall.remove();
                } catch { }

                try {
                    if (this.uiCore?.showWelcomeScreen) this.uiCore.showWelcomeScreen();
                    else if (this.uiCore?.showQuizSelection) this.uiCore.showQuizSelection();
                    else window.location.reload();
                } catch {
                    window.location.reload();
                }
            } else {
                input.classList.add("border-red-400");
                input.value = "";
                input.placeholder = "Invalid code - try again";
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

// APRÈS — getChestInfo()
// Aucun accès direct à localStorage: fallback local en mémoire (mis à jour à la collecte).
// APRÈS
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

    // Availability: StorageManager is source of truth when available (calendar-based)
    let available;
    if (typeof this.storageManager?.isDailyRewardAvailable === "function") {
        available = !!this.storageManager.isDailyRewardAvailable();
    } else {
        const lastTs = Number(this.storageManager?.getLastDailyRewardTimestamp?.()) || 0;
        available = !lastTs ? true : !isSameLocalDay(lastTs, Date.now());
    }

    // Next ready time: StorageManager is source of truth when available
    let nextReadyTs;
    if (typeof this.storageManager?.getNextDailyRewardTime === "function") {
        nextReadyTs = Number(this.storageManager.getNextDailyRewardTime());
    } else {
        const now = new Date();
        const next = new Date(now);
        next.setHours(24, 0, 0, 0); // next local midnight
        nextReadyTs = next.getTime();
    }

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
            window.removeEventListener("scroll", h.onScroll, h._scrollOptions || false);
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

    // APRÈS (setupChestTooltip → buildText, calendar-based wording + uses etaText)
    const buildText = () => {
        const info = this.getChestInfo();
        const label = info.points === 1 ? "French Point" : "French Points";
        const etaLine = info.available ? "Available now." : (info.etaText ? `Available in ${info.etaText}.` : "Available tomorrow.");
        return `🎁 One chest per calendar day.\nReward: +${info.points} ${label}.\nNo accumulation.\n${etaLine}`;
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
    h.onResize = () => close();
    h.onScroll = () => close();

    trigger.addEventListener("pointerenter", h.onPointerEnter);
    trigger.addEventListener("pointerleave", h.onPointerLeave);
    trigger.addEventListener("focus", h.onFocus);
    trigger.addEventListener("blur", h.onBlur);

    document.addEventListener("click", h.onDocClick);
    document.addEventListener("keydown", h.onDocKeydown);
    window.addEventListener("resize", h.onResize);

    // ✅ passive scroll + options stockées pour removeEventListener fiable
    h._scrollOptions = { passive: true };
    window.addEventListener("scroll", h.onScroll, h._scrollOptions);

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

        try { document.removeEventListener("click", th.onDocClick); } catch { }
        try { document.removeEventListener("keydown", th.onDocKeydown); } catch { }
        try { window.removeEventListener("resize", th.onResize); } catch { }

        // ✅ remove scroll avec les mêmes options que addEventListener
        try { window.removeEventListener("scroll", th.onScroll, th._scrollOptions || false); } catch { }

        // ✅ ferme visuellement le tooltip si encore présent
        try { document.getElementById("daily-chest-tooltip")?.classList.add("hidden"); } catch { }

        this._chestTooltipHandlers = null;
    }


    // ✅ Désarme les helpers exposés (évite appels après destroy)
    this._openChestTooltip = null;
    this._closeChestTooltip = null;
    this._toggleChestTooltip = null;



    // Chest header cleanup
    const hh = this._chestHeaderHandlers;
    if (hh?.node) {
        try {
            if (hh.onActivate) hh.node.removeEventListener("click", hh.onActivate);
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
