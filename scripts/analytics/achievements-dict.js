/**
 * scripts/analytics/achievements-dict.js
 * ПОЛНЫЙ СЛОВАРЬ: Базовые (масштабируемые) + Комбо (старые) + Секреты
 */

export const AchievementDictionary = {
  // ==========================================
  // 1. МНОГОУРОВНЕВЫЕ (Бесконечная сложность)
  // ==========================================
  "play_total": {
    id: "play_total", type: "scalable", category: "listening",
    ui: { name: "В потоке ур. {level}", short: "Соберите {target} валидных прослушиваний.", desc: "Любые треки — главное валидное время.", howTo: "Слушайте регулярно, используйте Shuffle. Засчитывается ≥13 сек.", icon: "🎧", color: "#4daaff" },
    reward: { xpBase: 10, xpMultiplier: 1.5, tierBase: 1 },
    trigger: { conditions: [{ metric: "validPlays", operator: "gte" }] },
    scaling: { math: "custom", steps: [1, 25, 100, 500, 1000, 5000] }
  },
  "full_total": {
    id: "full_total", type: "scalable", category: "listening",
    ui: { name: "Верное ухо ур. {level}", short: "{target} полных прослушиваний.", desc: "Полное прослушивание — до конца или ≥90%.", howTo: "Сохраняйте концентрацию и дослушивайте треки.", icon: "🏆", color: "#ff9800" },
    reward: { xpBase: 15, xpMultiplier: 1.8, tierBase: 2 },
    trigger: { conditions: [{ metric: "fullPlays", operator: "gte" }] },
    scaling: { math: "custom", steps: [1, 10, 50, 100, 500, 1000] }
  },
  "time_total": {
    id: "time_total", type: "scalable", category: "time",
    ui: { name: "Хранитель времени ур. {level}", short: "Накопите {target_hours} ч. прослушивания.", desc: "Суммарное валидное время.", howTo: "Слушайте музыку, время учитывается автоматически.", icon: "⏳", color: "#ffb74d" },
    reward: { xpBase: 25, xpMultiplier: 2.0, tierBase: 2 },
    trigger: { conditions: [{ metric: "totalSec", operator: "gte" }] },
    scaling: { math: "custom", steps: [3600, 18000, 36000, 86400, 360000] },
    formatters: { target_hours: val => Math.floor(val / 3600) || 1 }
  },
  "streak_base": {
    id: "streak_base", type: "scalable", category: "loyalty",
    ui: { name: "Преданность ур. {level}", short: "Слушайте музыку {target} дней подряд.", desc: "Хотя бы одно прослушивание в сутки.", howTo: "Открывайте приложение каждый день.", icon: "⚡", color: "#ff9800" },
    reward: { xpBase: 30, xpMultiplier: 1.8, tierBase: 1 },
    trigger: { conditions: [{ metric: "streak", operator: "gte" }] },
    scaling: { math: "custom", steps: [3, 7, 14, 30, 100, 365] }
  },
  "unique_tracks": {
    id: "unique_tracks", type: "scalable", category: "collection",
    ui: { name: "Коллекционер ур. {level}", short: "Послушайте {target} разных треков.", desc: "Засчитывается валидное прослушивание.", howTo: "Включайте разные треки, не повторяясь.", icon: "💿", color: "#9c27b0" },
    reward: { xpBase: 20, xpMultiplier: 1.5, tierBase: 1 },
    trigger: { conditions: [{ metric: "uniqueTracks", operator: "gte" }] },
    scaling: { math: "custom", steps: [5, 10, 16, 50, 100] }
  },
  "fav_total": {
    id: "fav_total", type: "scalable", category: "collection",
    ui: { name: "Мой плейлист ур. {level}", short: "Добавьте {target} треков в избранное.", desc: "Широкий пул открывает новые челленджи.", howTo: "Нажимайте на звёздочку справа от трека.", icon: "⭐", color: "#fdd835" },
    reward: { xpBase: 10, xpMultiplier: 1.4, tierBase: 1 },
    trigger: { conditions: [{ metric: "favCount", operator: "gte" }] },
    scaling: { math: "custom", steps: [3, 5, 8, 15, 50] }
  },
  "one_track_full": {
    id: "one_track_full", type: "scalable", category: "listening",
    ui: { name: "Абсолютный фаворит ур. {level}", short: "Один трек {target} раз полностью.", desc: "Подчёркивает супер-любимого.", howTo: "Выберите любимый трек и включайте его на репите.", icon: "❤️", color: "#e91e63" },
    reward: { xpBase: 50, xpMultiplier: 2.0, tierBase: 3 },
    trigger: { conditions: [{ metric: "maxOneTrackFull", operator: "gte" }] },
    scaling: { math: "custom", steps: [10, 25, 100, 500] }
  },
  "sleep_timer": {
    id: "sleep_timer", type: "scalable", category: "features",
    ui: { name: "Бережный сон ур. {level}", short: "Таймер сна сработал {target} раз.", desc: "Учитываются успешные остановки.", howTo: "Задайте таймер и дождитесь остановки.", icon: "😴", color: "#607d8b" },
    reward: { xpBase: 20, xpMultiplier: 1.5, tierBase: 1 },
    trigger: { conditions: [{ metric: "sleepTimerTriggers", operator: "gte" }] },
    scaling: { math: "custom", steps: [1, 5, 10, 50] }
  },
  
  // ==========================================
  // 2. СТАТИЧНЫЕ: ВРЕМЯ И ФИЧИ
  // ==========================================
  "quality_snob": {
    id: "quality_snob", type: "static", category: "features",
    ui: { name: "Качество звука", short: "10 прослушиваний в качестве Hi.", desc: "Только для ценителей кристального звука.", howTo: "Переключатель качества в положении Hi.", icon: "💎", color: "#4fc3f7" },
    reward: { xp: 30, tier: 2 },
    trigger: { conditions: [{ metric: "hiPlays", operator: "gte", target: 10 }] }
  },
  "early_bird": {
    id: "early_bird", type: "static", category: "time",
    ui: { name: "Ранняя пташка", short: "Слушайте утром (10 раз).", desc: "Окно 05:00–08:00 (по вашему времени).", howTo: "Запланируйте утреннее прослушивание.", icon: "🌅", color: "#ffd54f" },
    reward: { xp: 50, tier: 2 },
    trigger: { conditions: [{ metric: "earlyPlays", operator: "gte", target: 10 }] }
  },
  "night_owl": {
    id: "night_owl", type: "static", category: "time",
    ui: { name: "Ночной слушатель", short: "Слушайте ночью (10 раз).", desc: "Окно 02:00–04:30.", howTo: "Включите трек поздно ночью.", icon: "🦉", color: "#b388ff" },
    reward: { xp: 50, tier: 2 },
    trigger: { conditions: [{ metric: "nightPlays", operator: "gte", target: 10 }] }
  },
  "weekend_warrior": {
    id: "weekend_warrior", type: "static", category: "time",
    ui: { name: "Выходные с музыкой", short: "10 прослушиваний в выходные.", desc: "Добиться активности в Сб или Вс.", howTo: "Слушайте музыку на выходных.", icon: "🎉", color: "#ff5252" },
    reward: { xp: 100, tier: 3 },
    trigger: { conditions: [{ metric: "weekendPlays", operator: "gte", target: 10 }] }
  },
  "socials_all_visited": {
    id: "socials_all_visited", type: "static", category: "features",
    ui: { name: "На связи", short: "Откройте любую соцсеть из шапки.", desc: "Засчитывается первый переход по ссылке соцсетей.", howTo: "Перейдите по любой ссылке соцсетей в шапке приложения.", icon: "🌐", color: "#03a9f4" },
    reward: { xp: 50, tier: 1 },
    trigger: { conditions: [{ metric: "socialVisits", operator: "gte", target: 1 }] }
  },
  "pwa_installed": {
    id: "pwa_installed", type: "static", category: "features",
    ui: { name: "На моём устройстве", short: "Установите приложение как PWA.", desc: "Срабатывает при событии установки.", howTo: "Нажмите 'Установить как приложение'.", icon: "📱", color: "#4caf50" },
    reward: { xp: 200, tier: 4 },
    trigger: { conditions: [{ metric: "pwaInstalled", operator: "gte", target: 1 }] }
  },
  "backup_saves": {
    id: "backup_saves", type: "scalable", category: "features",
    ui: { name: "Бережёного бережёт ур. {level}", short: "Сохраните бэкап {target} раз.", desc: "Защита прогресса.", howTo: "Откройте 'Сохранение достижений' и скачайте файл.", icon: "💽", color: "#00bcd4" },
    reward: { xpBase: 20, xpMultiplier: 1.5, tierBase: 1 },
    trigger: { conditions: [{ metric: "backups", operator: "gte" }] },
    scaling: { math: "custom", steps: [1, 3, 10] }
  },
  "feature_lyrics": {
    id: "feature_lyrics", type: "static", category: "features",
    ui: { name: "Караоке мастер", short: "Включить лирику впервые.", desc: "Текст песен во время воспроизведения.", howTo: "Нажмите кнопку 'Т' в плеере.", icon: "🎤", color: "#4db6ac" },
    reward: { xp: 15, tier: 1 },
    trigger: { conditions: [{ metric: "featLyrics", operator: "gte", target: 1 }] }
  },

  // ==========================================
  // 3. ХАРДКОРНЫЕ КОМБО (Из старого приложения)
  // ==========================================
  "use_shuffle_5": {
    id: "use_shuffle_5", type: "static", category: "listening",
    ui: { name: "В случайном порядке", short: "5 прослушиваний в режиме Shuffle.", desc: "Слушайте с включённым случайным порядком.", howTo: "Включите Shuffle и слушайте.", icon: "🔀", color: "#ff9800" },
    reward: { xp: 50, tier: 2 },
    trigger: { conditions: [{ metric: "shufflePlays", operator: "gte", target: 5 }] }
  },
  "favorites_order_5_full": {
    id: "favorites_order_5_full", type: "static", category: "listening",
    ui: { name: "Только избранное — по порядку", short: "5 избранных подряд, полностью.", desc: "Режим «только избранные», без Shuffle.", howTo: "Включите «только избранные» (без Shuffle) и слушайте 5 треков.", icon: "⭐", color: "#ff5252" },
    reward: { xp: 200, tier: 3 },
    trigger: { conditions: [{ metric: "favOrderedCombo", operator: "gte", target: 5 }] }
  },
  "favorites_shuffle_5_full": {
    id: "favorites_shuffle_5_full", type: "static", category: "listening",
    ui: { name: "Только избранное — вперемешку", short: "5 избранных полностью в Shuffle.", desc: "Режим «только избранные» + Shuffle.", howTo: "Включите «только избранные» и Shuffle. Слушайте 5 разных.", icon: "🌀", color: "#fdd835" },
    reward: { xp: 200, tier: 3 },
    trigger: { conditions: [{ metric: "favShuffleCombo", operator: "gte", target: 5 }] }
  },

  // ==========================================
  // 4. СЕКРЕТНЫЕ (Secrets)
  // ==========================================
  "exact_time_11_11": {
    id: "exact_time_11_11", type: "static", category: "secret", hidden: true,
    ui: { name: "11:11", short: "Запустите в 11:11.", desc: "Секретная отсылка.", howTo: "Включите трек ровно в 11:11.", icon: "👁️", color: "#e80100" },
    reward: { xp: 300, tier: 6 },
    trigger: { conditions: [{ metric: "play11_11", operator: "gte", target: 1 }] }
  },
  "midnight_triple": {
    id: "midnight_triple", type: "static", category: "secret", hidden: true,
    ui: { name: "Полночный цикл", short: "Один трек 3 раза подряд в 00:00–00:30.", desc: "Сложный ночной челлендж.", howTo: "Запускайте один трек 3 раза до конца в полночь.", icon: "🦇", color: "#8a2be2" },
    reward: { xp: 400, tier: 6 },
    trigger: { conditions: [{ metric: "midnightTriple", operator: "gte", target: 1 }] }
  },
  "speed_runner": {
    id: "speed_runner", type: "static", category: "secret", hidden: true,
    ui: { name: "Спидраннер", short: "Активность 3 часа без перерыва.", desc: "Слушайте музыку долго и упорно.", howTo: "Не выключайте музыку 3 часа подряд.", icon: "🏃", color: "#ff5722" },
    reward: { xp: 300, tier: 6 },
    trigger: { conditions: [{ metric: "speedRunnerCombo", operator: "gte", target: 1 }] }
  }
};
