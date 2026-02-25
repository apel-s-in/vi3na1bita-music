/**
 * scripts/ui/sleep-timer.js
 * Реализация Sleep-таймера по ТЗ-UID (v4.0)
 * Полный UI: Dropdown-меню и модальное окно точного времени.
 */

export class SleepTimer {
  constructor() {
    this.timeoutId = null;
    this.targetTimestamp = null;
    this._tickInt = null;
    this._activeMenu = null;
  }

  show() {
    this._closeMenu();
    const btn = document.getElementById('sleep-timer-btn');
    if (!btn) return;
    
    // Создаем выпадающее меню (Стили из main.css)
    const menu = document.createElement('div');
    menu.className = 'sleep-menu animate-in';
    menu.innerHTML = `
      <div class="sleep-menu-item" data-val="off">Выключить</div>
      <div class="sleep-menu-item" data-val="15">15 минут</div>
      <div class="sleep-menu-item" data-val="30">30 минут</div>
      <div class="sleep-menu-item" data-val="60">60 минут</div>
      <div class="sleep-menu-item" data-val="custom">К времени...</div>
    `;
    
    btn.appendChild(menu);
    this._activeMenu = menu;
    
    // Закрытие при клике вне меню
    const close = (e) => {
      if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        this._closeMenu();
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
    
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = e.target.dataset.val;
      if (!val) return;
      this._closeMenu();
      document.removeEventListener('click', close);
      
      if (val === 'off') this.stop();
      else if (val === 'custom') this._showCustomTimeModal();
      else this.startMinutes(Number(val));
    });
  }

  _closeMenu() {
    if (this._activeMenu) {
      this._activeMenu.remove();
      this._activeMenu = null;
    }
  }

  _showCustomTimeModal() {
    if (!window.Modals?.open) return;
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    
    const modal = window.Modals.open({
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
    
    modal.querySelector('#st-save').onclick = () => {
      const hh = modal.querySelector('#st-h').value.padStart(2, '0');
      const mm = modal.querySelector('#st-m').value.padStart(2, '0');
      this.startAt(`${hh}:${mm}`);
      modal.remove();
    };
  }

  startMinutes(minutes) {
    this.stop();
    const ms = minutes * 60 * 1000;
    this.targetTimestamp = Date.now() + ms;
    this._startTick();
    this._notify(`Таймер сна установлен на ${minutes} мин.`);
    this._logEvent('FEATURE_USED', { feature: 'sleep_timer', minutes });
  }

  startAt(timeString) {
    this.stop();
    const [hours, minutes] = timeString.split(':').map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

    // ТЗ: Если время уже прошло, ставим на следующий день
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);

    this.targetTimestamp = target.getTime();
    this._startTick();
    this._notify(`Таймер сна установлен на ${timeString}`);
    this._logEvent('FEATURE_USED', { feature: 'sleep_timer', exactTime: timeString });
  }

  stop() {
    this.targetTimestamp = null;
    this._stopTick();
    this._updateBadge(null);
    this._notify('Таймер сна отключен');
  }

  _startTick() {
    this._stopTick();
    this._updateBadge();
    this._tickInt = setInterval(() => {
      if (!this.targetTimestamp) return this._stopTick();
      const rem = this.targetTimestamp - Date.now();
      if (rem <= 0) return this._trigger();
      this._updateBadge(Math.ceil(rem / 60000));
    }, 1000);
  }

  _stopTick() {
    if (this._tickInt) clearInterval(this._tickInt);
    this._tickInt = null;
  }

  _updateBadge(minutes) {
    const badge = document.getElementById('sleep-timer-badge');
    const btn = document.getElementById('sleep-timer-btn');
    if (!badge || !btn) return;
    
    if (minutes != null && minutes > 0) {
      badge.style.display = 'block';
      badge.textContent = minutes;
      btn.classList.add('active');
    } else {
      badge.style.display = 'none';
      btn.classList.remove('active');
    }
  }

  _trigger() {
    this.stop();
    // Единственный легальный STOP сценарий извне (помимо Favorites)
    if (window.playerCore && typeof window.playerCore.pause === 'function') {
      window.playerCore.pause();
    }
    this._notify('Время вышло. Музыка остановлена.');
  }

  _notify(message) {
    if (window.NotificationSystem) window.NotificationSystem.info(message);
  }

  _logEvent(type, data) {
    const uid = window.playerCore?.getCurrentTrackUid?.() || 'none';
    if (window.eventLogger) window.eventLogger.log(type, uid, data);
  }
}

export const sleepTimerInstance = new SleepTimer();
window.SleepTimer = sleepTimerInstance;
