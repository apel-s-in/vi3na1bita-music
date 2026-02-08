/**
 * scripts/ui/offline-modal.js
 * Optimized Offline Modal v4.0 (Spec-compliant: R1/NetPolicy/UnifiedQuality)
 * 
 * Implements strict adherence to "Offline Modal Structure (Part 12)" of the Spec.
 * Uses event delegation and template literals for minimal LOC and max performance.
 */

import { getOfflineManager } from '../offline/offline-manager.js';
import * as Net from '../offline/net-policy.js';
import { estimateUsage } from '../offline/cache-db.js';

let _overlay = null;

// --- Helpers ---
const esc = (s) => window.Utils?.escapeHtml?.(String(s ?? '')) ?? String(s ?? '');
const fmtMB = (b) => {
  const n = Number(b) || 0;
  const mb = n / 1048576;
  return mb < 0.1 && n > 0 ? '< 0.1 МБ' : `${mb.toFixed(1)} МБ`;
};
const fmtB = (b) => {
  const n = Number(b) || 0;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} МБ`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} КБ`;
  return `${n} Б`;
};
const $q = (sel, root = document) => root.querySelector(sel);

// --- Component Generators ---

const _tplToggle = (action, isOn, label, isSmall = false) => `
  <button class="${isSmall ? 'om-toggle-small' : 'om-toggle'} ${isOn ? (isSmall ? 'om-toggle-small--on' : 'om-toggle--on') : (isSmall ? '' : 'om-toggle--off')}" data-action="${action}">
    ${!isSmall ? `<span class="om-toggle__dot"></span>` : ''}
    <span class="${isSmall ? '' : 'om-toggle__label'}">${label}</span>
  </button>`;

const _tplSection = (icon, title, content, isLast = false) => `
  <section class="om-section ${isLast ? 'om-section--last' : ''}">
    <h3 class="om-section__title"><span class="om-section__icon">${icon}</span> ${title}</h3>
    ${content}
  </section>`;

// --- Main Render Logic ---

async function _renderBody(container) {
  const om = getOfflineManager();
  const ns = Net.getNetPolicyState();
  const pl = Net.getPlatform();
  
  // Async Data Fetching
  const [est, breakdown, needsReCache] = await Promise.all([
    estimateUsage(),
    om.getStorageBreakdown(),
    om.countNeedsReCache ? om.countNeedsReCache(om.getQuality()) : Promise.resolve(0)
  ]);
  
  const q = om.getQuality(); // 'hi' | 'lo'
  const mode = om.getMode(); // 'R0' | 'R1'
  const { N, D } = om.getCloudSettings();
  const dl = om.getDownloadStatus() || { active: 0, queued: 0 };
  const bp = om.getBackgroundPreset?.() || 'balanced';

  // 1. Storage Section
  const totalBytes = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const pct = (v) => totalBytes > 0 ? Math.max(0.5, (v / totalBytes) * 100) : 0;
  
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
         <button class="om-btn om-btn--danger" data-action="nuke" style="width:100%">Очистить ВЕСЬ кэш</button>
      </div>
    </div>`;

  // 2. Network Policy Section
  let htmlNet = '';
  if (pl.hasNetInfo) {
    const sp = Net.getNetworkSpeed();
    if (sp) htmlNet += `<div class="om-net-speed">${Net.getNetworkLabel()} · ~${sp} Мбит/с</div>`;
  }
  
  if (pl.supportsNetControl) {
    htmlNet += `
      <div class="om-toggles-row">
        ${_tplToggle('toggle-wifi', ns.wifiEnabled, 'Ethernet / Wi-Fi')}
        ${_tplToggle('toggle-cell', ns.cellularEnabled, 'Cellular')}
      </div>
      ${_tplToggle('toggle-toast', ns.cellularToast, `🔔 Уведомления при Cellular: ${ns.cellularToast?'ВКЛ':'ВЫКЛ'}`, true)}`;
  } else {
    htmlNet += `
      <div class="om-net-unsupported">Управление сетью ограничено ОС (iOS)</div>
      <button class="om-toggle ${ns.killSwitch ? 'om-toggle--on' : 'om-toggle--neutral'}" data-action="toggle-kill" style="margin-top:8px">
        <span class="om-toggle__dot"></span><span class="om-toggle__label">Отключить весь интернет</span>
      </button>
      ${ns.killSwitch ? `<div class="om-net-kill-hint">⚠️ Все запросы заблокированы (Offline).</div>` : ''}`;
  }
  
  // Traffic Stats
  const ts = Net.getTrafficStats();
  const mn = ts.monthName || '';
  const row = (l, v) => `<div class="om-traffic__row"><span>${l}</span><span>${fmtMB(v)}</span></div>`;
  
  htmlNet += `<div class="om-traffic" style="margin-top:12px">
    <div class="om-traffic__title">Трафик (${esc(mn)})</div>
    ${ts.type === 'split' 
      ? `<div class="om-traffic__group"><div class="om-traffic__subtitle">Wi-Fi</div>${row('Месяц:', ts.wifi.monthly)}${row('Всего:', ts.wifi.total)}</div>
         <div class="om-traffic__group"><div class="om-traffic__subtitle">Cellular</div>${row('Месяц:', ts.cellular.monthly)}${row('Всего:', ts.cellular.total)}</div>`
      : `${row('Месяц:', ts.general.monthly)}${row('Всего:', ts.general.total)}`}
    <button class="om-btn om-btn--ghost" data-action="clear-traffic" style="margin-top:8px">Очистить статистику</button>
  </div>`;

  // 3. Pinned & Cloud Section (Unified)
  const htmlPC = `
    <div class="om-pc-toprow">
      <div class="om-pc-quality">
        <div class="om-pc-quality__label">Качество</div>
        <div class="om-quality-toggle">
          <button class="om-quality-btn ${q==='hi'?'om-quality-btn--active-hi':''}" data-action="set-q-hi">Hi</button>
          <button class="om-quality-btn ${q==='lo'?'om-quality-btn--active-lo':''}" data-action="set-q-lo">Lo</button>
        </div>
      </div>
      <div class="om-pc-recache">
        <div class="om-pc-recache__label">Обновление (${needsReCache})</div>
        <button class="om-btn om-btn--accent om-pc-recache__btn ${needsReCache===0?'om-btn--disabled':''}" 
          data-action="recache" ${needsReCache===0?'disabled':''}>🔄 Re-cache</button>
      </div>
    </div>
    <div class="om-settings-grid">
      <div class="om-setting"><label class="om-setting__label">Слушать для ☁ (N)</label><input type="number" id="inp-n" value="${N}" min="1" class="om-setting__input"></div>
      <div class="om-setting"><label class="om-setting__label">Хранить ☁ дней (D)</label><input type="number" id="inp-d" value="${D}" min="1" class="om-setting__input"></div>
    </div>
    <button class="om-btn om-btn--primary" data-action="apply-cloud" style="width:100%; margin-bottom:14px">Применить настройки</button>
    <div class="om-divider"></div>
    <button class="om-btn om-btn--outline" data-action="show-list" id="btn-show-list" style="width:100%">Показать список 🔒/☁</button>
    <div id="pinned-cloud-list" class="om-track-list" style="display:none"></div>`;

  // 4. Modes (R0/R1)
  const htmlModes = `
    <div class="om-mode-card" style="margin-bottom:10px">
      <div class="om-mode-card__head">
        <div><div class="om-mode-card__name">PlaybackCache (R1)</div><div class="om-mode-card__desc">Предзагрузка соседних треков</div></div>
        <div class="om-mode-toggle">
          <button class="om-mode-btn ${mode==='R0'?'om-mode-btn--active':''}" data-action="set-mode-r0">OFF</button>
          <button class="om-mode-btn ${mode==='R1'?'om-mode-btn--active':''}" data-action="set-mode-r1">ON</button>
        </div>
      </div>
      <div class="om-mode-card__hint">${mode==='R1'?'✅ Активен — до 3 треков офлайн':'R0 — чистый стриминг'}</div>
    </div>
    <div class="om-mode-card om-mode-card--disabled"><div class="om-mode-card__head"><div><div class="om-mode-card__name">SmartPrefetch (R2)</div></div><div class="om-mode-toggle"><button class="om-mode-btn" disabled>OFF</button></div></div></div>`;

  // 5. Presets
  const presets = [['aggressive','🚀','Агрессивный'],['balanced','⚖️','Баланс'],['saver','🔋','Эконом']];
  const htmlPresets = `<div class="om-presets-list">
    ${presets.map(([k,i,n]) => `
      <button class="om-preset ${bp===k?'om-preset--active':''}" data-action="set-bg-preset" data-val="${k}">
        <span class="om-preset__icon">${i}</span>
        <div class="om-preset__text"><div class="om-preset__name">${n}</div></div>
        <span class="om-preset__check">${bp===k?'✓':''}</span>
      </button>`).join('')}
  </div>`;

  // 6. Downloads (with Pause/Resume toggle)
  const isPaused = container.querySelector('[data-action="dl-pause"]')?.dataset.paused === '1';
  const htmlDL = `
    <div class="om-dl-stats">
      <div class="om-dl-stat"><span class="om-dl-stat__num">${dl.active}</span><span class="om-dl-stat__label">Активных</span></div>
      <div class="om-dl-stat"><span class="om-dl-stat__num">${dl.queued}</span><span class="om-dl-stat__label">В очереди</span></div>
    </div>
    <button class="om-btn om-btn--ghost" data-action="dl-pause" data-paused="${isPaused ? '1' : '0'}">
      ${isPaused ? '▶ Возобновить' : '⏸ Пауза'}
    </button>`;

  // Combine
  container.innerHTML = 
    _tplSection('📦', 'Хранилище', htmlStorage) +
    _tplSection('🌐', 'Сетевая политика', htmlNet) +
    _tplSection('🔒', 'Pinned и Cloud', htmlPC) +
    _tplSection('⚙️', 'Режимы', htmlModes) +
    _tplSection('🌙', 'Пресеты', htmlPresets) +
    _tplSection('⬇️', 'Загрузки', htmlDL, true);
}

// --- Action Handlers ---

async function _handleAction(e) {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  
  const act = el.dataset.action;
  const om = getOfflineManager();
  const modal = e.currentTarget;

  switch(act) {
    case 'toggle-storage-details':
      const det = $q('#om-st-detail', modal);
      if(det) det.style.display = det.style.display === 'none' ? 'block' : 'none';
      break;

    case 'nuke':
      _confirm('Очистить ВЕСЬ кэш?', 'Удалит все данные приложения.', 'Очистить', async () => {
        await om.removeAllCached();
        if ('caches' in window) (await caches.keys()).forEach(k => caches.delete(k));
        window.NotificationSystem?.success('Кэш очищен');
        _renderBody($q('#om-body', _overlay));
      });
      break;

    case 'toggle-wifi': Net.toggleWifi(); _renderBody($q('#om-body', _overlay)); break;
    case 'toggle-cell': Net.toggleCellular(); _renderBody($q('#om-body', _overlay)); break;
    case 'toggle-toast': Net.toggleCellularToast(); _renderBody($q('#om-body', _overlay)); break;
    case 'toggle-kill': Net.toggleKillSwitch(); _renderBody($q('#om-body', _overlay)); break;
    case 'clear-traffic': Net.clearTrafficStats(); _renderBody($q('#om-body', _overlay)); break;

    case 'set-q-hi': case 'set-q-lo':
      const nq = act === 'set-q-hi' ? 'hi' : 'lo';
      if (om.getQuality() === nq) return;
      const count = await om.countNeedsReCache(nq);
      const doQ = () => {
        om.setCacheQualitySetting(nq);
        window.playerCore?.switchQuality?.(nq); // Trigger hot swap in player
        _renderBody($q('#om-body', _overlay));
      };
      if (count > 5) _confirm('Смена качества', `Перекэширование затронет ${count} треков.`, 'Перекачать', doQ);
      else doQ();
      break;

    case 'recache':
      om.queue?.setParallel?.(3);
      await om.reCacheAll(om.getQuality());
      window.NotificationSystem?.info('Перекэширование запущено');
      setTimeout(() => om.queue?.setParallel?.(1), 15000);
      _renderBody($q('#om-body', _overlay));
      break;

    case 'apply-cloud':
      const N = parseInt($q('#inp-n', modal).value) || 5;
      const D = parseInt($q('#inp-d', modal).value) || 31;
      await om.confirmApplyCloudSettings({ newN: N, newD: D });
      window.NotificationSystem?.success('Настройки применены');
      break;

    case 'show-list':
      await _toggleTrackList($q('#pinned-cloud-list', modal), el);
      break;
      
    case 'del-track':
      _confirm('Удалить?', 'Трек будет удален из кэша.', 'Удалить', async () => {
        await om.removeCached(el.dataset.uid);
        el.closest('.om-list-item').remove();
        _renderBody($q('#om-body', _overlay)); // Update stats
      });
      break;
      
    case 'del-all':
      _confirm('Удалить ВСЕ?', 'Удалить все закрепленные и облачные треки?', 'Да, удалить', async () => {
        await om.removeAllCached();
        $q('#pinned-cloud-list', modal).innerHTML = '<div class="om-list-empty">Пусто</div>';
        _renderBody($q('#om-body', _overlay));
      });
      break;

    case 'set-mode-r0': om.setMode('R0'); _renderBody($q('#om-body', _overlay)); break;
    case 'set-mode-r1':
      if (await om.hasSpace()) { om.setMode('R1'); _renderBody($q('#om-body', _overlay)); }
      else window.NotificationSystem?.warning('Недостаточно места (нужно 60 МБ)');
      break;

    case 'set-bg-preset':
      om.setBackgroundPreset?.(el.dataset.val);
      _renderBody($q('#om-body', _overlay));
      break;

    case 'dl-pause':
      if (el.dataset.paused === '1') {
        om.queue?.resume?.();
        el.dataset.paused = '0';
        el.textContent = '⏸ Пауза';
      } else {
        om.queue?.pause?.();
        el.dataset.paused = '1';
        el.textContent = '▶ Возобновить';
      }
      break;
  }
}

// --- List Logic ---

async function _toggleTrackList(listDiv, btn) {
  if (listDiv.style.display !== 'none') {
    listDiv.style.display = 'none';
    btn.textContent = 'Показать список 🔒/☁';
    return;
  }
  
  listDiv.style.display = 'block';
  listDiv.innerHTML = '<div class="om-list-loading">Загрузка...</div>';
  btn.textContent = 'Скрыть список';

  try {
    const { getAllTrackMetas } = await import('../offline/cache-db.js');
    const all = await getAllTrackMetas();
    const items = all.filter(m => m.type === 'pinned' || m.type === 'cloud')
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'pinned' ? -1 : 1;
        return (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0); // Cloud by expire desc
      });

    if (!items.length) {
      listDiv.innerHTML = '<div class="om-list-empty">Нет треков</div>';
      return;
    }

    const rows = items.map(m => {
      const title = window.TrackRegistry?.getTrackByUid(m.uid)?.title || m.uid;
      const icon = m.type === 'pinned' ? '🔒' : '☁';
      const badge = m.type === 'pinned' ? 'Закреплён' : `${Math.ceil((m.cloudExpiresAt - Date.now())/86400000)} дн.`;
      return `
        <div class="om-list-item">
          <span class="om-list-icon">${icon}</span>
          <div class="om-list-title">${esc(title)}</div>
          <div class="om-list-meta">${String(m.quality).toUpperCase()} · ${fmtB(m.size)} · ${badge}</div>
          <button class="om-list-del" data-action="del-track" data-uid="${esc(m.uid)}">✕</button>
        </div>`;
    }).join('');
    
    listDiv.innerHTML = rows + `<button class="om-btn om-btn--danger-outline" data-action="del-all" style="width:100%;margin-top:10px">Удалить ВСЕ</button>`;
  } catch {
    listDiv.innerHTML = '<div class="om-list-empty">Ошибка</div>';
  }
}

// --- Core UI Functions ---

function _confirm(title, text, okBtn, onOk) {
  const el = document.createElement('div');
  el.className = 'om-confirm-bg om-confirm-bg--visible';
  el.innerHTML = `
    <div class="om-confirm-box">
      <div class="om-confirm-title">${esc(title)}</div>
      <div class="om-confirm-body">${esc(text)}</div>
      <div class="om-confirm-btns">
        <button class="om-btn om-btn--ghost" id="cfm-cancel">Отмена</button>
        <button class="om-btn om-btn--primary" id="cfm-ok">${esc(okBtn)}</button>
      </div>
    </div>`;
  
  const close = () => { el.remove(); };
  el.querySelector('#cfm-cancel').onclick = close;
  el.querySelector('#cfm-ok').onclick = () => { close(); onOk(); };
  el.onclick = (e) => { if(e.target===el) close(); };
  document.body.appendChild(el);
}

export function openOfflineModal() {
  if (_overlay) return;
  _overlay = document.createElement('div');
  _overlay.className = 'om-overlay om-overlay--visible';
  _overlay.innerHTML = `
    <div class="om-modal om-modal--visible">
      <div class="om-header">
        <div class="om-header__title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> OFFLINE</div>
        <button class="om-header__close">×</button>
      </div>
      <div class="om-body" id="om-body"></div>
    </div>`;
  
  document.body.appendChild(_overlay);
  
  const modal = _overlay.querySelector('.om-modal');
  const close = () => { _overlay?.remove(); _overlay = null; };
  
  _overlay.onclick = (e) => { if (e.target === _overlay) close(); };
  modal.querySelector('.om-header__close').onclick = close;
  modal.addEventListener('click', _handleAction); // Delegation
  
  _renderBody($q('#om-body', _overlay));
}

export function closeOfflineModal() {
  if (_overlay) _overlay.remove();
  _overlay = null;
}

export function initOfflineModal() {
  const btn = document.getElementById('offline-btn');
  if (btn) btn.addEventListener('click', (e) => {
    if (e.target.classList.contains('offline-btn-alert')) {
      e.stopPropagation();
      window.NotificationSystem?.info('Есть треки для обновления', 6000);
    } else {
      openOfflineModal();
    }
  });
}

export default { initOfflineModal, openOfflineModal, closeOfflineModal };
