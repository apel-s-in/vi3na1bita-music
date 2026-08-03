// Account-aware server mirror Избранного.
// Не управляет playback и не перестраивает playing playlist.
import {
  getSocialServerBackoffState,
  requestSocialAction
} from '../core/social-session.js';
import { applyShardRewardResult } from '../app/shards/reward-notifier.js';
import { favoriteSignature, localToRemote, remoteToLocal } from './favorite-state-contract.js';
const OUTBOX_KEY = 'favoriteMirror:outbox:v1';
const REVISION_KEY = 'favoriteMirror:revision:v1';
const DIRTY_FLUSH_MS = 15000;
const REMOTE_MAX_AGE_MS = 10 * 60 * 1000;
const safe = value => String(value == null ? '' : value).trim();
const parse = (raw, fallback) => {
  try {
    return JSON.parse(raw || '');
  } catch {
    return fallback;
  }
};
const networkAllowed = () => window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine;
const localSnapshot = () => (window.FavoritesManager?.getSnapshot?.() || []).map(localToRemote).filter(Boolean);
const readOutbox = () => {
  const rows = parse(localStorage.getItem(OUTBOX_KEY), []);
  return Array.isArray(rows) ? rows.filter(item => item?.uid && item?.mutationId) : [];
};
const writeOutbox = rows => {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify((Array.isArray(rows) ? rows : []).slice(-200)));
  } catch {}
};
class FavoriteMirrorService {
  constructor() {
    this.initialized = false;
    this.syncing = null;
    this.timer = 0;
    this.retryTimer = 0;
    this.lastLocal = new Map();
    this.serverRevision = 0;
    this.lastRemoteAt = 0;
    this.remoteOwner = '';
  }
  isAuthorized() {
    return window.YandexAuth?.getSessionStatus?.() === 'active' && window.YandexAuth?.isTokenAlive?.();
  }
  deferForServerBackoff(task) {
    const backoff =
      getSocialServerBackoffState();

    if (!backoff.active) return false;

    clearTimeout(this.retryTimer);

    if (!document.hidden) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = 0;
        task().catch(() => null);
      }, backoff.remainingMs + 500);
    }

    return true;
  }
  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.captureBaseline();
    window.addEventListener('backup:domain-dirty', event => {
      if (event.detail?.domain !== 'favorites' || window.__favoriteMirrorApplying) return;
      this.captureLocalChanges();
      this.scheduleFlush();
    });
    window.addEventListener('account:data-switching', () => {
      this.stopPolling();
      this.lastLocal.clear();
      this.lastRemoteAt = 0;
      this.remoteOwner = '';
    });
    window.addEventListener('account:data-switched', () => {
      this.captureBaseline();
      this.sync({ bootstrap: true }).catch(() => null);
    });
    window.addEventListener('yandex:auth:changed', event => {
      if (event.detail?.status !== 'active') {
        this.stopPolling();
        this.lastLocal.clear();
        return;
      }
      setTimeout(() => {
        this.captureBaseline();
        this.sync({ bootstrap: true }).catch(() => null);
      }, 250);
    });
    window.addEventListener('online', () => {
      if (document.hidden) return;
      if (readOutbox().length) this.scheduleFlush(1000);
      else if (!this.remoteIsFresh()) this.sync().catch(() => null);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopPolling();
        return;
      }
      if (!this.isAuthorized()) return;
      if (readOutbox().length) this.scheduleFlush(1000);
      else if (!this.remoteIsFresh()) this.sync().catch(() => null);
    });
    window.addEventListener('listening-receipts:updated', () => {
      if (readOutbox().length) this.scheduleFlush(1000);
    });
    if (this.isAuthorized()) {
      this.sync({ bootstrap: true }).catch(() => null);
    }
  }
  scheduleFlush(delayMs = DIRTY_FLUSH_MS) {
    if (!readOutbox().length) return false;
    clearTimeout(this.timer);
    if (document.hidden) return false;
    this.timer = setTimeout(() => {
      this.timer = 0;
      this.flush().catch(() => null);
    }, Math.max(1000, Number(delayMs) || DIRTY_FLUSH_MS));
    return true;
  }
  captureBaseline() {
    this.lastLocal = new Map(localSnapshot().map(item => [item.uid, favoriteSignature(item)]));
  }
  captureLocalChanges() {
    const current = localSnapshot();
    const currentMap = new Map(current.map(item => [item.uid, item]));
    const changed = current.filter(item => this.lastLocal.get(item.uid) !== favoriteSignature(item));
    for (const uid of this.lastLocal.keys()) {
      if (currentMap.has(uid)) continue;
      changed.push({ uid, album: '', status: 'deleted', addedAt: 0, updatedAt: Date.now(), inactiveAt: 0, deletedAt: Date.now() });
    }
    if (changed.length) {
      const outbox = readOutbox();
      const byUid = new Map(outbox.map(item => [item.uid, item]));
      changed.forEach(item => {
        byUid.set(item.uid, { uid: item.uid, status: item.status, mutationId: `fav_${crypto.randomUUID()}`, queuedAt: Date.now() });
      });
      writeOutbox([...byUid.values()]);
    }
    this.lastLocal = new Map(current.map(item => [item.uid, favoriteSignature(item)]));
  }
  currentOwner() {
    return safe(window.YandexAuth?.getProfile?.()?.yandexId || window.YandexAuth?.getProfile?.()?.id);
  }
  rememberRemote(state) {
    if (!state) return;
    this.serverRevision = Number(state.revision || 0);
    this.lastRemoteAt = Date.now();
    this.remoteOwner = this.currentOwner();
  }
  remoteIsFresh() {
    return !!this.remoteOwner && this.remoteOwner === this.currentOwner() && Date.now() - this.lastRemoteAt < REMOTE_MAX_AGE_MS;
  }
  async bootstrap() {
    const result = await requestSocialAction('favorite_state_reconcile', { items: localSnapshot() });
    this.rememberRemote(result?.state);
    return result;
  }
  async getRemote() {
    const result = await requestSocialAction('favorite_state_get', {});
    this.rememberRemote(result?.state);
    return result;
  }
  applyRemote(state, reason = 'server_sync') {
    if (!state || readOutbox().length) return false;
    window.__favoriteMirrorApplying = true;
    try {
      window.FavoritesManager?.replaceSnapshot?.(remoteToLocal(state), { reason });
      this.serverRevision = Number(state.revision || 0);
      localStorage.setItem(REVISION_KEY, String(this.serverRevision));
      this.updateVisibleStars(state);
      this.captureBaseline();
      window.dispatchEvent(new CustomEvent('favorites:mirror-applied', { detail: { reason, count: Array.isArray(state.items) ? state.items.length : 0, revision: this.serverRevision } }));
      window.dispatchEvent(new CustomEvent('favorites:updated', { detail: { reason, source: 'server_mirror', revision: this.serverRevision } }));
      return true;
    } finally {
      window.__favoriteMirrorApplying = false;
    }
  }
  updateVisibleStars(state) {
    const active = new Set((state.items || []).filter(item => item.status === 'active').map(item => safe(item.uid)));
    document.querySelectorAll('.like-star[data-uid]').forEach(element => {
      const uid = safe(element.dataset.uid);
      window.IconUtils?.setFavoriteStarState?.(element, active.has(uid));
    });
    window.PlayerUI?.updateMiniHeader?.();
    window.PlayerUI?.updatePlaylistFiltering?.();
  }
  async flush() {
    if (!this.isAuthorized() || !networkAllowed()) {
      return false;
    }

    if (
      this.deferForServerBackoff(() =>
        this.flush()
      )
    ) {
      return false;
    }

    if (this.syncing) return this.syncing;
    this.syncing = (async () => {
      let outbox = readOutbox();
      let latestState = null;
      while (outbox.length) {
        const item = outbox[0];
        const result = await requestSocialAction('favorite_state_mutate', { uid: item.uid, status: item.status, mutationId: item.mutationId, deviceId: localStorage.getItem('deviceStableId') || localStorage.getItem('deviceHash') || 'web' });
        applyShardRewardResult(result);
        latestState = result?.state || latestState;
        outbox = readOutbox().filter(row => row.mutationId !== item.mutationId);
        writeOutbox(outbox);
      }
      if (latestState) this.applyRemote(latestState, 'favorite_outbox_flushed');
      return true;
    })().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }
  async sync({ bootstrap = false } = {}) {
    if (!this.isAuthorized() || !networkAllowed()) {
      return false;
    }

    if (
      this.deferForServerBackoff(() =>
        this.sync({ bootstrap })
      )
    ) {
      return false;
    }

    this.captureLocalChanges();

    if (readOutbox().length) {
      return this.flush();
    }

    if (this.remoteIsFresh()) return false;
    if (this.syncing) return this.syncing;

    this.syncing = (async () => {
      let remote = await this.getRemote();

      if (
        bootstrap &&
        Number(remote?.state?.revision || 0) === 0 &&
        !(remote?.state?.items || []).length
      ) {
        remote = await this.bootstrap();
      }

      this.applyRemote(
        remote?.state,
        bootstrap
          ? 'favorite_bootstrap'
          : 'favorite_poll'
      );
      return true;
    })().finally(() => {
      this.syncing = null;
    });

    return this.syncing;
  }
  stopPolling() {
    clearTimeout(this.timer);
    clearTimeout(this.retryTimer);
    this.timer = 0;
    this.retryTimer = 0;
  }
}
export const favoriteMirrorService = new FavoriteMirrorService();
window.FavoriteMirror = favoriteMirrorService;
export default favoriteMirrorService;
