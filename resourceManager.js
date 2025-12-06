// resourceManager.js - v3.0

window.ResourceManager = (function () {
  function ResourceManagerClass() {
    this.cache = {
      metadata: null,
      metadataTimestamp: 0,
      quizzes: new Map(),
      maxQuizzes: 50
    };
    const hostname = window.location.hostname;
    this.isDevelopment = hostname === 'localhost' || hostname === '127.0.0.1';
    this.isGitHubPages = hostname.includes('github.io');

    this.logger = this.getLogger();
    this.config = this.loadConfiguration();
    this.initializeMappings();

    this.logger.log(`ResourceManager v3.0 simplified: ${this.getEnvironment()}`);
  }

  ResourceManagerClass.prototype.initializeMappings = function () {
    this.themeKeys = {
      1: "colors", 2: "numbers", 3: "gender", 4: "singular_plural", 5: "present_tense",
      6: "accents", 7: "ca_va", 8: "metro", 9: "boulangerie", 10: "cafe"
    };

    this.audioFolders = {
      1: "Colors", 2: "Numbers", 3: "Gender", 4: "Singular_Plural", 5: "Present_Tense",
      6: "Accents", 7: "Ca_va", 8: "Metro", 9: "Boulangerie", 10: "Cafe"
    };

    this.audioThemeNames = {
      1: "Colors", 2: "Numbers", 3: "Gender", 4: "Singular_Plural", 5: "Present_Tense",
      6: "Accents", 7: "Ca_va", 8: "Metro", 9: "Boulangerie", 10: "Cafe"
    };

    this.audioQuizTypes = { 3: "full_audio", 4: "full_audio", 5: "partial_audio" };
  };

  ResourceManagerClass.prototype.getLogger = function () {
    const isDebug = this.isDevelopment || window.TYF_CONFIG?.debug?.enabled;
    return {
      debug: isDebug ? (...args) => console.log('[RM]', ...args) : () => { },
      log: isDebug ? (...args) => console.log('[RM]', ...args) : () => { },
      warn: (...args) => console.warn('[RM]', ...args),
      error: (...args) => console.error('[RM]', ...args)
    };
  };

  ResourceManagerClass.prototype.loadConfiguration = function () {
    const defaults = {
      baseDataPath: './js/data/',
      cacheEnabled: !this.isDevelopment,
      maxCacheSize: 50,
      cacheMaxAge: 600000,
      timeouts: { metadata: 8000, quiz: 6000 }
    };

    try {
      const userConfig = window.resourceManagerConfig || {};
      const config = Object.assign({}, defaults, userConfig);

      Object.keys(config.timeouts).forEach(key => {
        const timeout = config.timeouts[key];
        if (typeof timeout !== 'number' || timeout < 1000 || timeout > 60000) {
          (this.logger || console).warn(`Invalid timeout ${key}: ${timeout}, using default`);
          config.timeouts[key] = defaults.timeouts[key] || 8000;
        }
      });

      return config;
    } catch (error) {
      console.error('Config load failed:', error.message);
      return defaults;
    }
  };

  ResourceManagerClass.prototype.accessQuizCache = function (cacheKey) {
    if (this.cache.quizzes.has(cacheKey)) {
      const quiz = this.cache.quizzes.get(cacheKey);
      // LRU : Supprimer + RÃ©insÃ©rer = bouge en fin
      this.cache.quizzes.delete(cacheKey);
      this.cache.quizzes.set(cacheKey, quiz);
      return quiz;
    }
    return null;
  };

  ResourceManagerClass.prototype.setQuizCache = function (cacheKey, quiz) {
    // Si cache plein, supprimer le moins rÃ©cent (premier)
    if (this.cache.quizzes.size >= this.cache.maxQuizzes) {
      const oldestKey = this.cache.quizzes.keys().next().value;
      this.cache.quizzes.delete(oldestKey);
      this.logger.log(`LRU: Ã‰viction de ${oldestKey}`);
    }
    this.cache.quizzes.set(cacheKey, quiz);
  };

  ResourceManagerClass.prototype.getEnvironment = function () {
    return this.isDevelopment ? 'development' : this.isGitHubPages ? 'github-pages' : 'production';
  };

  ResourceManagerClass.prototype.clearCache = function (type = 'all') {
    try {
      if (type === 'all' || type === 'metadata') {
        this.cache.metadata = null;
        this.cache.metadataTimestamp = 0;
      }
      if (type === 'all' || type === 'quizzes') {
        this.cache.quizzes = new Map();

      }
      this.logger.log(`Cache cleared: ${type}`);
    } catch (error) {
      this.logger.error('Cache clear error:', error.message);
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

    const metadataPath = `${this.config.baseDataPath}metadata.json`;

    try {
      const response = await fetch(metadataPath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const metadata = await response.json();

      if (!this.validateMetadata(metadata)) {
        throw new Error('Invalid metadata structure');
      }

      this.cache.metadata = metadata;
      this.cache.metadataTimestamp = now;

      this.logger.log(`Metadata loaded: ${metadata.themes?.length || 0} themes`);
      return metadata;

    } catch (error) {
      this.logger.error('Metadata load failed:', error.message);

      // Fallback: utiliser cache mÃªme expirÃ©
      if (this.cache.metadata) {
        this.logger.warn("Using expired cached metadata as fallback");
        return this.cache.metadata;
      }

      // Fallback ultime: structure minimale
      const fallbackMetadata = {
        themes: [
          { id: 1, name: "I Speak Colors", icon: "â—ˆ", quizzes: [] }
        ]
      };
      this.logger.warn("Using fallback metadata structure");
      return fallbackMetadata;
    }
  };

  ResourceManagerClass.prototype.validateMetadata = function (metadata) {
    return metadata?.themes?.every(theme =>
      theme?.id !== undefined &&
      typeof theme.name === 'string' &&
      typeof theme.icon === 'string' &&
      Array.isArray(theme.quizzes) &&
      theme.quizzes.every(q => q?.id !== undefined && typeof q.name === 'string')
    );
  };

  ResourceManagerClass.prototype.getQuiz = async function (themeId, quizId) {
    const cacheKey = `quiz_${themeId}_${quizId}`;

    if (this.config.cacheEnabled) {
      const cachedQuiz = this.accessQuizCache(cacheKey);
      if (cachedQuiz) {
        return cachedQuiz;
      }
    }

    const themeKey = this.themeKeys[themeId];
    if (!themeKey) throw new Error(`Invalid theme ${themeId}`);

    const filename = `${themeKey}_quiz_${quizId}.json`;
    const quizPath = `${this.config.baseDataPath}themes/theme-${themeId}/${filename}`;

    try {
      const response = await fetch(quizPath);
      if (!response.ok) {
        throw new Error(`Quiz ${quizId} not found (HTTP ${response.status})`);
      }

      const quizData = await response.json();
      await this.enrichQuizData(quizData, themeId, quizId);

      if (!this.validateQuiz(quizData)) {
        throw new Error('Invalid quiz structure');
      }

      this.enrichQuizWithAudio(quizData, themeId, quizId);
      this.setQuizCache(cacheKey, quizData);

      return quizData;

    } catch (error) {
      this.logger.error(`Quiz load failed (theme ${themeId}, quiz ${quizId}):`, error.message);

      // Fallback: chercher dans le cache mÃªme expirÃ©
      const cachedQuiz = this.accessQuizCache(cacheKey);
      if (cachedQuiz) {
        this.logger.warn("Using cached quiz as fallback");
        return cachedQuiz;
      }

      // Re-throw l'erreur si pas de fallback possible
      throw new Error(`Unable to load quiz ${quizId}: ${error.message}`);
    }
  };

  ResourceManagerClass.prototype.enrichQuizData = async function (quizData, themeId, quizId) {
    if (quizData.id === undefined) quizData.id = quizId;

    if (quizData.name === undefined) {
      const metadata = await this.loadMetadata();
      const theme = metadata.themes.find(t => t.id === themeId);
      const quizMeta = theme?.quizzes?.find(q => q.id === quizId);
      quizData.name = quizMeta?.name || `Quiz ${quizId}`;
    }
  };

  ResourceManagerClass.prototype.validateQuiz = function (quizData) {
    return quizData?.questions?.every(q =>
      (typeof q.question === 'string' || typeof q.text === 'string') &&
      Array.isArray(q.options) &&
      typeof q.correctAnswer === 'string'
    );
  };

  ResourceManagerClass.prototype.enrichQuizWithAudio = function (quizData, themeId, quizId) {
    const quizNumber = this.getQuizNumber(quizId);
    const themeName = this.audioThemeNames[themeId];
    const audioType = this.audioQuizTypes[quizNumber];

    if (!audioType || !themeName) return;

    quizData.questions.forEach((q, i) => {
      q.audio = `TYF_${themeName}_${quizNumber}_${i + 1}.mp3`;
    });
  };

  ResourceManagerClass.prototype.getQuizNumber = function (quizId) {
    const lastDigit = parseInt(String(quizId).slice(-1));
    return (lastDigit >= 1 && lastDigit <= 5) ? lastDigit : null;
  };

  ResourceManagerClass.prototype.getAudioPath = function (themeId, audioFilename) {
    if (!themeId || !audioFilename) return null;
    const folder = this.audioFolders[themeId];
    return folder ? `./audio/${folder}/${audioFilename}` : null;
  }

  return ResourceManagerClass;
})();

window.ResourceManager = window.ResourceManager || ResourceManager;