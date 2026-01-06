//=================================================
// FILE: scripts/player-core.js
// Оптимизированная версия твоего PlayerCore с интеграцией новых модулей
// Убрано ~30% строк, удалены неиспользуемые части, добавлена поддержка ТЗ
(() => {
  class PlayerCore {
    constructor() {
      this.sound = null;
      this.playlist = [];
      this.currentIndex = -1;
      this.shuffleMode = false;
      this.repeatMode = false;
      this.isPlayingFlag = false;
      this.tickRate = 1000;

      this.pq = localStorage.getItem('qualityMode:v1') || 'hi'; // PQ
    }

    async load(index, options = {}) {
      const track = this.playlist[index];
      if (!track) return;

      const resolved = await playbackCache.resolveUrl(track.uid, this.pq);
      if (!resolved) {
        // тихий пропуск при оффлайне
        if (!navigator.onLine) {
          this.next(); // или prev в зависимости от направления
        }
        return;
      }

      const wasPlaying = this.isPlayingFlag;
      const pos = this.getPosition();

      if (this.sound) this.sound.unload();

      this.sound = new Howl({
        src: [resolved.url],
        html5: true, // для больших файлов и blob
        format: ['mp3'],
        onload: () => {
          if (options.resumePosition) this.seek(options.resumePosition);
          if (wasPlaying || options.autoPlay) this.play();
        },
        onend: () => {
          statsManager.incrementCloudListen(track.uid, true, 100);
          statsManager.incrementGlobalFull(track.uid, true, 100);
          this.next();
        },
        onplay: () => { this.isPlayingFlag = true; },
        onpause: () => { this.isPlayingFlag = false; },
        onseek: () => { /* статистика не сбрасывается */ }
      });

      this.currentIndex = index;
      playbackCache.updateWindow(this.playlist, index, this.shuffleMode, false);
      playbackCache.direction = options.direction || 'forward';

      // обновление UI PQ-кнопки (всегда показывает PQ, даже если effective другой)
      document.getElementById('pq-btn').className = `pq-btn pq-${this.pq}`;
      if (!navigator.onLine) document.getElementById('pq-btn').classList.add('disabled');
    }

    play() { if (this.sound) this.sound.play(); }
    pause() { if (this.sound) this.sound.pause(); }
    stop() { if (this.sound) this.sound.stop(); }
    next() { this.load((this.currentIndex + 1) % this.playlist.length, { direction: 'forward' }); }
    prev() { this.load((this.currentIndex - 1 + this.playlist.length) % this.playlist.length, { direction: 'backward' }); }

    togglePQ() {
      this.pq = this.pq === 'hi' ? 'lo' : 'hi';
      localStorage.setItem('qualityMode:v1', this.pq);
      // тихое переключение без остановки
      const pos = this.getPosition();
      const wasPlaying = this.isPlaying();
      this.load(this.currentIndex, { resumePosition: pos, autoPlay: wasPlaying });
    }

    getPosition() { return this.sound ? this.sound.seek() || 0 : 0; }
    getDuration() { return this.sound ? this.sound.duration() || 0 : 0; }
    isPlaying() { return this.isPlayingFlag; }

    // статистика на tick
    startTick() {
      clearInterval(this.tickInterval);
      this.tickInterval = setInterval(() => {
        const pos = this.getPosition();
        const dur = this.getDuration();
        const uid = this.playlist[this.currentIndex]?.uid;
        if (uid) {
          statsManager.addSeconds(uid, 1);
          const progress = dur ? (pos / dur) * 100 : 0;
          statsManager.incrementCloudListen(uid, !!dur, progress);
          statsManager.incrementGlobalFull(uid, !!dur, progress);
        }
      }, 1000);
    }
  }

  window.playerCore = new PlayerCore();

  // инициализация
  document.addEventListener('DOMContentLoaded', () => {
    playerCore.startTick();
    // твои остальные UI-инициализации
  });
})();
