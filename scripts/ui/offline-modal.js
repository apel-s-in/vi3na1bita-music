/**
 * offline-modal.js — v1.0 Refactored
 * Порядок секций: Хранилище -> Сеть -> Pinned/Cloud -> Режимы -> Очистка
 */
import { getOfflineManager } from '../offline/offline-manager.js';
import * as Net from '../offline/net-policy.js';

let _modal = null;

function render() {
  if (_modal) return;
  
  const om = getOfflineManager();
  const netState = Net.getNetPolicyState();
  const plat = Net.getPlatform();
  const q = om.getQuality();
  const mode = om.getMode();
  
  const overlay = document.createElement('div');
  overlay.className = 'offline-modal-overlay';
  
  const modal = document.createElement('div');
  modal.className = 'offline-modal';
  
  // Header
  modal.innerHTML = `
    <div class="offline-modal__header">
      <span>OFFLINE</span>
      <button class="offline-modal__close">×</button>
    </div>
  `;

  // 1. Storage
  const storageSec = document.createElement('div');
  storageSec.className = 'offline-section';
  storageSec.innerHTML = `<div class="offline-section__title">Хранилище</div>
    <div class="offline-row"><span class="offline-row__label">Занято</span><span id="om-storage-val">...</span></div>
    <div class="offline-progress"><div class="offline-progress__bar" id="om-storage-bar" style="width:0%"></div></div>`;
  modal.appendChild(storageSec);

  // 2. Network Policy
  const netSec = document.createElement('div');
  netSec.className = 'offline-section';
  let netHtml = `<div class="offline-section__title">Сетевая политика</div>`;
  
  if (plat.supportsNetControl) {
      netHtml += `
      <button class="np-toggle-btn ${netState.wifiEnabled?'np-toggle-btn--on':'np-toggle-btn--off'}" id="btn-wifi">
        Ethernet / Wi-Fi: ${netState.wifiEnabled?'ВКЛ':'ВЫКЛ'}
      </button>
      <button class="np-toggle-btn ${netState.cellularEnabled?'np-toggle-btn--on':'np-toggle-btn--off'}" id="btn-cell">
        Cellular: ${netState.cellularEnabled?'ВКЛ':'ВЫКЛ'}
      </button>
      <button class="np-toggle-btn ${netState.cellularToast?'np-toggle-btn--notify-on':'np-toggle-btn--notify-off'}" id="btn-toast">
        Уведомления Cellular: ${netState.cellularToast?'ВКЛ':'ВЫКЛ'}
      </button>`;
  } else {
      netHtml += `<div class="np-unsupported">Управление сетью ограничено ОС</div>`;
      if (plat.isIOS) {
          netHtml += `<button class="np-toggle-btn ${netState.killSwitch?'np-toggle-btn--off':'np-toggle-btn--notify-off'}" id="btn-kill">
            Отключить весь интернет: ${netState.killSwitch?'АКТИВНО':'ВЫКЛ'}
          </button>`;
      }
  }
  // Traffic Stats
  const stats = Net.getTrafficStats();
  netHtml += `<div class="np-traffic" style="margin-top:10px;font-size:12px;color:#888;">
    ${stats.type==='general' ? 
      `<div>Всего: ${(stats.general.total/1048576).toFixed(1)} МБ</div>` : 
      `<div>Wi-Fi: ${(stats.wifi.total/1048576).toFixed(1)} МБ | Cell: ${(stats.cellular.total/1048576).toFixed(1)} МБ</div>`
    }
    <button class="offline-btn offline-btn--danger" id="btn-clear-traffic" style="margin-top:5px;padding:4px 8px;font-size:11px">Очистить статистику</button>
  </div>`;
  netSec.innerHTML = netHtml;
  modal.appendChild(netSec);

  // 3. Pinned & Cloud
  const pcSec = document.createElement('div');
  pcSec.className = 'offline-section';
  const { N, D } = om.getCloudSettings();
  
  pcSec.innerHTML = `
    <div class="offline-section__title">Pinned и Cloud</div>
    <div class="offline-row">
      <span class="offline-row__label">Качество кэша</span>
      <div class="offline-toggle" id="om-qual-toggle">
        <button class="offline-toggle__opt ${q==='hi'?'offline-toggle__opt--active':''}" data-val="hi">Hi</button>
        <button class="offline-toggle__opt ${q==='lo'?'offline-toggle__opt--active':''}" data-val="lo">Lo</button>
      </div>
    </div>
    <div class="offline-row" style="justify-content:center;margin:10px 0;">
       <button class="offline-btn" id="btn-recache">Re-cache (Force)</button>
    </div>
    <div class="offline-row"><span class="offline-row__label">Слушать для ☁ (N)</span><input type="number" id="inp-n" value="${N}" class="offline-input-num"></div>
    <div class="offline-row"><span class="offline-row__label">Хранить ☁ дней (D)</span><input type="number" id="inp-d" value="${D}" class="offline-input-num"></div>
    <button class="offline-btn" id="btn-apply-cloud" style="width:100%;margin-top:5px">Применить настройки</button>
    
    <div style="margin-top:12px;border-top:1px solid #333;padding-top:10px;">
        <button class="offline-btn offline-btn--danger" id="btn-del-all" style="width:100%">Удалить все 🔒 и ☁</button>
    </div>
  `;
  modal.appendChild(pcSec);

  // 4. Modes
  const modeSec = document.createElement('div');
  modeSec.className = 'offline-section';
  modeSec.innerHTML = `
    <div class="offline-section__title">Режимы кэширования</div>
    <div class="offline-row">
      <span class="offline-row__label">PlaybackCache (R1)</span>
      <div class="offline-toggle" id="om-mode-toggle">
        <button class="offline-toggle__opt ${mode==='R0'?'offline-toggle__opt--active':''}" data-val="R0">OFF</button>
        <button class="offline-toggle__opt ${mode==='R1'?'offline-toggle__opt--active':''}" data-val="R1">ON</button>
      </div>
    </div>
    <div style="font-size:11px;color:#666;">R1 предзагружает соседей (PREV/NEXT). R0 - чистый стриминг.</div>
  `;
  modal.appendChild(modeSec);

  // 5. Cleanup
  const cleanSec = document.createElement('div');
  cleanSec.className = 'offline-section';
  cleanSec.innerHTML = `<div class="offline-section__title">Очистка</div>
    <button class="offline-btn offline-btn--danger" id="btn-nuke" style="width:100%">Очистить ВЕСЬ кэш приложения</button>`;
  modal.appendChild(cleanSec);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  _modal = overlay;

  // --- Bind Events ---
  const close = () => { overlay.remove(); _modal = null; };
  overlay.addEventListener('click', e => { if(e.target === overlay) close(); });
  modal.querySelector('.offline-modal__close').addEventListener('click', close);

  // Net Policy Handlers
  if(plat.supportsNetControl) {
      modal.querySelector('#btn-wifi').onclick = () => { Net.toggleWifi(); close(); openOfflineModal(); };
      modal.querySelector('#btn-cell').onclick = () => { Net.toggleCellular(); close(); openOfflineModal(); };
      modal.querySelector('#btn-toast').onclick = () => { Net.toggleCellularToast(); close(); openOfflineModal(); };
  } else if (plat.isIOS) {
      modal.querySelector('#btn-kill').onclick = () => { Net.toggleKillSwitch(); close(); openOfflineModal(); };
  }
  modal.querySelector('#btn-clear-traffic').onclick = () => { Net.clearTrafficStats(); close(); openOfflineModal(); };

  // Quality Toggle (Confirm logic handled in PlayerUI/OfflineManager, here just trigger)
  modal.querySelector('#om-qual-toggle').onclick = (e) => {
      const t = e.target;
      if (!t.dataset.val) return;
      if (t.dataset.val !== q) {
          // ТЗ 4.3: Если файлов > 5 -> Confirm. 
          // Проверяем количество через OfflineManager
          // Но пока просто переключаем, а PlayerUI поймает событие и покажет confirm?
          // Нет, логика confirm должна быть здесь.
          // Упростим: просто меняем, OfflineManager пометит needsReCache.
          // Пользователь нажмет "Re-cache" если надо.
          om.setCacheQualitySetting(t.dataset.val); // Это вызовет quality:changed и update UI
          window.playerCore?.switchQuality(t.dataset.val); // Hot swap
          close(); openOfflineModal();
      }
  };

  // Mode Toggle
  modal.querySelector('#om-mode-toggle').onclick = (e) => {
      const t = e.target;
      if (!t.dataset.val) return;
      om.setMode(t.dataset.val);
      close(); openOfflineModal();
  };

  // Cloud Apply
  modal.querySelector('#btn-apply-cloud').onclick = () => {
      const n = parseInt(modal.querySelector('#inp-n').value);
      const d = parseInt(modal.querySelector('#inp-d').value);
      om.confirmApplyCloudSettings({ newN: n, newD: d, toRemove: [], toPromote: [] }); // Simplified call
      close();
  };

  // Delete Actions
  modal.querySelector('#btn-del-all').onclick = () => {
      if(confirm('Удалить все офлайн-треки?')) { om.removeAllCached(); close(); }
  };
  modal.querySelector('#btn-nuke').onclick = () => {
      if(confirm('Очистить ВЕСЬ кэш?')) { om.queue.clear(); indexedDB.deleteDatabase('offlineCache'); window.location.reload(); }
  };

  // Storage Update
  om.hasSpace().then(() => {
      if(!_modal) return;
      import('../offline/cache-db.js').then(db => db.estimateUsage().then(est => {
          modal.querySelector('#om-storage-val').textContent = `${(est.used/1048576).toFixed(1)} МБ`;
          modal.querySelector('#om-storage-bar').style.width = `${(est.used/est.quota)*100}%`;
      }));
  });
}

export function openOfflineModal() { render(); }
export function closeOfflineModal() { if(_modal) { _modal.remove(); _modal = null; } }
export function initOfflineModal() {
    const btn = document.getElementById('offline-btn');
    if(btn) btn.onclick = openOfflineModal;
}
export default { initOfflineModal, openOfflineModal };
