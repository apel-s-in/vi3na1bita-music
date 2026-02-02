//=================================================
// FILE: /scripts/ui/sleep.js
// scripts/ui/sleep.js
// Таймер сна: Оптимизированная версия.
// Логика: пауза через PlayerCore. Режимы: 15/30/60 мин или HH:MM.
(function () {
  'use strict';

  const W = window, U = W.Utils, LS = 'sleepTimerTarget';
  const $ = (id) => document.getElementById(id);
  const now = () => Date.now();
  const pad = (n) => String(n).padStart(2, '0');
  
  // State
  let menu = null, tickId = null;

  // Helpers
  const getTs = () => {
    const pc = W.playerCore?.getSleepTimerTarget?.();
    return (pc && pc > 0) ? pc : parseInt(U.lsGet(LS, '0') || '0', 10);
  };

  const fmtRem = (ms) => {
    const m = Math.ceil(ms / 60000);
    return m < 60 ? `${m}м` : `${Math.floor(m / 60)}ч ${m % 60}м`;
  };

  const fmtTime = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const updateBadge = () => {
    const el = $('sleep-timer-badge'), ts = getTs(), ms = ts - now();
    if (!el) return;
    if (ts > 0 && ms > 0) {
      el.style.display = '';
      el.textContent = Math.ceil(ms / 60000);
      if (!tickId) tickId = setInterval(updateBadge, 10000);
    } else {
      el.style.display = 'none';
      el.textContent = '';
      if (tickId) { clearInterval(tickId); tickId = null; }
      if (ts > 0 && ms <= 0) stop(true); // Auto-clear if expired
    }
  };

  const set = (ts) => {
    if (!ts || ts <= now()) return;
    W.playerCore?.setSleepTimer?.(ts - now());
    U.lsSet(LS, ts);
    updateBadge();
  };

  const stop = (silent) => {
    W.playerCore?.clearSleepTimer?.();
    localStorage.removeItem(LS);
    updateBadge();
    if (!silent) W.NotificationSystem?.info?.('⏰ Таймер сна выключен');
  };

  // UI: Menu
  const toggleMenu = (btn) => {
    if (menu) { menu.remove(); menu = null; return; }
    
    const ts = getTs(), act = ts > now();
    const rect = btn.getBoundingClientRect();
    
    menu = document.createElement('div');
    menu.className = 'sleep-menu';
    Object.assign(menu.style, { position: 'fixed', right: `${Math.max(8, W.innerWidth - rect.right)}px`, bottom: `${Math.max(8, W.innerHeight - rect.top)}px` });
    
    menu.innerHTML = `
      ${act ? `<div class="sleep-menu-item active" data-a="noop">✅ Активен: ${fmtRem(ts - now())} (до ${fmtTime(ts)})</div>` : ''}
      <div class="sleep-menu-item" data-a="off">Выключить</div>
      <div style="height:1px;background:rgba(255,255,255,.1);margin:6px 0"></div>
      ${[15, 30, 60].map(m => `<div class="sleep-menu-item" data-a="m" data-v="${m}">${m} мин</div>`).join('')}
      <div style="height:1px;background:rgba(255,255,255,.1);margin:6px 0"></div>
      <div class="sleep-menu-item" data-a="time">К времени…</div>
    `;

    const close = () => { if (menu) { menu.remove(); menu = null; document.removeEventListener('click', outClick); } };
    const outClick = (e) => { if (menu && !menu.contains(e.target) && !btn.contains(e.target)) close(); };

    menu.addEventListener('click', (e) => {
      const t = e.target.closest('[data-a]');
      if (!t) return;
      e.stopPropagation();
      const a = t.dataset.a;
      
      if (a === 'off') stop();
      else if (a === 'm') {
        const m = parseInt(t.dataset.v);
        set(now() + m * 60000);
        W.NotificationSystem?.success?.(`⏰ Таймер: ${m} мин`);
      } else if (a === 'time') {
        openTimeModal();
      }
      if (a !== 'noop') close();
    });

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', outClick), 0);
  };

  // UI: Time Modal (HH:MM)
  const openTimeModal = () => {
    const wrap = document.createElement('div');
    wrap.className = 'sleep-time-modal-backdrop';
    // Default +30 min
    const def = new Date(now() + 30 * 60000), h = pad(def.getHours()), m = pad(def.getMinutes());
    
    wrap.innerHTML = `
      <div class="sleep-time-modal">
        <div class="sleep-time-title">Таймер к времени</div>
        <div class="sleep-time-row">
          <input id="sh" type="tel" maxlength="2" placeholder="HH" class="sleep-time-input" value="${h}">
          <span class="sleep-time-sep">:</span>
          <input id="sm" type="tel" maxlength="2" placeholder="MM" class="sleep-time-input" value="${m}">
        </div>
        <div class="sleep-time-actions">
          <button class="sleep-time-btn" data-a="c">Отмена</button>
          <button class="sleep-time-btn primary" data-a="ok">Ок</button>
        </div>
      </div>`;

    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const apply = () => {
      const hh = Math.min(23, parseInt(wrap.querySelector('#sh').value || '0')), mm = Math.min(59, parseInt(wrap.querySelector('#sm').value || '0'));
      const d = new Date(); d.setHours(hh, mm, 0, 0);
      if (d.getTime() <= now()) d.setDate(d.getDate() + 1);
      set(d.getTime());
      W.NotificationSystem?.success?.(`⏰ Таймер до ${pad(hh)}:${pad(mm)}`);
      close();
    };

    const onKey = (e) => { if(e.key==='Enter') apply(); if(e.key==='Escape') close(); };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.dataset.a === 'c') close();
      if (e.target.dataset.a === 'ok') apply();
    });

    document.body.appendChild(wrap);
    document.addEventListener('keydown', onKey);
    wrap.querySelector('#sh').focus();
  };

  // Init
  const init = () => {
    const btn = $('sleep-timer-btn');
    if (!btn) return setTimeout(init, 200);
    
    // Bind UI
    U.dom.on(btn, 'click', (e) => { e.stopPropagation(); toggleMenu(btn); });
    
    // Bind Core
    const bind = () => {
      if (W.playerCore?.on) {
        W.playerCore.on({ onSleepTriggered: () => stop() }); // Auto-stop handled by core logic
        const saved = parseInt(localStorage.getItem(LS)||'0');
        if (saved > now()) W.playerCore.setSleepTimer(saved - now());
        else if (saved) stop(true); // Expired while closed
        updateBadge();
      } else setTimeout(bind, 100);
    };
    bind();
    console.log('✅ SleepTimer optimized');
  };

  W.SleepTimer = { show: () => $('sleep-timer-btn')?.click(), updateBadge, clearSleepTimer: () => stop(true) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
