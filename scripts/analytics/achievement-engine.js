import { metaDB } from './meta-db.js';
import { eventLogger } from './event-logger.js';
import { AchievementDictionary } from './achievements-dict.js';

export class AchievementEngine {
  constructor() {
    this.dict = AchievementDictionary;
    this.unlocked = {};
    this.profile = { xp: 0, level: 1 };
    this.achievements = []; // Динамический список для UI-модалок и профиля

    // Инициализация при старте (первичная сборка массива для UI)
    this._initBoot();
    
    // Подписываемся на обновления статистики
    window.addEventListener('stats:updated', () => this.check());
  }

  async _initBoot() {
    const unData = await metaDB.getGlobal('unlocked_achievements');
    const profData = await metaDB.getGlobal('user_profile_rpg');
    
    this.unlocked = unData?.value || {};
    this.profile = profData?.value || { xp: 0, level: 1 };
    
    // Загружаем внешние/авторские JSON-задания
    await this.loadCustomAchievements();
    
    // Сразу строим интерфейсный список, чтобы Личный кабинет не был пустым при загрузке
    this.achievements = this._buildUIArray();
    this.broadcast(0);
  }

  // Подгрузка авторских заданий (JSON Drop) и Альбомов
  async loadCustomAchievements() {
    try {
      // 1. Читаем кастомные JSON (Требование №3)
      const res = await fetch('./data/custom_achievements.json', { cache: 'no-cache' });
      if (res.ok) {
        const customDict = await res.json();
        this.dict = { ...this.dict, ...customDict };
      }
    } catch (e) {}

    // 2. АВТО-ГЕНЕРАЦИЯ АЛЬБОМНЫХ ДОСТИЖЕНИЙ (Требование №2)
    if (window.albumsIndex) {
      window.albumsIndex.forEach(a => {
        if (a.key.startsWith('__')) return;
        
        // Ачивка "Марафонец альбома" (Послушать всё)
        this.dict[`album_complete_${a.key}`] = {
          id: `album_complete_${a.key}`, type: "static", category: "albums",
          ui: { 
            name: `Альбом «${a.title}»`, short: `Послушайте все треки альбома.`, 
            desc: `Соберите полные прослушивания всех треков релиза.`, 
            howTo: `Зайдите в альбом и слушайте без пропусков.`, 
            icon: "💿", color: "#4caf50" 
          },
          reward: { xp: 150, tier: 3 },
          trigger: { conditions: [{ metric: `album_${a.key}_complete`, operator: "gte", target: 1 }] }
        };
      });
    }
  }

  // Внутренний метод оценки (Rule Evaluator)
  _evalCondition(cond, aggValues) {
    const val = aggValues[cond.metric] || 0;
    if (cond.operator === 'gte') return val >= cond.target;
    if (cond.operator === 'eq') return val === cond.target;
    return false;
  }

  // Расчет цели для масштабируемых ачивок
  _getScalableTarget(rule, level) {
    if (rule.scaling.math === 'custom') {
      return rule.scaling.steps[level - 1] || rule.scaling.steps[rule.scaling.steps.length - 1];
    }
    if (rule.scaling.math === 'multiply') {
      return rule.trigger.conditions[0].startTarget * Math.pow(rule.scaling.factor, level - 1);
    }
    return rule.trigger.conditions[0].startTarget;
  }

  // Расчет опыта (XP) для уровня ачивки
  _getScalableXP(rule, level) {
    return Math.floor(rule.reward.xpBase * Math.pow(rule.reward.xpMultiplier, level - 1));
  }

  async check() {
    const statsArr = await metaDB.getAllStats();
    const streakData = await metaDB.getGlobal('global_streak');
    
    // Выделяем глобальную статистику (фичи приложения, не привязанные к трекам)
    const globalStat = statsArr.find(s => s.uid === 'global') || { featuresUsed: {} };
    const trackStats = statsArr.filter(s => s.uid !== 'global');
    
    // Считаем избранное на лету
    const favCount = window.FavoritesManager ? window.FavoritesManager.getSnapshot().filter(i => !i.inactiveAt).length : 0;
    
    // Собираем агрегированные метрики для Rule Engine
    const agg = {
      validPlays: trackStats.reduce((a, b) => a + (b.globalValidListenCount || 0), 0),
      fullPlays: trackStats.reduce((a, b) => a + (b.globalFullListenCount || 0), 0),
      totalSec: trackStats.reduce((a, b) => a + (b.globalListenSeconds || 0), 0),
      uniqueTracks: trackStats.filter(s => s.globalValidListenCount > 0).length,
      maxOneTrackFull: Math.max(0, ...trackStats.map(s => s.globalFullListenCount || 0)),
      favCount: favCount,
      streak: streakData?.value?.current || 0,
      
      // Специфичные фичи и тайминги
      featLyrics: trackStats.reduce((a, b) => a + (b.featuresUsed?.lyrics || 0), 0),
      nightPlays: trackStats.reduce((a, b) => a + (b.featuresUsed?.nightPlay || 0), 0),
      earlyPlays: trackStats.reduce((a, b) => a + (b.featuresUsed?.earlyPlay || 0), 0),
      hiPlays: trackStats.reduce((a, b) => a + (b.featuresUsed?.hiQuality || 0), 0),
      
      // Глобальные события (из 'global' uid)
      play11_11: globalStat.featuresUsed?.play_11_11 || 0,
      weekendPlays: globalStat.featuresUsed?.weekend_play || 0,
      backups: globalStat.featuresUsed?.backup || 0,
      pwaInstalled: globalStat.featuresUsed?.pwa_installed || 0,
      sleepTimerTriggers: globalStat.featuresUsed?.sleep_timer || 0,
      socialVisits: globalStat.featuresUsed?.social_visit || 0,
      
      // Сложные комбо из StatsAggregator
      shufflePlays: trackStats.reduce((a, b) => a + (b.featuresUsed?.shufflePlay || 0), 0),
      favOrderedCombo: globalStat.featuresUsed?.fav_ordered_5 || 0,
      favShuffleCombo: globalStat.featuresUsed?.fav_shuffle_5 || 0,
      midnightTriple: globalStat.featuresUsed?.midnight_triple || 0,
    };

    // Подсчет полного прохождения альбомов (Динамика)
    if (window.TrackRegistry) {
      const allReg = window.TrackRegistry.getAllUids().map(u => window.TrackRegistry.getTrackByUid(u));
      const albumsSet = new Set(allReg.map(t => t.sourceAlbum).filter(Boolean));
      
      albumsSet.forEach(aKey => {
        const aTracks = allReg.filter(t => t.sourceAlbum === aKey);
        const playedInAlbum = aTracks.filter(t => {
          const s = trackStats.find(ts => ts.uid === t.uid);
          return s && s.globalFullListenCount > 0;
        });
        // Если прослушаны все треки в альбоме -> ставим флаг 1
        agg[`album_${aKey}_complete`] = (playedInAlbum.length >= aTracks.length && aTracks.length > 0) ? 1 : 0;
      });
    }

    let changed = false;
    let earnedXp = 0;

    // Главный цикл обработки словаря
    for (const [key, rule] of Object.entries(this.dict)) {
      
      // Проверка сезонности (ТЗ 11.4)
      if (rule.seasonal) {
        const now = Date.now();
        // Если указан строгий timestamp
        if (rule.seasonal.start && now < rule.seasonal.start) continue;
        if (rule.seasonal.end && now > rule.seasonal.end) continue;
        // Если указаны месяцы (0 - январь, 11 - декабрь)
        if (rule.seasonal.months && !rule.seasonal.months.includes(new Date().getMonth())) continue;
      }

      // 1. СТАТИЧНЫЕ ДОСТИЖЕНИЯ
      if (rule.type === 'static') {
        if (!this.unlocked[key]) {
          const pass = rule.trigger.conditions.every(c => this._evalCondition({ ...c, target: c.target }, agg));
          if (pass) {
            this.unlocked[key] = Date.now();
            earnedXp += rule.reward.xp;
            changed = true;
            this._notifyUnlock(rule.ui.name, rule.ui.icon, rule.reward.xp);
          }
        }
      } 
      
      // 2. МНОГОУРОВНЕВЫЕ (Scalable) ДОСТИЖЕНИЯ
      else if (rule.type === 'scalable') {
        let curLevel = 1;
        // Находим текущий невыполненный уровень
        while (this.unlocked[`${key}_${curLevel}`]) {
          curLevel++;
        }

        // Бесконечный цикл проверки (если выполнил сразу на 3 уровня вперед)
        let safetyLimit = 50; 
        while (safetyLimit--) {
          if (rule.scaling.maxLevel && curLevel > rule.scaling.maxLevel) break;
          if (rule.scaling.math === 'custom' && curLevel > rule.scaling.steps.length) break;

          const target = this._getScalableTarget(rule, curLevel);
          const pass = rule.trigger.conditions.every(c => this._evalCondition({ ...c, target }, agg));
          
          if (pass) {
            const achId = `${key}_${curLevel}`;
            this.unlocked[achId] = Date.now();
            
            const xpGain = this._getScalableXP(rule, curLevel);
            earnedXp += xpGain;
            changed = true;
            
            const formattedName = rule.ui.name.replace('{level}', curLevel);
            this._notifyUnlock(formattedName, rule.ui.icon, xpGain);
            
            curLevel++; // Проверяем следующий уровень сразу
          } else {
            break; // Условия не выполнены, прерываем цикл для этой ачивки
          }
        }
      }
    }

    // Сохраняем последний слепок агрегатора для UI (чтобы считать прогресс-бары)
    this.lastAgg = agg;

    // Если было хоть одно обновление
    if (changed) {
      this.profile.xp += earnedXp;
      
      // RPG Формула уровня: Уровень = корень из (XP / 100) + 1
      const newLevel = Math.floor(Math.sqrt(this.profile.xp / 100)) + 1;
      if (newLevel > this.profile.level) {
        this.profile.level = newLevel;
        setTimeout(() => window.NotificationSystem?.success(`🎉 ПОЗДРАВЛЯЕМ! Ваш уровень повышен до ${newLevel}!`), 2000);
      }

      await metaDB.setGlobal('unlocked_achievements', this.unlocked);
      await metaDB.setGlobal('user_profile_rpg', this.profile);
      
      // Перестраиваем массив для UI
      this.achievements = this._buildUIArray();
      this.broadcast(agg.streak);
    }
  }

  // Генерация динамического плоского массива для UI (Личный Кабинет / Прогресс бар)
  _buildUIArray() {
    const arr = [];
    const agg = this.lastAgg || {};
    
    for (const [key, rule] of Object.entries(this.dict)) {
      if (rule.type === 'static') {
        const isUnl = !!this.unlocked[key];
        
        // Маскировка секретных достижений (в точности как в старом аппе)
        if (rule.hidden && !isUnl) {
          arr.push({
            id: key,
            name: "Секретное достижение",
            short: "Откроется при особых условиях",
            desc: "Продолжайте исследовать приложение, чтобы узнать секрет.",
            howTo: "Скрыто",
            icon: "🔒",
            color: "#888888",
            isUnlocked: false,
            isHidden: true,
            unlockedAt: null
          });
        } else {
          const target = rule.trigger.conditions[0].target;
          const current = agg[rule.trigger.conditions[0].metric] || 0;
          const pct = Math.min(100, Math.max(0, (current / target) * 100));

          arr.push({
            id: key,
            name: rule.ui.name,
            short: rule.ui.short,
            desc: rule.ui.desc,
            howTo: rule.ui.howTo,
            icon: rule.ui.icon,
            color: rule.ui.color,
            isUnlocked: isUnl,
            isHidden: false,
            unlockedAt: this.unlocked[key] || null,
            progress: { current, target, pct }
          });
        }
      } else if (rule.type === 'scalable') {
        let curLevel = 1;
        
        // Добавляем все ВЫПОЛНЕННЫЕ уровни
        while (this.unlocked[`${key}_${curLevel}`]) {
          const target = this._getScalableTarget(rule, curLevel);
          let displayTarget = target;
          if (rule.formatters && rule.formatters.target_hours) displayTarget = rule.formatters.target_hours(target);

          arr.push({
            id: `${key}_${curLevel}`,
            name: rule.ui.name.replace('{level}', curLevel),
            short: rule.ui.short.replace('{target}', displayTarget).replace('{target_hours}', displayTarget),
            desc: rule.ui.desc,
            howTo: rule.ui.howTo,
            icon: rule.ui.icon,
            color: rule.ui.color,
            isUnlocked: true,
            isHidden: false,
            unlockedAt: this.unlocked[`${key}_${curLevel}`]
          });
          curLevel++;
        }
        
        // Добавляем СЛЕДУЮЩИЙ (НЕВЫПОЛНЕННЫЙ) уровень как цель (Goal)
        const notMaxed = (!rule.scaling.maxLevel || curLevel <= rule.scaling.maxLevel) &&
                         (rule.scaling.math !== 'custom' || curLevel <= rule.scaling.steps.length);
                         
        if (notMaxed) {
          const target = this._getScalableTarget(rule, curLevel);
          let displayTarget = target;
          if (rule.formatters && rule.formatters.target_hours) displayTarget = rule.formatters.target_hours(target);

          const current = agg[rule.trigger.conditions[0].metric] || 0;
          let displayCurrent = current;
          if (rule.formatters && rule.formatters.target_hours) displayCurrent = rule.formatters.target_hours(current);
          const pct = Math.min(100, Math.max(0, (displayCurrent / displayTarget) * 100));

          arr.push({
            id: `${key}_${curLevel}`,
            name: rule.ui.name.replace('{level}', curLevel),
            short: rule.ui.short.replace('{target}', displayTarget).replace('{target_hours}', displayTarget),
            desc: rule.ui.desc,
            howTo: rule.ui.howTo,
            icon: rule.ui.icon,
            color: '#888888', // Серый цвет для заблокированных
            isUnlocked: false,
            isHidden: false,
            unlockedAt: null,
            progress: { current: displayCurrent, target: displayTarget, pct }
          });
        }
      }
    }
    
    // Сортируем: сначала выполненные (самые новые сверху), затем невыполненные
    return arr.sort((a, b) => {
      if (a.isUnlocked === b.isUnlocked) {
        return (b.unlockedAt || 0) - (a.unlockedAt || 0);
      }
      return a.isUnlocked ? -1 : 1;
    });
  }

  _notifyUnlock(name, icon, xp) {
    eventLogger.log('ACHIEVEMENT_UNLOCK', null, { name, xp });
    window.NotificationSystem?.success(`🏆 ${icon} Открыто: ${name} (+${xp} XP)`);
  }

  broadcast(streak) {
    const unlockedCount = Object.keys(this.unlocked).length;
    window.dispatchEvent(new CustomEvent('achievements:updated', { 
      detail: { 
        total: this.achievements.length, // Учитывает динамически сгенерированные цели
        unlocked: unlockedCount, 
        items: this.unlocked, 
        streak: streak,
        profile: this.profile
      } 
    }));
  }
}
