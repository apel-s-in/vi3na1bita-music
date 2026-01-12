// scripts/ui/modal-templates.js
// Единый шаблон модалок (кроме Lyrics)
// API: window.Modals.open(), .confirm(), .actionRow()

(function ModalsModule() {
  'use strict';

  const U = window.Utils;

  const esc = (s) => {
    const fn = window.Utils?.escapeHtml;
    return (typeof fn === 'function') ? fn(String(s || '')) : String(s || '');
  };

  const on = (el, ev, fn, opts) => (U?.dom?.on ? U.dom.on(el, ev, fn, opts) : (function() {
    if (!el) return () => {};
    el.addEventListener(ev, fn, opts);
    return () => { try { el.removeEventListener(ev, fn, opts); } catch {} };
  })());

  function getContainer() {
    return document.getElementById('modals-container') || document.body;
  }

  /**
   * Создать модалку
   * @param {Object} opts
   * @param {string} opts.title - заголовок
   * @param {string} opts.bodyHtml - HTML содержимого
   * @param {number} opts.maxWidth - макс. ширина (px)
   * @param {Function} opts.onClose - callback при закрытии
   * @returns {HTMLElement} элемент модалки
   */
  function open(opts = {}) {
    const {
      title = '',
      bodyHtml = '',
      maxWidth = 480,
      onClose = null
    } = opts;

    const bg = document.createElement('div');
    bg.className = 'modal-bg active';

    bg.innerHTML = `
      <div class="modal-feedback" style="max-width: ${maxWidth}px;">
        <button class="bigclose" title="Закрыть" aria-label="Закрыть">
          <svg viewBox="0 0 48 48">
            <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
            <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          </svg>
        </button>
        ${title ? `<h2 style="margin-top:0; color:#4daaff;">${esc(title)}</h2>` : ''}
        <div class="modal-body">${bodyHtml}</div>
      </div>
    `;

    const close = () => {
      try { bg.remove(); } catch {}
      if (typeof onClose === 'function') onClose();
    };

    on(bg, 'click', (e) => {
      if (e.target === bg) close();
    });

    const closeBtn = bg.querySelector('.bigclose');
    on(closeBtn, 'click', close);

    getContainer().appendChild(bg);
    return bg;
  }

  /**
   * Модалка подтверждения
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} opts.textHtml
   * @param {string} opts.confirmText
   * @param {string} opts.cancelText
   * @param {boolean} opts.danger - красная кнопка подтверждения
   * @param {Function} opts.onConfirm
   * @param {Function} opts.onCancel
   */
  function confirm(opts = {}) {
    const {
      title = 'Подтверждение',
      textHtml = '',
      confirmText = 'Да',
      cancelText = 'Отмена',
      danger = false,
      onConfirm = null,
      onCancel = null
    } = opts;

    const btnStyle = danger
      ? 'background:#E80100; color:#fff;'
      : 'background:#4daaff; color:#fff;';

    const modal = open({
      title,
      maxWidth: 400,
      bodyHtml: `
        <div style="color:#9db7dd; line-height:1.5; margin-bottom:20px;">
          ${textHtml}
        </div>
        <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
          <button class="offline-btn" data-act="cancel" style="min-width:120px;">${esc(cancelText)}</button>
          <button class="offline-btn" data-act="confirm" style="min-width:120px; ${btnStyle}">${esc(confirmText)}</button>
        </div>
      `,
      onClose: onCancel
    });

    on(modal.querySelector('[data-act="cancel"]'), 'click', () => {
      try { modal.remove(); } catch {}
      if (typeof onCancel === 'function') onCancel();
    });

    on(modal.querySelector('[data-act="confirm"]'), 'click', () => {
      try { modal.remove(); } catch {}
      if (typeof onConfirm === 'function') onConfirm();
    });

    return modal;
  }

  /**
   * Генератор строки кнопок
   * @param {Array} buttons - [{ act, text, className, style }]
   * @returns {string} HTML
   */
  function actionRow(buttons = []) {
    if (!Array.isArray(buttons) || !buttons.length) return '';

    const btns = buttons.map(b => {
      const act = esc(b.act || '');
      const text = esc(b.text || 'Кнопка');
      const cls = b.className || '';
      const style = b.style || '';
      return `<button class="offline-btn ${cls}" data-act="${act}" style="${style}">${text}</button>`;
    }).join('');

    return `<div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-top:16px;">${btns}</div>`;
  }

  /**
   * Привязка действий к data-act кнопкам.
   * Возвращает unbind-функцию (на будущее: централизованно чистить обработчики).
   */
  function bindActions(modalEl, actions = {}) {
    if (!modalEl || !actions || typeof actions !== 'object') return () => {};

    const unsubs = [];

    Object.keys(actions).forEach((act) => {
      const fn = actions[act];
      if (typeof fn !== 'function') return;

      modalEl.querySelectorAll(`[data-act="${CSS.escape(act)}"]`).forEach((el) => {
        const off = on(el, 'click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          try { fn(e); } catch {}
        });
        unsubs.push(off);
      });
    });

    return () => {
      unsubs.forEach((off) => { try { off(); } catch {} });
    };
  }

  function offlineBody(state = {}) {
    const s = state || {};
    const net = s.net || { online: false, kind: 'unknown' };
    const cq = String(s.cq || 'hi');
    const isOff = !!s.isOff;
    const cloud = s.cloud || { n: 5, d: 31 };
    const policy = s.policy || {};
    const limit = s.limit || { mode: 'auto', mb: 500 };
    const breakdown = s.breakdown || null;
    const cacheSizeBytes = Number(s.cacheSizeBytes || 0) || 0;
    const swSize = s.swSize || { size: 0, approx: false };
    const qst = s.qst || { downloadingKey: null, queued: 0, paused: false };
    const needsUpdateCount = Number(s.needsUpdateCount || 0) || 0;
    const needsReCacheCount = Number(s.needsReCacheCount || 0) || 0;
    const albums = Array.isArray(s.albums) ? s.albums : [];
    const statsTotalLabel = String(s.statsTotalLabel || '—');

    const fmtBytes = (n) => {
      if (window.Utils?.formatBytes) return window.Utils.formatBytes(n);
      const fn = window.UIUtils?.formatBytes;
      return typeof fn === 'function' ? fn(n) : String(n || 0);
    };

    return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px;">
        <div style="font-weight:900; color:#8ab8fd;">Сеть: <span id="om-net-label">${esc(net.online ? 'online' : 'offline')} (${esc(net.kind || 'unknown')})</span></div>
        <div style="font-size:12px; color:#9db7dd;">CQ=<span id="om-cq-label">${esc(cq)}</span></div>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px;">

        <!-- A -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">A) Offline mode</div>
          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="om-offline-mode" ${isOff ? 'checked' : ''}>
            <span>Включить OFFLINE mode</span>
          </label>
          <div style="font-size:12px; color:#9db7dd; margin-top:6px;">
            OFFLINE=OFF: стриминг. Кэш не удаляется автоматически.
          </div>
        </div>

        <!-- B -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">B) Cache quality (CQ)</div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <select id="om-cq">
              <option value="hi" ${cq === 'hi' ? 'selected' : ''}>Hi</option>
              <option value="lo" ${cq === 'lo' ? 'selected' : ''}>Lo</option>
            </select>
            <button class="offline-btn" id="om-cq-save">Сохранить CQ</button>
          </div>
          <div style="font-size:12px; color:#9db7dd; margin-top:6px;">
            При смене CQ будет запущен тихий re-cache pinned/cloud (P3).
          </div>
        </div>

        <!-- C -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">C) Cloud settings</div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label style="display:flex; gap:8px; align-items:center;">
              N <input type="number" id="om-cloud-n" min="1" max="50" value="${Number(cloud.n) || 5}">
            </label>
            <label style="display:flex; gap:8px; align-items:center;">
              D <input type="number" id="om-cloud-d" min="1" max="365" value="${Number(cloud.d) || 31}">
            </label>
            <button class="offline-btn" id="om-cloud-save">Сохранить</button>
          </div>
        </div>

        <!-- D -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">D) Network policy</div>

          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="om-pol-wifiOnly" ${policy.wifiOnly ? 'checked' : ''}>
            <span>Wi‑Fi only</span>
          </label>

          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="om-pol-allowMobile" ${policy.allowMobile ? 'checked' : ''}>
            <span>Разрешить mobile</span>
          </label>

          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="om-pol-confirmOnMobile" ${policy.confirmOnMobile ? 'checked' : ''}>
            <span>Confirm на mobile</span>
          </label>

          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="om-pol-saveDataBlock" ${policy.saveDataBlock ? 'checked' : ''}>
            <span>Блокировать при Save‑Data</span>
          </label>

          <button class="offline-btn" id="om-pol-save" style="margin-top:8px;">Сохранить policy</button>

          <div style="font-size:12px; color:#9db7dd; margin-top:6px;">
            Unknown сеть для массовых операций — confirm (ТЗ).
          </div>
        </div>

        <!-- E -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">E) Cache limit + breakdown</div>

          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <select id="om-limit-mode">
              <option value="auto" ${limit.mode === 'auto' ? 'selected' : ''}>auto</option>
              <option value="manual" ${limit.mode === 'manual' ? 'selected' : ''}>manual (MB)</option>
            </select>
            <input type="number" id="om-limit-mb" min="50" max="5000" value="${limit.mb}" ${limit.mode === 'manual' ? '' : 'disabled'}>
            <button class="offline-btn" id="om-limit-save">Сохранить</button>
          </div>

          <div style="font-size:12px; color:#9db7dd; margin-top:10px; line-height:1.5;">
            <div>audio total: <b id="om-e-audio-total">${fmtBytes(cacheSizeBytes)}</b></div>
            ${breakdown ? `
              <div>pinned: <b id="om-e-pinned">${fmtBytes(breakdown.pinnedBytes)}</b></div>
              <div>cloud: <b id="om-e-cloud">${fmtBytes(breakdown.cloudBytes)}</b></div>
              <div>transient window: <b id="om-e-tw">${fmtBytes(breakdown.transientWindowBytes)}</b></div>
              <div>transient extra: <b id="om-e-te">${fmtBytes(breakdown.transientExtraBytes)}</b></div>
              <div>transient unknown: <b id="om-e-tu">${fmtBytes(breakdown.transientUnknownBytes)}</b></div>
            ` : `<div>breakdown: <i>недоступен</i></div>`}
            <div>other (SW cache): <b id="om-e-sw-total">${fmtBytes(swSize.size || 0)}</b> ${swSize.approx ? '(approx)' : ''}</div>
          </div>
        </div>

        <!-- F -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">F) Загрузки</div>
          <div style="font-size:12px; color:#9db7dd; line-height:1.5;">
            <div>Скачивается сейчас: <b id="om-f-downloading">${esc(qst.downloadingKey || '—')}</b></div>
            <div>В очереди: <b id="om-f-queued">${Number(qst.queued || 0)}</b></div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
            <button class="offline-btn" id="om-queue-toggle">${qst.paused ? 'Возобновить' : 'Пауза'}</button>
          </div>
        </div>

        <!-- G -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">G) Обновления</div>
          <div style="font-size:12px; color:#9db7dd; line-height:1.5;">
            <div>needsUpdate: <b id="om-g-needsUpdate">${needsUpdateCount}</b></div>
            <div>needsReCache (CQ mismatch): <b id="om-g-needsReCache">${needsReCacheCount}</b></div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
            <button class="offline-btn" id="om-upd-all">Обновить все файлы</button>
            <button class="offline-btn" id="om-recache-all">Re-cache по CQ</button>
          </div>
          <div style="font-size:12px; color:#9db7dd; margin-top:6px;">
            Обновления и re-cache выполняются тихо, без влияния на playback.
          </div>
        </div>

        <!-- H -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">H) Очистка кэша</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="offline-btn" id="om-clear-all" style="background:#E80100; color:#fff;">Очистить всё</button>
          </div>
          <div style="font-size:12px; color:#9db7dd; margin-top:6px;">
            Двойное подтверждение для "очистить всё" (и для pinned) — по ТЗ.
          </div>
        </div>

        <!-- I -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">I) 100% OFFLINE</div>

          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <select id="om-full-mode">
              <option value="favorites">только ИЗБРАННОЕ</option>
              <option value="albums">выбранные альбомы</option>
            </select>
            <button class="offline-btn" id="om-full-est">Оценить</button>
            <button class="offline-btn" id="om-full-start" style="background:#27b34c; color:#fff;">Старт</button>
          </div>

          <div id="om-albums-box" style="margin-top:10px; display:none; max-height:140px; overflow:auto; border:1px solid rgba(255,255,255,0.10); border-radius:10px; padding:8px;">
            ${albums.length ? albums.map(a => `
              <label style="display:flex; gap:10px; align-items:center; margin:6px 0; cursor:pointer;">
                <input type="checkbox" class="om-alb" data-k="${esc(a.key)}">
                <span>${esc(a.title)}</span>
              </label>
            `).join('') : `<div style="font-size:12px; color:#9db7dd;">albumsIndex пуст</div>`}
          </div>

          <div id="om-full-out" style="margin-top:10px; font-size:12px; color:#9db7dd;">Оценка: —</div>

          <div style="font-size:12px; color:#9db7dd; margin-top:8px;">
            100% OFFLINE = CQ=${esc(cq)} + shell/ассеты через SW. При невозможности гарантировать место — не стартуем (ТЗ iOS).
          </div>
        </div>

        <!-- Stats footer -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">Статистика</div>
          <div style="font-size:12px; color:#9db7dd; line-height:1.5;">
            <div>globalTotalListenSeconds: <b id="om-stats-total">${esc(statsTotalLabel)}</b></div>
          </div>
        </div>

      </div>
    `;
  }

  window.Modals = {
    open,
    confirm,
    actionRow,
    bindActions,
    offlineBody
  };

  console.log('✅ Modals helper loaded');
})();
