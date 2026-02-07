/**
 * offline-modal.js — OFFLINE модальное окно.
 *
 * ТЗ: Приложение П.8.1–П.8.6, Спецификация "Сетевая политика" (v1.0)
 *
 * Секции (сверху вниз):
 *   1. Хранилище
 *   2. Сетевая политика (НОВАЯ)
 *   3. Pinned и Cloud
 *   4. Режимы кэширования
 *   5. Очистка кэша
 *
 * Экспорт:
 *   - openOfflineModal()
 *   - closeOfflineModal()
 *   - initOfflineModal() — подписки
 */

import offlineManager, { getOfflineManager } from '../offline/offline-manager.js';
import { refreshAllIndicators } from './offline-indicators.js';
import {
  getPlatform,
  getNetPolicyState,
  toggleWifi,
  toggleCellular,
  toggleCellularToast,
  toggleKillSwitch,
  getNetworkSpeed,
  getNetworkLabel,
  getTrafficStats,
  clearTrafficStats,
  getCurrentMonthName,
  getStatusText
} from '../offline/net-policy.js';

/* ═══════ State ═══════ */

let _modal = null;
let _reCacheUnsub = null;

/* ═══════ CSS ═══════ */

let _cssInjected = false;

function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;

  const style = document.createElement('style');
  style.id = 'offline-modal-css';
  style.textContent = `
    .offline-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .offline-modal {
      background: #1a1a2e;
      border-radius: 12px;
      max-width: 480px;
      width: 100%;
      max-height: 85vh;
      overflow-y: auto;
      color: #e0e0e0;
      font-size: 14px;
      padding: 0;
      box-shadow: 0 12px 48px rgba(0,0,0,0.8);
    }

    .offline-modal__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      font-size: 16px;
      font-weight: 600;
    }

    .offline-modal__close {
      background: none;
      border: none;
      color: #888;
      font-size: 22px;
      cursor: pointer;
      padding: 4px 8px;
      line-height: 1;
    }
    .offline-modal__close:hover { color: #fff; }

    .offline-section {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .offline-section__title {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #aaa;
      margin-bottom: 12px;
    }

    .offline-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
    }

    .offline-row__label {
      color: #ccc;
      font-size: 13px;
    }

    .offline-btn {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      color: #e0e0e0;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .offline-btn:hover { background: rgba(255,255,255,0.14); }
    .offline-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .offline-btn--primary {
      background: rgba(91, 192, 222, 0.2);
      border-color: rgba(91, 192, 222, 0.3);
      color: #5bc0de;
    }
    .offline-btn--primary:hover { background: rgba(91, 192, 222, 0.3); }

    .offline-btn--danger {
      background: rgba(255, 107, 107, 0.15);
      border-color: rgba(255, 107, 107, 0.25);
      color: #ff6b6b;
    }
    .offline-btn--danger:hover { background: rgba(255, 107, 107, 0.25); }

    .offline-btn--active {
      background: rgba(245, 200, 66, 0.2);
      border-color: rgba(245, 200, 66, 0.4);
      color: #f5c842;
    }

    .offline-toggle {
      display: flex;
      gap: 0;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.12);
    }

    .offline-toggle__opt {
      padding: 6px 16px;
      font-size: 13px;
      cursor: pointer;
      background: rgba(255,255,255,0.04);
      color: #888;
      border: none;
      transition: all 0.15s;
    }
    .offline-toggle__opt--active {
      background: rgba(91, 192, 222, 0.25);
      color: #5bc0de;
      font-weight: 600;
    }

    .offline-input-num {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      color: #e0e0e0;
      padding: 4px 8px;
      border-radius: 4px;
      width: 60px;
      text-align: center;
      font-size: 14px;
    }

    .offline-progress {
      background: rgba(255,255,255,0.06);
      border-radius: 4px;
      height: 6px;
      overflow: hidden;
      margin-top: 6px;
    }

    .offline-progress__bar {
      height: 100%;
      background: #5bc0de;
      border-radius: 4px;
      transition: width 0.3s;
    }

    .offline-warning {
      background: rgba(255, 193, 7, 0.1);
      border: 1px solid rgba(255, 193, 7, 0.2);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      color: #ffc107;
      margin-bottom: 8px;
    }

    /* ─── Net policy buttons ─── */
    .np-toggle-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 10px 16px;
      border-radius: 8px;
      border: 1px solid;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 8px;
    }
    .np-toggle-btn--on {
      background: rgba(39, 179, 76, 0.18);
      border-color: rgba(39, 179, 76, 0.4);
      color: #4caf50;
    }
    .np-toggle-btn--on:hover {
      background: rgba(39, 179, 76, 0.28);
    }
    .np-toggle-btn--off {
      background: rgba(244, 67, 54, 0.18);
      border-color: rgba(244, 67, 54, 0.4);
      color: #f44336;
    }
    .np-toggle-btn--off:hover {
      background: rgba(244, 67, 54, 0.28);
    }
    .np-toggle-btn--disabled {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.08);
      color: #555;
      cursor: not-allowed;
      opacity: 0.5;
    }
    .np-toggle-btn--notify-off {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.12);
      color: #888;
    }
    .np-toggle-btn--notify-on {
      background: rgba(39, 179, 76, 0.18);
      border-color: rgba(39, 179, 76, 0.4);
      color: #4caf50;
    }
    /* ─── Net policy speed line ─── */
    .np-speed-line {
      font-size: 12px;
      color: #888;
      margin-bottom: 10px;
      min-height: 16px;
    }
    .np-speed-line span {
      color: #aaa;
      font-weight: 600;
    }

    /* ─── Net policy status ─── */
    .np-status {
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 6px;
      margin-bottom: 10px;
      display: none;
    }
    .np-status--warning {
      display: block;
      background: rgba(255, 193, 7, 0.12);
      border: 1px solid rgba(255, 193, 7, 0.25);
      color: #ffc107;
    }
    .np-status--danger {
      display: block;
      background: rgba(244, 67, 54, 0.12);
      border: 1px solid rgba(244, 67, 54, 0.25);
      color: #f44336;
    }
    .np-status--info {
      display: block;
      background: rgba(158, 158, 158, 0.1);
      border: 1px solid rgba(158, 158, 158, 0.2);
      color: #9e9e9e;
    }

    /* ─── Traffic stats ─── */
    .np-traffic {
      margin-top: 12px;
    }
    .np-traffic-group {
      margin-bottom: 10px;
    }
    .np-traffic-group__title {
      font-size: 12px;
      font-weight: 600;
      color: #aaa;
      margin-bottom: 4px;
    }
    .np-traffic-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #888;
      padding: 2px 0;
    }
    .np-traffic-row__val {
      color: #ccc;
      font-weight: 500;
    }
    .np-traffic-clear {
      margin-top: 8px;
    }

    /* ─── iOS unsupported notice ─── */
    .np-unsupported {
      font-size: 12px;
      color: #666;
      font-style: italic;
      margin-bottom: 8px;
    }
  `;
  document.head.appendChild(style);
}

/* ═══════ Helpers ═══════ */

function _formatMB(bytes) {
  if (!bytes || bytes <= 0) return '0 МБ';
  const mb = bytes / 1048576;
  if (mb < 0.1) return '< 0.1 МБ';
  return mb.toFixed(1) + ' МБ';
}

function _getOM() {
  return getOfflineManager?.() || offlineManager;
}

/* ═══════ SECTION BUILDERS ═══════ */

/* --- 1. Storage section --- */
function _buildStorageSection() {
  const sec = document.createElement('div');
  sec.className = 'offline-section';
  sec.innerHTML = `
    <div class="offline-section__title">Хранилище</div>
    <div class="offline-row">
      <span class="offline-row__label">Занято</span>
      <span id="om-storage-used">—</span>
    </div>
    <div class="offline-progress">
      <div class="offline-progress__bar" id="om-storage-bar" style="width:0%"></div>
    </div>
  `;
  return sec;
}

/* --- 2. Net Policy section (NEW) --- */
function _buildNetPolicySection() {
  const sec = document.createElement('div');
  sec.className = 'offline-section';
  sec.id = 'om-net-policy-section';

  const platform = getPlatform();
  const state = getNetPolicyState();
  const stats = getTrafficStats();

  let html = `<div class="offline-section__title">Сетевая политика</div>`;

  // Speed line (hidden on iOS/Firefox)
  if (platform.supportsNetControl) {
    html += `<div class="np-speed-line" id="np-speed-line"></div>`;
  }

  // Status line
  html += `<div class="np-status" id="np-status"></div>`;

  if (platform.supportsNetControl) {
    // ── Android / Desktop: full controls ──

    // Ethernet / Wi-Fi toggle
    html += `
      <button class="np-toggle-btn ${state.wifiEnabled ? 'np-toggle-btn--on' : 'np-toggle-btn--off'}"
              id="np-btn-wifi">
        Ethernet / Wi-Fi: ${state.wifiEnabled ? 'ВКЛ' : 'ВЫКЛ'}
      </button>
    `;

    // Cellular toggle
    html += `
      <button class="np-toggle-btn ${state.cellularEnabled ? 'np-toggle-btn--on' : 'np-toggle-btn--off'}"
              id="np-btn-cellular">
        Cellular: ${state.cellularEnabled ? 'ВКЛ' : 'ВЫКЛ'}
      </button>
    `;

    // Cellular toast notification toggle
    html += `
      <button class="np-toggle-btn ${state.cellularToast ? 'np-toggle-btn--notify-on' : 'np-toggle-btn--notify-off'}"
              id="np-btn-cell-toast">
        Уведомления при Cellular: ${state.cellularToast ? 'ВКЛ' : 'ВЫКЛ'}
      </button>
    `;

  } else {
    // ── iOS / Firefox: limited controls ──

    html += `<div class="np-unsupported">Управление сетью не поддерживается на этом устройстве</div>`;

    // Ethernet / Wi-Fi — disabled
    html += `
      <button class="np-toggle-btn np-toggle-btn--disabled" disabled id="np-btn-wifi">
        Ethernet / Wi-Fi
      </button>
    `;

    // Cellular — disabled
    html += `
      <button class="np-toggle-btn np-toggle-btn--disabled" disabled id="np-btn-cellular">
        Cellular
      </button>
    `;

    // Kill switch (iOS only)
    if (platform.isIOS) {
      html += `
        <button class="np-toggle-btn ${state.killSwitch ? 'np-toggle-btn--off' : 'np-toggle-btn--notify-off'}"
                id="np-btn-killswitch">
          Отключить весь интернет: ${state.killSwitch ? 'АКТИВНО' : 'ВЫКЛ'}
        </button>
      `;
    }
  }

  // ── Traffic statistics ──
  html += `<div class="np-traffic" id="np-traffic">`;
  html += _buildTrafficStatsHTML(stats);
  html += `</div>`;

  // Clear button
  html += `
    <div class="np-traffic-clear">
      <button class="offline-btn offline-btn--danger" id="np-btn-clear-traffic"
              style="font-size:12px; padding:4px 10px;">
        Очистить статистику
      </button>
    </div>
  `;

  sec.innerHTML = html;
  return sec;
}

function _buildTrafficStatsHTML(stats) {
  let html = '';

  if (stats.type === 'general') {
    // iOS — single group
    html += `
      <div class="np-traffic-group">
        <div class="np-traffic-group__title">Общий трафик</div>
        <div class="np-traffic-row">
          <span>${stats.monthName}:</span>
          <span class="np-traffic-row__val">${_formatMB(stats.general.monthly)}</span>
        </div>
        <div class="np-traffic-row">
          <span>Всего:</span>
          <span class="np-traffic-row__val">${_formatMB(stats.general.total)}</span>
        </div>
      </div>
    `;
  } else {
    // Android/Desktop — split by type
    html += `
      <div class="np-traffic-group">
        <div class="np-traffic-group__title">Ethernet / Wi-Fi</div>
        <div class="np-traffic-row">
          <span>${stats.monthName}:</span>
          <span class="np-traffic-row__val">${_formatMB(stats.wifi.monthly)}</span>
        </div>
        <div class="np-traffic-row">
          <span>Всего:</span>
          <span class="np-traffic-row__val">${_formatMB(stats.wifi.total)}</span>
        </div>
      </div>
      <div class="np-traffic-group">
        <div class="np-traffic-group__title">Cellular</div>
        <div class="np-traffic-row">
          <span>${stats.monthName}:</span>
          <span class="np-traffic-row__val">${_formatMB(stats.cellular.monthly)}</span>
        </div>
        <div class="np-traffic-row">
          <span>Всего:</span>
          <span class="np-traffic-row__val">${_formatMB(stats.cellular.total)}</span>
        </div>
      </div>
    `;
  }

  return html;
}

/* --- 3. Pinned & Cloud section --- */
function _buildPinnedCloudSection() {
  const om = _getOM();
  const sec = document.createElement('div');
  sec.className = 'offline-section';

  const cq = localStorage.getItem('qualityMode:v1') || 'hi';
  const cloudN = parseInt(localStorage.getItem('cloud:listenThreshold') || '5', 10);
  const cloudD = parseInt(localStorage.getItem('cloud:ttlDays') || '31', 10);

  sec.innerHTML = `
    <div class="offline-section__title">Pinned и Cloud</div>

    <div class="offline-row">
      <span class="offline-row__label">Качество кэша</span>
      <div class="offline-toggle" id="om-cq-toggle">
        <button class="offline-toggle__opt ${cq === 'hi' ? 'offline-toggle__opt--active' : ''}"
                data-val="hi">Hi</button>
        <button class="offline-toggle__opt ${cq === 'lo' ? 'offline-toggle__opt--active' : ''}"
                data-val="lo">Lo</button>
      </div>
    </div>

    <div class="offline-row" id="om-recache-row" style="display:none;">
      <span class="offline-row__label">Re-cache</span>
      <button class="offline-btn offline-btn--primary" id="om-recache-btn">Перекачать</button>
    </div>
    <div class="offline-progress" id="om-recache-progress" style="display:none;">
      <div class="offline-progress__bar" id="om-recache-bar" style="width:0%"></div>
    </div>

    <div class="offline-row" style="margin-top:8px;">
      <span class="offline-row__label">Прослушиваний для ☁</span>
      <input type="number" class="offline-input-num" id="om-cloud-n" min="1" max="100" value="${cloudN}" />
    </div>

    <div class="offline-row">
      <span class="offline-row__label">Хранить ☁ дней</span>
      <input type="number" class="offline-input-num" id="om-cloud-d" min="1" max="365" value="${cloudD}" />
    </div>

    <div class="offline-row" style="margin-top:4px;">
      <span></span>
      <button class="offline-btn" id="om-cloud-apply">Применить</button>
    </div>

    <div style="margin-top:10px;">
      <button class="offline-btn" id="om-list-cached" style="width:100%;margin-bottom:6px;">
        Список закреплённых и облачных
      </button>
      <button class="offline-btn offline-btn--danger" id="om-delete-all-cached" style="width:100%;">
        Удалить все 🔒 и ☁
      </button>
    </div>
  `;

  return sec;
}

/* --- 4. Modes section --- */
function _buildModesSection() {
  const om = _getOM();
  const mode = om?.getMode?.() || 'R0';
  const isR1 = mode === 'R1';

  const sec = document.createElement('div');
  sec.className = 'offline-section';
  sec.innerHTML = `
    <div class="offline-section__title">Режимы кэширования</div>
    <div class="offline-row">
      <span class="offline-row__label">PlaybackCache (3-трековое окно)</span>
      <div class="offline-toggle" id="om-mode-toggle">
        <button class="offline-toggle__opt ${!isR1 ? 'offline-toggle__opt--active' : ''}"
                data-val="R0">R0</button>
        <button class="offline-toggle__opt ${isR1 ? 'offline-toggle__opt--active' : ''}"
                data-val="R1">R1</button>
      </div>
    </div>
    <div style="font-size:11px;color:#666;margin-top:4px;">
      R0 — стриминг. R1 — предзагрузка PREV/CUR/NEXT.
    </div>
    <!-- Placeholder for R2/R3 -->
  `;
  return sec;
}

/* --- 5. Cleanup section --- */
function _buildCleanupSection() {
  const sec = document.createElement('div');
  sec.className = 'offline-section';
  sec.innerHTML = `
    <div class="offline-section__title">Очистка кэша</div>
    <button class="offline-btn offline-btn--danger" id="om-clear-all" style="width:100%;">
      Очистить всё
    </button>
  `;
  return sec;
}

/* ═══════ MODAL BUILD ═══════ */

function _buildModal() {
  injectCSS();

  const overlay = document.createElement('div');
  overlay.className = 'offline-modal-overlay';
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeOfflineModal();
  });

  const modal = document.createElement('div');
  modal.className = 'offline-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'offline-modal__header';
  header.innerHTML = `
    <span>OFFLINE</span>
    <button class="offline-modal__close" id="om-close">&times;</button>
  `;
  modal.appendChild(header);

  // Sections (order per spec: Storage → NetPolicy → PinnedCloud → Modes → Cleanup)
  modal.appendChild(_buildStorageSection());
  modal.appendChild(_buildNetPolicySection());
  modal.appendChild(_buildPinnedCloudSection());
  modal.appendChild(_buildModesSection());
  modal.appendChild(_buildCleanupSection());

  overlay.appendChild(modal);
  return overlay;
}

/* ═══════ EVENT BINDING ═══════ */

function _bindEvents(overlay) {
  // Close
  overlay.querySelector('#om-close')?.addEventListener('click', closeOfflineModal);

  // ── Net Policy events ──
  _bindNetPolicyEvents(overlay);

  // ── Quality toggle (Pinned & Cloud section) ──
  const cqToggle = overlay.querySelector('#om-cq-toggle');
  if (cqToggle) {
    cqToggle.addEventListener('click', e => {
      const btn = e.target.closest('[data-val]');
      if (!btn) return;
      const val = btn.dataset.val;
      const current = localStorage.getItem('qualityMode:v1') || 'hi';
      if (val === current) return;

      localStorage.setItem('qualityMode:v1', val);
      window.dispatchEvent(new CustomEvent('quality:changed', { detail: { quality: val } }));

      cqToggle.querySelectorAll('.offline-toggle__opt').forEach(b => {
        b.classList.toggle('offline-toggle__opt--active', b.dataset.val === val);
      });

      window.NotificationSystem?.info?.(`Качество переключено на ${val === 'hi' ? 'Hi' : 'Lo'}`);
    });
  }

  // ── Mode toggle ──
  const modeToggle = overlay.querySelector('#om-mode-toggle');
  if (modeToggle) {
    modeToggle.addEventListener('click', async e => {
      const btn = e.target.closest('[data-val]');
      if (!btn) return;
      const val = btn.dataset.val;
      const om = _getOM();
      if (!om) return;

      const current = om.getMode?.() || 'R0';
      if (val === current) return;

      try {
        await om.setMode(val);
        modeToggle.querySelectorAll('.offline-toggle__opt').forEach(b => {
          b.classList.toggle('offline-toggle__opt--active', b.dataset.val === val);
        });
      } catch (err) {
        window.NotificationSystem?.info?.(err.message || 'Не удалось переключить режим');
      }
    });
  }

  // ── Cloud settings apply ──
  overlay.querySelector('#om-cloud-apply')?.addEventListener('click', () => {
    const nInput = overlay.querySelector('#om-cloud-n');
    const dInput = overlay.querySelector('#om-cloud-d');
    if (!nInput || !dInput) return;

    const n = Math.max(1, Math.min(100, parseInt(nInput.value, 10) || 5));
    const d = Math.max(1, Math.min(365, parseInt(dInput.value, 10) || 31));

    localStorage.setItem('cloud:listenThreshold', String(n));
    localStorage.setItem('cloud:ttlDays', String(d));

    nInput.value = n;
    dInput.value = d;

    window.NotificationSystem?.info?.('Настройки облачка применены');
    window.dispatchEvent(new CustomEvent('cloud:settingsChanged', { detail: { N: n, D: d } }));
  });

  // ── Delete all cached ──
  overlay.querySelector('#om-delete-all-cached')?.addEventListener('click', () => {
    if (!confirm('Удалить все офлайн-треки? Статистика облачков будет сброшена.')) return;
    if (!confirm('Вы уверены? Это действие нельзя отменить.')) return;

    const om = _getOM();
    om?.deleteAllCached?.();
    window.NotificationSystem?.info?.('Все офлайн-треки удалены');
    refreshAllIndicators?.();
  });

  // ── List cached ──
  overlay.querySelector('#om-list-cached')?.addEventListener('click', () => {
    // TODO: Этап 10 — реализовать список закреплённых и облачных
    window.NotificationSystem?.info?.('Список будет доступен в следующем обновлении');
  });

  // ── Clear all cache ──
  overlay.querySelector('#om-clear-all')?.addEventListener('click', () => {
    if (!confirm('Очистить весь кэш? Все офлайн-данные будут удалены.')) return;
    if (!confirm('Вы уверены? Это действие нельзя отменить.')) return;

    const om = _getOM();
    om?.clearAll?.();
    window.NotificationSystem?.info?.('Кэш полностью очищен');
    refreshAllIndicators?.();
  });
}

/* ═══════ NET POLICY EVENT BINDING ═══════ */

function _bindNetPolicyEvents(overlay) {
  const platform = getPlatform();

  if (platform.supportsNetControl) {
    // ── Ethernet/Wi-Fi toggle ──
    const btnWifi = overlay.querySelector('#np-btn-wifi');
    if (btnWifi) {
      btnWifi.addEventListener('click', () => {
        const nowOn = toggleWifi();
        btnWifi.className = `np-toggle-btn ${nowOn ? 'np-toggle-btn--on' : 'np-toggle-btn--off'}`;
        btnWifi.textContent = `Ethernet / Wi-Fi: ${nowOn ? 'ВКЛ' : 'ВЫКЛ'}`;
        _updateNetPolicyUI(overlay);
      });
    }

    // ── Cellular toggle ──
    const btnCell = overlay.querySelector('#np-btn-cellular');
    if (btnCell) {
      btnCell.addEventListener('click', () => {
        const nowOn = toggleCellular();
        btnCell.className = `np-toggle-btn ${nowOn ? 'np-toggle-btn--on' : 'np-toggle-btn--off'}`;
        btnCell.textContent = `Cellular: ${nowOn ? 'ВКЛ' : 'ВЫКЛ'}`;
        _updateNetPolicyUI(overlay);
      });
    }

    // ── Cellular toast toggle ──
    const btnCellToast = overlay.querySelector('#np-btn-cell-toast');
    if (btnCellToast) {
      btnCellToast.addEventListener('click', () => {
        const nowOn = toggleCellularToast();
        btnCellToast.className = `np-toggle-btn ${nowOn ? 'np-toggle-btn--notify-on' : 'np-toggle-btn--notify-off'}`;
        btnCellToast.textContent = `Уведомления при Cellular: ${nowOn ? 'ВКЛ' : 'ВЫКЛ'}`;
      });
    }

  } else if (platform.isIOS) {
    // ── iOS kill switch ──
    const btnKill = overlay.querySelector('#np-btn-killswitch');
    if (btnKill) {
      btnKill.addEventListener('click', () => {
        const nowOn = toggleKillSwitch();
        btnKill.className = `np-toggle-btn ${nowOn ? 'np-toggle-btn--off' : 'np-toggle-btn--notify-off'}`;
        btnKill.textContent = `Отключить весь интернет: ${nowOn ? 'АКТИВНО' : 'ВЫКЛ'}`;
        _updateNetPolicyUI(overlay);
      });
    }
  }

  // ── Clear traffic stats ──
  const btnClear = overlay.querySelector('#np-btn-clear-traffic');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      clearTrafficStats();
      _updateTrafficUI(overlay);
      window.NotificationSystem?.info?.('Статистика трафика очищена');
    });
  }
}

/* ═══════ NET POLICY UI UPDATES ═══════ */

function _updateNetPolicyUI(overlay) {
  if (!overlay) return;

  // Update status
  const statusEl = overlay.querySelector('#np-status');
  if (statusEl) {
    const text = getStatusText();
    const state = getNetPolicyState();

    if (state.airplaneMode || state.killSwitch) {
      statusEl.className = 'np-status np-status--danger';
      statusEl.textContent = text;
    } else if (text) {
      statusEl.className = 'np-status np-status--warning';
      statusEl.textContent = text;
    } else if (!state.supportsNetControl) {
      statusEl.className = 'np-status np-status--info';
      statusEl.textContent = 'Управление сетью не поддерживается';
    } else {
      statusEl.className = 'np-status';
      statusEl.style.display = 'none';
      statusEl.textContent = '';
    }
  }

  // Update speed line
  _updateSpeedLine(overlay);
}

function _updateSpeedLine(overlay) {
  const speedEl = overlay?.querySelector('#np-speed-line');
  if (!speedEl) return;

  const speed = getNetworkSpeed();
  const label = getNetworkLabel();

  if (speed !== null) {
    speedEl.innerHTML = `<span>${label}</span>  ~${speed} Мбит/с`;
  } else {
    speedEl.innerHTML = `<span>${label}</span>`;
  }
}

function _updateTrafficUI(overlay) {
  const container = overlay?.querySelector('#np-traffic');
  if (!container) return;

  const stats = getTrafficStats();
  container.innerHTML = _buildTrafficStatsHTML(stats);
}

/* ═══════ LIVE UPDATE (while modal is open) ═══════ */

let _liveUpdateInterval = null;

function _startLiveUpdate() {
  _stopLiveUpdate();
  _liveUpdateInterval = setInterval(() => {
    if (!_modal) { _stopLiveUpdate(); return; }
    _updateTrafficUI(_modal);
    _updateSpeedLine(_modal);
  }, 5000); // every 5 seconds
}

function _stopLiveUpdate() {
  if (_liveUpdateInterval) {
    clearInterval(_liveUpdateInterval);
    _liveUpdateInterval = null;
  }
}

/* ═══════ PUBLIC API ═══════ */

function openOfflineModal() {
  if (_modal) return;

  _modal = _buildModal();
  document.body.appendChild(_modal);
  _bindEvents(_modal);

  // Initial UI state
  _updateNetPolicyUI(_modal);
  _startLiveUpdate();

  // Listen for net policy changes while open
  window.addEventListener('netPolicy:changed', _onPolicyChangedWhileOpen);
}

function closeOfflineModal() {
  if (!_modal) return;

  window.removeEventListener('netPolicy:changed', _onPolicyChangedWhileOpen);
  _stopLiveUpdate();

  _modal.remove();
  _modal = null;
}

function _onPolicyChangedWhileOpen() {
  if (!_modal) return;
  _updateNetPolicyUI(_modal);
}

/* ═══════ INIT ═══════ */

function initOfflineModal() {
  // Offline button click
  const offlineBtn = document.getElementById('offline-btn');
  if (offlineBtn) {
    offlineBtn.addEventListener('click', () => {
      if (_modal) {
        closeOfflineModal();
      } else {
        openOfflineModal();
      }
    });
  }

  // Sync quality button on player with modal (if modal is open)
  window.addEventListener('quality:changed', () => {
    if (!_modal) return;
    const cq = localStorage.getItem('qualityMode:v1') || 'hi';
    _modal.querySelectorAll('#om-cq-toggle .offline-toggle__opt').forEach(b => {
      b.classList.toggle('offline-toggle__opt--active', b.dataset.val === cq);
    });
  });
}

export { openOfflineModal, closeOfflineModal, initOfflineModal };
export default { openOfflineModal, closeOfflineModal, initOfflineModal };
