(function () {
  'use strict';
  const W = window, ls = localStorage, LS = 'sleepTimerTarget', pad = n => String(n).padStart(2, '0');
  const $ = id => document.getElementById(id), now = () => Date.now();
  let menu = null, tickId = null;

  const getTs = () => (W.playerCore?.getSleepTimerTarget?.() > 0) ? W.playerCore.getSleepTimerTarget() : parseInt(ls.getItem(LS)||'0', 10);
  const set = ts => { if (ts > now()) { W.playerCore?.setSleepTimer?.(ts - now()); ls.setItem(LS, ts); updateBadge(); } };
  const stop = (silent) => { W.playerCore?.clearSleepTimer?.(); ls.removeItem(LS); updateBadge(); if(!silent) W.NotificationSystem?.info?.('⏰ Таймер сна выключен'); };

  const updateBadge = () => {
    const el = $('sleep-timer-badge'), ts = getTs(), ms = ts - now();
    if (!el) return;
    if (ts > 0 && ms > 0) {
      el.style.display = ''; el.textContent = Math.ceil(ms / 60000);
      if (!tickId) tickId = setInterval(updateBadge, 10000);
    } else {
      el.style.display = 'none'; el.textContent = '';
      if (tickId) { clearInterval(tickId); tickId = null; }
      if (ts > 0) stop(true);
    }
  };

  const toggleMenu = btn => {
    if (menu) { menu.remove(); menu = null; return; }
    const ts = getTs(), ms = ts - now(), act = ms > 0, r = btn.getBoundingClientRect();
    menu = document.createElement('div');
    menu.className = 'sleep-menu';
    menu.style.cssText = `position:fixed;right:${Math.max(8, W.innerWidth - r.right)}px;bottom:${Math.max(8, W.innerHeight - r.top)}px;z-index:10000`;
    menu.innerHTML = (act ? `<div class="sleep-menu-item active" data-a="noop">✅ Активен: ${Math.ceil(ms/60000)}м</div>` : '') +
      `<div class="sleep-menu-item" data-a="off">Выключить</div><div style="height:1px;background:rgba(255,255,255,.1);margin:6px 0"></div>` +
      [15,30,45,60].map(m => `<div class="sleep-menu-item" data-a="m" data-v="${m}">${m} мин</div>`).join('') +
      `<div style="height:1px;background:rgba(255,255,255,.1);margin:6px 0"></div><div class="sleep-menu-item" data-a="time">К времени…</div>`;
    
    const outClick = e => { if (menu && !menu.contains(e.target) && !btn.contains(e.target)) { menu.remove(); menu = null; document.removeEventListener('click', outClick); } };
    setTimeout(() => document.addEventListener('click', outClick), 0);

    menu.onclick = e => {
      const t = e.target.closest('[data-a]'); if (!t) return;
      e.stopPropagation(); const a = t.dataset.a;
      if (a === 'off') stop();
      else if (a === 'm') { set(now() + parseInt(t.dataset.v) * 60000); W.NotificationSystem?.success?.(`⏰ Таймер: ${t.dataset.v} мин`); }
      else if (a === 'time') { menu.remove(); menu = null; openTimeModal(); return; }
      if (a !== 'noop') { menu.remove(); menu = null; document.removeEventListener('click', outClick); }
    };
    document.body.appendChild(menu);
  };

  const openTimeModal = () => {
    const wrap = document.createElement('div');
    wrap.className = 'sleep-time-modal-backdrop';
    const def = new Date(now() + 30 * 60000);
    wrap.innerHTML = `<div class="sleep-time-modal" style="max-width:260px"><div class="sleep-time-title">Таймер к времени</div><input id="stm-inp" type="time" value="${pad(def.getHours())}:${pad(def.getMinutes())}" style="width:100%;padding:12px;margin-bottom:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#fff;border-radius:8px;font-size:20px;text-align:center;color-scheme:dark;outline:none"><div class="sleep-time-actions"><button class="sleep-time-btn" data-a="c">Отмена</button><button class="sleep-time-btn primary" data-a="ok">Ок</button></div></div>`;
    
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const apply = () => {
      const v = wrap.querySelector('#stm-inp').value.split(':');
      if (v.length === 2) {
        const d = new Date(); d.setHours(v[0], v[1], 0, 0);
        if (d.getTime() <= now()) d.setDate(d.getDate() + 1);
        set(d.getTime()); W.NotificationSystem?.success?.(`⏰ Таймер до ${v[0]}:${v[1]}`);
      }
      close();
    };

    const onKey = e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') close(); };
    wrap.onclick = e => { if (e.target === wrap || e.target.dataset.a === 'c') close(); if (e.target.dataset.a === 'ok') apply(); };
    
    document.body.appendChild(wrap);
    document.addEventListener('keydown', onKey);
    setTimeout(() => wrap.querySelector('#stm-inp').focus(), 50);
  };

  const init = () => {
    document.addEventListener('click', e => { const b = e.target.closest('#sleep-timer-btn'); if (b) { e.stopPropagation(); toggleMenu(b); } });
    const bind = () => {
      if (W.playerCore?.on) {
        W.playerCore.on({ onSleepTriggered: () => stop() });
        const saved = parseInt(ls.getItem(LS)||'0', 10);
        if (saved > now()) W.playerCore.setSleepTimer(saved - now());
        else if (saved) stop(true);
        updateBadge();
      } else setTimeout(bind, 200);
    };
    bind();
  };

  W.SleepTimer = { show: () => $('sleep-timer-btn')?.click(), updateBadge, clearSleepTimer: () => stop(true) };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
