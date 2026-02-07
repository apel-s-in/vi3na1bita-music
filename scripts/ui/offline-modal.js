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
  
  // Re-cache Action (Audit #11 Fix)
    const recacheBtn = modal.querySelector('#btn-recache');
    if (recacheBtn) {
      recacheBtn.onclick = async () => {
        // Fix #5.3: Proper re-cache — find files with wrong quality and re-download
        const targetQ = om.getQuality();
        const count = await om.countNeedsReCache(targetQ);
        if (count === 0) {
          (window.NotificationSystem?.info || window.toast)?.('Все файлы уже в правильном качестве.');
          return;
        }
        // Trigger re-cache for files with mismatched quality
        await om.reCacheAll(targetQ);
        (window.NotificationSystem?.info || window.toast)?.(
          `Перекэширование: 0/${count} файлов`,
          { duration: 4000 }
        );
      };
    }

  // Net Policy Handlers
  if(plat.supportsNetControl) {
      modal.querySelector('#btn-wifi').onclick = () => { Net.toggleWifi(); close(); openOfflineModal(); };
      modal.querySelector('#btn-cell').onclick = () => { Net.toggleCellular(); close(); openOfflineModal(); };
      modal.querySelector('#btn-toast').onclick = () => { Net.toggleCellularToast(); close(); openOfflineModal(); };
  } else if (plat.isIOS) {
      modal.querySelector('#btn-kill').onclick = () => { Net.toggleKillSwitch(); close(); openOfflineModal(); };
  }
  modal.querySelector('#btn-clear-traffic').onclick = () => { Net.clearTrafficStats(); close(); openOfflineModal(); };

  // Quality Toggle (Audit #8 Fix: Confirm)
  modal.querySelector('#om-qual-toggle').onclick = async (e) => {
      const t = e.target;
      if (!t.dataset.val) return;
      if (t.dataset.val !== q) {
          const stats = await om.getStorageUsage();
          const count = stats.pinned.count + stats.cloud.count;
          
          const doSwitch = () => {
        // Fix #2.1/#5.2: Single emit point — switchQuality handles save + emit + hot swap
        // setCacheQualitySetting only saves to LS without emitting (see offline-manager fix)
        om.setCacheQualitySetting(t.dataset.val);
        if (window.playerCore?.switchQuality) {
          window.playerCore.switchQuality(t.dataset.val);
        } else {
          // Fallback: emit manually if PlayerCore not available
          window.dispatchEvent(new CustomEvent('quality:changed', { detail: { quality: t.dataset.val } }));
        }
             close(); openOfflineModal();
          };

          if (count > 5) {
              if (confirm(`Смена качества затронет ${count} файлов. Перекачать?`)) doSwitch();
          } else {
              doSwitch();
          }
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

  // Delete Actions (Audit #6 Fix: Double Confirm)
  modal.querySelector('#btn-del-all').onclick = () => {
      if(confirm('Удалить все офлайн-треки? Статистика облачков будет сброшена.')) { 
          if (confirm('Вы уверены? Это действие нельзя отменить.')) {
              om.removeAllCached(); 
              close();
          }
      }
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
    // ═══ Fix #17.1: Storage Breakdown ═══
    const breakdownSection = document.createElement('div');
    breakdownSection.className = 'offline-section storage-breakdown';
    breakdownSection.innerHTML = `
      <h3>Хранилище</h3>
      <div class="breakdown-row"><span>🔒 Закреплённые:</span> <span id="sz-pinned">—</span></div>
      <div class="breakdown-row"><span>☁ Облачные:</span> <span id="sz-cloud">—</span></div>
      <div class="breakdown-row"><span>⏳ PlaybackCache:</span> <span id="sz-transient">—</span></div>
      <div class="breakdown-row"><span>📦 Прочее:</span> <span id="sz-other">—</span></div>
      <div class="breakdown-total"><strong>Занято:</strong> <span id="sz-total">—</span></div>
    `;
    container.appendChild(breakdownSection);

    // Populate breakdown async
    om.getStorageBreakdown?.().then(bd => {
      const fmt = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : (b / 1024).toFixed(0) + ' КБ';
      if (bd) {
        const $ = (id, v) => { const el = breakdownSection.querySelector('#' + id); if (el) el.textContent = v; };
        $('sz-pinned', fmt(bd.pinned || 0));
        $('sz-cloud', fmt(bd.cloud || 0));
        $('sz-transient', fmt(bd.transient || 0));
        $('sz-other', fmt(bd.other || 0));
        $('sz-total', fmt(bd.total || 0));
      }
    }).catch(() => {});

    // ═══ Fix #17.2: Downloads Section ═══
    const downloadsSection = document.createElement('div');
    downloadsSection.className = 'offline-section downloads-status';
    downloadsSection.innerHTML = `
      <h3>Загрузки</h3>
      <div id="dl-current">Скачивается сейчас: —</div>
      <div id="dl-queue">В очереди: 0</div>
      <button id="dl-pause-btn" class="offline-btn-small">Пауза</button>
    `;
    container.appendChild(downloadsSection);

    const dlPauseBtn = downloadsSection.querySelector('#dl-pause-btn');
    if (dlPauseBtn && om.queue) {
      let paused = false;
      dlPauseBtn.onclick = () => {
        paused = !paused;
        if (paused) { om.queue.pause?.(); dlPauseBtn.textContent = 'Возобновить'; }
        else { om.queue.resume?.(); dlPauseBtn.textContent = 'Пауза'; }
      };
      // Update queue stats
      const qStats = om.queue.getStats?.() || {};
      const dlCur = downloadsSection.querySelector('#dl-current');
      const dlQ = downloadsSection.querySelector('#dl-queue');
      if (dlCur) dlCur.textContent = `Скачивается сейчас: ${qStats.active || '—'}`;
      if (dlQ) dlQ.textContent = `В очереди: ${qStats.pending || 0}`;
    }

    // ═══ Fix #17.3: Updates Section ═══
    const updatesSection = document.createElement('div');
    updatesSection.className = 'offline-section updates-section';
    updatesSection.innerHTML = `
      <h3>Обновления</h3>
      <div id="upd-info">Проверка...</div>
      <button id="btn-update-all" class="offline-btn-small" style="display:none">Обновить все файлы</button>
    `;
    container.appendChild(updatesSection);

    // Check for updates
    om.countNeedsUpdate?.().then(count => {
      const info = updatesSection.querySelector('#upd-info');
      const updBtn = updatesSection.querySelector('#btn-update-all');
      if (count > 0) {
        if (info) info.textContent = `${count} файлов требуют обновления`;
        if (updBtn) {
          updBtn.style.display = '';
          updBtn.onclick = async () => {
            const net = window.NetPolicy ? window.NetPolicy.isNetworkAllowed() : navigator.onLine;
            const isWifi = (await import('../offline/net-policy.js')).then(m => m.detectNetworkType() === 'wifi').catch(() => true);
            if (!isWifi) {
              const ok = (window.Modals?.confirm || window.confirm)(
                `${count} файлов для обновления. Рекомендуется Wi-Fi. Продолжить?`
              );
              if (!ok) return;
            }
            om.updateAll?.();
            (window.NotificationSystem?.info || window.toast)?.('Обновление запущено');
          };
        }
      } else {
        if (info) info.textContent = 'Все файлы актуальны';
      }
    }).catch(() => {
      const info = updatesSection.querySelector('#upd-info');
      if (info) info.textContent = 'Все файлы актуальны';
    });

    // ═══ Fix #17.4: Cache Cleanup Section ═══
    const cleanupSection = document.createElement('div');
    cleanupSection.className = 'offline-section cleanup-section';
    cleanupSection.innerHTML = `
      <h3>Очистка кэша</h3>
      <button id="btn-clear-transient" class="offline-btn-small">Очистить PlaybackCache</button>
      <button id="btn-clear-cloud" class="offline-btn-small">Очистить облачные</button>
      <button id="btn-clear-pinned" class="offline-btn-small">Очистить закреплённые</button>
      <button id="btn-clear-all" class="offline-btn-small offline-btn-danger">Очистить всё</button>
    `;
    container.appendChild(cleanupSection);

    const confirmFn = window.Modals?.confirm || window.confirm;

    cleanupSection.querySelector('#btn-clear-transient')?.addEventListener('click', async () => {
      const ok = await confirmFn('Удалить все файлы PlaybackCache?');
      if (ok) { await om.clearByType?.('playbackCache'); _refreshModal(); }
    });

    cleanupSection.querySelector('#btn-clear-cloud')?.addEventListener('click', async () => {
      const ok = await confirmFn('Удалить все облачные файлы?');
      if (ok) { await om.clearByType?.('cloud'); _refreshModal(); }
    });

    cleanupSection.querySelector('#btn-clear-pinned')?.addEventListener('click', async () => {
      // Fix #17.4: Double confirm for pinned
      const ok1 = await confirmFn('Удалить все закреплённые файлы? Это действие необратимо.');
      if (!ok1) return;
      const ok2 = await confirmFn('Вы уверены? Все закреплённые треки будут удалены из кэша.');
      if (ok2) { await om.clearByType?.('pinned'); _refreshModal(); }
    });

    cleanupSection.querySelector('#btn-clear-all')?.addEventListener('click', async () => {
      // Fix #17.6: Double confirm for clear all
      const stats = await om.getStats();
      const totalMB = ((stats.totalSize || 0) / 1048576).toFixed(1);
      const totalFiles = (stats.pinned?.count || 0) + (stats.cloud?.count || 0) + (stats.transient?.count || 0);
      const ok1 = await confirmFn(`Удалить все файлы? (${totalFiles} файлов, ${totalMB} МБ)`);
      if (!ok1) return;
      const ok2 = await confirmFn('Последнее подтверждение. Все офлайн-данные будут удалены.');
      if (ok2) { await om.clearAll?.(); _refreshModal(); }
    });

    // ═══ Fix #17.5: Pinned/Cloud List Button ═══
    const listSection = document.createElement('div');
    listSection.className = 'offline-section list-section';
    listSection.innerHTML = `
      <button id="btn-show-list" class="offline-btn-small">Список закреплённых и облачных</button>
      <div id="pinned-cloud-list" style="display:none"></div>
    `;
    container.appendChild(listSection);

    listSection.querySelector('#btn-show-list')?.addEventListener('click', async () => {
      const listEl = listSection.querySelector('#pinned-cloud-list');
      if (!listEl) return;
      if (listEl.style.display !== 'none') { listEl.style.display = 'none'; return; }
      listEl.style.display = '';
      listEl.innerHTML = '<div class="loading">Загрузка...</div>';

      try {
        const { getAllTrackMetas } = await import('../offline/cache-db.js');
        const metas = await getAllTrackMetas();

        // Fix #17.5: Sort — pinned first (by added date), then cloud (by expiresAt DESC)
        const pinned = metas.filter(m => m.type === 'pinned')
          .sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));
        const cloud = metas.filter(m => m.type === 'cloud')
          .sort((a, b) => (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0));

        const fmt = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : (b / 1024).toFixed(0) + ' КБ';
        const now = Date.now();
        const DAY = 86400000;

        let html = '';
        for (const m of [...pinned, ...cloud]) {
          const icon = m.type === 'pinned' ? '🔒' : '☁';
          const title = m.title || m.uid;
          const q = (m.quality || '').toUpperCase();
          const size = fmt(m.size || 0);
          let status = '';
          if (m.type === 'pinned') {
            status = 'Закреплён';
          } else if (m.cloudExpiresAt) {
            const daysLeft = Math.max(0, Math.ceil((m.cloudExpiresAt - now) / DAY));
            status = `Осталось ${daysLeft} дн.`;
          }
          html += `<div class="list-item">${icon} ${title} · ${q} · ${size} · <em>${status}</em></div>`;
        }

        if (!html) html = '<div class="list-empty">Нет закреплённых или облачных треков</div>';
        listEl.innerHTML = html;
      } catch (e) {
        listEl.innerHTML = '<div class="list-error">Ошибка загрузки</div>';
      }
    });

    // --- END SECTIONS ---

export function openOfflineModal() { render(); }
export function closeOfflineModal() { if(_modal) { _modal.remove(); _modal = null; } }
export function initOfflineModal() {
    const btn = document.getElementById('offline-btn');
    if(btn) btn.onclick = openOfflineModal;
}
export default { initOfflineModal, openOfflineModal };
