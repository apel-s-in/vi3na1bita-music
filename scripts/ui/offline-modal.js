// scripts/ui/offline-modal.js

import { ModalTemplates } from './modal-templates.js';
import { getOfflineManager } from '../offline/offline-manager.js';
import { Favorites } from '../core/favorites-manager.js';
import { getAllTracks } from '../app/track-registry.js';

const U = window.Utils;

let modalEl = null;

/**
 * Сбор всех данных для рендера модалки
 */
async function collectState() {
  const mgr = getOfflineManager();
  
  const [bd, mode, cq, foq, qst, cloud, isSpaceOk] = await Promise.all([
    mgr.computeCacheBreakdown(),
    Promise.resolve(mgr.getMode()),
    Promise.resolve(mgr.getCacheQuality()),
    Promise.resolve(mgr.getFullOfflineQuality()),
    Promise.resolve(mgr.getQueueStatus()),
    Promise.resolve(mgr.getCloudSettings ? mgr.getCloudSettings() : {n:5, d:31}), // fallback if method missing
    mgr._checkSpaceGuarantee() // access internal or public method
  ]);

  return { bd, mode, cq, foq, qst, cloud, isSpaceOk };
}

/**
 * Открытие модалки OFFLINE
 */
export async function openOfflineModal() {
  if (!window.Modals?.open) {
    console.error('Modal system not ready');
    return;
  }

  // Показываем спиннер, пока собираем данные (IndexedDB async)
  // Но так как Modals.open синхронный в базовой реализации, просто ждем
  const state = await collectState();

  modalEl = window.Modals.open({
    title: 'OFFLINE',
    maxWidth: 500,
    bodyHtml: ModalTemplates.offlineBody(state),
    onClose: () => { modalEl = null; }
  });

  bindEvents(modalEl, state);
}

/**
 * Открытие модалки Статистики (Global Stats)
 */
export async function openStatsModal() {
  const mgr = getOfflineManager();
  const rawData = await mgr.getGlobalStatistics(); // { tracks:[], totalSeconds... }
  
  // Filter for UI: >3 listens, sort by listens desc
  const tracks = rawData.tracks
    .filter(t => t.fullListens >= 3)
    .sort((a,b) => b.fullListens - a.fullListens)
    .map(t => {
       // Resolve title
       const meta = window.TrackRegistry?.getTrackByUid(t.uid);
       return { ...t, title: meta?.title || t.uid };
    });

  const uiData = { ...rawData, tracks };

  window.Modals.open({
    title: 'СТАТИСТИКА',
    maxWidth: 400,
    bodyHtml: ModalTemplates.statsBody(uiData)
  });
}

function bindEvents(root, state) {
  const mgr = getOfflineManager();
  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => root.querySelectorAll(sel);

  // --- A) Modes ---
  $$('input[name="om-mode"]').forEach(el => {
    el.addEventListener('change', async () => {
      const newMode = el.value;
      if (newMode === state.mode) return;
      
      // Блокировка переключения, если мало места
      if (newMode !== 'R0' && !state.isSpaceOk) {
         el.checked = false;
         $(`input[value="${state.mode}"]`).checked = true; // вернуть назад
         U.ui.toast('Недостаточно места для офлайн режимов', 'error');
         return;
      }
      
      await mgr.setMode(newMode);
      window.Modals.close(); // Закрываем, чтобы обновить состояние UI (кнопки плеера и т.д.)
      U.ui.toast(`Режим изменен на ${newMode}`);
    });
  });

  // --- B) Cache Quality ---
  $('#om-save-cq')?.addEventListener('click', () => {
    const val = $('#om-cq').value;
    mgr.setCacheQuality(val);
    window.Modals.close();
    U.ui.toast(`Качество кэша: ${val.toUpperCase()}. Запущена фоновая замена.`);
  });

  // --- C) Cloud Settings ---
  $('#om-save-cloud')?.addEventListener('click', () => {
    const n = parseInt($('#om-cloud-n').value) || 5;
    const d = parseInt($('#om-cloud-d').value) || 31;
    // Сохраняем напрямую в LS, так как в менеджере мб нет сеттера
    localStorage.setItem('offline:cloudN:v1', n);
    localStorage.setItem('offline:cloudD:v1', d);
    U.ui.toast('Настройки облачка сохранены');
  });

  // --- E) Clear Cache ---
  $('#om-clear-cache')?.addEventListener('click', async () => {
    if (!confirm('Вы уверены? Это удалит ВЕСЬ кэш (включая Pinned и Cloud).')) return;
    if (!confirm('Точно удалить все?')) return;
    
    await mgr.clearAllCache(); // Метод должен быть в OfflineManager (clearAllStores wrapper)
    window.Modals.close();
    U.ui.toast('Кэш полностью очищен');
    setTimeout(() => window.location.reload(), 1000); // Reload для сброса стейта плеера
  });

  // --- I) 100% Offline (R3) Logic ---
  
  // Helpers for Selection
  const getSelection = () => {
    const type = $('#om-full-target').value;
    if (type === 'fav') {
      return Favorites.getSnapshot().filter(x => !x.inactiveAt).map(x => x.uid);
    } else {
      return getAllTracks().map(x => x.uid);
    }
  };

  $('#om-stop-r3')?.addEventListener('click', () => {
     mgr.setMode('R0');
     window.Modals.close();
     U.ui.toast('Режим R3 выключен. Вы онлайн.');
  });

  $('#om-foq')?.addEventListener('change', (e) => {
    mgr.setFullOfflineQuality(e.target.value);
  });

  $('#om-est-full')?.addEventListener('click', () => {
    const uids = getSelection();
    const q = $('#om-foq').value;
    // Грубая оценка: 5MB Hi, 2MB Lo per track
    const sizePerTrack = q === 'hi' ? 5 : 2; 
    const totalMB = uids.length * sizePerTrack;
    
    $('#om-est-result').innerHTML = `
      Выбрано треков: <b>${uids.length}</b><br>
      Примерный размер: <b>~${totalMB} MB</b>
    `;
  });

  $('#om-start-full')?.addEventListener('click', async () => {
    if (!state.isSpaceOk) {
      alert('Недостаточно места (нужно мин. 60 МБ).');
      return;
    }

    const uids = getSelection();
    if (uids.length === 0) {
      alert('Список пуст.');
      return;
    }

    // Двухфазное включение: Сначала ставим задачу
    const res = await mgr.startFullOffline(uids);
    
    window.Modals.close();
    if (res.ok) {
      U.ui.toast(`Начата загрузка ${uids.length} треков. Режим R3 предложится после завершения.`);
    } else {
      U.ui.toast('Ошибка запуска загрузки', 'error');
    }
  });
}
