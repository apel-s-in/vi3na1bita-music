import { eventLogger } from './event-logger.js';
import { getCreditedPlaybackDeltaMs } from './playback-validity.js';
import { makePlaybackRuntimeSnapshot } from './playback-runtime.js';
const uniqueCoverageSeconds = segments => {
  const rows = (Array.isArray(segments) ? segments : [])
    .map(segment => ({ from: Math.max(0, Number(segment?.fromPosition || 0)), to: Math.max(0, Number(segment?.toPosition || 0)) }))
    .filter(segment => segment.to > segment.from)
    .sort((left, right) => left.from - right.from || left.to - right.to);
  const merged = [];
  rows.forEach(segment => {
    const last = merged[merged.length - 1];
    if (!last || segment.from > last.to + 0.25) merged.push({ ...segment });
    else last.to = Math.max(last.to, segment.to);
  });
  return merged.reduce((sum, segment) => sum + Math.max(0, segment.to - segment.from), 0);
};
export class SessionTracker {
  constructor() {
    this.s = null;
    this._bindEvents();
  }
  _bindEvents() {
    window.addEventListener('player:play', e => this._start(e.detail));
    window.addEventListener('player:pause', () => this._pause());
    window.addEventListener('player:tick', e => this._tick(e.detail));
    window.addEventListener('player:ended', () => this._end(true, 'ended'));
    window.addEventListener('player:stop', () => this._end(false, 'stop'));
    window.addEventListener('player:trackChanged', event => {
      const nextUid = String(event.detail?.uid || '').trim();
      if (!this.s || !nextUid || this.s.uid === nextUid) return;
      this._end(false, String(event.detail?.reason || 'track_changed'), { transitionToUid: nextUid });
    });
    window.addEventListener('account:data-switching', () => this._end(false));
    window.addEventListener('account:data-switched', () => {
      if (!window.playerCore?.isPlaying?.()) return;
      this._start({ uid: window.playerCore.getCurrentTrackUid?.(), duration: window.playerCore.getDuration?.(), type: 'audio' });
    });
  }
  _start({ uid, duration, type = 'audio' } = {}) {
    if (!uid) return;
    if (this.s?.uid === uid && this.s?.variant === type) {
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
      repeat: !!player?.isRepeat?.(),
      launchSource: String(window.AlbumsManager?.getPlayingAlbum?.() || ''),
      favoritesOnly: localStorage.getItem('favoritesOnlyMode') === '1',
      favoriteAtStart: !!player?.isFavorite?.(uid),
      timezoneOffsetMin: new Date().getTimezoneOffset(),
      startedAt,
      duration: Number(duration || 0),
      accumulatedMs: 0,
      creditedSegments: [],
      lastPos: Number(player?.getPosition?.() || 0),
      lastUpdate: startedAt
    };
    eventLogger.log('LISTEN_START', uid, { variant: type, quality: this.s.quality, shuffle: this.s.shuffle, repeat: this.s.repeat, launchSource: this.s.launchSource, favoritesOnly: this.s.favoritesOnly, favoriteAtStart: this.s.favoriteAtStart, timezoneOffsetMin: this.s.timezoneOffsetMin });
  }
  _tick({ currentTime, volume, muted }) {
    if (!this.s) return;
    const rt = makePlaybackRuntimeSnapshot({ lastTickAt: this.s.lastUpdate, lastPos: this.s.lastPos, duration: this.s.duration, volume, muted, tick: { currentTime, volume, muted }, playerCore: window.playerCore });
    this.s.lastUpdate = rt.now;
    this.s.lastPos = rt.currentTime;
    this.s.duration = this.s.duration > 0 ? this.s.duration : rt.duration;
    const creditedMs = getCreditedPlaybackDeltaMs({ deltaMs: rt.deltaMs, prevTime: rt.prevPos, currentTime: rt.currentTime, volume: rt.volume, muted: rt.muted });
    if (creditedMs > 0) {
      this.s.accumulatedMs += creditedMs;
      const last = this.s.creditedSegments[this.s.creditedSegments.length - 1];
      const contiguous = last && Math.abs(Number(last.endedAt || 0) - Number(rt.prevTickAt || 0)) <= 1500 && Math.abs(Number(last.toPosition || 0) - Number(rt.prevPos || 0)) <= 1.5;
      if (contiguous) {
        last.endedAt = rt.now;
        last.toPosition = rt.currentTime;
        last.creditedMs += creditedMs;
      } else {
        this.s.creditedSegments.push({ startedAt: rt.prevTickAt, endedAt: rt.now, creditedMs, fromPosition: rt.prevPos, toPosition: rt.currentTime });
      }
      if (this.s.creditedSegments.length > 512) {
        const first = this.s.creditedSegments.shift();
        const next = this.s.creditedSegments[0];
        if (first && next && Math.abs(Number(first.endedAt || 0) - Number(next.startedAt || 0)) <= 1500 && Math.abs(Number(first.toPosition || 0) - Number(next.fromPosition || 0)) <= 1.5) {
          next.startedAt = first.startedAt;
          next.fromPosition = first.fromPosition;
          next.creditedMs += first.creditedMs;
        }
      }
    }
  }
  _pause() {
    if (this.s) {
      this._tick({ currentTime: window.playerCore?.getPosition?.() || this.s.lastPos || 0, volume: window.playerCore?.getVolume?.() ?? 100, muted: window.playerCore?.isMuted?.() ?? false });
      this.s.lastUpdate = Date.now();
    }
  }
  _end(endedNaturally, completionReason = 'interrupted', extra = {}) {
    if (!this.s) return;
    const targetPosition = endedNaturally && this.s.duration > 0 ? this.s.duration : Number(window.playerCore?.getPosition?.() || this.s.lastPos || 0);
    this._tick({ currentTime: targetPosition, volume: window.playerCore?.getVolume?.() ?? 100, muted: window.playerCore?.isMuted?.() ?? false });
    const { uid, variant, quality, shuffle, repeat, launchSource, favoritesOnly, favoriteAtStart, timezoneOffsetMin, startedAt, accumulatedMs, creditedSegments, duration } = this.s;
    this.s = null;
    if (duration <= 0 && !endedNaturally) return;
    const listenedSeconds = Math.max(0, accumulatedMs / 1000);
    const uniqueCoveredSeconds = Math.min(Math.max(0, duration), uniqueCoverageSeconds(creditedSegments));
    const completionRatio = duration > 0 ? Math.max(0, Math.min(1, uniqueCoveredSeconds / duration)) : 0;
    const analysisEligible = listenedSeconds >= 3;
    const valid = listenedSeconds >= 25;
    const full = endedNaturally && completionRatio >= 0.9 && listenedSeconds >= Math.max(25, duration * 0.8);
    const skipClass = endedNaturally ? (full ? 'full' : 'partial_end') : listenedSeconds < 3 ? 'micro_skip' : listenedSeconds < 25 ? 'early_skip' : 'valid_skip';
    const startDate = new Date(startedAt || Date.now());
    const startHour = startDate.getHours();
    const startMinute = startDate.getMinutes();
    if (valid && startHour === 11 && startMinute === 11) {
      eventLogger.log('FEATURE_USED', 'global', { feature: 'play_11_11' });
    }
    if (valid && (startDate.getDay() === 0 || startDate.getDay() === 6)) {
      eventLogger.log('FEATURE_USED', 'global', { feature: 'weekend_play' });
    }
    eventLogger.log('LISTEN_COMPLETE', uid, {
      variant,
      quality,
      shuffle,
      repeat,
      launchSource,
      favoritesOnly,
      favoriteAtStart,
      timezoneOffsetMin,
      startedAt,
      listenedSeconds: Math.floor(listenedSeconds),
      listenedMs: Math.floor(accumulatedMs),
      uniqueCoveredSeconds,
      uniqueCoveredMs: Math.floor(uniqueCoveredSeconds * 1000),
      creditedSegments,
      temporalSchemaVersion: 3,
      trackDuration: duration,
      completionRatio,
      completionBasisPoints: Math.round(completionRatio * 10000),
      analysisEligible,
      skipClass,
      completionReason: String(completionReason || 'interrupted'),
      transitionToUid: String(extra.transitionToUid || ''),
      isFullListen: full,
      isValidListen: valid
    });
  }
}
