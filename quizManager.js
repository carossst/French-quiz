// quizManager.js - v3 (Option B - manual Next)

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




  console.log("QuizManager: Initialized with dependencies (v3)");
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

  console.log("QuizManager: State reset");
};



QuizManager.prototype.normalizeText = function (s) {
  if (window.TYF_UTILS && typeof window.TYF_UTILS.normalizeText === "function") {
    return window.TYF_UTILS.normalizeText(s);
  }
  return String(s || "").trim();
};



QuizManager.prototype.loadQuiz = async function (themeId, quizId) {
  console.log(`QuizManager: Loading quiz Theme ${themeId}, Quiz ${quizId}`);

  try {
    const quizData = await this.resourceManager.getQuiz(themeId, quizId);

    if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      throw new Error("Invalid quiz data structure received from ResourceManager");
    }

    const badges = (typeof this.storageManager.getBadges === "function")
      ? this.storageManager.getBadges()
      : [];
    this.previousBadgeCount = Array.isArray(badges) ? badges.length : 0;

    this.resetQuizState();

    this.currentThemeId = themeId;
    this.currentQuizId = quizId;
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

    if (typeof this.storageManager.isQuizCompleted === "function") {
      const alreadyCompleted = this.storageManager.isQuizCompleted(
        this.currentThemeId,
        this.currentQuizId
      );

      if (alreadyCompleted) {
        this.ui?.showFeedbackMessage?.(
          "info",
          "ℹ️ Revision mode: no French Points on replays (first completion only)"
        );
      }
    }

    this.preprocessQuestions();

    const questionCount = this.currentQuiz.questions.length;
    this.userAnswers = new Array(questionCount).fill(null);
    this.questionStatus = new Array(questionCount).fill(null);
    this.questionTimes = new Array(questionCount).fill(0);

    // ⏱️ INIT TIMING STATE (question timing starts when the question is rendered)
    this.totalTimeElapsed = 0;
    this.startTime = this._now();
    this.questionStartTime = null;

    if (this.ui && this.ui.showQuizScreen) {
      this.ui.showQuizScreen();
    } else {
      console.error("QuizManager: UI method not available");
    }




    console.log(`QuizManager: Quiz loaded successfully. ${questionCount} questions.`);

    if (typeof window.track === "function") {
      window.track("quiz_started", { theme: themeId, quiz: quizId });
    }
  } catch (error) {
    console.error(`QuizManager: Error loading quiz ${quizId} for theme ${themeId}:`, error);
    this.resetQuizState();

    if (typeof window.showErrorMessage === "function") {
      window.showErrorMessage(`Failed to load quiz: ${error.message}`);
    }

    if (this.ui && this.ui.showWelcomeScreen) {
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


QuizManager.prototype.preprocessQuestions = function () {
  if (!this.currentQuiz || !this.currentQuiz.questions) return;

  this.currentQuiz.questions.forEach((question, index) => {
    // Normaliser correctIndex si présent (évite "2" vs 2)
    if (question.correctIndex !== undefined && question.correctIndex !== null) {
      const n = Number(question.correctIndex);
      if (Number.isFinite(n)) {
        question.correctIndex = n;
      } else {
        console.error(`Question ${index + 1}: Invalid - correctIndex is not a number`);
        question.isInvalid = true;
        question.correctIndex = -1;
      }
      return;
    }

    // Sinon, fallback correctAnswer -> correctIndex
    if (question.correctAnswer !== undefined && question.correctAnswer !== null) {
      if (!Array.isArray(question.options)) {
        console.error(`Question ${index + 1}: Invalid - options is not an array`);
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
        console.error(`Question ${index + 1}: Invalid - correct answer not in options`);
        question.isInvalid = true;
        question.correctIndex = -1;

        if (this.ui && this.ui.showError) {
          this.ui.showError(`Question ${index + 1} has invalid data`);
        }
      }
    } else {
      // Ni correctIndex ni correctAnswer: données invalides
      console.error(`Question ${index + 1}: Invalid - missing correctIndex and correctAnswer`);
      question.isInvalid = true;
      question.correctIndex = -1;
    }
  });
};


QuizManager.prototype.displayQuiz = function () {
  if (this.ui && this.ui.showQuizScreen) {
    this.ui.showQuizScreen();
  } else {
    console.error("QuizManager: Modern UI not available, cannot display quiz");
  }
};

QuizManager.prototype.renderCurrentQuestion = function () {
  if (!this.currentQuiz) {
    console.error("QuizManager: Cannot render question - no quiz loaded");
    return;
  }

  // ⏱️ (re)start timing at the moment the question is rendered
  this._startTiming();

  if (this.ui && this.ui.renderCurrentQuestion) {
    this.ui.renderCurrentQuestion();
  } else {
    console.error("QuizManager: UI method not available");
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
    console.warn("QuizManager: Invalid answer selection", {
      currentIndex: this.currentIndex,
      answerIndex,
      questionOptions: question && question.options
    });
    return;
  }

  const prev = this.userAnswers[this.currentIndex];
  this.userAnswers[this.currentIndex] = answerIndex;

  // IMPORTANT: if user changes answer after validation, force “non validated” state first
  if (prev !== null && prev !== undefined && prev !== answerIndex) {
    if (this.questionStatus[this.currentIndex] !== null) {
      this.questionStatus[this.currentIndex] = null;
      this._lastValidatedQuestionIndex = null;
      this._lastValidatedAnswerIndex = null;
    }
  }

  if (this.ui && this.ui.updateSelectedOption) {
    this.ui.updateSelectedOption(answerIndex);
  }

  // Auto-validation on click (as per your Mode 2 rules)
  this.validateCurrentAnswer();

  // Keep nav buttons correct (Next locked/unlocked)
  if (this.ui && this.ui.updateNavigationButtons) {
    this.ui.updateNavigationButtons();
  }
};


QuizManager.prototype.validateCurrentAnswer = function () {
  const answerIndex = this.userAnswers[this.currentIndex];
  if (answerIndex === null || answerIndex === undefined) {
    console.warn("QuizManager: No answer selected to validate");
    return;
  }

  // If already validated for same question & same answer, do nothing
  if (
    this.questionStatus[this.currentIndex] !== null &&
    this._lastValidatedAnswerIndex === answerIndex &&
    this._lastValidatedQuestionIndex === this.currentIndex
  ) {
    return;
  }

  const question = this.getCurrentQuestion();
  const isCorrect = !!(question && question.correctIndex === answerIndex);

  const prevStatus = this.questionStatus[this.currentIndex]; // null | "correct" | "incorrect"
  const nextStatus = isCorrect ? "correct" : "incorrect";

  // Score transitions
  if (prevStatus === null) {
    if (nextStatus === "correct") this.score += 1;
  } else if (prevStatus === "correct" && nextStatus === "incorrect") {
    this.score = Math.max(0, this.score - 1);
  } else if (prevStatus === "incorrect" && nextStatus === "correct") {
    this.score += 1;
  }

  this.questionStatus[this.currentIndex] = nextStatus;

  this._lastValidatedQuestionIndex = this.currentIndex;
  this._lastValidatedAnswerIndex = answerIndex;

  if (this.ui && this.ui.showQuestionFeedback) {
    this.ui.showQuestionFeedback(question, answerIndex);
  }

  console.log(
    `QuizManager: Validation - Question ${this.currentIndex + 1}, Status: ${nextStatus}, Score: ${this.score}`
  );
};



QuizManager.prototype.nextQuestion = function () {
  if (!this.currentQuiz) return false;

  if (this.questionStatus[this.currentIndex] === null) {
    if (typeof this.ui?.showFeedbackMessage === "function") {
      this.ui.showFeedbackMessage("warn", "Validate your answer to continue");
    } else if (typeof window.showErrorMessage === "function") {
      window.showErrorMessage("Validate your answer to continue");
    }
    return false;
  }

  const isLast = this.currentIndex >= this.currentQuiz.questions.length - 1;

  // Enregistrer le temps UNE SEULE FOIS
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
  console.warn(
    "QuizManager.submitAnswer() called. Current flow: selectAnswer handled via UICore. This method is kept for compatibility but is not used in the new flow."
  );
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
  return this.userAnswers[this.currentIndex] !== null &&
    this.userAnswers[this.currentIndex] !== undefined;
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
    console.error("QuizManager: Cannot finish quiz - missing currentQuiz or storageManager");
    return;
  }

  // plus aucun appel à _recordTime ici

  const totalQuestions = this.currentQuiz.questions.length;

  const resultsData = {
    score: this.score,
    total: totalQuestions,
    percentage: totalQuestions > 0 ? Math.round((this.score / totalQuestions) * 100) : 0,
    themeId: this.currentThemeId,
    quizId: this.currentQuizId,
    timeSpentMs: Number(this.totalTimeElapsed) || 0
  };



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
    console.error("QuizManager: storageManager.markQuizCompleted is missing");
    // Fallback: afficher les résultats sans enregistrer
    if (this.ui && this.ui.showResults) this.ui.showResults(resultsData);
    return;
  }

  const timeSpentMs = Number(this.totalTimeElapsed) || 0;

  const didSave = this.storageManager.markQuizCompleted(
    this.currentThemeId,
    this.currentQuizId,
    resultsData.score,
    resultsData.total,
    timeSpentMs
  );


  const fpAfter = this.storageManager.getFrenchPoints?.() ?? fpBefore;
  resultsData.fpEarned = didSave ? Math.max(0, fpAfter - fpBefore) : 0;

  if (!didSave) {
    resultsData.revisionMode = true;
  }


  if (this.ui && this.ui.showResults) {
    this.ui.showResults(resultsData);
  } else {
    console.error("QuizManager: ui.showResults not available");
  }

  if (
    this.currentThemeId === 1 &&
    this.currentQuizId === 105 &&
    this.ui?.features?.showUserProfileModal
  ) {
    setTimeout(() => {
      this.ui?.features?.showUserProfileModal?.();
    }, 2000);
  }

  // Badges: StorageManager est la source de vérité et dispatch déjà "badges-earned".
  // Donc rien à déclencher ici.
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
