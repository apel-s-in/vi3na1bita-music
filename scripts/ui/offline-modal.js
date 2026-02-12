/**
 * scripts/ui/offline-modal.js
 * Offline Modal v4.2 (Spec-compliant, compact)
 *
 * Invariants:
 * - UI-only: never calls playerCore.stop()/play()/seek()/volume directly
 *   (кроме разрешённого switchQuality через playerCore.switchQuality).
 * - Preserves existing om-* DOM/CSS (pixel fidelity).
 *
 * Spec alignment:
 * - Sections order: Storage -> NetPolicy -> Pinned/Cloud -> Modes -> Presets -> Downloads.
 * - R0/R1 toggle with 60MB gate.
 * - Unified qualityMode:v1 + confirm when >5 affected.
 * - Re-cache button enabled only when needed.
 * - List 🔒/☁: pinned first (oldest first), then cloud by expires desc.
 * - Delete ALL 🔒/☁: DOUBLE confirm (spec 12.5).
 * - Apply cloud settings: confirm when it will remove cloud tracks (spec 6.8).
 */

import { getOfflineManager } from '../offline/offline-manager.js';
import * as Net from '../offline/net-policy.js';
import { estimateUsage, getAllTrackMetas } from '../offline/cache-db.js';

let _overlay = null;
let _dlPaused = false;

const U = () => window.Utils;
const esc = (s) => U()?.escapeHtml?.(String(s ?? '')) ?? String(s ?? '');
const $ = (sel, root = document) => root.querySelector(sel);

const fmtMB = (bytes) => {
  const b = Number(bytes) || 0;
  const mb = b / 1048576;
  return mb < 0.1 && b > 0 ? '< 0.1 МБ' : `${mb.toFixed(1)} МБ`;
};
const fmtB = (bytes) => {
  const b = Number(bytes) || 0;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} МБ`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} КБ`;
  return `${b} Б`;
};

function confirmBox({ title, textHtml, confirmText, cancelText, onConfirm }) {
  const fn = window.Modals?.confirm;
  if (typeof fn === 'function') {
    fn({ title, textHtml, confirmText, cancelText, onConfirm });
    return;
  }
  // eslint-disable-next-line no-alert
  if (confirm(`${title}\n\n${String(textHtml || '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')}`)) {
    try { onConfirm?.(); } catch {}
  }
}

const tplSection = (icon, title, html, last = false) => `
  <section class="om-section ${last ? 'om-section--last' : ''}">
    <h3 class="om-section__title"><span class="om-section__icon">${icon}</span> ${title}</h3>
    ${html}
  </section>`;

const tplToggle = (action, isOn, label, small = false) => `
  <button class="${small ? 'om-toggle-small' : 'om-toggle'} ${
    isOn
      ? (small ? 'om-toggle-small--on' : 'om-toggle--on')
      : (small ? '' : 'om-toggle--off')
  }" data-action="${action}">
    ${small ? '' : '<span class="om-toggle__dot"></span>'}
    <span class="${small ? '' : 'om-toggle__label'}">${label}</span>
  </button>`;

function getBodyRoot() {
  return _overlay ? $('#om-body', _overlay) : null;
}

async function renderBody(root) {
  const om = getOfflineManager();
  const ns = Net.getNetPolicyState();
  const pl = Net.getPlatform();

  const [est, breakdown, needsReCache] = await Promise.all([
    estimateUsage(),
    om.getStorageBreakdown(),
    om.countNeedsReCache?.(om.getQuality()) ?? 0
  ]);

  const q = om.getQuality();
  const mode = om.getMode();
  const { N, D } = om.getCloudSettings();
  const dl = om.getDownloadStatus?.() || { active: 0, queued: 0 };
  const bp = om.getBackgroundPreset?.() || 'balanced';

  // Storage
  const totalBytes = Object.values(breakdown || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  const pct = (v) => (totalBytes > 0 ? Math.max(0.5, ((Number(v) || 0) / totalBytes) * 100) : 0);

  const htmlStorage = `
    <div class="om-storage-info">
      <div class="om-storage-row">
        <span class="om-storage-label">Занято</span>
        <span class="om-storage-value">${fmtMB(est.used)} / ${fmtMB(est.quota)}</span>
      </div>

      <div class="om-storage-segbar" data-action="toggle-storage-details" title="Подробности">
        <div class="om-segbar__fill om-segbar--pinned" style="width:${pct(breakdown.pinned)}%"></div>
        <div class="om-segbar__fill om-segbar--cloud" style="width:${pct(breakdown.cloud)}%"></div>
        <div class="om-segbar__fill om-segbar--transient" style="width:${pct(breakdown.transient)}%"></div>
        <div class="om-segbar__fill om-segbar--other" style="width:${pct(breakdown.other)}%"></div>
      </div>

      <div class="om-storage-legend">
        ${breakdown.pinned ? `<span class="om-legend-item"><span class="om-legend-dot om-legend-dot--pinned"></span>🔒 ${fmtB(breakdown.pinned)}</span>` : ''}
        ${breakdown.cloud ? `<span class="om-legend-item"><span class="om-legend-dot om-legend-dot--cloud"></span>☁ ${fmtB(breakdown.cloud)}</span>` : ''}
        ${breakdown.transient ? `<span class="om-legend-item"><span class="om-legend-dot om-legend-dot--transient"></span>⏳ ${fmtB(breakdown.transient)}</span>` : ''}
      </div>

      <div id="om-st-detail" style="display:none; margin-top:12px">
        <button class="om-btn om-btn--danger" data-action="nuke" style="width:100%">Очистить кэш</button>
      </div>
    </div>`;

  // NetPolicy
  let htmlNet = '';

  if (pl.hasNetInfo) {
    const sp = Net.getNetworkSpeed?.();
    if (sp) htmlNet += `<div class="om-net-speed">${Net.getNetworkLabel()} · ~${sp} Мбит/с</div>`;
  }

  if (pl.supportsNetControl) {
    htmlNet += `
      <div class="om-toggles-row">
        ${tplToggle('toggle-wifi', ns.wifiEnabled, 'Ethernet / Wi-Fi')}
        ${tplToggle('toggle-cell', ns.cellularEnabled, 'Cellular')}
      </div>
      ${tplToggle('toggle-toast', ns.cellularToast, `🔔 Уведомления при Cellular: ${ns.cellularToast ? 'ВКЛ' : 'ВЫКЛ'}`, true)}
    `;
  } else {
    htmlNet += `
      <div class="om-net-unsupported">Управление сетью ограничено ОС (iOS)</div>
      <button class="om-toggle ${ns.killSwitch ? 'om-toggle--on' : 'om-toggle--neutral'}" data-action="toggle-kill" style="margin-top:8px">
        <span class="om-toggle__dot"></span><span class="om-toggle__label">Отключить весь интернет</span>
      </button>
      ${ns.killSwitch ? `<div class="om-net-kill-hint">⚠️ Все запросы заблокированы (Offline).</div>` : ''}
    `;
  }

  const ts = Net.getTrafficStats();
  const mn = ts?.monthName || '';
  const trRow = (l, v) => `<div class="om-traffic__row"><span>${l}</span><span>${fmtMB(v)}</span></div>`;

  htmlNet += `
    <div class="om-traffic" style="margin-top:12px">
      <div class="om-traffic__title">Трафик (${esc(mn)})</div>
      ${
        ts?.type === 'split'
          ? `
            <div class="om-traffic__group">
              <div class="om-traffic__subtitle">Wi-Fi</div>
              ${trRow('Месяц:', ts.wifi.monthly)}
              ${trRow('Всего:', ts.wifi.total)}
            </div>
            <div class="om-traffic__group">
              <div class="om-traffic__subtitle">Cellular</div>
              ${trRow('Месяц:', ts.cellular.monthly)}
              ${trRow('Всего:', ts.cellular.total)}
            </div>
          `
          : `
            ${trRow('Месяц:', ts.general.monthly)}
            ${trRow('Всего:', ts.general.total)}
          `
      }
      <button class="om-btn om-btn--ghost" data-action="clear-traffic" style="margin-top:8px">Очистить статистику</button>
    </div>
  `;

  // Pinned & Cloud
  const htmlPC = `
    <div class="om-pc-toprow">
      <div class="om-pc-quality">
        <div class="om-pc-quality__label">Качество</div>
        <div class="om-quality-toggle">
          <button class="om-quality-btn ${q === 'hi' ? 'om-quality-btn--active-hi' : ''}" data-action="set-q" data-val="hi">Hi</button>
          <button class="om-quality-btn ${q === 'lo' ? 'om-quality-btn--active-lo' : ''}" data-action="set-q" data-val="lo">Lo</button>
        </div>
      </div>

      <div class="om-pc-recache">
        <div class="om-pc-recache__label">Обновление (${needsReCache})</div>
        <button class="om-btn om-btn--accent om-pc-recache__btn ${needsReCache === 0 ? 'om-btn--disabled' : ''}"
          data-action="recache" ${needsReCache === 0 ? 'disabled' : ''}>🔄 Re-cache</button>
      </div>
    </div>

    <div class="om-settings-grid">
      <div class="om-setting">
        <label class="om-setting__label">Слушать для ☁ (N)</label>
        <input type="number" id="inp-n" value="${Number(N) || 5}" min="1" class="om-setting__input">
      </div>
      <div class="om-setting">
        <label class="om-setting__label">Хранить ☁ дней (D)</label>
        <input type="number" id="inp-d" value="${Number(D) || 31}" min="1" class="om-setting__input">
      </div>
    </div>

    <button class="om-btn om-btn--primary" data-action="apply-cloud" style="width:100%; margin-bottom:14px">Применить настройки</button>

    <div class="om-divider"></div>

    <button class="om-btn om-btn--outline" data-action="show-list" id="btn-show-list" style="width:100%">Показать список 🔒/☁</button>
    <div id="pinned-cloud-list" class="om-track-list" style="display:none"></div>
  `;

  // Modes
  const htmlModes = `
    <div class="om-mode-card" style="margin-bottom:10px">
      <div class="om-mode-card__head">
        <div>
          <div class="om-mode-card__name">PlaybackCache (R1)</div>
          <div class="om-mode-card__desc">Предзагрузка соседних треков</div>
        </div>
        <div class="om-mode-toggle">
          <button class="om-mode-btn ${mode === 'R0' ? 'om-mode-btn--active' : ''}" data-action="set-mode" data-val="R0">OFF</button>
          <button class="om-mode-btn ${mode === 'R1' ? 'om-mode-btn--active' : ''}" data-action="set-mode" data-val="R1">ON</button>
        </div>
      </div>
      <div class="om-mode-card__hint">${mode === 'R1' ? '✅ Активен — до 3 треков офлайн' : 'R0 — чистый стриминг'}</div>
    </div>

    <div class="om-mode-card om-mode-card--disabled">
      <div class="om-mode-card__head">
        <div><div class="om-mode-card__name">SmartPrefetch (R2)</div></div>
        <div class="om-mode-toggle"><button class="om-mode-btn" disabled>OFF</button></div>
      </div>
    </div>
  `;

  // Presets
  const presets = [
    ['aggressive', '🚀', 'Агрессивный'],
    ['balanced', '⚖️', 'Баланс'],
    ['saver', '🔋', 'Эконом']
  ];
  const htmlPresets = `
    <div class="om-presets-list">
      ${presets.map(([k, i, n]) => `
        <button class="om-preset ${bp === k ? 'om-preset--active' : ''}" data-action="set-bg-preset" data-val="${k}">
          <span class="om-preset__icon">${i}</span>
          <div class="om-preset__text"><div class="om-preset__name">${n}</div></div>
          <span class="om-preset__check">${bp === k ? '✓' : ''}</span>
        </button>
      `).join('')}
    </div>
  `;

  // Downloads
  const htmlDL = `
    <div class="om-dl-stats">
      <div class="om-dl-stat"><span class="om-dl-stat__num">${dl.active}</span><span class="om-dl-stat__label">Активных</span></div>
      <div class="om-dl-stat"><span class="om-dl-stat__num">${dl.queued}</span><span class="om-dl-stat__label">В очереди</span></div>
    </div>
    <button class="om-btn om-btn--ghost" data-action="dl-toggle">
      ${_dlPaused ? '▶ Возобновить' : '⏸ Пауза'}
    </button>
  `;

  root.innerHTML =
    tplSection('📦', 'Хранилище', htmlStorage) +
    tplSection('🌐', 'Сетевая политика', htmlNet) +
    tplSection('🔒', 'Pinned и Cloud', htmlPC) +
    tplSection('⚙️', 'Режимы', htmlModes) +
    tplSection('🌙', 'Пресеты', htmlPresets) +
    tplSection('⬇️', 'Загрузки', htmlDL, true);
}

async function refresh() {
  const body = getBodyRoot();
  if (body) await renderBody(body);
}

async function buildPinnedCloudListHtml() {
  const all = await getAllTrackMetas();
  const pinned = all
    .filter((m) => m?.type === 'pinned')
    .sort((a, b) => (a.pinnedAt || a.createdAt || 0) - (b.pinnedAt || b.createdAt || 0));

  const cloud = all
    .filter((m) => m?.type === 'cloud')
    .sort((a, b) => (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0));

  const items = [...pinned, ...cloud];
  if (!items.length) return '<div class="om-list-empty">Нет треков</div>';

  const now = Date.now();
  return items.map((m) => {
    const title = window.TrackRegistry?.getTrackByUid?.(m.uid)?.title || m.uid;
    const icon = m.type === 'pinned' ? '🔒' : '☁';
    const daysLeft = m.type === 'cloud' && m.cloudExpiresAt
      ? Math.max(0, Math.ceil((m.cloudExpiresAt - now) / 86400000))
      : 0;
    const badge = m.type === 'pinned' ? 'Закреплён' : `${daysLeft} дн.`;
    const q = String(m.quality || '').toUpperCase() || '—';

    return `
      <div class="om-list-item">
        <span class="om-list-icon">${icon}</span>
        <div class="om-list-title">${esc(title)}</div>
        <div class="om-list-meta">${q} · ${fmtB(m.size)} · ${badge}</div>
        <button class="om-list-del" data-action="del-track" data-uid="${esc(m.uid)}">✕</button>
      </div>
    `;
  }).join('') + `
    <button class="om-btn om-btn--danger-outline" data-action="del-all" style="width:100%;margin-top:10px">Удалить ВСЕ</button>
  `;
}

async function toggleTrackList(listDiv, btn) {
  if (!listDiv || !btn) return;

  const isOpen = listDiv.style.display !== 'none';
  if (isOpen) {
    listDiv.style.display = 'none';
    btn.textContent = 'Показать список 🔒/☁';
    return;
  }

  listDiv.style.display = 'block';
  btn.textContent = 'Скрыть список';
  listDiv.innerHTML = '<div class="om-list-loading">Загрузка...</div>';

  try {
    listDiv.innerHTML = await buildPinnedCloudListHtml();
  } catch {
    listDiv.innerHTML = '<div class="om-list-empty">Ошибка</div>';
  }
}

async function reopenListIfOpen() {
  const list = _overlay ? $('#pinned-cloud-list', _overlay) : null;
  const btn = _overlay ? $('#btn-show-list', _overlay) : null;
  if (!list || !btn) return;
  if (list.style.display === 'none') return;
  try { list.innerHTML = await buildPinnedCloudListHtml(); } catch {}
}

async function estimateCloudRemovalsOnApply({ newN, newD }) {
  // Spec: warnings when apply causes deletions:
  // - N increased: remove auto-cloud where cloudFullListenCount < newN.
  // - D decreased: some clouds expire immediately by lastFullListenAt + newD.
  const all = await getAllTrackMetas();
  const now = Date.now();
  let willRemove = 0;

  for (const m of all) {
    if (m?.type !== 'cloud') continue;

    const isAuto = m.cloudOrigin === 'auto';
    const listens = Number(m.cloudFullListenCount || 0) || 0;

    if (isAuto && newN && listens < newN) {
      willRemove++;
      continue;
    }

    const last = Number(m.lastFullListenAt || 0) || 0;
    if (newD && last > 0) {
      const exp = last + newD * 86400000;
      if (exp < now) willRemove++;
    }
  }

  return willRemove;
}

async function handleAction(e) {
  const btn = e.target.closest?.('[data-action]');
  if (!btn || btn.disabled) return;

  const act = btn.dataset.action;
  const om = getOfflineManager();

  switch (act) {
    case 'toggle-storage-details': {
      const det = $('#om-st-detail', _overlay);
      if (det) det.style.display = det.style.display === 'none' ? 'block' : 'none';
      return;
    }

    case 'nuke': {
      confirmBox({
        title: 'Очистить кэш?',
        textHtml: 'Удалит 🔒/☁ кэш и очистит Cache Storage (SW).<br>Global-статистика не будет затронута.',
        confirmText: 'Очистить',
        cancelText: 'Отмена',
        onConfirm: async () => {
          await om.removeAllCached();
          if ('caches' in window) {
            try { (await caches.keys()).forEach((k) => caches.delete(k)); } catch {}
          }
          window.NotificationSystem?.success?.('Кэш очищен');
          await refresh();
        }
      });
      return;
    }

    // NetPolicy
    case 'toggle-wifi':
      Net.toggleWifi();
      await refresh();
      return;
    case 'toggle-cell':
      Net.toggleCellular();
      await refresh();
      return;
    case 'toggle-toast':
      Net.toggleCellularToast();
      await refresh();
      return;
    case 'toggle-kill':
      Net.toggleKillSwitch();
      await refresh();
      return;
    case 'clear-traffic':
      Net.clearTrafficStats();
      await refresh();
      return;

    // Quality
    case 'set-q': {
      const nq = btn.dataset.val === 'lo' ? 'lo' : 'hi';
      if (om.getQuality() === nq) return;

      const affected = await om.countNeedsReCache(nq);

      const applyQ = () => {
        om.setCacheQualitySetting(nq);
        window.playerCore?.switchQuality?.(nq); // разрешено ТЗ
        refresh().catch(() => {});
      };

      if (affected > 5) {
        confirmBox({
          title: 'Смена качества',
          textHtml: `Смена качества затронет ${affected} файлов. Перекачать?`,
          confirmText: 'Перекачать',
          cancelText: 'Отмена',
          onConfirm: applyQ
        });
      } else {
        applyQ();
      }
      return;
    }

    case 'recache':
      om.queue?.setParallel?.(3);
      await om.reCacheAll(om.getQuality());
      window.NotificationSystem?.info?.('Перекэширование запущено');
      setTimeout(() => om.queue?.setParallel?.(1), 15000);
      await refresh();
      return;

    case 'apply-cloud': {
      const newN = Math.max(1, parseInt(String($('#inp-n', _overlay)?.value || '5'), 10) || 5);
      const newD = Math.max(1, parseInt(String($('#inp-d', _overlay)?.value || '31'), 10) || 31);

      // Spec 6.8: confirm when it will remove some cloud tracks.
      // Мы делаем локальную оценку по метаданным. Без сети.
      const current = om.getCloudSettings();
      const mightRemove = (newN > current.N) || (newD < current.D);
      if (mightRemove) {
        const willRemove = await estimateCloudRemovalsOnApply({ newN, newD });
        if (willRemove > 0) {
          confirmBox({
            title: 'Применить настройки облачка?',
            textHtml: `Новые настройки приведут к удалению ${willRemove} трек(ов) из облачного кэша. Продолжить?`,
            confirmText: 'Продолжить',
            cancelText: 'Отмена',
            onConfirm: async () => {
              await om.confirmApplyCloudSettings({ newN, newD });
              window.NotificationSystem?.success?.('Настройки применены');
              await refresh();
              await reopenListIfOpen();
            }
          });
          return;
        }
      }

      await om.confirmApplyCloudSettings({ newN, newD });
      window.NotificationSystem?.success?.('Настройки применены');
      await refresh();
      await reopenListIfOpen();
      return;
    }

    // List
    case 'show-list':
      await toggleTrackList($('#pinned-cloud-list', _overlay), btn);
      return;

    case 'del-track': {
      const uid = String(btn.dataset.uid || '').trim();
      if (!uid) return;

      confirmBox({
        title: 'Удалить из кэша?',
        textHtml: 'Трек будет удалён из 🔒/☁ кэша. Cloud-статистика будет сброшена.',
        confirmText: 'Удалить',
        cancelText: 'Отмена',
        onConfirm: async () => {
          await om.removeCached(uid);
          await refresh();
          await reopenListIfOpen();
        }
      });
      return;
    }

    case 'del-all': {
      // Spec 12.5: double confirm
      const metas = await getAllTrackMetas();
      const targets = metas.filter((m) => m?.type === 'pinned' || m?.type === 'cloud');
      const count = targets.length;
      const bytes = targets.reduce((a, m) => a + (Number(m?.size || 0) || 0), 0);

      confirmBox({
        title: 'Удалить все офлайн-треки?',
        textHtml: `Удалить все офлайн-треки (${count} файлов, ${fmtB(bytes)})?<br>Статистика облачков будет сброшена.`,
        confirmText: 'Да, удалить',
        cancelText: 'Отмена',
        onConfirm: () => {
          confirmBox({
            title: 'Вы уверены?',
            textHtml: 'Это действие нельзя отменить.',
            confirmText: 'Удалить',
            cancelText: 'Отмена',
            onConfirm: async () => {
              await om.removeAllCached();
              await refresh();
              await reopenListIfOpen();
            }
          });
        }
      });
      return;
    }

    // Modes
    case 'set-mode': {
      const v = btn.dataset.val === 'R1' ? 'R1' : 'R0';
      if (v === 'R1') {
        if (await om.hasSpace()) om.setMode('R1');
        else window.NotificationSystem?.warning?.('Недостаточно места (нужно 60 МБ)');
      } else {
        om.setMode('R0');
      }
      await refresh();
      return;
    }

    // Presets
    case 'set-bg-preset':
      om.setBackgroundPreset?.(btn.dataset.val);
      await refresh();
      return;

    // Downloads
    case 'dl-toggle':
      _dlPaused = !_dlPaused;
      if (_dlPaused) om.queue?.pause?.();
      else om.queue?.resume?.();
      await refresh();
      return;
  }
}

export function openOfflineModal() {
  if (_overlay) return;

  _overlay = document.createElement('div');
  _overlay.className = 'om-overlay om-overlay--visible';
  _overlay.innerHTML = `
    <div class="om-modal om-modal--visible">
      <div class="om-header">
        <div class="om-header__title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          OFFLINE
        </div>
        <button class="om-header__close">×</button>
      </div>
      <div class="om-body" id="om-body"></div>
    </div>
  `;

  document.body.appendChild(_overlay);

  const modal = $('.om-modal', _overlay);
  const close = () => closeOfflineModal();

  _overlay.addEventListener('click', (e) => { if (e.target === _overlay) close(); });
  $('.om-header__close', modal)?.addEventListener('click', close);

  modal.addEventListener('click', (ev) => { handleAction(ev).catch(() => {}); });

  renderBody($('#om-body', _overlay)).catch(() => {});
}

export function closeOfflineModal() {
  try { _overlay?.remove(); } catch {}
  _overlay = null;
}

export function initOfflineModal() {
  const btn = document.getElementById('offline-btn');
  if (!btn) return;

  btn.addEventListener('click', (e) => {
    if (e.target?.classList?.contains('offline-btn-alert')) {
      e.stopPropagation();
      window.NotificationSystem?.info?.('Есть треки для обновления', 6000);
      return;
    }
    openOfflineModal();
  });

  window.addEventListener('offline:uiChanged', () => { if (_overlay) refresh().catch(() => {}); });
  window.addEventListener('netPolicy:changed', () => { if (_overlay) refresh().catch(() => {}); });
  window.addEventListener('offline:stateChanged', () => { if (_overlay) refresh().catch(() => {}); });
}

export default { initOfflineModal, openOfflineModal, closeOfflineModal };
