export class SleepTimer {
  constructor() { this._tick = this._warnTimer = null; this._extendPromptOpen = false; this._state = { remind5m: true, autoPromptExtend: true, usageCount: 0, lastDurationMin: 0, lastFinishedAt: 0, ...(JSON.parse(localStorage.getItem('sleepTimerState:v2') || '{}') || {}) }; }
  initialize() {
    if (!window.Utils?.func?.initOnce?.('ui:sleep-timer:init', () => {})) return;
    window.addEventListener('player:sleepTimerChanged', () => this._syncBadge());
    window.addEventListener('player:sleepTimerTriggered', () => { this._clearWarning(); this._extendPromptOpen = false; this._state.lastFinishedAt = Date.now(); this._state.usageCount++; this._saveState(); window.NotificationSystem?.info?.('Время вышло. Музыка остановлена.'); window.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'sleep_timer' }); });
    clearInterval(this._tick); this._tick = setInterval(() => { this._syncBadge(); this._handleReminder(); }, 1000); this._syncBadge();
  }
  _saveState() { try { localStorage.setItem('sleepTimerState:v2', JSON.stringify(this._state)); } catch {} }
  _clearWarning() { clearTimeout(this._warnTimer); this._warnTimer = null; }
  _getTarget() { return Number(window.playerCore?.getSleepTimerTarget?.() || 0); }
  _getRemainingMs() { const t = this._getTarget(); return t > 0 ? Math.max(0, t - Date.now()) : 0; }
  _syncBadge() {
    const bg = document.getElementById('sleep-timer-badge'), btn = document.getElementById('sleep-timer-btn'); if (!bg || !btn) return;
    const rem = this._getRemainingMs(), mins = rem > 0 ? Math.ceil(rem / 60000) : 0;
    bg.style.display = mins > 0 ? 'block' : 'none'; bg.textContent = mins > 0 ? String(mins) : ''; btn.classList.toggle('active', mins > 0);
  }
  _handleReminder() {
    const rem = this._getRemainingMs();
    if (!rem || !this._state.remind5m || this._extendPromptOpen || rem > 5 * 60000 || rem < 4 * 60000 + 50000) return;
    this._extendPromptOpen = true; window.NotificationSystem?.info?.('Таймер закончится через 5 минут');
    const m = window.Modals?.open?.({ title: '', maxWidth: 360, bodyHtml: `<div class="sleep-remind-box"><div class="sleep-remind-icon">🌙</div><div class="sleep-remind-title">Таймер почти всё</div><div class="sleep-remind-sub">Музыка остановится через 5 минут</div><div class="sleep-remind-quick"><button class="sleep-remind-qbtn" data-ext="5">+5</button><button class="sleep-remind-qbtn" data-ext="15">+15</button><button class="sleep-remind-qbtn" data-ext="30">+30</button><button class="sleep-remind-qbtn" data-ext="60">+60</button></div><div class="sleep-remind-actions"><button class="om-btn om-btn--outline" data-act="change">Изменить время</button><button class="om-btn om-btn--danger" data-act="reset">Отключить таймер</button></div></div>` });
    if (!m) return;
    const cw = () => { this._extendPromptOpen = false; m.remove(); };
    m.addEventListener('click', e => { const ex = e.target.closest('[data-ext]')?.dataset?.ext, ac = e.target.closest('[data-act]')?.dataset?.act; if (ex) { this.extendMinutes(Number(ex)); cw(); } else if (ac === 'reset') { this.stop(false); cw(); } else if (ac === 'change') { cw(); setTimeout(() => this.show(), 100); } });
    const oR = m.remove.bind(m); m.remove = () => { this._extendPromptOpen = false; oR(); };
  }
  _getQuestsHtml() {
    const ae = window.achievementEngine; if (!ae?.achievements) return '';
    const qs = ae.achievements.filter(a => { if (a.isUnlocked || a.isHidden) return false; const pm = a.progressMeta; if (pm?.kind === 'time_accum') return pm.remainingMs <= 900000; return a.progress?.target ? (a.progress.target - (a.progress.current || 0)) <= 3 : false; }).sort((a,b) => (b.progress?.pct||0) - (a.progress?.pct||0)).slice(0, 2);
    return qs.length ? `<div class="sleep-quests-wrap"><div class="sm-cap">БЫСТРЫЕ ДОСТИЖЕНИЯ</div>${qs.map(a => `<div class="sleep-quest-row" data-qid="${a.id}"><div class="sq-icon">${a.icon}</div><div class="sq-info"><div class="sq-title">${a.name}</div><div class="sq-desc">${a.short}</div></div></div>`).join('')}</div>` : '';
  }
  show() {
    const isR = () => this._getRemainingMs() > 0;
    let drA = isR(), drM = drA ? Math.ceil(this._getRemainingMs() / 60000) : (this._state.lastDurationMin || 20);
    const m = window.Modals?.open?.({ title: '', maxWidth: 400, bodyHtml: `<div class="sleep-modal-wrapper"><div class="sleep-full"><div class="sleep-hero"><div class="sleep-hero-text"><div class="sleep-hero-title">Таймер сна</div><div class="sleep-hero-sub">Управление остановкой воспроизведения</div></div><label class="sleep-toggle-switch"><input type="checkbox" id="sm-toggle"><span class="sleep-toggle-slider"></span></label></div><div class="sleep-status-card"><div class="sleep-status-row"><span>Статус</span><strong id="sm-stat">Выключен</strong></div><div class="sleep-status-row"><span>Осталось</span><strong id="sm-rem">—</strong></div><div class="sleep-status-row"><span>Остановить в</span><strong id="sm-at">—</strong></div><div class="sleep-status-row"><span>Использован</span><strong>${this._state.usageCount ? `${this._state.usageCount} раз` : 'Нет'}</strong></div></div><div class="sleep-controls-card" id="sm-ctrls"><div class="sleep-input-row"><div class="sleep-label">Остановить через</div><div class="sleep-input-wrap mins"><input type="number" id="sm-inp-min" class="sleep-input" min="1" max="720"></div></div><div class="sleep-input-row"><div class="sleep-label">Точное время</div><div class="sleep-input-wrap"><input type="time" id="sm-inp-time" class="sleep-input"></div></div><label class="sleep-check"><input type="checkbox" id="sm-remind"><span>Напомнить за 5 минут до отключения</span></label><div style="display:flex;gap:10px;margin-top:6px"><button class="om-btn om-btn--outline" style="flex:1" id="sm-btn-close">Закрыть</button><button class="om-btn om-btn--primary" style="flex:1;display:none" id="sm-btn-apply">Установить</button></div></div>${this._getQuestsHtml()}</div></div>` });
    if (!m) return;
    const tgl = m.querySelector('#sm-toggle'), ctrl = m.querySelector('#sm-ctrls'), iMin = m.querySelector('#sm-inp-min'), iTim = m.querySelector('#sm-inp-time'), btnA = m.querySelector('#sm-btn-apply'), btnC = m.querySelector('#sm-btn-close'), remC = m.querySelector('#sm-remind');
    remC.checked = !!this._state.remind5m;
    const upd = () => { const ir = isR(); tgl.checked = drA; ctrl.className = `sleep-controls-card ${drA ? '' : 'disabled'}`; const d = new Date(Date.now() + drM * 60000), ts = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; if (document.activeElement !== iMin) iMin.value = drM; if (document.activeElement !== iTim) iTim.value = ts; m.querySelector('#sm-stat').textContent = drA ? (ir ? 'Активен' : 'Черновик') : 'Выключен'; m.querySelector('#sm-rem').textContent = drA ? `${drM} мин` : '—'; m.querySelector('#sm-at').textContent = drA ? ts : '—'; if (drA) { btnA.style.display = ''; btnA.textContent = ir ? 'Обновить' : 'Установить'; } else btnA.style.display = 'none'; };
    tgl.addEventListener('change', e => { drA = e.target.checked; if (!drA && isR()) { this.stop(true); drM = this._state.lastDurationMin || 20; } else if (drA && drM <= 0) drM = this._state.lastDurationMin || 20; upd(); });
    iMin.addEventListener('input', e => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v > 0) { drM = v; upd(); } });
    iTim.addEventListener('input', e => { const [h, min] = e.target.value.split(':').map(Number); if (isNaN(h) || isNaN(min)) return; const d = new Date(), tgt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min, 0); if (tgt <= d) tgt.setDate(tgt.getDate() + 1); drM = Math.max(1, Math.round((tgt.getTime() - Date.now()) / 60000)); upd(); });
    remC.addEventListener('change', e => { this._state.remind5m = !!e.target.checked; this._saveState(); });
    btnA.addEventListener('click', () => { if (drA) this.startMinutes(drM); m.remove(); });
    btnC.addEventListener('click', () => m.remove());
    m.addEventListener('click', e => { const qid = e.target.closest('.sleep-quest-row')?.dataset.qid; if (!qid) return; const q = window.achievementEngine?.achievements?.find(a => a.id === qid); if (!q) return; window.Modals?.confirm?.({ title: q.name, textHtml: `<b>Условие:</b> ${q.howTo}<br><br>Помочь с выполнением прямо сейчас?`, confirmText: 'Начать', cancelText: 'Отмена', onConfirm: () => { m.remove(); if (qid.startsWith('album_')) window.AlbumsManager?.loadAlbum?.(qid.replace('album_complete_', '')).then(() => setTimeout(() => window.playerCore?.play?.(0), 300)); this.startMinutes(30); } }); });
    const liveInt = setInterval(() => { if (isR() && drA && document.activeElement !== iMin && document.activeElement !== iTim) { const r = this._getRemainingMs(); if (r>0) { drM = Math.ceil(r/60000); upd(); } } }, 1000);
    const oR = m.remove.bind(m); m.remove = () => { clearInterval(liveInt); oR(); }; upd();
  }
  startMinutes(m) { if (!m || m < 1) return; const ms = m * 60000; this._state.lastDurationMin = m; this._saveState(); window.playerCore?.setSleepTimer?.(ms, { mode: 'minutes', minutes: m, remind5m: !!this._state.remind5m }); window.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'sleep_timer_set', mode: 'minutes', minutes: m }); this._syncBadge(); window.NotificationSystem?.info?.(`Таймер сна установлен на ${m} мин.`); }
  startAt(t) { const [h, m] = String(t).split(':').map(Number), d = new Date(), tgt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0); if (tgt <= d) tgt.setDate(tgt.getDate() + 1); const minutes = Math.max(1, Math.round((tgt.getTime() - Date.now()) / 60000)); this._state.lastDurationMin = minutes; this._saveState(); window.playerCore?.setSleepTimer?.(tgt.getTime() - Date.now(), { mode: 'clock', exactTime: t, remind5m: !!this._state.remind5m }); window.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'sleep_timer_set', mode: 'clock', minutes, exactTime: t }); this._syncBadge(); window.NotificationSystem?.info?.(`Таймер сна установлен на ${t}`); }
  extendMinutes(m) { const rem = this._getRemainingMs(); if (rem <= 0) return this.startMinutes(m); const nextMs = rem + m * 60000, nextMin = Math.ceil(nextMs / 60000); this._state.lastDurationMin = nextMin; this._saveState(); window.playerCore?.setSleepTimer?.(nextMs, { mode: 'extended', minutes: nextMin, remind5m: !!this._state.remind5m }); window.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'sleep_timer_extend', mode: 'extended', minutes: m, totalMinutes: nextMin }); this._syncBadge(); window.NotificationSystem?.success?.(`Таймер продлён на ${m} мин.`); }
  stop(notify = true) { const remMin = Math.ceil(this._getRemainingMs() / 60000); this._clearWarning(); window.playerCore?.clearSleepTimer?.(); window.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'sleep_timer_cancel', minutes: Math.max(0, remMin) }); this._syncBadge(); if (notify) window.NotificationSystem?.info?.('Таймер сна сброшен'); }
}
export const sleepTimerInstance = new SleepTimer(); window.SleepTimer = sleepTimerInstance;
