// ui-core.js v3.1 - TESTf-Refined UX flow (new user → quiz → results → stats)
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
        this.charts =
            typeof UICharts !== "undefined"
                ? new UICharts(this, this.storageManager, this.resourceManager)
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
        const metadata = await this.resourceManager.loadMetadata();
        this.themeIndexCache = metadata.themes || [];
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

            // Reset scroll to top for each new screen
            try {
                window.scrollTo({ top: 0, behavior: "smooth" });
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
            '\n    <p class="text-lg text-gray-700 mb-6">' +
            "\n      No signup. No account. Just answer the questions and get an honest snapshot of your level." +
            "\n    </p>" +
            '\n    <button id="start-first-quiz-btn" class="quiz-button w-full sm:w-auto">' +
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
            "\n        <p class=\"font-semibold\">Progress tracking</p>" +
            "\n        <p>Earn French Points and unlock new themes as you go.</p>" +
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
            '\n<div class="bg-gradient-to-br from-blue-50 to-purple-50 min-h-screen" role="main" aria-label="Themes screen">' +
            '\n  <div class="max-w-6xl mx-auto px-4 pt-6 pb-10">' +
            '\n    <div class="text-center mb-6">' +
            '\n      <h1 class="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Welcome back</h1>' +
            '\n      <p class="text-sm md:text-base text-gray-700">' +
            progressText +
            "</p>" +
            "\n    </div>" +
            '\n    <section id="themes-section" aria-label="Available themes">' +
            '\n      <h2 class="text-xl font-bold text-gray-800 mb-4 text-center">Choose your next theme</h2>' +
            '\n      <div id="themes-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">' +
            this.generateSimpleThemesGrid() +
            "\n      </div>" +
            "\n    </section>" +
            '\n    <div class="text-center mt-6">' +
            '\n      <button id="view-stats-btn" class="text-gray-600 hover:text-gray-900 underline text-sm md:text-base">' +
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
                ? this.features.getCompletionMessage(resultsData.percentage, resultsData.score)
                : "+" + resultsData.score + " French Points earned") +
            "</div>" +
            '\n      <p class="text-sm text-gray-700">' +
            "French Points help you unlock new themes and build a visible history of your level." +
            "</p>" +
            "\n    </div>" +
            '\n    <div class="mb-6">' +
            this.generateNextActionButton(resultsData) +
            "\n    </div>" +
            '\n    <div class="mb-6">' +
            '\n      <button id="toggle-details-btn" class="quiz-button">' +
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
            '\n      <button id="quit-quiz-btn" class="quiz-button">' +
            "Back to theme" +
            "</button>" +
            '\n      <button id="back-to-themes-btn" class="quiz-button">' +
            "Home" +
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
            '<button id="go-themes-btn" class="quiz-button">Back to theme</button>' +
            '<button id="home-quiz-btn" class="quiz-button">Home</button>' +
            "</div>" +
            "\n  </div>" +
            '\n  <div class="w-full h-2 bg-gray-200 rounded-full mb-6" aria-hidden="true">' +
            '<div id="quiz-progress-bar" class="h-2 bg-amber-400 rounded-full transition-all w-pct-0"></div>' +
            "</div>" +
            '\n  <div id="question-container" class="space-y-4"></div>' +
            '\n  <div id="feedback-container" class="mt-6" role="status" aria-live="polite"></div>' +
            '\n  <div class="mt-6 flex items-center justify-between">' +
            '<button id="prev-question-btn" class="quiz-button">Previous</button>' +
            '<button id="next-question-btn" class="quiz-button">Next</button>' +
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

        const questionContainer = document.getElementById("question-container");
        if (!questionContainer) {
            console.error("UICore: question-container not found");
            return;
        }

        const feedbackContainer = document.getElementById("feedback-container");
        if (feedbackContainer) {
            feedbackContainer.classList.add("hidden");
            feedbackContainer.innerHTML = "";
        }

        questionContainer.innerHTML = this.generateQuestionHTML(question);
        this.setupQuestionEvents();
        this.updateQuizProgress();
    };

    UICore.prototype.generateQuestionHTML = function (question) {
        const questionText = question.question || question.text || "Question text missing";
        const hasAudio = !!question.audio;
        const questionNumber = this.quizManager.currentIndex + 1;
        const totalQuestions =
            (this.quizManager.currentQuiz && this.quizManager.currentQuiz.questions.length) || 0;

        return (
            '\n<div class="question-content">' +
            (hasAudio ? this.generateAudioHTML(question.audio) : "") +
            '\n  <div class="question-header mb-4">' +
            '\n    <div class="flex items-center justify-between mb-4">' +
            '\n      <span class="text-sm font-medium text-gray-600">' +
            (this.quizManager.currentQuiz ? this.quizManager.currentQuiz.name : "") +
            " · Question " +
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
            question.options.map(this.generateOptionHTML.bind(this)).join("") +
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
            '\n    <audio class="question-audio hidden" preload="metadata" src="' +
            audioPath +
            '">' +
            '\n      <source src="' +
            audioPath +
            '" type="audio/mpeg">' +
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
            letters[index] +
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
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    self.selectOption(index, option);
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
            this.quizManager.validateCurrentAnswer();
            this.updateNavigationButtons();

            const nextBtn = document.getElementById("next-question-btn");
            if (nextBtn && !nextBtn.disabled) nextBtn.focus();
        } catch (error) {
            console.error("Error selecting option:", error);
        }
    };

    UICore.prototype.showQuestionFeedback = function (question, selectedIndex) {
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
        if (this.storageManager.isPremiumUser()) return "section-theme-premium";

        const isUnlocked = this.storageManager.isQuizUnlocked(theme.id * 100 + 1);
        if (isUnlocked && !this.storageManager.isPremiumUser()) {
            return "section-theme-unlocked";
        }

        return "section-theme-locked";
    };

    UICore.prototype.generateSimpleThemesGrid = function () {
        if (!this.themeIndexCache || this.themeIndexCache.length === 0) {
            return '<div class="text-center text-gray-500 col-span-full">Loading themes...</div>';
        }

        const self = this;
        return this.themeIndexCache
            .map(function (theme) {
                return (
                    '\n<div class="theme-item ' +
                    self.getThemeStateClass(theme) +
                    '" data-theme-id="' +
                    theme.id +
                    '">' +
                    '\n  <div class="text-center">' +
                    '\n    <div class="text-2xl mb-2">' +
                    (theme.icon || "") +
                    "</div>" +
                    '\n    <h3 class="text-sm font-bold mb-1">' +
                    theme.name +
                    "</h3>" +
                    '\n    <p class="text-xs text-gray-600 line-clamp-2">' +
                    (theme.description || "") +
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
        // Cas 1 : thème déjà débloqué → on affiche juste la progression
        if (this.storageManager.isThemeUnlocked &&
            this.storageManager.isThemeUnlocked(themeId)) {

            if (typeof this.storageManager.getThemeProgress === "function") {
                const progress = this.storageManager.getThemeProgress(themeId) || {
                    completedCount: 0,
                    total: 0
                };
                const color = progress.completedCount > 0 ? "green" : "blue";

                return (
                    '<div class="text-xs text-' +
                    color +
                    '-600 mt-2">Completed ' +
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

        // Cas 3 : logique French Points disponible
        const unlockStatus = this.storageManager.canUnlockTheme(themeId) || {};

        if (unlockStatus.reason === "PREVIOUS_LOCKED") {
            const themeNames = {
                1: "Colors",
                2: "Numbers",
                3: "Gender",
                4: "Singular and plural",
                5: "Present tense",
                6: "Accents",
                7: "Feelings",
                8: "Metro",
                9: "Bakery",
                10: "Cafe"
            };
            const previousTheme = themeNames[themeId - 1] || "previous theme";
            const costInfo = typeof unlockStatus.cost === "number" ? unlockStatus.cost : "";

            return (
                '<div class="text-xs text-gray-500 mt-2">Unlock ' +
                previousTheme +
                " first. Cost: " +
                costInfo +
                " French Points or purchase premium access.</div>"
            );
        }

        if (unlockStatus.canUnlock === false && typeof unlockStatus.cost === "number") {
            const fp = typeof this.storageManager.getFrenchPoints === "function"
                ? this.storageManager.getFrenchPoints()
                : 0;
            const needed = unlockStatus.cost - fp;

            return (
                '<div class="text-xs text-gray-500 mt-2">' +
                needed +
                " more French Points needed or purchase premium access.</div>"
            );
        }

        if (unlockStatus.canUnlock && typeof unlockStatus.cost === "number") {
            return (
                '<div class="text-xs text-blue-600 mt-2">Unlock with ' +
                unlockStatus.cost +
                " French Points or purchase premium access.</div>"
            );
        }

        // Fallback ultra-safe
        return '<div class="text-xs text-gray-500 mt-2">Premium theme.</div>';
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
            return t.id === themeId;
        });

        if (!theme) {
            return this.generateErrorHTML("Theme not found");
        }

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
            theme.name +
            "</h1>" +
            '\n      <p class="text-lg text-gray-700">' +
            (theme.description || "") +
            "</p>" +
            "\n    </div>" +
            '\n    <div id="quizzes-grid" class="grid grid-cols-1 md:grid-cols-2 gap-6" aria-label="Quizzes in this theme">' +
            this.generateQuizCards(theme.quizzes) +
            "\n    </div>" +
            "\n  </div>" +
            "\n</div>"
        );
    };

    UICore.prototype.generateQuizCards = function (quizzes) {
        const self = this;

        return (
            quizzes
                .map(function (quiz) {
                    const isUnlocked = self.storageManager.isQuizUnlocked(quiz.id);
                    const isCompleted = self.storageManager.isQuizCompleted(quiz.id);
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
                        (quiz.id % 10) +
                        "</span>" +
                        (isCompleted ? '\n    <span class="text-green-600 text-sm">Done</span>' : "") +
                        (!isUnlocked ? '\n    <span class="text-gray-400 text-sm">Locked</span>' : "") +
                        "\n  </div>" +
                        '\n  <h3 class="font-bold text-lg mb-2">' +
                        quiz.name +
                        "</h3>" +
                        '\n  <p class="text-gray-600 text-sm">' +
                        (quiz.description || "") +
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
        this.addClickHandler("start-first-quiz-btn", function () {
            self.quizManager.currentThemeId = 1;
            self.quizManager.loadQuiz(1, 101);
        });

        // Returning user: stats button
        this.bindEvent("view-stats-btn", "showStatsScreen");

        // Theme tiles
        this.setupThemeClickEvents();
    };

    UICore.prototype.setupQuizSelectionEvents = function () {
        const self = this;
        this.bindEvent("back-to-themes-btn", "showWelcomeScreen");

        const quizCards = document.querySelectorAll(".quiz-item[data-quiz-id]");
        quizCards.forEach(function (card) {
            card.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();

                const quizId = parseInt(card.dataset.quizId, 10);
                if (self.storageManager.isQuizUnlocked(quizId)) {
                    const realThemeId = Math.floor(quizId / 100);
                    self.quizManager.loadQuiz(realThemeId, quizId);
                } else if (self.features && self.features.showPaywallModal) {
                    self.features.showPaywallModal("unlock-quiz-" + quizId);
                }
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

        const goBackToSelection = function () {
            if (self.quizManager && self.quizManager.currentThemeId) {
                self.showQuizSelection();
            } else {
                self.showWelcomeScreen();
            }
        };

        addClick("quit-quiz-btn", goBackToSelection);
        addClick("back-to-themes-btn", goBackToSelection);
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

        this.addClickHandler("next-quiz-btn", function () {
            const nextQuiz =
                self.features && self.features.getNextQuizInTheme
                    ? self.features.getNextQuizInTheme()
                    : null;
            if (nextQuiz) {
                self.quizManager.loadQuiz(nextQuiz.themeId, nextQuiz.quizId);
            } else {
                self.showQuizSelection();
            }
        });

        ["retry-quiz-primary-btn", "retry-quiz-btn"].forEach(function (id) {
            self.addClickHandler(id, function () {
                const currentThemeId = self.quizManager.currentThemeId;
                const currentQuizId = self.quizManager.currentQuizId;
                if (currentThemeId && currentQuizId) {
                    self.quizManager.loadQuiz(currentThemeId, currentQuizId);
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

    UICore.prototype.setupThemeClickEvents = function () {
        const root = this.appContainer || document;
        const tiles = root.querySelectorAll(".theme-item[data-theme-id]");
        const self = this;

        tiles.forEach(function (tile) {
            tile.addEventListener("click", function () {
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

                if (id === 1) {
                    self.quizManager.currentThemeId = 1;
                    self.showQuizSelection();
                } else {
                    alert("This theme is premium and requires unlocking.");
                }
            });
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

        if (prevBtn) prevBtn.disabled = this.quizManager.isFirstQuestion();

        if (nextBtn) {
            const hasAnswered = this.quizManager.hasAnsweredCurrentQuestion();
            const isLast = this.quizManager.isLastQuestion();
            nextBtn.disabled = !hasAnswered;
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

            const questions = this.quizManager.currentQuiz.questions;
            const userAnswers = this.quizManager.userAnswers;
            const questionStatus = this.quizManager.questionStatus;

            const reviewHTML = questions
                .map(function (question, index) {
                    const userAnswerIndex = userAnswers[index];
                    const isCorrect = questionStatus[index] === "correct";
                    const correctIndex = question.correctIndex;

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
                        (question.options[userAnswerIndex] || "Not answered") +
                        "</span>" +
                        "\n    </div>" +
                        (!isCorrect
                            ? '\n    <div class="text-sm">' +
                            '\n      <span class="text-gray-600">Correct answer:</span>' +
                            '\n      <span class="ml-2 text-green-600 font-medium">' +
                            (question.options[correctIndex] || "") +
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

    UICore.prototype.addClickHandler = function (elementId, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener("click", handler);
        }
    };

    UICore.prototype.bindEvent = function (elementId, action) {
        const element = document.getElementById(elementId);
        const self = this;
        if (element) {
            element.addEventListener("click", function () {
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
        }
    };

    if (global.TYF_CONFIG && global.TYF_CONFIG.debug && global.TYF_CONFIG.debug.enabled) {
        console.log("UICore v3.1 loaded");
    }

    global.UICore = UICore;
})(window);
