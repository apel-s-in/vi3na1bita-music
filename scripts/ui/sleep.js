//=================================================
// FILE: /scripts/ui/sleep.js
// Таймер сна: Версия с делегированием событий (Fix dynamic UI)
// Логика: пауза через PlayerCore. UI: 15/30/60 мин или HH:MM.
(function () {
  'use strict';

  const W = window, U = W.Utils, LS = 'sleepTimerTarget';
  const $ = (id) => document.getElementById(id);
  const now = () => Date.now();
  const pad = (n) => String(n).padStart(2, '0');
  
  // State
  let menu = null, tickId = null;

  // --- Helpers ---
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
      if (ts > 0 && ms <= 0) stop(true); // Auto-clear
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

  // --- UI: Menu ---
  const toggleMenu = (btn) => {
    if (menu) { menu.remove(); menu = null; return; }
    
    const ts = getTs(), act = ts > now();
    const rect = btn.getBoundingClientRect();
    
    menu = document.createElement('div');
    menu.className = 'sleep-menu';
    // Позиционирование с защитой от вылета за экран
    Object.assign(menu.style, { 
      position: 'fixed', 
      right: `${Math.max(8, W.innerWidth - rect.right)}px`, 
      bottom: `${Math.max(8, W.innerHeight - rect.top)}px`,
      zIndex: '10000'
    });
    
    menu.innerHTML = `
      ${act ? `<div class="sleep-menu-item active" data-a="noop">✅ Активен: ${fmtRem(ts - now())} (до ${fmtTime(ts)})</div>` : ''}
      <div class="sleep-menu-item" data-a="off">Выключить</div>
      <div style="height:1px;background:rgba(255,255,255,.1);margin:6px 0"></div>
      ${[15, 30, 45, 60].map(m => `<div class="sleep-menu-item" data-a="m" data-v="${m}">${m} мин</div>`).join('')}
      <div style="height:1px;background:rgba(255,255,255,.1);margin:6px 0"></div>
      <div class="sleep-menu-item" data-a="time">К времени…</div>
    `;

    // Global click to close
    setTimeout(() => {
        const outClick = (e) => { 
            if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
                cleanMenu(); 
            }
        };
        // Сохраняем ссылку для очистки
        menu._outClick = outClick;
        document.addEventListener('click', outClick);
    }, 0);
    
    const cleanMenu = () => {
        if(menu?._outClick) document.removeEventListener('click', menu._outClick);
        if(menu) menu.remove();
        menu = null;
    };

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
        cleanMenu(); 
        openTimeModal();
        return;
      }
      if (a !== 'noop') cleanMenu();
    });

    document.body.appendChild(menu);
  };

  // --- UI: Time Modal (HH:MM) ---
  const openTimeModal = () => {
    const wrap = document.createElement('div');
    wrap.className = 'sleep-time-modal-backdrop';
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
      let hh = parseInt(wrap.querySelector('#sh').value || '0');
      let mm = parseInt(wrap.querySelector('#sm').value || '0');
      // Simple validation
      if(isNaN(hh)) hh=0; if(isNaN(mm)) mm=0;
      hh = Math.min(23, Math.max(0, hh));
      mm = Math.min(59, Math.max(0, mm));

      const d = new Date(); d.setHours(hh, mm, 0, 0);
      if (d.getTime() <= now()) d.setDate(d.getDate() + 1); // If time passed, set for tomorrow
      
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
    setTimeout(() => wrap.querySelector('#sh').focus(), 50);
  };

  // --- Init & Delegation ---
  const init = () => {
    // 1. Делегирование события клика (решает проблему перерисовки кнопки)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#sleep-timer-btn');
        if (btn) {
            e.stopPropagation();
            toggleMenu(btn);
        }
    });

    // 2. Связь с PlayerCore (для восстановления состояния при перезагрузке)
    const bindCore = () => {
      if (W.playerCore?.on) {
        W.playerCore.on({ onSleepTriggered: () => stop() });
        const saved = parseInt(localStorage.getItem(LS)||'0');
        if (saved > now()) W.playerCore.setSleepTimer(saved - now());
        else if (saved) stop(true); // Expired while app was closed
        updateBadge();
      } else {
        setTimeout(bindCore, 200);
      }
    };
    bindCore();

    console.log('✅ SleepTimer optimized (delegation fix)');
  };

  // Public API
  W.SleepTimer = { 
    show: () => $('sleep-timer-btn')?.click(), 
    updateBadge, 
    clearSleepTimer: () => stop(true) 
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
