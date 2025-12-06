// ui-features.js v3.0 


function UIFeatures(uiCore, storageManager, resourceManager) {
    if (!uiCore) {
        throw new Error("UIFeatures: uiCore parameter is required");
    }
    if (!storageManager) {
        throw new Error("UIFeatures: storageManager parameter is required");
    }
    if (!resourceManager) {
        throw new Error("UIFeatures: resourceManager parameter is required");
    }

    this.uiCore = uiCore;
    this.storageManager = storageManager;
    this.resourceManager = resourceManager;

    // §  Init paywall
    this.paywallTimer = null;


    // Messages rotatifs par categorie de performance
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

    // Demarrage conversion
    this.startConversionTimer();
}

//================================================================================
// SYSTEME MESSAGES ROTATIFS
//================================================================================
UIFeatures.prototype.getRotatedFeedbackMessage = function (percentage, themeId) {
    const pct = Number(percentage) || 0;
    const category = pct >= 60 ? 'strongPerformance' : (pct >= 40 ? 'goodPerformance' : 'lowPerformance');
    const messages = this.feedbackMessages?.[category] || [];
    if (!messages.length) return 'Keep going!';

    const key = 'tyf-feedback-index';
    const safeThemeId = themeId ?? 'global';
    const themeKey = `${safeThemeId}_${category}`;
    this._feedbackIndexMap = this._feedbackIndexMap || {};

    let indexMap;
    try { indexMap = JSON.parse(localStorage.getItem(key) || '{}') || {}; }
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
    this.setupDailyReward();
    this.setupStorageEvents();
    this.initializeNotifications();
    this.updateFPProgressIndicator?.();

};

UIFeatures.prototype.showXPHeader = function () {
    const xpHeader = document.getElementById('xp-header');
    if (xpHeader) xpHeader.classList.remove('hidden');
};

UIFeatures.prototype.updateXPHeader = function () {
    const fp = this.storageManager.getFrenchPoints();
    const level = this.storageManager.getUserLevel();
    const progress = this.storageManager.getLevelProgress() || { percentage: 0, remaining: null };

    // Level (simple text set)
    this.setText('user-level', level);

    // FP text (no risky HTML strings)
    const fpEl = document.getElementById('user-fp');
    if (fpEl) {
        fpEl.textContent = `${fp} French Points`;
    }

    this.updateFPProgressIndicator?.();


    // Progress bar via classes (no inline style)
    const progressBar = document.getElementById('xp-progress-bar');
    if (progressBar) {
        // strip previous width classes
        for (const c of [...progressBar.classList]) {
            if (c.startsWith('w-pct-')) progressBar.classList.remove(c);
        }
        const pct = Number.isFinite(progress.percentage) ? progress.percentage : 0;
        const pct5 = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
        progressBar.classList.add(`w-pct-${pct5}`);
    }

    this.addChestIconToHeader();
};


UIFeatures.prototype.setupDailyReward = function () {
    if (window.TYF_CONFIG?.debug?.enabled) {
        console.debug('Ž Daily reward system updated - using chest icon in header');
    }
};


UIFeatures.prototype.collectDailyReward = function () {
    const result = this.storageManager.collectDailyReward();
    if (result.success) {
        this.showDailyRewardAnimation(result.fpEarned || result.pointsEarned);
        this.updateXPHeader(); // <-- suffit, car updateXPHeader() reconstruit l'icone
    }
};

UIFeatures.prototype.setupStorageEvents = function () {
    this._onStorageUpdated = () => this.updateXPHeader();
    window.addEventListener('storage-updated', this._onStorageUpdated);
};

//================================================================================
// CONVERSION SYSTEM
//================================================================================
UIFeatures.prototype.startConversionTimer = function () {
    const start = () => {
        if (this.paywallTimer || document.hidden) return;
        this.paywallTimer = setInterval(() => {
            if (document.hidden) return;
            if (document.getElementById('sophie-paywall-modal')) return;

            const shouldTrigger = this.storageManager.shouldTriggerPaywall?.();

            const freeLeft = this.storageManager.getThemeProgress
                ? ((this.storageManager.getThemeProgress(1)?.completedCount || 0) < 5)
                : true;

            const hasUnplayedFreeQuizzes =
                (typeof this.storageManager.hasUnplayedFreeQuizzes === 'function')
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

    document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
    start();
};




UIFeatures.prototype.showSophiePaywall = function () {
    if (this.storageManager.isPremiumUser()) return;
    // ”’ garde anti-doublon
    if (document.getElementById('sophie-paywall-modal')) return;

    const modal = this.createPaywallModal();
    document.body.appendChild(modal);

    setTimeout(() => {
        const buyBtn = modal.querySelector('#paywall-buy-btn');
        if (buyBtn) buyBtn.focus();
    }, 100);
};


UIFeatures.prototype.createPaywallModal = function () {
    const modal = document.createElement('div');
    modal.id = 'sophie-paywall-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.setAttribute('role', 'dialog');
    const sessionMinutes = Math.max(0, Math.round(Number(this.storageManager.getSessionDuration?.()) || 0));
    const currentFP = Number(this.storageManager.getFrenchPoints?.()) || 0;
    const nextCost =
        Number(this.storageManager.getNextThemeUnlockCost?.()) ||
        Number(this.storageManager.getUnlockCost?.(this.storageManager.getUnlockedPremiumThemesCount?.() || 0)) ||
        0;
    const daily = Number(this.storageManager.getDailyRewardPoints?.()) || 3;

    const waitDays = Math.max(0, Math.ceil((nextCost - currentFP) / Math.max(1, daily)));

    modal.innerHTML = this.generateSophiePaywallHTML(sessionMinutes, waitDays);
    this.setupPaywallEvents(modal);


    return modal;
};
UIFeatures.prototype.setupPaywallEvents = function (modal) {
    const cleanup = () => document.removeEventListener('keydown', onEsc);
    const close = () => { cleanup(); modal.remove(); };

    modal.querySelectorAll('[data-action="close"]').forEach(btn => {
        btn.addEventListener('click', close);
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onEsc);

    const buyBtn = modal.querySelector('#paywall-buy-btn');
    if (buyBtn) {
        buyBtn.addEventListener('click', () => {
            const url = window?.TYF_CONFIG?.stripePaymentUrl;
            if (url) window.location.href = url;
        });
    }
};



UIFeatures.prototype.generateSophiePaywallHTML = function (sessionMinutes, waitDays) {
    return `
        <div class="bg-white rounded-2xl p-8 max-w-md mx-4 text-center relative">
            <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600" data-action="close">
                 âœ•
            </button>
            
            <div class="text-5xl mb-4">Ž¯</div>
            <h2 class="text-xl font-bold text-gray-800 mb-4">Want to assess all French domains?</h2>
            
            <div class="bg-orange-50 rounded-lg p-4 mb-6 text-left">
                <div class="text-orange-800 text-sm space-y-2">
                    <div>â° <strong>You've already invested ${sessionMinutes} minutes</strong></div>
                    <div>“… At free pace: ${waitDays} days waiting</div>
                    <div>’Ž With Premium: Complete Quiz now</div>
                </div>
            </div>
            
            <div class="bg-blue-50 rounded-lg p-4 mb-6">
                <div class="text-blue-800 text-sm">
                    âœ… 9 additional quiz themes<br>
                    âœ… 45 authentic French quizzes<br>
                    âœ… Native audio practice<br>
                    âœ… Realistic feedback
                </div>
            </div>
            
            <div class="text-2xl font-bold text-blue-600 mb-2">â‚¬12</div>
            <div class="text-sm text-gray-600 mb-6">Your time is worth more than 40 cents per day</div>
            
            <button id="paywall-buy-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors mb-3">
                š€ Get Complete Quiz
            </button>
            
            <button data-action="close" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-4 rounded-lg transition-colors">
                â° Continue Free (${waitDays} days)
            </button>
        </div>`;
};


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
// ASSESSMENT FEEDBACK
//================================================================================
UIFeatures.prototype.showQuestionFeedback = function (question, selectedIndex) {
    const container = document.getElementById('feedback-container');
    if (!container) return;

    const scope = container.closest('.quiz-wrapper') || document;
    const optionsContainer = scope.querySelector('.options-container');
    const options = scope.querySelectorAll('.option');

    const correctIndex = Number(question?.correctIndex);
    const isValid = Number.isInteger(correctIndex) && options[correctIndex];
    const isCorrect = isValid && correctIndex === Number(selectedIndex);

    // 1) Couleur des options (reset + marquage)
    options.forEach((opt, i) => {
        opt.classList.remove('correct-validated', 'incorrect-validated', 'selected');
        if (!isValid) return;

        if (i === correctIndex) {
            opt.classList.add('correct-validated');
        } else if (i === Number(selectedIndex)) {
            opt.classList.add('incorrect-validated');
        }
    });

    // 2) Verrouillage d'interaction + accessibilite
    if (optionsContainer) {
        optionsContainer.classList.add('is-validated');
        optionsContainer.setAttribute('aria-disabled', 'true');
        options.forEach(o => {
            o.setAttribute('tabindex', '-1');           // plus focusable
            o.setAttribute('aria-checked', 'false');    // on ne laisse pas un etat radio actif
        });
    }

    // 3) Feedback compact (voir C ci-dessous)
    container.innerHTML = this.generateSimpleFeedback(isCorrect, question);

    // 4) Mode toast non bloquant + annonce ARIA (pas de scroll)
    container.classList.remove('hidden');
    container.classList.add('as-toast');            // overlay interne (CSS)
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.tabIndex = -1;
    requestAnimationFrame(() => container.focus({ preventScroll: true }));
};


UIFeatures.prototype.generateSimpleFeedback = function (isCorrect, question) {
    const hasOptions = Array.isArray(question?.options);
    const validIdx = Number.isInteger(question?.correctIndex) && hasOptions &&
        question.correctIndex >= 0 && question.correctIndex < question.options.length;

    const strip = (s) => String(s).replace(/^\s*[A-D]\s*[\.)]\s*/i, '').trim();
    const rawCorrect = validIdx ? String(question.options[question.correctIndex]) : '-';
    const safeCorrect = this.escapeHTML(strip(rawCorrect));
    const safeExplanation = typeof question?.explanation === 'string' ? this.escapeHTML(question.explanation) : '';

    if (isCorrect) {
        return `
      <div class="feedback-content correct text-center">
        <div class="text-2xl mb-1">âœ…</div>
        <div class="text-lg font-bold text-white mb-1">Excellent!</div>
        ${safeExplanation ? `
          <div class="mt-3 p-3 bg-white/10 rounded-lg border border-white/20">
            <div class="flex items-start gap-2">
              <span class="text-lg">’¡</span>
              <div class="text-left">
                <div class="text-sm font-semibold text-white mb-1">Did you know?</div>
                <div class="text-sm text-white opacity-95">${safeExplanation}</div>
              </div>
            </div>
          </div>` : ''}
      </div>`;
    }

    // cas incorrect  
    return `
    <div class="feedback-content incorrect text-center">
      <div class="text-2xl mb-1">’ª</div>
      <div class="text-lg font-bold text-white mb-1">Keep learning!</div>
      <div class="text-base text-white opacity-95 mb-1">Correct answer: <strong>${safeCorrect}</strong></div>
      ${safeExplanation ? `
        <div class="mt-2 text-sm text-white opacity-90">
          <span>’¡ </span>${safeExplanation}
        </div>` : ''}
    </div>`;
};



UIFeatures.prototype.showFPGain = function (amount) {
    const elem = document.createElement('div');
    elem.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-xl font-bold text-blue-600 z-50 pointer-events-none';

    const label = amount === 1 ? 'French Point' : 'French Points';
    elem.textContent = `+${amount} ${label}`;
    elem.classList.add('fp-gain-anim');
    document.body.appendChild(elem);
    if (window.trackMicroConversion) window.trackMicroConversion('fp_earned', { amount });
    setTimeout(() => elem.remove(), 1500);
};


//================================================================================
// THEME HANDLING
//================================================================================

UIFeatures.prototype.handleThemeClick = function (theme) {
    const unlockStatus = this.storageManager.canUnlockTheme(theme.id);

    if (this.storageManager.isThemeUnlocked(theme.id)) {
        if (this.uiCore?.quizManager) {
            this.uiCore.quizManager.currentThemeId = theme.id;
        }
        if (this.uiCore?.showQuizSelection) {
            this.uiCore.showQuizSelection();
        }
        return;
    }

    if (this.storageManager.isPremiumUser()) {
        if (this.uiCore?.quizManager) {
            this.uiCore.quizManager.currentThemeId = theme.id;
        }
        if (this.uiCore?.showQuizSelection) {
            this.uiCore.showQuizSelection();
        }
        return;
    }
    if (unlockStatus.reason === "PREVIOUS_LOCKED") {
        // Montrer le modal au lieu de bloquer
        const modal = this.createThemePreviewModal(theme);
        document.body.appendChild(modal);
        return;
    }
    if (unlockStatus.reason === "PREVIOUS_LOCKED") {
        const themeNames = {
            1: "Colors", 2: "Numbers", 3: "Gender", 4: "Singular and Plural",
            5: "Present Tense", 6: "Accents", 7: "Ca Va", 8: "Metro",
            9: "Boulangerie", 10: "Cafe"
        };
        const previousTheme = themeNames[theme.id - 1] || "the previous theme";
        const cost = this.storageManager.getUnlockCost(this.storageManager.getUnlockedPremiumThemesCount());

        alert(`”’ Sequential unlock: Unlock ${previousTheme} first!\n\n` +
            `Then you'll need ${cost} French Points to unlock ${theme.name}.\n\n` +
            `’Ž Or get instant access to all themes ($12) - click header link`);  // <- avec la )
        return;
    }

    if (unlockStatus.reason === "INSUFFICIENT_FP") {
        const currentFP = this.storageManager.getFrenchPoints();
        const needed = unlockStatus.cost - currentFP;

        let message = `${theme.name} needs ${unlockStatus.cost} French Points\n\n` +
            `You have: ${currentFP} French Points\n` +
            `Missing: ${needed} French Points\n\n`;

        if (needed <= 5) {
            message += `”¥ So close! Take more quizzes or tomorrow's bonus!\n\n`;
            message += `’Ž Or get instant access to all themes ($12) - click header link`;
        } else if (needed <= 15) {
            message += `’¡ A few more quizzes and daily bonuses!\n\n`;
            message += `’Ž Or get instant access to all themes ($12) - click header link\n\n`;
            message += `Ž Don't forget your daily chests!`;
        } else {
            message += `’Ž Or get instant access to all themes ($12) - click header link\n\n`;
            message += `’¡ Free path: Complete quizzes to earn French Points + daily chest bonuses`;

        }

        alert(message);
        return;
    }

    if (unlockStatus.canUnlock) {
        const confirmMessage = `âœ¨ Unlock "${theme.name}" for ${unlockStatus.cost} FP?\n\n` +
            `You have ${this.storageManager.getFrenchPoints()} FP\n` +
            `After unlock: ${this.storageManager.getFrenchPoints() - unlockStatus.cost} FP remaining\n\n` +
            `’¡ This unlocks 5 authentic French quizzes`;

        const confirmUnlock = confirm(confirmMessage);
        if (confirmUnlock) {
            let ok = false;

            if (typeof this.storageManager.unlockTheme === 'function') {
                ok = !!this.storageManager.unlockTheme(theme.id, unlockStatus.cost);
            } else {
                this.storageManager.data.frenchPoints -= unlockStatus.cost;
                const baseQuizId = theme.id * 100;
                for (let i = 1; i <= 5; i++) {
                    const qid = baseQuizId + i;
                    if (!this.storageManager.data.unlockedQuizzes.includes(qid)) {
                        this.storageManager.data.unlockedQuizzes.push(qid);
                    }
                }
                this.storageManager.save();
                ok = true;
            }

            if (ok) {
                alert(`Ž‰ "${theme.name}" unlocked!\n\n5 new authentic French quizzes available\n${this.storageManager.getFrenchPoints()} French Points remaining`);
                this.updateXPHeader();
                setTimeout(() => {
                    if (this.uiCore?.showWelcomeScreen) this.uiCore.showWelcomeScreen();
                    else window.location.reload();
                }, 100);
            } else {
                this.showFeedbackMessage?.('error', 'Unlock failed - please try again');
            }
        }

        return;
    }

    this.showThemePreviewModal(theme);

};

UIFeatures.prototype.showThemePreviewModal = function (theme, unlockStatus) {
    const modal = this.createThemePreviewModal(theme, unlockStatus);
    document.body.appendChild(modal);
};

UIFeatures.prototype.createThemePreviewModal = function (theme, unlockStatus) {
    // Modal avec 3 options : Code premium / Achat / Suggestion alternative
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';

    let statusMessage = '';
    if (unlockStatus.reason === "PREVIOUS_LOCKED") {
        const themeNames = {
            1: "Colors", 2: "Numbers", 3: "Gender", 4: "Singular and Plural",
            5: "Present Tense", 6: "Accents", 7: "Ca Va", 8: "Metro",
            9: "Boulangerie", 10: "Cafe"
        };
        const previousTheme = themeNames[theme.id - 1] || "the previous theme";
        statusMessage = `”’ Sequential unlock required: Complete "${previousTheme}" first!`;
    } else if (unlockStatus.reason === "INSUFFICIENT_FP") {
        const needed = unlockStatus.cost - unlockStatus.currentFP;
        statusMessage = `’° Need ${needed} more French Points (${unlockStatus.cost} total)`;
    }

    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-8 max-w-md mx-4 text-center relative">
            <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600" data-action="close">
                âœ•
            </button>
            
            <div class="text-4xl mb-4">${theme.icon}</div>
            <h2 class="text-xl font-bold text-gray-800 mb-4">${theme.name}</h2>
            
            <div class="bg-orange-50 rounded-lg p-4 mb-6">
                <div class="text-orange-800 text-sm">${statusMessage}</div>
            </div>
            
            <div class="space-y-3">
                <button id="premium-code-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg">
                    ”“ I have a premium code
                </button>
                
                <button id="premium-buy-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg">
                    ’³ Get All Themes - $12
                </button>
                
                <button id="colors-first-btn" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-4 rounded-lg">
                    †“ Try Colors theme first
                </button>
            </div>
        </div>`;

    this.setupThemePreviewEvents(modal, theme);
    return modal;
};

UIFeatures.prototype.showDailyRewardAnimation = function (points) {
    const id = 'daily-reward-toast';
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = id;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const isMobile = window.innerWidth < 640;
    toast.className = isMobile
        ? 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-3 py-2 rounded-lg text-sm'
        : 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg z-50';

    toast.textContent = `Ž +${points} French Points!`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
};


UIFeatures.prototype.getCompletionMessage = function (percentage, fpEarned) {
    let message = "";
    const score = Math.round(percentage * 20 / 100);
    const isMobile = window.innerWidth < 640;

    // Message principal - TOUJOURS POSITIF
    if (percentage >= 90) {
        message = isMobile ? `Excellent! (${score}/20)` : `Excellent! Near-native level (${score}/20)`;
    } else if (percentage >= 70) {
        message = isMobile ? `Fantastic! (${score}/20)` : `Fantastic work! Real skills developing (${score}/20)`;
    } else if (percentage >= 50) {
        message = isMobile ? `Great work! (${score}/20)` : `Great work! You're building skills (${score}/20)`;
    } else {
        message = isMobile ? `Great start! (${score}/20)` : `Great start! Real French progress (${score}/20)`;
    }

    // Points gagnes
    message += `\n+${fpEarned} French Points earned`;

    // CONVERSION IMMEDIATE selon profil
    const currentFP = this.storageManager.getFrenchPoints();

    if (this.storageManager.isPremiumUser()) {
        message += `\nš€ Premium active - unlimited learning!`;
        message += `\n† You're mastering authentic French`;
    } else if (currentFP < 10) {
        message += `\nŒŸ You're building authentic skills!`;
        message += isMobile ?
            `\nâœ¨ Love this? All themes $12` :
            `\nâœ¨ Love the progress? Get all themes instantly $12`;
    } else if (currentFP < 25) {
        message += `\n”¥ Your French breakthrough is happening!`;
        message += isMobile ?
            `\nâœ¨ Ready to accelerate? All themes $12` :
            `\nâœ¨ Ready to accelerate your progress? All themes $12`;
    } else {
        message += `\n† Your dedication shows in every quiz`;
        message += isMobile ?
            `\nâœ¨ Complete your journey - All themes $12` :
            `\nâœ¨ Complete your French journey - All themes $12`;
    }

    return message;
};


UIFeatures.prototype.createThemePreviewModal = function (theme) {
    const modal = document.createElement('div');
    modal.id = 'theme-preview-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.setAttribute('role', 'dialog');

    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-8 max-w-md mx-4 text-center relative">
            <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600" data-action="close">
                <span aria-hidden="true" class="text-lg">âœ•</span>
            </button>
            
            <div class="text-4xl mb-4">${theme.icon}</div>
            <h2 class="text-xl font-bold text-gray-800 mb-4">Unlock ${theme.name}?</h2>
            
            <div class="bg-blue-50 rounded-lg p-4 mb-6">
                <div class="text-blue-800 text-sm space-y-2">
                    <div>Ž¯ <strong>5 progressive quizzes</strong></div>
                    <div>Ž§ <strong>Authentic French audio</strong></div>
                    <div>“Š <strong>Real situation testing</strong></div>
                </div>
            </div>
            
            <div class="space-y-3">
                <button id="premium-code-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg">
                    ”“ I have a premium code
                </button>
                
                <button id="premium-buy-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg">
                    ’³ Get Premium Access (12â‚¬)
                </button>
                
                <button id="colors-first-btn" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-4 rounded-lg">
                    †“ Try Colors theme first
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

UIFeatures.prototype.showPremiumCodeModal = function () {
    const existing = document.querySelector('#premium-code-input');
    if (existing) { existing.focus(); return; }

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
    <div class="bg-white rounded-2xl p-8 max-w-sm mx-4 text-center relative" role="dialog" aria-modal="true">
      <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600" aria-label="Close" data-action="close">
        <span aria-hidden="true" class="text-lg">âœ•</span>
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
            if (result.success) { this.showFeedbackMessage?.('success', 'Ž‰ Premium unlocked!'); close(); }
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
// USER PROFILE COLLECTION
//================================================================================

UIFeatures.prototype.showUserProfileModal = function () {
    // Ne pas montrer si deja identifie
    if (this.storageManager.isUserIdentified()) return;

    // Ne pas montrer si pas encore pret
    if (!this.storageManager.shouldShowProfileModal()) return;

    const modal = this.createUserProfileModal();
    document.body.appendChild(modal);

    // Focus sur le premier champ
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
            <div class="text-4xl mb-4">Ž‰</div>
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
                     ’¾ Save my progress
                </button>
                
                <button id="skip-profile-btn" 
                        class="w-full text-gray-600 hover:text-gray-800 py-2 transition-colors">
                    Continue without saving
                </button>
            </div>
            
          <div class="text-xs text-gray-500 mt-4">
    <span aria-hidden="true" class="mr-1">”’</span>
    Your data stays private and local
</div>
        </div>`;
};

UIFeatures.prototype.setupUserProfileEvents = function (modal) {
    const emailInput = modal.querySelector('#user-email');
    const firstNameInput = modal.querySelector('#user-firstname');
    const saveBtn = modal.querySelector('#save-profile-btn');
    const skipBtn = modal.querySelector('#skip-profile-btn');

    // Validation en temps reel
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

    // Validation initiale
    validateInputs();

    // Sauvegarder
    saveBtn.addEventListener('click', () => {
        const email = emailInput.value.trim();
        const firstName = firstNameInput.value.trim();

        if (this.storageManager.setUserProfile(email, firstName)) {
            this.showFeedbackMessage('success', `‘‹ Hi ${firstName}! Your progress is saved`);
            this.closeUserProfileModal(modal);
        } else {
            this.showFeedbackMessage('error', 'âŒ Error saving profile');
        }
    });

    // Ignorer
    skipBtn.addEventListener('click', () => {
        this.storageManager.markProfileModalRefused();
        this.closeUserProfileModal(modal);
    });

    // Echapper
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            this.storageManager.markProfileModalRefused();
            this.closeUserProfileModal(modal);
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);

    // Enter pour soumettre
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
    // Met a jour l'affichage si il y a un element de salutation
    const userGreeting = document.getElementById('user-greeting');
    if (userGreeting) {
        const displayName = this.storageManager.getUserDisplayName();
        userGreeting.textContent = `Hi ${displayName}!`;
    }
};

//================================================================================
// NOTIFICATIONS PUSH
//================================================================================

UIFeatures.prototype.initializeNotifications = function () {
    // Verifier si les notifications sont activees dans la config
    if (!window.TYF_CONFIG?.serviceWorker?.notifications?.enabled) return;

    // Demander permission au premier lancement
    if ('Notification' in window && Notification.permission === 'default') {
        this.requestNotificationPermission();
    }

    // Programmer notification si coffre disponible
    if (this.storageManager.isDailyRewardAvailable()) {
        this.scheduleNextNotification();
    }
};

UIFeatures.prototype.requestNotificationPermission = function () {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                if (window.TYF_CONFIG?.debug?.enabled) console.debug('Notifications activees âœ…');
                this.scheduleNextNotification();
            } else {
                if (window.TYF_CONFIG?.debug?.enabled) console.debug('Notifications refusees âŒ');
            }
        });
    }
};


UIFeatures.prototype.scheduleNextNotification = function () {
    // Notifications SW requierent un contexte securise (https) + permission
    if (!window.isSecureContext) return;
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const message = {
        type: 'SCHEDULE_NOTIFICATION',
        title: 'Ž Test Your French',
        body: 'Your daily chest is waiting! Free French Points!',
        delay: 24 * 60 * 60 * 1000
    };

    navigator.serviceWorker.ready.then(registration => {
        if (!registration?.active) return;
        try {
            const channel = new MessageChannel();
            registration.active.postMessage(message, [channel.port2]);
        } catch {
            // fallback sans MessageChannel
            registration.active.postMessage(message);
        }
    }).catch(() => {/* no-op */ });
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
    // 1) source principale
    let nextReadyTs = this.storageManager?.getNextDailyRewardTime?.() ?? null;

    // 2) fallback robuste (nouveaux users = dispo maintenant)
    if (!nextReadyTs) {
        const lastTs =
            this.storageManager?.getLastDailyRewardTimestamp?.()
            ?? Number(localStorage.getItem('tyf:lastDailyRewardAt') || 0);
        const cooldown = this.storageManager?.getDailyRewardCooldownMs?.() ?? 24 * 60 * 60 * 1000;
        nextReadyTs = lastTs ? (lastTs + cooldown) : Date.now();
    }

    // 3) clamp de l'etat "available"
    const msLeft = nextReadyTs - Date.now();
    const availableFromStore = this.storageManager?.isDailyRewardAvailable?.() || false;
    const available = availableFromStore || msLeft <= 0;

    // 4) ETA lisible (vide si dispo)
    const etaText = available ? '' : this.formatDuration(msLeft);

    // 5) points = minimum garanti pour l'UI
    return { available, points: 3, etaText };
}; UIFeatures.prototype.addChestIconToHeader = function () {
    const fpEl = document.getElementById('user-fp');
    const levelEl = document.getElementById('user-level');
    const anchor = fpEl || levelEl;
    if (!anchor || !anchor.parentNode) return;

    const info = this.getChestInfo ? this.getChestInfo() : {
        available: this.storageManager.isDailyRewardAvailable?.(),
        etaText: this.storageManager.getNextDailyRewardTime ? this.storageManager.getNextDailyRewardTime() : ''
    };

    const tooltipText = info.available
        ? 'Open your daily chest - at least +3 French Points (sometimes +4)'
        : (info.etaText ? `Next chest in ${info.etaText}` : 'Next chest: ready');

    // wrapper unique
    let wrapper = document.getElementById('daily-chest-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('span');
        wrapper.id = 'daily-chest-wrapper';
        anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);
    } else {
        wrapper.innerHTML = ''; // reset propre
    }

    // icone (+ etat dispo)
    const chestIcon = document.createElement('button');
    chestIcon.id = 'daily-chest-icon';
    chestIcon.className = 'chest-icon ml-2 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2'
        + (info.available ? ' chest-icon--available' : '');
    chestIcon.type = 'button';
    chestIcon.setAttribute('aria-label', info.available ? 'Open your daily chest' : 'Next chest time');
    chestIcon.innerHTML = info.available ? ' Ž<span class="chest-badge">+3</span>' : ' Ž';

    // tooltip ENFANT du bouton (match le CSS : .chest-icon:hover .chest-tooltip)
    const tooltip = document.createElement('span');
    tooltip.id = 'chest-tooltip';
    tooltip.className = 'chest-tooltip';
    tooltip.textContent = tooltipText;

    wrapper.appendChild(chestIcon);
    chestIcon.appendChild(tooltip);

    // interactions (hover/focus/click) - no inline styles
    const showTip = () => tooltip.classList.add('is-visible');
    const hideTip = () => tooltip.classList.remove('is-visible');

    chestIcon.addEventListener('mouseenter', showTip);
    chestIcon.addEventListener('mouseleave', hideTip);
    chestIcon.addEventListener('focusin', showTip);
    chestIcon.addEventListener('focusout', hideTip);
    chestIcon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chestIcon.click(); }
    });

    chestIcon.addEventListener('click', () => {
        if (!this.storageManager.collectDailyReward) return;
        const result = this.storageManager.collectDailyReward();

        // Mise a jour UI si succes
        if (result?.success) {
            this.showDailyRewardAnimation?.(result.fpEarned || result.pointsEarned);

            // Retirer badge +3 et etat dispo
            const badge = chestIcon.querySelector('.chest-badge');
            if (badge) badge.remove();
            chestIcon.classList.remove('chest-icon--available');

            // Maj header + tooltip
            this.updateXPHeader?.();
            tooltip.textContent = 'Next chest in 24 h';
            showTip();
            setTimeout(hideTip, 1200);
        } else {
            showTip();
            setTimeout(hideTip, 800);
        }
    });
};



//================================================================================
// UTILITIES
//================================================================================



UIFeatures.prototype.setText = function (id, value) {
    const elem = document.getElementById(id);
    if (!elem) {
        console.warn(`[XP] Missing element: #${id}`);
        return;
    }
    elem.textContent = value.toString();
};


UIFeatures.prototype.escapeHTML = function (text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

UIFeatures.prototype.showFeedbackMessage = function (type, message) {
    // Cree ou selectionne le conteneur
    let container = document.getElementById('feedback-message-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'feedback-message-container';
        container.className = 'fixed top-6 left-1/2 transform -translate-x-1/2 z-50 max-w-sm w-full px-4';
        document.body.appendChild(container);
    }

    // Style dynamique selon le type
    let icon = 'â„¹ï¸', bg = 'bg-gray-100', color = 'text-gray-700', border = 'border border-gray-300';
    if (type === 'success') {
        icon = 'âœ…'; bg = 'bg-green-50'; color = 'text-green-800'; border = 'border border-green-200';
    } else if (type === 'error') {
        icon = 'âŒ'; bg = 'bg-red-50'; color = 'text-red-800'; border = 'border border-red-200';
    } else if (type === 'info') {
        icon = '’¡'; bg = 'bg-blue-50'; color = 'text-blue-800'; border = 'border border-blue-200';
    }

    const toast = document.createElement('div');
    toast.className = `${bg} ${color} ${border} rounded-xl px-4 py-3 shadow-md flex items-center gap-2 mb-3 animate-fade-in`;
    toast.innerHTML = `
        <span class="text-xl">${icon}</span>
        <span class="text-sm flex-1">${message}</span>`;

    container.appendChild(toast);

    // Disparition automatique
    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};


UIFeatures.prototype.setupResultsEventListeners = function () {
    // hook CSS pour l'ecran de resultats
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
UIFeatures.prototype.updateFPProgressIndicator = function () {
    const fpElement = document.getElementById('fp-next-unlock');
    if (!fpElement) return;

    const currentFP = this.storageManager.getFrenchPoints();

    // âœ… Cout fonde sur nb de THEMES premium deja debloques
    const nextCost = this.storageManager.getNextThemeUnlockCost();
    const remaining = nextCost - currentFP;

    if (remaining <= 0 || this.storageManager.isPremiumUser()) {
        fpElement.classList.add('hidden');
        return;
    }

    fpElement.textContent = `* ${remaining} French Points to unlock next theme`;
    fpElement.classList.remove('hidden');
};








window.UIFeatures = UIFeatures;
