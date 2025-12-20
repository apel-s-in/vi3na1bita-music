// scripts/ui/sleep.js — Таймер сна
(function() {
  'use strict';
  let menu = null, interval = null;
  const PRESETS = [{ l: '5 мин', m: 5 }, { l: '10 мин', m: 10 }, { l: '15 мин', m: 15 }, { l: '30 мин', m: 30 }, { l: '1 час', m: 60 }, { l: '2 часа', m: 120 }];
  
  const fmtRemain = ts => { const m = Math.ceil((ts - Date.now()) / 60000); return m >= 60 ? `${Math.floor(m/60)}ч${m%60 ? ` ${m%60}м` : ''}` : `${m}м`; };
  
  const updateBadge = () => {
    const badge = document.getElementById('sleep-timer-badge'), ts = window.playerCore?.getSleepTimerTarget?.() || 0;
    if (!badge) return;
    if (ts > 0) { const m = Math.ceil((ts - Date.now()) / 60000); badge.textContent = m > 0 ? m : ''; badge.style.display = m > 0 ? '' : 'none'; }
    else badge.style.display = 'none';
  };
  
  const startInterval = () => { if (interval) return; interval = setInterval(() => { updateBadge(); const ts = window.playerCore?.getSleepTimerTarget?.() || 0; if (ts > 0 && ts <= Date.now()) clear(); }, 10000); };
  const stopInterval = () => { if (interval) { clearInterval(interval); interval = null; } };
  
  const set = min => {
    if (!window.playerCore) return;
    const ms = min * 60000;
    window.playerCore.setSleepTimer(ms);
    try { localStorage.setItem('sleepTimerTarget', String(Date.now() + ms)); } catch {}
    updateBadge(); startInterval();
  };
  
  const clear = () => {
    window.playerCore?.clearSleepTimer?.();
    try { localStorage.removeItem('sleepTimerTarget'); } catch {}
    stopInterval(); updateBadge();
  };
  
  const closeMenu = () => { if (menu?.parentNode) menu.parentNode.removeChild(menu); menu = null; document.removeEventListener('click', outsideClick); };
  const outsideClick = e => { if (menu && !menu.contains(e.target)) closeMenu(); };
  
  const openMenu = anchor => {
    menu = document.createElement('div');
    menu.className = 'sleep-menu';
    const rect = anchor.getBoundingClientRect();
    menu.style.cssText = `position:fixed;right:${Math.max(8, innerWidth - rect.right)}px;bottom:${Math.max(8, innerHeight - rect.top)}px`;
    
    let html = '';
    const ts = window.playerCore?.getSleepTimerTarget?.() || 0;
    if (ts > 0) html += `<div class="sleep-menu-item active" data-action="cancel">✅ ${fmtRemain(ts)}</div><div class="sleep-menu-item" data-action="clear">🚫 Выключить</div><div style="height:1px;background:rgba(255,255,255,0.1);margin:6px 0"></div>`;
    html += PRESETS.map(p => `<div class="sleep-menu-item" data-minutes="${p.m}">${p.l}</div>`).join('');
    menu.innerHTML = html;
    document.body.appendChild(menu);
    
    menu.querySelectorAll('.sleep-menu-item').forEach(it => it.addEventListener('click', e => {
      e.stopPropagation();
      const act = it.dataset.action, min = parseInt(it.dataset.minutes);
      if (act === 'clear') { clear(); closeMenu(); window.NotificationSystem?.info('⏰ Таймер выключен'); }
      else if (min > 0) { set(min); closeMenu(); window.NotificationSystem?.success(`⏰ Таймер: ${min} мин`); }
    }));
    setTimeout(() => document.addEventListener('click', outsideClick), 10);
  };
  
  const toggle = e => menu ? closeMenu() : openMenu(e.currentTarget);
  
  const init = () => {
    const btn = document.getElementById('sleep-timer-btn');
    if (!btn) { setTimeout(init, 100); return; }
    btn.addEventListener('click', toggle);
    window.playerCore?.on?.({ onSleepTriggered: () => { window.NotificationSystem?.info('⏰ Таймер сработал'); clear(); } });
    // Restore
    try {
      const saved = localStorage.getItem('sleepTimerTarget');
      if (saved) { const ts = parseInt(saved), rem = ts - Date.now(); if (rem > 0) { window.playerCore?.setSleepTimer(rem); updateBadge(); startInterval(); } else localStorage.removeItem('sleepTimerTarget'); }
    } catch {}
    console.log('✅ Sleep timer initialized');
  };
  
  window.SleepTimer = { setSleepTimer: set, clearSleepTimer: clear, updateBadge, show: () => { const btn = document.getElementById('sleep-timer-btn'); if (btn) toggle({ currentTarget: btn }); } };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
