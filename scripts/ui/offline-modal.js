/**
 * offline-modal.js — v3.0 Full Redesign
 * Красивое модальное окно OFFLINE, соответствующее стилистике приложения.
 * Секции по ТЗ Часть 12.2 (сверху вниз):
 *   1. Хранилище
 *   2. Сетевая политика
 *   3. Pinned и Cloud
 *   4. Загрузки
 *   5. Режимы кэширования
 *   6. Список треков
 *   7. Очистка
 */
import { getOfflineManager } from '../offline/offline-manager.js';
import * as Net from '../offline/net-policy.js';

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

/* ─── Main render ─── */

function render() {
  if (_modal) return;

  const om = getOfflineManager();
  const netState = Net.getNetPolicyState();
  const plat = Net.getPlatform();
  const q = om.getQuality();
  const mode = om.getMode();
  const { N, D } = om.getCloudSettings();

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'om-overlay';

  // Modal container
  const modal = document.createElement('div');
  modal.className = 'om-modal';

  // ── Header ──
  modal.innerHTML = `
    <div class="om-header">
      <div class="om-header__title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>OFFLINE</span>
      </div>
      <button class="om-header__close" aria-label="Закрыть">&times;</button>
    </div>
    <div class="om-body" id="om-body"></div>
  `;

  const body = modal.querySelector('#om-body');

  // ═══════════════════════════════════════════
  // 1. ХРАНИЛИЩЕ
  // ═══════════════════════════════════════════
  body.insertAdjacentHTML('beforeend', `
    <section class="om-section">
      <h3 class="om-section__title">
        <span class="om-section__icon">💾</span> Хранилище
      </h3>
      <div class="om-storage-info" id="om-storage-info">
        <div class="om-storage-row">
          <span class="om-storage-label">Занято</span>
          <span class="om-storage-value" id="om-st-val">—</span>
        </div>
        <div class="om-progress-track">
          <div class="om-progress-fill" id="om-st-bar" style="width:0%"></div>
        </div>
        <div class="om-storage-breakdown" id="om-st-bd"></div>
      </div>
    </section>
  `);

  // Async populate storage
  _populateStorage(body, om);

  // ═══════════════════════════════════════════
  // 2. СЕТЕВАЯ ПОЛИТИКА
  // ═══════════════════════════════════════════
  let netBody = '';

  // Speed line (hidden on iOS/Firefox)
  if (plat.hasNetInfo) {
    const speed = Net.getNetworkSpeed();
    const label = Net.getNetworkLabel();
    if (speed) {
      netBody += `<div class="om-net-speed">${esc(label)} · ~${speed} Мбит/с</div>`;
    }
  }

  if (plat.supportsNetControl) {
    netBody += `
      <div class="om-toggles-row">
        <button class="om-toggle ${netState.wifiEnabled ? 'om-toggle--on' : 'om-toggle--off'}" id="btn-wifi">
          <span class="om-toggle__dot"></span>
          <span class="om-toggle__label">Ethernet / Wi-Fi</span>
        </button>
        <button class="om-toggle ${netState.cellularEnabled ? 'om-toggle--on' : 'om-toggle--off'}" id="btn-cell">
          <span class="om-toggle__dot"></span>
          <span class="om-toggle__label">Cellular</span>
        </button>
      </div>
      <button class="om-toggle-small ${netState.cellularToast ? 'om-toggle-small--on' : ''}" id="btn-toast">
        🔔 Уведомления при Cellular-стриминге: ${netState.cellularToast ? 'ВКЛ' : 'ВЫКЛ'}
      </button>
    `;
  } else {
    netBody += `<div class="om-net-unsupported">Управление сетью ограничено ОС</div>`;
    if (plat.isIOS) {
      netBody += `
        <button class="om-toggle ${netState.killSwitch ? 'om-toggle--off' : 'om-toggle--neutral'}" id="btn-kill" style="margin-top:8px;">
          <span class="om-toggle__dot"></span>
          <span class="om-toggle__label">Отключить весь интернет</span>
        </button>
      `;
    }
  }

  // Status text
  const statusText = Net.getStatusText();
  if (statusText) {
    netBody += `<div class="om-net-status">${esc(statusText)}</div>`;
  }

  // Traffic stats
  const stats = Net.getTrafficStats();
  const monthName = stats.monthName || '';
  if (stats.type === 'general') {
    netBody += `
      <div class="om-traffic">
        <div class="om-traffic__title">Трафик</div>
        <div class="om-traffic__row"><span>${esc(monthName)}:</span> <span>${fmtMB(stats.general.monthly)}</span></div>
        <div class="om-traffic__row"><span>Всего:</span> <span>${fmtMB(stats.general.total)}</span></div>
      </div>
    `;
  } else {
    netBody += `
      <div class="om-traffic">
        <div class="om-traffic__title">Трафик</div>
        <div class="om-traffic__group">
          <div class="om-traffic__subtitle">Ethernet / Wi-Fi</div>
          <div class="om-traffic__row"><span>${esc(monthName)}:</span> <span>${fmtMB(stats.wifi.monthly)}</span></div>
          <div class="om-traffic__row"><span>Всего:</span> <span>${fmtMB(stats.wifi.total)}</span></div>
        </div>
        <div class="om-traffic__group">
          <div class="om-traffic__subtitle">Cellular</div>
          <div class="om-traffic__row"><span>${esc(monthName)}:</span> <span>${fmtMB(stats.cellular.monthly)}</span></div>
          <div class="om-traffic__row"><span>Всего:</span> <span>${fmtMB(stats.cellular.total)}</span></div>
        </div>
      </div>
    `;
  }

  netBody += `<button class="om-btn om-btn--ghost" id="btn-clear-traffic">Очистить статистику</button>`;

  body.insertAdjacentHTML('beforeend', `
    <section class="om-section">
      <h3 class="om-section__title">
        <span class="om-section__icon">🌐</span> Сетевая политика
      </h3>
      ${netBody}
    </section>
  `);

  // ═══════════════════════════════════════════
  // 3. PINNED И CLOUD
  // ═══════════════════════════════════════════
  body.insertAdjacentHTML('beforeend', `
    <section class="om-section">
      <h3 class="om-section__title">
        <span class="om-section__icon">🔒</span> Pinned и Cloud
      </h3>

      <div class="om-quality-row">
        <span class="om-quality-label">Качество кэша</span>
        <div class="om-quality-toggle" id="om-qual-toggle">
          <button class="om-quality-btn ${q === 'hi' ? 'om-quality-btn--active-hi' : ''}" data-val="hi">Hi</button>
          <button class="om-quality-btn ${q === 'lo' ? 'om-quality-btn--active-lo' : ''}" data-val="lo">Lo</button>
        </div>
      </div>

      <button class="om-btn om-btn--accent" id="btn-recache" style="width:100%;">
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

      <button class="om-btn om-btn--primary" id="btn-apply-cloud" style="width:100%;">
        Применить настройки
      </button>

      <div class="om-divider"></div>

      <button class="om-btn om-btn--danger-outline" id="btn-del-all" style="width:100%;">
        🗑 Удалить все 🔒 и ☁
      </button>
    </section>
  `);

  // ═══════════════════════════════════════════
  // 4. ЗАГРУЗКИ
  // ═══════════════════════════════════════════
  const qStatus = om.getDownloadStatus?.() || { active: 0, queued: 0 };
  body.insertAdjacentHTML('beforeend', `
    <section class="om-section">
      <h3 class="om-section__title">
        <span class="om-section__icon">⬇️</span> Загрузки
      </h3>
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
      <button class="om-btn om-btn--ghost" id="btn-dl-pause">⏸ Пауза</button>
    </section>
  `);

  // ═══════════════════════════════════════════
  // 5. РЕЖИМЫ КЭШИРОВАНИЯ
  // ═══════════════════════════════════════════
  body.insertAdjacentHTML('beforeend', `
    <section class="om-section">
      <h3 class="om-section__title">
        <span class="om-section__icon">⚙️</span> Режимы кэширования
      </h3>
      <div class="om-mode-card">
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
        <div class="om-mode-card__hint">
          ${mode === 'R1' ? '✅ Активен — до 3 треков доступны офлайн' : 'R0 — чистый стриминг'}
        </div>
      </div>
    </section>
  `);

  // ═══════════════════════════════════════════
  // 6. СПИСОК ТРЕКОВ
  // ═══════════════════════════════════════════
  body.insertAdjacentHTML('beforeend', `
    <section class="om-section">
      <h3 class="om-section__title">
        <span class="om-section__icon">📋</span> Список треков
      </h3>
      <button class="om-btn om-btn--outline" id="btn-show-list" style="width:100%;">
        Показать закреплённые и облачные
      </button>
      <div id="pinned-cloud-list" class="om-track-list" style="display:none;"></div>
    </section>
  `);

  // ═══════════════════════════════════════════
  // 7. ОЧИСТКА
  // ═══════════════════════════════════════════
  body.insertAdjacentHTML('beforeend', `
    <section class="om-section om-section--last">
      <h3 class="om-section__title">
        <span class="om-section__icon">🧹</span> Очистка
      </h3>
      <button class="om-btn om-btn--danger" id="btn-nuke" style="width:100%;">
        Очистить ВЕСЬ кэш приложения
      </button>
    </section>
  `);

  // ── Mount ──
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  _modal = overlay;

  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.add('om-overlay--visible');
    modal.classList.add('om-modal--visible');
  });

  // ── Bind events ──
  _bindEvents(overlay, modal, om, plat);
}

/* ─── Async storage populate ─── */
async function _populateStorage(body, om) {
  try {
    const { estimateUsage } = await import('../offline/cache-db.js');
    const est = await estimateUsage();

    const valEl = body.querySelector('#om-st-val');
    const barEl = body.querySelector('#om-st-bar');
    const bdEl = body.querySelector('#om-st-bd');

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
    console.warn('[OfflineModal] storage error:', e);
  }
}

/* ─── Event binding ─── */
function _bindEvents(overlay, modal, om, plat) {
  const close = () => {
    modal.classList.remove('om-modal--visible');
    overlay.classList.remove('om-overlay--visible');
    setTimeout(() => { overlay.remove(); _modal = null; }, 250);
  };

  const reopen = () => { close(); setTimeout(render, 280); };

  // Close
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  modal.querySelector('.om-header__close')?.addEventListener('click', close);
  document.addEventListener('keydown', function _esc(e) {
    if (e.key === 'Escape' && _modal) { close(); document.removeEventListener('keydown', _esc); }
  });

  // Net Policy
  if (plat.supportsNetControl) {
    modal.querySelector('#btn-wifi')?.addEventListener('click', () => { Net.toggleWifi(); reopen(); });
    modal.querySelector('#btn-cell')?.addEventListener('click', () => { Net.toggleCellular(); reopen(); });
    modal.querySelector('#btn-toast')?.addEventListener('click', () => { Net.toggleCellularToast(); reopen(); });
  } else if (plat.isIOS) {
    modal.querySelector('#btn-kill')?.addEventListener('click', () => { Net.toggleKillSwitch(); reopen(); });
  }
  modal.querySelector('#btn-clear-traffic')?.addEventListener('click', () => { Net.clearTrafficStats(); reopen(); });

  // Quality toggle
  const q = om.getQuality();
  modal.querySelector('#om-qual-toggle')?.addEventListener('click', async (e) => {
    const t = e.target.closest('.om-quality-btn');
    if (!t || !t.dataset?.val || t.dataset.val === q) return;

    const newQ = t.dataset.val;
    const count = om.countNeedsReCache ? await om.countNeedsReCache(newQ) : 0;

    const doSwitch = () => {
      om.setCacheQualitySetting(newQ);
      if (window.playerCore?.switchQuality) window.playerCore.switchQuality(newQ);
      else window.dispatchEvent(new CustomEvent('quality:changed', { detail: { quality: newQ } }));
      reopen();
    };

    if (count > 5) {
      if (window.Modals?.confirm) {
        window.Modals.confirm({
          title: 'Смена качества',
          textHtml: `Перекэширование затронет <b>${count}</b> файлов. Продолжить?`,
          confirmText: 'Перекачать',
          cancelText: 'Отмена',
          onConfirm: doSwitch
        });
      } else if (confirm(`Смена качества затронет ${count} файлов. Перекачать?`)) doSwitch();
    } else doSwitch();
  });

  // Re-cache
  modal.querySelector('#btn-recache')?.addEventListener('click', async () => {
    const rq = om.getQuality();
    if (!om.countNeedsReCache || !om.reCacheAll) return window.NotificationSystem?.info?.('Re-cache не поддерживается');
    const count = await om.countNeedsReCache(rq);
    if (!count) return window.NotificationSystem?.info?.('Все файлы в правильном качестве ✓');
    om.queue?.setParallel?.(3);
    await om.reCacheAll(rq);
    window.NotificationSystem?.info?.(`Перекэширование: ${count} файлов`);
    setTimeout(() => om.queue?.setParallel?.(1), 15000);
  });

  // Cloud settings apply
  modal.querySelector('#btn-apply-cloud')?.addEventListener('click', async () => {
    const newN = parseInt(modal.querySelector('#inp-n')?.value, 10) || 5;
    const newD = parseInt(modal.querySelector('#inp-d')?.value, 10) || 31;
    if (om.previewCloudSettingsChange) {
      const preview = await om.previewCloudSettingsChange({ newN, newD });
      if (preview.toRemove > 0) {
        if (window.Modals?.confirm) {
          window.Modals.confirm({
            title: 'Изменение настроек',
            textHtml: `Новые настройки приведут к удалению <b>${preview.toRemove}</b> треков из облачного кэша. Продолжить?`,
            confirmText: 'Продолжить',
            cancelText: 'Отмена',
            onConfirm: async () => { await om.confirmApplyCloudSettings({ newN, newD }); close(); }
          });
          return;
        }
        if (!confirm(`При изменении настроек ${preview.toRemove} файлов будут удалены из кэша. Продолжить?`)) return;
      }
    }
    await om.confirmApplyCloudSettings({ newN, newD });
    close();
  });

  // Delete all
  modal.querySelector('#btn-del-all')?.addEventListener('click', () => {
    if (window.Modals?.confirm) {
      window.Modals.confirm({
        title: 'Удалить все офлайн-треки?',
        textHtml: 'Статистика облачков будет сброшена.',
        confirmText: 'Удалить',
        cancelText: 'Отмена',
        onConfirm: () => {
          window.Modals.confirm({
            title: 'Вы уверены?',
            textHtml: 'Это действие нельзя отменить.',
            confirmText: 'Да, удалить',
            cancelText: 'Отмена',
            onConfirm: async () => { await om.removeAllCached(); close(); }
          });
        }
      });
    }
  });

  // Downloads pause
  let dlPaused = false;
  modal.querySelector('#btn-dl-pause')?.addEventListener('click', (e) => {
    dlPaused = !dlPaused;
    if (dlPaused) { om.queue?.pause?.(); e.target.textContent = '▶ Возобновить'; }
    else { om.queue?.resume?.(); e.target.textContent = '⏸ Пауза'; }
  });

  // Mode toggle
  modal.querySelector('#om-mode-toggle')?.addEventListener('click', async (e) => {
    const t = e.target.closest('.om-mode-btn');
    if (!t || !t.dataset?.val) return;
    if (t.dataset.val === 'R1') {
      const ok = await om.hasSpace();
      if (!ok) return window.NotificationSystem?.warning?.('Недостаточно места (минимум 60 МБ)');
    }
    om.setMode(t.dataset.val);
    reopen();
  });

  // Show list
  modal.querySelector('#btn-show-list')?.addEventListener('click', async () => {
    const listEl = modal.querySelector('#pinned-cloud-list');
    if (!listEl) return;
    if (listEl.style.display !== 'none') { listEl.style.display = 'none'; return; }
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
        if (m.type === 'pinned') {
          badge = '<span class="om-list-badge om-list-badge--pin">Закреплён</span>';
        } else if (m.cloudExpiresAt) {
          const days = Math.max(0, Math.ceil((m.cloudExpiresAt - now) / DAY_MS));
          badge = `<span class="om-list-badge om-list-badge--cloud">${days} дн.</span>`;
        }
        html += `
          <div class="om-list-item">
            <span class="om-list-icon">${icon}</span>
            <span class="om-list-title">${esc(title)}</span>
            <span class="om-list-meta">${mq} · ${size}</span>
            ${badge}
          </div>
        `;
      }

      if (!html) html = '<div class="om-list-empty">Нет закреплённых или облачных треков</div>';
      listEl.innerHTML = html;
    } catch (e) {
      listEl.innerHTML = '<div class="om-list-empty" style="color:#ef5350;">Ошибка загрузки</div>';
    }
  });

  // Nuke all
  modal.querySelector('#btn-nuke')?.addEventListener('click', () => {
    if (window.Modals?.confirm) {
      window.Modals.confirm({
        title: 'Очистить ВЕСЬ кэш?',
        textHtml: 'Все офлайн-данные будут утеряны.',
        confirmText: 'Очистить',
        cancelText: 'Отмена',
        onConfirm: () => {
          window.Modals.confirm({
            title: 'Последнее подтверждение',
            textHtml: 'Действие необратимо. Продолжить?',
            confirmText: 'Да, очистить всё',
            cancelText: 'Отмена',
            onConfirm: async () => {
              try {
                await om.removeAllCached();
                if ('caches' in window) {
                  const keys = await caches.keys();
                  await Promise.all(keys.map(k => caches.delete(k)));
                }
                window.NotificationSystem?.success?.('Кэш полностью очищен');
              } catch { window.NotificationSystem?.error?.('Ошибка очистки'); }
              close();
            }
          });
        }
      });
    }
  });
}

/* ─── Public API ─── */
export function openOfflineModal() { render(); }
export function closeOfflineModal() { if (_modal) { _modal.remove(); _modal = null; } }

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

export default { initOfflineModal, openOfflineModal };
