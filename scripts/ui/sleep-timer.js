export class SleepTimer {
  constructor() {
    this._tick = this._warnTimer = null;
    this._extendPromptOpen = false;
    this._initialized = false;
    this._state = { remind5m: true, autoPromptExtend: true, usageCount: 0, lastDurationMin: 0, lastFinishedAt: 0, ...(JSON.parse(localStorage.getItem('sleepTimerState:v2') || '{}') || {}) };
  }

  initialize() {
    if (this._initialized) return;
    this._initialized = true;
    window.addEventListener('player:sleepTimerChanged', () => this._syncBadge());
    window.addEventListener('player:sleepTimerTriggered', () => {
      this._clearWarning(); this._extendPromptOpen = false; this._state.lastFinishedAt = Date.now(); this._state.usageCount++; this._saveState();
      window.NotificationSystem?.info?.('Время вышло. Музыка остановлена.'); window.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'sleep_timer' });
    });
    clearInterval(this._tick); this._tick = setInterval(() => { this._syncBadge(); this._handleReminder(); }, 1000); this._syncBadge();
  }

  _saveState() { try { localStorage.setItem('sleepTimerState:v2', JSON.stringify(this._state)); } catch {} }
  _clearWarning() { clearTimeout(this._warnTimer); this._warnTimer = null; }
  _getTarget() { return Number(window.playerCore?.getSleepTimerTarget?.() || 0); }
  _getRemainingMs() { const t = this._getTarget(); return t > 0 ? Math.max(0, t - Date.now()) : 0; }
  _fmtMs(ms) { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h > 0 ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }
  _fmtTarget(ts) { if (!ts) return '—'; const d = new Date(ts); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }

  _syncBadge() {
    const bg = document.getElementById('sleep-timer-badge'), btn = document.getElementById('sleep-timer-btn'); if (!bg || !btn) return;
    const rem = this._getRemainingMs(), mins = rem > 0 ? Math.ceil(rem / 60000) : 0;
    bg.style.display = mins > 0 ? 'block' : 'none'; bg.textContent = mins > 0 ? String(mins) : ''; btn.classList.toggle('active', mins > 0);
  }

  _handleReminder() {
    const rem = this._getRemainingMs();
    if (!rem || !this._state.remind5m || this._extendPromptOpen || rem > 5 * 60000 || rem < 4 * 60000 + 50000) return;
    this._extendPromptOpen = true; window.NotificationSystem?.info?.('Таймер закончится через 5 минут');
    const m = window.Modals?.open?.({ title: 'Таймер сна', maxWidth: 420, bodyHtml: `<div class="sleep-extend-box"><div class="sleep-extend-title">Таймер завершится через 5 минут</div><div class="sleep-extend-sub">Продлить таймер или оставить как есть?</div><div class="sleep-extend-actions"><button class="modal-action-btn" data-act="plus5" data-testid="sleep-reminder-plus5">+5 мин</button><button class="modal-action-btn" data-act="plus15" data-testid="sleep-reminder-plus15">+15 мин</button><button class="modal-action-btn online" data-act="keep" data-testid="sleep-reminder-keep">Оставить</button><button class="modal-action-btn" data-act="reset" data-testid="sleep-reminder-reset">Сброс</button></div></div>` });
    if (!m) return;
    const closeWrap = () => { this._extendPromptOpen = false; m.remove(); };
    m.addEventListener('click', e => { const act = e.target.closest('[data-act]')?.dataset?.act; if (!act) return; if (act === 'plus5') this.extendMinutes(5); else if (act === 'plus15') this.extendMinutes(15); else if (act === 'reset') this.stop(false); closeWrap(); });
    const oldRemove = m.remove.bind(m); m.remove = () => { this._extendPromptOpen = false; oldRemove(); };
  }

  show() {
    const rem = this._getRemainingMs(), target = this._getTarget(), statsText = this._state.usageCount ? `Использован: ${this._state.usageCount} раз` : 'Ещё не использовался';
    const m = window.Modals?.open?.({ title: 'Таймер сна', maxWidth: 720, bodyHtml: `<div class="sleep-full"><div class="sleep-hero"><div class="sleep-hero-icon">🌙</div><div class="sleep-hero-text"><div class="sleep-hero-title">Гибкий таймер сна</div><div class="sleep-hero-sub">Полноценное управление остановкой воспроизведения</div></div></div><div class="sleep-status-card"><div class="sleep-status-row"><span>Статус</span><strong>${rem > 0 ? 'Активен' : 'Выключен'}</strong></div><div class="sleep-status-row"><span>Осталось</span><strong id="sleep-live-remaining">${rem > 0 ? this._fmtMs(rem) : '—'}</strong></div><div class="sleep-status-row"><span>Остановить в</span><strong>${target > 0 ? this._fmtTarget(target) : '—'}</strong></div><div class="sleep-status-row"><span>Статистика</span><strong>${statsText}</strong></div></div><div class="sleep-preset-grid"><button class="sleep-preset-btn" data-min="15" data-testid="sleep-preset-15">15 мин</button><button class="sleep-preset-btn" data-min="30" data-testid="sleep-preset-30">30 мин</button><button class="sleep-preset-btn" data-min="45" data-testid="sleep-preset-45">45 мин</button><button class="sleep-preset-btn" data-min="60" data-testid="sleep-preset-60">60 мин</button><button class="sleep-preset-btn" data-min="90" data-testid="sleep-preset-90">90 мин</button><button class="sleep-preset-btn" data-min="120" data-testid="sleep-preset-120">120 мин</button></div><div class="sleep-custom-card"><div class="sleep-custom-row"><label class="sleep-label">Свои минуты</label><div class="sleep-inline"><input id="sleep-custom-minutes" class="sleep-input" type="number" min="1" max="720" value="20"><button class="sleep-apply-btn" data-act="set-custom">Установить</button></div></div><div class="sleep-custom-row"><label class="sleep-label">Остановить в</label><div class="sleep-inline"><input id="sleep-custom-time" class="sleep-input" type="time" value="${this._fmtTarget(Date.now()).slice(0,5)}"><button class="sleep-apply-btn" data-act="set-time">Установить</button></div></div></div><div class="sleep-options-card"><label class="sleep-check"><input id="sleep-remind-5m" type="checkbox" ${this._state.remind5m ? 'checked' : ''}><span>Напомнить за 5 минут до окончания</span></label></div><div class="sleep-extend-row"><button class="sleep-soft-btn" data-ext="5">+5 мин</button><button class="sleep-soft-btn" data-ext="10">+10 мин</button><button class="sleep-soft-btn" data-ext="15">+15 мин</button><button class="sleep-soft-btn" data-ext="30">+30 мин</button></div><div class="sleep-bottom-actions"><button class="sleep-danger-btn" data-act="reset" data-testid="sleep-reset">Сброс</button></div></div>` });
    if (!m) return;
    const updLive = () => { const el = m.querySelector('#sleep-live-remaining'), r = this._getRemainingMs(); if (el) el.textContent = r > 0 ? this._fmtMs(r) : '—'; };
    updLive(); const liveInt = setInterval(updLive, 1000);
    const oldRemove = m.remove.bind(m); m.remove = () => { clearInterval(liveInt); oldRemove(); };

    m.addEventListener('click', e => {
      const min = e.target.closest('[data-min]')?.dataset?.min, ext = e.target.closest('[data-ext]')?.dataset?.ext, act = e.target.closest('[data-act]')?.dataset?.act;
      if (min) { this.startMinutes(Number(min)); m.remove(); return; }
      if (ext) { this.extendMinutes(Number(ext)); updLive(); return; }
      if (act === 'set-custom') { const v = Number(m.querySelector('#sleep-custom-minutes')?.value || 0); if (v > 0) { this.startMinutes(v); m.remove(); } return; }
      if (act === 'set-time') { const t = String(m.querySelector('#sleep-custom-time')?.value || '').trim(); if (t) { this.startAt(t); m.remove(); } return; }
      if (act === 'reset') { this.stop(); updLive(); return; }
    });
    m.querySelector('#sleep-remind-5m')?.addEventListener('change', e => { this._state.remind5m = !!e.target.checked; this._saveState(); });
  }

  startMinutes(m) {
    if (!m || m < 1) return; const ms = m * 60000; this._state.lastDurationMin = m; this._saveState();
    window.playerCore?.setSleepTimer?.(ms, { mode: 'minutes', minutes: m, remind5m: !!this._state.remind5m }); window.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'sleep_timer_set', mode: 'minutes', minutes: m });
    this._syncBadge(); window.NotificationSystem?.info?.(`Таймер сна установлен на ${m} мин.`);
  }

  startAt(t) {
    const [h, m] = String(t).split(':').map(Number), d = new Date(), tgt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0); if (tgt <= d) tgt.setDate(tgt.getDate() + 1);
    const minutes = Math.max(1, Math.round((tgt.getTime() - Date.now()) / 60000)); this._state.lastDurationMin = minutes; this._saveState();
    window.playerCore?.setSleepTimer?.(tgt.getTime() - Date.now(), { mode: 'clock', exactTime: t, remind5m: !!this._state.remind5m }); window.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'sleep_timer_set', mode: 'clock', minutes, exactTime: t });
    this._syncBadge(); window.NotificationSystem?.info?.(`Таймер сна установлен на ${t}`);
  }

  extendMinutes(m) {
    const rem = this._getRemainingMs(); if (rem <= 0) return this.startMinutes(m);
    const nextMs = rem + m * 60000, nextMin = Math.ceil(nextMs / 60000); this._state.lastDurationMin = nextMin; this._saveState();
    window.playerCore?.setSleepTimer?.(nextMs, { mode: 'extended', minutes: nextMin, remind5m: !!this._state.remind5m }); window.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'sleep_timer_extend', mode: 'extended', minutes: m, totalMinutes: nextMin });
    this._syncBadge(); window.NotificationSystem?.success?.(`Таймер продлён на ${m} мин.`);
  }

  stop(notify = true) {
    const remMin = Math.ceil(this._getRemainingMs() / 60000); this._clearWarning(); window.playerCore?.clearSleepTimer?.();
    window.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'sleep_timer_cancel', minutes: Math.max(0, remMin) }); this._syncBadge();
    if (notify) window.NotificationSystem?.info?.('Таймер сна сброшен');
  }
}

export const sleepTimerInstance = new SleepTimer();
window.SleepTimer = sleepTimerInstance;
