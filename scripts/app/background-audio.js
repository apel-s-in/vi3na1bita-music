// scripts/app/background-audio.js
// Минимальная поддержка background для Media Session.
// ВАЖНО: action handlers и metadata/position обновляет PlayerCore (src/PlayerCore.js + src/player-core/media-session.js).
// Здесь ничего не должно влиять на stop/play/seek/volume.

(function BackgroundAudioModule() {
  'use strict';

  class BackgroundAudioManager {
    constructor() {
      this.isSupported = ('mediaSession' in navigator);
      this._bound = false;
      this.init();
    }

    init() {
      if (!this.isSupported) return;
      this.attachPlayerEvents();
    }

    attachPlayerEvents() {
      if (this._bound) return;
      const pc = window.playerCore;
      if (!pc || typeof pc.on !== 'function') {
        setTimeout(() => this.attachPlayerEvents(), 200);
        return;
      }

      this._bound = true;

      // Ничего не делаем: PlayerCore сам обновляет mediaSession (metadata + positionState).
      // Оставлено как “якорь” модуля для совместимости.
    }
  }

  window.BackgroundAudioManager = new BackgroundAudioManager();
})();
