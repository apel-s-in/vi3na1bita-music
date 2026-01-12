// scripts/ui/sleep.js
// Таймер сна: остановка музыки по срабатыванию (через pause в PlayerCore).
// Режимы:
// - через фиксированное время: 15/30/60 минут
// - к конкретному часу: HH:MM (например, 01:30)
// UI: кнопка в панели плеера открывает меню.
// Инварианты: не вызывать stop/play/seek/volume — только playerCore.setSleepTimer/clearSleepTimer.

(function SleepTimerModule() {
  'use strict';

  const w = window;
  const U = w.Utils;

  const $ = (id) => (U?.dom?.byId ? U.dom.byId(id) : document.getElementById(id));
  const on = (el, ev, fn, opts) => { if (el) el.addEventListener(ev, fn, opts); };

  const LS_KEY = 'sleepTimerTarget'; // back-compat: уже используется текущим проектом (epoch ms)

  const PRESETS_MIN = [15, 30, 60];

  let menuEl = null;
  let tickId = null;
  let coreBound = false;

  function lsGetTarget() {
    try {
      const v = localStorage.getItem(LS_KEY);
      const n = parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  function lsSetTarget(ts) {
    try { localStorage.setItem(LS_KEY, String(ts)); } catch {}
  }

  function lsClearTarget() {
    try { localStorage.removeItem(LS_KEY); } catch {}
  }

  function clampInt(v, min, max, def) {
    const n = parseInt(String(v ?? ''), 10);
    const x = Number.isFinite(n) ? n : def;
    return Math.max(min, Math.min(max, x));
  }

  function formatHHMM(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function formatRemainingCompact(targetTs) {
    const ms = targetTs - Date.now();
    if (ms <= 0) return '0м';
    const totalMin = Math.ceil(ms / 60000);
    if (totalMin < 60) return `${totalMin}м`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m ? `${h}ч ${m}м` : `${h}ч`;
  }

  function computeTargetFromMinutes(minutes) {
    const m = clampInt(minutes, 1, 24 * 60, 15);
    return Date.now() + m * 60 * 1000;
  }

  function computeTargetToClock(h, m) {
    const hh = clampInt(h, 0, 23, 0);
    const mm = clampInt(m, 0, 59, 0);

    const now = new Date();
    const target = new Date(now);
    target.setHours(hh, mm, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return target.getTime();
  }

  function getTargetTs() {
    // Источник правды: playerCore, fallback — localStorage (чтобы переживать reload)
    const pc = w.playerCore;
    const fromCore = pc?.getSleepTimerTarget?.();
    if (Number.isFinite(fromCore) && fromCore > 0) return fromCore;
    return lsGetTarget();
  }

  function applyTargetTs(targetTs) {
    const pc = w.playerCore;
    if (!pc) return false;

    const ts = Number(targetTs) || 0;
    const ms = ts - Date.now();
    if (ms <= 0) return false;

    pc.setSleepTimer?.(ms);
    lsSetTarget(ts);
    startTicking();
    updateBadge();
    return true;
  }

  function clearTimer() {
    w.playerCore?.clearSleepTimer?.();
    lsClearTarget();
    stopTicking();
    updateBadge();
  }

  function restoreTimer() {
    const saved = lsGetTarget();
    if (!saved) return;

    const remaining = saved - Date.now();
    if (remaining > 0) {
      w.playerCore?.setSleepTimer?.(remaining);
      startTicking();
      updateBadge();
      return;
    }

    lsClearTarget();
    updateBadge();
  }

  function updateBadge() {
    const badge = $('sleep-timer-badge');
    if (!badge) return;

    const targetTs = getTargetTs();
    if (!targetTs || targetTs <= Date.now()) {
      badge.style.display = 'none';
      badge.textContent = '';
      return;
    }

    const min = Math.ceil((targetTs - Date.now()) / 60000);
    if (min <= 0) {
      badge.style.display = 'none';
      badge.textContent = '';
      return;
    }

    badge.textContent = String(min);
    badge.style.display = '';
  }

  function startTicking() {
    stopTicking();
    updateBadge();

    tickId = setInterval(() => {
      updateBadge();
      const t = getTargetTs();
      if (t && t <= Date.now()) {
        // подстраховка после сна вкладки
        clearTimer();
      }
    }, 10000);
  }

  function stopTicking() {
    if (!tickId) return;
    clearInterval(tickId);
    tickId = null;
  }

  function bindCoreOnce() {
    if (coreBound) return;
    const pc = w.playerCore;
    if (!pc?.on) return;

    coreBound = true;
    pc.on({
      onSleepTriggered: () => {
        // PlayerCore сам делает pause() — это и есть требуемая “остановка музыки”.
        w.NotificationSystem?.info?.('⏰ Таймер сна сработал');
        clearTimer();
      }
    });
  }

  // --------------------------
  // Menu UI
  // --------------------------
  function openMenu(anchor) {
    if (menuEl || !anchor) return;

    const targetTs = getTargetTs();
    const active = targetTs && targetTs > Date.now();

    const el = document.createElement('div');
    el.className = 'sleep-menu';

    const rect = anchor.getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    el.style.bottom = `${Math.max(8, window.innerHeight - rect.top)}px`;

    const head = active
      ? `
        <div class="sleep-menu-item active" data-act="noop">
          ✅ Активен: ${formatRemainingCompact(targetTs)} (до ${formatHHMM(targetTs)})
        </div>
      `
      : '';

    const off = `<div class="sleep-menu-item" data-act="off">Выключить</div>`;
    const sep = `<div style="height: 1px; background: rgba(255,255,255,0.1); margin: 6px 0;"></div>`;

    const presets = PRESETS_MIN
      .map(m => `<div class="sleep-menu-item" data-act="min" data-min="${m}">${m}</div>`)
      .join('');

    const toTime = `<div class="sleep-menu-item" data-act="totime">К времени…</div>`;

    el.innerHTML = `${head}${off}${sep}${presets}${sep}${toTime}`;

    on(el, 'click', (e) => {
      const item = e.target?.closest?.('.sleep-menu-item');
      if (!item || !el.contains(item)) return;
      e.stopPropagation();

      const act = String(item.dataset.act || '');

      if (act === 'off') {
        clearTimer();
        closeMenu();
        w.NotificationSystem?.info?.('⏰ Таймер сна выключен');
        return;
      }

      if (act === 'min') {
        const m = clampInt(item.dataset.min, 1, 24 * 60, 15);
        const ts = computeTargetFromMinutes(m);
        applyTargetTs(ts);
        closeMenu();
        w.NotificationSystem?.success?.(`⏰ Таймер: ${m} мин`);
        return;
      }

      if (act === 'totime') {
        closeMenu();
        openTimeDialog();
      }
    });

    // close outside
    setTimeout(() => document.addEventListener('click', onDocClickClose), 0);
    document.addEventListener('keydown', onEscOnce, { once: true });

    document.body.appendChild(el);
    menuEl = el;
  }

  function closeMenu() {
    if (!menuEl) return;
    try { menuEl.remove(); } catch {}
    menuEl = null;
    document.removeEventListener('click', onDocClickClose);
  }

  function onDocClickClose(e) {
    if (menuEl && !menuEl.contains(e.target)) closeMenu();
  }

  function onEscOnce(e) {
    if (e.key === 'Escape') closeMenu();
    else document.addEventListener('keydown', onEscOnce, { once: true });
  }

  function toggleMenu(anchor) {
    if (menuEl) closeMenu();
    else openMenu(anchor);
  }

  // --------------------------
  // Time dialog (HH:MM)
  // --------------------------
  function openTimeDialog() {
    const wrap = document.createElement('div');
    wrap.className = 'sleep-time-modal-backdrop';
    wrap.innerHTML = `
      <div class="sleep-time-modal" role="dialog" aria-modal="true" aria-label="Таймер сна к времени">
        <div class="sleep-time-title">Таймер сна к времени</div>
        <div class="sleep-time-row">
          <input id="sleep-time-hh" inputmode="numeric" maxlength="2" placeholder="HH" class="sleep-time-input">
          <span class="sleep-time-sep">:</span>
          <input id="sleep-time-mm" inputmode="numeric" maxlength="2" placeholder="MM" class="sleep-time-input">
        </div>
        <div class="sleep-time-actions">
          <button type="button" class="sleep-time-btn" data-act="cancel">Отмена</button>
          <button type="button" class="sleep-time-btn primary" data-act="ok">Ок</button>
        </div>
      </div>
    `;

    const hhEl = wrap.querySelector('#sleep-time-hh');
    const mmEl = wrap.querySelector('#sleep-time-mm');

    // Prefill: +30 минут
    const pre = new Date(Date.now() + 30 * 60000);
    if (hhEl) hhEl.value = String(pre.getHours()).padStart(2, '0');
    if (mmEl) mmEl.value = String(pre.getMinutes()).padStart(2, '0');

    const close = () => {
      document.removeEventListener('keydown', onKey);
      try { wrap.remove(); } catch {}
    };

    const ok = () => {
      const hh = clampInt(hhEl?.value, 0, 23, 0);
      const mm = clampInt(mmEl?.value, 0, 59, 0);
      const ts = computeTargetToClock(hh, mm);

      if (applyTargetTs(ts)) {
        w.NotificationSystem?.success?.(`⏰ Таймер до ${formatHHMM(ts)}`);
      }
      close();
    };

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Enter') { e.preventDefault(); ok(); }
    };

    on(wrap, 'click', (e) => {
      if (e.target === wrap) return close();

      const btn = e.target?.closest?.('button[data-act]');
      if (!btn) return;

      const act = String(btn.dataset.act || '');
      if (act === 'cancel') close();
      if (act === 'ok') ok();
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    setTimeout(() => hhEl?.focus?.(), 0);
  }

  // --------------------------
  // Public API
  // --------------------------
  function init() {
    const btn = $('sleep-timer-btn');
    if (!btn) {
      setTimeout(init, 100);
      return;
    }

    on(btn, 'click', (e) => toggleMenu(e.currentTarget));

    bindCoreOnce();
    restoreTimer();
    updateBadge();

    console.log('✅ Sleep timer initialized');
  }

  w.SleepTimer = {
    // back-compat: старый API принимал minutes
    setSleepTimer(minutes) {
      const ts = computeTargetFromMinutes(minutes);
      applyTargetTs(ts);
    },
    clearSleepTimer: clearTimer,
    updateBadge,
    show() {
      const btn = $('sleep-timer-btn');
      if (!btn) return;
      toggleMenu(btn);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
