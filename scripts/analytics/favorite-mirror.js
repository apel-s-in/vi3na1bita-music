// Account-aware server mirror Избранного.
// Не управляет playback и не перестраивает playing playlist.

import { requestSocialAction } from '../core/social-session.js';
import {
  favoriteSignature,
  localToRemote,
  remoteToLocal
} from './favorite-state-contract.js';

const OUTBOX_KEY = 'favoriteMirror:outbox:v1';
const REVISION_KEY = 'favoriteMirror:revision:v1';
const POLL_MS = 60000;

const safe = value =>
  String(value == null ? '' : value).trim();

const parse = (raw, fallback) => {
  try {
    return JSON.parse(raw || '');
  } catch {
    return fallback;
  }
};

const networkAllowed = () =>
  window.NetPolicy?.isNetworkAllowed?.() ??
  navigator.onLine;

const localSnapshot = () =>
  (window.FavoritesManager?.getSnapshot?.() || [])
    .map(localToRemote)
    .filter(Boolean);

const readOutbox = () => {
  const rows = parse(
    localStorage.getItem(OUTBOX_KEY),
    []
  );

  return Array.isArray(rows)
    ? rows.filter(item =>
        item?.uid &&
        item?.mutationId
      )
    : [];
};

const writeOutbox = rows => {
  try {
    localStorage.setItem(
      OUTBOX_KEY,
      JSON.stringify(
        (Array.isArray(rows) ? rows : [])
          .slice(-200)
      )
    );
  } catch {}
};

class FavoriteMirrorService {
  constructor() {
    this.initialized = false;
    this.syncing = null;
    this.timer = 0;
    this.lastLocal = new Map();
    this.serverRevision = 0;
  }

  isAuthorized() {
    return (
      window.YandexAuth?.getSessionStatus?.() === 'active' &&
      window.YandexAuth?.isTokenAlive?.()
    );
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;

    this.captureBaseline();

    window.addEventListener(
      'backup:domain-dirty',
      event => {
        if (event.detail?.domain !== 'favorites') return;
        if (window.__favoriteMirrorApplying) return;

        this.captureLocalChanges();
        this.flush().catch(() => null);
      }
    );

    window.addEventListener(
      'account:data-switching',
      () => {
        this.stopPolling();
        this.lastLocal.clear();
      }
    );

    window.addEventListener(
      'account:data-switched',
      () => {
        this.captureBaseline();
        this.sync({ bootstrap: true })
          .catch(() => null);
      }
    );

    window.addEventListener(
      'yandex:auth:changed',
      event => {
        if (event.detail?.status !== 'active') {
          this.stopPolling();
          this.lastLocal.clear();
          return;
        }

        setTimeout(() => {
          this.captureBaseline();
          this.sync({ bootstrap: true })
            .catch(() => null);
        }, 250);
      }
    );

    window.addEventListener(
      'online',
      () => this.flush().catch(() => null)
    );

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          this.stopPolling();
          return;
        }

        if (this.isAuthorized()) {
          this.sync().catch(() => null);
          this.startPolling();
        }
      }
    );

    if (this.isAuthorized()) {
      this.sync({ bootstrap: true })
        .catch(() => null);
    }
  }

  captureBaseline() {
    this.lastLocal = new Map(
      localSnapshot().map(item => [
        item.uid,
        favoriteSignature(item)
      ])
    );
  }

  captureLocalChanges() {
    const current = localSnapshot();
    const currentMap = new Map(
      current.map(item => [item.uid, item])
    );

    const changed = current.filter(item =>
      this.lastLocal.get(item.uid) !==
      favoriteSignature(item)
    );

    for (const uid of this.lastLocal.keys()) {
      if (currentMap.has(uid)) continue;

      changed.push({
        uid,
        album: '',
        status: 'deleted',
        addedAt: 0,
        updatedAt: Date.now(),
        inactiveAt: 0,
        deletedAt: Date.now()
      });
    }

    if (changed.length) {
      const outbox = readOutbox();
      const byUid = new Map(
        outbox.map(item => [item.uid, item])
      );

      changed.forEach(item => {
        byUid.set(item.uid, {
          uid: item.uid,
          status: item.status,
          mutationId: `fav_${crypto.randomUUID()}`,
          queuedAt: Date.now()
        });
      });

      writeOutbox([...byUid.values()]);
    }

    this.lastLocal = new Map(
      current.map(item => [
        item.uid,
        signature(item)
      ])
    );
  }

  async bootstrap() {
    const result = await requestSocialAction(
      'favorite_state_reconcile',
      {
        items: localSnapshot()
      }
    );

    if (result?.state) {
      this.serverRevision = Number(
        result.state.revision || 0
      );
    }

    return result;
  }

  async getRemote() {
    const result = await requestSocialAction(
      'favorite_state_get',
      {}
    );

    if (result?.state) {
      this.serverRevision = Number(
        result.state.revision || 0
      );
    }

    return result;
  }

  applyRemote(state, reason = 'server_sync') {
    if (!state || readOutbox().length) return false;

    window.__favoriteMirrorApplying = true;

    try {
      window.FavoritesManager?.replaceSnapshot?.(
        remoteToLocal(state),
        { reason }
      );

      this.serverRevision = Number(
        state.revision || 0
      );

      localStorage.setItem(
        REVISION_KEY,
        String(this.serverRevision)
      );

      this.updateVisibleStars(state);
      this.captureBaseline();

      window.dispatchEvent(new CustomEvent(
        'favorites:updated',
        {
          detail: {
            reason,
            source: 'server_mirror',
            revision: this.serverRevision
          }
        }
      ));

      return true;
    } finally {
      window.__favoriteMirrorApplying = false;
    }
  }

  updateVisibleStars(state) {
    const active = new Set(
      (state.items || [])
        .filter(item => item.status === 'active')
        .map(item => safe(item.uid))
    );

    document
      .querySelectorAll('.like-star[data-uid]')
      .forEach(element => {
        const uid = safe(element.dataset.uid);

        window.IconUtils?.setFavoriteStarState?.(
          element,
          active.has(uid)
        );
      });

    window.PlayerUI?.updateMiniHeader?.();
    window.PlayerUI?.updatePlaylistFiltering?.();
  }

  async flush() {
    if (
      !this.isAuthorized() ||
      !networkAllowed()
    ) {
      return false;
    }

    if (this.syncing) return this.syncing;

    this.syncing = (async () => {
      let outbox = readOutbox();

      while (outbox.length) {
        const item = outbox[0];

        const result = await requestSocialAction(
          'favorite_state_mutate',
          {
            uid: item.uid,
            status: item.status,
            mutationId: item.mutationId
          }
        );

        if (
          result?.wallet ||
          (Array.isArray(result?.rewards) &&
            result.rewards.length)
        ) {
          window.ShardWallet
            ?.refresh?.({ force: true })
            .catch(() => null);
        }

        if (Array.isArray(result?.rewards) &&
            result.rewards.length) {
          const amount = result.rewards.reduce(
            (sum, reward) =>
              sum + Number(reward?.amount || 0),
            0
          );

          window.NotificationSystem?.success?.(
            `♦ Начислено ${amount} Осколков`
          );
        }

        outbox = readOutbox()
          .filter(row =>
            row.mutationId !== item.mutationId
          );

        writeOutbox(outbox);
      }

      const remote = await this.getRemote();
      this.applyRemote(
        remote?.state,
        'favorite_outbox_flushed'
      );

      this.startPolling();
      return true;
    })().finally(() => {
      this.syncing = null;
    });

    return this.syncing;
  }

  async sync({ bootstrap = false } = {}) {
    if (
      !this.isAuthorized() ||
      !networkAllowed()
    ) {
      return false;
    }

    this.captureLocalChanges();

    if (readOutbox().length) {
      return this.flush();
    }

    let remote = await this.getRemote();

    if (
      bootstrap &&
      Number(remote?.state?.revision || 0) === 0 &&
      !(remote?.state?.items || []).length
    ) {
      await this.bootstrap();
      remote = await this.getRemote();
    }

    this.applyRemote(
      remote?.state,
      bootstrap
        ? 'favorite_bootstrap'
        : 'favorite_poll'
    );

    this.startPolling();
    return true;
  }

  startPolling() {
    this.stopPolling();

    if (
      document.hidden ||
      !this.isAuthorized()
    ) return;

    this.timer = setInterval(() => {
      if (
        document.hidden ||
        !this.isAuthorized() ||
        !networkAllowed()
      ) return;

      this.sync().catch(() => null);
    }, POLL_MS);
  }

  stopPolling() {
    clearInterval(this.timer);
    this.timer = 0;
  }
}

export const favoriteMirrorService =
  new FavoriteMirrorService();

window.FavoriteMirror = favoriteMirrorService;

export default favoriteMirrorService;
