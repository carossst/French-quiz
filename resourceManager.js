// resourceManager.js - v3.0

(function (global) {
  function ResourceManagerClass() {
    const hostname = global.location.hostname;
    this.isDevelopment = hostname === "localhost" || hostname === "127.0.0.1";
    this.isGitHubPages = hostname.includes("github.io");

    this.logger = this.getLogger();
    this.config = this.loadConfiguration();

    this.cache = {
      metadata: null,
      metadataTimestamp: 0,
      quizzes: new Map(),
      maxQuizzes: 50
    };

    // maintenant this.config existe
    const m = Number(this.config && this.config.maxCacheSize);
    this.cache.maxQuizzes = Number.isFinite(m) ? m : this.cache.maxQuizzes;


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

      // Toujours merger les timeouts avec les defaults (évite l’écrasement partiel)
      const mergedTimeouts = Object.assign(
        {},
        defaults.timeouts,
        userConfig.timeouts || {},
        (!userConfig.timeouts && userConfig.timeoutConfig) ? userConfig.timeoutConfig : {}
      );
      config.timeouts = mergedTimeouts;


      // logger safe (au cas où l'ordre d'init change un jour)
      const warn = (this.logger && typeof this.logger.warn === "function")
        ? this.logger.warn.bind(this.logger)
        : console.warn.bind(console);

      Object.keys(config.timeouts).forEach(function (key) {
        const timeout = config.timeouts[key];
        if (typeof timeout !== "number" || timeout < 1000 || timeout > 60000) {
          warn("Invalid timeout " + key + ": " + timeout + ", using default");
          config.timeouts[key] = defaults.timeouts[key] || 8000;
        }
      });

      return config;
    } catch (error) {
      const msg = (error && error.message) ? error.message : String(error);
      console.error("Config load failed:", msg);
      return defaults;
    }

  };

  ResourceManagerClass.prototype.fetchWithTimeout = function (url, timeoutMs) {
    const ms = Number(timeoutMs) || 8000;

    if (typeof AbortController === "undefined") {
      return fetch(url);
    }

    const controller = new AbortController();
    const timer = setTimeout(function () {
      try { controller.abort(); } catch (e) { }
    }, ms);

    try {
      return fetch(url, { signal: controller.signal })
        .finally(function () { clearTimeout(timer); });
    } catch (err) {
      clearTimeout(timer);
      throw err;
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
    const max = Number(this.cache && this.cache.maxQuizzes);

    if (!Number.isFinite(max) || max <= 0) return;

    if (this.cache.quizzes.size >= max) {
      const oldestKey = this.cache.quizzes.keys().next().value;
      if (typeof oldestKey !== "undefined") {
        this.cache.quizzes.delete(oldestKey);
        this.logger.log("LRU: eviction of " + oldestKey);
      }
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

    const cfg = this.config || {};
    const maxAge = Number.isFinite(Number(cfg.cacheMaxAge)) ? Number(cfg.cacheMaxAge) : 5 * 60 * 1000;

    if (this.cache.metadata && cfg.cacheEnabled === true) {
      if (now - this.cache.metadataTimestamp < maxAge) {
        this.logger.debug("Using cached metadata");
        return this.cache.metadata;
      }
    }



    const basePath = (this.config && this.config.baseDataPath) ? this.config.baseDataPath : "./";
    const metadataPath = basePath + "metadata.json";


    try {
      const metadataTimeout =
        (this.config && this.config.timeouts && Number(this.config.timeouts.metadata)) || 8000;

      const response = await this.fetchWithTimeout(metadataPath, metadataTimeout);

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
      const msg = (error && error.name === "AbortError")
        ? "Timeout while loading metadata"
        : (error && error.message) ? error.message : String(error);

      this.logger.error("Metadata load failed:", msg);


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

    const cfg = this.config || {};
    if (cfg.cacheEnabled === true) {
      const cachedQuiz = this.accessQuizCache(cacheKey);
      if (cachedQuiz && typeof cachedQuiz === "object") return cachedQuiz;
    }

    if (!this.themeKeys) this.initializeMappings();

    const themeKey = this.themeKeys[themeId];
    if (!themeKey) throw new Error("Invalid theme " + themeId);

    const quizNumber = this.getQuizNumber(quizId);
    if (!quizNumber) {
      throw new Error("Invalid quiz id " + quizId + " (cannot derive quiz number)");
    }

    const filenamePrimary = themeKey + "_quiz_" + quizId + ".json";     // Ex: colors_quiz_101.json
    const filenameFallback = themeKey + "_quiz_" + quizNumber + ".json"; // Ex: colors_quiz_1.json (fallback legacy)
    const basePath = (this.config && this.config.baseDataPath) ? this.config.baseDataPath : "./";
    const quizPathPrimary = basePath + filenamePrimary;
    const quizPathFallback = basePath + filenameFallback;


    try {
      const quizTimeout =
        (this.config && this.config.timeouts && Number(this.config.timeouts.quiz)) || 6000;

      let response = await this.fetchWithTimeout(quizPathPrimary, quizTimeout);
      if (!response.ok) response = await this.fetchWithTimeout(quizPathFallback, quizTimeout);

      if (!response.ok) {
        throw new Error("Quiz " + quizId + " not found (HTTP " + response.status + ")");
      }

      const quizData = await response.json();

      await this.enrichQuizData(quizData, themeId, quizId);

      if (!this.validateQuiz(quizData)) throw new Error("Invalid quiz structure");

      this.enrichQuizWithAudio(quizData, themeId, quizId);
      this.setQuizCache(cacheKey, quizData);
      return quizData;
    } catch (error) {
      const msg = (error && error.name === "AbortError")
        ? "Timeout while loading quiz"
        : (error && error.message) ? error.message : String(error);

      this.logger.error(
        "Quiz load failed (theme " + themeId + ", quiz " + quizId + "):",
        msg
      );


      const cachedQuiz = this.accessQuizCache(cacheKey);
      if (cachedQuiz) {
        this.logger.warn("Using cached quiz as fallback");
        return cachedQuiz;
      }

      throw new Error("Unable to load quiz " + quizId + ": " + msg);

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
      const themes = metadata && Array.isArray(metadata.themes) ? metadata.themes : [];
      const theme = themes.find(function (t) {
        return Number(t && t.id) === Number(themeId);
      });


      const quizNumber = this.getQuizNumber(quizId);

      const quizIdNum = Number(quizId);

      const quizzes = (theme && Array.isArray(theme.quizzes)) ? theme.quizzes : [];

      const quizMeta =
        quizzes.find(function (q) { return Number(q && q.id) === quizIdNum; }) ||
        (quizNumber
          ? quizzes.find(function (q) { return Number(q && q.id) === Number(quizNumber); })
          : null);



      quizData.name = (quizMeta && quizMeta.name) || "Quiz " + quizId;
    }

  };

  ResourceManagerClass.prototype.validateQuiz = function (quizData) {
    if (!quizData || !Array.isArray(quizData.questions)) return false;

    return quizData.questions.every(function (q) {
      const hasText =
        typeof q.question === "string" || typeof q.text === "string";
      const hasOptions = Array.isArray(q.options);
      const hasCorrect =
        typeof q.correctAnswer === "string" ||
        typeof q.correctIndex === "number";

      if (!(hasText && hasOptions && hasCorrect)) return false;

      if (typeof q.correctIndex === "number") {
        if (!(q.correctIndex >= 0 && q.correctIndex < q.options.length)) return false;
      }

      return true;


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
    if (!themeName || !audioType) return;


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

  // Theme helper (sync). Uses cached metadata set by loadMetadata().
  ResourceManagerClass.prototype.getThemeById = function (themeId) {
    if (themeId === null || typeof themeId === "undefined") return null;

    const idNum = Number(themeId);
    if (!Number.isFinite(idNum)) return null;

    const metadata = this.cache && this.cache.metadata;
    if (metadata && Array.isArray(metadata.themes)) {
      for (var i = 0; i < metadata.themes.length; i++) {
        var t = metadata.themes[i];
        if (t && Number(t.id) === idNum) return t;
      }
    }

    return {
      id: idNum,
      name: this.audioThemeNames[idNum] || "Theme " + idNum,
      icon: "*",
      quizzes: []
    };
  };



  // Optional async variant for future use (renamed for clarity)
  ResourceManagerClass.prototype.getThemeByIdAsync = async function (themeId) {
    if (themeId === null || typeof themeId === "undefined") return null;

    const metadata = await this.loadMetadata();
    if (!metadata || !Array.isArray(metadata.themes)) return null;

    const idNum = Number(themeId);
    for (var i = 0; i < metadata.themes.length; i++) {
      var t = metadata.themes[i];
      if (!t) continue;
      if (Number(t.id) === idNum) return t;
    }
    return null;
  };


  // Export global
  global.ResourceManager = ResourceManagerClass;
})(window);

