// scripts/ui/offline-modal.js
// OFFLINE modal (ТЗ_НЬЮ) — секции A–I + 100% OFFLINE + updates/re-cache + breakdown.
// Важно: модалка не трогает воспроизведение (no stop/play/seek/volume).

import { getNetPolicy, setNetPolicy } from '../offline/net-policy.js';
import { formatBytes, getNetworkStatusSafe } from './ui-utils.js';

const LS_LIMIT_MODE = 'offline:cacheLimitMode:v1'; // 'auto'|'manual'
const LS_LIMIT_MB = 'offline:cacheLimitMB:v1';

const MB = 1024 * 1024;

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const toInt = (v, d = 0) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
};
const q = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');

const fmtListen = (sec) => {
  const s = Math.max(0, Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
};

const readLimit = () => {
  try {
    const mode = localStorage.getItem(LS_LIMIT_MODE) === 'manual' ? 'manual' : 'auto';
    const mb = clamp(Number(localStorage.getItem(LS_LIMIT_MB) || 500) || 500, 50, 5000);
    return { mode, mb };
  } catch {
    return { mode: 'auto', mb: 500 };
  }
};

const writeLimit = (mode, mb) => {
  const m = mode === 'manual' ? 'manual' : 'auto';
  const v = clamp(Number(mb) || 500, 50, 5000);
  try {
    localStorage.setItem(LS_LIMIT_MODE, m);
    localStorage.setItem(LS_LIMIT_MB, String(v));
  } catch {}
  return { mode: m, mb: v };
};

async function swAsk(type, payload, timeoutMs) {
  try {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.active) return null;

    return await new Promise((resolve) => {
      const ch = new MessageChannel();
      const t = setTimeout(() => resolve(null), timeoutMs || 1200);
      ch.port1.onmessage = (ev) => { clearTimeout(t); resolve(ev.data || null); };
      reg.active.postMessage({ type, payload }, [ch.port2]);
    });
  } catch {
    return null;
  }
}

async function swGetCacheSize() {
  const r = await swAsk('GET_CACHE_SIZE', null, 1200);
  return {
    ok: !!r,
    size: Number(r?.size || 0) || 0,
    entries: Number(r?.entries || 0) || 0,
    approx: !!r?.approx
  };
}

async function swWarmOfflineShell(urls) {
  const r = await swAsk('WARM_OFFLINE_SHELL', { urls: Array.isArray(urls) ? urls : [] }, 5000);
  return r || { ok: false };
}

// ===== preload all tracks into TrackRegistry (used by scripts/app.js and 100% offline) =====
async function fetchAlbumConfigByKey(albumKey) {
  const a = String(albumKey || '').trim();
  if (!a) return null;

  const idx = Array.isArray(window.albumsIndex) ? window.albumsIndex : [];
  const meta = idx.find(x => x && x.key === a) || null;
  if (!meta?.base) return null;

  const cacheKey = `offline:albumConfigCache:v1:${a}`;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const j = JSON.parse(raw);
      if (j && typeof j === 'object') return j;
    }
  } catch {}

  const base = String(meta.base || '');
  const url = base.endsWith('/') ? `${base}config.json` : `${base}/config.json`;

  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return null;
    const cfg = await r.json();
    try { sessionStorage.setItem(cacheKey, JSON.stringify(cfg)); } catch {}
    return cfg;
  } catch {
    return null;
  }
}

export async function preloadAllAlbumsTrackIndex() {
  const idx = Array.isArray(window.albumsIndex) ? window.albumsIndex : [];
  const reg = window.TrackRegistry;
  if (!idx.length || !reg?.registerTrack) return false;

  let loaded = 0;

  for (const a of idx) {
    const key = String(a?.key || '').trim();
    if (!key || key.startsWith('__')) continue;

    // eslint-disable-next-line no-await-in-loop
    const cfg = await fetchAlbumConfigByKey(key);
    const tracks = Array.isArray(cfg?.tracks) ? cfg.tracks : [];
    if (!tracks.length) continue;

    const base = String(a.base || '');
    const join = (rel) => {
      try { return new URL(String(rel || ''), base.endsWith('/') ? base : `${base}/`).toString(); }
      catch { return null; }
    };

    for (const t of tracks) {
      const uid = String(t?.uid || '').trim();
      if (!uid) continue;

      reg.registerTrack({
        uid,
        title: t.title || '',
        audio: t.audio ? join(t.audio) : null,
        audio_low: t.audio_low ? join(t.audio_low) : null,
        size: (typeof t.size === 'number') ? t.size : null,
        size_low: (typeof t.size_low === 'number') ? t.size_low : null,
        lyrics: t.lyrics ? join(t.lyrics) : (t.lrc ? join(t.lrc) : null),
        fulltext: t.fulltext ? join(t.fulltext) : null,
        sourceAlbum: key
      });
    }

    loaded++;
  }

  return loaded > 0;
}

// ===== modal state =====
let modalEl = null;
let unsubProgress = null;
let bound = false;

const qs = (sel) => (modalEl ? modalEl.querySelector(sel) : null);
const setTxt = (sel, v) => {
  const el = qs(sel);
  if (!el) return;
  const s = String(v ?? '');
  if (el.textContent !== s) el.textContent = s;
};
const setChk = (sel, v) => {
  const el = qs(sel);
  if (el) el.checked = !!v;
};
const setDis = (sel, v) => {
  const el = qs(sel);
  if (el) el.disabled = !!v;
};

function getNeedsCounts(mgr) {
  const a = mgr?.getNeedsAggregates?.();
  return {
    needsUpdateCount: Number(a?.needsUpdate || 0) || 0,
    needsReCacheCount: Number(a?.needsReCache || 0) || 0
  };
}

async function collectState(mgr) {
  const net = getNetworkStatusSafe();

  const [
    cq,
    breakdown,
    cacheSizeBytes,
    swSize,
    g,
  ] = await Promise.all([
    mgr.getCacheQuality?.().catch(() => 'hi'),
    mgr.getCacheBreakdown?.().catch(() => null),
    mgr.getCacheSizeBytes?.().catch(() => 0),
    swGetCacheSize(),
    mgr.getGlobalStatistics?.().catch(() => ({})),
  ]);

  const isOff = !!mgr.isOfflineMode?.();
  const cloud = mgr.getCloudSettings?.() || { n: 5, d: 31 };
  const policy = getNetPolicy();
  const limit = readLimit();
  const qst = mgr.getQueueStatus?.() || { downloadingKey: null, queued: 0, paused: false };

  // best-effort needs aggregates (не блокируем UI)
  try { await mgr.refreshNeedsAggregates?.({ force: false }); } catch {}
  const needs = getNeedsCounts(mgr);

  const totalSec = Number((typeof g?.totalSeconds === 'number' ? g.totalSeconds : g?.totalListenSec) || 0) || 0;

  const albums = (Array.isArray(window.albumsIndex) ? window.albumsIndex : [])
    .filter(a => a && a.key && !String(a.key).startsWith('__'))
    .map(a => ({ key: String(a.key), title: String(a.title || a.key) }));

  return {
    net,
    isOff,
    cq: q(cq),
    cloud,
    policy,
    limit,
    breakdown,
    cacheSizeBytes: Number(cacheSizeBytes || 0) || 0,
    swSize: swSize || { size: 0, approx: false },
    qst,
    needsUpdateCount: needs.needsUpdateCount,
    needsReCacheCount: needs.needsReCacheCount,
    albums,
    statsTotalLabel: fmtListen(totalSec),
  };
}

function updateFields(s) {
  if (!modalEl || !s) return;

  setTxt('#om-net-label', `${s.net.online ? 'online' : 'offline'} (${s.net.kind || 'unknown'})`);
  setTxt('#om-cq-label', s.cq);

  // A
  setChk('#om-offline-mode', s.isOff);

  // B
  const cqSel = qs('#om-cq');
  if (cqSel && cqSel.value !== s.cq) cqSel.value = s.cq;

  // C
  const nEl = qs('#om-cloud-n');
  const dEl = qs('#om-cloud-d');
  if (nEl) nEl.value = String(Number(s.cloud?.n || 5));
  if (dEl) dEl.value = String(Number(s.cloud?.d || 31));

  // D
  setChk('#om-pol-wifiOnly', !!s.policy.wifiOnly);
  setChk('#om-pol-allowMobile', !!s.policy.allowMobile);
  setChk('#om-pol-confirmOnMobile', !!s.policy.confirmOnMobile);
  setChk('#om-pol-saveDataBlock', !!s.policy.saveDataBlock);

  // E
  const lm = qs('#om-limit-mode');
  const lmb = qs('#om-limit-mb');
  if (lm && lm.value !== s.limit.mode) lm.value = s.limit.mode;
  if (lmb) lmb.value = String(s.limit.mb);
  setDis('#om-limit-mb', s.limit.mode !== 'manual');

  setTxt('#om-e-audio-total', formatBytes(s.cacheSizeBytes));
  setTxt('#om-e-sw-total', formatBytes(s.swSize.size || 0));

  if (s.breakdown) {
    setTxt('#om-e-pinned', formatBytes(s.breakdown.pinnedBytes));
    setTxt('#om-e-cloud', formatBytes(s.breakdown.cloudBytes));
    setTxt('#om-e-tw', formatBytes(s.breakdown.transientWindowBytes));
    setTxt('#om-e-te', formatBytes(s.breakdown.transientExtraBytes));
    setTxt('#om-e-tu', formatBytes(s.breakdown.transientUnknownBytes));
  }

  // F
  setTxt('#om-f-downloading', String(s.qst.downloadingKey || '—'));
  setTxt('#om-f-queued', String(Number(s.qst.queued || 0)));
  const qBtn = qs('#om-queue-toggle');
  if (qBtn) qBtn.textContent = s.qst.paused ? 'Возобновить' : 'Пауза';

  // G
  setTxt('#om-g-needsUpdate', String(s.needsUpdateCount));
  setTxt('#om-g-needsReCache', String(s.needsReCacheCount));

  // stats
  setTxt('#om-stats-total', s.statsTotalLabel || '—');

  // I albums box
  const modeSel = qs('#om-full-mode');
  const albBox = qs('#om-albums-box');
  if (modeSel && albBox) albBox.style.display = (String(modeSel.value || 'favorites') === 'albums') ? '' : 'none';
}

function bindHandlers(mgr) {
  if (!modalEl || bound) return;
  bound = true;

  // A
  qs('#om-offline-mode')?.addEventListener('change', (e) => {
    mgr.setOfflineMode?.(!!e?.target?.checked);
  });

  // B
  qs('#om-cq-save')?.addEventListener('click', async () => {
    await mgr.setCacheQuality?.(String(qs('#om-cq')?.value || 'hi'));
    window.NotificationSystem?.success('CQ сохранено');
  });

  // C
  qs('#om-cloud-save')?.addEventListener('click', () => {
    const n = clamp(toInt(qs('#om-cloud-n')?.value, 5), 1, 50);
    const d = clamp(toInt(qs('#om-cloud-d')?.value, 31), 1, 365);
    mgr.setCloudSettings?.({ n, d });
    window.NotificationSystem?.success('Cloud настройки сохранены');
  });

  // D
  qs('#om-pol-save')?.addEventListener('click', () => {
    setNetPolicy({
      wifiOnly: !!qs('#om-pol-wifiOnly')?.checked,
      allowMobile: !!qs('#om-pol-allowMobile')?.checked,
      confirmOnMobile: !!qs('#om-pol-confirmOnMobile')?.checked,
      saveDataBlock: !!qs('#om-pol-saveDataBlock')?.checked,
    });
    window.NotificationSystem?.success('Network policy сохранена');
  });

  // E limit
  qs('#om-limit-mode')?.addEventListener('change', () => {
    setDis('#om-limit-mb', String(qs('#om-limit-mode')?.value || 'auto') !== 'manual');
  });

  qs('#om-limit-save')?.addEventListener('click', () => {
    writeLimit(String(qs('#om-limit-mode')?.value || 'auto'), Number(qs('#om-limit-mb')?.value || 500));
    window.NotificationSystem?.success('Лимит сохранён');
  });

  // F queue
  qs('#om-queue-toggle')?.addEventListener('click', () => {
    const st = mgr.getQueueStatus?.() || { paused: false };
    if (st.paused) mgr.resumeQueue?.();
    else mgr.pauseQueue?.();
  });

  // G updates / recache
  qs('#om-upd-all')?.addEventListener('click', async () => {
    const r = await mgr.enqueueUpdateAll?.();
    if (r?.ok) window.NotificationSystem?.info(`Updates: поставлено ${r.count} задач`);
    else window.NotificationSystem?.error('Не удалось запустить updates');
    try { await mgr.refreshNeedsAggregates?.({ force: true }); } catch {}
  });

  qs('#om-recache-all')?.addEventListener('click', async () => {
    const r = await mgr.enqueueReCacheAllByCQ?.({ userInitiated: true });
    if (r?.ok) window.NotificationSystem?.info(`Re-cache: поставлено ${r.count} задач`);
    else window.NotificationSystem?.error('Не удалось запустить re-cache');
    try { await mgr.refreshNeedsAggregates?.({ force: true }); } catch {}
  });

  // H clear all
  qs('#om-clear-all')?.addEventListener('click', async () => {
    if (!confirm('Очистить весь кэш аудио?')) return;
    if (!confirm('Подтверди ещё раз: удалить кэш полностью?')) return;
    await mgr.clearAllCache?.();
    window.NotificationSystem?.success('Кэш очищен');
  });

  // I 100% OFFLINE
  qs('#om-full-mode')?.addEventListener('change', () => {
    const albBox = qs('#om-albums-box');
    if (albBox) albBox.style.display = (String(qs('#om-full-mode')?.value || 'favorites') === 'albums') ? '' : 'none';
  });

  const getSelection = () => {
    const v = String(qs('#om-full-mode')?.value || 'favorites');
    if (v === 'albums') {
      const keys = Array.from(modalEl.querySelectorAll('.om-alb:checked'))
        .map(x => String(x.dataset.k || '').trim())
        .filter(Boolean);
      return { mode: 'albums', albumKeys: keys };
    }
    return { mode: 'favorites' };
  };

  const setOut = (t) => setTxt('#om-full-out', t || 'Оценка: —');

  qs('#om-full-est')?.addEventListener('click', async () => {
    setOut('Оценка: ...');

    await preloadAllAlbumsTrackIndex();

    const est = await mgr.computeSizeEstimate?.(getSelection());
    if (!est?.ok) return setOut(`Оценка: ошибка (${String(est?.reason || 'unknown')})`);

    setOut(`Оценка: ${Number(est.totalMB || 0).toFixed(1)} MB · треков: ${est.count || 0} · CQ=${est.cq}`);
  });

  qs('#om-full-start')?.addEventListener('click', async () => {
    const net = getNetworkStatusSafe();
    if (!net.online) return void window.NotificationSystem?.warning('Нет сети');

    if (String(net.kind || '').toLowerCase() === 'unknown') {
      if (!confirm('Тип сети неизвестен. Продолжить?')) return;
    }

    await preloadAllAlbumsTrackIndex();

    const est = await mgr.computeSizeEstimate?.(getSelection());
    if (!est?.ok) return void window.NotificationSystem?.error('Не удалось оценить набор');
    if (!Array.isArray(est.uids) || est.uids.length === 0) return void window.NotificationSystem?.info('Набор пуст');

    // строгая проверка "можем ли гарантировать" (iOS риск)
    const guarantee = await mgr._canGuaranteeStorageForMB?.(est.totalMB);
    if (!guarantee?.ok) {
      window.NotificationSystem?.error('Нельзя гарантировать место в хранилище. 100% OFFLINE не запущен.');
      return;
    }

    // shell + нужные json/галереи/иконки/lyrics/fulltext
    const urls = new Set([
      './',
      './index.html',
      './news.html',
      './manifest.json',
      './albums.json',
      './news/news.json',
      './styles/main.css',
      './scripts/core/bootstrap.js',
      './scripts/core/utils.js',
      './scripts/core/config.js',
      './scripts/app.js',
      './src/PlayerCore.js',
      './img/logo.png',
      './img/star.png',
      './img/star2.png',
      './icons/icon-192.png',
      './icons/icon-512.png',
      './icons/apple-touch-icon.png',
      './albums/gallery/00/index.json',
      './albums/gallery/01/index.json',
      './albums/gallery/02/index.json',
      './albums/gallery/03/index.json',
      './albums/gallery/news/index.json',
    ]);

    try {
      for (const uid of est.uids) {
        const meta = window.TrackRegistry?.getTrackByUid?.(uid) || null;
        const l = String(meta?.lyrics || '').trim();
        const f = String(meta?.fulltext || '').trim();
        if (l) urls.add(l);
        if (f) urls.add(f);
      }
    } catch {}

    const warm = await swWarmOfflineShell(Array.from(urls));
    if (!warm.ok) window.NotificationSystem?.warning('Shell/ассеты: не удалось прогреть SW');

    const r = await mgr.startFullOffline?.(est.uids);
    if (r?.ok) window.NotificationSystem?.info(`100% OFFLINE: поставлено ${r.total} треков`, 3500);
    else window.NotificationSystem?.error(`Не удалось запустить 100% OFFLINE: ${String(r?.reason || '')}`);
  });
}

export async function openOfflineModal() {
  const mgr = window.OfflineUI?.offlineManager;
  if (!mgr) return void window.NotificationSystem?.error('OfflineManager не инициализирован');
  if (!window.Modals?.open) return void window.NotificationSystem?.error('Modals helper не загружен');

  closeOfflineModal();

  const state = await collectState(mgr);

  modalEl = window.Modals.open({
    title: 'OFFLINE',
    maxWidth: 560,
    bodyHtml: window.Modals?.offlineBody ? window.Modals.offlineBody(state) : '<div style="color:#9db7dd;">offlineBody template missing</div>',
    onClose: () => closeOfflineModal()
  });

  bound = false;
  bindHandlers(mgr);
  updateFields(state);

  const schedule = window.Utils?.debounceFrame
    ? window.Utils.debounceFrame(async () => {
        try { updateFields(await collectState(mgr)); } catch {}
      })
    : (async () => { try { updateFields(await collectState(mgr)); } catch {} });

  unsubProgress = mgr.on?.('progress', () => { schedule(); }) || null;

  // лёгкое первичное обновление (queue/needy могут измениться сразу)
  schedule();
}

export function closeOfflineModal() {
  try { unsubProgress?.(); } catch {}
  unsubProgress = null;
  bound = false;

  if (modalEl) {
    try { modalEl.remove(); } catch {}
    modalEl = null;
  }
}
