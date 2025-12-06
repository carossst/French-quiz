// ui-core.js v3.0
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
    }

    UICore.prototype.showError = function (message) {
        if (typeof window.showErrorMessage === 'function') {
            window.showErrorMessage(message);
        } else {
            console.error("UICore Error:", message);
        }
    };

    UICore.prototype.start = async function () {
        if (this.isInitialized) return;

        try {
            await this.loadThemeIndex();
            this.initializeDependencies();
            this.showWelcomeScreen();
            this.isInitialized = true;
        } catch (error) {
            this.showError("Unable to load application. Please refresh.");
            alert("JS ERROR: " + (error?.message || error));
            throw error;
        }
    };




    UICore.prototype.initializeDependencies = function () {
        this.features = new UIFeatures(this, this.storageManager, this.resourceManager);
        this.features.initializeXPSystem();
        this.features?.updateUserGreeting?.();
        this.features?.addChestIconToHeader?.();


        this.charts = typeof UICharts !== 'undefined'
            ? new UICharts(this, this.storageManager, this.resourceManager)
            : { loadDetailedStats: () => Promise.resolve() };
        if (this.features.setupGlobalEventListeners) {
            this.features.setupGlobalEventListeners();
        }
    };

    UICore.prototype.loadThemeIndex = async function () {
        const metadata = await this.resourceManager.loadMetadata();
        this.themeIndexCache = metadata.themes || [];
    };

    UICore.prototype.showScreen = function (screenId, htmlGenerator) {
        try {
            this.currentScreen = screenId;
            this.appContainer.innerHTML = htmlGenerator.call(this);
            this.setupScreenEvents(screenId);
        } catch (error) {
            this.showError(`Unable to load ${screenId} screen`);
        }
    };

    UICore.prototype.setupScreenEvents = function (screenId) {
        switch (screenId) {
            case 'welcome':
                this.setupWelcomeEvents();
                if (this.features) {
                    this.features.showXPHeader(); // affichage immediat
                    this.features.updateXPHeader(); // synchronisation
                }
                break;
            case 'quiz-selection':
                this.setupQuizSelectionEvents();
                break;
            case 'quiz':
                this.setupQuizEvents();
                break;
            case 'results':
                this.setupResultsEvents();
                break;
            case 'stats':
                this.setupStatsEvents();
                break;
        }
    };

    UICore.prototype.showWelcomeScreen = function () {
        this.showScreen('welcome', this.generateWelcomeHTML);
    };

    UICore.prototype.generateWelcomeHTML = function () {
        const uiState = this.storageManager.getUIState();
        const isNewUser = uiState.completedQuizzes === 0;

        if (isNewUser) {
            return this.generateNewUserWelcome();
        } else {
            return this.generateReturningUserWelcome(uiState);
        }
    };

    UICore.prototype.generateNewUserWelcome = function () {

        return `
    <section class="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
      <div class="max-w-2xl text-center px-6 py-12">
        <h1 class="text-3xl md:text-4xl font-bold text-blue-700 mb-4">
         ‡«‡· Test Your French
        </h1>
        <!-- DISCOVER YOUR LEVEL -->
<div class="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6 rounded-r-lg">
  <p class="text-blue-800 font-medium">
   ‡«‡· Authentic French from Paris - discover your real level!
   Test yourself with genuine daily situations that French natives encounter.
  </p>
</div>
        
        <p class="text-lg text-gray-600 mb-6">
          Authentic French tests -“ try the free <strong>Colors</strong> quiz Ž¯
        </p>       
        <button id="start-first-quiz-btn" class="cta-primary w-full sm:w-auto">
          â–¶ï¸ Start the Colors Quiz
        </button>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12 text-center">
          <div>
            <div class="text-2xl mb-2">Ž§</div>
            <p class="text-gray-700 text-sm">Authentic audio</p>
          </div>
          <div>
            <div class="text-2xl mb-2">†</div>
            <p class="text-gray-700 text-sm">Real assessment</p>
          </div>
          <div>
            <div class="text-2xl mb-2">“ˆ</div>
            <p class="text-gray-700 text-sm">Track progress</p>
          </div>
        </div>
      </div>
    </section>
    `;
    };




    // Genere automatiquement le message d'urgence selon le mois
    UICore.prototype.getUrgencyMessage = function () {
        const now = new Date();
        const currentMonth = now.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
        const currentYear = now.getFullYear();

        const messages = {
            'january': 'New year, new level - Test your resolutions!',
            'february': 'February break coming - Check your progress',
            'march': 'Spring is coming - Refresh your French!',
            'april': 'Easter holidays - Evaluate your level!',
            'may': 'May holidays ahead - Test before vacation',
            'june': 'Summer vacation soon - Final assessment!',
            'july': 'Summer time - Perfect for testing',
            'august': 'Back to school soon - Test your level now',
            'september': 'Back to work - Test your summer French',
            'october': 'Autumn focus - Check your progress',
            'november': 'Year-end approaching - Review your progress',
            'december': 'Holiday season - Gift yourself progress!'
        };

        return `Limited time: ${currentMonth} ${currentYear} - ${messages[currentMonth]}`;
    };


    UICore.prototype.generateReturningUserWelcome = function (uiState) {
        return `
    <div class="bg-gradient-to-br from-blue-50 to-purple-50 min-h-screen" role="main">
        <!-- Header XP sticky -->
        <div id="xp-header"></div>
        
        <!-- Themes section -->
        <div id="themes-section" class="max-w-6xl mx-auto px-4">
            <div class="text-center mb-4">
                <h2 class="text-xl font-bold text-gray-800">Choose Your Theme</h2>
            </div>
            <div id="themes-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                ${this.generateSimpleThemesGrid()}
            </div>
        </div>

        <!-- Footer -->
        <div class="text-center py-4">
            <button id="view-stats-btn" class="text-gray-600 hover:text-gray-800 underline">
                View Your Statistics
            </button>
        </div>
    </div>`;
    };

    UICore.prototype.showResults = function (resultsData) {
        this.showScreen('results', () => {
            const html = this.generateResultsHTML(resultsData);
            setTimeout(() => {

                if (this.features?.updateXPHeader) {
                    this.features.updateXPHeader();
                }
            }, 200);

            return html;
        });

        if (this.features.handleResultsFP) {
            this.features.handleResultsFP(resultsData);
        }
    };

    UICore.prototype.generateResultsHTML = function (resultsData) {

        const isExcellent = resultsData.percentage >= 80;
        const isGood = resultsData.percentage >= 60;
        const isFail = resultsData.percentage < 40;

        // Recupere le message personnalise (rotatif ou special echec)
        let feedbackMsg = '';
        if (resultsData.score === 0) {
            feedbackMsg = "You gave it a try -“ that's what counts! * Try the Colors theme again to improve Ž¨";
        } else if (this.features?.getRotatedFeedbackMessage) {
            feedbackMsg = this.features.getRotatedFeedbackMessage(resultsData.percentage, resultsData.themeId);
        }

        return `
<div class="quiz-wrapper" role="main">
    <div class="text-center">
        
        <div class="mb-8">
            <div class="text-5xl mb-4 animate-bounce">
                ${isExcellent ? 'Ž‰' : isGood ? '†' : '*'}
            </div>
            <h1 class="text-4xl font-bold mb-4 ${isExcellent ? 'text-green-600' : isGood ? 'text-blue-600' : 'text-orange-600'}">
                ${isExcellent ? 'Excellent!' : isGood ? 'Well Done!' : 'Keep Going!'}
            </h1>
            <div class="text-6xl font-bold text-gray-800 mb-4">
                ${resultsData.percentage}%
            </div>
            ${feedbackMsg ? `<div class="feedback-content correct mt-4">${feedbackMsg}</div>` : ''}
        </div>

    <div class="fp-display mb-6">
    <div class="text-3xl mb-2">’Ž</div>
    <div class="text-lg font-bold text-purple-800 mb-1 whitespace-pre-line">
        ${this.features?.getCompletionMessage ? this.features.getCompletionMessage(resultsData.percentage, resultsData.score) : `+${resultsData.score} French Points earned!`}
    </div>
</div>

        <div class="mb-6">
            ${this.generateNextActionButton(resultsData)}
        </div>

        <div class="mb-6">
            <button id="toggle-details-btn" class="quiz-button">
                View Detailed Analysis
            </button>
        </div>

        <div id="detailed-stats" class="hidden">
            <h3 class="text-lg font-bold text-gray-800 mb-4">“Š Performance Analysis</h3>
            
            <div class="mb-4 p-4 rounded-lg ${this.getCECRColorClass(resultsData.percentage)}">
                <div class="font-bold mb-2">Ž¯ Level </div>
                <div class="text-lg font-bold">${this.getCECRLevel(resultsData.percentage)}</div>
                <div class="text-sm">${this.getCECRMessage(resultsData.percentage)}</div>
            </div>

            <div id="questions-review">
                <h4 class="font-bold text-gray-800 mb-3">” Question Review</h4>
                <div class="text-sm text-gray-600">Loading detailed review...</div>
            </div>
        </div>

       <div class="flex flex-col md:flex-row gap-3 justify-center">
            <button id="quit-quiz-btn" class="quiz-button">
                â† Back to Theme
            </button>
            <button id="back-to-themes-btn" class="quiz-button">
                  Home
            </button>
        </div>
    </div>
</div>`;
    };

    UICore.prototype.showQuizScreen = function () {
        this.showScreen('quiz', this.generateQuizHTML);
        setTimeout(() => {
            this.renderCurrentQuestion();
        }, 100);
    };

    UICore.prototype.renderCurrentQuestion = function () {
        const question = this.quizManager.getCurrentQuestion();
        if (!question) {
            console.error("UICore: No current question to render");
            return;
        }

        const questionContainer = document.getElementById('question-container');
        if (!questionContainer) {
            console.error("UICore: question-container not found");
            return;
        }

        const feedbackContainer = document.getElementById('feedback-container');
        if (feedbackContainer) {
            feedbackContainer.classList.add('hidden');
            feedbackContainer.innerHTML = '';
        }

        // Generer et afficher la question
        questionContainer.innerHTML = this.generateQuestionHTML(question);

        // Configurer les evenements pour cette question
        this.setupQuestionEvents(question);

        // Mettre a jour la progression
        this.updateQuizProgress();
    };

    UICore.prototype.generateQuizHTML = function () {
        const progress = this.quizManager.getQuizProgress?.() || { current: 1, total: 10, percentage: 0 };

        return `
  <div class="quiz-wrapper" role="main" aria-label="Quiz screen">
    <!-- Barre d'en-tete compacte -->
    <div class="flex items-center justify-between mb-4">
      <div class="text-sm text-gray-600">
        <span id="quiz-progress-count">${progress.current}/${progress.total}</span>
      </div>
      <div class="flex items-center gap-2">
        <button id="go-themes-btn" class="quiz-button">â† Back</button>
        <button id="home-quiz-btn" class="quiz-button">  Home</button>
      </div>
    </div>

    <!-- Barre de progression -->
    <div class="w-full h-2 bg-gray-200 rounded-full mb-6" aria-hidden="true">
      <div id="quiz-progress-bar" class="h-2 bg-amber-400 rounded-full transition-all w-pct-0"></div>

    </div>

    <!-- Contenu question / reponses -->
    <div id="question-container" class="space-y-4"></div>

    <!-- Feedback (bonne/mauvaise reponse, "Did you know?") -->
    <div id="feedback-container" class="mt-6" role="status" aria-live="polite"></div>


    <!-- Navigation questions -->
    <div class="mt-6 flex items-center justify-between">
      <button id="prev-question-btn" class="quiz-button">â—€ï¸Ž Previous</button>
      <button id="next-question-btn" class="quiz-button">Next â–¶ï¸Ž</button>
    </div>
  </div>`;
    };



    UICore.prototype.showQuizSelection = function () {
        this.showScreen('quiz-selection', this.generateQuizSelectionHTML);
    };

    UICore.prototype.generateQuizSelectionHTML = function () {
        const themeId = this.quizManager.currentThemeId;
        const theme = this.themeIndexCache?.find(t => t.id === themeId);

        if (!theme) {
            return this.generateErrorHTML("Theme not found");
        }

        return `
    <div class="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50" role="main">
        <div class="max-w-4xl mx-auto px-4">
      <div class="flex gap-4 mb-6">
    <button id="back-to-themes-btn" class="text-blue-600 hover:text-blue-800 font-medium py-2 px-6 rounded-lg border border-blue-200 hover:border-blue-300 transition-colors">
          Home
    </button>   
</div>
            
            <div class="text-center mb-8">
                <div class="text-4xl mb-4">${theme.icon}</div>
                <h1 class="text-3xl md:text-4xl font-bold text-gray-800 mb-4">${theme.name}</h1>
                <p class="text-lg text-gray-600">${theme.description}</p>
            </div>
            
            <div id="quizzes-grid" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                ${this.generateQuizCards(theme.quizzes)}
            </div>
        </div>
    </div>`;
    };

    UICore.prototype.showStatsScreen = function () {
        if (!this.charts) {
            console.error("UICharts not initialized");
            this.showError("Statistics temporarily unavailable. Please refresh the page.");
            return;
        }

        this.showScreen('stats', () => {
            try {
                return this.charts.generateFullStatsPage();
            } catch (error) {
                console.error("Error generating stats page:", error);
                return this.generateFallbackStatsHTML();
            }
        });
    };

    UICore.prototype.generateFallbackStatsHTML = function () {
        return `
    <div class="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
        <div class="max-w-2xl mx-auto">
            <div class="theme-card text-center">
                <h2 class="text-xl font-bold mb-4">“Š Your Progress</h2>
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p class="text-blue-700">Statistics are being prepared...</p>
                </div>
                <button id="back-to-welcome-btn" class="quiz-button">
                    â† Back to Home
                </button>
            </div>
        </div>
    </div>`;
    };

    UICore.prototype.setupStatsEvents = function () {
        // Bouton retour vers accueil
        this.addClickHandler('back-to-welcome-btn', () => this.showWelcomeScreen());

        // Charger les donnees stats apres rendu HTML
        if (this.charts && this.charts.loadDetailedStats) {
            setTimeout(() => this.charts.loadDetailedStats(), 100);
        }
    };

    UICore.prototype.generateQuestionHTML = function (question) {
        const questionText = question.question || question.text || 'Question text missing';
        const hasAudio = question.audio;
        const questionNumber = this.quizManager.currentIndex + 1;
        const totalQuestions = this.quizManager.currentQuiz?.questions?.length || 0;

        return `
    <div class="question-content">
        ${hasAudio ? this.generateAudioHTML(question.audio) : ''}
        
        <div class="question-header mb-4">
            <div class="flex items-center justify-between mb-4">
                <span class="text-sm font-medium text-gray-600">${this.quizManager.currentQuiz?.name || ''} - Question ${questionNumber} of ${totalQuestions}</span>
                <span class="text-sm text-blue-600 font-medium">Choose the best answer</span>
            </div>
            
            <h2 class="text-xl md:text-2xl font-bold text-gray-800 leading-relaxed">${questionText}</h2>
        </div>
        
        <div class="options-container space-y-3" role="radiogroup" aria-label="Answer choices">

            ${question.options.map((option, index) => this.generateOptionHTML(option, index)).join('')}
        </div>
        
        ${question.hint ? `
            <div class="question-hint mt-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">
                <div class="flex items-start">
                    ’¡
                    <div>
                        <div class="font-medium text-blue-800 mb-1">Hint:</div>
                        <div class="text-blue-700 text-sm">${question.hint}</div>
                    </div>
                </div>
            </div>
        ` : ''}
    </div>`;
    };

    UICore.prototype.generateAudioHTML = function (audioFilename) {
        console.log('Žµ generateAudioHTML called with:', audioFilename);

        const themeId = this.quizManager.currentThemeId;
        console.log('Žµ Current themeId:', themeId);

        const audioPath = this.resourceManager.getAudioPath(themeId, audioFilename);
        console.log('Žµ Generated audioPath:', audioPath);

        if (!audioPath) {
            console.error('âŒ No audioPath generated!');
            return '';
        }

        // ”§ CORRECTION PRINCIPALE - Ajouter src directement sur audio ET source
        return `
<div class="question-audio-container mb-6 text-center">
  <div class="bg-blue-50 rounded-lg p-4 inline-block">
    <audio class="question-audio hidden" preload="metadata" src="${audioPath}">
      <source src="${audioPath}" type="audio/mpeg">
      Your browser does not support audio.
    </audio>
    <button type="button" class="audio-play-btn bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors">
      Listen
    </button>
  </div>
</div>`;
    };


    UICore.prototype._stripChoiceLabel = function (s) {
        return String(s).replace(/^\s*[A-D]\s*[\.)]\s*/i, '').trim();
    };

    UICore.prototype.generateOptionHTML = function (option, index) {
        const letters = ['A', 'B', 'C', 'D'];
        const clean = this._stripChoiceLabel(option);

        return `
    <div class="option" data-option-index="${index}" role="radio" aria-checked="false" tabindex="0">
      <div class="flex items-center">
        <div class="option-indicator w-5 h-5 border-2 border-gray-400 rounded-full mr-4 flex-shrink-0 transition-colors">
          <div class="w-full h-full rounded-full bg-blue-600 transform scale-0 transition-transform"></div>
        </div>
        <span class="option-letter text-lg font-bold text-gray-600 mr-4">${letters[index]}.</span>
        <span class="option-text text-gray-800 font-medium flex-1">${clean}</span>
      </div>
    </div>`;
    };

    UICore.prototype.setupQuestionEvents = function (question) {
        const options = document.querySelectorAll('.option');
        options.forEach((option, index) => {
            option.addEventListener('click', () => this.selectOption(index, option));
            option.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.selectOption(index, option);
                }
            });
        });

        const container = document.querySelector('.question-audio-container');
        if (container) {
            const audio = container.querySelector('.question-audio');
            const btn = container.querySelector('.audio-play-btn');

            if (audio && btn) {
                // ”§ FONCTION CORRIGEE - Gestion d'erreur propre
                const playNow = () => {
                    audio.currentTime = 0;

                    // Promesse de lecture avec gestion d'erreur detaillee
                    audio.play()
                        .then(() => {
                            console.log('âœ… Audio playback started successfully');
                            btn.textContent = 'Replay';
                            btn.disabled = false;
                        })
                        .catch((error) => {
                            console.error('âŒ Audio playback failed:', error);

                            // Messages d'erreur specifiques selon le type d'erreur
                            if (error.name === 'NotAllowedError') {
                                btn.textContent = '”‡ Click to allow audio';
                                btn.disabled = false;
                            } else if (error.name === 'NotSupportedError') {
                                btn.textContent = 'âŒ Format not supported';
                                btn.disabled = true;
                            } else if (audio.error && audio.error.code === 4) {
                                btn.textContent = 'âŒ Audio file not found';
                                btn.disabled = true;
                            } else {
                                btn.textContent = 'âŒ Audio error - Try again';
                                btn.disabled = false;
                            }
                        });
                };

                // Event listener pour le bouton
                btn.addEventListener('click', () => {
                    btn.disabled = true;
                    btn.textContent = 'Loading...';

                    console.log('Žµ Audio button clicked, src:', audio.src);

                    if (audio.readyState >= 1) {
                        // Audio deja pret
                        playNow();
                    } else {
                        // Attendre que l'audio soit pret
                        let timeoutId = setTimeout(() => {
                            console.error('â° Audio loading timeout');
                            btn.textContent = 'âŒ Loading timeout';
                            btn.disabled = false;
                        }, 10000); // 10 secondes timeout

                        const onReady = () => {
                            clearTimeout(timeoutId);
                            playNow();
                        };

                        audio.addEventListener('loadedmetadata', onReady, { once: true });
                        audio.addEventListener('canplay', onReady, { once: true });

                        try {
                            audio.load();
                        } catch (loadError) {
                            console.error('âŒ Audio load() failed:', loadError);
                            clearTimeout(timeoutId);
                            btn.textContent = 'âŒ Cannot load audio';
                            btn.disabled = true;
                        }
                    }
                });

                // ”§ GESTION D'ERREUR AMELIOREE
                audio.addEventListener('error', (e) => {
                    console.error('âŒ Audio error event:', {
                        error: audio.error,
                        src: audio.src,
                        readyState: audio.readyState,
                        networkState: audio.networkState
                    });

                    if (audio.error) {
                        switch (audio.error.code) {
                            case 1: // MEDIA_ERR_ABORTED
                                btn.textContent = 'âŒ Audio loading cancelled';
                                break;
                            case 2: // MEDIA_ERR_NETWORK
                                btn.textContent = 'âŒ Network error';
                                break;
                            case 3: // MEDIA_ERR_DECODE
                                btn.textContent = 'âŒ Audio format error';
                                break;
                            case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                                btn.textContent = 'âŒ Audio file not found';
                                break;
                            default:
                                btn.textContent = 'âŒ Audio unavailable';
                        }
                    } else {
                        btn.textContent = 'âŒ Audio unavailable';
                    }
                    btn.disabled = true;
                });

                // Audio termine normalement
                audio.addEventListener('ended', () => {
                    console.log('âœ… Audio playback ended');
                    btn.textContent = 'Replay';
                    btn.disabled = false;
                });

                // ”§ VERIFICATION INITIALE DU FICHIER AUDIO
                // Verifier si le fichier existe vraiment
                if (audio.src) {
                    fetch(audio.src, { method: 'HEAD' })
                        .then(response => {
                            if (!response.ok) {
                                console.error('âŒ Audio file check failed:', response.status, audio.src);
                                btn.textContent = 'âŒ Audio file missing';
                                btn.disabled = true;
                            } else {
                                console.log('âœ… Audio file exists:', audio.src);
                            }
                        })
                        .catch(error => {
                            console.error('âŒ Audio file check error:', error, audio.src);
                            btn.textContent = 'âŒ Cannot verify audio';
                            btn.disabled = true;
                        });
                } else {
                    console.error('âŒ No audio src provided');
                    btn.textContent = 'âŒ No audio source';
                    btn.disabled = true;
                }
            }
        }
    };



    UICore.prototype.selectOption = function (index, optionElement) {
        try {
            document.querySelectorAll('.option').forEach(opt => {
                opt.classList.remove('selected');
                opt.setAttribute('aria-checked', 'false');
                const indicator = opt.querySelector('.option-indicator div');
                if (indicator) { indicator.classList.remove('scale-100'); indicator.classList.add('scale-0'); }
            });

            optionElement.classList.add('selected');
            optionElement.setAttribute('aria-checked', 'true');
            const indicator = optionElement.querySelector('.option-indicator div');
            if (indicator) { indicator.classList.remove('scale-0'); indicator.classList.add('scale-100'); }

            this.quizManager.selectAnswer(index);

            this.quizManager.validateCurrentAnswer();

            this.updateNavigationButtons();

            const nextBtn = document.getElementById('next-question-btn');
            if (nextBtn && !nextBtn.disabled) nextBtn.focus();
        } catch (error) {
            console.error("Error selecting option:", error);
        }
    };

    UICore.prototype.showQuestionFeedback = function (question, selectedIndex) {
        if (this.features?.showQuestionFeedback) {
            this.features.showQuestionFeedback(question, selectedIndex);
            return;
        }
        console.warn('UIFeatures.showQuestionFeedback missing - no feedback rendered.');
    };



    UICore.prototype.getThemeStateClass = function (theme) {
        if (theme.id === 1) return 'section-theme-free';
        if (this.storageManager.isPremiumUser()) return 'section-theme-premium';

        // Verifier si debloque avec FP
        const isUnlocked = this.storageManager.isQuizUnlocked(theme.id * 100 + 1);
        if (isUnlocked && !this.storageManager.isPremiumUser()) {
            return 'section-theme-unlocked';
        }

        return 'section-theme-locked';
    };

    UICore.prototype.generateSimpleThemesGrid = function () {
        if (!this.themeIndexCache || this.themeIndexCache.length === 0) {
            return '<div class="text-center text-gray-500">Loading themes...</div>';
        }

        // AFFICHER TOUS LES THEMES
        return this.themeIndexCache.map(theme => {
            return `
<div class="theme-item ${this.getThemeStateClass(theme)}" 
     data-theme-id="${theme.id}">
    <div class="text-center">
        <div class="text-2xl mb-2">${theme.icon}</div>
        <h3 class="text-sm font-bold mb-1">${theme.name}</h3>
        <p class="text-xs text-gray-600 line-clamp-2">${theme.description}</p>
        ${this.getThemeProgressDisplay(theme.id)}
    </div>
</div>`;
        }).join('');
    };

    UICore.prototype.getThemeProgressDisplay = function (themeId) {
        // Theme debloque - montrer progression
        if (this.storageManager.isThemeUnlocked(themeId)) {
            const progress = this.storageManager.getThemeProgress(themeId);
            const color = progress.completedCount > 0 ? 'green' : 'blue';
            return `<div class="text-xs text-${color}-600 mt-2">“š ${progress.completedCount}/${progress.total} completed</div>`;
        }

        const unlockStatus = this.storageManager.canUnlockTheme(themeId);

        if (unlockStatus.reason === "PREVIOUS_LOCKED") {
            const themeNames = {
                1: "Colors", 2: "Numbers", 3: "Gender", 4: "Singular and Plural",
                5: "Present Tense", 6: "Accents", 7: "Ca Va", 8: "Metro",
                9: "Boulangerie", 10: "Cafe"
            };
            const previousTheme = themeNames[themeId - 1] || `theme ${themeId - 1}`;

            const unlocked = this.storageManager.getUnlockedPremiumThemesCount?.() ?? 0;
            const realCost = this.storageManager.getThemeUnlockCost?.(unlocked + 1) ?? unlockStatus.cost;

            const isMobile = window.innerWidth < 640;

            if (isMobile) {
                return `<div class="text-xs text-gray-400 mt-2">”’ ${previousTheme} needed + ${realCost} FP * <span class="text-purple-600 cursor-pointer" data-action="show-premium-modal">’Ž or $12</span></div>`;
            } else {
                return `<div class="text-xs text-gray-400 mt-2">”’ Unlock ${previousTheme} first + ${realCost} FP needed * <span class="text-purple-600 cursor-pointer" data-action="show-premium-modal">’Ž or $12</span></div>`;
            }
        }

        // FP insuffisants pour debloquer
        if (!unlockStatus.canUnlock) {
            const needed = unlockStatus.cost - this.storageManager.getFrenchPoints();
            let message = `”’ ${needed} more FP needed * <span class="text-purple-600 cursor-pointer" data-action="show-premium-modal">’Ž or $12</span>`;

            return `<div class="text-xs text-gray-500 mt-2">${message}</div>`;
        }

        // Peut debloquer avec FP
        return `<div class="text-xs text-blue-600 mt-2">”“ ${unlockStatus.cost} FP to unlock * <span class="text-purple-600 cursor-pointer" data-action="show-premium-modal">’Ž or $12</span></div>`;
    };
    UICore.prototype.generateQuizCards = function (quizzes) {
        return quizzes.map(quiz => {
            const isUnlocked = this.storageManager.isQuizUnlocked(quiz.id);
            const isCompleted = this.storageManager.isQuizCompleted(quiz.id);

            return `
        <div class="quiz-item ${!isUnlocked ? 'opacity-60' : 'hover:shadow-lg cursor-pointer'} transition-all" 
             data-quiz-id="${quiz.id}">
            <div class="flex items-center justify-between mb-4">
                <span class="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
                    ${quiz.id % 10}
                </span>
                ${isCompleted ? 'âœ…' : ''}
                ${!isUnlocked ? '”’' : ''}
            </div>
            <h3 class="font-bold text-lg mb-2">${quiz.name}</h3>
            <p class="text-gray-600 text-sm">${quiz.description}</p>
        </div>`;
        }).join('') || '';
    };

    UICore.prototype.setupWelcomeEvents = function () {
        this.addClickHandler('start-first-quiz-btn', () => {
            this.quizManager.currentThemeId = 1;
            this.quizManager.loadQuiz(1, 101);
        });

        this.bindEvent('view-stats-btn', 'showStatsScreen');
        this.setupThemeClickEvents();
    };

    UICore.prototype.setupQuizSelectionEvents = function () {
        this.bindEvent('back-to-themes-btn', 'showWelcomeScreen');

        const quizCards = document.querySelectorAll('.quiz-item[data-quiz-id]');

        quizCards.forEach(card => {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const quizId = parseInt(card.dataset.quizId);

                if (this.storageManager.isQuizUnlocked(quizId)) {
                    // Mapping simple et direct
                    const realThemeId = Math.floor(quizId / 100);

                    console.log(`Ž¯ Loading quiz ${quizId} from theme ${realThemeId}`);
                    this.quizManager.loadQuiz(realThemeId, quizId);
                } else if (this.features?.showPaywallModal) {
                    this.features.showPaywallModal(`unlock-quiz-${quizId}`);
                }
            });
        });
    };

    UICore.prototype.setupQuizEvents = function () {
        const addClick = (id, handler) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('click', async (e) => {
                e.preventDefault();
                if (el.disabled) return;
                el.disabled = true;
                el.setAttribute('aria-disabled', 'true');
                try { await handler(); }
                finally {
                    el.disabled = false;
                    el.removeAttribute('aria-disabled');
                }
            });
        };

        const goBack = async () => {
            if (this.quizManager?.currentThemeId) {
                this.showQuizSelection();
            } else {
                this.showWelcomeScreen();
            }
        };
        addClick('quit-quiz-btn', goBack);
        addClick('back-to-themes-btn', goBack);
        addClick('go-themes-btn', goBack);                 // âœ… NOUVEAU (ton bouton Back reel)

        addClick('home-quiz-btn', async () => this.showWelcomeScreen());

        // Navigation questions
        addClick('prev-question-btn', async () => this.quizManager?.previousQuestion()); // âœ… CORRIGE
        addClick('next-question-btn', async () => this.quizManager?.nextQuestion());
    };



    UICore.prototype.setupResultsEvents = function () {
        this.addClickHandler('next-quiz-btn', () => {
            const nextQuiz = this.features?.getNextQuizInTheme?.();
            if (nextQuiz) {
                this.quizManager.loadQuiz(nextQuiz.themeId, nextQuiz.quizId);
            } else {
                this.showQuizSelection();
            }
        });

        // âœ… Retry (couvre primary + secondaire si present)
        ['retry-quiz-primary-btn', 'retry-quiz-btn'].forEach(id => {
            this.addClickHandler(id, () => {
                const { currentThemeId, currentQuizId } = this.quizManager;
                if (currentThemeId && currentQuizId) {
                    this.quizManager.loadQuiz(currentThemeId, currentQuizId);
                }
            });
        });

        // âœ… Back to theme & Home (selon tes deux boutons bas de page)
        this.addClickHandler('quit-quiz-btn', () => this.showQuizSelection()); // â† Back to Theme
        this.addClickHandler('back-to-themes-btn', () => this.showWelcomeScreen()); //   Home

        this.addClickHandler('toggle-details-btn', () => {
            const detailsDiv = document.getElementById('detailed-stats');
            const btn = document.getElementById('toggle-details-btn');
            if (detailsDiv) {
                detailsDiv.classList.toggle('hidden');
                if (!detailsDiv.classList.contains('hidden')) this.generateDetailedReview();
                if (btn) {
                    btn.textContent = detailsDiv.classList.contains('hidden')
                        ? 'View Detailed Analysis'
                        : 'Hide Detailed Analysis';

                }
            }
        });
    };


    // ui-core.js
    UICore.prototype.setupThemeClickEvents = function () {
        const root = this.appContainer || document;
        const tiles = root.querySelectorAll('.theme-item[data-theme-id]');

        tiles.forEach(tile => {
            tile.addEventListener('click', () => {
                const id = Number(tile.dataset.themeId || '0');

                // Recupere le theme via ResourceManager si possible, sinon via le cache index
                const theme = (this.resourceManager && typeof this.resourceManager.getThemeById === 'function')
                    ? this.resourceManager.getThemeById(id)
                    : (this.themeIndexCache || []).find(t => Number(t.id) === id);

                if (!theme) {
                    console.error("Theme not found for ID:", id);
                    return;
                }

                // ‘‰ Laisse ui-features decider (paywall, code promo, Colors gratuit, etc.)
                if (this.features && typeof this.features.handleThemeClick === 'function') {
                    this.features.handleThemeClick(theme);
                    return;
                }

                // Fallback simple : Colors accessible, autres themes bloques
                if (id === 1) {
                    this.quizManager.currentThemeId = 1;
                    this.showQuizSelection();
                } else {
                    alert("This theme is premium and requires unlocking.");
                }
            });
        });
    };


    UICore.prototype.updateQuizProgress = function () {
        try {
            const progress = this.quizManager.getQuizProgress();

            const bar = document.getElementById('quiz-progress-bar');
            if (bar) {
                // aria
                bar.setAttribute('aria-valuenow', String(Math.round(progress.percentage)));
                // width via classes
                for (const c of [...bar.classList]) if (c.startsWith('w-pct-')) bar.classList.remove(c);
                const pct = Number.isFinite(progress.percentage) ? progress.percentage : 0;
                const pct5 = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
                bar.classList.add(`w-pct-${pct5}`);
            }

            const count = document.getElementById('quiz-progress-count');
            if (count) count.textContent = `${progress.current}/${progress.total}`;

            this.updateNavigationButtons?.();
        } catch (err) {
            console.error('Error updating quiz progress:', err);
        }
    };



    UICore.prototype.updateNavigationButtons = function () {
        const prevBtn = document.getElementById('prev-question-btn');
        const nextBtn = document.getElementById('next-question-btn');

        if (prevBtn) prevBtn.disabled = this.quizManager.isFirstQuestion();

        if (nextBtn) {
            const hasAnswered = this.quizManager.hasAnsweredCurrentQuestion();
            const isLast = this.quizManager.isLastQuestion();
            nextBtn.disabled = !hasAnswered;
            nextBtn.innerHTML = isLast ?
                'Finish Quiz âœ…' :
                'Next â–¶';
        }
    };

    UICore.prototype.generateDetailedReview = function () {
        try {
            const reviewContainer = document.getElementById('questions-review');
            if (!reviewContainer || !this.quizManager.currentQuiz) return;

            const questions = this.quizManager.currentQuiz.questions;
            const userAnswers = this.quizManager.userAnswers;
            const questionStatus = this.quizManager.questionStatus;

            const reviewHTML = questions.map((question, index) => {
                const userAnswerIndex = userAnswers[index];
                const isCorrect = questionStatus[index] === 'correct';
                const correctIndex = question.correctIndex;

                return `
            <div class="review-question mb-4 p-4 border rounded-lg ${isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}">
                <div class="flex items-start justify-between mb-3">
                    <h4 class="font-medium text-gray-800">Question ${index + 1}</h4>
                    <span class="text-sm font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'}">
                        ${isCorrect ? 'âœ“ Correct' : 'âœ— Incorrect'}
                    </span>
                </div>
                
                <p class="text-gray-700 mb-3">${question.question || question.text}</p>
                
                <div class="space-y-2">
                    <div class="text-sm">
                        <span class="text-gray-600">Your answer:</span>
                        <span class="ml-2 ${isCorrect ? 'text-green-600' : 'text-red-600'} font-medium">
                            ${question.options[userAnswerIndex]}
                        </span>
                    </div>
                    
                    ${!isCorrect ? `
                        <div class="text-sm">
                            <span class="text-gray-600">Correct answer:</span>
                            <span class="ml-2 text-green-600 font-medium">
                                ${question.options[correctIndex]}
                            </span>
                        </div>
                    ` : ''}
                    
                    ${question.explanation ? `
                        <div class="text-sm text-gray-600 mt-2 p-2 bg-blue-50 rounded">
                            <strong>Explanation:</strong> ${question.explanation}
                        </div>
                    ` : ''}
                </div>
            </div>`;
            }).join('');

            reviewContainer.innerHTML = reviewHTML;
        } catch (error) {
            console.error("Error generating detailed review:", error);
        }
    };

    UICore.prototype.getProgressText = function (uiState) {
        if (uiState.completedQuizzes < 5) {
            return `You've completed ${uiState.completedQuizzes} assessment${uiState.completedQuizzes > 1 ? 's' : ''}. Keep testing your French level!`;
        } else if (uiState.completedQuizzes < 20) {
            return `Great progress! ${uiState.completedQuizzes} assessments completed.`;
        } else {
            return `Excellent! ${uiState.completedQuizzes} assessments completed.`;
        }
    };

    UICore.prototype.getNextAction = function (uiState) {
        if (uiState.completedQuizzes === 0) {
            return { text: "Test Your Level", action: "first-quiz" };
        } else {
            return { text: "Continue Testing", action: "continue" };
        }
    };

    UICore.prototype.generateNextActionButton = function (resultsData) {
        if (resultsData.percentage >= 70) {
            return `
        <button id="next-quiz-btn" 
                class="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-bold text-xl py-4 px-12 rounded-2xl shadow-lg transform hover:scale-105 transition-all duration-200">
            â–¶ï¸ Next Quiz
        </button>`;
        } else {
            return `
        <button id="retry-quiz-primary-btn" 
                class="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold text-xl py-4 px-12 rounded-2xl shadow-lg transform hover:scale-105 transition-all duration-200">
            ”„ Retry Quiz
        </button>`;
        }
    };

    UICore.prototype.getCECRLevel = function (percentage) {
        if (percentage >= 80) return "Strong Level - You'll excel in France!";
        if (percentage >= 60) return "Solid Level - You'll manage well in France!";
        if (percentage >= 50) return "Growing Level - Keep testing your authentic French!";
        return "Discovery Level - Good start, continue testing!";
    };

    UICore.prototype.getCECRMessage = function (percentage) {
        if (percentage >= 80) return "You master authentic daily French!";
        if (percentage >= 60) return "Solid level for real French situations!";
        if (percentage >= 50) return "You're getting the authentic French feel!";
        return "Authentic French is challenging - you're discovering your level!";
    };

    UICore.prototype.getCECRColorClass = function (percentage) {
        if (percentage >= 80) return "bg-green-50 border-green-200 text-green-800";
        if (percentage >= 60) return "bg-blue-50 border-blue-200 text-blue-800";
        if (percentage >= 50) return "bg-orange-50 border-orange-200 text-orange-800";
        return "bg-gray-50 border-gray-200 text-gray-800";
    };

    UICore.prototype.addClickHandler = function (elementId, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener('click', handler);
        }
    };
    UICore.prototype.bindEvent = function (selector, action, data = null) {
        const element = document.getElementById(selector);
        if (element) {
            element.addEventListener('click', () => {
                switch (action) {
                    case 'showWelcomeScreen':
                        this.showWelcomeScreen();
                        break;
                    case 'showStatsScreen':
                        this.showStatsScreen();
                        break;
                    case 'showQuizSelection':
                        this.showQuizSelection();
                        break;
                    default:
                        console.warn(`Unknown action: ${action}`);
                }
            });
        }
    };
    // --- export & close IIFE ---
    if (global.TYF_CONFIG?.debug?.enabled) console.log('UICore loaded');
    global.UICore = UICore;

})(window);