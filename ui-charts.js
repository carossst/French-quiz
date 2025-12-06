/*
 * ui-charts.js â€“ Version v3.0
 */

window.UICharts = function (uiCore, storageManager, resourceManager) {
    this.uiCore = uiCore;
    this.storageManager = storageManager;
    this.resourceManager = resourceManager;
    console.log("âœ… UICharts v3.0 loaded");
};

UICharts.prototype.getStatsLayoutMode = function () {
    const isDesktop = window.matchMedia('(min-width:1024px)').matches;
    const H = window.innerHeight;
    return {
        isDesktop,
        // sur desktop: 3 items si assez de hauteur, sinon 2 ; sur mobile: 3
        historyCap: isDesktop ? (H >= 880 ? 3 : 2) : 3,
        // sur desktop: cacher Achievements si lâ€™Ã©cran est â€œcourtâ€
        showBadges: isDesktop ? (H >= 880) : true,
    };
};

//================================================================================
// CHARGEMENT SIMPLE
//================================================================================
UICharts.prototype.loadDetailedStats = function () {
    console.log("ðŸ“Š Loading detailed stats data...");
    const data = this.storageManager.getVisualizationData();

    let valid = true;
    if (!this.validateStatsData?.(data)) {
        this.showStatsError();
        valid = false;
    }

    try {
        if (valid) {
            this.updateSimpleStats(data);
            this.renderMinimalCharts(data);
        }
    } catch (error) {
        console.error("âŒ Error loading stats:", error);
        this.showStatsError();
    }

    // Toujours binder les boutons aprÃ¨s injection du HTML
    this.setupAllStatsEvents();

    // Ajuste la hauteur visible (retire la hauteur du header) pour Ã©viter le scroll page
    // on le fait sur le prochain frame pour mesurer les tailles correctes.
    requestAnimationFrame(() => this.adjustViewportHeight());
};




UICharts.prototype.validateStatsData = function (data) {
    if (!data || typeof data !== 'object') {
        console.error('Stats data is not an object');
        return false;
    }

    if (typeof data.frenchPoints !== 'number' || data.frenchPoints < 0) {
        console.error('Invalid frenchPoints:', data.frenchPoints);
        return false;
    }

    if (!Array.isArray(data.badges)) {
        console.error('badges is not an array:', data.badges);
        return false;
    }

    if (!Array.isArray(data.history)) {
        console.error('history is not an array:', data.history);
        return false;
    }

    return true;
};

UICharts.prototype.showStatsError = function () {
    const badgesContainer = document.getElementById('badges-display-container');
    const historyContainer = document.getElementById('quiz-history-list');

    if (badgesContainer) {
        badgesContainer.innerHTML = `
            <div class="text-center py-4 text-gray-500">
                <div class="text-2xl mb-2">âš ï¸</div>
                <p>Unable to load achievements</p>
            </div>`;
    }

    if (historyContainer) {
        historyContainer.innerHTML = `
            <div class="text-center py-4 text-gray-500">
                <div class="text-2xl mb-2">âš ï¸</div>
                <p>Unable to load activity</p>
            </div>`;
    }
};

UICharts.prototype.updateSimpleStats = function (data) {
    const completedQuizzes = data.completedQuizzes || 0;
    const globalAccuracy = data.globalAccuracy || 0;
    const frenchPoints = data.frenchPoints || 0;
    const level = Math.floor(frenchPoints / 50) + 1;

    this.updateStat('stats-quizzes-completed',
        `ðŸŽ¯ ${completedQuizzes} â†’ ${this.getProgressMessage(completedQuizzes, globalAccuracy)}`
    );
    this.updateStat('stats-average-score',
        `ðŸ“ˆ ${globalAccuracy}% â†’ ${this.getAccuracyMessage(globalAccuracy, completedQuizzes)}`
    );
    this.updateStat('stats-current-level', `Level ${level}`);
};
UICharts.prototype.normalizeHistory = function (history) {
    if (!Array.isArray(history)) return [];
    const rows = history
        .filter(i => i && i.themeId != null)
        .map(i => {
            const ts = Date.parse(i.date || '');
            const acc = (Number.isFinite(i.total) && i.total > 0)
                ? Math.round((i.score / i.total) * 100)
                : (typeof i.accuracy === 'number' ? Math.round(i.accuracy) : 0);
            return {
                ...i,
                _ts: Number.isFinite(ts) ? ts : 0,
                _day: Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : 'unknown',
                _acc: acc
            };
        })
        .sort((a, b) => b._ts - a._ts);

    // 1 ligne par (themeId, jour) â†’ on garde la plus rÃ©cente du jour
    const byKey = new Map();
    for (const r of rows) {
        const key = `${r.themeId}|${r._day}`;
        if (!byKey.has(key)) byKey.set(key, r);
    }
    return Array.from(byKey.values());
};

UICharts.prototype.renderMinimalCharts = function (data) {
    const badges = Array.isArray(data.badges) ? data.badges : [];
    const history = Array.isArray(data.history) ? data.history : [];

    this.renderSimpleBadges(badges);

    const mode = this.getStatsLayoutMode();
    const normalized = this.normalizeHistory(history);
    this._lastHistoryNormalized = normalized;  // pour re-render au resize
    this.renderQuickHistory(normalized.slice(0, mode.historyCap));
};


UICharts.prototype.renderQuickHistory = function (history) {
    const container = document.getElementById('quiz-history-list');
    if (!container) return;

    if (!history || history.length === 0) {
        container.innerHTML = `
      <div class="text-center py-4 text-gray-500">
        <div class="text-2xl mb-2">ðŸ“</div>
        <div class="text-sm">No quiz history yet</div>
        <div class="text-xs text-gray-400 mt-1">Complete a quiz to see your activity</div>
      </div>`;
        return;
    }

    container.innerHTML = history.map(item => {
        const themeName =
            this.uiCore?.themeIndexCache?.find(t => t.id === item.themeId)?.name ||
            this.getThemeName?.(item.themeId) || `Theme ${item.themeId ?? ''}`;

        const accuracy = (Number.isFinite(item.total) && item.total > 0)
            ? Math.round((item.score / item.total) * 100)
            : (typeof item.accuracy === 'number' ? Math.round(item.accuracy) : 0);

        const sentiment = accuracy >= 70 ? 'ðŸŒŸ' : accuracy >= 50 ? 'ðŸ’ª' : 'ðŸŽ¯';

        let timeAgo = 'Recently';
        if (item.date) {
            const ts = Date.parse(item.date);
            if (Number.isFinite(ts)) {
                const hours = Math.floor((Date.now() - ts) / 3600000);
                timeAgo = hours < 1 ? 'Now' : hours < 24 ? 'Today' : `${Math.floor(hours / 24)}d ago`;
            }
        }

        return `
      <div class="flex items-center gap-2 p-2 bg-gray-50 rounded mb-2 last:mb-0">
        <span class="text-lg">${sentiment}</span>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium text-gray-800 truncate">${themeName}</div>
          <div class="text-xs text-gray-600">${accuracy}% â€¢ ${timeAgo}</div>
        </div>
      </div>`;
    }).join('');
};



UICharts.prototype.getThemeName = function (themeId) {
    const themeNames = {
        1: 'Colors', 2: 'Numbers', 3: 'Gender', 4: 'Singular/Plural', 5: 'Present Tense',
        6: 'Accents', 7: 'Ã‡a va', 8: 'Metro', 9: 'Boulangerie', 10: 'CafÃ©'
    };
    return themeNames[themeId] || `Theme ${themeId}`;
};

UICharts.prototype.getProgressMessage = function (quizzes, accuracy) {
    if (accuracy < 60 && quizzes <= 5) {
        return "Building authentic French skills!";
    }
    if (accuracy >= 60 && quizzes >= 3) {
        return "Strong momentum building!";
    }
    if (accuracy >= 80) {
        return "Mastering authentic French!";
    }
    return "Real progress in authentic French!";
};

UICharts.prototype.getAccuracyMessage = function (accuracy, quizzes) {
    if (accuracy < 40) {
        return "Learning authentic French - it's challenging!";
    }
    if (accuracy >= 40 && accuracy < 70) {
        return "Good progress on real French!";
    }
    if (accuracy >= 70) {
        return "Excellent authentic French level!";
    }
    return "Discovering your French potential!";
};

//================================================================================
// BADGES SIMPLES
//================================================================================
UICharts.prototype.renderSimpleBadges = function (badges) {
    const container = document.getElementById('badges-display-container');
    if (!container) return;

    if (!badges || badges.length === 0) {
        // Supprime toute la carte â€œAchievementsâ€ si vide
        const card = container.closest('.theme-card');
        if (card && card.parentElement) {
            card.parentElement.removeChild(card);
        } else {
            container.innerHTML = '';
        }
        return;
    }

    container.innerHTML = badges.slice(0, 6).map(badge => `
    <div class="bg-gradient-to-r from-blue-50 to-purple-50 p-2 rounded-lg text-center border border-blue-100">
      <div class="text-lg mb-1">${(badge && badge.icon) ? badge.icon : 'ðŸ†'}</div>
      <div class="text-xs font-medium text-gray-700">${(badge && badge.name) ? badge.name : 'Achievement'}</div>
    </div>
  `).join('');
};


UICharts.prototype.getAchievementPreview = function (quizzes, accuracy) {
    if (quizzes <= 3) {
        return `
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-2">
                <div class="text-2xl mb-1">ðŸŽ¯</div>
                <div class="text-sm font-bold">Perfect Quiz Badge</div>
                <div class="text-xs text-gray-600">Get 100% on any quiz</div>
            </div>
            <p class="text-xs text-gray-600">You're building real French skills!</p>`;
    }

    if (quizzes >= 4 && accuracy < 70) {
        return `
            <div class="grid grid-cols-2 gap-2 mb-2">
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center">
                    <div class="text-lg">ðŸ’Ž</div>
                    <div class="text-xs font-bold">100 FP</div>
                </div>
                <div class="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
                    <div class="text-lg">ðŸ”¥</div>
                    <div class="text-xs font-bold">Streak</div>
                </div>
            </div>
            <p class="text-xs text-gray-600">Strong progress unlocks achievements faster!</p>`;
    }

    return `
        <div class="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-2">
            <div class="text-2xl mb-1">ðŸ‘‘</div>
            <div class="text-sm font-bold">French Master</div>
            <div class="text-xs text-gray-600">Complete all themes with 80%+ average</div>
        </div>
        <p class="text-xs text-gray-600">You're mastering authentic French!</p>`;
};


UICharts.prototype.generateCompactLevelCard = function (data, uiState) {
    const fp = data.frenchPoints || 0;
    const level = Math.floor(fp / 50) + 1;
    const toNext = 50 - (fp % 50);

    return `
  <div class="theme-card">
    <div class="flex items-center justify-between">
      <div id="stats-current-level" class="text-xl font-bold">Level ${level}</div>

      <div class="text-right">
        <div class="font-bold text-blue-600">${fp} FP</div>
        <div class="text-xs text-gray-600">${toNext} to next level</div>
      </div>
    </div>
    <div class="mt-2 text-sm text-gray-700 text-center">
      ${this.getMotivationalMessage(fp, uiState)}
    </div>
  </div>`;
};



//================================================================================
// HISTORIQUE SIMPLE
//================================================================================


UICharts.prototype.generateHistoryItem = function (item) {
    const theme = this.uiCore?.themeIndexCache?.find(t => t.id === item.themeId);
    const themeName = theme?.name || 'French Practice';
    const accuracy = item.accuracy || 0;
    const sentiment = accuracy >= 70 ? 'ðŸŒŸ' : 'ðŸ’ª';
    const message = accuracy >= 70 ? 'Great!' : 'Keep going!';

    let timeAgo = 'Recently';
    if (item.date) {
        const date = new Date(item.date);
        const hours = Math.floor((Date.now() - date) / (1000 * 60 * 60));
        if (hours < 1) timeAgo = 'Now';
        else if (hours < 24) timeAgo = 'Today';
        else timeAgo = `${Math.floor(hours / 24)}d ago`;
    }

    return `
        <div class="flex items-center gap-2 p-2 bg-gray-50 rounded mb-2">
            <span class="text-lg">${sentiment}</span>
            <div class="flex-1 min-w-0">
                <div class="text-xs font-medium text-gray-800 truncate">${themeName}</div>
                <div class="text-xs text-gray-600">${message} â€¢ ${timeAgo}</div>
            </div>
        </div>`;
};


//================================================================================
// NOUVELLES FONCTIONS POUR PAGE STATS COMPLÃˆTE
//================================================================================
UICharts.prototype.generateFullStatsPage = function () {
    const data = this.storageManager.getVisualizationData();
    const uiState = this.storageManager.getUIState();
    const showBadges = Array.isArray(data.badges) && data.badges.length > 0;

    return `
  <div id="stats-root" class="bg-gradient-to-br from-blue-50 to-purple-50" role="main"
       style="height:calc(100vh - var(--tyf-header-h,0px)); overflow:auto;">
    <div class="max-w-4xl mx-auto h-full px-4 py-4 flex flex-col">
      <div class="shrink-0">${this.generateStatsHeader()}</div>

      <div class="grid flex-1 min-h-0 gap-4 lg:grid-cols-[1fr,22rem]">
        <!-- Colonne principale : scroll interne si besoin -->
        <div class="flex flex-col gap-4 min-h-0 lg:overflow-auto">
          ${this.generateCompactLevelCard(data, uiState)}
          ${this.generateCompactStatsGrid(data)}
          ${this.generateCompactMainCTA()}
          ${this.generateCompactHowItWorks()}
        </div>

        <!-- Sidebar : scroll interne si contenu dÃ©passe -->
        <aside class="flex flex-col gap-4 min-h-0 lg:overflow-auto">
          ${showBadges ? this.generateCompactBadgesContainer() : ''}
          ${this.generateCompactHistoryContainer()}
        </aside>
      </div>
    </div>
  </div>`;
};


UICharts.prototype.generateStatsHeader = function () {
    return `
    <div class="flex items-center justify-between mb-4">
        <button id="back-to-welcome-btn" class="quiz-button text-blue-600 border-blue-200 hover:border-blue-300">
            <span class="mr-2">â†</span>Back to Home
        </button>
        <h1 class="text-xl font-bold text-gray-800">Your Progress</h1>
        <div class="w-20"></div>
    </div>`;
};

UICharts.prototype.generateLevelCard = function (data, uiState) {
    const frenchPoints = data.frenchPoints || 0;
    const level = Math.floor(frenchPoints / 50) + 1;
    const pointsToNext = 50 - (frenchPoints % 50);

    return `
    <div class="theme-card bg-white mb-4 text-center">
      <div class="flex items-center justify-center gap-4 mb-2">
        <div class="text-3xl">ðŸ‡«ðŸ‡·</div>
        <div class="text-center">
          <div class="text-sm text-gray-600">You're at</div>
          <div id="stats-current-level" class="text-2xl font-bold text-blue-700">Level ${level}</div>
        </div>
        <div class="text-right">
          <div class="text-xl font-bold text-blue-600">${frenchPoints} FP</div>
          <div class="text-sm text-gray-600">${pointsToNext} to Level ${level + 1}</div>
        </div>
      </div>
      <div class="text-xs rounded bg-gray-50 border border-gray-200 px-3 py-2 text-gray-700">
        Earn FP from quizzes & daily chests to reach the next level
      </div>
      <div class="text-sm text-gray-600 mt-2">
        ${this.getMotivationalMessage(frenchPoints, uiState)}
      </div>
    </div>`;
};

UICharts.prototype.generateStatsCards = function (data) {
    const completedQuizzes = data.completedQuizzes || 0;
    const globalAccuracy = data.globalAccuracy || 0;

    let accuracyMessage = "Keep practicing!";
    let accuracyColor = "text-orange-600";

    if (globalAccuracy >= 70) {
        accuracyMessage = "Excellent level!";
        accuracyColor = "text-green-600";
    } else if (globalAccuracy >= 50) {
        accuracyMessage = "Good progress!";
        accuracyColor = "text-blue-600";
    }

    return `
    <div class="grid grid-cols-2 gap-4 mb-4">
        <div class="theme-card text-center">
            <div class="text-2xl mb-2">ðŸ†</div>
            <div id="stats-quizzes-completed" class="text-2xl font-bold text-blue-600">${completedQuizzes}</div>
            <div class="text-sm text-gray-600">Tests Completed</div>
        </div>
        <div class="theme-card text-center">
            <div class="text-2xl mb-2">ðŸŽ¯</div>
            <div id="stats-average-score" class="text-2xl font-bold ${accuracyColor}">${globalAccuracy}%</div>
            <div class="text-xs text-gray-600">${accuracyMessage}</div>
        </div>
    </div>`;
};
UICharts.prototype.generateMainCTA = function (uiState) {
    const hasCompletedColors = uiState.completedQuizzes > 0;

    if (!hasCompletedColors) {
        return `
      <div class="theme-card bg-gradient-to-r from-green-500 to-blue-500 text-white text-center mb-4">
        <div class="text-xl mb-3">Ready to Test Your French?</div>
        <p class="mb-4 opacity-90">Start with Colors - your first authentic French challenge!</p>
        <button id="start-colors-btn" class="quiz-button bg-white text-blue-600 hover:bg-blue-50">
          Start Colors Quiz â†’
        </button>
      </div>`;
    }

    return `
    <div class="theme-card bg-gradient-to-r from-purple-600 to-blue-600 text-white text-center mb-4">
      <div class="text-xl mb-2">Continue Your French Journey</div>
      <p class="mb-4 opacity-90">9 more themes waiting â€¢ Authentic situations â€¢ Only $12</p>
      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <button id="next-quiz-action-btn" class="quiz-button bg-white text-purple-600 hover:bg-purple-50">
          Take Next Quiz
        </button>
        <button id="get-premium-btn" class="quiz-button bg-yellow-400 hover:bg-yellow-300 text-purple-900 font-bold">
          Get All Themes â€” $12
        </button>
      </div>
    </div>`;
};


UICharts.prototype.generateHowItWorksSimple = function () {
    return `
    <div class="theme-card mb-4">
      <h3 class="text-lg font-bold text-gray-800 mb-4 text-center">How French Points Work</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-sm">
        <div class="space-y-2">
          <div class="text-2xl">âœ…</div>
          <div class="font-medium">Take Quizzes</div>
          <div class="text-gray-600">1â€“10 FP based on score</div>
        </div>
        <div class="space-y-2">
          <div class="text-2xl">ðŸ“…</div>
          <div class="font-medium">Daily Reward</div>
          <div class="text-gray-600">+3â€“4 FP (70%:3 â€¢ 30%:4)</div>
        </div>
        <div class="space-y-2">
          <div class="text-2xl">ðŸ”“</div>
          <div class="font-medium">Unlock Themes</div>
          <div class="text-gray-600">25 / 50 / 75 / 100 FP</div>
        </div>
      </div>
    </div>`;
};
UICharts.prototype.generateCompactHowItWorks = function () {
    return `
  <div class="theme-card">
    <h3 class="text-sm font-bold text-gray-900 mb-2">How it works</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm text-gray-700">
      <div class="flex items-start gap-2">
        <span>ðŸŽ¯</span>
        <div>
          <div class="font-medium">Quizzes</div>
          <div class="text-xs text-gray-600">Earn 1 French Point per correct answer. Points only count the first time you take a quiz.</div>
        </div>
      </div>
      <div class="flex items-start gap-2">
        <span>ðŸŽ</span>
        <div>
          <div class="font-medium">Daily chest</div>
          <div class="text-xs text-gray-600">+3 or +4 French Points once a day.</div>
        </div>
      </div>
      <div class="flex items-start gap-2">
        <span>ðŸ”“</span>
        <div>
          <div class="font-medium">Unlock themes</div>
          <div class="text-xs text-gray-600">25 / 50 / 75 / 100 French Points per theme.</div>
        </div>
      </div>
    </div>
  </div>`;
};


UICharts.prototype.generateCompactStatsGrid = function (data) {
    const completedQuizzes = data.completedQuizzes || 0;
    const globalAccuracy = data.globalAccuracy || 0;

    return `
  <div class="grid grid-cols-2 gap-3">
    <div class="theme-card p-3 text-center">
      <div class="text-lg mb-1">ðŸ†</div>
      <div id="stats-quizzes-completed" class="text-xl font-bold text-blue-600">${completedQuizzes}</div>
      <div class="text-xs text-gray-600">Quizzes Completed</div>
    </div>
    <div class="theme-card p-3 text-center">
      <div class="text-lg mb-1">ðŸŽ¯</div>
      <div id="stats-average-score" class="text-xl font-bold ${globalAccuracy >= 70 ? 'text-green-600' : globalAccuracy >= 50 ? 'text-blue-600' : 'text-orange-600'}">${globalAccuracy}%</div>
      <div class="text-xs text-gray-600">${globalAccuracy >= 70 ? 'Excellent!' : globalAccuracy >= 50 ? 'Good!' : 'Keep going!'}</div>
    </div>
  </div>`;
};


UICharts.prototype.generateCompactMainCTA = function () {
    return `
  <div class="theme-card">
    <div class="text-lg font-bold text-gray-900">Continue your French</div>
    <p class="text-sm text-gray-700 mt-1">9 more themes â€¢ Authentic situations â€¢ Only $12</p>

    <div class="mt-3">
      <button id="get-premium-btn"
              class="quiz-button bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
        Unlock all â€” $12
      </button>
    </div>
  </div>`;
};




UICharts.prototype.generateCompactBadgesContainer = function () {
    return `
    <div class="theme-card">
      <h3 class="text-base font-semibold mb-3 text-gray-800">ðŸ† Achievements</h3>
      <div id="badges-display-container" class="grid grid-cols-2 gap-2">
        <div class="col-span-2 text-center py-3">
          <div class="text-lg mb-1">ðŸ†</div>
          <p class="text-xs text-gray-600">Loading achievements...</p>
        </div>
      </div>
    </div>`;
};

UICharts.prototype.generateCompactHistoryContainer = function () {
    return `
  <div class="theme-card">
    <h3 class="text-base font-semibold mb-3 text-gray-800">ðŸ“š Recent Activity</h3>
    <div id="quiz-history-list">
      <div class="text-center py-4 text-gray-500">
        <div class="text-2xl mb-2">ðŸ“š</div>
        <p class="text-sm">Loading recent activity...</p>
      </div>
    </div>
  </div>`;
};


UICharts.prototype.setupAllStatsEvents = function () {
    console.log("ðŸŽ¯ Setting up all stats event listeners");

    const addButtonWithFeedback = (buttonId, handler) => {
        const btn = document.getElementById(buttonId);
        if (btn) {
            btn.replaceWith(btn.cloneNode(true));
            const newBtn = document.getElementById(buttonId);
            const press = ["opacity-70", "scale-95", "transition", "duration-150"];
            newBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                newBtn.classList.add(...press);
                newBtn.disabled = true;
                try { await handler(); } finally {
                    setTimeout(() => { newBtn.classList.remove(...press); newBtn.disabled = false; }, 180);
                }
            });
        }
    };

    addButtonWithFeedback('back-to-welcome-btn', () => this.uiCore.showWelcomeScreen());
    addButtonWithFeedback('get-premium-btn', () => this.handlePremiumClick());


    // NEW: refresh
    const refresh = document.getElementById('refresh-stats-btn');
    if (refresh) {
        refresh.replaceWith(refresh.cloneNode(true));
        const r = document.getElementById('refresh-stats-btn');
        r.addEventListener('click', (e) => { e.preventDefault(); this.loadDetailedStats(); });
    }

    console.log("âœ… Stats event listeners configured");
};


UICharts.prototype.handlePremiumClick = function () {
    // 1) Flux achat fourni par l'app (prÃ©fÃ©rÃ©)
    if (this.uiCore?.features?.handlePurchase) {
        this.uiCore.features.handlePurchase();
        return;
    }

    // 2) Lien du header (ex: #app-header ...)
    const headerBuy =
        document.querySelector('#app-header a[href^="https://buy.stripe.com"]') ||
        document.querySelector('#app-header a[data-role="buy"]') ||
        document.querySelector('a[aria-label="Buy all themes"]');
    if (headerBuy) {
        headerBuy.click();
        return;
    }

    // 3) Config (si rÃ©ellement renseignÃ©e)
    const url = (window.TYF_CONFIG && typeof TYF_CONFIG.stripePaymentUrl === 'string')
        ? TYF_CONFIG.stripePaymentUrl
        : '';
    if (url && !/your-real-payment-link/.test(url)) {
        window.open(url, '_blank');
        return;
    }

    // 4) Sinon on laisse lâ€™utilisateur utiliser le bouton du header
    alert('Purchase link is in the header. Please use the Buy button at the top.');
};

UICharts.prototype.getMotivationalMessage = function (frenchPoints, uiState) {
    const completedQuizzes = uiState.completedQuizzes || 0;

    if (frenchPoints >= 200) {
        return "You're mastering authentic French!";
    } else if (frenchPoints >= 100) {
        return "Great momentum! Keep it up!";
    } else if (completedQuizzes >= 3) {
        return "You're building solid French foundations!";
    } else if (completedQuizzes >= 1) {
        return "Good start! Ready for more challenges?";
    } else {
        return "Your French journey starts here!";
    }
};



//================================================================================
// UTILITAIRES SIMPLES
//================================================================================
UICharts.prototype.adjustViewportHeight = function () {
    const root = document.getElementById('stats-root');
    if (!root) return;
    const header = document.getElementById('app-header');
    const footer = document.getElementById('app-footer');

    const apply = () => {
        const h = header ? header.offsetHeight : 0;
        const f = footer ? footer.offsetHeight : 0;
        root.style.height = `calc(100vh - ${h + f}px)`;
        root.style.overflowY = 'auto';   // le scroll se fait dans #stats-root
        document.body.style.overflow = ''; // ne bloque pas le body
    };

    apply();
    window.addEventListener('resize', apply, { passive: true });
};


UICharts.prototype.updateStat = function (elementId, value) {
    const element = document.getElementById(elementId);
    if (element) element.textContent = value;
};

UICharts.prototype.init = function () {
    console.log("âœ… UICharts v3.1 Simplified ready");
};

window.UICharts = UICharts;
