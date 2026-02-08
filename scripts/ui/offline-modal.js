// scripts/ui/offline-modal.js
/**
 * offline-modal.js — UI Модального окна "OFFLINE" v3.1
 * Исправлен путь импорта cache-db (Fix #404 error)
 */

import { getOfflineManager } from '../offline/offline-manager.js';
import { 
  getNetPolicyState, toggleWifi, toggleCellular, toggleKillSwitch, 
  getNetworkSpeed, getNetworkLabel, getTrafficStats 
} from '../offline/net-policy.js';
import { estimateUsage } from '../offline/cache-db.js'; // FIX: ../offline/

let _modal = null, _isOpen = false, _rafId = null;

// --- Initialization ---
export function initOfflineModal() {
  const btn = document.getElementById('offline-btn');
  if (btn) btn.onclick = (e) => { e.preventDefault(); openOfflineModal(); };
}

// --- Render Logic ---
export async function openOfflineModal() {
  if (_isOpen) return;
  _isOpen = true;

  if (!_modal) _create();
  
  document.body.appendChild(_modal);
  // Force reflow for animation
  void _modal.offsetWidth;
  _modal.classList.add('om-overlay--visible');
  _modal.querySelector('.om-modal').classList.add('om-modal--visible');
  
  document.body.style.overflow = 'hidden';
  _loop();
}

function close() {
  if (!_isOpen || !_modal) return;
  _isOpen = false;
  if (_rafId) cancelAnimationFrame(_rafId);

  const m = _modal.querySelector('.om-modal');
  _modal.classList.remove('om-overlay--visible');
  m.classList.remove('om-modal--visible');

  setTimeout(() => {
    if (!_isOpen) _modal?.remove();
    document.body.style.overflow = '';
  }, 250);
}

function _create() {
  _modal = document.createElement('div');
  _modal.className = 'om-overlay';
  _modal.innerHTML = `
    <div class="om-modal">
      <div class="om-header">
        <div class="om-header__title"><span>📡 OFFLINE MANAGER</span></div>
        <button class="om-header__close">×</button>
      </div>
      <div class="om-body">
        <div class="om-section">
          <div class="om-section__title">💾 Хранилище</div>
          <div class="om-storage-info">
            <div class="om-storage-segbar" id="om-bar">
              <div class="om-segbar__fill om-segbar--pinned" style="width:0%"></div>
              <div class="om-segbar__fill om-segbar--cloud" style="width:0%"></div>
              <div class="om-segbar__fill om-segbar--transient" style="width:0%"></div>
              <div class="om-segbar__fill om-segbar--other" style="width:0%"></div>
            </div>
            <div class="om-storage-legend">
              <span class="om-legend-item"><span class="om-legend-dot om-legend-dot--pinned"></span>Закреплено</span>
              <span class="om-legend-item"><span class="om-legend-dot om-legend-dot--cloud"></span>Облако</span>
              <span class="om-legend-item"><span class="om-legend-dot om-legend-dot--transient"></span>Кэш</span>
              <span class="om-legend-item"><span class="om-legend-dot om-legend-dot--other"></span>Другое</span>
            </div>
            <div class="om-divider"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#9db7dd">
               <span id="om-storage-text">...</span>
               <button class="om-btn om-btn--danger-outline" id="om-clean" style="padding:4px 10px;font-size:11px">Очистить всё</button>
            </div>
          </div>
        </div>
        <div class="om-section">
          <div class="om-section__title">🌐 Сеть и Экономия</div>
          <div class="om-mode-card">
            <div class="om-net-status" id="om-net-st">...</div>
            <div class="om-toggles-row">
              <button class="om-toggle" id="om-wifi"><span class="om-toggle__dot"></span><span class="om-toggle__label">Wi-Fi</span></button>
              <button class="om-toggle" id="om-cell"><span class="om-toggle__dot"></span><span class="om-toggle__label">Cellular</span></button>
            </div>
            <button class="om-toggle-small" id="om-kill">Kill Switch</button>
            <div class="om-traffic"><div class="om-traffic__title">Трафик (<span id="om-traf-m"></span>)</div><div id="om-traf-val"></div></div>
          </div>
        </div>
        <div class="om-section om-section--last">
          <div class="om-section__title">⬇️ Загрузки</div>
          <div class="om-dl-stats">
             <div class="om-dl-stat"><span class="om-dl-stat__num" id="om-dl-act">0</span><span class="om-dl-stat__label">Активно</span></div>
             <div class="om-dl-stat"><span class="om-dl-stat__num" id="om-dl-q">0</span><span class="om-dl-stat__label">В очереди</span></div>
          </div>
          <div class="om-pc-toprow">
             <div class="om-pc-quality">
               <div class="om-pc-quality__label">Качество кэша</div>
               <div class="om-quality-toggle">
                 <button class="om-quality-btn" data-q="hi">Hi</button>
                 <button class="om-quality-btn" data-q="lo">Lo</button>
               </div>
             </div>
             <div class="om-pc-recache">
                <div class="om-pc-recache__label" id="om-rc-lbl">Актуально</div>
                <button class="om-btn om-btn--accent om-pc-recache__btn" id="om-rc-btn" disabled>Обновить</button>
             </div>
          </div>
        </div>
      </div>
    </div>`;

  // Bindings
  const Q = (s) => _modal.querySelector(s);
  _modal.onclick = (e) => e.target === _modal && close();
  Q('.om-header__close').onclick = close;
  
  Q('#om-clean').onclick = async () => {
    if (confirm('Удалить ВСЕ загруженные треки?')) { await getOfflineManager().removeAllCached(); _updStor(); }
  };

  Q('#om-wifi').onclick = () => { toggleWifi(); _updNet(); };
  Q('#om-cell').onclick = () => { toggleCellular(); _updNet(); };
  Q('#om-kill').onclick = () => { toggleKillSwitch(); _updNet(); };

  _modal.querySelectorAll('.om-quality-btn').forEach(b => b.onclick = () => {
    const q = b.dataset.q;
    getOfflineManager().setCacheQualitySetting(q);
    window.playerCore?.switchQuality?.(q);
    _updQual();
  });

  Q('#om-rc-btn').onclick = async () => {
    Q('#om-rc-btn').disabled = true;
    Q('#om-rc-btn').textContent = 'В очереди...';
    await getOfflineManager().reCacheAll();
  };
}

function _loop() {
  if (!_isOpen) return;
  _updNet();
  _updDL();
  if (!_modal._storDone) { _updStor(); _updQual(); _modal._storDone = true; } // Lazy update heavy ops
  _rafId = requestAnimationFrame(_loop);
}

// --- Updaters ---

function _updNet() {
  const s = getNetPolicyState();
  const setT = (id, on) => _modal.querySelector(id).className = `om-toggle ${on?'om-toggle--on':'om-toggle--off'}`;
  setT('#om-wifi', s.wifiEnabled);
  setT('#om-cell', s.cellularEnabled);
  
  const kBtn = _modal.querySelector('#om-kill');
  kBtn.className = `om-toggle-small ${s.killSwitch?'om-toggle-small--on':''}`;
  kBtn.textContent = s.killSwitch ? '✈️ Режим "В самолёте" ВКЛЮЧЕН' : 'Режим "В самолёте" (Kill Switch)';

  const stEl = _modal.querySelector('#om-net-st');
  if (s.airplaneMode || s.killSwitch) { stEl.textContent = '⛔ Сеть полностью заблокирована'; stEl.style.color = '#ef5350'; }
  else {
    const sp = getNetworkSpeed();
    stEl.textContent = `Текущая сеть: ${getNetworkLabel()}${sp ? ` (~${sp} Mbps)` : ''}`;
    stEl.style.color = '#9db7dd';
  }

  const tr = getTrafficStats();
  _modal.querySelector('#om-traf-m').textContent = tr.monthName;
  const f = window.Utils?.fmt?.bytes || (b=>b+'B');
  _modal.querySelector('#om-traf-val').innerHTML = (tr.type === 'split') 
    ? `<div class="om-traffic__row"><span>Wi-Fi</span><span>${f(tr.wifi.monthly)}</span></div><div class="om-traffic__row"><span>Cellular</span><span>${f(tr.cellular.monthly)}</span></div>`
    : `<div class="om-traffic__row"><span>Всего</span><span>${f(tr.general.monthly)}</span></div>`;
}

function _updDL() {
  const s = getOfflineManager().getDownloadStatus();
  _modal.querySelector('#om-dl-act').textContent = s.active;
  _modal.querySelector('#om-dl-q').textContent = s.queued;
}

async function _updStor() {
  const est = await estimateUsage();
  const bd = await getOfflineManager().getStorageBreakdown();
  const trackT = bd.pinned + bd.cloud + bd.transient;
  const used = est.used || trackT;
  const other = Math.max(0, used - trackT);
  const p = (v) => (used > 0 ? (v/used)*100 : 0) + '%';
  
  const bar = _modal.querySelector('#om-bar').children;
  bar[0].style.width = p(bd.pinned);
  bar[1].style.width = p(bd.cloud);
  bar[2].style.width = p(bd.transient);
  bar[3].style.width = p(other);

  const f = window.Utils?.fmt?.bytes || (b=>b+'B');
  _modal.querySelector('#om-storage-text').textContent = `Занято: ${f(used)} / Своб.: ${f(est.free)}`;
}

async function _updQual() {
  const mgr = getOfflineManager();
  const q = mgr.getQuality();
  _modal.querySelectorAll('.om-quality-btn').forEach(b => {
    b.className = 'om-quality-btn' + (b.dataset.q === q ? (q==='hi'?' om-quality-btn--active-hi':' om-quality-btn--active-lo') : '');
  });

  const diff = await mgr.countNeedsReCache(q);
  const lbl = _modal.querySelector('#om-rc-lbl');
  const btn = _modal.querySelector('#om-rc-btn');
  
  if (diff > 0) {
    lbl.textContent = `Обновить: ${diff} шт.`; lbl.style.color = '#ffd54f';
    btn.disabled = false; btn.textContent = 'Обновить'; btn.classList.remove('om-btn--disabled');
  } else {
    lbl.textContent = 'Актуально'; lbl.style.color = 'rgba(255,255,255,0.45)';
    btn.disabled = true; btn.textContent = 'Нет обновлений'; btn.classList.add('om-btn--disabled');
  }
}
