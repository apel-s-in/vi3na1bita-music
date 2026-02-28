import { metaDB } from './meta-db.js';
import { eventLogger } from './event-logger.js';
import { AchievementDictionary } from './achievements-dict.js';

export class AchievementEngine {
  constructor() {
    this.dict = { ...AchievementDictionary };
    this.unlocked = {};
    this.profile = { xp: 0, level: 1 };
    this.achievements = [];
    this.lastAgg = {};
    this.ready = false;
    
    this._initBoot();
    window.addEventListener('stats:updated', () => this.check());
  }

  async _initBoot() {
    const [unData, profData] = await Promise.all([
      metaDB.getGlobal('unlocked_achievements'),
      metaDB.getGlobal('user_profile_rpg')
    ]);
    
    this.unlocked = unData?.value || {};
    this.profile = profData?.value || { xp: 0, level: 1 };
    
    try {
      const res = await fetch('./data/custom_achievements.json', { cache: 'no-cache' });
      if (res.ok) Object.assign(this.dict, await res.json());
    } catch (e) {}

    // Авто-генерация достижений для альбомов
    (window.albumsIndex || []).forEach(a => {
      if (!a.key.startsWith('__')) {
        this.dict[`album_complete_${a.key}`] = {
          id: `album_complete_${a.key}`, type: "static", category: "albums",
          ui: { name: `Альбом «${a.title}»`, short: `Послушайте все треки альбома.`, desc: `Соберите полные прослушивания всех треков релиза.`, howTo: `Зайдите в альбом и слушайте без пропусков.`, icon: "💿", color: "#4caf50" },
          reward: { xp: 150, tier: 3 },
          trigger: { conditions: [{ metric: `album_${a.key}_complete`, operator: "gte", target: 1 }] }
        };
      }
    });

    this.ready = true;
    this.check(); // Initial check after boot
  }

  _evalCondition(cond, agg) {
    const val = agg[cond.metric] || 0;
    return cond.operator === 'gte' ? val >= cond.target : val === cond.target;
  }

  // Единый метод для расчета Цели или XP масштабируемых ачивок
  _getSc(r, lvl, isXp) {
    if (isXp) return Math.floor(r.reward.xpBase * Math.pow(r.reward.xpMultiplier, lvl - 1));
    const s = r.scaling;
    return s.math === 'custom' ? (s.steps[lvl - 1] || s.steps[s.steps.length - 1]) : r.trigger.conditions[0].startTarget * Math.pow(s.factor, lvl - 1);
  }

  async check() {
    if (!this.ready) return;
    const statsArr = await metaDB.getAllStats();
    const globalStat = statsArr.find(s => s.uid === 'global')?.featuresUsed || {};
    const trackStats = statsArr.filter(s => s.uid !== 'global');
    const streak = (await metaDB.getGlobal('global_streak'))?.value?.current || 0;
    const favCount = window.FavoritesManager ? window.FavoritesManager.getSnapshot().filter(i => !i.inactiveAt).length : 0;

    // ОПТИМИЗАЦИЯ: Динамическая агрегация всех метрик
    const agg = trackStats.reduce((a, b) => {
      a.validPlays += b.globalValidListenCount || 0;
      a.fullPlays += b.globalFullListenCount || 0;
      a.totalSec += b.globalListenSeconds || 0;
      if (b.globalValidListenCount > 0) a.uniqueTracks++;
      a.maxOneTrackFull = Math.max(a.maxOneTrackFull, b.globalFullListenCount || 0);
      
      const f = b.featuresUsed || {};
      for (const k in f) a[k] = (a[k] || 0) + (f[k] || 0);
      
      // Маппинг старых имен для совместимости
      a.featLyrics = a.lyrics || 0;
      a.nightPlays = a.nightPlay || 0;
      a.earlyPlays = a.earlyPlay || 0;
      a.hiPlays = a.hiQuality || 0;
      a.shufflePlays = a.shufflePlay || 0;
      return a;
    }, {
      validPlays: 0, fullPlays: 0, totalSec: 0, uniqueTracks: 0, maxOneTrackFull: 0,
      favCount, streak,
      ...globalStat, // Включаем все глобальные метрики автоматически
      play11_11: globalStat.play_11_11 || 0, // Explicit mapping for dict compatibility
      favOrderedCombo: globalStat.fav_ordered_5 || 0, 
      favShuffleCombo: globalStat.fav_shuffle_5 || 0,
      midnightTriple: globalStat.midnight_triple || 0,
      pwaInstalled: globalStat.pwa_installed || 0,
      sleepTimerTriggers: globalStat.sleep_timer || 0, 
      socialVisits: globalStat.social_visit || 0,
      weekendPlays: globalStat.weekend_play || 0,
      backups: globalStat.backup || 0
    });

    // ОПТИМИЗАЦИЯ: O(1) поиск по Set (вместо медленного O(N^2) поиска .find() внутри .filter())
    if (window.TrackRegistry) {
      const allReg = window.TrackRegistry.getAllUids().map(u => window.TrackRegistry.getTrackByUid(u));
      const playedUids = new Set(trackStats.filter(s => s.globalFullListenCount > 0).map(s => s.uid));
      const albumsSet = new Set(allReg.map(t => t.sourceAlbum).filter(Boolean));
      
      albumsSet.forEach(aKey => {
        const aTracks = allReg.filter(t => t.sourceAlbum === aKey);
        const played = aTracks.filter(t => playedUids.has(t.uid));
        agg[`album_${aKey}_complete`] = (played.length >= aTracks.length && aTracks.length > 0) ? 1 : 0;
      });
    }

    let changed = false;
    let earnedXp = 0;
    const now = Date.now();

    for (const [key, rule] of Object.entries(this.dict)) {
      if (rule.seasonal && ((rule.seasonal.start && now < rule.seasonal.start) || (rule.seasonal.end && now > rule.seasonal.end) || (rule.seasonal.months && !rule.seasonal.months.includes(new Date().getMonth())))) continue;

      if (rule.type === 'static' && !this.unlocked[key]) {
        if (rule.trigger.conditions.every(c => this._evalCondition({ ...c, target: c.target }, agg))) {
          this.unlocked[key] = now; earnedXp += rule.reward.xp; changed = true;
          this._notifyUnlock(rule.ui.name, rule.ui.icon, rule.reward.xp);
        }
      } else if (rule.type === 'scalable') {
        let lvl = 1, safety = 50;
        while (this.unlocked[`${key}_${lvl}`]) lvl++;
        
        // Строгое ограничение цикла математикой, чтобы не повесить браузер
        while (safety-- > 0 && (!rule.scaling.maxLevel || lvl <= rule.scaling.maxLevel) && (!rule.scaling.steps || lvl <= rule.scaling.steps.length)) {
          const tgt = this._getSc(rule, lvl, false);
          if (rule.trigger.conditions.every(c => this._evalCondition({ ...c, target: tgt }, agg))) {
            this.unlocked[`${key}_${lvl}`] = now;
            const xp = this._getSc(rule, lvl, true);
            earnedXp += xp; changed = true;
            this._notifyUnlock(rule.ui.name.replace('{level}', lvl), rule.ui.icon, xp);
            lvl++;
          } else break;
        }
      }
    }

    this.lastAgg = agg;
    if (changed) {
      this.profile.xp += earnedXp;
      const newLevel = Math.floor(Math.sqrt(this.profile.xp / 100)) + 1;
      if (newLevel > this.profile.level) {
        this.profile.level = newLevel;
        setTimeout(() => window.NotificationSystem?.success(`🎉 ПОЗДРАВЛЯЕМ! Ваш уровень повышен до ${newLevel}!`), 2000);
      }
      await Promise.all([metaDB.setGlobal('unlocked_achievements', this.unlocked), metaDB.setGlobal('user_profile_rpg', this.profile)]);
      this.achievements = this._buildUIArray();
      this.broadcast(agg.streak);
    }
  }

  _buildUIArray() {
    const arr = [];
    const agg = this.lastAgg || {};
    
    // Универсальный билдер (спасает 40 строк копипасты)
    const add = (id, r, lvl, unl, uAt, cur, tgt) => {
      const t = r.formatters?.target_hours ? r.formatters.target_hours(tgt) : tgt;
      const c = r.formatters?.target_hours ? r.formatters.target_hours(cur) : cur;
      const isHid = !unl && r.hidden;
      
      arr.push({
        id,
        name: lvl ? r.ui.name.replace('{level}', lvl) : (isHid ? "Секретное достижение" : r.ui.name),
        short: isHid ? "Откроется при особых условиях" : r.ui.short.replace(/{target[a-z_]*}/g, t),
        desc: isHid ? "Продолжайте исследовать приложение, чтобы узнать секрет." : r.ui.desc,
        howTo: isHid ? "Скрыто" : r.ui.howTo,
        icon: isHid ? "🔒" : r.ui.icon,
        color: isHid || (!unl && lvl) ? "#888888" : r.ui.color,
        isUnlocked: unl,
        isHidden: isHid,
        unlockedAt: uAt || null,
        xpReward: lvl ? this._getSc(r, lvl, true) : (r.reward.xp || 0),
        ...(!unl && !isHid && tgt && { progress: { current: c, target: t, pct: Math.min(100, Math.max(0, (c / t) * 100)) } })
      });
    };

    for (const [k, r] of Object.entries(this.dict)) {
      if (r.type === 'static') {
        add(k, r, null, !!this.unlocked[k], this.unlocked[k], agg[r.trigger.conditions[0].metric] || 0, r.trigger.conditions[0].target);
      } else if (r.type === 'scalable') {
        let lvl = 1;
        while (this.unlocked[`${k}_${lvl}`]) {
          add(`${k}_${lvl}`, r, lvl, true, this.unlocked[`${k}_${lvl}`], 0, this._getSc(r, lvl, false));
          lvl++;
        }
        if ((!r.scaling.maxLevel || lvl <= r.scaling.maxLevel) && (!r.scaling.steps || lvl <= r.scaling.steps.length)) {
          add(`${k}_${lvl}`, r, lvl, false, null, agg[r.trigger.conditions[0].metric] || 0, this._getSc(r, lvl, false));
        }
      }
    }
    
    return arr.sort((a, b) => a.isUnlocked === b.isUnlocked ? (b.unlockedAt || 0) - (a.unlockedAt || 0) : (a.isUnlocked ? -1 : 1));
  }

  _notifyUnlock(name, icon, xp) {
    eventLogger.log('ACHIEVEMENT_UNLOCK', null, { name, xp });
    window.NotificationSystem?.success(`🏆 ${icon} Открыто: ${name} (+${xp} XP)`);
  }

  broadcast(streak) {
    window.dispatchEvent(new CustomEvent('achievements:updated', { 
      detail: { 
        total: this.achievements.length, unlocked: Object.keys(this.unlocked).length, 
        items: this.unlocked, streak, profile: this.profile 
      } 
    }));
  }
}
