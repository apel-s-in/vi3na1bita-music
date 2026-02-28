/**
 * scripts/ui/sleep-timer.js
 * Реализация Sleep-таймера по ТЗ-UID (v4.0)
 * Оптимизированная версия: устранено дублирование, исправлен баг задержки бейджа на 1 сек.
 */

export class SleepTimer {
  constructor() {
    this.tgt = this._int = this._menu = null;
  }

  show() {
    this._cls();
    const btn = document.getElementById('sleep-timer-btn');
    if (!btn) return;

    this._menu = document.createElement('div');
    this._menu.className = 'sleep-menu animate-in';
    this._menu.innerHTML = `
      <div class="sleep-menu-item" data-val="off">Выключить</div>
      <div class="sleep-menu-item" data-val="15">15 минут</div>
      <div class="sleep-menu-item" data-val="30">30 минут</div>
      <div class="sleep-menu-item" data-val="60">60 минут</div>
      <div class="sleep-menu-item" data-val="custom">К времени...</div>
    `;
    btn.appendChild(this._menu);

    const close = (e) => {
      if (!this._menu?.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        this._cls();
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);

    this._menu.onclick = (e) => {
      e.stopPropagation();
      const v = e.target.dataset.val;
      if (!v) return;
      
      this._cls();
      document.removeEventListener('click', close);
      v === 'off' ? this.stop() : (v === 'custom' ? this._custom() : this.startMinutes(+v));
    };
  }

  _cls() {
    this._menu?.remove();
    this._menu = null;
  }

  _custom() {
    if (!window.Modals?.open) return;
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    
    const mod = window.Modals.open({
      title: 'Таймер сна',
      maxWidth: 320,
      bodyHtml: `
        <div class="sleep-time-title">Остановить музыку в:</div>
        <div class="sleep-time-row">
          <input type="number" id="st-h" class="sleep-time-input" min="0" max="23" value="${h}">
          <span class="sleep-time-sep">:</span>
          <input type="number" id="st-m" class="sleep-time-input" min="0" max="59" value="${m}">
        </div>
        <div class="sleep-time-actions">
          <button class="sleep-time-btn primary" id="st-save" style="width:100%">Установить</button>
        </div>
      `
    });

    mod.querySelector('#st-save').onclick = () => {
      this.startAt(`${mod.querySelector('#st-h').value.padStart(2, '0')}:${mod.querySelector('#st-m').value.padStart(2, '0')}`);
      mod.remove();
    };
  }

  startMinutes(m) {
    this._start(Date.now() + m * 60000, `на ${m} мин.`, { minutes: m });
  }

  startAt(t) {
    const [h, m] = t.split(':').map(Number), d = new Date();
    const tgt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0);
    if (tgt <= d) tgt.setDate(tgt.getDate() + 1);
    this._start(tgt.getTime(), `на ${t}`, { exactTime: t });
  }

  stop() {
    this.tgt = null;
    clearInterval(this._int);
    this._upd();
    window.NotificationSystem?.info?.('Таймер сна отключен');
  }

  _start(t, msg, log) {
    this.tgt = t;
    clearInterval(this._int);

    const tick = () => {
      if (!this.tgt) return clearInterval(this._int);
      const r = this.tgt - Date.now();
      if (r <= 0) {
        this.stop();
        // PLAYBACK SAFETY: Единственный легальный STOP сценарий извне (помимо Избранного)
        window.playerCore?.pause?.();
        window.NotificationSystem?.info?.('Время вышло. Музыка остановлена.');
      } else {
        this._upd(Math.ceil(r / 60000));
      }
    };
    
    tick(); // Немедленный апдейт UI (убирает баг 1-секундной задержки)
    this._int = setInterval(tick, 1000);
    
    window.NotificationSystem?.info?.(`Таймер сна установлен ${msg}`);
    window.eventLogger?.log?.('FEATURE_USED', window.playerCore?.getCurrentTrackUid?.() || 'none', { feature: 'sleep_timer', ...log });
  }

  _upd(m) {
    const bg = document.getElementById('sleep-timer-badge');
    const btn = document.getElementById('sleep-timer-btn');
    if (!bg || !btn) return;
    
    bg.style.display = m > 0 ? 'block' : 'none';
    bg.textContent = m || '';
    btn.classList.toggle('active', m > 0);
  }
}

export const sleepTimerInstance = new SleepTimer();
window.SleepTimer = sleepTimerInstance;
