// quizManager.js - v3 (Option B - manual Next)


function getLogger() {
  return window.Logger && typeof window.Logger.debug === "function"
    ? window.Logger
    : console;
}

function QuizManager(resourceManager, storageManager, ui) {
  if (!resourceManager || !storageManager) {
    throw new Error("QuizManager: Missing dependencies (resourceManager, storageManager)");
  }


  this.resourceManager = resourceManager;
  this.storageManager = storageManager;
  this.ui = ui || null;

  this.quizContainer = null;

  this.currentThemeId = null;
  this.currentQuizId = null;
  this.currentQuiz = null;
  this.currentIndex = 0;
  this.userAnswers = [];
  this.questionStatus = [];
  this.questionTimes = [];
  this.score = 0;
  this.previousBadgeCount = 0;

  // validation cache (manual-next flow)
  this._lastValidatedAnswerIndex = null;
  this._lastValidatedQuestionIndex = null;

  this.totalTimeElapsed = 0;
  this.startTime = null;
  this.questionStartTime = null;




  getLogger().log("QuizManager: Initialized with dependencies (v3)");
}


QuizManager.prototype._recordTime = function (finalize) {
  return this._recordTimeForCurrentQuestion(finalize);
};



QuizManager.prototype.resetQuizState = function () {
  this.currentThemeId = null;
  this.currentQuizId = null;
  this.currentQuiz = null;
  this.currentIndex = 0;
  this.userAnswers = [];
  this.questionStatus = [];
  this.questionTimes = [];
  this.score = 0;

  // reset validation cache
  this._lastValidatedAnswerIndex = null;
  this._lastValidatedQuestionIndex = null;

  // ⏱️ Reset time tracking
  this.totalTimeElapsed = 0;
  this.startTime = null;
  this.questionStartTime = null;

  // IMPORTANT: reset badge baseline too (avoids stale comparisons later)
  this.previousBadgeCount = 0;

  getLogger().log("QuizManager: State reset");
};




QuizManager.prototype.normalizeText = function (s) {
  if (window.TYF_UTILS && typeof window.TYF_UTILS.normalizeText === "function") {
    return window.TYF_UTILS.normalizeText(s);
  }
  return String(s || "").trim();
};



QuizManager.prototype.loadQuiz = async function (themeId, quizId) {
  getLogger().log(`QuizManager: Loading quiz Theme ${themeId}, Quiz ${quizId}`);

  try {
    const quizData = await this.resourceManager.getQuiz(themeId, quizId);

    if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      throw new Error("Invalid quiz data structure received from ResourceManager");
    }

    this.resetQuizState();

    const badges = (typeof this.storageManager.getBadges === "function")
      ? this.storageManager.getBadges()
      : [];
    this.previousBadgeCount = Array.isArray(badges) ? badges.length : 0;


    const tId = Number(themeId);
    const qId = Number(quizId);

    this.currentThemeId = Number.isFinite(tId) ? tId : themeId;
    this.currentQuizId = Number.isFinite(qId) ? qId : quizId;

    this.currentQuiz = {
      ...quizData,
      name: this.normalizeText(quizData.name),
      description: this.normalizeText(quizData.description),
      questions: Array.isArray(quizData.questions)
        ? quizData.questions.map(q => ({
          ...q,
          question: this.normalizeText(q.question),
          text: this.normalizeText(q.text),
          explanation: this.normalizeText(q.explanation),
          correctAnswer: this.normalizeText(q.correctAnswer),
          options: Array.isArray(q.options)
            ? q.options.map(o => this.normalizeText(o))
            : q.options
        }))
        : quizData.questions
    };

    const alreadyCompleted = this.storageManager.isQuizCompleted(this.currentQuizId);

    if (alreadyCompleted) {
      this.ui?.showFeedbackMessage?.(
        "info",
        "🔄 Practice mode: train freely. Points on first run only."
      );
    }

    this.preprocessQuestions();

    const questionCount = this.currentQuiz.questions.length;
    this.userAnswers = new Array(questionCount).fill(null);
    this.questionStatus = new Array(questionCount).fill(null).map(() => ({
      validated: false,
      selectedIndex: null,
      isCorrect: null
    }));

    this.questionTimes = new Array(questionCount).fill(0);

    // ⏱️ INIT TIMING STATE (question timing starts when the question is rendered)
    this.totalTimeElapsed = 0;
    this.startTime = this._now();
    this.questionStartTime = null;

    if (this.ui && this.ui.showQuizScreen) {
      this.ui.showQuizScreen();

      // Tracking start (source de vérité StorageManager)
      if (this.storageManager && typeof this.storageManager.markQuizStarted === "function") {
        this.storageManager.markQuizStarted({ themeId: this.currentThemeId, quizId: this.currentQuizId });
      }
    } else {
      getLogger().error("QuizManager: UI method not available");
    }


    getLogger().log(`QuizManager: Quiz loaded successfully. ${questionCount} questions.`);


    // Tracking quiz_started géré par StorageManager (source de vérité)

    // APRÈS (ne plus renvoyer à Home, revenir à la sélection si possible)
  } catch (error) {
    getLogger().error(`QuizManager: Error loading quiz ${quizId} for theme ${themeId}:`, error);

    // Afficher l'erreur d'abord (avant reset, pour garder contexte si besoin)
    if (typeof window.showErrorMessage === "function") {
      window.showErrorMessage(`Failed to load quiz (Theme ${themeId}, Quiz ${quizId}).`);
    }

    // Reset state
    this.resetQuizState();

    // Revenir à la sélection du thème si on peut (meilleur UX)
    if (this.ui && typeof this.ui.showQuizSelection === "function") {
      // restaurer le thème courant pour que la sélection sache quoi afficher
      const tId = Number(themeId);
      this.currentThemeId = Number.isFinite(tId) ? tId : themeId;

      // ui-core lit quizManager.currentThemeId -> donc ça suffit
      this.ui.showQuizSelection();
      return;
    }

    // Fallback ultime: Home seulement si on n'a pas de selection screen
    if (this.ui && typeof this.ui.showWelcomeScreen === "function") {
      this.ui.showWelcomeScreen();
    }
  }

};

QuizManager.prototype._now = function () {
  return (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
};

QuizManager.prototype._startTiming = function () {
  const now = this._now();
  if (this.startTime === null) this.startTime = now;
  this.questionStartTime = now;
};

QuizManager.prototype._recordTimeForCurrentQuestion = function (finalize) {
  if (this.questionStartTime === null) return;

  const now = this._now();
  const delta = Math.max(0, now - this.questionStartTime);

  // total quiz time (ms)
  this.totalTimeElapsed += delta;

  // per-question time (ms)
  if (Array.isArray(this.questionTimes) && typeof this.currentIndex === "number") {
    const prev = this.questionTimes[this.currentIndex] || 0;
    this.questionTimes[this.currentIndex] = prev + delta;
  }

  this.questionStartTime = finalize ? null : now;
};

QuizManager.prototype.pauseTiming = function () {
  // Enregistre le temps courant sans avancer l’index
  this._recordTime(false);
};

QuizManager.prototype.preprocessQuestions = function () {
  if (!this.currentQuiz || !this.currentQuiz.questions) return;

  this.currentQuiz.questions.forEach((question, index) => {
    // Normaliser correctIndex si présent (évite "2" vs 2)
    if (question.correctIndex !== undefined && question.correctIndex !== null) {
      const n = Number(question.correctIndex);
      if (Number.isFinite(n)) {
        question.correctIndex = n;
      } else {
        getLogger().error(`Question ${index + 1}: Invalid - correctIndex is not a number`);
        question.isInvalid = true;
        question.correctIndex = -1;
      }
      return;

    }

    // Sinon, fallback correctAnswer -> correctIndex
    if (question.correctAnswer !== undefined && question.correctAnswer !== null) {
      if (!Array.isArray(question.options)) {
        getLogger().error(`Question ${index + 1}: Invalid - options is not an array`);

        question.isInvalid = true;
        question.correctIndex = -1;
        return;
      }

      const stripLabel = s => String(s || "").replace(/^[A-D]\s*[.)]\s*/i, "").trim();
      const normalizedCorrect = stripLabel(question.correctAnswer);

      const correctIndex = question.options.findIndex(option => {
        return option === question.correctAnswer || stripLabel(option) === normalizedCorrect;
      });

      if (correctIndex !== -1) {
        question.correctIndex = correctIndex;
      } else {
        getLogger().error(`Question ${index + 1}: Invalid - correct answer not in options`);

        question.isInvalid = true;
        question.correctIndex = -1;

        if (this.ui && this.ui.showError) {
          this.ui.showError(`Question ${index + 1} has invalid data`);
        }
      }
    } else {
      // Ni correctIndex ni correctAnswer: données invalides
      getLogger().error(`Question ${index + 1}: Invalid - missing correctIndex and correctAnswer`);

      question.isInvalid = true;
      question.correctIndex = -1;
    }
  });
};


// Deprecated: display handled by loadQuiz + renderCurrentQuestion


QuizManager.prototype.renderCurrentQuestion = function () {
  if (!this.currentQuiz) {
    getLogger().error("QuizManager: Cannot render question - no quiz loaded");
    return;
  }


  // ⏱️ (re)start timing at the moment the question is rendered
  this._startTiming();

  if (this.ui && this.ui.renderCurrentQuestion) {
    this.ui.renderCurrentQuestion();
  } else {
    getLogger().error("QuizManager: UI method not available");
  }


  if (this.ui && this.ui.updateNavigationButtons) {
    this.ui.updateNavigationButtons();
  }
  if (this.ui && this.ui.updateQuizProgress) {
    this.ui.updateQuizProgress();
  }
};

QuizManager.prototype.selectAnswer = function (answerIndex) {
  const question = this.getCurrentQuestion();
  if (!question || !Array.isArray(question.options) || answerIndex < 0 || answerIndex >= question.options.length) {
    getLogger().warn("QuizManager: Invalid answer selection", {
      currentIndex: this.currentIndex,
      answerIndex,
      questionOptions: question && question.options
    });

    return;
  }

  const st = this.questionStatus[this.currentIndex];
  const prevValidatedIndex = st ? st.selectedIndex : null;

  this.userAnswers[this.currentIndex] = answerIndex;

  // Si l’utilisateur change une réponse déjà validée, on invalide proprement
  if (st && st.validated === true && prevValidatedIndex !== answerIndex) {
    st.validated = false;
    st.selectedIndex = null;
    st.isCorrect = null;

    this._lastValidatedQuestionIndex = null;
    this._lastValidatedAnswerIndex = null;
  }


  if (this.ui && this.ui.updateSelectedOption) {
    this.ui.updateSelectedOption(answerIndex);
  }

  // Auto-validation au clic (Mode 2)
  this.validateCurrentAnswer();

  // Mettre à jour Next (bloqué/débloqué)
  if (this.ui && this.ui.updateNavigationButtons) {
    this.ui.updateNavigationButtons();
  }
};



QuizManager.prototype.validateCurrentAnswer = function () {
  const answerIndex = this.userAnswers[this.currentIndex];
  if (answerIndex === null || answerIndex === undefined) {
    getLogger().warn("QuizManager: No answer selected to validate");
    return;
  }



  const st = this.questionStatus[this.currentIndex];
  if (!st) return;

  // Idempotent: si déjà validé avec la même réponse, ne rien faire
  if (
    st.validated === true &&
    st.selectedIndex === answerIndex &&
    this._lastValidatedAnswerIndex === answerIndex &&
    this._lastValidatedQuestionIndex === this.currentIndex
  ) {
    return;
  }

  const question = this.getCurrentQuestion();
  const isCorrect = !!(question && question.correctIndex === answerIndex);

  st.selectedIndex = answerIndex;
  st.validated = true;
  st.isCorrect = isCorrect;

  // Recalcul KISS du score (robuste)
  let newScore = 0;
  for (let i = 0; i < this.questionStatus.length; i++) {
    const s = this.questionStatus[i];
    if (s && s.validated === true && s.isCorrect === true) newScore += 1;
  }
  this.score = newScore;

  this._lastValidatedQuestionIndex = this.currentIndex;
  this._lastValidatedAnswerIndex = answerIndex;

  if (this.ui && this.ui.showQuestionFeedback) {
    this.ui.showQuestionFeedback(question, answerIndex);
  }

  getLogger().debug(
    `QuizManager: Validation - Q${this.currentIndex + 1}, correct=${st.isCorrect}, score=${this.score}`
  );

};




QuizManager.prototype.nextQuestion = function () {
  if (!this.currentQuiz) return false;

  const st = this.questionStatus && this.questionStatus[this.currentIndex];
  if (!st || st.validated !== true) {
    if (typeof this.ui?.showFeedbackMessage === "function") {
      this.ui.showFeedbackMessage("warn", "Select an answer to continue.");
    } else if (typeof window.showErrorMessage === "function") {
      window.showErrorMessage("Select an answer to continue.");
    }
    return false;
  }

  const isLast = this.currentIndex >= this.currentQuiz.questions.length - 1;

  this._recordTime(isLast);

  if (!isLast) {
    this.currentIndex++;
    this.renderCurrentQuestion();
    return true;
  }

  this.finishQuiz();
  return true;
};



QuizManager.prototype.previousQuestion = function () {
  if (this.currentIndex > 0) {
    // record time spent on the question we are leaving
    this._recordTime(false);

    this.currentIndex--;
    this.renderCurrentQuestion();
    return true;
  }
  return false;
};



QuizManager.prototype.submitAnswer = function (answerIndex) {
  // Compat: legacy callers.
  // New flow uses selectAnswer() which auto-validates (Mode 2).
  this.selectAnswer(answerIndex);
};


QuizManager.prototype.getCurrentQuestion = function () {
  if (
    !this.currentQuiz ||
    !Array.isArray(this.currentQuiz.questions) ||
    this.currentIndex >= this.currentQuiz.questions.length
  ) {
    return null;
  }
  return this.currentQuiz.questions[this.currentIndex];
};

QuizManager.prototype.hasAnsweredCurrentQuestion = function () {
  const st = this.questionStatus && this.questionStatus[this.currentIndex];
  return !!(st && st.validated === true);
};


QuizManager.prototype.isLastQuestion = function () {
  return this.currentQuiz &&
    this.currentIndex === this.currentQuiz.questions.length - 1;
};

QuizManager.prototype.isFirstQuestion = function () {
  return this.currentIndex === 0;
};

QuizManager.prototype.getQuizProgress = function () {
  if (!this.currentQuiz || !Array.isArray(this.currentQuiz.questions)) {
    return { current: 0, total: 0, percentage: 0 };
  }

  const totalQuestions = this.currentQuiz.questions.length;
  const currentQuestion = this.currentIndex + 1;
  const percentage = totalQuestions > 0 ? Math.round((currentQuestion / totalQuestions) * 100) : 0;

  return {
    current: currentQuestion,
    total: totalQuestions,
    percentage
  };
};

QuizManager.prototype.finishQuiz = function () {
  if (!this.currentQuiz || !this.storageManager) {
    getLogger().error("QuizManager: Cannot finish quiz - missing currentQuiz or storageManager");
    return;
  }

  const totalQuestions = this.currentQuiz.questions.length;

  // ⏱️ Source de vérité interne QuizManager = millisecondes
  const timeSpentMs = Number(this.totalTimeElapsed) || 0;
  // ✅ Conversion KISS vers secondes pour StorageManager
  const timeSpentSec = Math.max(0, Math.round(timeSpentMs / 1000));

  const resultsData = {
    score: this.score,
    total: totalQuestions,
    percentage: totalQuestions > 0
      ? Math.round((this.score / totalQuestions) * 100)
      : 0,
    themeId: this.currentThemeId,
    quizId: this.currentQuizId,

    // UI-friendly (optionnel mais utile)
    timeSpentSec: timeSpentSec,
    timeSpentMs: timeSpentMs
  };

  // Tracking éventuel externe (si présent)
  if (typeof window.track === "function") {
    window.track("quiz_completed", {
      theme: this.currentThemeId,
      quiz: this.currentQuizId,
      score: this.score,
      total: totalQuestions,
      percentage: resultsData.percentage
    });
  }

  const fpBefore = this.storageManager.getFrenchPoints?.() ?? 0;

  if (typeof this.storageManager.markQuizCompleted !== "function") {
    getLogger().error("QuizManager: storageManager.markQuizCompleted is missing");

    // Fallback: afficher les résultats sans persister
    if (this.ui && this.ui.showResults) {
      this.ui.showResults(resultsData);
    }
    return;
  }

  // ✅ IMPORTANT: on passe DES SECONDES à StorageManager
  const didSave = this.storageManager.markQuizCompleted(
    this.currentThemeId,
    this.currentQuizId,
    resultsData.score,
    resultsData.total,
    timeSpentSec
  );

  const fpAfter = this.storageManager.getFrenchPoints?.() ?? fpBefore;
  resultsData.fpEarned = didSave ? Math.max(0, fpAfter - fpBefore) : 0;

  if (!didSave) {
    resultsData.revisionMode = true;
  }

  if (this.ui && this.ui.showResults) {
    this.ui.showResults(resultsData);
  } else {
    getLogger().error("QuizManager: ui.showResults not available");
  }

  // Post-quiz UX: email capture après Theme 1 / Quiz 105
  if (
    this.currentThemeId === 1 &&
    this.currentQuizId === 105 &&
    this.ui?.features?.showUserProfileModal
  ) {
    setTimeout(() => {
      this.ui?.features?.showUserProfileModal?.();
    }, 2000);
  }
};


QuizManager.prototype.getResultsSummary = function () {
  if (!this.currentQuiz) {
    return { score: 0, total: 0, percentage: 0 };
  }

  const totalQuestions = this.currentQuiz.questions.length;

  return {
    score: this.score,
    total: totalQuestions,
    percentage:
      totalQuestions > 0 ? Math.round((this.score / totalQuestions) * 100) : 0
  };
};

window.QuizManager = QuizManager;
