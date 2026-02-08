/**
 * offline-modal.js — v3.3 (clean, no dupes)
 *
 * Оптимизация:
 * - убраны мёртвые ветки (removeCachedTrack/unpinTrack/removeCloudTrack, OfflineIndicators.*)
 * - единая логика удаления трека через om.removeCached(uid) (это ваш реальный API)
 * - минимизированы обработчики событий и повторяющийся код
 * - секция background presets оставлена визуально, но отключена (в OfflineManager нет API)
 *
 * Инвариант: не трогаем воспроизведение (никаких stop/play/seek).
 */
import { getOfflineManager } from '../offline/offline-manager.js';
import * as Net from '../offline/net-policy.js';

let _overlay = null;

const DAY_MS = 86400000;

const esc = (s) => window.Utils?.escapeHtml?.(String(s ?? '')) ?? String(s ?? '');

function fmtB(b) {
  const n = Number(b) || 0;
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' МБ';
  if (n >= 1024) return (n / 1024).toFixed(0) + ' КБ';
  return n + ' Б';
}
function fmtMB(b) {
  const n = Number(b) || 0;
  const mb = n / 1048576;
  if (mb < 0.1 && n > 0) return '< 0.1 МБ';
  return mb.toFixed(1) + ' МБ';
}
function plTr(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return 'треков';
  if (m10 === 1) return 'трек';
  if (m10 >= 2 && m10 <= 4) return 'трека';
  return 'треков';
}

function _close() {
  if (!_overlay) return;
  _overlay.querySelector('.om-modal')?.classList.remove('om-modal--visible');
  _overlay.classList.remove('om-overlay--visible');
  const ref = _overlay;
  setTimeout(() => ref.remove(), 250);
  _overlay = null;
}

function _confirm(title, html, okText, onOk) {
  const bg = document.createElement('div');
  bg.className = 'om-confirm-bg';
  bg.innerHTML = `
    <div class="om-confirm-box">
      <div class="om-confirm-title">${title}</div>
      <div class="om-confirm-body">${html}</div>
      <div class="om-confirm-btns">
        <button class="om-btn om-btn--ghost" data-role="cancel">Отмена</button>
        <button class="om-btn om-btn--primary" data-role="ok">${okText}</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  requestAnimationFrame(() => bg.classList.add('om-confirm-bg--visible'));

  const close = () => {
    bg.classList.remove('om-confirm-bg--visible');
    setTimeout(() => bg.remove(), 200);
  };

  bg.addEventListener('click', (e) => {
    if (e.target === bg) return close();
    const r = e.target.closest('[data-role]')?.dataset.role;
    if (r === 'cancel') close();
    if (r === 'ok') {
      close();
      onOk();
    }
  });
}

async function _refreshStorage(modal, om) {
  try {
    const { estimateUsage } = await import('../offline/cache-db.js');
    const est = await estimateUsage();
    const v = modal.querySelector('#om-st-val');
    if (v) v.textContent = `${fmtMB(est.used)} / ${fmtMB(est.quota)}`;

    if (!om.getStorageBreakdown) return;
    const s = await om.getStorageBreakdown();
    const total = (s.pinned || 0) + (s.cloud || 0) + (s.transient || 0) + (s.other || 0);
    const pct = (x) => (total > 0 ? Math.max(0.4, (x / total) * 100) : 0);

    const sp = modal.querySelector('#om-seg-pinned');
    const sc = modal.querySelector('#om-seg-cloud');
    const st = modal.querySelector('#om-seg-trans');
    const so = modal.querySelector('#om-seg-other');

    if (sp) sp.style.width = total > 0 && s.pinned > 0 ? pct(s.pinned) + '%' : '0%';
    if (sc) sc.style.width = total > 0 && s.cloud > 0 ? pct(s.cloud) + '%' : '0%';
    if (st) st.style.width = total > 0 && s.transient > 0 ? pct(s.transient) + '%' : '0%';
    if (so) so.style.width = total > 0 && s.other > 0 ? pct(s.other) + '%' : '0%';

    const lg = modal.querySelector('#om-st-legend');
    if (lg) {
      const items = [
        ['pinned', '🔒', s.pinned],
        ['cloud', '☁', s.cloud],
        ['transient', '⏳', s.transient],
        ['other', '📁', s.other]
      ].filter((x) => x[2] > 0);

      lg.innerHTML = items
        .map(
          ([cls, ic, val]) =>
            `<span class="om-legend-item"><span class="om-legend-dot om-legend-dot--${cls}"></span>${ic} ${fmtB(val)}</span>`
        )
        .join('');
    }

    const bd = modal.querySelector('#om-st-bd');
    if (bd) {
      bd.innerHTML = [
        ['🔒', 'Закреплённые', s.pinned],
        ['☁', 'Облачные', s.cloud],
        ['⏳', 'PlaybackCache', s.transient],
        ['📁', 'Прочее', s.other]
      ]
        .map(([i, l, val]) => `<div class="om-bd-row"><span class="om-bd-icon">${i}</span> ${l} <span class="om-bd-val">${fmtB(val)}</span></div>`)
        .join('');
    }
  } catch (e) {
    console.warn('[OM] storage err:', e);
  }
}

async function _renderList(modal, om) {
  const el = modal.querySelector('#pinned-cloud-list');
  if (!el) return;

  el.innerHTML = '<div class="om-list-loading">Загрузка...</div>';

  try {
    const { getAllTrackMetas } = await import('../offline/cache-db.js');
    const metas = await getAllTrackMetas();
    const now = Date.now();

    const sorted = [
      ...metas.filter((m) => m.type === 'pinned').sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0)),
      ...metas.filter((m) => m.type === 'cloud').sort((a, b) => (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0))
    ];

    if (!sorted.length) {
      el.innerHTML = '<div class="om-list-empty">Нет закреплённых или облачных треков</div>';
      return;
    }

    let h = '';
    for (const m of sorted) {
      const ic = m.type === 'pinned' ? '🔒' : '☁';
      const t = window.TrackRegistry?.getTrackByUid?.(m.uid)?.title || m.uid;
      const mq = String(m.quality || '—').toUpperCase();
      const sz = fmtB(m.size || 0);

      let badge = '';
      if (m.type === 'pinned') {
        badge = '<span class="om-list-badge om-list-badge--pin">Закреплён</span>';
      } else if (m.cloudExpiresAt) {
        const d = Math.max(0, Math.ceil((m.cloudExpiresAt - now) / DAY_MS));
        badge = `<span class="om-list-badge om-list-badge--cloud">${d} дн.</span>`;
      }

      h += `
        <div class="om-list-item" data-uid="${esc(m.uid)}">
          <span class="om-list-icon">${ic}</span>
          <span class="om-list-title">${esc(t)}</span>
          <span class="om-list-meta">${mq} · ${sz}</span>
          ${badge}
          <button class="om-list-del" data-action="del-track" data-uid="${esc(m.uid)}" data-type="${esc(m.type)}" title="Удалить">✕</button>
        </div>
      `;
    }

    h += '<div class="om-divider" style="margin:10px 0 8px"></div>';
    h += '<button class="om-btn om-btn--danger-outline" data-action="del-all" style="width:100%">🗑 Удалить все 🔒 и ☁</button>';

    el.innerHTML = h;
  } catch (e) {
    console.warn('[OM] render list failed:', e);
    el.innerHTML = '<div class="om-list-empty" style="color:#ef5350">Ошибка загрузки</div>';
  }
}

function render() {
  if (_overlay) return;

  const om = getOfflineManager();
  const ns = Net.getNetPolicyState();
  const pl = Net.getPlatform();
  const q = om.getQuality();
  const mode = om.getMode();
  const { N, D } = om.getCloudSettings();

  const overlay = document.createElement('div');
  overlay.className = 'om-overlay';

  const modal = document.createElement('div');
  modal.className = 'om-modal';

  modal.innerHTML = `
    <div class="om-header">
      <div class="om-header__title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>OFFLINE</span>
      </div>
      <button class="om-header__close" aria-label="Закрыть">&times;</button>
    </div>
    <div class="om-body" id="om-body"></div>
  `;

  const body = modal.querySelector('#om-body');

  // 1) Storage
  body.insertAdjacentHTML(
    'beforeend',
    `
    <section class="om-section">
      <h3 class="om-section__title"><span class="om-section__icon">📦</span> Хранилище</h3>
      <div class="om-storage-info" id="om-storage-info">
        <div class="om-storage-row">
          <span class="om-storage-label">Занято</span>
          <span class="om-storage-value" id="om-st-val">—</span>
        </div>
        <div class="om-storage-segbar" id="om-st-segbar" title="Нажмите для подробностей">
          <div class="om-segbar__fill om-segbar--pinned" id="om-seg-pinned" style="width:0%"></div>
          <div class="om-segbar__fill om-segbar--cloud" id="om-seg-cloud" style="width:0%"></div>
          <div class="om-segbar__fill om-segbar--transient" id="om-seg-trans" style="width:0%"></div>
          <div class="om-segbar__fill om-segbar--other" id="om-seg-other" style="width:0%"></div>
        </div>
        <div class="om-storage-legend" id="om-st-legend"></div>
        <div class="om-storage-detail" id="om-st-detail" style="display:none">
          <div class="om-storage-breakdown" id="om-st-bd"></div>
          <button class="om-btn om-btn--danger" data-action="nuke" style="width:100%;margin-top:12px">Очистить ВЕСЬ кэш приложения</button>
        </div>
      </div>
    </section>
  `
  );
  _refreshStorage(modal, om);

  // 2) Net policy
  let nb = '';
  if (pl.hasNetInfo) {
    const sp = Net.getNetworkSpeed();
    const lb = Net.getNetworkLabel();
    if (sp) nb += `<div class="om-net-speed">${esc(lb)} · ~${sp} Мбит/с</div>`;
  }

  if (pl.supportsNetControl) {
    nb += `
      <div class="om-toggles-row">
        <button class="om-toggle ${ns.wifiEnabled ? 'om-toggle--on' : 'om-toggle--off'}" data-action="toggle-wifi">
          <span class="om-toggle__dot"></span><span class="om-toggle__label">Ethernet / Wi-Fi</span>
        </button>
        <button class="om-toggle ${ns.cellularEnabled ? 'om-toggle--on' : 'om-toggle--off'}" data-action="toggle-cell">
          <span class="om-toggle__dot"></span><span class="om-toggle__label">Cellular</span>
        </button>
      </div>
      <button class="om-toggle-small ${ns.cellularToast ? 'om-toggle-small--on' : ''}" data-action="toggle-toast">
        🔔 Уведомления при Cellular: ${ns.cellularToast ? 'ВКЛ' : 'ВЫКЛ'}
      </button>
    `;
  } else {
    nb += `
      <div class="om-net-unsupported">Управление сетью ограничено ОС</div>
      <button class="om-toggle ${ns.killSwitch ? 'om-toggle--on' : 'om-toggle--neutral'}" data-action="toggle-kill" style="margin-top:8px">
        <span class="om-toggle__dot"></span><span class="om-toggle__label">Принудительно отключить интернет</span>
      </button>
      ${ns.killSwitch ? '<div class="om-net-kill-hint">⚠️ Все сетевые запросы заблокированы. Плеер работает только с кэшем.</div>' : ''}
    `;
  }

  const st = Net.getStatusText();
  if (st) nb += `<div class="om-net-status">${esc(st)}</div>`;

  const ts = Net.getTrafficStats();
  const mn = ts.monthName || '';

  if (ts.type === 'general') {
    nb += `
      <div class="om-traffic">
        <div class="om-traffic__title">Трафик</div>
        <div class="om-traffic__row"><span>${esc(mn)}:</span><span>${fmtMB(ts.general.monthly)}</span></div>
        <div class="om-traffic__row"><span>Всего:</span><span>${fmtMB(ts.general.total)}</span></div>
      </div>
    `;
  } else {
    nb += `
      <div class="om-traffic">
        <div class="om-traffic__title">Трафик</div>
        <div class="om-traffic__group">
          <div class="om-traffic__subtitle">Ethernet / Wi-Fi</div>
          <div class="om-traffic__row"><span>${esc(mn)}:</span><span>${fmtMB(ts.wifi.monthly)}</span></div>
          <div class="om-traffic__row"><span>Всего:</span><span>${fmtMB(ts.wifi.total)}</span></div>
        </div>
        <div class="om-traffic__group">
          <div class="om-traffic__subtitle">Cellular</div>
          <div class="om-traffic__row"><span>${esc(mn)}:</span><span>${fmtMB(ts.cellular.monthly)}</span></div>
          <div class="om-traffic__row"><span>Всего:</span><span>${fmtMB(ts.cellular.total)}</span></div>
        </div>
      </div>
    `;
  }

  nb += `<button class="om-btn om-btn--ghost" data-action="clear-traffic">Очистить статистику</button>`;

  body.insertAdjacentHTML(
    'beforeend',
    `<section class="om-section"><h3 class="om-section__title"><span class="om-section__icon">🌐</span> Сетевая политика</h3>${nb}</section>`
  );

  // 3) Pinned & Cloud
  body.insertAdjacentHTML(
    'beforeend',
    `
    <section class="om-section">
      <h3 class="om-section__title"><span class="om-section__icon">🔒</span> Pinned и Cloud</h3>

      <div class="om-pc-toprow">
        <div class="om-pc-quality">
          <div class="om-pc-quality__label">Качество кэша</div>
          <div class="om-quality-toggle" id="om-qual-toggle">
            <button class="om-quality-btn ${q === 'hi' ? 'om-quality-btn--active-hi' : ''}" data-val="hi">Hi</button>
            <button class="om-quality-btn ${q === 'lo' ? 'om-quality-btn--active-lo' : ''}" data-val="lo">Lo</button>
          </div>
        </div>

        <div class="om-pc-recache">
          <div class="om-pc-recache__label">Обновление кэша</div>
          <button class="om-btn om-btn--accent om-pc-recache__btn" data-action="recache" id="btn-recache">🔄 Re-cache</button>
        </div>
      </div>

      <div class="om-settings-grid">
        <div class="om-setting">
          <label class="om-setting__label" for="inp-n">Слушать для ☁ (N)</label>
          <input type="number" id="inp-n" value="${N}" min="1" max="100" class="om-setting__input">
        </div>
        <div class="om-setting">
          <label class="om-setting__label" for="inp-d">Хранить ☁ дней (D)</label>
          <input type="number" id="inp-d" value="${D}" min="1" max="365" class="om-setting__input">
        </div>
      </div>

      <button class="om-btn om-btn--primary" data-action="apply-cloud" style="width:100%">Применить настройки</button>

      <div class="om-divider"></div>

      <button class="om-btn om-btn--outline" data-action="show-list" id="btn-show-list" style="width:100%">Показать закреплённые и облачные</button>
      <div id="pinned-cloud-list" class="om-track-list" style="display:none"></div>
    </section>
  `
  );

  // Disable recache button if nothing to recache
  (async () => {
    const rb = modal.querySelector('#btn-recache');
    if (!rb || !om.countNeedsReCache) return;
    const cnt = await om.countNeedsReCache(q);
    if (cnt === 0) {
      rb.classList.add('om-btn--disabled');
      rb.setAttribute('disabled', '');
    }
  })();

  // 4) Cache modes
  const modeCard = (name, desc, id, hint, disabled) => {
    const toggle = disabled
      ? `<div class="om-mode-toggle"><button class="om-mode-btn om-mode-btn--active" disabled>OFF</button><button class="om-mode-btn" disabled>ON</button></div>`
      : `<div class="om-mode-toggle" id="${id}">
           <button class="om-mode-btn ${mode === 'R0' ? 'om-mode-btn--active' : ''}" data-val="R0">OFF</button>
           <button class="om-mode-btn ${mode === 'R1' ? 'om-mode-btn--active' : ''}" data-val="R1">ON</button>
         </div>`;

    return `
      <div class="om-mode-card${disabled ? ' om-mode-card--disabled' : ''}" style="margin-bottom:10px">
        <div class="om-mode-card__head">
          <div>
            <div class="om-mode-card__name">${name}</div>
            <div class="om-mode-card__desc">${desc}</div>
          </div>
          ${toggle}
        </div>
        <div class="om-mode-card__hint"${!disabled ? ` id="${id}-hint"` : ''}>${hint}</div>
      </div>
    `;
  };

  body.insertAdjacentHTML(
    'beforeend',
    `
    <section class="om-section">
      <h3 class="om-section__title"><span class="om-section__icon">⚙️</span> Режимы кэширования</h3>
      ${modeCard(
        'PlaybackCache (R1)',
        'Предзагружает соседние треки для мгновенных переходов',
        'om-mode-toggle',
        mode === 'R1' ? '✅ Активен — до 3 треков офлайн' : 'R0 — чистый стриминг',
        false
      )}
      ${modeCard('SmartPrefetch (R2)', 'Умная предзагрузка на основе истории прослушиваний', '', '🔒 Будет доступно в следующем обновлении', true)}
      ${modeCard('FullOffline (R3)', 'Полное офлайн-зеркало плейлиста с фоновой синхронизацией', '', '🔒 Будет доступно в следующем обновлении', true)}
    </section>
  `
  );

  // 5) Background presets (UI оставляем, но отключаем: в OfflineManager нет API)
  body.insertAdjacentHTML(
    'beforeend',
    `
    <section class="om-section">
      <h3 class="om-section__title"><span class="om-section__icon">🌙</span> Пресеты фонового режима</h3>
      <div class="om-presets-list" style="opacity:.45;pointer-events:none">
        <button class="om-preset" disabled>
          <span class="om-preset__icon">🚀</span>
          <div class="om-preset__text">
            <div class="om-preset__name">Агрессивный</div>
            <div class="om-preset__desc">Максимальная предзагрузка, быстрый расход батареи</div>
          </div>
          <span class="om-preset__check"></span>
        </button>
        <button class="om-preset" disabled>
          <span class="om-preset__icon">⚖️</span>
          <div class="om-preset__text">
            <div class="om-preset__name">Сбалансированный</div>
            <div class="om-preset__desc">Оптимальный баланс скорости и энергии</div>
          </div>
          <span class="om-preset__check">✓</span>
        </button>
        <button class="om-preset" disabled>
          <span class="om-preset__icon">🔋</span>
          <div class="om-preset__text">
            <div class="om-preset__name">Экономный</div>
            <div class="om-preset__desc">Минимальная фоновая активность, экономия батареи</div>
          </div>
          <span class="om-preset__check"></span>
        </button>
      </div>
    </section>
  `
  );

  // 6) Downloads
  const ds = om.getDownloadStatus?.() || { active: 0, queued: 0 };
  body.insertAdjacentHTML(
    'beforeend',
    `
    <section class="om-section om-section--last">
      <h3 class="om-section__title"><span class="om-section__icon">⬇️</span> Загрузки</h3>
      <div class="om-dl-stats">
        <div class="om-dl-stat"><span class="om-dl-stat__num">${ds.active}</span><span class="om-dl-stat__label">Активных</span></div>
        <div class="om-dl-stat"><span class="om-dl-stat__num">${ds.queued}</span><span class="om-dl-stat__label">В очереди</span></div>
      </div>
      <button class="om-btn om-btn--ghost" data-action="dl-pause">⏸ Пауза</button>
    </section>
  `
  );

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  _overlay = overlay;

  requestAnimationFrame(() => {
    overlay.classList.add('om-overlay--visible');
    modal.classList.add('om-modal--visible');
  });

  // bind
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) _close();
  });
  modal.querySelector('.om-header__close')?.addEventListener('click', _close);

  const onEsc = (e) => {
    if (e.key !== 'Escape') return;
    document.removeEventListener('keydown', onEsc);
    _close();
  };
  document.addEventListener('keydown', onEsc);

  // Storage expand/collapse
  modal.querySelector('#om-st-segbar')?.addEventListener('click', () => {
    const det = modal.querySelector('#om-st-detail');
    const leg = modal.querySelector('#om-st-legend');
    if (!det) return;
    const open = det.style.display !== 'none';
    det.style.display = open ? 'none' : '';
    if (leg) leg.style.display = open ? '' : 'none';
  });

  modal.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;

    const act = {
      'toggle-wifi': () => {
        Net.toggleWifi();
        const s = Net.getNetPolicyState();
        btn.className = `om-toggle ${s.wifiEnabled ? 'om-toggle--on' : 'om-toggle--off'}`;
      },
      'toggle-cell': () => {
        Net.toggleCellular();
        const s = Net.getNetPolicyState();
        btn.className = `om-toggle ${s.cellularEnabled ? 'om-toggle--on' : 'om-toggle--off'}`;
      },
      'toggle-toast': () => {
        Net.toggleCellularToast();
        const s = Net.getNetPolicyState();
        btn.classList.toggle('om-toggle-small--on', s.cellularToast);
        btn.innerHTML = `🔔 Уведомления при Cellular: ${s.cellularToast ? 'ВКЛ' : 'ВЫКЛ'}`;
      },
      'toggle-kill': () => {
        Net.toggleKillSwitch();
        const s = Net.getNetPolicyState();
        const on = s.killSwitch;
        btn.className = `om-toggle ${on ? 'om-toggle--on' : 'om-toggle--neutral'}`;

        let h = btn.parentElement?.querySelector('.om-net-kill-hint');
        if (on && !h) {
          btn.insertAdjacentHTML('afterend', '<div class="om-net-kill-hint">⚠️ Все сетевые запросы заблокированы. Плеер работает только с кэшем.</div>');
        } else if (!on && h) {
          h.remove();
        }
      },
      'clear-traffic': () => {
        Net.clearTrafficStats();
        window.NotificationSystem?.info?.('Статистика очищена');
        // проще: перерисовать модалку
        _close();
        render();
      },
      recache: async () => {
        if (btn.hasAttribute('disabled')) return;
        if (!om.countNeedsReCache || !om.reCacheAll) {
          window.NotificationSystem?.info?.('Re-cache не поддерживается');
          return;
        }
        const rq = om.getQuality();
        const c = await om.countNeedsReCache(rq);
        if (!c) {
          window.NotificationSystem?.info?.('Все файлы в правильном качестве ✓');
          return;
        }
        om.queue?.setParallel?.(3);
        await om.reCacheAll(rq);
        window.NotificationSystem?.info?.(`Перекэширование: ${c} файлов`);
        setTimeout(() => om.queue?.setParallel?.(1), 15000);

        btn.classList.add('om-btn--disabled');
        btn.setAttribute('disabled', '');
      },
      'apply-cloud': async () => {
        const nN = parseInt(modal.querySelector('#inp-n')?.value, 10) || 5;
        const nD = parseInt(modal.querySelector('#inp-d')?.value, 10) || 31;

        let toRm = 0;
        if (om.previewCloudSettingsChange) {
          const p = await om.previewCloudSettingsChange({ newN: nN, newD: nD });
          toRm = p?.toRemove || 0;
        }

        const apply = async () => {
          await om.confirmApplyCloudSettings({ newN: nN, newD: nD });
          await _refreshStorage(modal, om);
          window.dispatchEvent(new CustomEvent('offline:uiChanged'));
          window.dispatchEvent(new CustomEvent('offline:stateChanged'));
          window.NotificationSystem?.success?.('Настройки применены');
        };

        if (toRm > 0) {
          _confirm(
            'Изменение настроек',
            `По новым настройкам <b>${toRm}</b> облачных ${plTr(toRm)} будет удалено (срок хранения истёк). Продолжить?`,
            'Удалить и применить',
            apply
          );
        } else {
          await apply();
        }
      },
      'show-list': async () => {
        const el = modal.querySelector('#pinned-cloud-list');
        if (!el) return;

        if (el.style.display !== 'none') {
          el.style.display = 'none';
          btn.textContent = 'Показать закреплённые и облачные';
          return;
        }

        el.style.display = '';
        btn.textContent = 'Скрыть список';
        await _renderList(modal, om);
      },
      'del-all': async () => {
        _confirm('Удалить все офлайн-треки?', 'Все закреплённые и облачные треки будут удалены.', 'Удалить', () => {
          _confirm('Вы уверены?', 'Это действие нельзя отменить.', 'Да, удалить', async () => {
            await om.removeAllCached();
            await _refreshStorage(modal, om);
            window.dispatchEvent(new CustomEvent('offline:uiChanged'));
            window.dispatchEvent(new CustomEvent('offline:stateChanged'));

            const el = modal.querySelector('#pinned-cloud-list');
            if (el) el.innerHTML = '<div class="om-list-empty">Нет закреплённых или облачных треков</div>';

            const showBtn = modal.querySelector('#btn-show-list');
            if (showBtn) showBtn.textContent = 'Показать закреплённые и облачные';

            window.NotificationSystem?.success?.('Все офлайн-треки удалены');
          });
        });
      },
      'del-track': async () => {
        const uid = btn.dataset.uid;
        const type = btn.dataset.type;
        if (!uid) return;

        const row = btn.closest('.om-list-item');
        const trackTitle = row?.querySelector('.om-list-title')?.textContent || uid;
        const typeLabel = type === 'pinned' ? 'закреплённый' : 'облачный';

        _confirm(
          `Удалить ${typeLabel} трек?`,
          `<b>${esc(trackTitle)}</b> будет удалён из офлайн-кэша.`,
          'Удалить',
          async () => {
            try {
              await om.removeCached(uid);
              row?.remove();

              await _refreshStorage(modal, om);
              window.dispatchEvent(new CustomEvent('offline:uiChanged'));
              window.dispatchEvent(new CustomEvent('offline:stateChanged'));

              window.NotificationSystem?.success?.(`${trackTitle} удалён`);

              const list = modal.querySelector('#pinned-cloud-list');
              const left = list?.querySelectorAll?.('.om-list-item')?.length || 0;
              if (list && left === 0) {
                list.innerHTML = '<div class="om-list-empty">Нет закреплённых или облачных треков</div>';
              }
            } catch (err) {
              console.error('[OM] del-track error:', err);
              window.NotificationSystem?.error?.('Ошибка удаления');
            }
          }
        );
      },
      'dl-pause': () => {
        const paused = btn.dataset.paused === '1';
        if (paused) {
          om.queue?.resume?.();
          btn.textContent = '⏸ Пауза';
          btn.dataset.paused = '0';
        } else {
          om.queue?.pause?.();
          btn.textContent = '▶ Возобновить';
          btn.dataset.paused = '1';
        }
      },
      nuke: async () => {
        _confirm('Очистить ВЕСЬ кэш?', 'Все офлайн-данные будут утеряны безвозвратно.', 'Очистить', () => {
          _confirm('Последнее подтверждение', 'Действие необратимо.', 'Да, очистить всё', async () => {
            try {
              await om.removeAllCached();
              if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
              }
              window.dispatchEvent(new CustomEvent('offline:uiChanged'));
              window.dispatchEvent(new CustomEvent('offline:stateChanged'));
              window.NotificationSystem?.success?.('Кэш очищен');
            } catch {
              window.NotificationSystem?.error?.('Ошибка очистки');
            }
            _close();
          });
        });
      }
    }[a];

    if (act) await act();
  });

  // Quality toggle
  modal.querySelector('#om-qual-toggle')?.addEventListener('click', async (e) => {
    const t = e.target.closest('.om-quality-btn');
    if (!t) return;

    const nq = t.dataset.val;
    const cq = om.getQuality();
    if (!nq || nq === cq) return;

    const cnt = om.countNeedsReCache ? await om.countNeedsReCache(nq) : 0;

    const doIt = () => {
      om.setCacheQualitySetting(nq);
      if (window.playerCore?.switchQuality) window.playerCore.switchQuality(nq);
      else window.dispatchEvent(new CustomEvent('quality:changed', { detail: { quality: nq } }));

      modal.querySelectorAll('#om-qual-toggle .om-quality-btn').forEach((b) => {
        b.className = 'om-quality-btn';
        if (b.dataset.val === nq) b.classList.add(nq === 'hi' ? 'om-quality-btn--active-hi' : 'om-quality-btn--active-lo');
      });

      window.NotificationSystem?.info?.(`Качество: ${String(nq).toUpperCase()}`);
    };

    if (cnt > 5) {
      _confirm('Смена качества', `Перекэширование затронет <b>${cnt}</b> ${plTr(cnt)}. Продолжить?`, 'Перекачать', doIt);
    } else {
      doIt();
    }
  });

  // Mode toggle R1
  modal.querySelector('#om-mode-toggle')?.addEventListener('click', async (e) => {
    const t = e.target.closest('.om-mode-btn');
    if (!t || t.disabled) return;

    const nm = t.dataset.val;
    if (!nm) return;

    if (nm === 'R1') {
      const ok = await om.hasSpace();
      if (!ok) {
        window.NotificationSystem?.warning?.('Недостаточно места (минимум 60 МБ)');
        return;
      }
    }

    await om.setMode(nm);

    modal.querySelectorAll('#om-mode-toggle .om-mode-btn').forEach((b) => {
      b.classList.toggle('om-mode-btn--active', b.dataset.val === nm);
    });

    const h = modal.querySelector('#om-mode-toggle-hint');
    if (h) h.innerHTML = nm === 'R1' ? '✅ Активен — до 3 треков офлайн' : 'R0 — чистый стриминг';
  });
}

export function openOfflineModal() {
  render();
}

export function closeOfflineModal() {
  if (_overlay) {
    _overlay.remove();
    _overlay = null;
  }
}

export function initOfflineModal() {
  document.getElementById('offline-btn')?.addEventListener('click', (e) => {
    if (e.target.classList?.contains('offline-btn-alert')) {
      e.stopPropagation();
      window.NotificationSystem?.info?.('Есть треки для обновления', 6000);
      return;
    }
    openOfflineModal();
  });
}

export default { initOfflineModal, openOfflineModal, closeOfflineModal };
