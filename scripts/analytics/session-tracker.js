// UID.003_(Event log truth)_(оставить session-tracker строителем playback-session событий)_(session intelligence должна опираться на эти события, а не обходить их) UID.018_(Variant and quality stats)_(готовить future variant-aware session accounting)_(audio/minus/stems/clip session semantics должны развиваться здесь) UID.050_(Session profile)_(дать listener/intel слою корректную основу текущей сессии)_(session tracker остаётся truth-layer для session context, а не UI слой) UID.060_(Session-aware next-track strategy)_(подготовить основу для context-aware рекомендаций)_(future session recs должны читать session data отсюда, не вмешиваясь в трекинг) UID.084_(AI content analysis)_(не смешивать AI и session truth)_(AI может интерпретировать session patterns позже, но не заменяет этот слой) UID.094_(No-paralysis rule)_(session tracking должен быть независимым от intel availability)_(никакой intel failure не должен ломать LISTEN_* events)
import { eventLogger } from './event-logger.js';
import { getCreditedPlaybackDeltaMs } from './playback-validity.js';
import { makePlaybackRuntimeSnapshot } from './playback-runtime.js';

export class SessionTracker {
  constructor() { this.s = null; this._bindEvents(); }
  _bindEvents() {
    window.addEventListener('player:play', e => this._start(e.detail));
    window.addEventListener('player:pause', () => this._pause());
    window.addEventListener('player:tick', e => this._tick(e.detail));
    window.addEventListener('player:ended', () => this._end(true));
    window.addEventListener('player:stop', () => this._end(false));
    window.addEventListener('player:trackChanged', event => {
      const nextUid = String(event.detail?.uid || '').trim();
      if (!this.s || !nextUid || this.s.uid === nextUid) return;
      this._end(false);
    });

    window.addEventListener(
      'account:data-switching',
      () => this._end(false)
    );

    window.addEventListener(
      'account:data-switched',
      () => {
        if (!window.playerCore?.isPlaying?.()) return;

        this._start({
          uid: window.playerCore.getCurrentTrackUid?.(),
          duration: window.playerCore.getDuration?.(),
          type: 'audio'
        });
      }
    );
  }
  _start({ uid, duration, type = 'audio' } = {}) {
    if (!uid) return;

    if (
      this.s?.uid === uid &&
      this.s?.variant === type
    ) {
      this.s.lastUpdate = Date.now();
      return;
    }

    this._end(false);

    const player = window.playerCore;
    const startedAt = Date.now();

    this.s = {
      uid,
      variant: type,
      quality: player?.qMode || 'hi',
      shuffle: !!player?.isShuffle?.(),
      favoritesOnly:
        localStorage.getItem('favoritesOnlyMode') === '1',
      favoriteAtStart: !!player?.isFavorite?.(uid),
      timezoneOffsetMin: new Date().getTimezoneOffset(),
      startedAt,
      duration: Number(duration || 0),
      accumulatedMs: 0,
      lastPos: Number(player?.getPosition?.() || 0),
      lastUpdate: startedAt
    };

    eventLogger.log('LISTEN_START', uid, {
      variant: type,
      quality: this.s.quality,
      shuffle: this.s.shuffle,
      favoritesOnly: this.s.favoritesOnly,
      favoriteAtStart: this.s.favoriteAtStart,
      timezoneOffsetMin: this.s.timezoneOffsetMin
    });
  }
  _tick({ currentTime, volume, muted }) {
    if (!this.s) return;
    const rt = makePlaybackRuntimeSnapshot({ lastTickAt: this.s.lastUpdate, lastPos: this.s.lastPos, duration: this.s.duration, volume, muted, tick: { currentTime, volume, muted }, playerCore: window.playerCore });
    this.s.lastUpdate = rt.now; this.s.lastPos = rt.currentTime; this.s.duration = this.s.duration > 0 ? this.s.duration : rt.duration;
    const creditedMs = getCreditedPlaybackDeltaMs({
      deltaMs: rt.deltaMs,
      prevTime: rt.prevPos,
      currentTime: rt.currentTime,
      volume: rt.volume,
      muted: rt.muted
    });

    if (creditedMs > 0) {
      this.s.accumulatedMs += creditedMs;
    }
  }
  _pause() {
    if (this.s) { this._tick({ currentTime: window.playerCore?.getPosition?.() || this.s.lastPos || 0, volume: window.playerCore?.getVolume?.() ?? 100, muted: window.playerCore?.isMuted?.() ?? false }); this.s.lastUpdate = Date.now(); }
  }
  _end(endedNaturally) {
    if (!this.s) return;

    const targetPosition = endedNaturally && this.s.duration > 0
      ? this.s.duration
      : Number(
          window.playerCore?.getPosition?.() ||
          this.s.lastPos ||
          0
        );

    this._tick({
      currentTime: targetPosition,
      volume: window.playerCore?.getVolume?.() ?? 100,
      muted: window.playerCore?.isMuted?.() ?? false
    });

    const {
      uid,
      variant,
      quality,
      shuffle,
      favoritesOnly,
      favoriteAtStart,
      timezoneOffsetMin,
      startedAt,
      accumulatedMs,
      duration,
      lastPos
    } = this.s;

    this.s = null;

    if (duration <= 0 && !endedNaturally) return;

    const listenedSeconds = Math.floor(accumulatedMs / 1000);
    const progress = duration > 0
      ? Math.max(0, Math.min(1, lastPos / duration))
      : 0;
    const valid = listenedSeconds >= 25;
    const full =
      endedNaturally &&
      progress >= 0.9 &&
      listenedSeconds >= Math.max(
        25,
        Math.floor(duration * 0.8)
      );

    if (!valid && !full) {
      eventLogger.log('LISTEN_SKIP', uid, {
        listenedSeconds
      });
      return;
    }

    const startDate = new Date(startedAt || Date.now());
    const startHour = startDate.getHours();
    const startMinute = startDate.getMinutes();

    if (
      valid &&
      startHour === 11 &&
      startMinute === 11
    ) {
      eventLogger.log('FEATURE_USED', 'global', {
        feature: 'play_11_11'
      });
    }

    if (
      valid &&
      (
        startDate.getDay() === 0 ||
        startDate.getDay() === 6
      )
    ) {
      eventLogger.log('FEATURE_USED', 'global', {
        feature: 'weekend_play'
      });
    }

    eventLogger.log('LISTEN_COMPLETE', uid, {
      variant,
      quality,
      shuffle,
      favoritesOnly,
      favoriteAtStart,
      timezoneOffsetMin,
      startedAt,
      listenedSeconds,
      trackDuration: duration,
      progress,
      isFullListen: full,
      isValidListen: valid
    });
  }
}
