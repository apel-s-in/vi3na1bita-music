// UID.004_(Stats as cache)_(ачивки должны опираться на агрегаты/event truth, а не на UI)_(achievement engine остаётся отдельным геймификационным слоем) UID.051_(Collection state)_(подготовить future связь achievements и collectible progress)_(часть track mastery/badges позже может подмешиваться как условия/визуал) UID.052_(Track badges and completion)_(не смешивать badge truth и unlock truth)_(achievement engine отвечает за unlock/XP, collection engine — за per-track completion) UID.063_(Profile recs tab upgrade)_(позже использовать achievements как мягкий recommendation signal)_(например rediscovery/collection-driven recs, но без логики внутри engine) UID.068_(Public playlist analytics)_(подготовить future social achievements)_(playlist/share/community unlocks могут появиться additively) UID.094_(No-paralysis rule)_(ачивки не должны зависеть от intel-слоя)_(semantic/community/provider achievements только optional extensions)
import { metaDB } from './meta-db.js';
import { AchievementDictionary } from './achievements-dict.js';
import { normalizeAchievementUnlockMeta } from './achievement-state.js';
import { getConfirmedListeningStats } from './confirmed-listening-stats.js';
export class AchievementEngine {
  constructor() {
    this.dict = { ...AchievementDictionary };
    this.unlocked = {};
    this.unlockMeta = {};
    this.profile = { xp: 0, level: 1 };
    this.achievements = [];
    this.lastAgg = {};
    this._checking = false;
    this._checkAgain = false;
    this._silentNotify = false;
    window.addEventListener('stats:updated', () => this.check());
    window.addEventListener('listening-receipts:updated', () => {
      this.achievements = this._buildUIArray();
      this.broadcast(this.lastAgg?.streak || 0);
    });
    window.addEventListener('yandex:auth:changed', event => {
      if (event.detail?.status !== 'active') {
        this.lastAgg = {};
        this.achievements = [];
        this.broadcast(0, { reason: 'achievement_auth_required', authRequired: true });
        return;
      }
      window.ListeningReceipts?.refreshStatus?.().then(() => this.check({ force: true, reason: 'achievement_auth_restored' })).catch(() => null);
    });
    window.addEventListener('account:data-switching', () => {
      this.lastAgg = {};
      this.achievements = [];
      this.broadcast(0, { reason: 'achievement_account_switch', authRequired: true });
    });
  }
  isAuthorized() {
    return window.YandexAuth?.getSessionStatus?.() === 'active' && window.YandexAuth?.isTokenAlive?.();
  }
  async _initBoot() {
    const [unData, metaData, profData] = await Promise.all([metaDB.getGlobal('unlocked_achievements'), metaDB.getGlobal('achievement_unlock_meta'), metaDB.getGlobal('user_profile_rpg')]);
    this.unlocked = unData?.value || {};
    this.unlockMeta = normalizeAchievementUnlockMeta(metaData?.value || {}, this.unlocked);
    this.profile = profData?.value || { xp: 0, level: 1 };
    try {
      const d = await window.Utils.fetchCache.getJson({ key: 'custom:achievements:v1', url: './data/custom_achievements.json', ttlMs: 43200000, store: 'session', fetchInit: { cache: 'force-cache' } });
      if (d && typeof d === 'object') Object.assign(this.dict, d);
    } catch {}
    (window.albumsIndex || [])
      .filter(a => !a.key.startsWith('__'))
      .forEach(a => {
        this.dict[`album_complete_${a.key}`] = {
          id: `album_complete_${a.key}`,
          type: 'static',
          category: 'albums',
          ui: { name: `Альбом «${a.title}»`, short: `Послушайте все треки альбома.`, desc: `Соберите полные прослушивания всех треков релиза.`, howTo: `Зайдите в альбом и слушайте без пропусков.`, icon: '💿', color: '#4caf50' },
          reward: { xp: 150, tier: 3 },
          trigger: { conditions: [{ metric: `album_${a.key}_complete`, operator: 'gte', target: 1 }] }
        };
      });
    this.achievements = this._buildUIArray();
    this.broadcast(0);
    if (window.TrackRegistry?.ensurePopulated) await window.TrackRegistry.ensurePopulated();
    await this.check();
  }
  _getSc(r, lvl, isXp) {
    if (isXp) {
      if (Array.isArray(r.reward?.steps)) {
        return Number(r.reward.steps[lvl - 1] ?? r.reward.repeatAmount ?? r.reward.steps[r.reward.steps.length - 1] ?? 0);
      }
      return Math.floor(Number(r.reward?.xpBase || 0) * Math.pow(Number(r.reward?.xpMultiplier || 1), lvl - 1));
    }
    const scaling = r.scaling;
    if (scaling.math === 'custom' && lvl <= scaling.steps.length) {
      return Number(scaling.steps[lvl - 1] || 0);
    }
    if (scaling.math === 'custom' && Number(scaling.repeatAfterLevel) > 0 && Number(scaling.repeatStep) > 0 && lvl > Number(scaling.repeatAfterLevel)) {
      const base = Number(scaling.steps[Number(scaling.repeatAfterLevel) - 1] || 0);
      return base + (lvl - Number(scaling.repeatAfterLevel)) * Number(scaling.repeatStep);
    }
    if (scaling.math === 'custom') {
      return Number(scaling.steps[scaling.steps.length - 1] || 0);
    }
    return r.trigger.conditions[0].startTarget * Math.pow(scaling.factor, lvl - 1);
  }
  _hasScalableLevel(rule, level) {
    if (rule?.scaling?.maxLevel) {
      return level <= Number(rule.scaling.maxLevel);
    }
    if (Number(rule?.scaling?.repeatAfterLevel) > 0) {
      return true;
    }
    return !rule?.scaling?.steps || level <= rule.scaling.steps.length;
  }
  _requiresServerVerification() {
    return true;
  }
  async check({ force = false, reason = '' } = {}) {
    if (window._isRestoring && !force) return;
    if (!this.isAuthorized()) {
      this.lastAgg = {};
      this.achievements = [];
      this.broadcast(0, { reason: reason || 'achievement_auth_required', authRequired: true });
      return;
    }
    if (this._checking) {
      this._checkAgain = true;
      return;
    }

    this._checking = true;
    try {
      const service = window.ListeningReceipts;
      if (service && (force || !service.getRewardCatalog?.().length)) {
        await service.refreshStatus?.().catch(() => null);
      }

      const progress = service?.lastProgress || {};
      this.lastAgg = {
        validPlays: Number(progress.validPlays || 0),
        fullPlays: Number(progress.fullPlays || 0),
        totalSec: Number(progress.totalSec || 0),
        uniqueTracks: Number(progress.uniqueTracks || 0),
        maxOneTrackFull: Number(progress.maxOneTrackFull || 0),
        hiPlays: Number(progress.hiFullPlays || 0),
        earlyPlays: Number(progress.earlyFullPlays || 0),
        nightPlays: Number(progress.nightFullPlays || 0),
        weekendPlays: Number(progress.weekendValidPlays || 0),
        shufflePlays: Number(progress.shuffleFullPlays || 0),
        streak: Number(progress.longestStreak || progress.streak || 0)
      };

      this.achievements = this._buildUIArray();
      this.broadcast(this.lastAgg.streak, {
        reason: reason || 'server_overlay',
        serverConfirmed: true,
        pending: !service?.getRewardCatalog?.().length
      });
    } finally {
      this._checking = false;
      if (this._checkAgain) {
        this._checkAgain = false;
        queueMicrotask(() => this.check({ reason: 'coalesced_update' }));
      }
    }
  }
  async hydrateFromStorage({ forceCheck = true, silent = true, reason = 'hydrate' } = {}) {
    const [unData, metaData, profData] = await Promise.all([metaDB.getGlobal('unlocked_achievements'), metaDB.getGlobal('achievement_unlock_meta'), metaDB.getGlobal('user_profile_rpg')]);
    this.unlocked = unData?.value || {};
    this.unlockMeta = normalizeAchievementUnlockMeta(metaData?.value || {}, this.unlocked);
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
    return window.ListeningReceipts?.getRewardCatalog?.().find(item => String(item?.id || '') === String(id || '')) || null;
  }
  _buildUIArray() {
    if (!this.isAuthorized()) return [];
    const arr = [],
      agg = { ...(this.lastAgg || {}) };
    const confirmed = getConfirmedListeningStats();
    if (confirmed.available) {
      agg.totalSec = confirmed.totalListenMs / 1000;
      agg.validPlays = confirmed.validPlays;
      agg.fullPlays = confirmed.fullPlays;
      agg.uniqueTracks = confirmed.uniqueTracks;
    }
    const add = (id, r, lvl, localUnlocked, unlockedAt, current, target) => {
      const reward = this._getServerReward(id);
      const rewardEligible = reward?.eligible === true;
      const rewardAwarded = reward?.awarded === true;
      const requiresServerVerification = true;
      const completed = rewardEligible || rewardAwarded;
      const shardReward = Math.max(0, Number(reward?.amount || 0));
      const rawCurrent = Math.max(0, Number(reward?.current || 0));
      const rawTarget = Math.max(0, Number(reward?.target || 0));
      const hidden = !completed && !!r.hidden;
      let effectiveCurrent = rawCurrent;
      let pct = rawTarget > 0 ? Math.min(100, Math.max(0, (rawCurrent / rawTarget) * 100)) : 0;
      let progressMeta = null;
      if (!completed && !hidden && rawTarget > 0) {
        if (r.id === 'time_total') {
          effectiveCurrent = rawCurrent;
          pct = Math.min(100, Math.max(0, (effectiveCurrent / rawTarget) * 100));
          progressMeta = { kind: 'time_accum', live: false, serverConfirmed: true, toggleableTimer: false, remainingMs: Math.max(0, (rawTarget - effectiveCurrent) * 1000), elapsedMs: Math.max(0, effectiveCurrent * 1000), targetMs: rawTarget * 1000, currentRaw: effectiveCurrent, targetRaw: rawTarget };
        } else {
          progressMeta = { kind: 'count', live: false, toggleableTimer: false, currentRaw: rawCurrent, targetRaw: rawTarget };
        }
      }
      const visibleCurrent = r.formatters?.target_hours ? r.formatters.target_hours(effectiveCurrent) : effectiveCurrent;
      const visibleTarget = r.formatters?.target_hours ? r.formatters.target_hours(rawTarget) : rawTarget;
      arr.push({
        id,
        name: lvl ? r.ui.name.replace('{level}', lvl) : hidden ? 'Секретное достижение' : r.ui.name,
        short: hidden ? 'Откроется при особых условиях' : r.ui.short.replace(/{target[a-z_]*}/g, visibleTarget),
        desc: hidden ? 'Продолжайте исследовать приложение, чтобы узнать секрет.' : r.ui.desc,
        howTo: hidden ? 'Скрыто' : r.ui.howTo,
        icon: hidden ? '🔒' : r.ui.icon,
        color: hidden || (!completed && lvl) ? '#888888' : r.ui.color,
        isUnlocked: completed,
        localUnlocked: false,
        serverCompleted: rewardEligible || rewardAwarded,
        isHidden: hidden,
        isSecret: !!r.hidden || r.category === 'secret',
        unlockedAt: Number(reward?.awardedAt || 0) || null,
        unlockMeta: reward?.awardedAt ? { id, unlockedAt: Number(reward.awardedAt), source: 'server_wallet' } : null,
        shardReward,
        rewardEligible,
        rewardAwarded,
        rewardsEnabled: reward?.rewardsEnabled === true,
        hasServerReward: !!reward,
        rewardStatus: rewardAwarded ? 'awarded' : rewardEligible ? 'verified' : reward ? 'server_progress' : 'server_catalog_pending',
        ...(!completed && !hidden && rawTarget > 0 && { progress: { current: visibleCurrent, target: visibleTarget, pct } }),
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
          const serverCompleted = reward?.eligible === true || reward?.awarded === true;
          const locallyCompleted = !this._requiresServerVerification(r) && localUnlocked;
          if (!locallyCompleted && !serverCompleted) break;
          add(id, r, level, localUnlocked, this.unlocked[id] || null, Number(reward?.current || 0), this._getSc(r, level, false));
          level++;
        }
        if (this._hasScalableLevel(r, level)) {
          add(`${k}_${level}`, r, level, false, null, agg[r.trigger.conditions[0].metric] || 0, this._getSc(r, level, false));
        }
      }
    }
    return arr.sort((a, b) => (a.isUnlocked === b.isUnlocked ? (b.unlockedAt || 0) - (a.unlockedAt || 0) : a.isUnlocked ? -1 : 1));
  }
  getCompletedCount() {
    return this.achievements.reduce((count, item) => count + (item?.isUnlocked ? 1 : 0), 0);
  }
  getSnapshotDetail(streak = this.lastAgg?.streak || 0, extra = {}) {
    return { total: this.achievements.length, unlocked: this.getCompletedCount(), localUnlocked: Object.keys(this.unlocked || {}).length, items: this.unlocked || {}, unlockMeta: this.unlockMeta || {}, streak: Number(streak || 0), profile: this.profile, ...extra };
  }
  broadcast(streak, extra = {}) {
    window.dispatchEvent(new CustomEvent('achievements:updated', { detail: this.getSnapshotDetail(streak, extra) }));
  }
}
