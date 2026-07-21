// Server-observed listening receipts.
// Shadow mode: не начисляет Осколки и никогда не управляет playback.

import { requestSocialAction } from '../core/social-session.js';

const HEARTBEAT_MS = 15000;

const safe = value =>
  String(value == null ? '' : value).trim();

const platform = () => {
  const info = window.Utils?.getPlatform?.() || {};

  if (info.isIOS) return 'ios';
  if (info.isAndroid) return 'android';
  return 'web';
};

const networkAllowed = () =>
  window.NetPolicy?.isNetworkAllowed?.() ??
  navigator.onLine;

class ListeningReceiptService {
  constructor() {
    this.session = null;
    this.timer = 0;
    this.chain = Promise.resolve();
    this.initialized = false;
    this.lastProgress = null;
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;

    window.addEventListener(
      'player:play',
      event => this.enqueue(() =>
        this.start(event.detail || {})
      )
    );

    window.addEventListener(
      'player:pause',
      () => this.enqueue(() =>
        this.complete('pause')
      )
    );

    window.addEventListener(
      'player:stop',
      () => this.enqueue(() =>
        this.complete('stop')
      )
    );

    window.addEventListener(
      'player:ended',
      () => this.enqueue(() =>
        this.complete('ended')
      )
    );

    window.addEventListener(
      'player:trackChanged',
      event => {
        const nextUid = safe(event.detail?.uid);

        if (
          this.session?.trackUid &&
          nextUid &&
          this.session.trackUid !== nextUid
        ) {
          this.enqueue(() =>
            this.complete('track_changed')
          );
        }
      }
    );

    window.addEventListener(
      'yandex:auth:changed',
      event => {
        if (event.detail?.status !== 'active') {
          this.clearTimer();
          this.session = null;
          return;
        }

        this.refreshStatus().catch(() => null);

        if (window.playerCore?.isPlaying?.()) {
          this.enqueue(() => this.start({
            uid: window.playerCore?.getCurrentTrackUid?.(),
            duration: window.playerCore?.getDuration?.(),
            type: 'audio'
          }));
        }
      }
    );

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden && this.session) {
          this.enqueue(() => this.heartbeat());
        }
      }
    );

    if (
      window.YandexAuth?.getSessionStatus?.() === 'active'
    ) {
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
    return (
      window.YandexAuth?.getSessionStatus?.() === 'active' &&
      window.YandexAuth?.isTokenAlive?.()
    );
  }

  snapshot(extra = {}) {
    const player = window.playerCore;

    return {
      position: Math.max(
        0,
        Number(player?.getPosition?.() || 0)
      ),
      visibility: document.visibilityState || 'visible',
      platform: platform(),
      quality: safe(player?.qMode || ''),
      muted: !!player?.isMuted?.(),
      volume: Number(player?.getVolume?.() ?? 100),
      ...extra
    };
  }

  async start(detail = {}) {
    if (
      !this.isAuthorized() ||
      !networkAllowed()
    ) return null;

    const trackUid = safe(
      detail.uid ||
      window.playerCore?.getCurrentTrackUid?.()
    );

    if (!trackUid) return null;

    if (
      this.session?.trackUid === trackUid &&
      this.session?.sessionId
    ) {
      this.startTimer();
      return this.session;
    }

    if (this.session?.sessionId) {
      await this.complete('replaced');
    }

    const result = await requestSocialAction(
      'listen_session_start',
      this.snapshot({
        trackUid,
        deviceId: safe(
          localStorage.getItem('deviceStableId') ||
          localStorage.getItem('deviceHash') ||
          'web'
        ),
        variant: safe(detail.type || 'audio')
      })
    );

    if (!result?.session?.sessionId) return null;

    this.session = {
      sessionId: safe(result.session.sessionId),
      trackUid
    };

    this.startTimer();
    this.emit('started', result);
    return this.session;
  }

  async heartbeat() {
    if (
      !this.session?.sessionId ||
      !this.isAuthorized() ||
      !networkAllowed()
    ) return null;

    const result = await requestSocialAction(
      'listen_session_heartbeat',
      this.snapshot({
        sessionId: this.session.sessionId
      })
    );

    this.emit('heartbeat', result);
    return result;
  }

  async complete(reason = 'unknown') {
    const current = this.session;

    if (!current?.sessionId) {
      this.clearTimer();
      return null;
    }

    this.clearTimer();
    this.session = null;

    if (
      !this.isAuthorized() ||
      !networkAllowed()
    ) return null;

    const result = await requestSocialAction(
      'listen_session_complete',
      this.snapshot({
        sessionId: current.sessionId,
        reason: safe(reason)
      })
    );

    if (result?.progress) {
      this.lastProgress = result.progress;
    }

    this.emit('completed', result);
    return result;
  }

  async refreshStatus() {
    if (
      !this.isAuthorized() ||
      !networkAllowed()
    ) return null;

    const result = await requestSocialAction(
      'achievement_reward_status',
      {}
    );

    this.lastProgress = result?.progress || null;
    this.emit('status', result);
    return result;
  }

  startTimer() {
    this.clearTimer();

    this.timer = setInterval(() => {
      if (
        !this.session ||
        !window.playerCore?.isPlaying?.()
      ) return;

      this.enqueue(() => this.heartbeat());
    }, HEARTBEAT_MS);
  }

  clearTimer() {
    clearInterval(this.timer);
    this.timer = 0;
  }

  emit(reason, result) {
    window.dispatchEvent(new CustomEvent(
      'listening-receipts:updated',
      {
        detail: {
          reason,
          shadow: true,
          session: this.session
            ? { ...this.session }
            : null,
          progress:
            result?.progress ||
            this.lastProgress ||
            null,
          receipt: result?.receipt || null
        }
      }
    ));
  }
}

export const listeningReceiptService =
  new ListeningReceiptService();

window.ListeningReceipts = listeningReceiptService;

export default listeningReceiptService;
