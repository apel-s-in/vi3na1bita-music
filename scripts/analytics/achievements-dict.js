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
    ui: {
      name: "В потоке ур. {level}",
      short: "{target} валидных прослушиваний.",
      desc: "Каждый уровень начинается с нуля.",
      howTo: "Слушайте любой трек не менее 25 секунд подтверждённого времени.",
      icon: "🎧",
      color: "#4daaff"
    },
    reward: {
      steps: [10, 15, 20, 25, 35, 50, 75, 100, 150, 200, 300, 400, 500],
      tierBase: 1
    },
    trigger: { conditions: [{ metric: "validPlays", operator: "gte" }] },
    scaling: {
      math: "custom",
      resetEachLevel: true,
      steps: [1, 10, 25, 50, 70, 100, 250, 500, 1000, 5000, 10000, 15000, 20000]
    }
  },
  "full_total": {
    id: "full_total", type: "scalable", category: "listening",
    ui: {
      name: "Верное ухо ур. {level}",
      short: "Осталось полных прослушиваний: {target}.",
      desc: "Сервер засчитывает только естественное завершение трека без пауз, остановок, ручного переключения, перемоток, mute и нулевой программной громкости.",
      howTo: "Запустите трек с начала и дождитесь его естественного завершения. Автоматический повтор трека разрешён: каждый естественно завершённый круг создаёт отдельное полное прослушивание.",
      icon: "🏆",
      color: "#ff9800"
    },
    reward: {
      steps: [5, 10, 15, 30, 50, 75, 85, 100, 125, 150, 200, 250, 500, 250, 250, 250],
      repeatAmount: 250,
      tierBase: 2
    },
    trigger: { conditions: [{ metric: "fullPlays", operator: "gte" }] },
    scaling: {
      math: "custom",
      resetEachLevel: true,
      cumulativeSteps: true,
      steps: [1, 2, 5, 10, 50, 100, 150, 200, 250, 300, 400, 500, 1000, 1500, 2000, 2500],
      repeatAfterLevel: 16,
      repeatStep: 500
    }
  },
  "time_total": {
    id: "time_total", type: "scalable", category: "time",
    ui: {
      name: "Хранитель времени ур. {level}",
      short: "Слушайте музыку ещё {target_hours} ч.",
      desc: "Сервер суммирует фактическое время воспроизведения без пауз, перемоток, mute и нулевой программной громкости.",
      howTo: "Продолжайте слушать музыку. Фоновое воспроизведение учитывается после серверного подтверждения.",
      icon: "⏳",
      color: "#ffb74d"
    },
    reward: {
      steps: [25, 30, 35, 40, 50, 100, 150, 200, 300, 400, 500, 500, 500, 500],
      repeatAmount: 500,
      tierBase: 2
    },
    trigger: { conditions: [{ metric: "totalSec", operator: "gte" }] },
    scaling: {
      math: "custom",
      resetEachLevel: true,
      cumulativeSteps: true,
      steps: [
        3600,
        7200,
        10800,
        14400,
        18000,
        36000,
        86400,
        180000,
        360000,
        720000,
        1800000,
        3600000,
        7200000,
        10800000
      ],
      repeatAfterLevel: 14,
      repeatStep: 3600000
    },
    formatters: {
      target_hours: value => {
        const hours = Number(value || 0) / 3600;
        return Number.isInteger(hours)
          ? hours
          : Math.round(hours * 10) / 10;
      }
    }
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
    ui: { name: "Моё избранное ур. {level}", short: "Добавьте {target} треков в избранное.", desc: "Сервер считает активные ⭐ вашего Яндекс ID на всех устройствах.", howTo: "Нажимайте на звёздочку справа от трека.", icon: "⭐", color: "#fdd835" },
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
    ui: { name: "Бережный сон ур. {level}", short: "Подтверждённый таймер сна сработал {target} раз.", desc: "Сервер проверяет deadline и наблюдаемое прослушивание во время работы таймера.", howTo: "Установите таймер, слушайте музыку и дождитесь автоматической остановки.", icon: "😴", color: "#607d8b" },
    reward: { xpBase: 20, xpMultiplier: 1.5, tierBase: 1 },
    trigger: { conditions: [{ metric: "sleepTimerTriggers", operator: "gte" }] },
    scaling: { math: "custom", steps: [1, 5, 10, 50] }
  },
  
  // ==========================================
  // 2. СТАТИЧНЫЕ: ВРЕМЯ И ФИЧИ
  // ==========================================
  "quality_snob": {
    id: "quality_snob", type: "static", category: "features",
    ui: { name: "Качество звука", short: "10 полных прослушиваний в качестве Hi.", desc: "Сервер учитывает только полные прослушивания, начатые в качестве Hi.", howTo: "Установите качество Hi и дослушивайте треки полностью.", icon: "💎", color: "#4fc3f7" },
    reward: { xp: 30, tier: 2 },
    trigger: { conditions: [{ metric: "hiPlays", operator: "gte", target: 10 }] }
  },
  "early_bird": {
    id: "early_bird", type: "static", category: "time",
    ui: { name: "Ранняя пташка", short: "10 полных утренних прослушиваний.", desc: "Старт трека с 05:00 до 08:59 по времени, зафиксированному при начале сессии.", howTo: "Запускайте утром и дослушивайте треки полностью.", icon: "🌅", color: "#ffd54f" },
    reward: { xp: 50, tier: 2 },
    trigger: { conditions: [{ metric: "earlyPlays", operator: "gte", target: 10 }] }
  },
  "night_owl": {
    id: "night_owl", type: "static", category: "time",
    ui: { name: "Ночной слушатель", short: "10 полных ночных прослушиваний.", desc: "Старт трека с 02:00 до 04:30 по времени, зафиксированному при начале сессии.", howTo: "Запускайте ночью и дослушивайте треки полностью.", icon: "🦉", color: "#b388ff" },
    reward: { xp: 50, tier: 2 },
    trigger: { conditions: [{ metric: "nightPlays", operator: "gte", target: 10 }] }
  },
  "weekend_warrior": {
    id: "weekend_warrior", type: "static", category: "time",
    ui: { name: "Выходные с музыкой", short: "10 прослушиваний в выходные.", desc: "Добиться активности в Сб или Вс.", howTo: "Слушайте музыку на выходных.", icon: "🎉", color: "#ff5252" },
    reward: { xp: 100, tier: 3 },
    trigger: { conditions: [{ metric: "weekendPlays", operator: "gte", target: 10 }] }
  },
  "pwa_installed": {
    id: "pwa_installed", type: "static", category: "features",
    ui: { name: "На моём устройстве", short: "Установите PWA и запустите его с ярлыка.", desc: "Сервер подтверждает отдельный standalone-запуск с того же устройства и Яндекс ID.", howTo: "Войдите через Яндекс, нажмите «Установить приложение», выполните инструкцию и откройте приложение созданным ярлыком.", icon: "📱", color: "#4caf50" },
    reward: { xp: 200, tier: 4 },
    trigger: { conditions: [{ metric: "pwaInstalled", operator: "gte", target: 1 }] }
  },
  "feature_lyrics": {
    id: "feature_lyrics", type: "static", category: "features",
    ui: { name: "Караоке мастер", short: "Включите лирику во время подтверждённого прослушивания.", desc: "Сервер учитывает использование лирики только после принятого listening heartbeat.", howTo: "Запустите трек, дождитесь начала прослушивания и нажмите кнопку «Т».", icon: "🎤", color: "#4db6ac" },
    reward: { xp: 15, tier: 1 },
    trigger: { conditions: [{ metric: "featLyrics", operator: "gte", target: 1 }] }
  },

  // ==========================================
  // 3. ХАРДКОРНЫЕ КОМБО (Из старого приложения)
  // ==========================================
  "use_shuffle_5": {
    id: "use_shuffle_5", type: "static", category: "listening",
    ui: { name: "В случайном порядке", short: "5 полных прослушиваний в режиме Shuffle.", desc: "Режим Shuffle фиксируется серверной сессией при старте трека.", howTo: "Включите Shuffle и дослушайте 5 треков полностью.", icon: "🔀", color: "#ff9800" },
    reward: { xp: 50, tier: 2 },
    trigger: { conditions: [{ metric: "shufflePlays", operator: "gte", target: 5 }] }
  },
  "favorites_order_5_full": {
    id: "favorites_order_5_full", type: "static", category: "listening",
    ui: { name: "Только избранное — по порядку", short: "5 избранных подряд в их сохранённом порядке.", desc: "Сервер проверяет полные прослушивания и последовательные позиции в одном состоянии Избранного.", howTo: "Включите «только избранные» без Shuffle и дослушайте 5 треков подряд.", icon: "⭐", color: "#ff5252" },
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
    ui: { name: "Полночный цикл", short: "Один трек 3 раза подряд в 00:00–00:30.", desc: "Сервер проверяет три полных завершения одного UID на одном устройстве.", howTo: "С 00:00 до 00:30 трижды подряд запускайте и дослушивайте один трек полностью.", icon: "🦇", color: "#8a2be2" },
    reward: { xp: 400, tier: 6 },
    trigger: { conditions: [{ metric: "midnightTriple", operator: "gte", target: 1 }] }
  },
  "speed_runner": {
    id: "speed_runner", type: "static", category: "secret", hidden: true,
    ui: { name: "Спидраннер", short: "3 часа подтверждённого прослушивания без перерыва.", desc: "Сервер суммирует только непрерывные принятые интервалы одного устройства.", howTo: "Слушайте без пауз, mute, перемоток и больших разрывов между треками.", icon: "🏃", color: "#ff5722" },
    reward: { xp: 300, tier: 6 },
    trigger: { conditions: [{ metric: "speedRunnerCombo", operator: "gte", target: 1 }] }
  }
};
