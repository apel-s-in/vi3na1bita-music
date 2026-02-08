import { getOfflineManager } from '../offline/offline-manager.js';
import { 
  getNetPolicyState, toggleWifi, toggleCellular, toggleKillSwitch, 
  getNetworkSpeed, getNetworkLabel, getTrafficStats 
} from '../offline/net-policy.js';
// FIX: Исправлен путь к cache-db (был ./cache-db.js, стал ../offline/cache-db.js)
import { estimateUsage } from '../offline/cache-db.js';

let _modal = null;
let _isOpen = false;
let _rafId = null;

// --- Initialization ---

export function initOfflineModal() {
  const btn = document.getElementById('offline-btn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openOfflineModal();
    });
  }
}

// --- Render Logic ---

export async function openOfflineModal() {
  if (_isOpen) return;
  _isOpen = true;

  if (!_modal) _createModalStructure();

  document.body.appendChild(_modal);
  // Force reflow
  void _modal.offsetWidth;
  
  _modal.classList.add('om-overlay--visible');
  _modal.querySelector('.om-modal').classList.add('om-modal--visible');
  document.body.style.overflow = 'hidden';

  _updateLoop();
}

function closeOfflineModal() {
  if (!_isOpen || !_modal) return;
  _isOpen = false;
  if (_rafId) cancelAnimationFrame(_rafId);

  const m = _modal.querySelector('.om-modal');
  _modal.classList.remove('om-overlay--visible');
  m.classList.remove('om-modal--visible');

  setTimeout(() => {
    if (!_isOpen && _modal && _modal.parentNode) {
      _modal.parentNode.removeChild(_modal);
    }
    document.body.style.overflow = '';
  }, 250);
}

function _createModalStructure() {
  _modal = document.createElement('div');
  _modal.className = 'om-overlay';
  
  // Строгая структура под стили main.css (om-*)
  _modal.innerHTML = `
    <div class="om-modal">
      <div class="om-header">
        <div class="om-header__title">
          <span class="om-header__icon">📡</span> OFFLINE MANAGER
        </div>
        <button class="om-header__close">×</button>
      </div>
      
      <div class="om-body">
        <!-- Section: Storage -->
        <div class="om-section">
          <div class="om-section__title">ХРАНИЛИЩЕ</div>
          <div class="om-storage-info">
            <div class="om-storage-segbar" id="om-storage-bar">
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
               <span id="om-storage-text">Вычисление...</span>
               <button class="om-btn om-btn--danger-outline" id="om-clean-btn" style="padding:4px 10px;font-size:11px">Очистить всё</button>
            </div>
          </div>
        </div>

        <!-- Section: Network -->
        <div class="om-section">
          <div class="om-section__title">СЕТЬ</div>
          <div class="om-mode-card">
            <div class="om-net-status" id="om-net-status">...</div>
            <div class="om-toggles-row">
              <button class="om-toggle" id="om-wifi-toggle">
                <span class="om-toggle__dot"></span>
                <span class="om-toggle__label">Wi-Fi</span>
              </button>
              <button class="om-toggle" id="om-cell-toggle">
                <span class="om-toggle__dot"></span>
                <span class="om-toggle__label">Cellular</span>
              </button>
            </div>
            <button class="om-toggle-small" id="om-kill-toggle">Kill Switch</button>
            
            <div class="om-traffic">
              <div class="om-traffic__title">Трафик (<span id="om-traffic-month">...</span>)</div>
              <div id="om-traffic-stats">...</div>
            </div>
          </div>
        </div>

        <!-- Section: Downloads & Quality -->
        <div class="om-section om-section--last">
          <div class="om-section__title">ЗАГРУЗКИ</div>
          <div class="om-dl-stats">
             <div class="om-dl-stat">
               <span class="om-dl-stat__num" id="om-dl-active">0</span>
               <span class="om-dl-stat__label">Активно</span>
             </div>
             <div class="om-dl-stat">
               <span class="om-dl-stat__num" id="om-dl-queued">0</span>
               <span class="om-dl-stat__label">В очереди</span>
             </div>
          </div>
          
          <div class="om-pc-toprow">
             <div class="om-pc-quality">
               <div class="om-pc-quality__label">Качество</div>
               <div class="om-quality-toggle">
                 <button class="om-quality-btn" data-q="hi">Hi</button>
                 <button class="om-quality-btn" data-q="lo">Lo</button>
               </div>
             </div>
             <div class="om-pc-recache">
                <div class="om-pc-recache__label" id="om-recache-label">Актуально</div>
                <button class="om-btn om-btn--accent om-pc-recache__btn" id="om-recache-btn" disabled>Обновить</button>
             </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // --- Bindings ---
  const q = (s) => _modal.querySelector(s);

  _modal.addEventListener('click', (e) => {
    if (e.target === _modal) closeOfflineModal();
  });
  q('.om-header__close').addEventListener('click', closeOfflineModal);

  // Clean
  q('#om-clean-btn').addEventListener('click', async () => {
    if (confirm('Удалить ВСЕ загруженные треки?')) {
      await getOfflineManager().removeAllCached();
      _renderStorage();
    }
  });

  // Network
  q('#om-wifi-toggle').addEventListener('click', () => { toggleWifi(); _renderNet(); });
  q('#om-cell-toggle').addEventListener('click', () => { toggleCellular(); _renderNet(); });
  q('#om-kill-toggle').addEventListener('click', () => { toggleKillSwitch(); _renderNet(); });

  // Quality
  _modal.querySelectorAll('.om-quality-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qVal = btn.dataset.q;
      getOfflineManager().setCacheQualitySetting(qVal);
      if (window.playerCore?.switchQuality) window.playerCore.switchQuality(qVal);
      _renderQuality();
    });
  });

  // Recache
  q('#om-recache-btn').addEventListener('click', async () => {
    const btn = q('#om-recache-btn');
    btn.disabled = true;
    btn.textContent = 'В очереди...';
    await getOfflineManager().reCacheAll();
  });
}

function _updateLoop() {
  if (!_isOpen) return;
  
  _renderNet();
  _renderDownloads();
  
  // Storage и Quality рендерим лениво или при изменении, но для простоты здесь в цикле
  // (можно оптимизировать флагами, но это не критично для модалки)
  if (!_modal._storageRendered) {
    _renderStorage();
    _renderQuality();
    _modal._storageRendered = true;
  }

  _rafId = requestAnimationFrame(_updateLoop);
}

// --- Renderers ---

function _renderNet() {
  const s = getNetPolicyState();
  const wifiBtn = _modal.querySelector('#om-wifi-toggle');
  const cellBtn = _modal.querySelector('#om-cell-toggle');
  const killBtn = _modal.querySelector('#om-kill-toggle');
  const statusEl = _modal.querySelector('#om-net-status');

  const setToggle = (el, on) => {
    el.className = `om-toggle ${on ? 'om-toggle--on' : 'om-toggle--off'}`;
  };

  setToggle(wifiBtn, s.wifiEnabled);
  setToggle(cellBtn, s.cellularEnabled);
  
  killBtn.className = `om-toggle-small ${s.killSwitch ? 'om-toggle-small--on' : ''}`;
  killBtn.textContent = s.killSwitch ? '✈️ Режим "В самолёте" ВКЛЮЧЕН' : 'Режим "В самолёте" (Kill Switch)';

  if (s.airplaneMode || s.killSwitch) {
    statusEl.textContent = '⛔ Сеть полностью заблокирована';
    statusEl.style.color = '#ef5350';
  } else {
    const sp = getNetworkSpeed();
    statusEl.textContent = `Текущая сеть: ${getNetworkLabel()}${sp ? ` (~${sp} Mbps)` : ''}`;
    statusEl.style.color = '#9db7dd';
  }

  // Traffic
  const traf = getTrafficStats();
  _modal.querySelector('#om-traffic-month').textContent = traf.monthName;
  const tEl = _modal.querySelector('#om-traffic-stats');
  
  const fmt = window.Utils?.fmt?.bytes || ((b)=>b+'B');
  
  if (traf.type === 'split') {
    tEl.innerHTML = `
      <div class="om-traffic__row"><span>Wi-Fi</span><span>${fmt(traf.wifi.monthly)}</span></div>
      <div class="om-traffic__row"><span>Cellular</span><span>${fmt(traf.cellular.monthly)}</span></div>
    `;
  } else {
    tEl.innerHTML = `
      <div class="om-traffic__row"><span>Всего</span><span>${fmt(traf.general.monthly)}</span></div>
    `;
  }
}

function _renderDownloads() {
  const st = getOfflineManager().getDownloadStatus();
  _modal.querySelector('#om-dl-active').textContent = st.active;
  _modal.querySelector('#om-dl-queued').textContent = st.queued;
}

async function _renderStorage() {
  const est = await estimateUsage();
  const mgr = getOfflineManager();
  const breakdown = await mgr.getStorageBreakdown(); // { pinned, cloud, transient, other }
  
  const trackedTotal = breakdown.pinned + breakdown.cloud + breakdown.transient;
  const realUsed = est.used || trackedTotal; 
  const other = Math.max(0, realUsed - trackedTotal);

  const bar = _modal.querySelector('#om-storage-bar');
  const p = (v) => (realUsed > 0 ? (v / realUsed) * 100 : 0) + '%';
  
  bar.children[0].style.width = p(breakdown.pinned);
  bar.children[1].style.width = p(breakdown.cloud);
  bar.children[2].style.width = p(breakdown.transient);
  bar.children[3].style.width = p(other);

  const fmt = window.Utils?.fmt?.bytes || ((b)=>b+'B');
  _modal.querySelector('#om-storage-text').textContent = 
    `Занято: ${fmt(realUsed)} / Своб.: ${fmt(est.free)}`;
}

async function _renderQuality() {
  const mgr = getOfflineManager();
  const q = mgr.getQuality(); 
  
  const btns = _modal.querySelectorAll('.om-quality-btn');
  btns.forEach(b => {
    const myQ = b.dataset.q;
    b.className = 'om-quality-btn';
    if (myQ === q) {
      b.classList.add(q === 'hi' ? 'om-quality-btn--active-hi' : 'om-quality-btn--active-lo');
    }
  });

  const diff = await mgr.countNeedsReCache(q);
  const rcLabel = _modal.querySelector('#om-recache-label');
  const rcBtn = _modal.querySelector('#om-recache-btn');

  if (diff > 0) {
    rcLabel.textContent = `Обновить: ${diff} шт.`;
    rcLabel.style.color = '#ffd54f';
    rcBtn.disabled = false;
    rcBtn.textContent = 'Обновить';
    rcBtn.classList.remove('om-btn--disabled');
  } else {
    rcLabel.textContent = 'Актуально';
    rcLabel.style.color = 'rgba(255,255,255,0.45)';
    rcBtn.disabled = true;
    rcBtn.textContent = 'Нет обновлений';
    rcBtn.classList.add('om-btn--disabled');
  }
}
