// scripts/ui/offline-modal.js
// Offline Modal (ТЗ_Нью) — переключатель режима, настройки CQ/Cloud, 100% OFFLINE, статистика

const MODAL_CSS = `
.offline-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.55);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.offline-modal {
  background: #1a1a1a;
  color: #eee;
  border-radius: 12px;
  width: 90%;
  max-width: 420px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0,0,0,.5);
  font-family: system-ui, sans-serif;
}
.offline-modal h2 {
  margin: 0 0 18px;
  font-size: 1.3rem;
  display: flex;
  align-items: center;
  gap: 10px;
}
.offline-modal .status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}
.offline-modal .status-dot.on { background: #4caf50; }
.offline-modal .status-dot.off { background: #888; }
.offline-modal section {
  margin-bottom: 18px;
}
.offline-modal label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  margin-bottom: 8px;
}
.offline-modal .row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.offline-modal input[type="number"] {
  width: 60px;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid #444;
  background: #222;
  color: #eee;
}
.offline-modal select {
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid #444;
  background: #222;
  color: #eee;
}
.offline-modal button {
  padding: 10px 18px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: .95rem;
  margin-right: 8px;
  margin-top: 6px;
}
.offline-modal button.primary {
  background: #4caf50;
  color: #fff;
}
.offline-modal button.danger {
  background: #c62828;
  color: #fff;
}
.offline-modal button.secondary {
  background: #333;
  color: #ccc;
}
.offline-modal .stats {
  font-size: .85rem;
  color: #aaa;
  margin-top: 12px;
}
.offline-modal .close-btn {
  position: absolute;
  top: 12px;
  right: 14px;
  background: transparent;
  border: none;
  color: #888;
  font-size: 1.5rem;
  cursor: pointer;
}
.offline-modal-inner {
  position: relative;
}
`;

function injectCss() {
  if (document.getElementById('offline-modal-css')) return;
  const s = document.createElement('style');
  s.id = 'offline-modal-css';
  s.textContent = MODAL_CSS;
  document.head.appendChild(s);
}

function formatBytes(b) {
  const n = Number(b) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDuration(sec) {
  const s = Number(sec) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m} мин`;
}

let overlayEl = null;

export function openOfflineModal() {
  if (overlayEl) return;
  injectCss();

  const mgr = window.OfflineUI?.offlineManager;
  if (!mgr) {
    window.NotificationSystem?.error('OfflineManager не инициализирован');
    return;
  }

  overlayEl = document.createElement('div');
  overlayEl.className = 'offline-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'offline-modal';

  const inner = document.createElement('div');
  inner.className = 'offline-modal-inner';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = closeOfflineModal;
  inner.appendChild(closeBtn);

  const renderContent = async () => {
    const isOff = mgr.isOfflineMode();
    const cq = await mgr.getCacheQuality();
    const cloud = mgr.getCloudSettings();
    const cacheSize = await mgr.getCacheSizeBytes();
    const stats = await mgr.getGlobalStatistics();

    inner.innerHTML = '';
    inner.appendChild(closeBtn);

    const title = document.createElement('h2');
    const dot = document.createElement('span');
    dot.className = 'status-dot ' + (isOff ? 'on' : 'off');
    title.appendChild(dot);
    title.appendChild(document.createTextNode(' OFFLINE режим'));
    inner.appendChild(title);

    // Toggle
    const toggleSec = document.createElement('section');
    const toggleLabel = document.createElement('label');
    const toggleCb = document.createElement('input');
    toggleCb.type = 'checkbox';
    toggleCb.checked = isOff;
    toggleCb.onchange = () => {
      mgr.setOfflineMode(toggleCb.checked);
      renderContent();
    };
    toggleLabel.appendChild(toggleCb);
    toggleLabel.appendChild(document.createTextNode(' Включить OFFLINE режим'));
    toggleSec.appendChild(toggleLabel);
    inner.appendChild(toggleSec);

    // CQ
    const cqSec = document.createElement('section');
    cqSec.innerHTML = '<b>Качество кэширования (CQ)</b>';
    const cqRow = document.createElement('div');
    cqRow.className = 'row';
    const cqSelect = document.createElement('select');
    cqSelect.innerHTML = `<option value="hi" ${cq === 'hi' ? 'selected' : ''}>Hi (высокое)</option>
                          <option value="lo" ${cq === 'lo' ? 'selected' : ''}>Lo (низкое)</option>`;
    cqSelect.onchange = async () => {
      await mgr.setCacheQuality(cqSelect.value);
      renderContent();
    };
    cqRow.appendChild(cqSelect);
    cqSec.appendChild(cqRow);
    inner.appendChild(cqSec);

    // Cloud settings
    const cloudSec = document.createElement('section');
    cloudSec.innerHTML = '<b>Cloud ☁ настройки</b>';
    
    const nRow = document.createElement('div');
    nRow.className = 'row';
    nRow.innerHTML = '<span>Полных прослушиваний для Cloud:</span>';
    const nInput = document.createElement('input');
    nInput.type = 'number';
    nInput.min = '1';
    nInput.max = '50';
    nInput.value = cloud.n;
    nRow.appendChild(nInput);
    cloudSec.appendChild(nRow);

    const dRow = document.createElement('div');
    dRow.className = 'row';
    dRow.innerHTML = '<span>Дней хранения Cloud:</span>';
    const dInput = document.createElement('input');
    dInput.type = 'number';
    dInput.min = '1';
    dInput.max = '365';
    dInput.value = cloud.d;
    dRow.appendChild(dInput);
    cloudSec.appendChild(dRow);

    const saveCloudBtn = document.createElement('button');
    saveCloudBtn.className = 'secondary';
    saveCloudBtn.textContent = 'Сохранить Cloud';
    saveCloudBtn.onclick = () => {
      mgr.setCloudSettings({ n: Number(nInput.value), d: Number(dInput.value) });
      window.NotificationSystem?.success('Cloud настройки сохранены');
    };
    cloudSec.appendChild(saveCloudBtn);
    inner.appendChild(cloudSec);

    // Cache breakdown + downloads + updates (минимальная версия секций E/F/G)
    try {
      const breakdown = await mgr.getCacheBreakdown?.();
      const qst = mgr.getQueueStatus?.() || { downloadingKey: null, queued: 0, paused: false };

      const bfSec = document.createElement('section');
      bfSec.innerHTML = '<b>Кэш (breakdown) + загрузки</b>';

      if (breakdown) {
        bfSec.innerHTML += `
          <div style="margin-top:8px; font-size:12px; color:#aaa; line-height:1.4;">
            <div>pinned: <b>${formatBytes(breakdown.pinnedBytes)}</b></div>
            <div>cloud: <b>${formatBytes(breakdown.cloudBytes)}</b></div>
            <div>transient window: <b>${formatBytes(breakdown.transientWindowBytes)}</b></div>
            <div>transient extra: <b>${formatBytes(breakdown.transientExtraBytes)}</b></div>
            <div>transient unknown: <b>${formatBytes(breakdown.transientUnknownBytes)}</b></div>
            <div>audio total: <b>${formatBytes(breakdown.audioTotalBytes)}</b></div>
          </div>
        `;
      } else {
        bfSec.innerHTML += `<div class="stats">Breakdown пока недоступен</div>`;
      }

      bfSec.innerHTML += `
        <div style="margin-top:10px; font-size:12px; color:#aaa;">
          <div>Скачивается сейчас: <b>${qst.downloadingKey ? String(qst.downloadingKey) : '—'}</b></div>
          <div>В очереди: <b>${qst.queued || 0}</b></div>
        </div>
      `;

      const pauseBtn = document.createElement('button');
      pauseBtn.className = 'secondary';
      pauseBtn.textContent = qst.paused ? 'Возобновить очередь' : 'Пауза очереди';
      pauseBtn.onclick = () => {
        if (qst.paused) mgr.resumeQueue?.();
        else mgr.pauseQueue?.();
        renderContent();
      };
      bfSec.appendChild(pauseBtn);

      const updBtn = document.createElement('button');
      updBtn.className = 'secondary';
      updBtn.textContent = 'Обновить все файлы (pinned/cloud)';
      updBtn.onclick = async () => {
        const res = await mgr.enqueueUpdateAll?.();
        if (res?.ok) window.NotificationSystem?.info(`Updates: поставлено ${res.count} задач`);
        else window.NotificationSystem?.error('Не удалось запустить updates');
        renderContent();
      };
      bfSec.appendChild(updBtn);

      inner.appendChild(bfSec);
    } catch {}

    // 100% OFFLINE
    const offAllSec = document.createElement('section');
    offAllSec.innerHTML = '<b>100% OFFLINE</b><br><small>Скачать все треки текущего плейлиста</small>';
    const offAllBtn = document.createElement('button');
    offAllBtn.className = 'primary';
    offAllBtn.textContent = 'Скачать всё';
    offAllBtn.onclick = async () => {
      const tracks = window.playerCore?.getPlaylistSnapshot?.() || [];
      const uids = tracks.map(t => t?.uid).filter(Boolean);
      if (!uids.length) {
        window.NotificationSystem?.info('Плейлист пуст');
        return;
      }
      const res = await mgr.startFullOffline(uids);
      if (res.ok) {
        window.NotificationSystem?.info(`Запущена загрузка ${res.total} треков`);
      } else {
        window.NotificationSystem?.error('Не удалось запустить загрузку: ' + (res.reason || ''));
      }
    };
    offAllSec.appendChild(offAllBtn);
    inner.appendChild(offAllSec);

    // Clear cache
    const clearSec = document.createElement('section');
    const clearBtn = document.createElement('button');
    clearBtn.className = 'danger';
    clearBtn.textContent = 'Очистить весь кэш';
    clearBtn.onclick = async () => {
      if (!confirm('Удалить весь кэш?')) return;
      await mgr.clearAllCache();
      window.NotificationSystem?.success('Кэш очищен');
      renderContent();
    };
    clearSec.appendChild(clearBtn);
    inner.appendChild(clearSec);

    // Stats
    const statsSec = document.createElement('div');
    statsSec.className = 'stats';
    statsSec.innerHTML = `
      <div>Размер кэша: <b>${formatBytes(cacheSize)}</b></div>
      <div>Всего прослушано: <b>${formatDuration(stats?.totalListenSec || 0)}</b></div>
      <div>Полных прослушиваний: <b>${stats?.totalFullListens || 0}</b></div>
    `;
    inner.appendChild(statsSec);
  };

  renderContent();

  modal.appendChild(inner);
  overlayEl.appendChild(modal);
  document.body.appendChild(overlayEl);

  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) closeOfflineModal();
  });
}

export function closeOfflineModal() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}
