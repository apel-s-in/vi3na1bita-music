// UID.004_(Stats as cache)_(ачивки должны опираться на агрегаты/event truth, а не на UI)_(achievement engine остаётся отдельным геймификационным слоем)
// UID.051_(Collection state)_(подготовить future связь achievements и collectible progress)_(часть track mastery/badges позже может подмешиваться как условия/визуал)
// UID.052_(Track badges and completion)_(не смешивать badge truth и unlock truth)_(achievement engine отвечает за unlock/XP, collection engine — за per-track completion)
// UID.063_(Profile recs tab upgrade)_(позже использовать achievements как мягкий recommendation signal)_(например rediscovery/collection-driven recs, но без логики внутри engine)
// UID.068_(Public playlist analytics)_(подготовить future social achievements)_(playlist/share/community unlocks могут появиться additively)
// UID.094_(No-paralysis rule)_(ачивки не должны зависеть от intel-слоя)_(semantic/community/provider achievements только optional extensions)
import { metaDB } from './meta-db.js';
import { eventLogger } from './event-logger.js';
import { AchievementDictionary } from './achievements-dict.js';

export class AchievementEngine {
  constructor() {
    this.dict = { ...AchievementDictionary };
    this.unlocked = {}; this.profile = { xp: 0, level: 1 };
    this.achievements = []; this.lastAgg = {};
    this._initBoot();
    window.addEventListener('stats:updated', () => this.check());
  }

  async _initBoot() {
    const [unData, profData] = await Promise.all([metaDB.getGlobal('unlocked_achievements'), metaDB.getGlobal('user_profile_rpg')]);
    this.unlocked = unData?.value || {}; this.profile = profData?.value || { xp: 0, level: 1 };
    try {
      const d = window.Utils?.fetchCache?.getJson ? await window.Utils.fetchCache.getJson({ key: 'custom:achievements:v1', url: './data/custom_achievements.json', ttlMs: 43200000, store: 'session', fetchInit: { cache: 'force-cache' } }) : await fetch('./data/custom_achievements.json', { cache: 'force-cache' }).then(r => r.ok ? r.json() : null);
      if (d && typeof d === 'object') Object.assign(this.dict, d);
    } catch {}

    (window.albumsIndex || []).forEach(a => {
      if (!a.key.startsWith('__')) this.dict[`album_complete_${a.key}`] = { id: `album_complete_${a.key}`, type: "static", category: "albums", ui: { name: `Альбом «${a.title}»`, short: `Послушайте все треки альбома.`, desc: `Соберите полные прослушивания всех треков релиза.`, howTo: `Зайдите в альбом и слушайте без пропусков.`, icon: "💿", color: "#4caf50" }, reward: { xp: 150, tier: 3 }, trigger: { conditions: [{ metric: `album_${a.key}_complete`, operator: "gte", target: 1 }] } };
    });

    this.achievements = this._buildUIArray();
    this.broadcast(0);
    if (window.TrackRegistry?.ensurePopulated) await window.TrackRegistry.ensurePopulated();
    await this.check();
  }

  _evalCondition(c, agg) { const v = agg[c.metric] || 0; return c.operator === 'gte' ? v >= c.target : v === c.target; }
  _getSc(r, lvl, isXp) { if (isXp) return Math.floor(r.reward.xpBase * Math.pow(r.reward.xpMultiplier, lvl - 1)); const s = r.scaling; return s.math === 'custom' ? (s.steps[lvl - 1] || s.steps[s.steps.length - 1]) : r.trigger.conditions[0].startTarget * Math.pow(s.factor, lvl - 1); }

  async check() {
    const statsArr = await metaDB.getAllStats(), gStat = statsArr.find(s => s.uid === 'global')?.featuresUsed || {};
    const trStats = statsArr.filter(s => s.uid !== 'global'), strk = (await metaDB.getGlobal('global_streak'))?.value?.current || 0;
    const favCount = window.FavoritesManager ? window.FavoritesManager.getSnapshot().filter(i => !i.inactiveAt).length : 0;

    const agg = trStats.reduce((a, b) => {
      const f = b.featuresUsed || {}; a.validPlays += b.globalValidListenCount || 0; a.fullPlays += b.globalFullListenCount || 0; a.totalSec += b.globalListenSeconds || 0;
      if (b.globalValidListenCount > 0) a.uniqueTracks++;
      a.maxOneTrackFull = Math.max(a.maxOneTrackFull, b.globalFullListenCount || 0);
      ['lyrics', 'nightPlay', 'earlyPlay', 'hiQuality', 'shufflePlay'].forEach(k => a[['featLyrics','nightPlays','earlyPlays','hiPlays','shufflePlays'][['lyrics','nightPlay','earlyPlay','hiQuality','shufflePlay'].indexOf(k)]] += f[k] || 0);
      return a;
    }, { validPlays: 0, fullPlays: 0, totalSec: 0, uniqueTracks: 0, maxOneTrackFull: 0, featLyrics: 0, nightPlays: 0, earlyPlays: 0, hiPlays: 0, shufflePlays: 0, favCount, streak: strk, play11_11: gStat.play_11_11 || 0, weekendPlays: gStat.weekend_play || 0, backups: gStat.backup || 0, pwaInstalled: gStat.pwa_installed || 0, sleepTimerTriggers: gStat.sleep_timer || 0, socialVisits: gStat.social_visit || 0, socialVisitAll: gStat.social_visit_all || 0, favOrderedCombo: gStat.fav_ordered_5 || 0, favShuffleCombo: gStat.fav_shuffle_5 || 0, midnightTriple: gStat.midnight_triple || 0, speedRunnerCombo: gStat.speed_runner || 0 });

    if (window.TrackRegistry) {
      const allReg = window.TrackRegistry.getAllUids().map(u => window.TrackRegistry.getTrackByUid(u)), playedUids = new Set(trStats.filter(s => s.globalFullListenCount > 0).map(s => s.uid));
      new Set(allReg.map(t => t.sourceAlbum).filter(Boolean)).forEach(aKey => {
        const aT = allReg.filter(t => t.sourceAlbum === aKey);
        agg[`album_${aKey}_complete`] = (aT.filter(t => playedUids.has(t.uid)).length >= aT.length && aT.length > 0) ? 1 : 0;
      });
    }

    let chg = false, eXp = 0, now = Date.now();
    for (const [k, r] of Object.entries(this.dict)) {
      if (r.seasonal && ((r.seasonal.start && now < r.seasonal.start) || (r.seasonal.end && now > r.seasonal.end) || (r.seasonal.months && !r.seasonal.months.includes(new Date().getMonth())))) continue;
      if (r.type === 'static' && !this.unlocked[k]) {
        if (r.trigger.conditions.every(c => this._evalCondition({ ...c, target: c.target }, agg))) { this.unlocked[k] = now; eXp += r.reward.xp; chg = true; this._notifyUnlock(r.ui.name, r.ui.icon, r.reward.xp); }
      } else if (r.type === 'scalable') {
        let lvl = 1, sft = 50; while (this.unlocked[`${k}_${lvl}`]) lvl++;
        while (sft-- > 0 && (!r.scaling.maxLevel || lvl <= r.scaling.maxLevel) && (!r.scaling.steps || lvl <= r.scaling.steps.length)) {
          if (r.trigger.conditions.every(c => this._evalCondition({ ...c, target: this._getSc(r, lvl, false) }, agg))) {
            this.unlocked[`${k}_${lvl}`] = now; const xp = this._getSc(r, lvl, true); eXp += xp; chg = true;
            this._notifyUnlock(r.ui.name.replace('{level}', lvl), r.ui.icon, xp); lvl++;
          } else break;
        }
      }
    }

    this.lastAgg = agg;
    if (chg) {
      this.profile.xp += eXp; const nLvl = Math.floor(Math.sqrt(this.profile.xp / 100)) + 1;
      if (nLvl > this.profile.level) { this.profile.level = nLvl; setTimeout(() => window.NotificationSystem?.success(`🎉 ПОЗДРАВЛЯЕМ! Ваш уровень повышен до ${nLvl}!`), 2000); }
      await Promise.all([metaDB.setGlobal('unlocked_achievements', this.unlocked), metaDB.setGlobal('user_profile_rpg', this.profile)]);
    }
    this.achievements = this._buildUIArray(); this.broadcast(agg.streak);
  }

  _buildUIArray() {
    const arr = [], agg = this.lastAgg || {}, lv = window.liveStatsTracker?.getSnapshot?.() || null;
    const add = (id, r, lvl, unl, uAt, c, t) => {
      const rC = Number(c || 0), rT = Number(t || 0), isH = !unl && r.hidden;
      let eC = rC, pct = rT > 0 ? Math.min(100, Math.max(0, (rC / rT) * 100)) : 0, pM = null;
      if (!unl && !isH && rT > 0) {
        if (r.id === 'time_total') { eC = Number(lv?.projectedTotalSec || rC); pct = rT > 0 ? Math.min(100, Math.max(0, (eC / rT) * 100)) : 0; pM = { kind: 'time_accum', live: true, toggleableTimer: true, remainingMs: Math.max(0, (rT - eC) * 1000), elapsedMs: Math.max(0, eC * 1000), targetMs: rT * 1000, currentRaw: eC, targetRaw: rT }; }
        else if (r.id === 'streak_base') { eC = Number(lv?.projectedStreak || rC); pct = rT > 0 ? Math.min(100, Math.max(0, (eC / rT) * 100)) : 0; pM = { kind: 'streak_days', live: true, toggleableTimer: true, remainingDays: Math.max(0, rT - eC), elapsedDays: eC, targetDays: rT, currentRaw: eC, targetRaw: rT, hasTodayPersistent: !!lv?.hasTodayPersistent, wouldCountToday: !!lv?.wouldCountToday }; }
        else pM = { kind: 'count', live: false, toggleableTimer: false, currentRaw: rC, targetRaw: rT };
      }
      const vC = r.formatters?.target_hours ? r.formatters.target_hours(eC) : eC, vT = r.formatters?.target_hours ? r.formatters.target_hours(rT) : rT;
      arr.push({ id, name: lvl ? r.ui.name.replace('{level}', lvl) : (isH ? 'Секретное достижение' : r.ui.name), short: isH ? 'Откроется при особых условиях' : r.ui.short.replace(/{target[a-z_]*}/g, vT), desc: isH ? 'Продолжайте исследовать приложение, чтобы узнать секрет.' : r.ui.desc, howTo: isH ? 'Скрыто' : r.ui.howTo, icon: isH ? '🔒' : r.ui.icon, color: isH || (!unl && lvl) ? '#888888' : r.ui.color, isUnlocked: unl, isHidden: isH, unlockedAt: uAt || null, xpReward: lvl ? this._getSc(r, lvl, true) : (r.reward.xp || 0), ...(!unl && !isH && rT > 0 && { progress: { current: vC, target: vT, pct } }), ...(pM && { progressMeta: pM }) });
    };
    for (const [k, r] of Object.entries(this.dict)) {
      if (r.type === 'static') add(k, r, null, !!this.unlocked[k], this.unlocked[k], agg[r.trigger.conditions[0].metric] || 0, r.trigger.conditions[0].target);
      else if (r.type === 'scalable') {
        let l = 1; while (this.unlocked[`${k}_${l}`]) { add(`${k}_${l}`, r, l, true, this.unlocked[`${k}_${l}`], 0, this._getSc(r, l, false)); l++; }
        if ((!r.scaling.maxLevel || l <= r.scaling.maxLevel) && (!r.scaling.steps || l <= r.scaling.steps.length)) add(`${k}_${l}`, r, l, false, null, agg[r.trigger.conditions[0].metric] || 0, this._getSc(r, l, false));
      }
    }
    return arr.sort((a, b) => a.isUnlocked === b.isUnlocked ? (b.unlockedAt || 0) - (a.unlockedAt || 0) : (a.isUnlocked ? -1 : 1));
  }
  _notifyUnlock(name, icon, xp) { eventLogger.log('ACHIEVEMENT_UNLOCK', null, { name, xp }); window.NotificationSystem?.success(`🏆 ${icon} Открыто: ${name} (+${xp} XP)`); }
  broadcast(streak) { window.dispatchEvent(new CustomEvent('achievements:updated', { detail: { total: this.achievements.length, unlocked: Object.keys(this.unlocked).length, items: this.unlocked, streak, profile: this.profile } })); }
}
