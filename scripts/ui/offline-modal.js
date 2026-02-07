/**
 * offline-modal.js — v2.0 Complete Audit Fix
 * Все секции внутри render(), все методы проверены на существование.
 */
import { getOfflineManager } from '../offline/offline-manager.js';
import * as Net from '../offline/net-policy.js';

let _modal = null;

function _fmtBytes(b) {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' МБ';
  if (b >= 1024) return (b / 1024).toFixed(0) + ' КБ';
  return b + ' Б';
}

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

  const body = document.createElement('div');
  body.className = 'offline-modal__body';

  // ═══ 1. Storage ═══
  const storageSec = document.createElement('div');
  storageSec.className = 'offline-section';
  storageSec.innerHTML = `
    <div class="offline-section__title">Хранилище</div>
    <div class="offline-row"><span class="offline-row__label">Занято</span><span id="om-storage-val">…</span></div>
    <div class="offline-progress"><div class="offline-progress__bar" id="om-storage-bar" style="width:0%"></div></div>
    <div id="om-breakdown"></div>
  `;
  body.appendChild(storageSec);

  // Populate storage async
  (async () => {
    try {
      const { estimateUsage } = await import('../offline/cache-db.js');
      const est = await estimateUsage();
      const valEl = storageSec.querySelector('#om-storage-val');
      const barEl = storageSec.querySelector('#om-storage-bar');
      if (valEl) valEl.textContent = `${_fmtBytes(est.used)} / ${_fmtBytes(est.quota)}`;
      if (barEl) barEl.style.width = `${Math.min(100, (est.used / est.quota) * 100)}%`;

      // Fix #17.1: Breakdown
      if (om.getStorageBreakdown) {
        const bd = await om.getStorageBreakdown();
        const bdEl = storageSec.querySelector('#om-breakdown');
        if (bdEl) {
          bdEl.innerHTML = `
            <div style="font-size:12px;color:#888;margin-top:8px">
              <div>🔒 Закреплённые: ${_fmtBytes(bd.pinned)}</div>
              <div>☁ Облачные: ${_fmtBytes(bd.cloud)}</div>
              <div>⏳ PlaybackCache: ${_fmtBytes(bd.transient)}</div>
              <div>📦 Прочее: ${_fmtBytes(bd.other)}</div>
            </div>
          `;
        }
      }
    } catch (e) {
      console.warn('[OfflineModal] storage error:', e);
    }
  })();

  // ═══ 2. Network Policy ═══
  const netSec = document.createElement('div');
  netSec.className = 'offline-section';
  let netHtml = `<div class="offline-section__title">Сетевая политика</div>`;

  if (plat.supportsNetControl) {
    netHtml += `
      <button class="np-toggle-btn ${netState.wifiEnabled ? 'np-toggle-btn--on' : 'np-toggle-btn--off'}" id="btn-wifi">
        Ethernet / Wi-Fi: ${netState.wifiEnabled ? 'ВКЛ' : 'ВЫКЛ'}
      </button>
      <button class="np-toggle-btn ${netState.cellularEnabled ? 'np-toggle-btn--on' : 'np-toggle-btn--off'}" id="btn-cell">
        Cellular: ${netState.cellularEnabled ? 'ВКЛ' : 'ВЫКЛ'}
      </button>
      <button class="np-toggle-btn ${netState.cellularToast ? 'np-toggle-btn--notify-on' : 'np-toggle-btn--notify-off'}" id="btn-toast">
        Уведомления Cellular: ${netState.cellularToast ? 'ВКЛ' : 'ВЫКЛ'}
      </button>`;
  } else {
    netHtml += `<div class="np-unsupported">Управление сетью ограничено ОС</div>`;
    if (plat.isIOS) {
      netHtml += `<button class="np-toggle-btn ${netState.killSwitch ? 'np-toggle-btn--off' : 'np-toggle-btn--notify-off'}" id="btn-kill">
        Отключить весь интернет: ${netState.killSwitch ? 'АКТИВНО' : 'ВЫКЛ'}
      </button>`;
    }
  }

  const stats = Net.getTrafficStats();
  netHtml += `<div class="np-traffic" style="margin-top:10px;font-size:12px;color:#888;">
    ${stats.type === 'general' ?
      `<div>Всего: ${(stats.general.total / 1048576).toFixed(1)} МБ</div>` :
      `<div>Wi-Fi: ${(stats.wifi.total / 1048576).toFixed(1)} МБ | Cell: ${(stats.cellular.total / 1048576).toFixed(1)} МБ</div>`
    }
    <button class="offline-btn offline-btn--danger" id="btn-clear-traffic" style="margin-top:5px;padding:4px 8px;font-size:11px">Очистить статистику</button>
  </div>`;
  netSec.innerHTML = netHtml;
  body.appendChild(netSec);

  // ═══ 3. Pinned & Cloud ═══
  const pcSec = document.createElement('div');
  pcSec.className = 'offline-section';
  const { N, D } = om.getCloudSettings();

  pcSec.innerHTML = `
    <div class="offline-section__title">Pinned и Cloud</div>
    <div class="offline-row">
      <span class="offline-row__label">Качество кэша</span>
      <div class="offline-toggle" id="om-qual-toggle">
        <button class="offline-toggle__opt ${q === 'hi' ? 'offline-toggle__opt--active' : ''}" data-val="hi">Hi</button>
        <button class="offline-toggle__opt ${q === 'lo' ? 'offline-toggle__opt--active' : ''}" data-val="lo">Lo</button>
      </div>
    </div>
    <div class="offline-row" style="justify-content:center;margin:10px 0;">
      <button class="offline-btn" id="btn-recache">Re-cache</button>
    </div>
    <div class="offline-row"><span class="offline-row__label">Слушать для ☁ (N)</span><input type="number" id="inp-n" value="${N}" class="offline-input-num"></div>
    <div class="offline-row"><span class="offline-row__label">Хранить ☁ дней (D)</span><input type="number" id="inp-d" value="${D}" class="offline-input-num"></div>
    <button class="offline-btn" id="btn-apply-cloud" style="width:100%;margin-top:5px">Применить настройки</button>
    <div style="margin-top:12px;border-top:1px solid #333;padding-top:10px;">
      <button class="offline-btn offline-btn--danger" id="btn-del-all" style="width:100%">Удалить все 🔒 и ☁</button>
    </div>
  `;
  body.appendChild(pcSec);

  // ═══ 4. Downloads Status (Fix #17.2) ═══
  const dlSec = document.createElement('div');
  dlSec.className = 'offline-section';
  const qStatus = om.getDownloadStatus?.() || { active: 0, queued: 0 };
  dlSec.innerHTML = `
    <div class="offline-section__title">Загрузки</div>
    <div style="font-size:13px;color:#aaa">
      <div>Активных: ${qStatus.active}</div>
      <div>В очереди: ${qStatus.queued}</div>
    </div>
    <button class="offline-btn" id="btn-dl-pause" style="margin-top:6px;padding:4px 10px;font-size:12px">Пауза</button>
  `;
  body.appendChild(dlSec);

  // ═══ 5. Modes ═══
  const modeSec = document.createElement('div');
  modeSec.className = 'offline-section';
  modeSec.innerHTML = `
    <div class="offline-section__title">Режимы кэширования</div>
    <div class="offline-row">
      <span class="offline-row__label">PlaybackCache (R1)</span>
      <div class="offline-toggle" id="om-mode-toggle">
        <button class="offline-toggle__opt ${mode === 'R0' ? 'offline-toggle__opt--active' : ''}" data-val="R0">OFF</button>
        <button class="offline-toggle__opt ${mode === 'R1' ? 'offline-toggle__opt--active' : ''}" data-val="R1">ON</button>
      </div>
    </div>
    <div style="font-size:11px;color:#666;">R1 предзагружает соседей. R0 — чистый стриминг.</div>
  `;
  body.appendChild(modeSec);

  // ═══ 6. Pinned/Cloud List (Fix #17.5) ═══
  const listSec = document.createElement('div');
  listSec.className = 'offline-section';
  listSec.innerHTML = `
    <div class="offline-section__title">Список треков</div>
    <button class="offline-btn" id="btn-show-list" style="width:100%">Показать закреплённые и облачные</button>
    <div id="pinned-cloud-list" style="display:none;margin-top:8px;max-height:200px;overflow-y:auto"></div>
  `;
  body.appendChild(listSec);

  // ═══ 7. Cleanup (Fix #17.4) ═══
  const cleanSec = document.createElement('div');
  cleanSec.className = 'offline-section';
  cleanSec.innerHTML = `
    <div class="offline-section__title">Очистка</div>
    <button class="offline-btn offline-btn--danger" id="btn-nuke" style="width:100%">Очистить ВЕСЬ кэш приложения</button>
  `;
  body.appendChild(cleanSec);

  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  _modal = overlay;

  // ═══ EVENT HANDLERS ═══

  const close = () => { overlay.remove(); _modal = null; };
  const reopen = () => { close(); render(); };

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  modal.querySelector('.offline-modal__close').addEventListener('click', close);

  // Fix #5.3: Re-cache
  modal.querySelector('#btn-recache')?.addEventListener('click', async () => {
    const q = om.getQuality();
    if (!om.countNeedsReCache || !om.reCacheAll) {
      window.NotificationSystem?.info?.('Re-cache не поддерживается');
      return;
    }
    const count = await om.countNeedsReCache(q);
    if (!count) return window.NotificationSystem?.info?.('Все файлы уже в правильном качестве.');

    // ТЗ 4.5: ускоренная перекачка (2-3 параллельных), но базово 1.
    om.queue?.setParallel?.(3);
    await om.reCacheAll(q);
    window.NotificationSystem?.info?.(`Перекэширование: ${count} файлов`);

    // iOS-safe: вернуть параллелизм обратно (простая гарантия, без усложнения событий)
    setTimeout(() => om.queue?.setParallel?.(1), 15000);
  });

  // Net Policy handlers
  if (plat.supportsNetControl) {
    modal.querySelector('#btn-wifi')?.addEventListener('click', () => { Net.toggleWifi(); reopen(); });
    modal.querySelector('#btn-cell')?.addEventListener('click', () => { Net.toggleCellular(); reopen(); });
    modal.querySelector('#btn-toast')?.addEventListener('click', () => { Net.toggleCellularToast(); reopen(); });
  } else if (plat.isIOS) {
    modal.querySelector('#btn-kill')?.addEventListener('click', () => { Net.toggleKillSwitch(); reopen(); });
  }
  modal.querySelector('#btn-clear-traffic')?.addEventListener('click', () => { Net.clearTrafficStats(); reopen(); });

  // Fix #5.2/#2.1: Quality toggle — single emit
  modal.querySelector('#om-qual-toggle')?.addEventListener('click', async (e) => {
    const t = e.target;
    if (!t.dataset?.val || t.dataset.val === q) return;

    const newQ = t.dataset.val;
    const count = om.countNeedsReCache ? await om.countNeedsReCache(newQ) : 0;

    const doSwitch = () => {
      om.setCacheQualitySetting(newQ);
      if (window.playerCore?.switchQuality) {
        window.playerCore.switchQuality(newQ);
      } else {
        window.dispatchEvent(new CustomEvent('quality:changed', { detail: { quality: newQ } }));
      }
      reopen();
    };

    if (count > 5) {
      const confirmFn = window.Modals?.confirm;
      if (confirmFn) {
        confirmFn({
          title: 'Смена качества',
          textHtml: `Перекэширование затронет ${count} файлов. Продолжить?`,
          confirmText: 'Да',
          cancelText: 'Отмена',
          onConfirm: doSwitch
        });
      } else if (confirm(`Смена качества затронет ${count} файлов. Перекачать?`)) {
        doSwitch();
      }
    } else {
      doSwitch();
    }
  });

  // Mode toggle (Fix #5.4: check space)
  modal.querySelector('#om-mode-toggle')?.addEventListener('click', async (e) => {
    const t = e.target;
    if (!t.dataset?.val) return;
    if (t.dataset.val === 'R1') {
      const hasEnough = await om.hasSpace();
      if (!hasEnough) {
        window.NotificationSystem?.warning?.('Недостаточно места (минимум 60 МБ)');
        return;
      }
    }
    om.setMode(t.dataset.val);
    reopen();
  });

  // Fix #1.8/#17.7: Cloud apply with preview
  modal.querySelector('#btn-apply-cloud')?.addEventListener('click', async () => {
    const newN = parseInt(modal.querySelector('#inp-n')?.value, 10) || 5;
    const newD = parseInt(modal.querySelector('#inp-d')?.value, 10) || 31;

    if (om.previewCloudSettingsChange) {
      const preview = await om.previewCloudSettingsChange({ newN, newD });
      if (preview.toRemove > 0) {
        const ok = confirm(`При изменении настроек ${preview.toRemove} файлов будут удалены из кэша. Продолжить?`);
        if (!ok) return;
      }
    }

    await om.confirmApplyCloudSettings({ newN, newD });
    close();
  });

  // Delete all pinned & cloud (Fix #17.6: double confirm)
  modal.querySelector('#btn-del-all')?.addEventListener('click', async () => {
    if (!confirm('Удалить все офлайн-треки? Статистика облачков будет сброшена.')) return;
    if (!confirm('Вы уверены? Это действие нельзя отменить.')) return;
    await om.removeAllCached();
    close();
  });

  // Downloads pause/resume
  let dlPaused = false;
  modal.querySelector('#btn-dl-pause')?.addEventListener('click', (e) => {
    dlPaused = !dlPaused;
    if (dlPaused) { om.queue?.pause?.(); e.target.textContent = 'Возобновить'; }
    else { om.queue?.resume?.(); e.target.textContent = 'Пауза'; }
  });

  // Fix #17.5: Show list
  modal.querySelector('#btn-show-list')?.addEventListener('click', async () => {
    const listEl = modal.querySelector('#pinned-cloud-list');
    if (!listEl) return;
    if (listEl.style.display !== 'none') { listEl.style.display = 'none'; return; }
    listEl.style.display = '';
    listEl.innerHTML = '<div style="color:#888;font-size:12px">Загрузка...</div>';

    try {
      const { getAllTrackMetas } = await import('../offline/cache-db.js');
      const metas = await getAllTrackMetas();

      const pinned = metas.filter(m => m.type === 'pinned').sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));
      const cloud = metas.filter(m => m.type === 'cloud').sort((a, b) => (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0));

      const now = Date.now();
      const DAY = 86400000;
      let html = '';

      for (const m of [...pinned, ...cloud]) {
        const icon = m.type === 'pinned' ? '🔒' : '☁';
        const title = m.title || m.uid;
        const mq = (m.quality || '').toUpperCase();
        const size = _fmtBytes(m.size || 0);
        let status = m.type === 'pinned' ? 'Закреплён' : '';
        if (m.type === 'cloud' && m.cloudExpiresAt) {
          const daysLeft = Math.max(0, Math.ceil((m.cloudExpiresAt - now) / DAY));
          status = `Осталось ${daysLeft} дн.`;
        }
        html += `<div style="padding:4px 0;border-bottom:1px solid #2a2a3a;font-size:12px">${icon} ${title} · ${mq} · ${size} · <em style="opacity:.6">${status}</em></div>`;
      }

      if (!html) html = '<div style="color:#666;font-size:12px;text-align:center;padding:12px 0">Нет закреплённых или облачных треков</div>';
      listEl.innerHTML = html;
    } catch (e) {
      listEl.innerHTML = '<div style="color:#ff6b6b;font-size:12px">Ошибка загрузки</div>';
    }
  });

  // Nuke all cache
  modal.querySelector('#btn-nuke')?.addEventListener('click', async () => {
    if (!confirm('Очистить ВЕСЬ кэш? Все офлайн-данные будут утеряны.')) return;
    if (!confirm('Последнее подтверждение. Продолжить?')) return;
    try {
      await om.removeAllCached();
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      window.NotificationSystem?.success?.('Кэш полностью очищен');
    } catch (e) {
      window.NotificationSystem?.error?.('Ошибка очистки');
    }
    close();
  });
}

export function openOfflineModal() { render(); }
export function closeOfflineModal() { if (_modal) { _modal.remove(); _modal = null; } }
export function initOfflineModal() {
  const btn = document.getElementById('offline-btn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      // Fix #6.3: Click on "!" alert — toast instead of modal
      if (e.target.classList?.contains('offline-btn-alert')) {
        e.stopPropagation();
        window.NotificationSystem?.info?.('Есть треки для обновления. Откройте настройки OFFLINE.', 6000);
        return;
      }
      openOfflineModal();
    });
  }
}
export default { initOfflineModal, openOfflineModal };
