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
    
    // Сразу строим интерфейсный список, чтобы Личный кабинет не был пустым при загрузке
    this.achievements = this._buildUIArray();
    this.broadcast(0);
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
    
    // Собираем агрегированные метрики из базы
    const agg = {
      totalFull: statsArr.reduce((a, b) => a + (b.globalFullListenCount || 0), 0),
      totalSec: statsArr.reduce((a, b) => a + (b.globalListenSeconds || 0), 0),
      featLyrics: statsArr.reduce((a, b) => a + (b.featuresUsed?.lyrics || 0), 0),
      nightPlays: statsArr.reduce((a, b) => a + (b.featuresUsed?.nightPlay || 0), 0),
      earlyPlays: statsArr.reduce((a, b) => a + (b.featuresUsed?.earlyPlay || 0), 0),
      hiPlays: statsArr.reduce((a, b) => a + (b.featuresUsed?.hiQuality || 0), 0),
      streak: streakData?.value?.current || 0
    };

    let changed = false;
    let earnedXp = 0;

    // Главный цикл обработки словаря
    for (const [key, rule] of Object.entries(this.dict)) {
      
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
    
    for (const [key, rule] of Object.entries(this.dict)) {
      if (rule.type === 'static') {
        arr.push({
          id: key,
          name: rule.ui.name,
          desc: rule.ui.desc,
          icon: rule.ui.icon,
          color: rule.ui.color,
          isUnlocked: !!this.unlocked[key],
          unlockedAt: this.unlocked[key] || null
        });
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
            desc: rule.ui.desc.replace('{target}', displayTarget).replace('{target_hours}', displayTarget),
            icon: rule.ui.icon,
            color: rule.ui.color,
            isUnlocked: true,
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

          arr.push({
            id: `${key}_${curLevel}`,
            name: rule.ui.name.replace('{level}', curLevel),
            desc: rule.ui.desc.replace('{target}', displayTarget).replace('{target_hours}', displayTarget),
            icon: rule.ui.icon,
            color: '#888888', // Серый цвет для заблокированных
            isUnlocked: false,
            unlockedAt: null
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
