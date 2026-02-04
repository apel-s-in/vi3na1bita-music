// scripts/ui/offline-modal.js
import { ModalTemplates } from './modal-templates.js';
import { getOfflineManager } from '../offline/offline-manager.js';
import { Favorites } from '../core/favorites-manager.js';
import { getAllTracks } from '../app/track-registry.js';

const U = window.Utils;
let modalEl = null;

async function collectState() {
  const mgr = getOfflineManager();
  const [bd, mode, cq, foq, qst, cloud, isSpaceOk] = await Promise.all([
    mgr.computeCacheBreakdown(),
    Promise.resolve(mgr.getMode()),
    Promise.resolve(mgr.getCacheQuality()),
    Promise.resolve(mgr.getFullOfflineQuality()),
    Promise.resolve(mgr.getQueueStatus()),
    Promise.resolve(mgr.getCloudSettings()),
    mgr.isSpaceOk()
  ]);
  return { bd, mode, cq, foq, qst, cloud, isSpaceOk };
}

export async function openOfflineModal() {
  if (!window.Modals?.open) return;
  const state = await collectState();
  modalEl = window.Modals.open({
    title: 'OFFLINE',
    maxWidth: 500,
    bodyHtml: ModalTemplates.offlineBody(state),
    onClose: () => { modalEl = null; }
  });
  bindEvents(modalEl, state);
}

export async function openStatsModal() {
  const mgr = getOfflineManager();
  const rawData = await mgr.getGlobalStatistics();
  const tracks = rawData.tracks
    .filter(t => t.fullListens >= 3)
    .sort((a,b) => b.fullListens - a.fullListens)
    .map(t => {
       const meta = window.TrackRegistry?.getTrackByUid(t.uid);
       return { ...t, title: meta?.title || t.uid };
    });
  window.Modals.open({
    title: 'СТАТИСТИКА',
    maxWidth: 400,
    bodyHtml: ModalTemplates.statsBody({ ...rawData, tracks })
  });
}

function bindEvents(root, state) {
  const mgr = getOfflineManager();
  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => root.querySelectorAll(sel);
  const close = () => { try { root.remove(); } catch{} };

  $$('input[name="om-mode"]').forEach(el => {
    el.addEventListener('change', async () => {
      const newMode = el.value;
      if (newMode === state.mode) return;
      if (newMode !== 'R0' && !state.isSpaceOk) {
         el.checked = false;
         $(`input[value="${state.mode}"]`).checked = true;
         U.ui.toast('Недостаточно места для офлайн режимов', 'error');
         return;
      }
      await mgr.setMode(newMode);
      close();
      U.ui.toast(`Режим изменен на ${newMode}`);
    });
  });

  $('#om-save-cq')?.addEventListener('click', () => {
    const val = $('#om-cq').value;
    mgr.setCacheQuality(val);
    close();
    U.ui.toast(`Качество кэша: ${val.toUpperCase()}. Запущена фоновая замена.`);
  });

  $('#om-save-cloud')?.addEventListener('click', () => {
    const n = parseInt($('#om-cloud-n').value) || 5;
    const d = parseInt($('#om-cloud-d').value) || 31;
    localStorage.setItem('offline:cloudN:v1', n);
    localStorage.setItem('offline:cloudD:v1', d);
    U.ui.toast('Настройки облачка сохранены');
  });

  $('#om-clear-cache')?.addEventListener('click', async () => {
    if (!confirm('Вы уверены? Это удалит ВЕСЬ кэш.')) return;
    if (!confirm('Точно удалить все?')) return;
    await mgr.clearAllCache();
    close();
    U.ui.toast('Кэш полностью очищен');
    setTimeout(() => window.location.reload(), 1000);
  });

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
     close();
     U.ui.toast('Режим R3 выключен. Вы онлайн.');
  });

  $('#om-foq')?.addEventListener('change', (e) => {
    mgr.setFullOfflineQuality(e.target.value);
  });

  $('#om-est-full')?.addEventListener('click', () => {
    const uids = getSelection();
    const q = $('#om-foq').value;
    const sizePerTrack = q === 'hi' ? 5 : 2; 
    const totalMB = uids.length * sizePerTrack;
    $('#om-est-result').innerHTML = `Выбрано треков: <b>${uids.length}</b><br>Примерный размер: <b>~${totalMB} MB</b>`;
  });

  $('#om-start-full')?.addEventListener('click', async () => {
    if (!state.isSpaceOk) { alert('Недостаточно места.'); return; }
    const uids = getSelection();
    if (uids.length === 0) { alert('Список пуст.'); return; }
    const res = await mgr.startFullOffline(uids);
    close();
    if (res.ok) U.ui.toast(`Начата загрузка ${uids.length} треков.`);
    else U.ui.toast('Ошибка запуска загрузки', 'error');
  });
}
