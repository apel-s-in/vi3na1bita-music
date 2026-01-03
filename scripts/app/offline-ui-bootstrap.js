// scripts/app/offline-ui-bootstrap.js
// Поднимает Offline UI и соединяет его с OfflineManager/Updater.

import { OfflineManager } from '../offline/offline-manager.js';
import { Updater } from '../offline/updater.js';
import { OfflineModal } from '../offline/offline-modal.js';
import { TrackRegistry, getTrackByUid, getAllUids } from './track-registry.js';
import * as DB from '../offline/cache-db.js';

// Вспомогательный тостер. В проекте есть scripts/ui/notify.js — при интеграции замените на него.
function notify(msg, kind = 'info') {
  try {
    if (window.Notify && typeof window.Notify.toast === 'function') {
      window.Notify.toast(msg, { kind, duration: kind === 'info' ? 3000 : 5000 });
      return;
    }
  } catch {}
  console.log(`[${kind}] ${msg}`);
}

// Downloader использует встроенный в OfflineManager fetch+persist.
// Здесь — просто прокидываем ссылки.
const offlineManager = new OfflineManager({
  downloader: null, // не требуется, т.к. OfflineManager сам реализует _downloadAndPersist
  getTrackByUid,
});

// Индикатор “!” у OFFLINE
let offlineBtn = null;
function setBang(on) {
  if (!offlineBtn) offlineBtn = document.querySelector('#offline-btn');
  if (!offlineBtn) return;
  offlineBtn.classList.toggle('has-bang', !!on);
}

const updater = new Updater({
  getAllUids,
  getTrackByUid,
  onBadge: ({ bang }) => setBang(bang),
});

// Подписки на события OfflineManager (прогресс/тосты/ошибки)
offlineManager.on('toast', (t) => notify(t.text, t.type || 'info'));
offlineManager.on('error', (e) => notify('Ошибка загрузки офлайн: ' + (e?.error?.message || ''), 'error'));

// Модалка OFFLINE
let modal = null;
function openOfflineModal() {
  if (!modal) {
    modal = new OfflineModal({
      utils: window.Utils, // Utils.createModal есть в проекте
      offlineManager,
      updater,
      getBreakdown: async () => {
        // Грубая оценка распределения (v1.0) — можно улучшить позже.
        const { usage = 0 } = await DB.estimateUsage();
        return { pinned: 0, cloud: 0, transient: 0, other: usage };
      },
    });
  }
  modal.open();
}

// Привязка к кнопке OFFLINE
export function attachOfflineUI() {
  const btn = document.querySelector('#offline-btn');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    openOfflineModal();
  });

  // Первоначальная проверка на “!”
  // Пример: при смене CQ после загрузки — будет needsReCache.
  setBang(false);
}

// Экспортируем для явного вызова из app bootstrap
export const OfflineUI = { attachOfflineUI, offlineManager, updater };
