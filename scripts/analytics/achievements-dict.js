/**
 * scripts/analytics/achievements-dict.js
 * Ядро Rule Engine: Декларативный словарь достижений.
 * Здесь нет логики, только правила, UI-метаданные и награды (XP).
 */

export const AchievementDictionary = {
  // ==========================================
  // 1. РАЗОВЫЕ ДОСТИЖЕНИЯ (Static)
  // ==========================================
  "first_blood": {
    id: "first_blood",
    type: "static",
    category: "playback", // Категория для вкладок UI
    ui: {
      name: "Первая кровь",
      desc: "Прослушан 1 трек полностью",
      icon: "🔥",
      color: "#ff5252" // Для красивой подсветки в новом UI
    },
    reward: { xp: 50, tier: 1 },
    trigger: {
      // Имя метрики из агрегатора (соответствует ключам в твоем agg)
      conditions: [{ metric: "totalFull", operator: "gte", target: 1 }]
    }
  },

  "night_owl": {
    id: "night_owl",
    type: "static",
    category: "time",
    ui: {
      name: "Ночная сова",
      desc: "10 треков прослушано с 00:00 до 05:00",
      icon: "🦉",
      color: "#b388ff"
    },
    reward: { xp: 150, tier: 2 },
    trigger: {
      conditions: [{ metric: "nightPlays", operator: "gte", target: 10 }]
    }
  },

  "early_bird": {
    id: "early_bird",
    type: "static",
    category: "time",
    ui: {
      name: "Ранняя пташка",
      desc: "10 треков прослушано с 05:00 до 08:00",
      icon: "🌅",
      color: "#ffd54f"
    },
    reward: { xp: 150, tier: 2 },
    trigger: {
      conditions: [{ metric: "earlyPlays", operator: "gte", target: 10 }]
    }
  },

  "quality_snob": {
    id: "quality_snob",
    type: "static",
    category: "features",
    ui: {
      name: "Аудиофил",
      desc: "10 прослушиваний в высоком качестве (Hi)",
      icon: "💎",
      color: "#4fc3f7"
    },
    reward: { xp: 100, tier: 2 },
    trigger: {
      conditions: [{ metric: "hiPlays", operator: "gte", target: 10 }]
    }
  },

  "feature_lyrics": {
    id: "feature_lyrics",
    type: "static",
    category: "features",
    ui: {
      name: "Караоке мастер",
      desc: "Вы использовали функцию лирики",
      icon: "📝",
      color: "#4db6ac"
    },
    reward: { xp: 50, tier: 1 },
    trigger: {
      conditions: [{ metric: "featLyrics", operator: "gte", target: 1 }]
    }
  },

  // ==========================================
  // 2. МНОГОУРОВНЕВЫЕ ДОСТИЖЕНИЯ (Scalable)
  // ==========================================
  // Движок сам будет генерировать уровни (Меломан -> Фанат -> Легенда и т.д.)
  "listener_base": {
    id: "listener_base",
    type: "scalable",
    category: "playback",
    ui: {
      name: "Меломан ур. {level}", // {level} подставится динамически
      desc: "{target} полных прослушиваний", // {target} подставится динамически
      icon: "🎧",
      color: "#4caf50"
    },
    reward: { xpBase: 100, xpMultiplier: 1.5, tierBase: 1 },
    trigger: {
      conditions: [{ metric: "totalFull", operator: "gte", startTarget: 50 }]
    },
    scaling: {
      math: "multiply", // Как растет цель
      factor: 5,        // 50 -> 250 -> 1250 -> 6250...
      maxLevel: 10      // Ограничение бесконечности (опционально)
    }
  },

  "time_base": {
    id: "time_base",
    type: "scalable",
    category: "time",
    ui: {
      name: "Хранитель времени ур. {level}",
      desc: "{target_hours} часов в приложении", 
      icon: "⏳",
      color: "#ffb74d"
    },
    reward: { xpBase: 200, xpMultiplier: 2.0, tierBase: 2 },
    trigger: {
      conditions: [{ metric: "totalSec", operator: "gte", startTarget: 36000 }] // 10 часов в секундах
    },
    scaling: {
      math: "multiply", 
      factor: 10,       // 10 часов -> 100 часов -> 1000 часов
      maxLevel: 5
    },
    formatters: {
      // Специальный форматтер, чтобы в UI выводить часы, а под капотом считать секунды
      target_hours: (val) => Math.floor(val / 3600)
    }
  },

  "streak_base": {
    id: "streak_base",
    type: "scalable",
    category: "loyalty",
    ui: {
      name: "Преданность ур. {level}",
      desc: "Слушайте музыку {target} дней подряд",
      icon: "⚡",
      color: "#ff9800"
    },
    reward: { xpBase: 50, xpMultiplier: 1.8, tierBase: 1 },
    trigger: {
      conditions: [{ metric: "streak", operator: "gte", startTarget: 3 }]
    },
    scaling: {
      math: "custom", // Кастомная прогрессия
      steps: [3, 7, 14, 30, 100, 365] // Заранее заданные шаги для стриков
    }
  }
};
