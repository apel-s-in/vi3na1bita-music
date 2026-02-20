// Таймер сна: Оптимизированная версия с нативным input type="time"
(function () {
  'use strict';

  const W = window, U = W.Utils, LS = 'sleepTimerTarget';
  const $ = (id) => document.getElementById(id);
  const now = () => Date.now();
  const pad = (n) => String(n).padStart(2, '0');
  
  let menu = null, tickId = null;

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
      el.style.display = ''; el.textContent = Math.ceil(ms / 60000);
      if (!tickId) tickId = setInterval(updateBadge, 10000);
    } else {
      el.style.display = 'none'; el.textContent = '';
      if (tickId) { clearInterval(tickId); tickId = null; }
      if (ts > 0 && ms <= 0) stop(true);
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

  const toggleMenu = (btn) => {
    if (menu) { menu.remove(); menu = null; return; }
    
    const ts = getTs(), act = ts > now(), rect = btn.getBoundingClientRect();
    
    menu = document.createElement('div');
    menu.className = 'sleep-menu';
    Object.assign(menu.style, { 
      position: 'fixed', right: `${Math.max(8, W.innerWidth - rect.right)}px`, 
      bottom: `${Math.max(8, W.innerHeight - rect.top)}px`, zIndex: '10000'
    });
    
    menu.innerHTML = `
      ${act ? `<div class="sleep-menu-item active" data-a="noop">✅ Активен: ${fmtRem(ts - now())} (до ${fmtTime(ts)})</div>` : ''}
      <div class="sleep-menu-item" data-a="off">Выключить</div>
      <div style="height:1px;background:rgba(255,255,255,.1);margin:6px 0"></div>
      ${[15, 30, 45, 60].map(m => `<div class="sleep-menu-item" data-a="m" data-v="${m}">${m} мин</div>`).join('')}
      <div style="height:1px;background:rgba(255,255,255,.1);margin:6px 0"></div>
      <div class="sleep-menu-item" data-a="time">К времени…</div>
    `;

    setTimeout(() => {
        const outClick = (e) => { if (menu && !menu.contains(e.target) && !btn.contains(e.target)) cleanMenu(); };
        menu._outClick = outClick; document.addEventListener('click', outClick);
    }, 0);
    
    const cleanMenu = () => {
        if(menu?._outClick) document.removeEventListener('click', menu._outClick);
        if(menu) menu.remove(); menu = null;
    };

    menu.addEventListener('click', (e) => {
      const t = e.target.closest('[data-a]'); if (!t) return;
      e.stopPropagation(); const a = t.dataset.a;
      
      if (a === 'off') stop();
      else if (a === 'm') {
        const m = parseInt(t.dataset.v); set(now() + m * 60000);
        W.NotificationSystem?.success?.(`⏰ Таймер: ${m} мин`);
      } else if (a === 'time') {
        cleanMenu(); openTimeModal(); return;
      }
      if (a !== 'noop') cleanMenu();
    });

    document.body.appendChild(menu);
  };

  const openTimeModal = () => {
    const wrap = document.createElement('div');
    wrap.className = 'sleep-time-modal-backdrop';
    const def = new Date(now() + 30 * 60000);
    
    wrap.innerHTML = `
      <div class="sleep-time-modal" style="max-width:260px">
        <div class="sleep-time-title">Таймер к времени</div>
        <input id="stm-inp" type="time" value="${pad(def.getHours())}:${pad(def.getMinutes())}" style="width:100%;padding:12px;margin-bottom:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#fff;border-radius:8px;font-size:20px;text-align:center;color-scheme:dark;outline:none">
        <div class="sleep-time-actions">
          <button class="sleep-time-btn" data-a="c">Отмена</button>
          <button class="sleep-time-btn primary" data-a="ok">Ок</button>
        </div>
      </div>`;

    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const apply = () => {
      const v = wrap.querySelector('#stm-inp').value.split(':');
      if (v.length === 2) {
        const d = new Date(); d.setHours(v[0], v[1], 0, 0);
        if (d.getTime() <= now()) d.setDate(d.getDate() + 1);
        set(d.getTime());
        W.NotificationSystem?.success?.(`⏰ Таймер до ${v[0]}:${v[1]}`);
      }
      close();
    };

    const onKey = (e) => { if(e.key==='Enter') apply(); if(e.key==='Escape') close(); };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.dataset.a === 'c') close();
      if (e.target.dataset.a === 'ok') apply();
    });

    document.body.appendChild(wrap);
    document.addEventListener('keydown', onKey);
    setTimeout(() => wrap.querySelector('#stm-inp').focus(), 50);
  };

  const init = () => {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#sleep-timer-btn');
        if (btn) { e.stopPropagation(); toggleMenu(btn); }
    });

    const bindCore = () => {
      if (W.playerCore?.on) {
        W.playerCore.on({ onSleepTriggered: () => stop() });
        const saved = parseInt(localStorage.getItem(LS)||'0');
        if (saved > now()) W.playerCore.setSleepTimer(saved - now());
        else if (saved) stop(true);
        updateBadge();
      } else { setTimeout(bindCore, 200); }
    };
    bindCore();
  };

  W.SleepTimer = { show: () => $('sleep-timer-btn')?.click(), updateBadge, clearSleepTimer: () => stop(true) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
