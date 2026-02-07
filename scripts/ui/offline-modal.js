/**
 * offline-modal.js — v3.2
 * 
 * Fixes v3.2:
 * 1. Kill-switch кнопка на ВСЕХ платформах где !supportsNetControl (Desktop Chrome, Firefox и т.д.)
 * 2. Новая секция «Пресеты фонового режима» между Режимами кэширования и Загрузками
 * 3. После удаления pinned+cloud — окно НЕ закрывается, обновляется storage на месте
 * 4. «Применить настройки» — всегда считает сколько треков будет удалено, показывает confirm
 *
 * Порядок секций:
 *   1. Хранилище
 *   2. Сетевая политика
 *   3. Pinned и Cloud (+ список треков внутри)
 *   4. Режимы кэширования (R1 + R2 заглушка + R3 заглушка)
 *   5. Пресеты фонового режима
 *   6. Загрузки
 *   7. Очистка
 */
import { getOfflineManager } from '../offline/offline-manager.js';
import * as Net from '../offline/net-policy.js';

let _overlay = null;
let _modal = null;

/* ─── Helpers ─── */
const esc = (s) => window.Utils?.escapeHtml?.(String(s ?? '')) ?? String(s ?? '');

function fmtBytes(b) {
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

const DAY_MS = 86400000;

/* ─── Close ─── */
function _close() {
  if (!_overlay) return;
  const m = _overlay.querySelector('.om-modal');
  if (m) m.classList.remove('om-modal--visible');
  _overlay.classList.remove('om-overlay--visible');
  const ref = _overlay;
  setTimeout(() => ref.remove(), 250);
  _overlay = null;
  _modal = null;
}

/* ─── Refresh storage in-place ─── */
async function _refreshStorage(modal, om) {
  try {
    const { estimateUsage } = await import('../offline/cache-db.js');
    const est = await estimateUsage();
    const valEl = modal.querySelector('#om-st-val');
    const barEl = modal.querySelector('#om-st-bar');
    const bdEl = modal.querySelector('#om-st-bd');

    if (valEl) valEl.textContent = `${fmtMB(est.used)} / ${fmtMB(est.quota)}`;
    const pct = est.quota > 0 ? Math.min(100, (est.used / est.quota) * 100) : 0;
    if (barEl) barEl.style.width = `${pct}%`;

    if (om.getStorageBreakdown && bdEl) {
      const bd = await om.getStorageBreakdown();
      bdEl.innerHTML = `
        <div class="om-bd-row"><span class="om-bd-icon">🔒</span> Закреплённые <span class="om-bd-val">${fmtBytes(bd.pinned)}</span></div>
        <div class="om-bd-row"><span class="om-bd-icon">☁</span> Облачные <span class="om-bd-val">${fmtBytes(bd.cloud)}</span></div>
        <div class="om-bd-row"><span class="om-bd-icon">⏳</span> PlaybackCache <span class="om-bd-val">${fmtBytes(bd.transient)}</span></div>
        <div class="om-bd-row"><span class="om-bd-icon">📦</span> Прочее <span class="om-bd-val">${fmtBytes(bd.other)}</span></div>
      `;
    }
  } catch (e) {
    console.warn('[OfflineModal] storage refresh error:', e);
  }
}

/* ─────────────────────────────────────────
   CONFIRM DIALOG — z-index 10010
   ───────────────────────────────────────── */
function _confirmDialog(title, bodyHtml, confirmText, onConfirm) {
  const bg = document.createElement('div');
  bg.className = 'om-confirm-bg';
  bg.innerHTML = `
    <div class="om-confirm-box">
      <div class="om-confirm-title">${title}</div>
      <div class="om-confirm-body">${bodyHtml}</div>
      <div class="om-confirm-btns">
        <button class="om-btn om-btn--ghost" data-role="cancel">Отмена</button>
        <button class="om-btn om-btn--primary" data-role="ok">${confirmText}</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  requestAnimationFrame(() => bg.classList.add('om-confirm-bg--visible'));

  const closeDialog = () => {
    bg.classList.remove('om-confirm-bg--visible');
    setTimeout(() => bg.remove(), 200);
  };

  bg.addEventListener('click', (e) => {
    if (e.target === bg) { closeDialog(); return; }
    const role = e.target.closest('[data-role]')?.dataset.role;
    if (role === 'cancel') closeDialog();
    if (role === 'ok') { closeDialog(); onConfirm(); }
  });
}

/* ─────────────────────────────────────────
   RENDER
   ───────────────────────────────────────── */
function render() {
  if (_overlay) return;

  const om = getOfflineManager();
  const netState = Net.getNetPolicyState();
  const plat = Net.getPlatform();
  const q = om.getQuality();
  const mode = om.getMode();
  const { N, D } = om.getCloudSettings();

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'om-overlay';

  // Modal
  const modal = document.createElement('div');
  modal.className = 'om-modal';

  modal.innerHTML = `
    <div class="om-header">
      <div class="om-header__title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7">
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

  /* ═══════════════════════════════════════════
     1. ХРАНИЛИЩЕ
     ═══════════════════════════════════════════ */
  body.insertAdjacentHTML('beforeend', `
    <section class="om-section">
      <h3 class="om-section__title"><span class="om-section__icon">💾</span> Хранилище</h3>
      <div class="om-storage-info">
        <div class="om-storage-row">
          <span class="om-storage-label">Занято</span>
          <span class="om-storage-value" id="om-st-val">—</span>
        </div>
        <div class="om-progress-track"><div class="om-progress-fill" id="om-st-bar" style="width:0%"></div></div>
        <div class="om-storage-breakdown" id="om-st-bd"></div>
      </div>
    </section>
  `);
  _refreshStorage(modal, om);

  /* ═══════════════════════════════════════════
     2. СЕТЕВАЯ ПОЛИТИКА
     ═══════════════════════════════════════════ */
  let netBody = '';

  // Скорость
  if (plat.hasNetInfo) {
    const speed = Net.getNetworkSpeed();
    const label = Net.getNetworkLabel();
    if (speed) netBody += `<div class="om-net-speed">${esc(label)} · ~${speed} Мбит/с</div>`;
  }

  if (plat.supportsNetControl) {
    // Полные тогглы
    netBody += `
      <div class="om-toggles-row">
        <button class="om-toggle ${netState.wifiEnabled ? 'om-toggle--on' : 'om-toggle--off'}" data-action="toggle-wifi">
          <span class="om-toggle__dot"></span><span class="om-toggle__label">Ethernet / Wi-Fi</span>
        </button>
        <button class="om-toggle ${netState.cellularEnabled ? 'om-toggle--on' : 'om-toggle--off'}" data-action="toggle-cell">
          <span class="om-toggle__dot"></span><span class="om-toggle__label">Cellular</span>
        </button>
      </div>
      <button class="om-toggle-small ${netState.cellularToast ? 'om-toggle-small--on' : ''}" data-action="toggle-toast">
        🔔 Уведомления при Cellular-стриминге: ${netState.cellularToast ? 'ВКЛ' : 'ВЫКЛ'}
      </button>
    `;
  } else {
    // Desktop / iOS / Firefox — read-only + kill switch
    netBody += `<div class="om-net-unsupported">Управление сетью ограничено ОС</div>`;
    netBody += `
      <button class="om-toggle ${netState.killSwitch ? 'om-toggle--on' : 'om-toggle--neutral'}" data-action="toggle-kill" style="margin-top:8px">
        <span class="om-toggle__dot"></span>
        <span class="om-toggle__label">Принудительно отключить интернет</span>
      </button>
    `;
    if (netState.killSwitch) {
      netBody += `<div class="om-net-kill-hint">⚠️ Все сетевые запросы заблокированы. Плеер работает только с кэшем.</div>`;
    }
  }

  // Статус
  const statusText = Net.getStatusText();
  if (statusText) netBody += `<div class="om-net-status">${esc(statusText)}</div>`;

  // Трафик
  const stats = Net.getTrafficStats();
  const monthName = stats.monthName || '';
  if (stats.type === 'general') {
    netBody += `
      <div class="om-traffic">
        <div class="om-traffic__title">Трафик</div>
        <div class="om-traffic__row"><span>${esc(monthName)}:</span><span>${fmtMB(stats.general.monthly)}</span></div>
        <div class="om-traffic__row"><span>Всего:</span><span>${fmtMB(stats.general.total)}</span></div>
      </div>`;
  } else {
    netBody += `
      <div class="om-traffic">
        <div class="om-traffic__title">Трафик</div>
        <div class="om-traffic__group">
          <div class="om-traffic__subtitle">Ethernet / Wi-Fi</div>
          <div class="om-traffic__row"><span>${esc(monthName)}:</span><span>${fmtMB(stats.wifi.monthly)}</span></div>
          <div class="om-traffic__row"><span>Всего:</span><span>${fmtMB(stats.wifi.total)}</span></div>
        </div>
        <div class="om-traffic__group">
          <div class="om-traffic__subtitle">Cellular</div>
          <div class="om-traffic__row"><span>${esc(monthName)}:</span><span>${fmtMB(stats.cellular.monthly)}</span></div>
          <div class="om-traffic__row"><span>Всего:</span><span>${fmtMB(stats.cellular.total)}</span></div>
        </div>
      </div>`;
  }

  netBody += `<button class="om-btn om-btn--ghost" data-action="clear-traffic">Очистить статистику</button>`;

  body.insertAdjacentHTML('beforeend', `
    <section class="om-section">
      <h3 class="om-section__title"><span class="om-section__icon">🌐</span> Сетевая политика</h3>
      ${netBody}
    </section>
  `);

  /* ═══════════════════════════════════════════
     3. PINNED И CLOUD
     ═══════════════════════════════════════════ */
  body.insertAdjacentHTML('beforeend', `
    <section class="om-section">
      <h3 class="om-section__title"><span class="om-section__icon">🔒</span> Pinned и Cloud</h3>

      <div class="om-quality-row">
        <span class="om-quality-label">Качество кэша</span>
        <div class="om-quality-toggle" id="om-qual-toggle">
          <button class="om-quality-btn ${q === 'hi' ? 'om-quality-btn--active-hi' : ''}" data-val="hi">Hi</button>
          <button class="om-quality-btn ${q === 'lo' ? 'om-quality-btn--active-lo' : ''}" data-val="lo">Lo</button>
        </div>
      </div>

      <button class="om-btn om-btn--accent" data-action="recache" style="width:100%;margin-bottom:12px">
        <span>🔄</span> Re-cache
      </button>

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

      <button class="om-btn om-btn--primary" data-action="apply-cloud" style="width:100%">
        Применить настройки
      </button>

      <div class="om-divider"></div>

      <button class="om-btn om-btn--outline" data-action="show-list" style="width:100%;margin-bottom:12px">
        Показать закреплённые и облачные
      </button>
      <div id="pinned-cloud-list" class="om-track-list" style="display:none"></div>

      <div class="om-divider"></div>

      <button class="om-btn om-btn--danger-outline" data-action="del-all" style="width:100%">
        🗑 Удалить все 🔒 и ☁
      </button>
    </section>
  `);

  /* ═══════════════════════════════════════════
     4. РЕЖИМЫ КЭШИРОВАНИЯ (R1 + R2 + R3)
     ═══════════════════════════════════════════ */
  body.insertAdjacentHTML('beforeend', `
    <section class="om-section">
      <h3 class="om-section__title"><span class="om-section__icon">⚙️</span> Режимы кэширования</h3>

      <!-- R1 -->
      <div class="om-mode-card" style="margin-bottom:10px">
        <div class="om-mode-card__head">
          <div>
            <div class="om-mode-card__name">PlaybackCache (R1)</div>
            <div class="om-mode-card__desc">Предзагружает соседние треки для мгновенных переходов</div>
          </div>
          <div class="om-mode-toggle" id="om-mode-toggle">
            <button class="om-mode-btn ${mode === 'R0' ? 'om-mode-btn--active' : ''}" data-val="R0">OFF</button>
            <button class="om-mode-btn ${mode === 'R1' ? 'om-mode-btn--active' : ''}" data-val="R1">ON</button>
          </div>
        </div>
        <div class="om-mode-card__hint" id="om-r1-hint">
          ${mode === 'R1' ? '✅ Активен — до 3 треков доступны офлайн' : 'R0 — чистый стриминг'}
        </div>
      </div>

      <!-- R2 — заглушка -->
      <div class="om-mode-card om-mode-card--disabled" style="margin-bottom:10px">
        <div class="om-mode-card__head">
          <div>
            <div class="om-mode-card__name">SmartPrefetch (R2)</div>
            <div class="om-mode-card__desc">Умная предзагрузка на основе истории прослушиваний</div>
          </div>
          <div class="om-mode-toggle">
            <button class="om-mode-btn om-mode-btn--active" disabled>OFF</button>
            <button class="om-mode-btn" disabled>ON</button>
          </div>
        </div>
        <div class="om-mode-card__hint">🔒 Будет доступно в следующем обновлении</div>
      </div>

      <!-- R3 — заглушка -->
      <div class="om-mode-card om-mode-card--disabled">
        <div class="om-mode-card__head">
          <div>
            <div class="om-mode-card__name">FullOffline (R3)</div>
            <div class="om-mode-card__desc">Полное офлайн-зеркало плейлиста с фоновой синхронизацией</div>
          </div>
          <div class="om-mode-toggle">
            <button class="om-mode-btn om-mode-btn--active" disabled>OFF</button>
            <button class="om-mode-btn" disabled>ON</button>
          </div>
        </div>
        <div class="om-mode-card__hint">🔒 Будет доступно в следующем обновлении</div>
      </div>
    </section>
  `);

  /* ═══════════════════════════════════════════
     5. ПРЕСЕТЫ ФОНОВОГО РЕЖИМА
     ═══════════════════════════════════════════ */
  const bgPreset = om.getBackgroundPreset?.() || 'balanced';
  const presets = [
    { id: 'aggressive', icon: '🚀', name: 'Агрессивный',   desc: 'Максимальная предзагрузка, быстрый расход батареи' },
    { id: 'balanced',   icon: '⚖️', name: 'Сбалансированный', desc: 'Оптимальный баланс скорости и энергии' },
    { id: 'saver',      icon: '🔋', name: 'Экономный',     desc: 'Минимальная фоновая активность, экономия батареи' },
  ];

  let presetsHtml = presets.map(p => `
    <button class="om-preset ${bgPreset === p.id ? 'om-preset--active' : ''}" data-action="set-bg-preset" data-preset="${p.id}">
      <span class="om-preset__icon">${p.icon}</span>
      <div class="om-preset__text">
        <div class="om-preset__name">${p.name}</div>
        <div class="om-preset__desc">${p.desc}</div>
      </div>
      <span class="om-preset__check">${bgPreset === p.id ? '✓' : ''}</span>
    </button>
  `).join('');

  body.insertAdjacentHTML('beforeend', `
    <section class="om-section">
      <h3 class="om-section__title"><span class="om-section__icon">🌙</span> Пресеты фонового режима</h3>
      <div class="om-presets-list">${presetsHtml}</div>
    </section>
  `);

  /* ═══════════════════════════════════════════
     6. ЗАГРУЗКИ
     ═══════════════════════════════════════════ */
  const qStatus = om.getDownloadStatus?.() || { active: 0, queued: 0 };
  body.insertAdjacentHTML('beforeend', `
    <section class="om-section">
      <h3 class="om-section__title"><span class="om-section__icon">⬇️</span> Загрузки</h3>
      <div class="om-dl-stats">
        <div class="om-dl-stat">
          <span class="om-dl-stat__num" id="om-dl-active">${qStatus.active}</span>
          <span class="om-dl-stat__label">Активных</span>
        </div>
        <div class="om-dl-stat">
          <span class="om-dl-stat__num" id="om-dl-queued">${qStatus.queued}</span>
          <span class="om-dl-stat__label">В очереди</span>
        </div>
      </div>
      <button class="om-btn om-btn--ghost" data-action="dl-pause">⏸ Пауза</button>
    </section>
  `);

  /* ═══════════════════════════════════════════
     7. ОЧИСТКА
     ═══════════════════════════════════════════ */
  body.insertAdjacentHTML('beforeend', `
    <section class="om-section om-section--last">
      <h3 class="om-section__title"><span class="om-section__icon">🧹</span> Очистка</h3>
      <button class="om-btn om-btn--danger" data-action="nuke" style="width:100%">
        Очистить ВЕСЬ кэш приложения
      </button>
    </section>
  `);

  // ── Mount ──
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  _overlay = overlay;
  _modal = modal;

  requestAnimationFrame(() => {
    overlay.classList.add('om-overlay--visible');
    modal.classList.add('om-modal--visible');
  });

  _bindEvents(overlay, modal, om, plat);
}

/* ─────────────────────────────────────────
   EVENTS — единый delegation, без reopen
   ───────────────────────────────────────── */
function _bindEvents(overlay, modal, om, plat) {

  // Close
  overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });
  modal.querySelector('.om-header__close')?.addEventListener('click', _close);
  const _onKey = (e) => { if (e.key === 'Escape' && _overlay) { _close(); document.removeEventListener('keydown', _onKey); } };
  document.addEventListener('keydown', _onKey);

  // Delegation
  modal.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    switch (action) {

      /* ── Net toggles ── */
      case 'toggle-wifi': {
        Net.toggleWifi();
        const st = Net.getNetPolicyState();
        btn.className = `om-toggle ${st.wifiEnabled ? 'om-toggle--on' : 'om-toggle--off'}`;
        break;
      }
      case 'toggle-cell': {
        Net.toggleCellular();
        const st = Net.getNetPolicyState();
        btn.className = `om-toggle ${st.cellularEnabled ? 'om-toggle--on' : 'om-toggle--off'}`;
        break;
      }
      case 'toggle-toast': {
        Net.toggleCellularToast();
        const st = Net.getNetPolicyState();
        btn.classList.toggle('om-toggle-small--on', st.cellularToast);
        btn.innerHTML = `🔔 Уведомления при Cellular-стриминге: ${st.cellularToast ? 'ВКЛ' : 'ВЫКЛ'}`;
        break;
      }
      case 'toggle-kill': {
        Net.toggleKillSwitch();
        const st = Net.getNetPolicyState();
        const isOn = st.killSwitch;
        btn.className = `om-toggle ${isOn ? 'om-toggle--on' : 'om-toggle--neutral'}`;
        // Обновляем/добавляем/удаляем hint
        let hintEl = btn.parentElement?.querySelector('.om-net-kill-hint');
        if (isOn && !hintEl) {
          btn.insertAdjacentHTML('afterend', '<div class="om-net-kill-hint">⚠️ Все сетевые запросы заблокированы. Плеер работает только с кэшем.</div>');
        } else if (!isOn && hintEl) {
          hintEl.remove();
        }
        break;
      }

      case 'clear-traffic': {
        Net.clearTrafficStats();
        modal.querySelectorAll('.om-traffic .om-traffic__row span:last-child').forEach(s => s.textContent = '0.0 МБ');
        window.NotificationSystem?.info?.('Статистика очищена');
        break;
      }

      /* ── Re-cache ── */
      case 'recache': {
        const rq = om.getQuality();
        if (!om.countNeedsReCache || !om.reCacheAll) {
          window.NotificationSystem?.info?.('Re-cache не поддерживается');
          break;
        }
        const count = await om.countNeedsReCache(rq);
        if (!count) { window.NotificationSystem?.info?.('Все файлы в правильном качестве ✓'); break; }
        om.queue?.setParallel?.(3);
        await om.reCacheAll(rq);
        window.NotificationSystem?.info?.(`Перекэширование: ${count} файлов`);
        setTimeout(() => om.queue?.setParallel?.(1), 15000);
        break;
      }

      /* ── Apply cloud settings — ВСЕГДА через confirm с подсчётом ── */
      case 'apply-cloud': {
        const newN = parseInt(modal.querySelector('#inp-n')?.value, 10) || 5;
        const newD = parseInt(modal.querySelector('#inp-d')?.value, 10) || 31;

        // Считаем сколько треков будет удалено по новым настройкам
        let toRemove = 0;
        if (om.previewCloudSettingsChange) {
          const preview = await om.previewCloudSettingsChange({ newN, newD });
          toRemove = preview.toRemove || 0;
        }

        if (toRemove > 0) {
          _confirmDialog(
            'Изменение настроек',
            `По новым настройкам <b>${toRemove}</b> облачных ${_pluralTracks(toRemove)} будет удалено (срок хранения истёк). Продолжить?`,
            'Удалить и применить',
            async () => {
              await om.confirmApplyCloudSettings({ newN, newD });
              await _refreshStorage(modal, om);
              window.NotificationSystem?.success?.(`Настройки применены, удалено ${toRemove} треков`);
            }
          );
        } else {
          await om.confirmApplyCloudSettings({ newN, newD });
          window.NotificationSystem?.success?.('Настройки применены');
        }
        break;
      }

      /* ── Show list ── */
      case 'show-list': {
        const listEl = modal.querySelector('#pinned-cloud-list');
        if (!listEl) break;
        if (listEl.style.display !== 'none') { listEl.style.display = 'none'; break; }
        listEl.style.display = '';
        listEl.innerHTML = '<div class="om-list-loading">Загрузка...</div>';
        try {
          const { getAllTrackMetas } = await import('../offline/cache-db.js');
          const metas = await getAllTrackMetas();
          const pinned = metas.filter(m => m.type === 'pinned').sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));
          const cloud = metas.filter(m => m.type === 'cloud').sort((a, b) => (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0));
          const now = Date.now();
          let html = '';
          for (const m of [...pinned, ...cloud]) {
            const icon = m.type === 'pinned' ? '🔒' : '☁';
            const title = window.TrackRegistry?.getTrackByUid?.(m.uid)?.title || m.uid;
            const mq = (m.quality || '—').toUpperCase();
            const size = fmtBytes(m.size || 0);
            let badge = '';
            if (m.type === 'pinned') badge = '<span class="om-list-badge om-list-badge--pin">Закреплён</span>';
            else if (m.cloudExpiresAt) {
              const days = Math.max(0, Math.ceil((m.cloudExpiresAt - now) / DAY_MS));
              badge = `<span class="om-list-badge om-list-badge--cloud">${days} дн.</span>`;
            }
            html += `<div class="om-list-item"><span class="om-list-icon">${icon}</span><span class="om-list-title">${esc(title)}</span><span class="om-list-meta">${mq} · ${size}</span>${badge}</div>`;
          }
          if (!html) html = '<div class="om-list-empty">Нет закреплённых или облачных треков</div>';
          listEl.innerHTML = html;
        } catch { listEl.innerHTML = '<div class="om-list-empty" style="color:#ef5350">Ошибка загрузки</div>'; }
        break;
      }

      /* ── Delete all pinned+cloud — окно НЕ закрывается ── */
      case 'del-all': {
        _confirmDialog(
          'Удалить все офлайн-треки?',
          'Все закреплённые и облачные треки будут удалены. Статистика облачков будет сброшена.',
          'Удалить',
          () => _confirmDialog(
            'Вы уверены?',
            'Это действие нельзя отменить.',
            'Да, удалить',
            async () => {
              await om.removeAllCached();
              // Обновляем storage на месте, окно остаётся открытым
              await _refreshStorage(modal, om);
              // Скрываем список треков если был открыт
              const listEl = modal.querySelector('#pinned-cloud-list');
              if (listEl) { listEl.style.display = 'none'; listEl.innerHTML = ''; }
              window.NotificationSystem?.success?.('Все офлайн-треки удалены');
            }
          )
        );
        break;
      }

      /* ── Download pause ── */
      case 'dl-pause': {
        const isPaused = btn.dataset.paused === '1';
        if (isPaused) { om.queue?.resume?.(); btn.textContent = '⏸ Пауза'; btn.dataset.paused = '0'; }
        else { om.queue?.pause?.(); btn.textContent = '▶ Возобновить'; btn.dataset.paused = '1'; }
        break;
      }

      /* ── Background preset ── */
      case 'set-bg-preset': {
        const presetId = btn.dataset.preset;
        if (!presetId) break;
        om.setBackgroundPreset?.(presetId);
        // Обновляем все пресет-кнопки на месте
        modal.querySelectorAll('.om-preset').forEach(p => {
          const isActive = p.dataset.preset === presetId;
          p.classList.toggle('om-preset--active', isActive);
          const checkEl = p.querySelector('.om-preset__check');
          if (checkEl) checkEl.textContent = isActive ? '✓' : '';
        });
        window.NotificationSystem?.info?.(`Фоновый режим: ${btn.querySelector('.om-preset__name')?.textContent || presetId}`);
        break;
      }

      /* ── Nuke — окно закрывается только тут ── */
      case 'nuke': {
        _confirmDialog(
          'Очистить ВЕСЬ кэш?',
          'Все офлайн-данные будут утеряны безвозвратно.',
          'Очистить',
          () => _confirmDialog(
            'Последнее подтверждение',
            'Действие необратимо. Продолжить?',
            'Да, очистить всё',
            async () => {
              try {
                await om.removeAllCached();
                if ('caches' in window) {
                  const keys = await caches.keys();
                  await Promise.all(keys.map(k => caches.delete(k)));
                }
                window.NotificationSystem?.success?.('Кэш полностью очищен');
              } catch { window.NotificationSystem?.error?.('Ошибка очистки'); }
              _close();
            }
          )
        );
        break;
      }
    }
  });

  /* ── Quality toggle ── */
  modal.querySelector('#om-qual-toggle')?.addEventListener('click', async (e) => {
    const t = e.target.closest('.om-quality-btn');
    if (!t) return;
    const newQ = t.dataset.val;
    const curQ = om.getQuality();
    if (newQ === curQ) return;

    const count = om.countNeedsReCache ? await om.countNeedsReCache(newQ) : 0;

    const doSwitch = () => {
      om.setCacheQualitySetting(newQ);
      if (window.playerCore?.switchQuality) window.playerCore.switchQuality(newQ);
      else window.dispatchEvent(new CustomEvent('quality:changed', { detail: { quality: newQ } }));
      // Обновляем кнопки на месте
      modal.querySelectorAll('#om-qual-toggle .om-quality-btn').forEach(b => {
        b.className = 'om-quality-btn';
        if (b.dataset.val === newQ) b.classList.add(newQ === 'hi' ? 'om-quality-btn--active-hi' : 'om-quality-btn--active-lo');
      });
      window.NotificationSystem?.info?.(`Качество: ${newQ.toUpperCase()}`);
    };

    if (count > 5) {
      _confirmDialog(
        'Смена качества',
        `Перекэширование затронет <b>${count}</b> ${_pluralTracks(count)}. Продолжить?`,
        'Перекачать',
        doSwitch
      );
    } else {
      doSwitch();
    }
  });

  /* ── Mode toggle R1 ── */
  modal.querySelector('#om-mode-toggle')?.addEventListener('click', async (e) => {
    const t = e.target.closest('.om-mode-btn');
    if (!t || t.disabled) return;
    const newMode = t.dataset.val;
    if (!newMode) return;

    if (newMode === 'R1') {
      const ok = await om.hasSpace();
      if (!ok) { window.NotificationSystem?.warning?.('Недостаточно места (минимум 60 МБ)'); return; }
    }

    om.setMode(newMode);

    // Обновляем кнопки на месте
    modal.querySelectorAll('#om-mode-toggle .om-mode-btn').forEach(b => {
      b.classList.toggle('om-mode-btn--active', b.dataset.val === newMode);
    });

    // Обновляем hint
    const hint = modal.querySelector('#om-r1-hint');
    if (hint) {
      hint.innerHTML = newMode === 'R1'
        ? '✅ Активен — до 3 треков доступны офлайн'
        : 'R0 — чистый стриминг';
    }
  });
}

/* ─── Plural helper ─── */
function _pluralTracks(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'треков';
  if (mod10 === 1) return 'трек';
  if (mod10 >= 2 && mod10 <= 4) return 'трека';
  return 'треков';
}

/* ─────────────────────────────────────────
   PUBLIC API
   ───────────────────────────────────────── */
export function openOfflineModal() { render(); }

export function closeOfflineModal() {
  if (_overlay) { _overlay.remove(); _overlay = null; _modal = null; }
}

export function initOfflineModal() {
  const btn = document.getElementById('offline-btn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      if (e.target.classList?.contains('offline-btn-alert')) {
        e.stopPropagation();
        window.NotificationSystem?.info?.('Есть треки для обновления', 6000);
        return;
      }
      openOfflineModal();
    });
  }
}

export default { initOfflineModal, openOfflineModal, closeOfflineModal };            else if (m.cloudExpiresAt) {
              const days = Math.max(0, Math.ceil((m.cloudExpiresAt - now) / DAY_MS));
              badge = `<span class="om-list-badge om-list-badge--cloud">${days} дн.</span>`;
            }
            html += `<div class="om-list-item"><span class="om-list-icon">${icon}</span><span class="om-list-title">${esc(title)}</span><span class="om-list-meta">${mq} · ${size}</span>${badge}</div>`;
          }
          if (!html) html = '<div class="om-list-empty">Нет закреплённых или облачных треков</div>';
          listEl.innerHTML = html;
        } catch { listEl.innerHTML = '<div class="om-list-empty" style="color:#ef5350">Ошибка загрузки</div>'; }
        break;
      }

      /* ── Delete all pinned+cloud — окно НЕ закрывается ── */
      case 'del-all': {
        _confirmDialog(
          'Удалить все офлайн-треки?',
          'Все закреплённые и облачные треки будут удалены. Статистика облачков будет сброшена.',
          'Удалить',
          () => _confirmDialog(
            'Вы уверены?',
            'Это действие нельзя отменить.',
            'Да, удалить',
            async () => {
              await om.removeAllCached();
              // Обновляем storage на месте, окно остаётся открытым
              await _refreshStorage(modal, om);
              // Скрываем список треков если был открыт
              const listEl = modal.querySelector('#pinned-cloud-list');
              if (listEl) { listEl.style.display = 'none'; listEl.innerHTML = ''; }
              window.NotificationSystem?.success?.('Все офлайн-треки удалены');
            }
          )
        );
        break;
      }

      /* ── Download pause ── */
      case 'dl-pause': {
        const isPaused = btn.dataset.paused === '1';
        if (isPaused) { om.queue?.resume?.(); btn.textContent = '⏸ Пауза'; btn.dataset.paused = '0'; }
        else { om.queue?.pause?.(); btn.textContent = '▶ Возобновить'; btn.dataset.paused = '1'; }
        break;
      }

      /* ── Background preset ── */
      case 'set-bg-preset': {
        const presetId = btn.dataset.preset;
        if (!presetId) break;
        om.setBackgroundPreset?.(presetId);
        // Обновляем все пресет-кнопки на месте
        modal.querySelectorAll('.om-preset').forEach(p => {
          const isActive = p.dataset.preset === presetId;
          p.classList.toggle('om-preset--active', isActive);
          const checkEl = p.querySelector('.om-preset__check');
          if (checkEl) checkEl.textContent = isActive ? '✓' : '';
        });
        window.NotificationSystem?.info?.(`Фоновый режим: ${btn.querySelector('.om-preset__name')?.textContent || presetId}`);
        break;
      }

      /* ── Nuke — окно закрывается только тут ── */
      case 'nuke': {
        _confirmDialog(
          'Очистить ВЕСЬ кэш?',
          'Все офлайн-данные будут утеряны безвозвратно.',
          'Очистить',
          () => _confirmDialog(
            'Последнее подтверждение',
            'Действие необратимо. Продолжить?',
            'Да, очистить всё',
            async () => {
              try {
                await om.removeAllCached();
                if ('caches' in window) {
                  const keys = await caches.keys();
                  await Promise.all(keys.map(k => caches.delete(k)));
                }
                window.NotificationSystem?.success?.('Кэш полностью очищен');
              } catch { window.NotificationSystem?.error?.('Ошибка очистки'); }
              _close();
            }
          )
        );
        break;
      }
    }
  });

  /* ── Quality toggle ── */
  modal.querySelector('#om-qual-toggle')?.addEventListener('click', async (e) => {
    const t = e.target.closest('.om-quality-btn');
    if (!t) return;
    const newQ = t.dataset.val;
    const curQ = om.getQuality();
    if (newQ === curQ) return;

    const count = om.countNeedsReCache ? await om.countNeedsReCache(newQ) : 0;

    const doSwitch = () => {
      om.setCacheQualitySetting(newQ);
      if (window.playerCore?.switchQuality) window.playerCore.switchQuality(newQ);
      else window.dispatchEvent(new CustomEvent('quality:changed', { detail: { quality: newQ } }));
      // Обновляем кнопки на месте
      modal.querySelectorAll('#om-qual-toggle .om-quality-btn').forEach(b => {
        b.className = 'om-quality-btn';
        if (b.dataset.val === newQ) b.classList.add(newQ === 'hi' ? 'om-quality-btn--active-hi' : 'om-quality-btn--active-lo');
      });
      window.NotificationSystem?.info?.(`Качество: ${newQ.toUpperCase()}`);
    };

    if (count > 5) {
      _confirmDialog(
        'Смена качества',
        `Перекэширование затронет <b>${count}</b> ${_pluralTracks(count)}. Продолжить?`,
        'Перекачать',
        doSwitch
      );
    } else {
      doSwitch();
    }
  });

  /* ── Mode toggle R1 ── */
  modal.querySelector('#om-mode-toggle')?.addEventListener('click', async (e) => {
    const t = e.target.closest('.om-mode-btn');
    if (!t || t.disabled) return;
    const newMode = t.dataset.val;
    if (!newMode) return;

    if (newMode === 'R1') {
      const ok = await om.hasSpace();
      if (!ok) { window.NotificationSystem?.warning?.('Недостаточно места (минимум 60 МБ)'); return; }
    }

    om.setMode(newMode);

    // Обновляем кнопки на месте
    modal.querySelectorAll('#om-mode-toggle .om-mode-btn').forEach(b => {
      b.classList.toggle('om-mode-btn--active', b.dataset.val === newMode);
    });

    // Обновляем hint
    const hint = modal.querySelector('#om-r1-hint');
    if (hint) {
      hint.innerHTML = newMode === 'R1'
        ? '✅ Активен — до 3 треков доступны офлайн'
        : 'R0 — чистый стриминг';
    }
  });
}

/* ─── Plural helper ─── */
function _pluralTracks(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'треков';
  if (mod10 === 1) return 'трек';
  if (mod10 >= 2 && mod10 <= 4) return 'трека';
  return 'треков';
}

/* ─────────────────────────────────────────
   PUBLIC API
   ───────────────────────────────────────── */
export function openOfflineModal() { render(); }

export function closeOfflineModal() {
  if (_overlay) { _overlay.remove(); _overlay = null; _modal = null; }
}

export function initOfflineModal() {
  const btn = document.getElementById('offline-btn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      if (e.target.classList?.contains('offline-btn-alert')) {
        e.stopPropagation();
        window.NotificationSystem?.info?.('Есть треки для обновления', 6000);
        return;
      }
      openOfflineModal();
    });
  }
}

export default { initOfflineModal, openOfflineModal, closeOfflineModal };
