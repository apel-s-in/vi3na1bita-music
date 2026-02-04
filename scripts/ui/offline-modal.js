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
         U.ui.toast('Недостаточно места', 'error');
         return;
      }
      await mgr.setMode(newMode);
      close();
      U.ui.toast(`Режим: ${newMode}`);
    });
  });

  $('#om-save-cq')?.addEventListener('click', () => {
    mgr.setCacheQuality($('#om-cq').value);
    close();
    U.ui.toast('Качество кэша обновлено');
  });

  $('#om-clear-cache')?.addEventListener('click', async () => {
    if (!confirm('Удалить ВЕСЬ кэш?')) return;
    await mgr.clearAllCache();
    close();
    U.ui.toast('Кэш очищен');
    setTimeout(() => window.location.reload(), 1000);
  });

  // --- R3 Logic ---
  const getSelectedUids = () => {
    const uids = new Set();
    // 1. Favorites
    if ($('#om-full-fav')?.checked) {
       Favorites.getSnapshot().filter(x => !x.inactiveAt).forEach(x => uids.add(x.uid));
    }
    // 2. Albums
    $$('.full-album-check:checked').forEach(cb => {
       const key = cb.value;
       getAllTracks().filter(t => t.sourceAlbum === key).forEach(t => uids.add(t.uid));
    });
    return Array.from(uids);
  };

  $('#om-stop-r3')?.addEventListener('click', () => {
     mgr.setMode('R0');
     close();
     U.ui.toast('R3 выключен. Онлайн.');
  });

  $('#om-foq')?.addEventListener('change', (e) => mgr.setFullOfflineQuality(e.target.value));

  $('#om-est-full')?.addEventListener('click', () => {
    const list = getSelectedUids();
    const mb = list.length * ($('#om-foq').value === 'hi' ? 6 : 2.5); // грубая оценка
    $('#om-est-result').innerHTML = `Треков: <b>${list.length}</b><br>~${mb.toFixed(0)} MB`;
  });

  $('#om-start-full')?.addEventListener('click', async () => {
    if (!state.isSpaceOk) { alert('Мало места!'); return; }
    const list = getSelectedUids();
    if (!list.length) { alert('Ничего не выбрано'); return; }
    
    // Start task
    const res = await mgr.startFullOffline(list);
    close();
    
    if (res.ok) {
        U.ui.toast(`Загрузка ${list.length} треков...`);
        // TODO: Here we should subscribe to progress and prompt when done
        // For v1.0 MVP, we just start downloading. 
        // The user must manually enable R3 later or we show a prompt via NotificationSystem later.
    }
  });
}
