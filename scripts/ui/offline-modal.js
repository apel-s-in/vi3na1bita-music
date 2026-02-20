/**
 * scripts/ui/offline-modal.js
 * Offline Modal UI — Full Spec Compliance (v1.0 + R2).
 * ОПТИМИЗИРОВАНО: Решена проблема N+1 запросов к IndexedDB. 
 * Единый State Fetching, точечное управление DOM без лишних перерисовок.
 */

import { getOfflineManager } from '../offline/offline-manager.js';
import * as Net from '../offline/net-policy.js';
import { estimateUsage, getAllTrackMetas } from '../offline/cache-db.js';

let _overlay = null, _dlPaused = false, _listExpanded = false, _stExpanded = false;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => window.Utils?.escapeHtml?.(String(s ?? '')) ?? String(s ?? '');
const fMB = (b) => ((b || 0) / 1048576 < 0.1 && b > 0) ? '< 0.1 МБ' : `${((b || 0) / 1048576).toFixed(1)} МБ`;
const fB = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : (b >= 1024 ? `${(b / 1024).toFixed(0)} КБ` : `${b} Б`);

const confirmBox = (opts) => window.Modals?.confirm 
  ? window.Modals.confirm(opts) 
  : (confirm(`${opts.title}\n\n${String(opts.textHtml || '').replace(/<[^>]+>/g, '')}`) ? opts.onConfirm?.() : opts.onCancel?.());

const tplSect = (ic, tit, html, lst = false) => `<section class="om-section ${lst ? 'om-section--last' : ''}"><h3 class="om-section__title"><span class="om-section__icon">${ic}</span> ${tit}</h3>${html}</section>`;
const tplTog = (act, on, lbl, sm = false) => `<button class="${sm ? 'om-toggle-small' : 'om-toggle'} ${on ? (sm ? 'om-toggle-small--on' : 'om-toggle--on') : (sm ? '' : 'om-toggle--off')}" data-action="${act}">${sm ? '' : '<span class="om-toggle__dot"></span>'}<span class="${sm ? '' : 'om-toggle__label'}">${lbl}</span></button>`;

const refresh = async () => {
  if (!_overlay) return;
  const body = $('#om-body', _overlay);
  if (!body) return;
  const scroll = body.scrollTop;

  const om = getOfflineManager();
  // Batch Fetching: ОДИН запрос к тяжелым подсистемам на весь рендер
  const [metas, est, dl] = await Promise.all([getAllTrackMetas(), estimateUsage(), om.getDownloadStatus?.() || { active: 0, queued: 0 }]);
  
  const isR2 = om.getMode() === 'R2';
  const q = isR2 ? om.getCQ() : om.getQuality();
  const { N, D } = om.getCloudSettings();
  
  const bd = { pinned: 0, cloud: 0, transient: 0, dynamic: 0, other: 0 };
  const pcList = [];
  let mismatch = 0;

  metas.forEach(m => {
    const t = m.type, k = ['pinned','cloud','playbackCache','dynamic'].includes(t) ? (t === 'playbackCache' ? 'transient' : t) : 'other';
    bd[k] += (m.size || 0);
    if (['pinned', 'cloud', 'dynamic'].includes(t)) {
      if ((String(m.quality || '').toLowerCase() === 'lo' ? 'lo' : 'hi') !== q) mismatch++;
      if (t === 'pinned' || t === 'cloud') pcList.push(m);
    }
  });

  const tot = Object.values(bd).reduce((a, v) => a + v, 0);
  const pct = v => tot > 0 ? Math.max(0.5, (v / tot) * 100) : 0;
  
  const ns = Net.getNetPolicyState(), pl = Net.getPlatform(), ts = Net.getTrafficStats();
  const trRow = (l, v) => `<div class="om-traffic__row"><span>${l}</span><span>${fMB(v)}</span></div>`;

  pcList.sort((a, b) => a.type !== b.type ? (a.type === 'pinned' ? -1 : 1) : (a.type === 'pinned' ? (a.pinnedAt || 0) - (b.pinnedAt || 0) : (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0)));

  const sStorage = `
    <div class="om-storage-info">
      <div class="om-storage-row"><span class="om-storage-label">Занято</span><span class="om-storage-value">${fMB(est.used)} / ${fMB(est.quota)}</span></div>
      <div class="om-storage-segbar" data-action="toggle-storage-details">
        <div class="om-segbar__fill om-segbar--pinned" style="width:${pct(bd.pinned)}%"></div><div class="om-segbar__fill om-segbar--cloud" style="width:${pct(bd.cloud)}%"></div>
        <div class="om-segbar__fill om-segbar--transient" style="width:${pct(bd.transient)}%"></div><div class="om-segbar__fill" style="background:#9c27b0; width:${pct(bd.dynamic)}%"></div>
        <div class="om-segbar__fill om-segbar--other" style="width:${pct(bd.other)}%"></div>
      </div>
      <div class="om-storage-legend">
        ${bd.pinned ? `<span class="om-legend-item"><span class="om-legend-dot om-legend-dot--pinned"></span>🔒 ${fB(bd.pinned)}</span>` : ''}
        ${bd.cloud ? `<span class="om-legend-item"><span class="om-legend-dot om-legend-dot--cloud"></span>☁ ${fB(bd.cloud)}</span>` : ''}
        ${bd.dynamic ? `<span class="om-legend-item"><span class="om-legend-dot" style="background:#9c27b0"></span>🧠 ${fB(bd.dynamic)}</span>` : ''}
        ${bd.transient ? `<span class="om-legend-item"><span class="om-legend-dot om-legend-dot--transient"></span>⏳ ${fB(bd.transient)}</span>` : ''}
      </div>
      <div id="om-st-detail" style="display:${_stExpanded ? 'block' : 'none'}; margin-top:12px"><button class="om-btn om-btn--danger" data-action="nuke" style="width:100%">Очистить кэш (🔒 и ☁)</button></div>
    </div>`;

  const sNet = (pl.supportsNetControl ? 
    `<div class="om-toggles-row">${tplTog('toggle-wifi', ns.wifiEnabled, 'Ethernet / Wi-Fi')}${tplTog('toggle-cell', ns.cellularEnabled, 'Cellular')}</div>
     ${tplTog('toggle-toast', ns.cellularToast, '🔔 Уведомления при Cellular: ' + (ns.cellularToast ? 'ВКЛ' : 'ВЫКЛ'), true)}` :
    `<div class="om-net-unsupported">Управление сетью ограничено ОС</div>
     <button class="om-toggle ${ns.killSwitch ? 'om-toggle--on' : 'om-toggle--neutral'}" data-action="toggle-kill" style="margin-top:8px"><span class="om-toggle__dot"></span><span class="om-toggle__label">Отключить весь интернет</span></button>
     ${ns.killSwitch ? '<div class="om-net-kill-hint">⚠️ Все запросы заблокированы (Offline).</div>' : ''}`) +
    `<div class="om-traffic" style="margin-top:12px"><div class="om-traffic__title">Трафик (${esc(ts?.monthName)})</div>
     ${ts?.type === 'split' ? `<div class="om-traffic__group"><div class="om-traffic__subtitle">Wi-Fi</div>${trRow('Месяц:', ts.wifi.monthly)}${trRow('Всего:', ts.wifi.total)}</div><div class="om-traffic__group"><div class="om-traffic__subtitle">Cellular</div>${trRow('Месяц:', ts.cellular.monthly)}${trRow('Всего:', ts.cellular.total)}</div>` : `${trRow('Месяц:', ts.general.monthly)}${trRow('Всего:', ts.general.total)}`}
     <button class="om-btn om-btn--ghost" data-action="clear-traffic" style="margin-top:8px; width:100%;">Очистить статистику</button></div>`;

  const sList = !pcList.length ? `<div class="om-list-empty">Нет сохранённых треков</div>` : pcList.map(m => {
    const isPin = m.type === 'pinned', tr = window.TrackRegistry?.getTrackByUid?.(m.uid);
    const sub = isPin ? `🔒 Закреплён • ${m.quality === 'lo' ? 'Lo' : 'Hi'} • ${fMB(m.size)}` : `☁ Осталось ${Math.max(0, Math.ceil(((m.cloudExpiresAt || 0) - Date.now()) / 86400000))} дн. • ${m.quality === 'lo' ? 'Lo' : 'Hi'} • ${fMB(m.size)}`;
    return `<div class="om-list-item"><div class="om-list-icon">${isPin ? '🔒' : '☁'}</div><div class="om-list-title" title="${esc(tr?.title || m.uid)}">${esc(tr?.title || m.uid)}<div class="om-list-meta">${sub}</div></div><button class="om-btn om-btn--ghost" data-action="list-item-act" data-uid="${m.uid}" style="padding:4px 8px; font-size:11px;">${isPin ? 'Снять' : '🔒'}</button><button class="om-list-del" data-action="list-item-del" data-uid="${m.uid}" title="Удалить">×</button></div>`;
  }).join('');

  const sPC = `
    <div class="om-pc-toprow">
      <div class="om-pc-quality"><div class="om-pc-quality__label">${isR2 ? 'CQ (SmartPrefetch)' : 'PQ (R0/R1)'}</div><div class="om-quality-toggle"><button class="om-quality-btn ${q === 'hi' ? 'om-quality-btn--active-hi' : ''}" data-action="${isR2 ? 'set-cq' : 'set-q'}" data-val="hi">Hi</button><button class="om-quality-btn ${q === 'lo' ? 'om-quality-btn--active-lo' : ''}" data-action="${isR2 ? 'set-cq' : 'set-q'}" data-val="lo">Lo</button></div></div>
      <div class="om-pc-recache"><div class="om-pc-recache__label">Несовп. качество: ${mismatch}</div><button class="om-btn om-btn--accent om-pc-recache__btn ${mismatch === 0 ? 'om-btn--disabled' : ''}" data-action="recache" ${mismatch === 0 ? 'disabled' : ''}>🔄 Re-cache</button></div>
    </div>
    <div class="om-settings-grid">
      <div class="om-setting"><label class="om-setting__label">Слушать для ☁ (N)</label><input type="number" id="inp-n" value="${N}" min="1" class="om-setting__input"></div>
      <div class="om-setting"><label class="om-setting__label">Хранить ☁ дней (D)</label><input type="number" id="inp-d" value="${D}" min="1" class="om-setting__input"></div>
    </div>
    <button class="om-btn om-btn--primary" data-action="apply-cloud" style="width:100%; margin-bottom:14px">Применить настройки</button>
    <div class="om-divider"></div>
    <button class="om-btn om-btn--outline" data-action="toggle-list" style="width:100%">${_listExpanded ? 'Скрыть список 🔒/☁' : 'Показать список 🔒/☁'}</button>
    <div id="om-track-list-container" style="display:${_listExpanded ? 'block' : 'none'}; padding-top: 10px;"><div class="om-track-list" id="om-track-list">${sList}</div><button class="om-btn om-btn--danger-outline om-list-del-all" data-action="nuke" style="width:100%; margin-top:10px;">Удалить все закреплённые и облачные</button></div>`;

  const sModes = `
    <div class="om-mode-card ${isR2 ? 'om-mode-card--disabled' : ''}" style="margin-bottom:10px"><div class="om-mode-card__head"><div><div class="om-mode-card__name">PlaybackCache (R1)</div><div class="om-mode-card__desc">Окно предзагрузки из 3 треков</div></div><div class="om-mode-toggle"><button class="om-mode-btn ${om.getMode() === 'R0' ? 'om-mode-btn--active' : ''}" data-action="set-mode" data-val="R0" ${isR2 ? 'disabled' : ''}>OFF</button><button class="om-mode-btn ${om.getMode() === 'R1' ? 'om-mode-btn--active' : ''}" data-action="set-mode" data-val="R1" ${isR2 ? 'disabled' : ''}>ON</button></div></div></div>
    <div class="om-mode-card"><div class="om-mode-card__head"><div><div class="om-mode-card__name">SmartPrefetch (R2)</div><div class="om-mode-card__desc">Умное фоновое хранилище (MRU)</div></div><div class="om-mode-toggle"><button class="om-mode-btn ${!isR2 ? 'om-mode-btn--active' : ''}" data-action="set-mode" data-val="not-R2">OFF</button><button class="om-mode-btn ${isR2 ? 'om-mode-btn--active' : ''}" data-action="set-mode" data-val="R2">ON</button></div></div></div>`;

  const sDl = `<div class="om-dl-stats"><div class="om-dl-stat"><span class="om-dl-stat__num">${dl.active}</span><span class="om-dl-stat__label">Активных</span></div><div class="om-dl-stat"><span class="om-dl-stat__num">${dl.queued}</span><span class="om-dl-stat__label">В очереди</span></div></div><button class="om-btn om-btn--ghost" data-action="dl-toggle" style="width:100%;">${_dlPaused ? '▶ Возобновить' : '⏸ Пауза'}</button>`;

  body.innerHTML = tplSect('📦', 'Хранилище', sStorage) + tplSect('🌐', 'Сетевая политика', sNet) + tplSect('🔒', 'Pinned и Cloud', sPC) + tplSect('⚙️', 'Режимы', sModes) + tplSect('⬇️', 'Загрузки', sDl, true);
  body.scrollTop = scroll;
};

async function handleAction(e) {
  const el = e.target.closest?.('[data-action]');
  if (!el || el.disabled) return;
  const act = el.dataset.action;
  const om = getOfflineManager();

  const handleQ = async (nq, isR2) => {
    if ((isR2 ? om.getCQ() : om.getQuality()) === nq) return;
    let count = 0, bytes = 0;
    (await getAllTrackMetas()).forEach(m => {
      if (['pinned', 'cloud', 'dynamic'].includes(m.type) && (String(m.quality || '').toLowerCase() === 'lo' ? 'lo' : 'hi') !== nq) { count++; bytes += (m.size || 0); }
    });
    const apply = () => { isR2 ? om.setCQ(nq) : window.playerCore?.switchQuality?.(nq); refresh(); };
    if (count > 5) confirmBox({ title: 'Смена качества', textHtml: `Смена затронет ${count} файлов (${fMB(bytes)}). Перекачать?`, confirmText: 'Перекачать', onConfirm: apply });
    else apply();
  };

  switch (act) {
    case 'toggle-storage-details':
      _stExpanded = !_stExpanded;
      const st = $('#om-st-detail', _overlay);
      if (st) st.style.display = _stExpanded ? 'block' : 'none';
      break;
    case 'toggle-list':
      _listExpanded = !_listExpanded;
      el.textContent = _listExpanded ? 'Скрыть список 🔒/☁' : 'Показать список 🔒/☁';
      const c = $('#om-track-list-container', _overlay);
      if (c) c.style.display = _listExpanded ? 'block' : 'none';
      break;
    case 'nuke':
      confirmBox({ title: 'Удалить все офлайн-треки?', textHtml: 'Статистика облачков будет сброшена.<br>Global-статистика останется.', confirmText: 'Далее', onConfirm: () => setTimeout(() => confirmBox({ title: 'Вы уверены?', textHtml: 'Это действие нельзя отменить.', confirmText: 'Удалить всё', onConfirm: async () => { await om.removeAllCached(); refresh(); } }), 100) });
      break;
    case 'toggle-wifi': Net.toggleWifi(); refresh(); break;
    case 'toggle-cell': Net.toggleCellular(); refresh(); break;
    case 'toggle-toast': Net.toggleCellularToast(); refresh(); break;
    case 'toggle-kill': Net.toggleKillSwitch(); refresh(); break;
    case 'clear-traffic': Net.clearTrafficStats(); refresh(); break;
    case 'set-q': await handleQ(el.dataset.val, false); break;
    case 'set-cq': await handleQ(el.dataset.val, true); break;
    case 'recache':
      if (om.queue) om.queue.setParallel(3);
      await om.reCacheAll(om.getMode() === 'R2' ? om.getCQ() : om.getQuality());
      setTimeout(() => om.queue?.setParallel?.(1), 15000);
      refresh(); break;
    case 'apply-cloud':
      await om.confirmApplyCloudSettings({ newN: Math.max(1, parseInt($('#inp-n', _overlay)?.value || '5')), newD: Math.max(1, parseInt($('#inp-d', _overlay)?.value || '31')) });
      refresh(); window.NotificationSystem?.success?.('Настройки применены'); break;
    case 'list-item-act': await om.togglePinned(el.dataset.uid); refresh(); break;
    case 'list-item-del': confirmBox({ title: 'Удалить трек?', textHtml: 'Статистика облачка будет сброшена.', confirmText: 'Удалить', onConfirm: async () => { await om.removeCached(el.dataset.uid); refresh(); } }); break;
    case 'set-mode':
      const v = el.dataset.val;
      if (v === 'R2' || v === 'R1') { if (await om.hasSpace()) om.setMode(v); else window.NotificationSystem?.warning?.('Нет места'); }
      else if (v === 'not-R2') om.setMode('R0');
      else om.setMode(v);
      refresh(); break;
    case 'dl-toggle':
      _dlPaused = !_dlPaused;
      if (om.queue) _dlPaused ? om.queue.pause() : om.queue.resume();
      refresh(); break;
  }
}

export function openOfflineModal() {
  if (_overlay) return;
  _overlay = document.createElement('div');
  _overlay.className = 'om-overlay om-overlay--visible';
  _overlay.innerHTML = `
    <div class="om-modal om-modal--visible">
      <div class="om-header"><div class="om-header__title">OFFLINE</div><button class="om-header__close" aria-label="Закрыть">×</button></div>
      <div class="om-body" id="om-body"></div>
    </div>`;
  document.body.appendChild(_overlay);
  
  _overlay.addEventListener('click', e => e.target === _overlay && closeOfflineModal());
  $('.om-header__close', _overlay)?.addEventListener('click', closeOfflineModal);
  $('.om-modal', _overlay).addEventListener('click', e => handleAction(e).catch(console.error));
  
  refresh();
}

export function closeOfflineModal() { try { _overlay?.remove(); } catch {} _overlay = null; }

export function initOfflineModal() {
  document.getElementById('offline-btn')?.addEventListener('click', e => e.target?.classList?.contains('offline-btn-alert') ? window.NotificationSystem?.show?.('Есть треки для обновления', 'info', 6000) : openOfflineModal());
  const r = () => _overlay && refresh();
  ['offline:uiChanged', 'netPolicy:changed', 'offline:stateChanged'].forEach(ev => window.addEventListener(ev, r));
}

export default { initOfflineModal, openOfflineModal, closeOfflineModal };
