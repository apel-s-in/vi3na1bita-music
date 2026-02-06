/**
 * offline-modal.js — Модальное окно управления офлайн-режимом
 */

import { getOfflineManager } from '../offline/offline-manager.js';

const MODE_LABELS = {
  R0: 'Онлайн (офлайн выключен)',
  R1: 'Облачный кэш',
  R2: 'Подготовка к офлайну',
  R3: 'Полный офлайн'
};

const MODE_DESCRIPTIONS = {
  R0: 'Музыка воспроизводится только онлайн. Кэш не используется.',
  R1: 'Прослушанные треки автоматически кэшируются. При потере сети — воспроизведение из кэша.',
  R2: 'Выбранные альбомы загружаются целиком для перехода в полный офлайн.',
  R3: 'Полностью автономный режим. Воспроизведение только из кэша.'
};

let _activeModal = null;

function _closeModal() {
  if (_activeModal) {
    try { _activeModal.remove(); } catch {}
    _activeModal = null;
  }
}

export async function openOfflineModal() {
  _closeModal();

  if (!window.Modals?.open) {
    console.warn('[OfflineModal] window.Modals not available');
    return;
  }

  const mgr = getOfflineManager();
  const currentMode = mgr.getMode();
  const storageInfo = await mgr.getStorageInfo().catch(() => ({
    used: 0, usage: 0, quota: 0, free: 0,
    categories: { counts: {}, sizes: {} }
  }));
  const queueStatus = mgr.getQueueStatus();

  const used = storageInfo.used || storageInfo.usage || 0;
  const usedMB = (used / (1024 * 1024)).toFixed(1);
  const quotaMB = ((storageInfo.quota || 0) / (1024 * 1024)).toFixed(0);
  const freeMB = ((storageInfo.free || 0) / (1024 * 1024)).toFixed(0);

  const cats = storageInfo.categories || { counts: {}, sizes: {} };
  const pinnedCount = cats.counts?.pinned || 0;
  const cloudCount = cats.counts?.cloud || 0;
  const totalCount = cats.counts?.total || 0;

  const cacheQuality = mgr.getCacheQualitySetting();
  const netPolicy = mgr.getNetPolicy();
  const preset = mgr.getPreset();

  const bodyHtml = `
    <div class="offline-modal" style="color:#fff; font-family:sans-serif;">

      <div style="background:rgba(255,255,255,0.08); border-radius:10px; padding:14px; margin-bottom:14px;">
        <div style="font-size:13px; opacity:0.6; margin-bottom:4px;">Текущий режим</div>
        <div style="font-size:17px; font-weight:600;">${MODE_LABELS[currentMode]}</div>
        <div style="font-size:12px; opacity:0.5; margin-top:4px;">${MODE_DESCRIPTIONS[currentMode]}</div>
      </div>

      <div style="display:flex; gap:6px; margin-bottom:14px; flex-wrap:wrap;" id="offline-mode-btns">
        ${['R0','R1','R2','R3'].map(m => `
          <button data-mode="${m}" style="
            flex:1; min-width:60px; padding:8px 4px; border-radius:8px; border:none;
            font-size:12px; font-weight:600; cursor:pointer; transition:all .2s;
            background:${m === currentMode ? '#6c5ce7' : 'rgba(255,255,255,0.1)'};
            color:${m === currentMode ? '#fff' : 'rgba(255,255,255,0.6)'};">
            ${m}
          </button>
        `).join('')}
      </div>

      <div style="background:rgba(255,255,255,0.08); border-radius:10px; padding:14px; margin-bottom:14px;">
        <div style="font-size:13px; opacity:0.6; margin-bottom:8px;">💾 Хранилище</div>
        <div style="font-size:13px;">Использовано: <b>${usedMB} МБ</b> / ${quotaMB} МБ (свободно: ${freeMB} МБ)</div>
        <div style="height:6px; background:rgba(255,255,255,0.1); border-radius:3px; margin-top:8px; overflow:hidden;">
          <div style="height:100%; width:${storageInfo.quota ? Math.min(100, (used / storageInfo.quota) * 100) : 0}%;
                       background:linear-gradient(90deg,#6c5ce7,#a29bfe); border-radius:3px;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:11px; opacity:0.5; margin-top:6px;">
          <span>📌 ${pinnedCount}</span>
          <span>☁️ ${cloudCount}</span>
          <span>Всего: ${totalCount}</span>
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.08); border-radius:10px; padding:14px; margin-bottom:14px;">
        <div style="font-size:13px; opacity:0.6; margin-bottom:8px;">🎵 Качество кэша</div>
        <div style="display:flex; gap:8px;" id="offline-quality-btns">
          <button data-q="hi" style="flex:1; padding:8px; border-radius:8px; border:none; cursor:pointer;
            background:${cacheQuality === 'hi' ? '#00b894' : 'rgba(255,255,255,0.1)'};
            color:${cacheQuality === 'hi' ? '#fff' : 'rgba(255,255,255,0.6)'}; font-size:12px; font-weight:600;">HI (320k)</button>
          <button data-q="lo" style="flex:1; padding:8px; border-radius:8px; border:none; cursor:pointer;
            background:${cacheQuality === 'lo' ? '#00b894' : 'rgba(255,255,255,0.1)'};
            color:${cacheQuality === 'lo' ? '#fff' : 'rgba(255,255,255,0.6)'}; font-size:12px; font-weight:600;">LO (128k)</button>
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.08); border-radius:10px; padding:14px; margin-bottom:14px;">
        <div style="font-size:13px; opacity:0.6; margin-bottom:8px;">🌐 Сетевая политика</div>
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; margin-bottom:6px;">
          <input type="checkbox" id="offm-wifi" ${netPolicy.wifi ? 'checked' : ''}> Wi-Fi
        </label>
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
          <input type="checkbox" id="offm-mobile" ${netPolicy.mobile ? 'checked' : ''}> Мобильные данные
        </label>
      </div>

      <div style="background:rgba(255,255,255,0.08); border-radius:10px; padding:14px; margin-bottom:14px;">
        <div style="font-size:13px; opacity:0.6; margin-bottom:8px;">⚙️ Скорость: <b>${preset.label || preset.name}</b></div>
        <div style="display:flex; gap:6px;" id="offline-preset-btns">
          ${['conservative','balanced','aggressive'].map(p => `
            <button data-preset="${p}" style="flex:1; padding:6px 4px; border-radius:8px; border:none; cursor:pointer;
              font-size:11px; font-weight:600;
              background:${preset.name === p ? '#fdcb6e' : 'rgba(255,255,255,0.1)'};
              color:${preset.name === p ? '#000' : 'rgba(255,255,255,0.6)'};">
              ${{ conservative: '🐢', balanced: '⚖️', aggressive: '🚀' }[p]}
            </button>
          `).join('')}
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.08); border-radius:10px; padding:14px; margin-bottom:14px;">
        <div style="font-size:13px; opacity:0.6; margin-bottom:8px;">📥 Очередь</div>
        <div style="font-size:13px;">
          В очереди: <b>${queueStatus.queued}</b> · Активных: <b>${queueStatus.active}</b>
          ${queueStatus.paused ? ' · <span style="color:#e17055;">⏸</span>' : ''}
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button id="offm-pause" style="flex:1; padding:6px; border-radius:6px; border:none; cursor:pointer;
            background:rgba(255,255,255,0.1); color:#fff; font-size:12px;">
            ${queueStatus.paused ? '▶ Продолжить' : '⏸ Пауза'}
          </button>
          <button id="offm-clear-queue" style="flex:1; padding:6px; border-radius:6px; border:none; cursor:pointer;
            background:rgba(225,112,85,0.3); color:#e17055; font-size:12px;">🗑 Очистить</button>
        </div>
      </div>

      <div style="display:flex; gap:8px; margin-top:10px;">
        <button id="offm-clear-all" style="flex:1; padding:10px; border-radius:8px; border:none; cursor:pointer;
          background:rgba(214,48,49,0.2); color:#ff7675; font-size:13px; font-weight:600;">🧹 Очистить кэш</button>
        <button id="offm-close" style="flex:1; padding:10px; border-radius:8px; border:none; cursor:pointer;
          background:rgba(108,92,231,0.3); color:#a29bfe; font-size:13px; font-weight:600;">✕ Закрыть</button>
      </div>
    </div>
  `;

  _activeModal = window.Modals.open({
    title: '⚡ Офлайн-режим',
    maxWidth: 520,
    bodyHtml
  });

  // Bind events after render
  requestAnimationFrame(() => {
    _activeModal?.querySelectorAll('#offline-mode-btns button').forEach(btn => {
      btn.addEventListener('click', async () => {
        await mgr.setMode(btn.dataset.mode);
        _closeModal();
        setTimeout(() => openOfflineModal(), 200);
      });
    });

    _activeModal?.querySelectorAll('#offline-quality-btns button').forEach(btn => {
      btn.addEventListener('click', () => {
        mgr.setCacheQualitySetting(btn.dataset.q);
        _closeModal();
        setTimeout(() => openOfflineModal(), 200);
      });
    });

    const wifiCb = _activeModal?.querySelector('#offm-wifi');
    const mobileCb = _activeModal?.querySelector('#offm-mobile');
    wifiCb?.addEventListener('change', () => mgr.setNetPolicy({ wifi: wifiCb.checked, mobile: mobileCb?.checked ?? true }));
    mobileCb?.addEventListener('change', () => mgr.setNetPolicy({ wifi: wifiCb?.checked ?? true, mobile: mobileCb.checked }));

    _activeModal?.querySelectorAll('#offline-preset-btns button').forEach(btn => {
      btn.addEventListener('click', () => {
        mgr.setPreset(btn.dataset.preset);
        _closeModal();
        setTimeout(() => openOfflineModal(), 200);
      });
    });

    _activeModal?.querySelector('#offm-pause')?.addEventListener('click', () => {
      mgr.getQueueStatus().paused ? mgr.resumeDownloads() : mgr.pauseDownloads();
      _closeModal();
      setTimeout(() => openOfflineModal(), 200);
    });

    _activeModal?.querySelector('#offm-clear-queue')?.addEventListener('click', () => {
      mgr.queue.clear();
      _closeModal();
      setTimeout(() => openOfflineModal(), 200);
    });

    _activeModal?.querySelector('#offm-clear-all')?.addEventListener('click', async () => {
      if (confirm('Удалить ВСЕ кэшированные треки?')) {
        await mgr.clearByCategory('all');
        await mgr.setMode('R0');
        _closeModal();
        window.NotificationSystem?.success('Кэш очищен');
      }
    });

    _activeModal?.querySelector('#offm-close')?.addEventListener('click', () => _closeModal());
  });
}

export default openOfflineModal;
