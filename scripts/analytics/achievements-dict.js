/**
 * scripts/analytics/achievements-dict.js
 * ОБЪЕДИНЕННЫЙ СЛОВАРЬ (Старое приложение + Новое ТЗ 11.3)
 */

export const AchievementDictionary = {
  // ==========================================
  // 1. МНОГОУРОВНЕВЫЕ (Из старого и нового ТЗ)
  // ==========================================
  "play_total": {
    id: "play_total", type: "scalable", category: "listening",
    ui: { 
      name: "В потоке ур. {level}", 
      short: "Соберите {target} валидных прослушиваний",
      desc: "Любые треки — главное валидное время. Не прокликивайте быстро.",
      howTo: "Слушайте регулярно, используйте Shuffle. Засчитывается ≥13 сек или конец трека.",
      icon: "🎧", color: "#4daaff" 
    },
    reward: { xpBase: 10, xpMultiplier: 1.5, tierBase: 1 },
    trigger: { conditions: [{ metric: "validPlays", operator: "gte" }] },
    scaling: { math: "custom", steps: [1, 25, 100, 500, 1000, 5000] }
  },
  "full_total": {
    id: "full_total", type: "scalable", category: "listening",
    ui: { 
      name: "Верное ухо ур. {level}", 
      short: "{target} полных прослушиваний",
      desc: "Полное прослушивание — до конца или ≥90% длительности.",
      howTo: "Сохраняйте концентрацию и дослушивайте треки до последней ноты.",
      icon: "🏆", color: "#ff9800" 
    },
    reward: { xpBase: 15, xpMultiplier: 1.8, tierBase: 2 },
    trigger: { conditions: [{ metric: "fullPlays", operator: "gte" }] },
    scaling: { math: "custom", steps: [1, 10, 50, 100, 500, 1000] }
  },
  "time_total": {
    id: "time_total", type: "scalable", category: "time",
    ui: { 
      name: "Хранитель времени ур. {level}", 
      short: "Накопите {target_hours} ч. прослушивания",
      desc: "Суммарное валидное время прослушивания.",
      howTo: "Слушайте альбом, время учитывается при валидных остановках.",
      icon: "⏳", color: "#ffb74d" 
    },
    reward: { xpBase: 25, xpMultiplier: 2.0, tierBase: 2 },
    trigger: { conditions: [{ metric: "totalSec", operator: "gte" }] },
    scaling: { math: "custom", steps: [3600, 18000, 36000, 86400, 360000] }, // 1h, 5h, 10h, 24h, 100h
    formatters: { target_hours: val => Math.floor(val / 3600) }
  },
  "streak_base": {
    id: "streak_base", type: "scalable", category: "loyalty",
    ui: { 
      name: "Преданность ур. {level}", 
      short: "Слушайте музыку {target} дней подряд",
      desc: "Каждый день — хотя бы одно валидное прослушивание.",
      howTo: "Открывайте приложение и слушайте по одному треку каждый день без пропусков.",
      icon: "⚡", color: "#ff9800" 
    },
    reward: { xpBase: 30, xpMultiplier: 1.8, tierBase: 1 },
    trigger: { conditions: [{ metric: "streak", operator: "gte" }] },
    scaling: { math: "custom", steps: [3, 7, 14, 30, 100, 365] }
  },
  "unique_tracks": {
    id: "unique_tracks", type: "scalable", category: "collection",
    ui: { 
      name: "Коллекционер ур. {level}", 
      short: "Послушайте {target} разных треков",
      desc: "Засчитывается валидное прослушивание уникальных треков.",
      howTo: "Включайте разные треки и слушайте ≥13 сек каждый.",
      icon: "💿", color: "#9c27b0" 
    },
    reward: { xpBase: 20, xpMultiplier: 1.5, tierBase: 1 },
    trigger: { conditions: [{ metric: "uniqueTracks", operator: "gte" }] },
    scaling: { math: "custom", steps: [5, 10, 16, 50, 100] }
  },
  "fav_total": {
    id: "fav_total", type: "scalable", category: "collection",
    ui: { 
      name: "Мой плейлист ур. {level}", 
      short: "Добавьте {target} треков в избранное",
      desc: "Широкий пул избранных открывает больше челленджей.",
      howTo: "Нажимайте на звёздочку справа от трека.",
      icon: "⭐", color: "#fdd835" 
    },
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
  // 2. СТАТИЧНЫЕ УНИКАЛЬНЫЕ И СЕЗОННЫЕ (Из ТЗ 11.3)
  // ==========================================
  "quality_snob": {
    id: "quality_snob", type: "static", category: "features",
    ui: { 
      name: "Качество звука", short: "10 прослушиваний в качестве Hi",
      desc: "Только для ценителей кристального звука.",
      howTo: "Убедитесь, что переключатель качества стоит в положении Hi, и послушайте 10 треков.",
      icon: "💎", color: "#4fc3f7" 
    },
    reward: { xp: 30, tier: 2 },
    trigger: { conditions: [{ metric: "hiPlays", operator: "gte", target: 10 }] }
  },
  "early_bird": {
    id: "early_bird", type: "static", category: "time",
    ui: { 
      name: "Ранняя пташка", short: "Слушайте утром (10 раз)",
      desc: "Валидное прослушивание в окне 05:00–08:00 (по вашему времени).",
      howTo: "Запланируйте утреннее прослушивание и включите любой трек.",
      icon: "🌅", color: "#ffd54f" 
    },
    reward: { xp: 50, tier: 2 },
    trigger: { conditions: [{ metric: "earlyPlays", operator: "gte", target: 10 }] }
  },
  "night_owl": {
    id: "night_owl", type: "static", category: "time",
    ui: { 
      name: "Ночной слушатель", short: "Слушайте ночью (10 раз)",
      desc: "Валидное прослушивание в окне 00:00–05:00.",
      howTo: "Включите трек поздно ночью и слушайте ≥13 сек.",
      icon: "🦉", color: "#b388ff" 
    },
    reward: { xp: 50, tier: 2 },
    trigger: { conditions: [{ metric: "nightPlays", operator: "gte", target: 10 }] }
  },
  "weekend_warrior": {
    id: "weekend_warrior", type: "static", category: "time",
    ui: { 
      name: "Выходные с музыкой", short: "10 прослушиваний в выходные",
      desc: "Добиться активности в субботу или воскресенье.",
      howTo: "Слушайте треки в субботу и в воскресенье.",
      icon: "🎉", color: "#ff5252" 
    },
    reward: { xp: 100, tier: 3 },
    trigger: { conditions: [{ metric: "weekendPlays", operator: "gte", target: 10 }] }
  },
  "pwa_installed": {
    id: "pwa_installed", type: "static", category: "features",
    ui: { 
      name: "На моём устройстве", short: "Установите приложение как PWA",
      desc: "Срабатывает при событии appinstalled.",
      howTo: "Нажмите 'Установить как приложение' и подтвердите установку.",
      icon: "📱", color: "#4caf50" 
    },
    reward: { xp: 200, tier: 4 },
    trigger: { conditions: [{ metric: "pwaInstalled", operator: "gte", target: 1 }] }
  },
  "socials_all_visited": {
    id: "socials_all_visited", type: "static", category: "features",
    ui: { 
      name: "Подписчик всего", short: "Откройте все соцсети из шапки",
      desc: "Однажды кликните по каждой из ссылок социальных сетей.",
      howTo: "Перейдите по всем ссылкам в блоке под обложкой.",
      icon: "🌐", color: "#03a9f4" 
    },
    reward: { xp: 50, tier: 1 },
    trigger: { conditions: [{ metric: "socialVisits", operator: "gte", target: 1 }] }
  },
  "feature_lyrics": {
    id: "feature_lyrics", type: "static", category: "features",
    ui: { 
      name: "Караоке", short: "Включить лирику впервые",
      desc: "Откройте для себя текст песен прямо во время воспроизведения.",
      howTo: "Нажмите кнопку 'Т' (или Y) в плеере.",
      icon: "🎤", color: "#4db6ac" 
    },
    reward: { xp: 15, tier: 1 },
    trigger: { conditions: [{ metric: "featLyrics", operator: "gte", target: 1 }] }
  },

  // ==========================================
  // 3. СЕКРЕТНЫЕ ДОСТИЖЕНИЯ
  // ==========================================
  "exact_time_11_11": {
    id: "exact_time_11_11", type: "static", category: "secret", hidden: true,
    ui: { 
      name: "11:11", short: "Запустите в 11:11.",
      desc: "Секретная отсылка.",
      howTo: "Включите трек ровно в 11:11.",
      icon: "👁️", color: "#e80100" 
    },
    reward: { xp: 300, tier: 6 },
    trigger: { conditions: [{ metric: "play11_11", operator: "gte", target: 1 }] }
  }
};;
