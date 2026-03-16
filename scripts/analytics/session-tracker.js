// UID.003_(Event log truth)_(оставить session-tracker строителем playback-session событий)_(session intelligence должна опираться на эти события, а не обходить их)
// UID.018_(Variant and quality stats)_(готовить future variant-aware session accounting)_(audio/minus/stems/clip session semantics должны развиваться здесь)
// UID.050_(Session profile)_(дать listener/intel слою корректную основу текущей сессии)_(session tracker остаётся truth-layer для session context, а не UI слой)
// UID.060_(Session-aware next-track strategy)_(подготовить основу для context-aware рекомендаций)_(future session recs должны читать session data отсюда, не вмешиваясь в трекинг)
// UID.084_(AI content analysis)_(не смешивать AI и session truth)_(AI может интерпретировать session patterns позже, но не заменяет этот слой)
// UID.094_(No-paralysis rule)_(session tracking должен быть независимым от intel availability)_(никакой intel failure не должен ломать LISTEN_* events)
import { eventLogger } from './event-logger.js';

export class SessionTracker {
  constructor() { this.s = null; this._speedRunnerMs = 0; this._speedRunnerAwarded = false; this._bindEvents(); }

  _bindEvents() {
    window.addEventListener('player:play', e => this._start(e.detail));
    window.addEventListener('player:pause', () => this._pause());
    window.addEventListener('player:tick', e => this._tick(e.detail));
    ['player:ended', 'player:stop', 'player:trackChanged'].forEach(ev => window.addEventListener(ev, () => { if(ev !== 'player:ended') this._resetContinuousRun(); this._end(ev === 'player:ended'); }));
  }

  _start({ uid, duration, type = 'audio' }) {
    if (this.s?.uid === uid && this.s?.variant === type) return void (this.s.lastUpdate = Date.now());
    this._end(false);
    this.s = { uid, variant: type, quality: window.playerCore?.qMode || 'hi', duration: duration || 0, accumulatedMs: 0, lastPos: 0, lastUpdate: Date.now() };
    eventLogger.log('LISTEN_START', uid, { variant: type });
  }

  _tick({ currentTime, volume, muted }) {
    if (!this.s) return; const now = Date.now(), dMs = now - this.s.lastUpdate, pD = Math.abs(currentTime - this.s.lastPos);
    this.s.lastUpdate = now; this.s.lastPos = currentTime;
    if (dMs > 0 && dMs < 2000 && pD < 1.5 && volume > 0 && !muted) {
      this.s.accumulatedMs += dMs; this._speedRunnerMs += dMs;
      if (this._speedRunnerMs >= 10800000 && !this._speedRunnerAwarded) { this._speedRunnerAwarded = true; eventLogger.log('FEATURE_USED', 'global', { feature: 'speed_runner' }); }
    } else this._resetContinuousRun();
    if (this.s.duration <= 0) this.s.duration = window.playerCore?.getDuration() || 0;
  }

  _pause() { if (this.s) this.s.lastUpdate = Date.now(); this._resetContinuousRun(); }
  _resetContinuousRun() { this._speedRunnerMs = 0; }

  _end(isE) {
    if (!this.s) return; const { uid, variant, quality, accumulatedMs, duration, lastPos } = this.s; this.s = null;
    if (duration <= 0 && !isE) return;
    const sec = Math.floor(accumulatedMs / 1000), prg = duration > 0 ? (lastPos / duration) : 0, isV = sec >= 13 || isE, isF = prg >= 0.9 || isE;

    if (isV || isF) {
      const n = new Date(), h = n.getHours(), m = n.getMinutes();
      if (isV && h === 11 && m === 11) eventLogger.log('FEATURE_USED', 'global', { feature: 'play_11_11' });
      if (isV && (n.getDay() === 0 || n.getDay() === 6)) eventLogger.log('FEATURE_USED', 'global', { feature: 'weekend_play' });
      eventLogger.log('LISTEN_COMPLETE', uid, { variant, quality, listenedSeconds: sec, trackDuration: duration, progress: prg, isFullListen: isF, isValidListen: isV });
    } else eventLogger.log('LISTEN_SKIP', uid, { listenedSeconds: sec });
  }
}
