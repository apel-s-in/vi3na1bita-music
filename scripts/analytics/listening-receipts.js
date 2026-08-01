// Server-observed listening receipts.
// Режим наград задаёт сервер; клиент никогда не управляет playback.
import { getSocialServerBackoffState, requestSocialAction } from '../core/social-session.js';
import { getDeviceContext, getDeviceId } from '../core/device-context.js';
import { buildPlaybackFencePayload } from './playback-fence.js';
import { applyShardRewardResult } from '../app/shards/reward-notifier.js';
const HEARTBEAT_MS = 20000;
const STATUS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const COMPLETION_OUTBOX_KEY = 'listeningReceipts:completionOutbox:v1';
const COMPLETION_OUTBOX_LIMIT = 100;
const COMPLETION_OUTBOX_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const safe = value => String(value == null ? '' : value).trim();
const networkAllowed = () => window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine;
const parseJson = (raw, fallback) => {
  try {
    return JSON.parse(raw || '');
  } catch {
    return fallback;
  }
};
const currentYandexId = () => safe(window.YandexAuth?.getProfile?.()?.yandexId || window.YandexAuth?.getProfile?.()?.id);
const currentDeviceId = () => getDeviceId();
const ownershipFields = () => buildPlaybackFencePayload({
  grant: window.PlaybackOwnership?.getGrant?.(),
  deviceId: currentDeviceId()
});
const ownershipFieldsForTrack = trackUid => {
  const uid = safe(trackUid);
  const grant = window.PlaybackOwnership?.getGrant?.();
  if (!grant || safe(grant.trackUid) !== uid) return null;
  const fields = buildPlaybackFencePayload({ grant, deviceId: currentDeviceId() });
  return fields.logicalSessionId && fields.ownerEpoch > 0 && fields.fencingToken && fields.trackVersion ? fields : null;
};
const readCompletionOutbox = () => {
  const rows = parseJson(localStorage.getItem(COMPLETION_OUTBOX_KEY), []);
  if (!Array.isArray(rows)) return [];
  const cutoff = Date.now() - COMPLETION_OUTBOX_TTL_MS;
  const valid = rows.filter(item => item?.sessionId && item?.payload?.sessionId && (!Number(item.queuedAt) || Number(item.queuedAt) >= cutoff));
  if (valid.length !== rows.length) {
    try {
      localStorage.setItem(COMPLETION_OUTBOX_KEY, JSON.stringify(valid.slice(-COMPLETION_OUTBOX_LIMIT)));
    } catch {}
  }
  return valid;
};
const writeCompletionOutbox = rows => {
  try {
    localStorage.setItem(COMPLETION_OUTBOX_KEY, JSON.stringify((Array.isArray(rows) ? rows : []).slice(-COMPLETION_OUTBOX_LIMIT)));
  } catch {}
};
const isTerminalCompletionError = error => {
  const status = Number(error?.status || 0);
  const message = safe(error?.message);
  return [400, 404, 409, 410].includes(status) && /(listen_session_(not_found|not_completable|expired)|playback_(owner_changed|fence_|grant_required))/.test(message);
};
class ListeningReceiptService {
  constructor() {
    this.session = null;
    this.timer = 0;
    this.chain = Promise.resolve();
    this.initialized = false;
    this.lastProgress = null;
    this.lastLoyalty = null;
    this.rewardCatalog = [];
    this.flushingOutbox = null;
    this.pendingFeatures = new Map();
    this.sleepTimer = null;
    this.heartbeatPending = null;
    this.statusRefreshTimer = 0;
    this.statusPending = null;
    this.lastStatusResult = null;
    this.lastStatusAt = 0;
  }
  resetServerState(reason = 'auth_reset') {
    this.lastProgress = null;
    this.lastLoyalty = null;
    this.rewardCatalog = [];
    this.lastStatusResult = null;
    this.lastStatusAt = 0;
    this.pendingFeatures.clear();
    this.sleepTimer = null;
    this.emit(reason, null);
  }
  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    window.addEventListener('player:play', event => this.enqueue(() => this.start(event.detail || {})));
    const finish = reason => {
      const snapshot = this.snapshot();
      this.enqueue(() => this.complete(reason, snapshot));
    };
    window.addEventListener('player:pause', () => finish('pause'));
    window.addEventListener('player:stop', () => finish('stop'));
    window.addEventListener('player:ended', () => {
      const duration = Math.max(0, Number(window.playerCore?.getDuration?.() || 0));
      const snapshot = this.snapshot({ position: duration });
      this.enqueue(() => this.complete('ended', snapshot));
    });
    window.addEventListener('player:trackChanged', event => {
      const nextUid = safe(event.detail?.uid);
      if (this.session?.trackUid && nextUid && this.session.trackUid !== nextUid) {
        const snapshot = this.snapshot();
        this.enqueue(() => this.complete('track_changed', snapshot));
      }
    });
    window.addEventListener('yandex:auth:changed', event => {
      if (event.detail?.status !== 'active') {
        this.stageCurrentCompletion('auth_lost', this.snapshot());
        this.resetServerState('auth_lost');
        return;
      }
      this.enqueue(async () => {
        await this.flushCompletionOutbox().catch(() => null);
        await this.refreshStatus().catch(() => null);
        if (window.playerCore?.isPlaying?.()) {
          await this.start({ uid: window.playerCore?.getCurrentTrackUid?.(), duration: window.playerCore?.getDuration?.(), type: 'audio' });
        }
      });
    });
    window.addEventListener('account:data-switching', () => {
      this.stageCurrentCompletion('account_switch', this.snapshot());
      this.resetServerState('account_switch');
    });
    window.addEventListener('account:data-switched', () => {
      this.enqueue(async () => {
        await this.flushCompletionOutbox().catch(() => null);
        if (window.playerCore?.isPlaying?.()) {
          await this.start({ uid: window.playerCore?.getCurrentTrackUid?.(), duration: window.playerCore?.getDuration?.(), type: 'audio' });
        }
      });
    });
    window.addEventListener('playback:ownership-updated', () => {
      if (!this.session && window.playerCore?.isPlaying?.()) {
        this.enqueue(() => this.start({ uid: window.playerCore?.getCurrentTrackUid?.(), duration: window.playerCore?.getDuration?.(), type: 'audio' }));
      }
    });
    window.addEventListener('playback:ownership-lost', () => {
      this.abandonCurrentSession('ownership_transfer');
    });
    window.addEventListener('online', () => {
      this.enqueue(async () => {
        await this.flushCompletionOutbox().catch(() => null);
        if (!this.session && window.playerCore?.isPlaying?.()) {
          await this.start({ uid: window.playerCore?.getCurrentTrackUid?.(), duration: window.playerCore?.getDuration?.(), type: 'audio' });
        }
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (this.session) {
        this.scheduleHeartbeat();
      }
    });
    if (window.YandexAuth?.getSessionStatus?.() === 'active') {
      this.refreshStatus().catch(() => null);
    }
  }
  enqueue(task) {
    this.chain = this.chain
      .catch(() => null)
      .then(() => task())
      .catch(() => null);
    return this.chain;
  }
  isAuthorized() {
    return window.YandexAuth?.getSessionStatus?.() === 'active' && window.YandexAuth?.isTokenAlive?.();
  }
  snapshot(extra = {}) {
    const player = window.playerCore;
    const device = getDeviceContext();
    return { position: Math.max(0, Number(player?.getPosition?.() || 0)), visibility: document.visibilityState || 'visible', platform: device.platform, timezone: device.timezone, timezoneOffsetMin: device.timezoneOffsetMin, quality: safe(player?.qMode || ''), muted: !!player?.isMuted?.(), volume: Number(player?.getVolume?.() ?? 100), ...extra };
  }
  abandonCurrentSession(reason = 'ownership_transfer') {
    const current = this.session;
    this.clearTimer();
    this.session = null;
    if (current?.sessionId) this.emit(reason, null);
    return current;
  }
  stageCurrentCompletion(reason = 'unknown', finalSnapshot = null) {
    const current = this.session;
    if (!current?.sessionId) {
      this.clearTimer();
      return null;
    }
    const payload = this.snapshot({ ...(finalSnapshot || {}), ...ownershipFields(), sessionId: current.sessionId, deviceId: current.deviceId || currentDeviceId(), reason: safe(reason) });
    const ownerYandexId = safe(current.ownerYandexId || currentYandexId());
    const outbox = readCompletionOutbox();
    const existing = outbox.find(item => item.sessionId === current.sessionId);
    if (!existing) {
      outbox.push({ id: `listen_complete_${current.sessionId}`, sessionId: current.sessionId, trackUid: current.trackUid, ownerYandexId, payload, queuedAt: Date.now(), attempts: 0 });
      writeCompletionOutbox(outbox);
    }
    this.clearTimer();
    this.session = null;
    this.emit('completion_staged', null);
    return payload;
  }
  applyServerProgressToCatalog(progress) {
    const totalSec = Number(progress?.totalSec);
    if (!Number.isFinite(totalSec)) return;
    this.rewardCatalog = this.rewardCatalog.map(item => {
      if (item?.metric !== 'totalSec') return item;
      const target = Math.max(0, Number(item.target || 0));
      const offset = Math.max(0, Number(item.progressOffset || 0));
      const cumulativeTarget = Math.max(target, Number(item.cumulativeTarget || target));
      return { ...item, current: Math.max(0, Math.min(target, totalSec - offset)), eligible: totalSec >= cumulativeTarget };
    });
  }
  ingestServerResult(result) {
    if (result?.playback) {
      window.PlaybackOwnership?.updateLease?.(result.playback);
    }
    if (result?.progress) {
      const confirmedListeningStats = result.progress.confirmedListeningStats || this.lastProgress?.confirmedListeningStats || null;
      this.lastProgress = { ...(this.lastProgress || {}), ...result.progress, ...(confirmedListeningStats ? { confirmedListeningStats } : {}) };
      this.applyServerProgressToCatalog(this.lastProgress);
    }
    if (result?.loyalty) {
      this.lastLoyalty = { ...result.loyalty };
    }
    const fullCatalog = result?.catalog?.rewardItems;
    if (Array.isArray(fullCatalog)) {
      this.rewardCatalog = fullCatalog.map(item => ({ ...item }));
    } else if (Array.isArray(result?.rewardItems)) {
      const merged = new Map(this.rewardCatalog.map(item => [safe(item?.id), item]));
      result.rewardItems.forEach(item => {
        const id = safe(item?.id);
        if (id) merged.set(id, { ...item });
      });
      this.rewardCatalog = [...merged.values()];
    }
    const grants = Array.isArray(result?.rewards) ? result.rewards : [];
    if (grants.length) {
      const awarded = new Map(grants.map(item => [safe(item.achievementId), item]));
      this.rewardCatalog = this.rewardCatalog.map(item => {
        const grant = awarded.get(safe(item?.id));
        return grant ? { ...item, eligible: true, awarded: true, awardedAt: Date.now(), amount: Number(grant.amount || item.amount || 0) } : item;
      });
    }
    return result;
  }
  scheduleStatusRefresh(delayMs = STATUS_MAX_AGE_MS) {
    clearTimeout(this.statusRefreshTimer);
    this.statusRefreshTimer = setTimeout(() => {
      this.statusRefreshTimer = 0;
      if (!document.hidden) this.refreshStatus().catch(() => null);
    }, Math.max(10000, Number(delayMs) || 60000));
  }
  applyCompletionResult(result) {
    this.ingestServerResult(result);
    applyShardRewardResult(result);
    this.emit('completed', result);
    // Completion уже содержит свежий progress. Полный reward catalog
    // обновляется один раз после серии быстрых переходов.
    this.scheduleStatusRefresh();
    return result;
  }
  async flushCompletionOutbox() {
    if (!this.isAuthorized() || !networkAllowed()) return null;
    if (this.flushingOutbox) {
      return this.flushingOutbox;
    }
    const ownerYandexId = currentYandexId();
    this.flushingOutbox = (async () => {
      let lastResult = null;
      while (true) {
        const outbox = readCompletionOutbox();
        const item = outbox.find(row => safe(row.ownerYandexId) === ownerYandexId);
        if (!item) break;
        const attempts = Number(item.attempts || 0) + 1;
        writeCompletionOutbox(outbox.map(row => (row.id === item.id ? { ...row, attempts, lastAttemptAt: Date.now() } : row)));
        let result;
        try {
          result = await requestSocialAction('listen_session_complete', item.payload);
        } catch (error) {
          if (!isTerminalCompletionError(error)) {
            throw error;
          }
          writeCompletionOutbox(readCompletionOutbox().filter(row => row.id !== item.id));
          this.emit('completion_discarded', { error: safe(error?.message), sessionId: item.sessionId });
          continue;
        }
        writeCompletionOutbox(readCompletionOutbox().filter(row => row.id !== item.id));
        lastResult = this.applyCompletionResult(result);
      }
      return lastResult;
    })().finally(() => {
      this.flushingOutbox = null;
    });
    return this.flushingOutbox;
  }
  async start(detail = {}) {
    if (!this.isAuthorized() || !networkAllowed()) return null;
    // Старые completion отправляются best-effort. Временная ошибка
    // не должна блокировать новую listening session текущего трека.
    await this.flushCompletionOutbox().catch(() => null);
    const trackUid = safe(detail.uid || window.playerCore?.getCurrentTrackUid?.());
    if (!trackUid) return null;
    const fence = ownershipFieldsForTrack(trackUid);
    if (!fence) return null;
    if (this.session?.trackUid === trackUid && this.session?.sessionId) {
      this.startTimer();
      return this.session;
    }
    if (this.session?.sessionId) {
      // stageCurrentCompletion уже переносит старую session в durable
      // outbox. Временная ошибка отправки не должна блокировать
      // создание session для нового трека.
      await this.complete('replaced').catch(() => null);
    }
    const result = await requestSocialAction(
      'listen_session_start',
      this.snapshot({
        ...fence,
        trackUid,
        deviceId: currentDeviceId(),
        variant: safe(detail.type || 'audio'),
        timezoneOffsetMin: getDeviceContext().timezoneOffsetMin,
        shuffle: !!window.playerCore?.isShuffle?.(),
        favoritesOnly: localStorage.getItem('favoritesOnlyMode') === '1',
        favoriteAtStart: !!window.playerCore?.isFavorite?.(trackUid)
      })
    );
    if (!result?.session?.sessionId) return null;
    this.session = { sessionId: safe(result.session.sessionId), deviceId: safe(result.session.deviceId || currentDeviceId()), trackUid, ownerYandexId: currentYandexId() };
    this.startTimer();
    await this.flushPendingFeatures().catch(() => null);
    this.emit('started', result);
    return this.session;
  }
  async heartbeat() {
    if (!this.session?.sessionId || !this.isAuthorized() || !networkAllowed()) return null;
    const result = await requestSocialAction('listen_session_heartbeat', this.snapshot({ ...ownershipFields(), sessionId: this.session.sessionId, deviceId: this.session.deviceId || currentDeviceId() }));
    this.ingestServerResult(result);
    applyShardRewardResult(result);
    if (result?.accepted) {
      await this.flushPendingFeatures().catch(() => null);
    }
    this.emit('heartbeat', result);
    return result;
  }
  async complete(reason = 'unknown', finalSnapshot = null) {
    const payload = this.stageCurrentCompletion(reason, finalSnapshot);
    if (!payload) return null;
    return this.flushCompletionOutbox();
  }
  recordFeature(feature, { trackUid = '' } = {}) {
    const name = safe(feature);
    const uid = safe(trackUid || window.playerCore?.getCurrentTrackUid?.());
    if (!name || !uid) return null;
    this.pendingFeatures.set(`${name}:${uid}`, { feature: name, trackUid: uid, queuedAt: Date.now() });
    this.enqueue(() => this.flushPendingFeatures());
    return true;
  }
  async flushPendingFeatures() {
    if (!this.session?.sessionId || !this.isAuthorized() || !networkAllowed()) return null;
    const item = [...this.pendingFeatures.values()].find(row => row.trackUid === this.session.trackUid);
    if (!item) return null;
    const result = await requestSocialAction('music_feature_use', { ...ownershipFields(), feature: item.feature, sessionId: this.session.sessionId, trackUid: item.trackUid, deviceId: currentDeviceId() });
    this.pendingFeatures.delete(`${item.feature}:${item.trackUid}`);
    this.ingestServerResult(result);
    applyShardRewardResult(result);
    this.scheduleStatusRefresh();
    this.emit('feature', result);
    return result;
  }
  startSleepTimer({ minutes, targetAt = 0, mode = 'minutes' } = {}) {
    const requestedMinutes = Math.max(1, Math.min(720, Math.floor(Number(minutes) || 0)));
    const previous = this.sleepTimer;
    const timer = { timerId: `sleep_${crypto.randomUUID()}`, deviceId: currentDeviceId(), requestedMinutes, targetAt: Number(targetAt || 0), mode: safe(mode || 'minutes'), ownerYandexId: currentYandexId() };
    this.sleepTimer = timer;
    this.enqueue(async () => {
      if (previous?.timerId) {
        await requestSocialAction('sleep_timer_cancel', { timerId: previous.timerId, deviceId: previous.deviceId, reason: 'replaced' }).catch(() => null);
      }
      const result = await requestSocialAction('sleep_timer_start', { timerId: timer.timerId, deviceId: timer.deviceId, requestedMinutes: timer.requestedMinutes, targetAt: timer.targetAt, mode: timer.mode });
      this.emit('sleep_timer_started', result);
      return result;
    });
    return { ...timer };
  }
  cancelSleepTimer(reason = 'user_cancel') {
    const timer = this.sleepTimer;
    this.sleepTimer = null;
    if (!timer?.timerId) return null;
    this.enqueue(async () => {
      const result = await requestSocialAction('sleep_timer_cancel', { timerId: timer.timerId, deviceId: timer.deviceId, reason: safe(reason) });
      this.emit('sleep_timer_canceled', result);
      return result;
    });
    return { ...timer };
  }
  completeSleepTimer() {
    const timer = this.sleepTimer;
    if (!timer?.timerId) return null;
    this.enqueue(async () => {
      const result = await requestSocialAction('sleep_timer_complete', { timerId: timer.timerId, deviceId: timer.deviceId });
      if (this.sleepTimer?.timerId === timer.timerId) {
        this.sleepTimer = null;
      }
      this.ingestServerResult(result);
      applyShardRewardResult(result);
      this.scheduleStatusRefresh();
      this.emit('sleep_timer_completed', result);
      return result;
    });
    return { ...timer };
  }
  getSleepTimerReceiptState() {
    return this.sleepTimer ? { ...this.sleepTimer } : null;
  }
  async refreshStatus({ force = false, maxAgeMs = STATUS_MAX_AGE_MS } = {}) {
    if (!this.isAuthorized() || !networkAllowed()) return null;
    if (!force && this.lastStatusResult && Date.now() - this.lastStatusAt < Math.max(10000, Number(maxAgeMs) || 60000)) {
      return this.lastStatusResult;
    }
    if (this.statusPending) return this.statusPending;
    this.statusPending = requestSocialAction('achievement_reward_status', {})
      .then(result => {
        this.ingestServerResult(result);
        applyShardRewardResult(result);
        this.lastStatusResult = result;
        this.lastStatusAt = Date.now();
        this.emit('status', result);
        return result;
      })
      .finally(() => {
        this.statusPending = null;
      });
    return this.statusPending;
  }
  getCompletionOutboxSnapshot() {
    const ownerYandexId = currentYandexId();
    return readCompletionOutbox().map(item => ({ ...item, belongsToCurrentAccount: safe(item.ownerYandexId) === ownerYandexId, ageMs: Math.max(0, Date.now() - Number(item.queuedAt || Date.now())), payload: { ...item.payload } }));
  }
  getRewardCatalog() {
    return this.rewardCatalog.map(item => ({ ...item }));
  }
  scheduleHeartbeat() {
    if (this.heartbeatPending || !this.session?.sessionId || !window.playerCore?.isPlaying?.() || getSocialServerBackoffState().active) {
      return this.heartbeatPending;
    }
    this.heartbeatPending = this.enqueue(() => this.heartbeat()).finally(() => {
      this.heartbeatPending = null;
    });
    return this.heartbeatPending;
  }
  startTimer() {
    this.clearTimer();
    this.timer = setInterval(() => {
      if (!this.session || !window.playerCore?.isPlaying?.()) return;
      this.scheduleHeartbeat();
    }, HEARTBEAT_MS);
  }
  clearTimer() {
    clearInterval(this.timer);
    this.timer = 0;
  }
  emit(reason, result) {
    window.dispatchEvent(new CustomEvent('listening-receipts:updated', { detail: { reason, shadow: result?.shadow !== false, session: this.session ? { ...this.session } : null, progress: result?.progress || this.lastProgress || null, receipt: result?.receipt || null } }));
  }
}
export const listeningReceiptService = new ListeningReceiptService();
window.ListeningReceipts = listeningReceiptService;
export default listeningReceiptService;
