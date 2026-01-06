// ui-core.js v3.0 - UX Roadmap Modal + Refined flow (new user → quiz → results → stats)
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
       TEXT NORMALIZATION
       ---------------------------------------- */
    UICore.prototype.normalizeText = function (s) {
        return String(s || "")
            .replace(/â€“/g, "-")
            .replace(/â€”/g, "-")
            .replace(/[–—]/g, "-")
            .replace(/[·•]/g, "|")
            .replace(/\u00A0/g, " ")
            .trim();
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
        const FeaturesCtor = window.UIFeatures;

        // Sécurité : si UIFeatures n'est pas dispo, on ne bloque pas l'app
        if (typeof FeaturesCtor === "function") {
            this.features = new FeaturesCtor(this, this.storageManager, this.resourceManager);

            this.features.initializeXPSystem?.();
            this.features.updateXPHeader?.();
            this.features.addChestIconToHeader?.();

            if (this.features.setupGlobalEventListeners) {
                this.features.setupGlobalEventListeners();
            }
        } else {
            console.warn("UIFeatures not available – XP header disabled.");
            // Stub minimal pour éviter les erreurs plus loin dans le code
            this.features = {
                initializeXPSystem() { },
                updateXPHeader() { },
                addChestIconToHeader() { },
                setupGlobalEventListeners() { },
                showQuestionFeedback() { },
                handleResultsFP() { },
                getCompletionMessage() {
                    return "Quiz completed – French Points earned.";
                },
                getNextQuizInTheme() {
                    return null;
                },
                handleThemeClick: null
            };
        }

        // Charts module (stats)
        // CORRIGÉ: window.UICharts au lieu de UICharts (bug scope)
        this.charts =
            typeof window.UICharts !== "undefined"
                ? new window.UICharts(this, this.storageManager, this.resourceManager)
                : {
                    generateFullStatsPage: function () {
                        return "<div class='p-4'>Statistics are temporarily unavailable.</div>";
                    },
                    loadDetailedStats: function () {
                        return Promise.resolve();
                    }
                };
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
                if (this.features) {
                    this.features.showXPHeader && this.features.showXPHeader();
                    this.features.updateXPHeader && this.features.updateXPHeader();
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

    UICore.prototype.generateWelcomeHTML = function () {
        const uiState = this.storageManager.getUIState();
        const isNewUser = uiState.completedQuizzes === 0;
        return isNewUser
            ? this.generateNewUserWelcome()
            : this.generateReturningUserWelcome(uiState);
    };

    // New visitor: clear hero focused on Colors
    UICore.prototype.generateNewUserWelcome = function () {
        return (
            '\n<section class="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center" role="main" aria-label="Welcome screen">' +
            '\n  <div class="max-w-3xl text-center px-6 py-12">' +
            '\n    <h1 class="text-3xl md:text-4xl font-bold text-blue-700 mb-4">' +
            "\n      Discover your real French level" +
            "\n    </h1>" +
            '\n    <div class="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6 rounded-r-lg text-left md:text-center">' +
            '\n      <p class="text-blue-800 font-medium">' +
            "\n        Try a short, authentic quiz based on real-life situations in France." +
            "\n        Start with the free <strong>Colors</strong> theme and see where you stand today." +
            "\n      </p>" +
            "\n    </div>" +

            // NOUVEAU: Annonce système French Points (UX améliorée)
            '\n    <div class="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-5 mb-6">' +
            '\n      <div class="flex items-center justify-center gap-2 mb-3">' +
            '\n        <span class="text-2xl">✨</span>' +
            '\n        <h2 class="text-lg font-bold text-gray-900">How it works</h2>' +
            '\n        <span class="text-2xl">✨</span>' +
            '\n      </div>' +
            '\n      <div class="space-y-2 text-sm text-gray-700">' +
            '\n        <p><strong class="text-purple-700">1. Take quizzes</strong> → Earn French Points for each one you complete</p>' +
            '\n        <p><strong class="text-purple-700">2. Unlock themes</strong> → Use your points to access new topics (or go Premium)</p>' +
            '\n        <p><strong class="text-purple-700">3. Track progress</strong> → Build a visible history of your French level</p>' +
            '\n      </div>' +
            '\n      <div class="mt-3 pt-3 border-t border-purple-200">' +
            '\n        <p class="text-xs text-gray-600">🎯 <strong>Colors is free</strong> – perfect to start. More themes unlock as you progress.</p>' +
            '\n      </div>' +
            '\n    </div>' +

            '\n    <p class="text-lg text-gray-700 mb-6">' +
            "\n      No signup. No account. Just answer the questions and get an honest snapshot of your level." +
            "\n    </p>" +
            '\n    <button id="start-first-quiz-btn" type="button" class="quiz-button w-full sm:w-auto">' +
            "\n      Start the free Colors quiz" +
            "\n    </button>" +
            '\n    <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10 text-center text-sm text-gray-700">' +
            '\n      <div>' +
            "\n        <p class=\"font-semibold\">Authentic audio</p>" +
            "\n        <p>Short real-life sentences spoken at natural speed.</p>" +
            "\n      </div>" +
            '\n      <div>' +
            "\n        <p class=\"font-semibold\">Real assessment</p>" +
            "\n        <p>Designed to reveal your practical level, not textbook theory.</p>" +
            "\n      </div>" +
            '\n      <div>' +
            "\n        <p class=\"font-semibold\">Unlock as you learn</p>" +
            "\n        <p>Complete quizzes to earn points and access new themes.</p>" +
            "\n      </div>" +
            "\n    </div>" +
            "\n  </div>" +
            "\n</section>\n"
        );
    };

    // Returning visitor: direct access to themes + stats
    UICore.prototype.generateReturningUserWelcome = function (uiState) {
        const progressText = this.getProgressText(uiState);

        return (
            '\n<div class="bg-gradient-to-br from-blue-50 to-purple-50 min-h-screen lg:h-screen lg:flex lg:flex-col" role="main" aria-label="Themes screen">' +
            '\n  <div class="max-w-6xl mx-auto px-4 pt-4 pb-6 lg:pt-2 lg:pb-4 lg:flex-1 lg:flex lg:flex-col">' +
            '\n    <div class="text-center mb-4 lg:mb-2">' +
            '\n      <h1 class="text-xl md:text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>' +
            '\n      <p class="text-sm text-gray-700">' +
            progressText +
            "</p>" +
            "\n    </div>" +

            // NOUVEAU: Bouton roadmap (P0)
            '\n    <div class="text-center mb-4">' +
            '\n      <button id="show-roadmap-btn" type="button" class="text-sm text-blue-700 hover:text-blue-900 font-semibold px-5 py-3 rounded-lg border-2 border-blue-300 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 transition-all inline-flex items-center gap-2 shadow-sm">' +
            '\n        <span class="text-lg">🗺️</span>' +
            '\n        <span>Why are some themes locked? See how unlocking works</span>' +
            '\n      </button>' +
            '\n    </div>' +

            '\n    <section id="themes-section" aria-label="Available themes" class="lg:flex-1">' +
            '\n      <h2 class="text-lg lg:text-xl font-bold text-gray-800 mb-3 lg:mb-2 text-center">Choose your next theme</h2>' +
            '\n      <div id="themes-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-2">' +
            this.generateSimpleThemesGrid() +
            "\n      </div>" +
            "\n    </section>" +
            '\n    <div class="text-center mt-4 lg:mt-2 shrink-0">' +
            '\n      <button id="view-stats-btn" type="button" class="text-gray-600 hover:text-gray-900 underline text-sm">' +
            "\n        View your statistics and history" +
            "\n      </button>" +
            "\n    </div>" +
            "\n  </div>" +
            "\n</div>\n"
        );
    };

    /* ----------------------------------------
       RESULTS SCREEN
       ---------------------------------------- */
    UICore.prototype.showResults = function (resultsData) {
        this.showScreen("results", () => {
            const html = this.generateResultsHTML(resultsData);

            // Refresh XP header (level / FP / streak) shortly after rendering
            setTimeout(() => {
                if (this.features && this.features.updateXPHeader) {
                    this.features.updateXPHeader();
                }
            }, 200);

            // Micro-conversion tracking (if available)
            try {
                if (typeof window.trackMicroConversion === "function") {
                    window.trackMicroConversion("quiz_completed", {
                        themeId: resultsData.themeId,
                        quizId: resultsData.quizId,
                        percentage: resultsData.percentage
                    });
                }
            } catch (e) {
                console.warn("Micro-conversion tracking failed:", e);
            }

            return html;
        });

        if (this.features && this.features.handleResultsFP) {
            this.features.handleResultsFP(resultsData);
        }
    };

    UICore.prototype.generateResultsHTML = function (resultsData) {
        const isExcellent = resultsData.percentage >= 80;
        const isGood = resultsData.percentage >= 60;

        let feedbackMsg = "";
        if (resultsData.score === 0) {
            feedbackMsg =
                "You showed up, and that already counts. Try the same quiz again to get familiar with the format.";
        } else if (this.features && this.features.getRotatedFeedbackMessage) {
            feedbackMsg = this.features.getRotatedFeedbackMessage(
                resultsData.percentage,
                resultsData.themeId
            );
        }

        const mainIcon = isExcellent ? "🎉" : isGood ? "💪" : "✨";

        return (
            '\n<div class="quiz-wrapper" role="main" aria-label="Quiz results">' +
            '\n  <div class="text-center">' +
            '\n    <div class="mb-8">' +
            '\n      <div class="text-5xl mb-4">' +
            mainIcon +
            "</div>" +
            '\n      <h1 class="text-3xl md:text-4xl font-bold mb-4 ' +
            (isExcellent
                ? "text-green-600"
                : isGood
                    ? "text-blue-600"
                    : "text-orange-600") +
            '">' +
            (isExcellent ? "Excellent result" : isGood ? "Well done" : "Good effort") +
            "</h1>" +
            '\n      <div class="text-6xl font-bold text-gray-900 mb-4">' +
            resultsData.percentage +
            "%" +
            "</div>" +
            (feedbackMsg
                ? '\n      <div class="feedback-content correct mt-4 max-w-xl mx-auto text-gray-800 text-base">' +
                feedbackMsg +
                "</div>"
                : "") +
            "\n    </div>" +
            '\n    <div class="fp-display mb-6">' +
            '\n      <div class="text-lg font-bold text-purple-800 mb-1 whitespace-pre-line">' +
            (this.features && this.features.getCompletionMessage
                ? this.features.getCompletionMessage(resultsData.percentage, resultsData.fpEarned)
                : "+" + (Number(resultsData.fpEarned) || 0) + " French Points earned") +
            "</div>" +

            '\n      <p class="text-sm text-gray-700">' +
            "French Points help you unlock new themes and build a visible history of your level." +
            "</p>" +
            "\n    </div>" +
            '\n    <div class="mb-6">' +
            this.generateNextActionButton(resultsData) +
            "\n    </div>" +
            '\n    <div class="mb-6">' +
            '\n      <button id="toggle-details-btn" type="button" class="quiz-button">' +
            "View detailed analysis" +
            "</button>" +
            "\n    </div>" +
            '\n    <div id="detailed-stats" class="hidden max-w-3xl mx-auto text-left">' +
            '\n      <h3 class="text-lg font-bold text-gray-800 mb-4">Performance analysis</h3>' +
            '\n      <div class="mb-4 p-4 rounded-lg ' +
            this.getCECRColorClass(resultsData.percentage) +
            '">' +
            '\n        <div class="font-bold mb-2">Estimated range</div>' +
            '\n        <div class="text-lg font-bold mb-1">' +
            this.getCECRLevel(resultsData.percentage) +
            "</div>" +
            '\n        <div class="text-sm">' +
            this.getCECRMessage(resultsData.percentage) +
            "</div>" +
            "\n      </div>" +
            '\n      <div id="questions-review">' +
            '\n        <h4 class="font-bold text-gray-800 mb-3">Question review</h4>' +
            '\n        <div class="text-sm text-gray-600">Loading detailed review...</div>' +
            "\n      </div>" +
            "\n    </div>" +
            '\n    <div class="flex flex-col md:flex-row gap-3 justify-center mt-8">' +
            '\n      <button id="quit-quiz-btn" type="button" class="quiz-button">' +
            "Back to theme" +
            "</button>" +
            '\n      <button id="back-to-themes-btn" type="button" class="quiz-button">' +
            "Back to themes" +
            "</button>" +
            "\n    </div>" +
            "\n  </div>" +
            "\n</div>\n"
        );
    };

    /* ----------------------------------------
       QUIZ SCREEN
       ---------------------------------------- */
    UICore.prototype.showQuizScreen = function () {
        this.showScreen("quiz", this.generateQuizHTML);
        const self = this;
        setTimeout(function () {
            self.renderCurrentQuestion();
        }, 80);
    };


    UICore.prototype.generateQuizHTML = function () {
        const progress =
            (this.quizManager.getQuizProgress && this.quizManager.getQuizProgress()) || {
                current: 1,
                total: 10,
                percentage: 0
            };

        return (
            '\n<div class="quiz-wrapper" role="main" aria-label="Quiz screen">' +
            '\n  <div class="flex items-center justify-between mb-4">' +
            '\n    <div class="text-sm text-gray-600">' +
            '<span id="quiz-progress-count">' +
            progress.current +
            "/" +
            progress.total +
            "</span>" +
            "</div>" +
            '\n    <div class="flex items-center gap-2">' +
            '<button id="go-themes-btn" type="button" class="quiz-button">Back to theme</button>' +
            '<button id="home-quiz-btn" type="button" class="quiz-button">Home</button>' +
            "</div>" +
            "\n  </div>" +
            '\n  <div class="w-full h-2 bg-gray-200 rounded-full mb-6" aria-hidden="true">' +
            '<div id="quiz-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" class="h-2 bg-amber-400 rounded-full transition-all w-pct-0"></div>' +
            "</div>" +
            '\n  <div id="question-container" class="space-y-4"></div>' +
            '\n  <div id="feedback-container" class="mt-6" role="status" aria-live="polite"></div>' +
            '\n  <div class="mt-6 flex items-center justify-between">' +
            '<button id="prev-question-btn" type="button" class="quiz-button">Previous</button>' +
            '<button id="next-question-btn" type="button" class="quiz-button">Next</button>' +
            "</div>" +
            "\n</div>"
        );
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
        const idx = Number(this.quizManager && this.quizManager.currentIndex) || 0;
        const ans = Array.isArray(this.quizManager.userAnswers) ? this.quizManager.userAnswers[idx] : null;
        if (typeof ans === "number") {
            const opt = document.querySelector('.option[data-option-index="' + ans + '"]');
            if (opt) {
                opt.classList.add("selected");
                opt.setAttribute("aria-checked", "true");
                const indicator = opt.querySelector(".option-indicator div");
                if (indicator) {
                    indicator.classList.remove("scale-0");
                    indicator.classList.add("scale-100");
                }
            }
        }

        this.updateQuizProgress();

    };


    UICore.prototype.generateQuestionHTML = function (question) {
        const questionText = question.question || question.text || "Question text missing";
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
                ? this.normalizeText(this.quizManager.currentQuiz.name)
                : "";

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
            (question.hint
                ? '\n  <div class="question-hint mt-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">' +
                '\n    <div class="flex items-start">' +
                '\n      <div class="font-medium text-blue-800 mr-2">Hint:</div>' +
                '\n      <div class="text-blue-700 text-sm">' +
                question.hint +
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

        return (
            '\n<div class="question-audio-container mb-6 text-center">' +
            '\n  <div class="bg-blue-50 rounded-lg p-4 inline-block">' +
            '\n    <audio class="question-audio hidden" preload="metadata">' +
            '\n      <source src="' + audioPath + '" type="audio/mpeg">' +
            "Your browser does not support audio." +
            "\n    </audio>" +
            '\n    <button type="button" class="audio-play-btn bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors">' +
            "Listen" +
            "</button>" +
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
        const clean = this._stripChoiceLabel(option);

        return (
            '\n<div class="option" data-option-index="' +
            index +
            '" role="radio" aria-checked="false" tabindex="0">' +
            '\n  <div class="flex items-center">' +
            '\n    <div class="option-indicator w-5 h-5 border-2 border-gray-400 rounded-full mr-4 flex-shrink-0 transition-colors">' +
            '\n      <div class="w-full h-full rounded-full bg-blue-600 transform scale-0 transition-transform"></div>' +
            "\n    </div>" +
            '\n    <span class="option-letter text-lg font-bold text-gray-600 mr-3">' +
            letter +
            ".</span>" +
            '\n    <span class="option-text text-gray-900 font-medium flex-1">' +
            clean +
            "</span>" +
            "\n  </div>" +
            "\n</div>"
        );
    };


    UICore.prototype.setupQuestionEvents = function () {
        const options = document.querySelectorAll(".option");
        const self = this;

        options.forEach(function (option, index) {
            option.addEventListener("click", function () {
                self.selectOption(index, option);
            });
            option.addEventListener("keydown", function (e) {
                // Sélection
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    self.selectOption(index, option);
                    return;
                }

                // PATCH 2: Navigation clavier type radio-group
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

            audio
                .play()
                .then(function () {
                    btn.textContent = "Replay";
                    btn.disabled = false;
                })
                .catch(function (error) {
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
                    case 1:
                        btn.textContent = "Audio loading cancelled";
                        break;
                    case 2:
                        btn.textContent = "Network error";
                        break;
                    case 3:
                        btn.textContent = "Audio format error";
                        break;
                    case 4:
                        btn.textContent = "Audio file not found";
                        break;
                    default:
                        btn.textContent = "Audio unavailable";
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
                const indicator = opt.querySelector(".option-indicator div");
                if (indicator) {
                    indicator.classList.remove("scale-100");
                    indicator.classList.add("scale-0");
                }
            });

            optionElement.classList.add("selected");
            optionElement.setAttribute("aria-checked", "true");
            const indicator = optionElement.querySelector(".option-indicator div");
            if (indicator) {
                indicator.classList.remove("scale-0");
                indicator.classList.add("scale-100");
            }

            this.quizManager.selectAnswer(index);

            // Repartir d'un état propre : sélection = on revalide
            if (Array.isArray(this.quizManager.questionStatus)) {
                this.quizManager.questionStatus[this.quizManager.currentIndex] = null;
            }

            // Important: casser le cache "déjà validé" si l'utilisateur clique plusieurs fois
            if ("_lastValidatedQuestionIndex" in this.quizManager) {
                this.quizManager._lastValidatedQuestionIndex = null;
                this.quizManager._lastValidatedAnswerIndex = null;
            }

            // Auto-validation immédiate
            this.quizManager.validateCurrentAnswer();
            this.updateNavigationButtons();

            // Focus sur Next uniquement si réellement débloqué
            const nextBtn = document.getElementById("next-question-btn");
            if (nextBtn && !nextBtn.disabled) nextBtn.focus();

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
        if (theme.id === 1) return "section-theme-free";

        const isPremium = !!this.storageManager.isPremiumUser?.();
        if (isPremium) return "section-theme-premium";

        const isUnlocked = !!this.storageManager.isThemeUnlocked?.(theme.id);
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
                var isLocked = self.getThemeStateClass(theme) === 'section-theme-locked';
                var ariaLabel = self.normalizeText(theme.name) + (isLocked ? " (locked)" : "");
                var ariaDisabled = isLocked ? ' aria-disabled="true"' : ' aria-disabled="false"';
                // A11Y: un élément "aria-disabled" ne doit pas être focusable au clavier
                var tabIndexAttr = isLocked ? ' tabindex="-1"' : ' tabindex="0"';

                return (
                    '\n<div class="theme-item ' +
                    self.getThemeStateClass(theme) +
                    '" data-theme-id="' +
                    theme.id +
                    '" role="button"' +
                    tabIndexAttr +
                    ' aria-label="' +
                    ariaLabel +
                    '"' + ariaDisabled +
                    '>' +


                    '\n  <div class="text-center">' +
                    '\n    <div class="text-2xl mb-2">' +
                    (theme.icon || "") +
                    "</div>" +
                    '\n    <h3 class="text-sm font-bold mb-1">' +
                    self.normalizeText(theme.name) +
                    "</h3>" +
                    '\n    <p class="text-xs text-gray-600 line-clamp-2">' +
                    self.normalizeText(theme.description || "") +
                    "</p>" +
                    "\n    " +
                    self.getThemeProgressDisplay(theme.id) +
                    "\n  </div>" +
                    "\n</div>"
                );
            })
            .join("");
    };

    UICore.prototype.getThemeProgressDisplay = function (themeId) {
        if (themeId === 1) {
            return '<div class="text-xs text-green-600 mt-2">Free</div>';
        }

        // Cas 1 : thème déjà débloqué → on affiche juste la progression
        if (this.storageManager.isThemeUnlocked &&
            this.storageManager.isThemeUnlocked(themeId)) {



            if (typeof this.storageManager.getThemeProgress === "function") {
                const progress = this.storageManager.getThemeProgress(themeId) || {
                    completedCount: 0,
                    total: 0
                };
                const colorClass = progress.completedCount > 0 ? "text-green-600" : "text-blue-600";

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

            return '<div class="text-xs text-green-600 mt-2">Theme unlocked.</div>';
        }

        // Cas 2 : pas de logique de déverrouillage par points → fallback premium
        if (typeof this.storageManager.canUnlockTheme !== "function") {
            return '<div class="text-xs text-gray-500 mt-2">Premium theme – unlock via purchase.</div>';
        }

        // Déterminer le prochain thème atteignable (game loop)
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
                const prevUnlocked = prev ? !!self.storageManager.isThemeUnlocked?.(prev.id) : true;

                if (!unlocked && prevUnlocked) return t.id;
            }
            return 2;
        })();

        // Logique French Points disponible
        const unlockStatus = this.storageManager.canUnlockTheme(themeId) || {};

        // Si bloqué par progression: guidance uniquement (pas de coût, pas de FP)
        if (unlockStatus.reason === "PREVIOUS_LOCKED") {
            // Déterminer le thème précédent (ordre par id, robuste si ids sont strings)
            const list = (this.themeIndexCache || [])
                .filter(t => t && t.id != null)
                .map(t => ({ ...t, id: Number(t.id) }))
                .filter(t => Number.isFinite(t.id))
                .sort((a, b) => a.id - b.id);

            const idx = list.findIndex(t => t.id === Number(themeId));
            const prev = idx > 0 ? list[idx - 1] : null;
            const previousTheme = prev ? this.normalizeText(prev.name) : "the previous theme";

            return (
                '<div class="text-xs text-gray-400 mt-2">' +
                '🔒 Complete <strong>' + previousTheme + '</strong> first | ' +
                '<button type="button" class="text-purple-600 hover:underline" data-action="show-roadmap">See roadmap</button>' +
                '</div>'
            );
        }



        // Game master: n’afficher “needed FP” QUE pour le prochain thème atteignable
        if (themeId === nextThemeId && unlockStatus.reason === "INSUFFICIENT_FP") {
            const fp = typeof this.storageManager.getFrenchPoints === "function"
                ? this.storageManager.getFrenchPoints()
                : 0;

            const themeCost = typeof this.storageManager.getThemeCost === "function"
                ? this.storageManager.getThemeCost(themeId)
                : unlockStatus.cost;

            if (typeof themeCost === "number") {
                const needed = Math.max(0, themeCost - fp);

                return (
                    '<div class="text-xs text-gray-500 mt-2">' +
                    needed +
                    " more French Points needed or purchase premium access.</div>"
                );
            }
        }

        // Message “Ready to unlock” uniquement pour le prochain thème atteignable
        if (themeId === nextThemeId && unlockStatus.canUnlock && typeof unlockStatus.cost === "number") {
            return (
                '<div class="text-xs text-blue-600 mt-2">Unlock with ' +
                unlockStatus.cost +
                " French Points or purchase premium access.</div>"
            );
        }

        // Sinon: rien (évite d’empiler des objectifs)
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

        // Calculer total et daysNeeded (robuste même si themeData n'est pas trié)
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

        // Estimation simple: combien de jours pour gagner "remaining" FP
        // Fallback volontairement conservateur si aucune estimation n'existe ailleurs
        const FP_PER_DAY_ESTIMATE = (window.TYF_CONFIG && Number(window.TYF_CONFIG.fpPerDayEstimate)) || 8;
        const daysNeeded = remaining > 0
            ? Math.max(1, Math.ceil(remaining / Math.max(1, FP_PER_DAY_ESTIMATE)))
            : 0;

        // Générer lignes de thèmes
        let rows = '';

        themeData.forEach(function (theme) {
            const id = Number(theme && theme.id);
            if (!Number.isFinite(id)) return;

            const isFree = id === 1; // Colors est gratuit
            const isUnlocked = self.storageManager.isThemeUnlocked?.(id) || isFree;
            const unlockStatus = isFree ? null : (self.storageManager.canUnlockTheme?.(id) || {});
            // Roadmap = coût fixe du thème (25/50/75/100...), pas le “next unlock cost”
            const cost = isFree ? 0 : (typeof self.storageManager.getThemeCost === "function"
                ? self.storageManager.getThemeCost(id)
                : null);
            const cumulative = isFree ? 0 : getCumulativeForTheme(id);

            // Déterminer status et couleur
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

            // Générer HTML de la ligne
            rows +=
                '<div class="flex items-center justify-between p-3 mb-2 border rounded-lg ' + bgColor + '">' +
                '<div class="flex items-center gap-3">' +
                '<div class="text-2xl">' + (theme.icon || '') + '</div>' +
                '<div>' +
                '<div class="font-semibold text-gray-900">' +
                self.normalizeText(theme.name) +
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
                // Afficher "—" si cost inconnu (null)
                rows += (cost === null)
                    ? '<div class="text-sm font-bold text-gray-900">—</div>'
                    : '<div class="text-sm font-bold text-gray-900">' + cost + ' FP</div>';
                rows += '<div class="text-xs text-gray-500 hidden sm:block">Total: ' + cumulative + ' FP</div>';
            }

            rows += '</div></div>';
        });

        // Retourner HTML complet de la modal
        return (
            '<div id="roadmap-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="roadmap-title">' +
            '<div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">' +

            // HEADER
            '<div class="sticky top-0 bg-white border-b border-gray-200 p-6 pb-4">' +
            '<div class="flex items-center justify-between mb-2">' +
            '<h2 id="roadmap-title" class="text-2xl font-bold text-gray-900">🗺️ How unlocking works</h2>' +
            '<button id="close-roadmap-btn" type="button" aria-label="Close roadmap" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>' +
            '</div>' +
            '<div class="text-sm text-gray-600 mt-1 mb-3">' +
            'Learn at your own pace, or unlock everything instantly.' +
            '</div>' +
            '<div class="text-sm text-gray-600 mb-3">You have <strong>' + currentFP + ' FP</strong>' +
            (isPremium ? ' • <span class="text-purple-600 font-semibold">Premium ✨</span>' : '') +
            '</div>' +
            (isPremium || !stripeUrl ? '' :
                '<a href="' + stripeUrl + '" target="_blank" rel="noopener noreferrer" ' +
                'class="block w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg text-center transition-colors shadow-sm mb-3">' +
                'Unlock all themes instantly - $12' +
                '</a>'
            ) +
            '</div>' +

            // BODY
            '<div class="flex-1 overflow-y-auto p-6 pt-4">' +
            rows +
            '</div>' +

            // FOOTER
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
            (isPremium || !stripeUrl ? '' :
                '<a href="' + stripeUrl + '" target="_blank" rel="noopener noreferrer" ' +
                'class="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-center transition-colors">' +
                '🚀 Get Premium - $12</a>'
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

        // FIX BUG: theme.quizzes peut être undefined
        const quizzes = Array.isArray(theme.quizzes) ? theme.quizzes : [];

        return (
            '\n<div class="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50" role="main" aria-label="Quiz selection">' +
            '\n  <div class="max-w-4xl mx-auto px-4 pt-6 pb-10">' +
            '\n    <div class="flex gap-4 mb-6">' +
            '\n      <button id="back-to-themes-btn" class="text-blue-600 hover:text-blue-800 font-medium py-2 px-6 rounded-lg border border-blue-200 hover:border-blue-300 transition-colors">' +
            "Back to all themes" +
            "</button>" +
            "\n    </div>" +
            '\n    <div class="text-center mb-8">' +
            '\n      <div class="text-4xl mb-4">' +
            (theme.icon || "") +
            "</div>" +
            '\n      <h1 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">' +
            this.normalizeText(theme.name) +
            "</h1>" +
            '\n      <p class="text-lg text-gray-700">' +
            this.normalizeText(theme.description || "") +
            "</p>" +
            "\n    </div>" +
            '\n    <div id="quizzes-grid" class="grid grid-cols-1 md:grid-cols-2 gap-6" aria-label="Quizzes in this theme">' +
            (quizzes.length
                ? this.generateQuizCards(quizzes)
                : '<div class="col-span-full text-center text-gray-600 p-8">No quizzes found for this theme. Check metadata structure.</div>'
            ) +
            "\n    </div>" +
            "\n  </div>" +
            "\n</div>"
        );
    };

    UICore.prototype.generateQuizCards = function (quizzes) {
        const self = this;

        // FIX BUG: Toujours garantir un tableau
        quizzes = Array.isArray(quizzes) ? quizzes : [];

        return (
            quizzes
                .map(function (quiz, idx) {
                    const isUnlocked = typeof self.storageManager.isQuizUnlocked === "function"
                        ? self.storageManager.isQuizUnlocked(quiz.id)
                        : true;

                    const isCompleted = typeof self.storageManager.isQuizCompleted === "function"
                        ? self.storageManager.isQuizCompleted(quiz.id)
                        : false;

                    const classes =
                        "quiz-item theme-card transition-all " +
                        (!isUnlocked ? "opacity-60" : "hover:shadow-lg cursor-pointer");

                    return (
                        '\n<div class="' +
                        classes +
                        '" data-quiz-id="' +
                        quiz.id +
                        '">' +
                        '\n  <div class="flex items-center justify-between mb-4">' +
                        '\n    <span class="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">' +
                        (idx + 1) +
                        "</span>" +
                        (isCompleted ? '\n    <span class="text-green-600 text-sm">Done</span>' : "") +
                        (!isUnlocked ? '\n    <span class="text-gray-400 text-sm">Locked</span>' : "") +
                        "\n  </div>" +
                        '\n  <h3 class="font-bold text-lg mb-2">' +
                        self.normalizeText(quiz.name) +
                        "</h3>" +
                        '\n  <p class="text-gray-600 text-sm">' +
                        self.normalizeText(quiz.description || "") +
                        "</p>" +
                        "\n</div>"
                    );
                })
                .join("") || ""
        );
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

        this.showScreen("stats", () => {
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
        this.addClickHandler("back-to-welcome-btn", this.showWelcomeScreen.bind(this));
        if (this.charts && this.charts.loadDetailedStats) {
            setTimeout(this.charts.loadDetailedStats.bind(this.charts), 100);
        }
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

                e.preventDefault();
                e.stopPropagation();

                // Toujours utiliser l'instance courante via `self`
                if (typeof self.showUnlockRoadmap === "function") {
                    self.showUnlockRoadmap();
                }
            };

            // Stocker la ref pour cleanup si un jour tu ajoutes destroy()
            this._roadmapDelegatedHandler = handler;

            // appContainer reste stable, contrairement au HTML interne
            this.appContainer.addEventListener("click", handler);

            this._roadmapListenerAttached = true;
        }


        // Theme tiles
        this.setupThemeClickEvents();
    };



    UICore.prototype.setupQuizSelectionEvents = function () {
        const self = this;
        this.bindEvent("back-to-themes-btn", "showWelcomeScreen");

        const quizCards = document.querySelectorAll(".quiz-item[data-quiz-id]");
        quizCards.forEach(function (card) {
            card.setAttribute("role", "button");
            card.setAttribute("tabindex", "0");

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

                if (typeof self.storageManager.isQuizUnlocked === "function" && self.storageManager.isQuizUnlocked(quizId)) {
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
                        el.disabled = false;
                        el.removeAttribute("aria-disabled");
                    });
            });
        };

        // BUG FIX: goBackToSelection robuste (force currentThemeId si manquant)
        const goBackToSelection = function () {
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

        // QuizManager.loadQuiz() appelle déjà showQuizScreen() en interne
        this.addClickHandler("next-quiz-btn", function () {
            const nextQuiz =
                self.features && self.features.getNextQuizInTheme
                    ? self.features.getNextQuizInTheme()
                    : null;
            if (nextQuiz) {
                // Track "attempt" at quiz start (not completion)
                self.storageManager?.markQuizStarted?.({ themeId: nextQuiz.themeId, quizId: nextQuiz.quizId });

                self.quizManager.loadQuiz(nextQuiz.themeId, nextQuiz.quizId).catch(function (e) {
                    console.error("Failed to load next quiz:", e);
                    self.showError("Unable to load next quiz.");
                });
            } else {
                self.showQuizSelection();
            }

        });

        // QuizManager.loadQuiz() appelle déjà showQuizScreen() en interne
        ["retry-quiz-primary-btn", "retry-quiz-btn"].forEach(function (id) {
            self.addClickHandler(id, function () {
                const currentThemeId = self.quizManager.currentThemeId;
                const currentQuizId = self.quizManager.currentQuizId;
                if (currentThemeId && currentQuizId) {
                    // Track "attempt" at quiz start (not completion)
                    self.storageManager?.markQuizStarted?.({ themeId: currentThemeId, quizId: currentQuizId });

                    self.quizManager.loadQuiz(currentThemeId, currentQuizId).catch(function (e) {
                        console.error("Failed to reload quiz:", e);
                        self.showError("Unable to reload quiz.");
                    });
                }

            });
        });

        this.addClickHandler("quit-quiz-btn", function () {
            self.showQuizSelection();
        });
        this.addClickHandler("back-to-themes-btn", function () {
            self.showWelcomeScreen();
        });

        this.addClickHandler("toggle-details-btn", function () {
            const detailsDiv = document.getElementById("detailed-stats");
            const btn = document.getElementById("toggle-details-btn");
            if (detailsDiv) {
                const isHidden = detailsDiv.classList.contains("hidden");
                detailsDiv.classList.toggle("hidden");
                if (isHidden) {
                    self.generateDetailedReview();
                }
                if (btn) {
                    btn.textContent = detailsDiv.classList.contains("hidden")
                        ? "View detailed analysis"
                        : "Hide detailed analysis";
                }
            }
        });
    };

    // CORRIGÉ: Event delegation au lieu de boucle forEach (performance + anti-bug)
    UICore.prototype.setupThemeClickEvents = function () {
        const self = this;
        const themesGrid = document.getElementById("themes-grid");

        if (!themesGrid) return;

        // Anti-doublon : vérifier si déjà lié
        if (themesGrid.dataset.delegationBound === "1") return;
        themesGrid.dataset.delegationBound = "1";

        // AMÉLIORATION 1: Fonction partagée pour clic ET clavier
        var handleThemeActivate = function (tile) {
            if (tile.getAttribute("aria-disabled") === "true") return;

            const id = Number(tile.dataset.themeId || "0");

            const theme =
                (self.resourceManager &&
                    typeof self.resourceManager.getThemeById === "function" &&
                    self.resourceManager.getThemeById(id)) ||
                (self.themeIndexCache || []).find(function (t) {
                    return Number(t.id) === id;
                });

            if (!theme) {
                console.error("Theme not found for ID:", id);
                return;
            }

            // Optional features hook: paywall / analytics
            if (self.features && typeof self.features.handleThemeClick === "function") {
                self.features.handleThemeClick(theme);
                return;
            }

            // FIX BUG CRITIQUE: Vérifier unlock status avant paywall
            const isFree = id === 1;
            const isPremium = !!self.storageManager.isPremiumUser?.();
            const isUnlocked = !!self.storageManager.isThemeUnlocked?.(id);

            if (isFree || isPremium || isUnlocked) {
                self.quizManager.currentThemeId = id;
                self.showQuizSelection();
                return;
            }

            // Sinon: paywall
            if (self.features && typeof self.features.showPaywallModal === "function") {
                self.features.showPaywallModal("unlock-theme-" + id);
            } else {
                // PATCH 1: Inline styles = immune au purge Tailwind
                var msg = document.createElement("div");
                msg.style.cssText =
                    "position:fixed;top:16px;left:50%;transform:translateX(-50%);" +
                    "background:#2563eb;color:#fff;padding:12px 18px;border-radius:12px;" +
                    "box-shadow:0 10px 25px rgba(0,0,0,.15);z-index:9999;" +
                    "font-weight:600;font-size:14px;max-width:90vw;text-align:center;";
                msg.textContent = "This theme requires unlocking. Complete more quizzes or go Premium!";
                document.body.appendChild(msg);
                setTimeout(function () { msg.remove(); }, 3000);
            }
        };

        // Listener clic
        themesGrid.addEventListener("click", function (e) {
            const tile = e.target.closest(".theme-item[data-theme-id]");
            if (!tile) return;
            handleThemeActivate(tile);
        });

        // AMÉLIORATION 1: Listener clavier (Enter/Espace)
        themesGrid.addEventListener("keydown", function (e) {
            if (e.key !== "Enter" && e.key !== " ") return;
            const tile = e.target.closest(".theme-item[data-theme-id]");
            if (!tile) return;
            e.preventDefault();
            handleThemeActivate(tile);
        });
    };

    /* ----------------------------------------
       PROGRESS / NAVIGATION
       ---------------------------------------- */
    UICore.prototype.updateQuizProgress = function () {
        try {
            const progress = this.quizManager.getQuizProgress();

            const bar = document.getElementById("quiz-progress-bar");
            if (bar) {
                bar.setAttribute("aria-valuenow", String(Math.round(progress.percentage)));
                Array.prototype.slice
                    .call(bar.classList)
                    .filter(function (c) {
                        return c.indexOf("w-pct-") === 0;
                    })
                    .forEach(function (c) {
                        bar.classList.remove(c);
                    });

                const pct = Number.isFinite(progress.percentage) ? progress.percentage : 0;
                const pct5 = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
                bar.classList.add("w-pct-" + pct5);
            }

            const count = document.getElementById("quiz-progress-count");
            if (count) count.textContent = progress.current + "/" + progress.total;

            if (this.updateNavigationButtons) {
                this.updateNavigationButtons();
            }
        } catch (err) {
            console.error("Error updating quiz progress:", err);
        }
    };

    UICore.prototype.updateNavigationButtons = function () {
        const prevBtn = document.getElementById("prev-question-btn");
        const nextBtn = document.getElementById("next-question-btn");

        const qm = this.quizManager;

        if (prevBtn) {
            prevBtn.disabled = (qm && typeof qm.isFirstQuestion === "function") ? !!qm.isFirstQuestion() : false;
        }

        if (nextBtn) {
            const idx = (qm && Number.isFinite(Number(qm.currentIndex))) ? Number(qm.currentIndex) : 0;

            const statusArr = (qm && Array.isArray(qm.questionStatus)) ? qm.questionStatus : [];
            const status = statusArr[idx];

            // validé uniquement si status est "correct" ou "incorrect"
            const isValidated = (status === "correct" || status === "incorrect");

            const isLast = (qm && typeof qm.isLastQuestion === "function") ? !!qm.isLastQuestion() : false;

            // si question invalide, on bloque (évite de “valider” un contenu cassé)
            const q = (qm && typeof qm.getCurrentQuestion === "function") ? qm.getCurrentQuestion() : null;
            const isInvalid = !!(q && q.isInvalid);

            nextBtn.disabled = !isValidated || isInvalid;
            nextBtn.textContent = isLast ? "Finish quiz" : "Next";
        }
    };



    /* ----------------------------------------
       DETAILED REVIEW
       ---------------------------------------- */
    UICore.prototype.generateDetailedReview = function () {
        try {
            const reviewContainer = document.getElementById("questions-review");
            if (!reviewContainer || !this.quizManager.currentQuiz) return;

            const self = this;
            const questions = Array.isArray(this.quizManager.currentQuiz.questions)
                ? this.quizManager.currentQuiz.questions
                : [];

            const userAnswers = Array.isArray(this.quizManager.userAnswers) ? this.quizManager.userAnswers : [];
            const questionStatus = Array.isArray(this.quizManager.questionStatus) ? this.quizManager.questionStatus : [];

            const reviewHTML = questions
                .map(function (question, index) {

                    const userAnswerIndex = userAnswers[index];
                    const isCorrect = questionStatus[index] === "correct";
                    const correctIndex = question.correctIndex;

                    const userAnswerRaw = (question.options && typeof userAnswerIndex === "number")
                        ? question.options[userAnswerIndex]
                        : null;
                    const correctAnswerRaw = (question.options && typeof correctIndex === "number")
                        ? question.options[correctIndex]
                        : null;

                    const userAnswerClean = userAnswerRaw ? self._stripChoiceLabel(userAnswerRaw) : "Not answered";
                    const correctAnswerClean = correctAnswerRaw ? self._stripChoiceLabel(correctAnswerRaw) : "";

                    return (
                        '\n<div class="review-question mb-4 p-4 border rounded-lg ' +
                        (isCorrect ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50") +
                        '">' +
                        '\n  <div class="flex items-start justify-between mb-3">' +
                        '\n    <h4 class="font-medium text-gray-800">Question ' +
                        (index + 1) +
                        "</h4>" +
                        '\n    <span class="text-sm font-bold ' +
                        (isCorrect ? "text-green-600" : "text-red-600") +
                        '">' +
                        (isCorrect ? "Correct" : "Incorrect") +
                        "</span>" +
                        "\n  </div>" +
                        '\n  <p class="text-gray-700 mb-3">' +
                        (question.question || question.text) +
                        "</p>" +
                        '\n  <div class="space-y-2">' +
                        '\n    <div class="text-sm">' +
                        '\n      <span class="text-gray-600">Your answer:</span>' +
                        '\n      <span class="ml-2 ' +
                        (isCorrect ? "text-green-600" : "text-red-600") +
                        ' font-medium">' +
                        userAnswerClean +
                        "</span>" +
                        "\n    </div>" +
                        (!isCorrect
                            ? '\n    <div class="text-sm">' +
                            '\n      <span class="text-gray-600">Correct answer:</span>' +
                            '\n      <span class="ml-2 text-green-600 font-medium">' +
                            correctAnswerClean +
                            "</span>" +
                            "\n    </div>"
                            : "") +
                        (question.explanation
                            ? '\n    <div class="text-sm text-gray-600 mt-2 p-2 bg-blue-50 rounded">' +
                            "<strong>Explanation:</strong> " +
                            question.explanation +
                            "</div>"
                            : "") +
                        "\n  </div>" +
                        "\n</div>"
                    );
                })
                .join("");

            reviewContainer.innerHTML = reviewHTML;
        } catch (error) {
            console.error("Error generating detailed review:", error);
        }
    };


    /* ----------------------------------------
       TEXT HELPERS (PROGRESS / CEFR STYLE)
       ---------------------------------------- */
    UICore.prototype.getProgressText = function (uiState) {
        if (uiState.completedQuizzes < 1) {
            return "Start with a first quiz to see where you stand.";
        } else if (uiState.completedQuizzes < 5) {
            return (
                "You have completed " +
                uiState.completedQuizzes +
                " assessment" +
                (uiState.completedQuizzes > 1 ? "s." : ".") +
                " Keep testing your French level."
            );
        } else if (uiState.completedQuizzes < 20) {
            return (
                "Great progress so far — " +
                uiState.completedQuizzes +
                " assessments completed."
            );
        } else {
            return (
                "Impressive history — " +
                uiState.completedQuizzes +
                " assessments completed."
            );
        }
    };

    UICore.prototype.generateNextActionButton = function (resultsData) {
        if (resultsData.percentage >= 70) {
            return (
                '\n<button id="next-quiz-btn" class="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-bold text-xl py-4 px-12 rounded-2xl shadow-lg transform hover:scale-105 transition-all duration-200">' +
                "Next quiz" +
                "</button>"
            );
        } else {
            return (
                '\n<button id="retry-quiz-primary-btn" class="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold text-xl py-4 px-12 rounded-2xl shadow-lg transform hover:scale-105 transition-all duration-200">' +
                "Retry quiz" +
                "</button>"
            );
        }
    };

    // These are "CEFR-flavored" but intentionally simple and motivational
    UICore.prototype.getCECRLevel = function (percentage) {
        if (percentage >= 80) return "Strong range (confident in France)";
        if (percentage >= 60) return "Solid range (you will manage well)";
        if (percentage >= 50) return "Growing range (on your way)";
        return "Discovery range (good starting point)";
    };

    UICore.prototype.getCECRMessage = function (percentage) {
        if (percentage >= 80) return "You handle authentic daily French very well.";
        if (percentage >= 60) return "You can deal with most everyday situations in French.";
        if (percentage >= 50) return "You are starting to grasp real-life French patterns.";
        return "Authentic French is challenging. Keep testing to progress step by step.";
    };

    UICore.prototype.getCECRColorClass = function (percentage) {
        if (percentage >= 80) return "bg-green-50 border-green-200 text-green-800";
        if (percentage >= 60) return "bg-blue-50 border-blue-200 text-blue-800";
        if (percentage >= 50) return "bg-orange-50 border-orange-200 text-orange-800";
        return "bg-gray-50 border-gray-200 text-gray-800";
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
            (message || "An error occurred.") +
            "</p>" +
            '\n    <button id="back-to-themes-btn" class="quiz-button">Back to home</button>' +
            "\n  </div>" +
            "\n</div>"
        );
    };

    // CLICK HANDLER: simple et fiable (les écrans sont re-rendus, donc pas de doublons sur les mêmes nodes)
    UICore.prototype.addClickHandler = function (elementId, handler) {
        const el = document.getElementById(elementId);
        if (!el) return;

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