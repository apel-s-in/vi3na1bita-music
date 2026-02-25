/**
 * scripts/analytics/achievements-dict.js
 * Ядро Rule Engine: Декларативный словарь достижений.
 * Здесь нет логики, только правила, UI-метаданные и награды (XP).
 */

export const AchievementDictionary = {
  // ==========================================
  // 1. МНОГОУРОВНЕВЫЕ (Scalable)
  // ==========================================
  "play_total": {
    id: "play_total", type: "scalable", category: "listening",
    ui: { name: "В потоке ур. {level}", desc: "Соберите {target} валидных прослушиваний", icon: "🎧", color: "#4daaff" },
    reward: { xpBase: 10, xpMultiplier: 1.5, tierBase: 1 },
    trigger: { conditions: [{ metric: "validPlays", operator: "gte" }] },
    scaling: { math: "custom", steps: [1, 25, 100, 500, 1000, 5000] }
  },
  "full_total": {
    id: "full_total", type: "scalable", category: "listening",
    ui: { name: "Верное ухо ур. {level}", desc: "{target} полных прослушиваний", icon: "🏆", color: "#ff9800" },
    reward: { xpBase: 15, xpMultiplier: 1.8, tierBase: 2 },
    trigger: { conditions: [{ metric: "fullPlays", operator: "gte" }] },
    scaling: { math: "custom", steps: [1, 10, 50, 100, 500, 1000] }
  },
  "time_total": {
    id: "time_total", type: "scalable", category: "time",
    ui: { name: "Хранитель времени ур. {level}", desc: "Накопите {target_hours} ч. прослушивания", icon: "⏳", color: "#ffb74d" },
    reward: { xpBase: 25, xpMultiplier: 2.0, tierBase: 2 },
    trigger: { conditions: [{ metric: "totalSec", operator: "gte" }] },
    scaling: { math: "custom", steps: [3600, 18000, 36000, 86400, 360000] }, // 1h, 5h, 10h, 24h, 100h
    formatters: { target_hours: val => Math.floor(val / 3600) }
  },
  "streak_base": {
    id: "streak_base", type: "scalable", category: "loyalty",
    ui: { name: "Преданность ур. {level}", desc: "Слушайте музыку {target} дней подряд", icon: "⚡", color: "#ff9800" },
    reward: { xpBase: 30, xpMultiplier: 1.8, tierBase: 1 },
    trigger: { conditions: [{ metric: "streak", operator: "gte" }] },
    scaling: { math: "custom", steps: [3, 7, 14, 30, 100, 365] }
  },
  "unique_tracks": {
    id: "unique_tracks", type: "scalable", category: "collection",
    ui: { name: "Коллекционер ур. {level}", desc: "Послушайте {target} разных треков", icon: "💿", color: "#9c27b0" },
    reward: { xpBase: 20, xpMultiplier: 1.5, tierBase: 1 },
    trigger: { conditions: [{ metric: "uniqueTracks", operator: "gte" }] },
    scaling: { math: "custom", steps: [5, 10, 16, 50, 100] }
  },
  "fav_total": {
    id: "fav_total", type: "scalable", category: "collection",
    ui: { name: "Мой плейлист ур. {level}", desc: "Добавьте {target} треков в избранное", icon: "⭐", color: "#fdd835" },
    reward: { xpBase: 10, xpMultiplier: 1.4, tierBase: 1 },
    trigger: { conditions: [{ metric: "favCount", operator: "gte" }] },
    scaling: { math: "custom", steps: [3, 5, 8, 15, 50] }
  },
  "one_track_full": {
    id: "one_track_full", type: "scalable", category: "listening",
    ui: { name: "Абсолютный фаворит ур. {level}", desc: "Один трек {target} раз полностью", icon: "❤️", color: "#e91e63" },
    reward: { xpBase: 50, xpMultiplier: 2.0, tierBase: 3 },
    trigger: { conditions: [{ metric: "maxOneTrackFull", operator: "gte" }] },
    scaling: { math: "custom", steps: [25, 100, 500] }
  },
  "sleep_timer": {
    id: "sleep_timer", type: "scalable", category: "features",
    ui: { name: "Бережный сон ур. {level}", desc: "Таймер сна сработал {target} раз", icon: "😴", color: "#607d8b" },
    reward: { xpBase: 20, xpMultiplier: 1.5, tierBase: 1 },
    trigger: { conditions: [{ metric: "sleepTimerTriggers", operator: "gte" }] },
    scaling: { math: "custom", steps: [5, 10, 50] }
  },
  "backup_saves": {
    id: "backup_saves", type: "scalable", category: "features",
    ui: { name: "Запасливый ур. {level}", desc: "Сохраните бэкап {target} раз", icon: "💽", color: "#00bcd4" },
    reward: { xpBase: 20, xpMultiplier: 1.5, tierBase: 1 },
    trigger: { conditions: [{ metric: "backups", operator: "gte" }] },
    scaling: { math: "custom", steps: [1, 3, 10] }
  },

  // ==========================================
  // 2. СТАТИЧНЫЕ И ПОВЕДЕНЧЕСКИЕ (Static)
  // ==========================================
  "quality_snob": {
    id: "quality_snob", type: "static", category: "features",
    ui: { name: "Аудиофил", desc: "10 прослушиваний в высоком качестве (Hi)", icon: "💎", color: "#4fc3f7" },
    reward: { xp: 100, tier: 2 },
    trigger: { conditions: [{ metric: "hiPlays", operator: "gte", target: 10 }] }
  },
  "early_bird": {
    id: "early_bird", type: "static", category: "time",
    ui: { name: "Ранняя пташка", desc: "Слушайте треки в окне 05:00–08:00 (10 раз)", icon: "🌅", color: "#ffd54f" },
    reward: { xp: 150, tier: 2 },
    trigger: { conditions: [{ metric: "earlyPlays", operator: "gte", target: 10 }] }
  },
  "night_owl": {
    id: "night_owl", type: "static", category: "time",
    ui: { name: "Ночной слушатель", desc: "Слушайте треки ночью 00:00–05:00 (10 раз)", icon: "🦉", color: "#b388ff" },
    reward: { xp: 150, tier: 2 },
    trigger: { conditions: [{ metric: "nightPlays", operator: "gte", target: 10 }] }
  },
  "weekend_warrior": {
    id: "weekend_warrior", type: "static", category: "time",
    ui: { name: "Выходные с музыкой", desc: "Слушайте музыку в выходные дни (10 раз)", icon: "🎉", color: "#ff5252" },
    reward: { xp: 100, tier: 3 },
    trigger: { conditions: [{ metric: "weekendPlays", operator: "gte", target: 10 }] }
  },
  "pwa_installed": {
    id: "pwa_installed", type: "static", category: "features",
    ui: { name: "На моём устройстве", desc: "Установите приложение как PWA", icon: "📱", color: "#4caf50" },
    reward: { xp: 200, tier: 4 },
    trigger: { conditions: [{ metric: "pwaInstalled", operator: "gte", target: 1 }] }
  },
  "socials_all_visited": {
    id: "socials_all_visited", type: "static", category: "features",
    ui: { name: "Подписчик всего", desc: "Кликните по социальным сетям", icon: "🌐", color: "#03a9f4" },
    reward: { xp: 50, tier: 1 },
    trigger: { conditions: [{ metric: "socialVisits", operator: "gte", target: 1 }] }
  },
  "feature_lyrics": {
    id: "feature_lyrics", type: "static", category: "features",
    ui: { name: "Караоке мастер", desc: "Используйте функцию текста песни", icon: "🎤", color: "#4db6ac" },
    reward: { xp: 50, tier: 1 },
    trigger: { conditions: [{ metric: "featLyrics", operator: "gte", target: 1 }] }
  },

  // ==========================================
  // 3. СЕКРЕТНЫЕ (Secrets)
  // ==========================================
  "exact_time_11_11": {
    id: "exact_time_11_11", type: "static", category: "secret", hidden: true,
    ui: { name: "11:11", desc: "Секретная отсылка. Вы запустили трек в 11:11.", icon: "👁️", color: "#e80100" },
    reward: { xp: 300, tier: 6 },
    trigger: { conditions: [{ metric: "play11_11", operator: "gte", target: 1 }] }
  }
};
