//=================================================
// FILE: /scripts/ui/offline-modal.js
import { getNetPolicy, setNetPolicy } from '../offline/net-policy.js';

const U = window.Utils;
const LS = { LIMIT_MODE: 'offline:cacheLimitMode:v1', LIMIT_MB: 'offline:cacheLimitMB:v1' };
const $ = (sel) => modalEl?.querySelector(sel);
const clamp = (n, min, max) => U.math.clamp(n, min, max);
const q = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');

const swAsk = async (type, payload, t = 1200) => {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg?.active) return null;
    return new Promise(r => {
      const ch = new MessageChannel(), tm = setTimeout(() => r(null), t);
      ch.port1.onmessage = e => { clearTimeout(tm); r(e.data); };
      reg.active.postMessage({ type, payload }, [ch.port2]);
    });
  } catch { return null; }
};

const getLimits = (w, m, v) => {
  if (w) { try { localStorage.setItem(LS.LIMIT_MODE, m); localStorage.setItem(LS.LIMIT_MB, v); } catch {} }
  else { m = localStorage.getItem(LS.LIMIT_MODE); v = localStorage.getItem(LS.LIMIT_MB); }
  return { mode: m === 'manual' ? 'manual' : 'auto', mb: clamp(v || 500, 50, 5000) };
};

export async function preloadAllAlbumsTrackIndex() {
  const idx = window.albumsIndex || [], reg = window.TrackRegistry;
  if (!idx.length || !reg?.registerTrack) return false;
  await Promise.all(idx.filter(a => a.key && !a.key.startsWith('__')).map(async (a) => {
    try {
      const base = a.base.replace(/\/$/, '') + '/';
      const cKey = `offline:cfg:v1:${a.key}`;
      let cfg = JSON.parse(sessionStorage.getItem(cKey) || 'null');
      if (!cfg) {
        const r = await fetch(base + 'config.json', { cache: 'no-cache' });
        if (r.ok) { cfg = await r.json(); try { sessionStorage.setItem(cKey, JSON.stringify(cfg)); } catch {} }
      }
      const join = (u) => u ? new URL(u, base).toString() : null;
      (cfg?.tracks || []).forEach(t => {
        if(t.uid) reg.registerTrack({
          uid: String(t.uid).trim(), title: t.title, sourceAlbum: a.key,
          audio: join(t.audio), audio_low: join(t.audio_low),
          size: t.size, size_low: t.size_low,
          lyrics: join(t.lyrics), fulltext: join(t.fulltext)
        });
      });
    } catch {}
  }));
  return true;
}

const BINDINGS = {
  'om-net-label': s => `${s.net.online ? 'online' : 'offline'} (${s.net.kind})`,
  'om-cq-label': s => s.cq,
  'om-e-audio-total': s => U.fmt.bytes(s.cacheSizeBytes),
  'om-e-sw-total': s => U.fmt.bytes(s.swSize.size),
  'om-e-pinned': s => U.fmt.bytes(s.bd?.pinnedBytes),
  'om-e-cloud': s => U.fmt.bytes(s.bd?.cloudBytes),
  'om-e-tw': s => U.fmt.bytes(s.bd?.transientWindowBytes),
  'om-e-te': s => U.fmt.bytes(s.bd?.transientExtraBytes),
  'om-e-tu': s => U.fmt.bytes(s.bd?.transientUnknownBytes),
  'om-f-downloading': s => s.qst.downloadingKey || '—',
  'om-f-queued': s => s.qst.queued,
  'om-queue-toggle': s => s.qst.paused ? 'Возобновить' : 'Пауза',
  'om-g-needsUpdate': s => s.needs.u,
  'om-g-needsReCache': s => s.needs.r,
  'om-stats-total': s => U.fmt.durationHuman(s.totalSec),
  'om-full-out': s => s.est ? `Оценка: ${s.est.totalMB.toFixed(1)} MB · треков: ${s.est.count} · CQ=${s.est.cq}` : (s.estErr ? `Ошибка: ${s.estErr}` : 'Оценка: —'),
  'om-offline-mode': [s => s.isOff, 'checked'],
  'om-cq': s => s.cq,
  'om-cloud-n': s => s.cloud.n,
  'om-cloud-d': s => s.cloud.d,
  'om-pol-wifiOnly': [s => s.pol.wifiOnly, 'checked'],
  'om-pol-allowMobile': [s => s.pol.allowMobile, 'checked'],
  'om-pol-confirmOnMobile': [s => s.pol.confirmOnMobile, 'checked'],
  'om-pol-saveDataBlock': [s => s.pol.saveDataBlock, 'checked'],
  'om-limit-mode': s => s.lim.mode,
  'om-limit-mb': s => s.lim.mb,
  'om-limit-mb__disabled': s => s.lim.mode !== 'manual',
  'om-albums-box__display': s => s.selMode === 'albums' ? '' : 'none'
};

const ACTIONS = {
  'om-offline-mode': (m, t) => m.setOfflineMode(t.checked),
  'om-cq-save': async (m) => { await m.setCacheQuality($('#om-cq').value); U.ui.toast('CQ сохранено'); },
  'om-cloud-save': (m) => {
    m.setCloudSettings({ n: clamp($('#om-cloud-n').value, 1, 50), d: clamp($('#om-cloud-d').value, 1, 365) });
    U.ui.toast('Cloud настройки сохранены');
  },
  'om-pol-save': () => {
    setNetPolicy({
      wifiOnly: $('#om-pol-wifiOnly').checked, allowMobile: $('#om-pol-allowMobile').checked,
      confirmOnMobile: $('#om-pol-confirmOnMobile').checked, saveDataBlock: $('#om-pol-saveDataBlock').checked
    });
    U.ui.toast('Policy сохранена');
  },
  'om-limit-save': () => { getLimits(1, $('#om-limit-mode').value, $('#om-limit-mb').value); U.ui.toast('Лимит сохранён'); },
  'om-queue-toggle': (m) => m.getQueueStatus()?.paused ? m.resumeQueue() : m.pauseQueue(),
  'om-upd-all': async (m) => { const r = await m.enqueueUpdateAll(); U.ui.toast(r?.ok ? `Updates: ${r.count}` : 'Ошибка', r?.ok?'success':'error'); },
  'om-recache-all': async (m) => { const r = await m.enqueueReCacheAllByCQ({userInitiated:true}); U.ui.toast(r?.ok ? `Re-cache: ${r.count}` : 'Ошибка', r?.ok?'success':'error'); },
  'om-clear-all': async (m) => {
    if(confirm('Очистить весь кэш?') && confirm('Точно?')) { await m.clearAllCache(); U.ui.toast('Кэш очищен', 'success'); }
  },
  'om-full-est': async (m) => {
    $('#om-full-out').textContent = 'Оценка...';
    await preloadAllAlbumsTrackIndex();
    const est = await m.computeSizeEstimate(getSelection());
    updateUI({ ...lastState, est, estErr: est?.ok ? null : est?.reason });
  },
  'om-full-start': async (m) => {
    const net = U.getNetworkStatusSafe();
    if(!net.online) return U.ui.toast('Нет сети', 'warning');
    if(net.kind === 'unknown' && !confirm('Тип сети неизвестен. Продолжить?')) return;
    
    await preloadAllAlbumsTrackIndex();
    const est = await m.computeSizeEstimate(getSelection());
    if(!est?.ok || !est.uids.length) return U.ui.toast('Набор пуст или ошибка', 'error');
    
    const guar = await m.canGuaranteeStorageForMB?.(est.totalMB);
    if(!guar?.ok) return U.ui.toast('Нет места в хранилище', 'error');

    const urls = new Set(['./','./index.html','./manifest.json','./styles/main.css','./scripts/app.js','./src/PlayerCore.js']);
    est.uids.forEach(u => { const t=window.TrackRegistry.getTrackByUid(u); if(t){ if(t.lyrics) urls.add(t.lyrics); if(t.fulltext) urls.add(t.fulltext); } });
    swAsk('WARM_OFFLINE_SHELL', { urls: [...urls] }, 5000);

    const r = await m.startFullOffline(est.uids);
    U.ui.toast(r?.ok ? `100% OFFLINE: ${r.total} треков` : 'Ошибка запуска', r?.ok?'success':'error');
  },
  'om-limit-mode': () => updateUI(lastState),
  'om-full-mode': () => updateUI(lastState)
};

let modalEl, unsub, lastState = {};

function getSelection() {
  const mode = $('#om-full-mode').value;
  if (mode === 'favorites') return { mode: 'favorites' };
  return { mode: 'albums', albumKeys: Array.from(modalEl.querySelectorAll('.om-alb:checked')).map(x => x.dataset.k) };
}

async function collectState(mgr) {
  const [cq, bd, sz, sw, gs, needs] = await Promise.all([
    mgr.getCacheQuality(), mgr.getCacheBreakdown(), mgr.getCacheSizeBytes(),
    swAsk('GET_CACHE_SIZE'), mgr.getGlobalStatistics(), mgr.refreshNeedsAggregates()
  ]);
  const a = mgr.getNeedsAggregates() || {};
  
  lastState = {
    net: U.getNetworkStatusSafe(),
    isOff: !!mgr.isOfflineMode(),
    cq: q(cq),
    cloud: mgr.getCloudSettings(),
    pol: getNetPolicy(),
    lim: { ...getLimits(), mode: $('#om-limit-mode')?.value || getLimits().mode },
    bd, cacheSizeBytes: sz || 0, swSize: sw || { size: 0 },
    qst: mgr.getQueueStatus(),
    needs: { u: a.needsUpdate||0, r: a.needsReCache||0 },
    totalSec: gs?.totalSeconds || gs?.totalListenSec || 0,
    selMode: $('#om-full-mode')?.value || 'favorites',
    est: lastState.est, estErr: lastState.estErr
  };
  return lastState;
}

function updateUI(s) {
  if (!modalEl || !s) return;
  Object.entries(BINDINGS).forEach(([id, bind]) => {
    let el;
    if (id.endsWith('__disabled')) { el = $(`#${id.replace('__disabled','')}`); if(el) el.disabled = bind(s); }
    else if (id.endsWith('__display')) { el = $(`#${id.replace('__display','')}`); if(el) el.style.display = bind(s); }
    else {
      el = $(`#${id}`);
      if (!el) return;
      if (Array.isArray(bind)) el[bind[1]] = bind[0](s);
      else if (el.tagName === 'INPUT' || el.tagName === 'SELECT') { if (el !== document.activeElement) el.value = bind(s); }
      else el.textContent = bind(s);
    }
  });
}

export async function openOfflineModal() {
  const mgr = window.OfflineUI?.offlineManager;
  if (!mgr || !window.Modals?.open) return;
  closeOfflineModal();

  const albums = (window.albumsIndex||[]).filter(a => !a.key.startsWith('__'));
  const bodyState = { ...await collectState(mgr), albums };
  
  modalEl = window.Modals.open({
    title: 'OFFLINE', maxWidth: 560,
    bodyHtml: window.Modals.offlineBody ? window.Modals.offlineBody(bodyState) : 'Loading...',
    onClose: closeOfflineModal
  });

  modalEl.addEventListener('click', e => { const fn = ACTIONS[e.target.id]; if(fn) fn(mgr, e.target); });
  modalEl.addEventListener('change', e => { const fn = ACTIONS[e.target.id]; if(fn) fn(mgr, e.target); });

  const loop = async () => { try { updateUI(await collectState(mgr)); } catch {} };
  unsub = mgr.on('progress', U.func.debounceFrame(loop));
  loop();
}

export function closeOfflineModal() {
  if (unsub) unsub();
  modalEl?.remove();
  modalEl = null;
}
