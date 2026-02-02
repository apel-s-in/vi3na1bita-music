//=================================================
// FILE: /scripts/ui/offline-modal.js
// scripts/ui/offline-modal.js
// OFFLINE modal (ТЗ_НЬЮ): Секции A-I, 100% Offline, Updates, Stats.
// Clean UI layer that delegates logic to OfflineManager.

import { getNetPolicy, setNetPolicy } from '../offline/net-policy.js';
import { formatBytes, getNetworkStatusSafe } from './ui-utils.js';

let modalEl = null, unsub = null;

const qs = (s, el=modalEl) => el?.querySelector(s);
const txt = (s, v) => { const e = qs(s); if(e) e.textContent = String(v ?? ''); };
const val = (s) => qs(s)?.value;
const chk = (s) => !!qs(s)?.checked;

// Helpers
const clamp = (n, min, max) => Math.max(min, Math.min(max, parseInt(n)||min));
const fmtTime = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
};

// State Collection
async function collectState(mgr) {
  const [cq, breakdown, totalBytes, swInfo, stats] = await Promise.all([
    mgr.getCacheQuality(),
    mgr.getCacheBreakdown(),
    mgr.getCacheSizeBytes(),
    askSW('GET_CACHE_SIZE'),
    mgr.getGlobalStatistics()
  ]);

  const needs = mgr.getNeedsAggregates() || { upd: 0, rec: 0 };
  const qst = mgr.getQueueStatus();
  
  return {
    net: getNetworkStatusSafe(),
    isOff: mgr.isOfflineMode(),
    cq,
    cloud: mgr.getCloudSettings(),
    policy: getNetPolicy(),
    limit: getLimitSettings(),
    breakdown,
    totalBytes,
    swBytes: swInfo?.size || 0,
    qst,
    needs,
    statsTotal: fmtTime(stats?.totalSeconds || stats?.totalListenSec || 0),
    albums: (window.albumsIndex || []).filter(a => a.key && !a.key.startsWith('__'))
  };
}

// UI Update
function updateUI(s) {
  if (!modalEl) return;

  txt('#om-net-label', `${s.net.online ? 'online' : 'offline'} (${s.net.kind})`);
  txt('#om-cq-label', s.cq.toUpperCase());
  
  const setChk = (id, v) => { const e = qs(id); if(e) e.checked = v; };
  setChk('#om-offline-mode', s.isOff);
  
  const setVal = (id, v) => { const e = qs(id); if(e && e.value !== String(v)) e.value = v; };
  setVal('#om-cq', s.cq);
  setVal('#om-cloud-n', s.cloud.n);
  setVal('#om-cloud-d', s.cloud.d);
  
  setChk('#om-pol-wifiOnly', s.policy.wifiOnly);
  setChk('#om-pol-allowMobile', s.policy.allowMobile);
  setChk('#om-pol-confirmOnMobile', s.policy.confirmOnMobile);
  setChk('#om-pol-saveDataBlock', s.policy.saveDataBlock);

  setVal('#om-limit-mode', s.limit.mode);
  setVal('#om-limit-mb', s.limit.mb);
  qs('#om-limit-mb').disabled = s.limit.mode !== 'manual';

  // Breakdown
  txt('#om-e-audio-total', formatBytes(s.totalBytes));
  txt('#om-e-sw-total', formatBytes(s.swBytes));
  if (s.breakdown) {
    txt('#om-e-pinned', formatBytes(s.breakdown.pinnedBytes));
    txt('#om-e-cloud', formatBytes(s.breakdown.cloudBytes));
    txt('#om-e-tw', formatBytes(s.breakdown.transientWindowBytes));
    txt('#om-e-te', formatBytes(s.breakdown.transientExtraBytes));
    txt('#om-e-tu', formatBytes(s.breakdown.transientUnknownBytes));
  }

  // Queue & Updates
  txt('#om-f-downloading', s.qst.downloadingKey || '—');
  txt('#om-f-queued', s.qst.queued);
  txt('#om-queue-toggle', s.qst.paused ? 'Возобновить' : 'Пауза');
  
  txt('#om-g-needsUpdate', s.needs.upd);
  txt('#om-g-needsReCache', s.needs.rec);
  
  txt('#om-stats-total', s.statsTotal);

  const mode = val('#om-full-mode');
  qs('#om-albums-box').style.display = (mode === 'albums') ? 'block' : 'none';
}

// Logic
export async function openOfflineModal() {
  const mgr = window.OfflineUI?.offlineManager;
  if (!mgr) return;

  closeOfflineModal();
  
  const tpl = window.ModalTemplates?.offlineBody;
  if (!tpl) return;

  // Initial state render
  const state = await collectState(mgr);
  
  modalEl = window.Modals.open({
    title: 'OFFLINE',
    maxWidth: 560,
    bodyHtml: tpl(state),
    onClose: closeOfflineModal
  });

  // Bind Events
  modalEl.addEventListener('click', (e) => handleClicks(e, mgr));
  modalEl.addEventListener('change', (e) => handleChanges(e, mgr));

  // Live updates
  updateUI(state);
  const rafUpdate = () => requestAnimationFrame(async () => {
    if(!modalEl) return;
    updateUI(await collectState(mgr));
  });
  
  unsub = mgr.on('progress', rafUpdate);
}

export function closeOfflineModal() {
  if (unsub) { unsub(); unsub = null; }
  if (modalEl) { modalEl.remove(); modalEl = null; }
}

// Handlers
async function handleClicks(e, mgr) {
  const id = e.target.id;
  if (!id) return;
  const notify = window.NotificationSystem;

  if (id === 'om-cq-save') {
    await mgr.setCacheQuality(val('#om-cq'));
    notify.success('CQ сохранено');
  }
  else if (id === 'om-cloud-save') {
    mgr.setCloudSettings({ n: clamp(val('#om-cloud-n'), 1, 50), d: clamp(val('#om-cloud-d'), 1, 365) });
    notify.success('Cloud сохранён');
  }
  else if (id === 'om-pol-save') {
    setNetPolicy({
      wifiOnly: chk('#om-pol-wifiOnly'),
      allowMobile: chk('#om-pol-allowMobile'),
      confirmOnMobile: chk('#om-pol-confirmOnMobile'),
      saveDataBlock: chk('#om-pol-saveDataBlock')
    });
    notify.success('Policy сохранена');
  }
  else if (id === 'om-limit-save') {
    saveLimitSettings(val('#om-limit-mode'), val('#om-limit-mb'));
    notify.success('Лимит сохранён');
  }
  else if (id === 'om-queue-toggle') {
    const p = mgr.getQueueStatus().paused;
    p ? mgr.resumeQueue() : mgr.pauseQueue();
  }
  else if (id === 'om-upd-all') {
    const r = await mgr.enqueueUpdateAll();
    notify.info(`Updates: ${r.count}`);
  }
  else if (id === 'om-recache-all') {
    const r = await mgr.enqueueReCacheAllByCQ({ userInitiated: true });
    notify.info(`Re-cache: ${r.count}`);
  }
  else if (id === 'om-clear-all') {
    if(confirm('Удалить ВЕСЬ кэш?')) await mgr.clearAllCache();
  }
  else if (id === 'om-full-est' || id === 'om-full-start') {
    const isStart = id === 'om-full-start';
    if (isStart && !confirm('Скачать выбранное?')) return;
    
    txt('#om-full-out', 'Ждите...');
    
    // Preload tracks
    await preloadAllAlbumsTrackIndex(); 

    const sel = getSelection(modalEl);
    const est = await mgr.computeSizeEstimate(sel);
    
    if (!est.ok) {
      txt('#om-full-out', 'Ошибка оценки');
      return;
    }
    
    txt('#om-full-out', `${est.totalMB.toFixed(1)} MB / ${est.count} tracks`);
    
    if (isStart) {
      if (est.totalMB > 500 && !(await mgr.canGuaranteeStorageForMB(est.totalMB)).ok) {
        notify.error('Мало места!');
        return;
      }
      
      // Warmup assets
      const urls = new Set(['./index.html', './styles/main.css', './img/logo.png']);
      await askSW('WARM_OFFLINE_SHELL', { urls: [...urls] });
      
      const r = await mgr.startFullOffline(est.uids);
      notify.success(`Старт: ${r.total} треков`);
    }
  }
}

function handleChanges(e, mgr) {
  const id = e.target.id;
  if (id === 'om-offline-mode') mgr.setOfflineMode(e.target.checked);
  if (id === 'om-limit-mode') qs('#om-limit-mb').disabled = e.target.value !== 'manual';
  if (id === 'om-full-mode') qs('#om-albums-box').style.display = e.target.value === 'albums' ? 'block' : 'none';
}

// Helpers
function getLimitSettings() {
  return {
    mode: localStorage.getItem('offline:cacheLimitMode:v1') || 'auto',
    mb: parseInt(localStorage.getItem('offline:cacheLimitMB:v1')) || 500
  };
}

function saveLimitSettings(mode, mb) {
  localStorage.setItem('offline:cacheLimitMode:v1', mode);
  localStorage.setItem('offline:cacheLimitMB:v1', clamp(mb, 50, 5000));
}

function getSelection(el) {
  const mode = val('#om-full-mode');
  if (mode === 'albums') {
    const keys = Array.from(el.querySelectorAll('.om-alb:checked')).map(i => i.dataset.k);
    return { mode: 'albums', albumKeys: keys };
  }
  return { mode: 'favorites' };
}

async function askSW(type, payload) {
  if (!navigator.serviceWorker?.controller) return null;
  return new Promise(r => {
    const ch = new MessageChannel();
    ch.port1.onmessage = e => r(e.data);
    navigator.serviceWorker.controller.postMessage({ type, payload }, [ch.port2]);
    setTimeout(() => r(null), 1000);
  });
}

// Preload tracks helper (essential for 100% offline)
export async function preloadAllAlbumsTrackIndex() {
  const idx = window.albumsIndex || [];
  const reg = window.TrackRegistry;
  if (!reg) return;

  for (const a of idx) {
    if (a.key?.startsWith('__')) continue;
    try {
      const res = await fetch(a.base + (a.base.endsWith('/')?'':'/') + 'config.json');
      if (!res.ok) continue;
      const cfg = await res.json();
      (cfg.tracks || []).forEach(t => {
        if (t.uid) reg.registerTrack({ ...t, sourceAlbum: a.key });
      });
    } catch {}
  }
}
