// resourceManager.js - v3.0

(function (global) {
  function ResourceManagerClass() {
    this.cache = {
      metadata: null,
      metadataTimestamp: 0,
      quizzes: new Map(),
      maxQuizzes: 50
    };

    const hostname = global.location.hostname;
    this.isDevelopment = hostname === "localhost" || hostname === "127.0.0.1";
    this.isGitHubPages = hostname.includes("github.io");

    this.logger = this.getLogger();
    this.config = this.loadConfiguration();
    this.initializeMappings();

    this.logger.log("ResourceManager v3.0: " + this.getEnvironment());
  }

  ResourceManagerClass.prototype.initializeMappings = function () {
    this.themeKeys = {
      1: "colors",
      2: "numbers",
      3: "gender",
      4: "singular_plural",
      5: "present_tense",
      6: "accents",
      7: "ca_va",
      8: "metro",
      9: "boulangerie",
      10: "cafe"
    };

    this.audioFolders = {
      1: "Colors",
      2: "Numbers",
      3: "Gender",
      4: "Singular_Plural",
      5: "Present_Tense",
      6: "Accents",
      7: "Ca_va",
      8: "Metro",
      9: "Boulangerie",
      10: "Cafe"
    };

    this.audioThemeNames = {
      1: "Colors",
      2: "Numbers",
      3: "Gender",
      4: "Singular_Plural",
      5: "Present_Tense",
      6: "Accents",
      7: "Ca_va",
      8: "Metro",
      9: "Boulangerie",
      10: "Cafe"
    };

    this.audioQuizTypes = { 3: "full_audio", 4: "full_audio", 5: "partial_audio" };
  };

  ResourceManagerClass.prototype.getLogger = function () {
    const isDebug =
      this.isDevelopment ||
      (global.TYF_CONFIG &&
        global.TYF_CONFIG.debug &&
        global.TYF_CONFIG.debug.enabled);

    return {
      debug: isDebug
        ? function () {
          console.log.apply(
            console,
            ["[RM]"].concat(Array.prototype.slice.call(arguments))
          );
        }
        : function () { },
      log: isDebug
        ? function () {
          console.log.apply(
            console,
            ["[RM]"].concat(Array.prototype.slice.call(arguments))
          );
        }
        : function () { },
      warn: function () {
        console.warn.apply(
          console,
          ["[RM]"].concat(Array.prototype.slice.call(arguments))
        );
      },
      error: function () {
        console.error.apply(
          console,
          ["[RM]"].concat(Array.prototype.slice.call(arguments))
        );
      }
    };
  };

  ResourceManagerClass.prototype.loadConfiguration = function () {
    const defaults = {
      // Tous les JSON sont à la racine :
      //   ./metadata.json
      //   ./colors_quiz_1.json
      //   ./numbers_quiz_2.json
      baseDataPath: "./",
      cacheEnabled: !this.isDevelopment,
      maxCacheSize: 50,
      cacheMaxAge: 600000,
      timeouts: {
        metadata: 8000,
        quiz: 6000,
        audio: 15000,
        audioCheck: 3000
      }
    };

    try {
      const userConfig = global.resourceManagerConfig || {};
      const config = Object.assign({}, defaults, userConfig);

      // Harmonisation timeoutConfig / timeouts
      if (userConfig.timeoutConfig && !userConfig.timeouts) {
        config.timeouts = Object.assign(
          {},
          defaults.timeouts,
          userConfig.timeoutConfig
        );
      }
      if (!config.timeouts) {
        config.timeouts = defaults.timeouts;
      }

      Object.keys(config.timeouts).forEach(
        function (key) {
          const timeout = config.timeouts[key];
          if (
            typeof timeout !== "number" ||
            timeout < 1000 ||
            timeout > 60000
          ) {
            (this.logger || console).warn(
              "Invalid timeout " + key + ": " + timeout + ", using default"
            );
            config.timeouts[key] = defaults.timeouts[key] || 8000;
          }
        }.bind(this)
      );

      return config;
    } catch (error) {
      console.error("Config load failed:", error.message);
      return defaults;
    }
  };

  ResourceManagerClass.prototype.accessQuizCache = function (cacheKey) {
    if (this.cache.quizzes.has(cacheKey)) {
      const quiz = this.cache.quizzes.get(cacheKey);
      // LRU : supprimer puis réinsérer pour le mettre en dernier
      this.cache.quizzes.delete(cacheKey);
      this.cache.quizzes.set(cacheKey, quiz);
      return quiz;
    }
    return null;
  };

  ResourceManagerClass.prototype.setQuizCache = function (cacheKey, quiz) {
    // Si cache plein, supprimer le moins récent (premier)
    if (this.cache.quizzes.size >= this.cache.maxQuizzes) {
      const oldestKey = this.cache.quizzes.keys().next().value;
      this.cache.quizzes.delete(oldestKey);
      this.logger.log("LRU: eviction of " + oldestKey);
    }
    this.cache.quizzes.set(cacheKey, quiz);
  };

  ResourceManagerClass.prototype.getEnvironment = function () {
    if (this.isDevelopment) return "development";
    if (this.isGitHubPages) return "github-pages";
    return "production";
  };

  ResourceManagerClass.prototype.clearCache = function (type) {
    const cacheType = type || "all";
    try {
      if (cacheType === "all" || cacheType === "metadata") {
        this.cache.metadata = null;
        this.cache.metadataTimestamp = 0;
      }
      if (cacheType === "all" || cacheType === "quizzes") {
        this.cache.quizzes = new Map();
      }
      this.logger.log("Cache cleared: " + cacheType);
    } catch (error) {
      this.logger.error("Cache clear error:", error.message);
    }
  };

  ResourceManagerClass.prototype.loadMetadata = async function () {
    const now = Date.now();

    if (this.cache.metadata && this.config.cacheEnabled) {
      if (now - this.cache.metadataTimestamp < 5 * 60 * 1000) {
        this.logger.debug("Using cached metadata");
        return this.cache.metadata;
      }
    }

    const metadataPath = this.config.baseDataPath + "metadata.json";

    try {
      const response = await fetch(metadataPath);
      if (!response.ok) {
        throw new Error("HTTP " + response.status + ": " + response.statusText);
      }
      const metadata = await response.json();

      if (!this.validateMetadata(metadata)) {
        throw new Error("Invalid metadata structure");
      }

      this.cache.metadata = metadata;
      this.cache.metadataTimestamp = now;

      const themeCount = (metadata.themes && metadata.themes.length) || 0;
      this.logger.log("Metadata loaded: " + themeCount + " themes");
      return metadata;
    } catch (error) {
      this.logger.error("Metadata load failed:", error.message);

      // Fallback: utiliser cache même expiré
      if (this.cache.metadata) {
        this.logger.warn("Using expired cached metadata as fallback");
        return this.cache.metadata;
      }

      // Fallback minimal
      const fallbackMetadata = {
        themes: [{ id: 1, name: "I Speak Colors", icon: "*", quizzes: [] }]
      };
      this.logger.warn("Using fallback metadata structure");
      return fallbackMetadata;
    }
  };

  ResourceManagerClass.prototype.validateMetadata = function (metadata) {
    if (!metadata || !Array.isArray(metadata.themes)) return false;

    return metadata.themes.every(function (theme) {
      if (!theme || typeof theme.id === "undefined") return false;
      if (typeof theme.name !== "string") return false;
      if (typeof theme.icon !== "string") return false;
      if (!Array.isArray(theme.quizzes)) return false;

      return theme.quizzes.every(function (q) {
        return (
          q &&
          typeof q.id !== "undefined" &&
          typeof q.name === "string"
        );
      });
    });
  };

  ResourceManagerClass.prototype.getQuiz = async function (themeId, quizId) {
    const cacheKey = "quiz_" + themeId + "_" + quizId;

    if (this.config.cacheEnabled) {
      const cachedQuiz = this.accessQuizCache(cacheKey);
      if (cachedQuiz) {
        return cachedQuiz;
      }
    }

    const themeKey = this.themeKeys[themeId];
    if (!themeKey) {
      throw new Error("Invalid theme " + themeId);
    }

    // IMPORTANT : les fichiers sont à la racine :
    //   ./colors_quiz_1.json
    //   ./numbers_quiz_2.json
    const filename = themeKey + "_quiz_" + quizId + ".json";
    const quizPath = this.config.baseDataPath + filename;

    try {
      const response = await fetch(quizPath);
      if (!response.ok) {
        throw new Error(
          "Quiz " + quizId + " not found (HTTP " + response.status + ")"
        );
      }

      const quizData = await response.json();
      await this.enrichQuizData(quizData, themeId, quizId);

      if (!this.validateQuiz(quizData)) {
        throw new Error("Invalid quiz structure");
      }

      this.enrichQuizWithAudio(quizData, themeId, quizId);
      this.setQuizCache(cacheKey, quizData);

      return quizData;
    } catch (error) {
      this.logger.error(
        "Quiz load failed (theme " +
        themeId +
        ", quiz " +
        quizId +
        "):",
        error.message
      );

      // Fallback: chercher dans le cache
      const cachedQuiz = this.accessQuizCache(cacheKey);
      if (cachedQuiz) {
        this.logger.warn("Using cached quiz as fallback");
        return cachedQuiz;
      }

      throw new Error("Unable to load quiz " + quizId + ": " + error.message);
    }
  };

  ResourceManagerClass.prototype.enrichQuizData = async function (
    quizData,
    themeId,
    quizId
  ) {
    if (!quizData || typeof quizData !== "object") return;

    if (typeof quizData.id === "undefined") {
      quizData.id = quizId;
    }

    if (typeof quizData.name === "undefined") {
      const metadata = await this.loadMetadata();
      const theme =
        metadata.themes &&
        metadata.themes.find(function (t) {
          return t.id === themeId;
        });
      const quizMeta =
        theme &&
        theme.quizzes &&
        theme.quizzes.find(function (q) {
          return q.id === quizId;
        });
      quizData.name = (quizMeta && quizMeta.name) || "Quiz " + quizId;
    }
  };

  ResourceManagerClass.prototype.validateQuiz = function (quizData) {
    if (!quizData || !Array.isArray(quizData.questions)) return false;

    return quizData.questions.every(function (q) {
      const hasText =
        typeof q.question === "string" || typeof q.text === "string";
      const hasOptions = Array.isArray(q.options);
      const hasCorrect = typeof q.correctAnswer === "string";
      return hasText && hasOptions && hasCorrect;
    });
  };

  ResourceManagerClass.prototype.enrichQuizWithAudio = function (
    quizData,
    themeId,
    quizId
  ) {
    if (!quizData || !Array.isArray(quizData.questions)) return;

    const quizNumber = this.getQuizNumber(quizId);
    const themeName = this.audioThemeNames[themeId];
    const audioType = this.audioQuizTypes[quizNumber];

    if (!audioType || !themeName) return;

    quizData.questions.forEach(function (q, index) {
      q.audio =
        "TYF_" + themeName + "_" + quizNumber + "_" + (index + 1) + ".mp3";
    });
  };

  ResourceManagerClass.prototype.getQuizNumber = function (quizId) {
    const idString = String(quizId);
    const lastDigit = parseInt(idString.slice(-1), 10);
    if (!Number.isFinite(lastDigit)) return null;
    return lastDigit >= 1 && lastDigit <= 5 ? lastDigit : null;
  };

  ResourceManagerClass.prototype.getAudioPath = function (
    themeId,
    audioFilename
  ) {
    if (!themeId || !audioFilename) return null;
    const folder = this.audioFolders[themeId];
    if (!folder) return null;
    return "./audio/" + folder + "/" + audioFilename;
  };

  // Export global
  global.ResourceManager = ResourceManagerClass;
})(window);
