// quizManager.js â€“ Version 3.0

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

  this.totalTimeElapsed = 0;
  this.startTime = null;
  this.questionStartTime = null;
  this.feedbackDelay = 1500;


  console.log("QuizManager: Initialized with dependencies (v3)");
}

QuizManager.prototype.resetQuizState = function () {
  this.currentThemeId = null;
  this.currentQuizId = null;
  this.currentQuiz = null;
  this.currentIndex = 0;
  this.userAnswers = [];
  this.questionStatus = [];
  this.questionTimes = [];
  this.score = 0;
  this.totalTimeElapsed = 0;
  console.log("QuizManager: State reset");
};

QuizManager.prototype.loadQuiz = async function (themeId, quizId) {
  console.log(`QuizManager: Loading quiz Theme ${themeId}, Quiz ${quizId}`);

  try {
    const quizData = await this.resourceManager.getQuiz(themeId, quizId);

    if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      throw new Error("Invalid quiz data structure received from ResourceManager");
    }
    this.previousBadgeCount = this.storageManager.getBadges().length;
    this.resetQuizState();

    this.currentThemeId = themeId;
    this.currentQuizId = quizId;
    this.currentQuiz = quizData;

    if (typeof this.storageManager.isQuizCompleted === 'function' &&
      this.storageManager.isQuizCompleted(this.currentQuizId)) {
      this.ui?.showFeedbackMessage?.(
        'info',
        'ðŸ” Revision mode: no French Points on replays (first completion only)'
      );
    }
    this.preprocessQuestions();

    const questionCount = quizData.questions.length;
    this.userAnswers = new Array(questionCount).fill(null);
    this.questionStatus = new Array(questionCount).fill(null);
    this.questionTimes = new Array(questionCount).fill(0);


    if (this.ui && this.ui.showQuizScreen) {
      this.ui.showQuizScreen();
    } else {
      console.error("QuizManager: UI method not available");
    }

    console.log(`QuizManager: Quiz loaded successfully. ${questionCount} questions.`);

    if (window.track) {
      window.track('quiz_started', { theme: themeId, quiz: quizId });
    }

  } catch (error) {
    console.error(`QuizManager: Error loading quiz ${quizId} for theme ${themeId}:`, error);
    this.resetQuizState();
    if (window.showErrorMessage) {
      window.showErrorMessage(`Failed to load quiz: ${error.message}`);
    }
    if (this.ui && this.ui.showWelcomeScreen) this.ui.showWelcomeScreen();
  }
};

QuizManager.prototype.preprocessQuestions = function () {
  if (!this.currentQuiz || !this.currentQuiz.questions) return;

  this.currentQuiz.questions.forEach((question, index) => {
    if (question.correctIndex === undefined && question.correctAnswer !== undefined) {
      const correctIndex = question.options.findIndex(option => option === question.correctAnswer);
      if (correctIndex !== -1) {
        question.correctIndex = correctIndex;
      } else {
        // Marquer la question comme invalide au lieu de fallback
        console.error(`Question ${index + 1}: Invalid - correct answer not in options`);
        question.isInvalid = true;
        question.correctIndex = -1; // -1 indique erreur

        // Optionnel: notifier l'UI
        if (this.ui && this.ui.showError) {
          this.ui.showError(`Question ${index + 1} has invalid data`);
        }
      }
    }
  });
};

QuizManager.prototype.displayQuiz = function (quiz) {
  // Utiliser le systÃ¨me UI moderne au lieu de l'ancien
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

  // Utiliser le systÃ¨me UI existant - PAS de passage automatique
  if (this.ui && this.ui.renderCurrentQuestion) {
    this.ui.renderCurrentQuestion();
  } else {
    console.error("QuizManager: UI method not available");
  }

  if (this.ui && this.ui.updateNavigationButtons) this.ui.updateNavigationButtons();
  if (this.ui && this.ui.updateProgressBar) this.ui.updateProgressBar();
};

QuizManager.prototype.selectAnswer = function (answerIndex) {
  const question = this.getCurrentQuestion();
  if (!question || answerIndex < 0 || answerIndex >= question.options.length) {
    console.warn("QuizManager: Invalid answer selection", { currentIndex: this.currentIndex, answerIndex, questionOptions: question?.options });
    return;
  }

  // SEULEMENT stocker la rÃ©ponse
  this.userAnswers[this.currentIndex] = answerIndex;

  console.log(`QuizManager: Answer selected: ${answerIndex} for question ${this.currentIndex + 1}`);

  // Mettre Ã  jour l'UI pour montrer la sÃ©lection
  if (this.ui && this.ui.updateSelectedOption) {
    this.ui.updateSelectedOption(answerIndex);
  }
};

QuizManager.prototype.validateCurrentAnswer = function () {
  const answerIndex = this.userAnswers[this.currentIndex];
  if (answerIndex === null || answerIndex === undefined) {
    console.warn("QuizManager: No answer selected to validate");
    return;
  }

  const question = this.getCurrentQuestion();
  const isCorrect = question.correctIndex === answerIndex;

  // Maintenant on met Ã  jour le score
  if (isCorrect) this.score++;
  this.questionStatus[this.currentIndex] = isCorrect ? "correct" : "incorrect";

  console.log(`QuizManager: Validation - Question ${this.currentIndex + 1}, Correct: ${isCorrect}, Score: ${this.score}`);

  // Afficher le feedback SANS naviguer automatiquement
  if (this.ui && this.ui.showQuestionFeedback) {
    this.ui.showQuestionFeedback(question, answerIndex);
  }

  // PAS de setTimeout - l'utilisateur clique "Next" quand il veut
};

QuizManager.prototype.nextQuestion = function () {
  if (this.currentIndex < this.currentQuiz.questions.length - 1) {
    this.currentIndex++;
    this.renderCurrentQuestion();

    return true;
  } else {
    console.log("QuizManager: End of quiz reached, preparing to finish.");
    this.finishQuiz();
    return false;
  }
};

QuizManager.prototype.previousQuestion = function () {
  if (this.currentIndex > 0) {
    this.currentIndex--;
    this.renderCurrentQuestion();
    return true;
  }
  return false;
};

QuizManager.prototype.submitAnswer = function (answerIndex) {
  console.warn("QuizManager.submitAnswer() called. Current flow: selectAnswer handles submission implicitly.");
  this.selectAnswer(answerIndex);
};
QuizManager.prototype.finishQuiz = function () {
  if (!this.currentQuiz || !this.storageManager) {
    console.error("QuizManager: Cannot finish quiz - missing currentQuiz or storageManager");
    return;
  }

  const resultsData = {
    score: this.score,
    total: this.currentQuiz.questions.length,
    percentage: this.currentQuiz.questions.length > 0
      ? Math.round((this.score / this.currentQuiz.questions.length) * 100)
      : 0,
    themeId: this.currentThemeId
  };

  if (window.track) {
    window.track('quiz_completed', {
      theme: this.currentThemeId,
      quiz: this.currentQuizId,
      score: this.score,
      total: this.currentQuiz.questions.length,
      percentage: resultsData.percentage
    });
  }

  const fpBefore = this.storageManager.getFrenchPoints?.() ?? 0;

  this.storageManager.markQuizCompleted(
    this.currentThemeId,
    this.currentQuizId,
    resultsData.score,
    resultsData.total,
    this.totalTimeElapsed
  );

  const fpAfter = this.storageManager.getFrenchPoints?.() ?? fpBefore;
  resultsData.fpEarned = Math.max(0, fpAfter - fpBefore);

  if (this.ui && this.ui.showResults) {
    this.ui.showResults(resultsData); // affichera +0 FP en replay
  } else {
    console.error("QuizManager: ui.showResults not available");
  }

  if (this.currentThemeId === 1 && this.currentQuizId === 105 && this.ui.features) {
    setTimeout(() => this.ui.features.showUserProfileModal(), 2000);
  }

  this.triggerBadgeEvents();
};


QuizManager.prototype.triggerBadgeEvents = function () {
  if (!this.storageManager) return;

  const allBadges = this.storageManager.getBadges();
  if (allBadges && allBadges.length > 0) {
    const lastBadgeEarned = allBadges[allBadges.length - 1];
    if (lastBadgeEarned) {
      const newlyEarnedForThisEvent = [lastBadgeEarned];

      if (newlyEarnedForThisEvent.length > 0) {
        window.dispatchEvent(
          new CustomEvent("badges-earned", {
            detail: { badges: newlyEarnedForThisEvent }
          })
        );
        console.log(`QuizManager: Badge event triggered for:`, newlyEarnedForThisEvent);
      }
    }
  }
};



QuizManager.prototype.getCurrentQuestion = function () {
  if (!this.currentQuiz || !Array.isArray(this.currentQuiz.questions) || this.currentIndex >= this.currentQuiz.questions.length) {
    return null;
  }
  return this.currentQuiz.questions[this.currentIndex];
};

QuizManager.prototype.hasAnsweredCurrentQuestion = function () {
  return this.userAnswers[this.currentIndex] !== null && this.userAnswers[this.currentIndex] !== undefined;
};

QuizManager.prototype.isLastQuestion = function () {
  return this.currentQuiz && (this.currentIndex === this.currentQuiz.questions.length - 1);
};

QuizManager.prototype.isFirstQuestion = function () {
  return this.currentIndex === 0;
};

QuizManager.prototype.getQuizProgress = function () {
  if (!this.currentQuiz || !this.currentQuiz.questions || this.currentQuiz.questions.length === 0) {
    return { current: 0, total: 0, answered: 0, percentage: 0 };
  }

  const total = this.currentQuiz.questions.length;
  const answeredCount = this.userAnswers.filter(answer => answer !== null && answer !== undefined).length;
  const currentQuestionNumberForPercentage = Math.min(this.currentIndex + 1, total);

  return {
    current: this.currentIndex + 1,
    total: total,
    answered: answeredCount,
    percentage: total > 0 ? Math.round((currentQuestionNumberForPercentage / total) * 100) : 0
  };
};

QuizManager.prototype.submitQuiz = function () {
  console.warn("QuizManager.submitQuiz() called. Using finishQuiz() instead for current flow.");
  return this.finishQuiz();
};

QuizManager.prototype.calculateScore = function () {
  if (!this.currentQuiz || !this.currentQuiz.questions || this.currentQuiz.questions.length === 0) {
    return { score: 0, total: 0, percentage: 0 };
  }

  return {
    score: this.score,
    total: this.currentQuiz.questions.length,
    percentage: this.currentQuiz.questions.length > 0 ? Math.round((this.score / this.currentQuiz.questions.length) * 100) : 0
  };
};

window.QuizManager = QuizManager;