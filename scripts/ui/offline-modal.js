// scripts/ui/offline-modal.js
import { ModalTemplates } from './modal-templates.js';
import { getOfflineManager } from '../offline/offline-manager.js';

const U = window.Utils;
const $ = (sel) => document.querySelector(sel); // Helper inside modal context

let modalEl = null;

async function collectState() {
  const mgr = getOfflineManager();
  const [bd, mode, cq, foq, qst, cloud] = await Promise.all([
      mgr.getCacheBreakdown(),
      mgr.getMode(),
      mgr.getCacheQuality(),
      mgr.getFullOfflineQuality(),
      mgr.getQueueStatus(),
      mgr.getCloudSettings()
  ]);
  return { 
      bd, mode, cq, foq, qst, cloud,
      isSpaceOk: (await mgr._checkSpaceGuarantee()) 
  };
}

export async function openOfflineModal() {
  if (!window.Modals?.open) return;
  const state = await collectState();
  
  modalEl = window.Modals.open({
      title: 'OFFLINE',
      maxWidth: 500,
      bodyHtml: ModalTemplates.offlineBody(state)
  });
  
  bindEvents(modalEl);
}

function bindEvents(root) {
  const mgr = getOfflineManager();
  
  // Modes
  root.querySelectorAll('input[name="om-mode"]').forEach(el => {
      el.addEventListener('change', () => mgr.setMode(el.value));
  });
  
  // CQ Save
  root.querySelector('#om-cq-save')?.addEventListener('click', () => {
      const v = root.querySelector('#om-cq').value;
      mgr.setCacheQuality(v);
      U.ui.toast('Качество кэша обновлено');
  });
  
  // Full Offline Start
  root.querySelector('#om-full-start')?.addEventListener('click', async () => {
      const type = root.querySelector('#om-full-type').value;
      const foq = root.querySelector('#om-foq').value;
      mgr.setFullOfflineQuality(foq);
      
      // Select UIDs based on type
      let uids = [];
      if (type === 'fav') {
          const { Favorites } = await import('../core/favorites-manager.js');
          uids = Favorites.getSnapshot().filter(i => !i.inactiveAt).map(i => i.uid);
      } else {
          // All tracks logic placeholder
          const reg = window.TrackRegistry.getAllTracks();
          uids = reg.map(t => t.uid);
      }
      
      const res = await mgr.startFullOffline(uids);
      if (res.ok) {
          U.ui.toast(`Загрузка ${res.total} треков началась. Режим R3 включится после завершения.`);
          // Logic to switch to R3 automatically or prompt user handled in manager events
      }
  });
}
