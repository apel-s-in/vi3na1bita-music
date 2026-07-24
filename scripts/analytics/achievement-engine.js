// UID.004_(Stats as cache)_(ачивки должны опираться на агрегаты/event truth, а не на UI)_(achievement engine остаётся отдельным геймификационным слоем) UID.051_(Collection state)_(подготовить future связь achievements и collectible progress)_(часть track mastery/badges позже может подмешиваться как условия/визуал) UID.052_(Track badges and completion)_(не смешивать badge truth и unlock truth)_(achievement engine отвечает за unlock/XP, collection engine — за per-track completion) UID.063_(Profile recs tab upgrade)_(позже использовать achievements как мягкий recommendation signal)_(например rediscovery/collection-driven recs, но без логики внутри engine) UID.068_(Public playlist analytics)_(подготовить future social achievements)_(playlist/share/community unlocks могут появиться additively) UID.094_(No-paralysis rule)_(ачивки не должны зависеть от intel-слоя)_(semantic/community/provider achievements только optional extensions)
import { metaDB } from './meta-db.js';
import { eventLogger } from './event-logger.js';
import { AchievementDictionary } from './achievements-dict.js';
import { normalizeAchievementUnlockMeta, normalizeAchievementUnlockMetaRow } from './achievement-state.js';

export class AchievementEngine {
  constructor() {
    this.dict = { ...AchievementDictionary };
    this.unlocked = {}; this.unlockMeta = {}; this.profile = { xp: 0, level: 1 };
    this.achievements = []; this.lastAgg = {}; this._checking = false; this._checkAgain = false; this._silentNotify = false;
    window.addEventListener('stats:updated', () => this.check());
    window.addEventListener('listening-receipts:updated', () => {
      this.achievements = this._buildUIArray();
      this.broadcast(this.lastAgg?.streak || 0);
    });
  }

  async _initBoot() {
    const [unData, metaData, profData] = await Promise.all([metaDB.getGlobal('unlocked_achievements'), metaDB.getGlobal('achievement_unlock_meta'), metaDB.getGlobal('user_profile_rpg')]);
    this.unlocked = unData?.value || {}; this.unlockMeta = normalizeAchievementUnlockMeta(metaData?.value || {}, this.unlocked); this.profile = profData?.value || { xp: 0, level: 1 };
    try {
      const d = await window.Utils.fetchCache.getJson({ key: 'custom:achievements:v1', url: './data/custom_achievements.json', ttlMs: 43200000, store: 'session', fetchInit: { cache: 'force-cache' } });
      if (d && typeof d === 'object') Object.assign(this.dict, d);
    } catch {}

    (window.albumsIndex || []).filter(a => !a.key.startsWith('__')).forEach(a => {
      this.dict[`album_complete_${a.key}`] = { id: `album_complete_${a.key}`, type: "static", category: "albums", ui: { name: `Альбом «${a.title}»`, short: `Послушайте все треки альбома.`, desc: `Соберите полные прослушивания всех треков релиза.`, howTo: `Зайдите в альбом и слушайте без пропусков.`, icon: "💿", color: "#4caf50" }, reward: { xp: 150, tier: 3 }, trigger: { conditions: [{ metric: `album_${a.key}_complete`, operator: "gte", target: 1 }] } };
    });

    this.achievements = this._buildUIArray(); this.broadcast(0);
    if (window.TrackRegistry?.ensurePopulated) await window.TrackRegistry.ensurePopulated();
    await this.check();
  }

  _evalCondition(c, agg) { const v = agg[c.metric] || 0; return c.operator === 'gte' ? v >= c.target : v === c.target; }
  _getSc(r, lvl, isXp) { if (isXp) return Math.floor(r.reward.xpBase * Math.pow(r.reward.xpMultiplier, lvl - 1)); const s = r.scaling; return s.math === 'custom' ? (s.steps[lvl - 1] ?? s.steps[s.steps.length - 1]) : r.trigger.conditions[0].startTarget * Math.pow(s.factor, lvl - 1); }

  async check({ force = false, reason = '' } = {}) {
    if (window._isRestoring && !force) return;
    if (this._checking) {
      this._checkAgain = true;
      return;
    }
    this._checking = true;
    try {
    const statsArr = await metaDB.getAllStats(), gStat = statsArr.find(s => s.uid === 'global')?.featuresUsed || {};
    const trStats = statsArr.filter(s => s.uid !== 'global'), strk = (await metaDB.getGlobal('global_streak'))?.value?.current || 0;
    const favCount = window.FavoritesManager ? window.FavoritesManager.getSnapshot().filter(i => !i.inactiveAt && !i.deletedAt).length : 0;

    const agg = trStats.reduce((a, b) => {
      const f = b.featuresUsed || {}; a.validPlays += b.globalValidListenCount || 0; a.fullPlays += b.globalFullListenCount || 0; a.totalSec += b.globalListenSeconds || 0;
      if (b.globalValidListenCount > 0) a.uniqueTracks++;
      a.maxOneTrackFull = Math.max(a.maxOneTrackFull, b.globalFullListenCount || 0);
      ['lyrics', 'nightPlay', 'earlyPlay', 'hiQuality', 'shufflePlay'].forEach((k, i) => a[['featLyrics','nightPlays','earlyPlays','hiPlays','shufflePlays'][i]] += f[k] || 0);
      return a;
    }, { validPlays: 0, fullPlays: 0, totalSec: 0, uniqueTracks: 0, maxOneTrackFull: 0, featLyrics: 0, nightPlays: 0, earlyPlays: 0, hiPlays: 0, shufflePlays: 0, favCount, streak: strk, play11_11: gStat.play_11_11 || 0, weekendPlays: gStat.weekend_play || 0, backups: gStat.backup || 0, pwaInstalled: gStat.pwa_installed || 0, sleepTimerTriggers: gStat.sleep_timer || 0, socialVisitAll: gStat.social_visit_all || 0, favOrderedCombo: gStat.fav_ordered_5 || 0, favShuffleCombo: gStat.fav_shuffle_5 || 0, midnightTriple: gStat.midnight_triple || 0, speedRunnerCombo: gStat.speed_runner || 0 });

    if (window.TrackRegistry) {
      const allReg = window.TrackRegistry.getAllUids().map(u => window.TrackRegistry.getTrackByUid(u)), playedUids = new Set(trStats.filter(s => s.globalFullListenCount > 0).map(s => s.uid));
      new Set(allReg.map(t => t.sourceAlbum).filter(Boolean)).forEach(aKey => { const aT = allReg.filter(t => t.sourceAlbum === aKey); agg[`album_${aKey}_complete`] = (aT.filter(t => playedUids.has(t.uid)).length >= aT.length && aT.length > 0) ? 1 : 0; });
    }

    let chg = false, now = Date.now();
    const unlock = (id, name, icon) => {
      this.unlocked[id] = now;
      const ev = this._notifyUnlock(name, icon, id);
      this.unlockMeta[id] = normalizeAchievementUnlockMetaRow(id, {
        unlockedAt: now,
        eventId: ev?.eventId,
        sessionId: ev?.sessionId,
        deviceStableId: ev?.deviceStableId,
        deviceHash: ev?.deviceHash,
        deviceLabel: ev?.deviceLabel,
        deviceClass: ev?.deviceClass,
        devicePwa: ev?.devicePwa,
        platform: ev?.platform,
        source: 'achievement_engine'
      });
    };
    for (const [k, r] of Object.entries(this.dict)) {
      if (r.seasonal && ((r.seasonal.start && now < r.seasonal.start) || (r.seasonal.end && now > r.seasonal.end) || (r.seasonal.months && !r.seasonal.months.includes(new Date().getMonth())))) continue;
      if (r.type === 'static' && !this.unlocked[k]) {
        if (r.trigger.conditions.every(c => this._evalCondition({ ...c, target: c.target }, agg))) { unlock(k, r.ui.name, r.ui.icon); chg = true; }
      } else if (r.type === 'scalable') {
        let lvl = 1, sft = 50; while (this.unlocked[`${k}_${lvl}`]) lvl++;
        while (sft-- > 0 && (!r.scaling.maxLevel || lvl <= r.scaling.maxLevel) && (!r.scaling.steps || lvl <= r.scaling.steps.length)) {
          if (r.trigger.conditions.every(c => this._evalCondition({ ...c, target: this._getSc(r, lvl, false) }, agg))) { const id = `${k}_${lvl}`; unlock(id, r.ui.name.replace('{level}', lvl), r.ui.icon); chg = true; lvl++; } else break;
        }
      }
    }

    this.lastAgg = agg;
    if (chg) {
      await Promise.all([
        metaDB.setGlobal(
          'unlocked_achievements',
          this.unlocked
        ),
        metaDB.setGlobal(
          'achievement_unlock_meta',
          this.unlockMeta
        )
      ]);

      window.ListeningReceipts
        ?.refreshStatus?.()
        .catch(() => null);

      try {
        window.dispatchEvent(new CustomEvent(
          'backup:domain-dirty',
          {
            detail: {
              domain: 'achievements',
              immediate: true
            }
          }
        ));
      } catch {}
    }
    this.achievements = this._buildUIArray();
    this.broadcast(agg.streak, { reason });
    } finally {
      this._checking = false;

      if (this._checkAgain) {
        this._checkAgain = false;
        queueMicrotask(() =>
          this.check({ reason: 'coalesced_update' })
        );
      }
    }
  }

  async hydrateFromStorage({ forceCheck = true, silent = true, reason = 'hydrate' } = {}) {
    const [unData, metaData, profData] = await Promise.all([
      metaDB.getGlobal('unlocked_achievements'),
      metaDB.getGlobal('achievement_unlock_meta'),
      metaDB.getGlobal('user_profile_rpg')
    ]);

    this.unlocked = unData?.value || {};
    this.unlockMeta = normalizeAchievementUnlockMeta(
      metaData?.value || {},
      this.unlocked
    );
    this.profile = profData?.value || { xp: 0, level: 1 };

    if (forceCheck) {
      const old = this._silentNotify;
      this._silentNotify = !!silent;

      try {
        await this.check({ force: true, reason });
      } finally {
        this._silentNotify = old;
      }
    } else {
      this.achievements = this._buildUIArray();
      this.broadcast(0, { reason });
    }

    return true;
  }
  _getServerReward(id) {
    return window.ListeningReceipts
      ?.getRewardCatalog?.()
      .find(item =>
        String(item?.id || '') === String(id || '')
      ) || null;
  }

  _buildUIArray() {
    const arr = [], agg = this.lastAgg || {}, lv = window.liveStatsTracker?.getSnapshot?.() || null;
    const add = (id, r, lvl, localUnlocked, unlockedAt, current, target) => {
      const reward = this._getServerReward(id);
      const rewardEligible = reward?.eligible === true;
      const rewardAwarded = reward?.awarded === true;
      const completed = !!localUnlocked || rewardEligible || rewardAwarded;
      const legacyAmount = lvl
        ? this._getSc(r, lvl, true)
        : Number(r.reward?.xp || 0);
      const shardReward = Number(reward?.amount ?? legacyAmount);
      const rawCurrent = Number(
        reward?.current ?? current ?? 0
      );
      const rawTarget = Number(
        reward?.target ?? target ?? 0
      );
      const hidden = !completed && !!r.hidden;
      let effectiveCurrent = rawCurrent;
      let pct = rawTarget > 0
        ? Math.min(100, Math.max(0, (rawCurrent / rawTarget) * 100))
        : 0;
      let progressMeta = null;

      if (!completed && !hidden && rawTarget > 0) {
        if (r.id === 'time_total') {
          effectiveCurrent = Number(lv?.projectedTotalSec || rawCurrent);
          pct = Math.min(100, Math.max(0, (effectiveCurrent / rawTarget) * 100));
          progressMeta = {
            kind: 'time_accum',
            live: true,
            toggleableTimer: true,
            remainingMs: Math.max(0, (rawTarget - effectiveCurrent) * 1000),
            elapsedMs: Math.max(0, effectiveCurrent * 1000),
            targetMs: rawTarget * 1000,
            currentRaw: effectiveCurrent,
            targetRaw: rawTarget
          };
        } else if (r.id === 'streak_base') {
          effectiveCurrent = Number(lv?.projectedStreak || rawCurrent);
          pct = Math.min(100, Math.max(0, (effectiveCurrent / rawTarget) * 100));
          progressMeta = {
            kind: 'streak_days',
            live: true,
            toggleableTimer: true,
            remainingDays: Math.max(0, rawTarget - effectiveCurrent),
            elapsedDays: effectiveCurrent,
            targetDays: rawTarget,
            currentRaw: effectiveCurrent,
            targetRaw: rawTarget,
            hasTodayPersistent: !!lv?.hasTodayPersistent,
            wouldCountToday: !!lv?.wouldCountToday
          };
        } else {
          progressMeta = {
            kind: 'count',
            live: false,
            toggleableTimer: false,
            currentRaw: rawCurrent,
            targetRaw: rawTarget
          };
        }
      }

      const visibleCurrent = r.formatters?.target_hours
        ? r.formatters.target_hours(effectiveCurrent)
        : effectiveCurrent;
      const visibleTarget = r.formatters?.target_hours
        ? r.formatters.target_hours(rawTarget)
        : rawTarget;

      arr.push({
        id,
        name: lvl
          ? r.ui.name.replace('{level}', lvl)
          : hidden
            ? 'Секретное достижение'
            : r.ui.name,
        short: hidden
          ? 'Откроется при особых условиях'
          : r.ui.short.replace(/{target[a-z_]*}/g, visibleTarget),
        desc: hidden
          ? 'Продолжайте исследовать приложение, чтобы узнать секрет.'
          : r.ui.desc,
        howTo: hidden ? 'Скрыто' : r.ui.howTo,
        icon: hidden ? '🔒' : r.ui.icon,
        color: hidden || (!completed && lvl) ? '#888888' : r.ui.color,
        isUnlocked: completed,
        localUnlocked: !!localUnlocked,
        serverCompleted: rewardEligible || rewardAwarded,
        isHidden: hidden,
        isSecret: !!r.hidden || r.category === 'secret',
        unlockedAt: unlockedAt || null,
        unlockMeta: this.unlockMeta?.[id] || null,
        shardReward,
        rewardEligible,
        rewardAwarded,
        rewardsEnabled: reward?.rewardsEnabled === true,
        hasServerReward: !!reward,
        rewardStatus: rewardAwarded
          ? 'awarded'
          : rewardEligible
            ? 'verified'
            : localUnlocked
              ? 'local_completed'
              : 'available',
        ...(!completed && !hidden && rawTarget > 0 && {
          progress: {
            current: visibleCurrent,
            target: visibleTarget,
            pct
          }
        }),
        ...(progressMeta && { progressMeta })
      });
    };
    for (const [k, r] of Object.entries(this.dict)) {
      if (r.type === 'static') add(k, r, null, !!this.unlocked[k], this.unlocked[k], agg[r.trigger.conditions[0].metric] || 0, r.trigger.conditions[0].target);
      else if (r.type === 'scalable') {
        let level = 1;

        while (true) {
          const id = `${k}_${level}`;
          const reward = this._getServerReward(id);
          const localUnlocked = !!this.unlocked[id];
          const serverCompleted =
            reward?.eligible === true ||
            reward?.awarded === true;

          if (!localUnlocked && !serverCompleted) break;

          add(
            id,
            r,
            level,
            localUnlocked,
            this.unlocked[id] || null,
            Number(reward?.current || 0),
            this._getSc(r, level, false)
          );

          level++;
        }

        if (
          (!r.scaling.maxLevel || level <= r.scaling.maxLevel) &&
          (!r.scaling.steps || level <= r.scaling.steps.length)
        ) {
          add(
            `${k}_${level}`,
            r,
            level,
            false,
            null,
            agg[r.trigger.conditions[0].metric] || 0,
            this._getSc(r, level, false)
          );
        }
      }
    }
    return arr.sort((a, b) => a.isUnlocked === b.isUnlocked ? (b.unlockedAt || 0) - (a.unlockedAt || 0) : (a.isUnlocked ? -1 : 1));
  }
  _notifyUnlock(name, icon, id = '') {
    const reward = this._getServerReward(id);
    const ev = eventLogger.log(
      'ACHIEVEMENT_UNLOCK',
      null,
      {
        id,
        name,
        icon,
        rewardCurrency: 'shards',
        rewardStatus: reward
          ? 'server_pending'
          : 'validator_pending'
      }
    );

    if (!this._silentNotify) {
      window.NotificationSystem?.success(
        reward
          ? `🏆 ${icon} Открыто: ${name}. Проверяем награду ${reward.amount} ♦`
          : `🏆 ${icon} Открыто: ${name}`
      );
    }

    return ev;
  }
  getCompletedCount() {
    return this.achievements.reduce(
      (count, item) => count + (item?.isUnlocked ? 1 : 0),
      0
    );
  }

  getSnapshotDetail(streak = this.lastAgg?.streak || 0, extra = {}) {
    return {
      total: this.achievements.length,
      unlocked: this.getCompletedCount(),
      localUnlocked: Object.keys(this.unlocked || {}).length,
      items: this.unlocked || {},
      unlockMeta: this.unlockMeta || {},
      streak: Number(streak || 0),
      profile: this.profile,
      ...extra
    };
  }

  broadcast(streak, extra = {}) {
    window.dispatchEvent(new CustomEvent(
      'achievements:updated',
      {
        detail: this.getSnapshotDetail(streak, extra)
      }
    ));
  }
}
