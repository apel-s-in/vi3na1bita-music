// scripts/ui/offline-modal.js
// OFFLINE modal (ТЗ_НЬЮ) — секции A–I + 100% OFFLINE + updates/re-cache + breakdown.
// Важно: модалка не трогает воспроизведение (no stop/play/seek/volume).

import { setNetPolicy, getNetPolicy } from '../offline/net-policy.js';
import { getNetworkStatusSafe, formatBytes } from './ui-utils.js';

const LS_LIMIT_MODE = 'offline:cacheLimitMode:v1'; // 'auto'|'manual'
const LS_LIMIT_MB = 'offline:cacheLimitMB:v1';

function formatDuration(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

async function swWarmOfflineShell(urls) {
  try {
    if (!('serviceWorker' in navigator)) return { ok: false, reason: 'noSW' };
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg || !reg.active) return { ok: false, reason: 'noActiveSW' };

    return await new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (ev) => resolve(ev.data || { ok: false });
      reg.active.postMessage({ type: 'WARM_OFFLINE_SHELL', payload: { urls: urls || [] } }, [ch.port2]);
      setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 5000);
    });
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

async function swGetCacheSize() {
  try {
    if (!('serviceWorker' in navigator)) return { ok: false, size: 0, entries: 0 };
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg || !reg.active) return { ok: false, size: 0, entries: 0 };

    const r = await new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (ev) => resolve(ev.data || {});
      reg.active.postMessage({ type: 'GET_CACHE_SIZE' }, [ch.port2]);
      setTimeout(() => resolve({}), 1200);
    });

    return {
      ok: true,
      size: Number(r.size || 0) || 0,
      entries: Number(r.entries || 0) || 0,
      approx: !!r.approx
    };
  } catch {
    return { ok: false, size: 0, entries: 0 };
  }
}

function readLimitSettings() {
  let mode = 'auto';
  let mb = 500;
  try {
    mode = (localStorage.getItem(LS_LIMIT_MODE) === 'manual') ? 'manual' : 'auto';
    mb = Number(localStorage.getItem(LS_LIMIT_MB) || 500) || 500;
  } catch {}
  mb = Math.max(50, Math.min(5000, mb));
  return { mode, mb };
}

function writeLimitSettings(mode, mb) {
  const m = (mode === 'manual') ? 'manual' : 'auto';
  const v = Math.max(50, Math.min(5000, Number(mb) || 500));
  try {
    localStorage.setItem(LS_LIMIT_MODE, m);
    localStorage.setItem(LS_LIMIT_MB, String(v));
  } catch {}
  return { mode: m, mb: v };
}

// ===== preload all tracks into TrackRegistry (used by scripts/app.js) =====
async function fetchAlbumConfigByKey(albumKey) {
  const a = String(albumKey || '').trim();
  if (!a) return null;

  const idx = Array.isArray(window.albumsIndex) ? window.albumsIndex : [];
  const meta = idx.find(x => x && x.key === a) || null;
  if (!meta || !meta.base) return null;

  const base = String(meta.base || '');
  const url = base.endsWith('/') ? `${base}config.json` : `${base}/config.json`;

  const cacheKey = `offline:albumConfigCache:v1:${a}`;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const j = JSON.parse(raw);
      if (j && typeof j === 'object') return j;
    }
  } catch {}

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
  if (!idx.length) return false;

  const reg = window.TrackRegistry;
  if (!reg || typeof reg.registerTrack !== 'function') return false;

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
      try {
        return new URL(String(rel || ''), base.endsWith('/') ? base : `${base}/`).toString();
      } catch {
        return null;
      }
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
let handlersBound = false;

function qs(sel) {
  return modalEl ? modalEl.querySelector(sel) : null;
}

function setText(sel, txt) {
  const el = qs(sel);
  if (!el) return;
  const next = String(txt ?? '');
  if (el.textContent !== next) el.textContent = next;
}

function setChecked(sel, val) {
  const el = qs(sel);
  if (!el) return;
  el.checked = !!val;
}

function setDisabled(sel, val) {
  const el = qs(sel);
  if (!el) return;
  el.disabled = !!val;
}

function getNeedsCounts(mgr) {
  const a = (typeof mgr.getNeedsAggregates === 'function') ? mgr.getNeedsAggregates() : null;
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
  const cloud = (typeof mgr.getCloudSettings === 'function') ? mgr.getCloudSettings() : { n: 5, d: 31 };
  const policy = getNetPolicy();
  const limit = readLimitSettings();
  const qst = mgr.getQueueStatus?.() || { downloadingKey: null, queued: 0, paused: false };

  // best-effort обновить агрегаты needs*
  try { await mgr.refreshNeedsAggregates?.({ force: false }); } catch {}

  const needs = getNeedsCounts(mgr);

  const totalSec = Number((typeof g?.totalSeconds === 'number' ? g.totalSeconds : g?.totalListenSec) || 0) || 0;

  const albums = (Array.isArray(window.albumsIndex) ? window.albumsIndex : [])
    .filter(a => a && a.key && !String(a.key).startsWith('__'))
    .map(a => ({ key: String(a.key), title: String(a.title || a.key) }));

  return {
    net,
    isOff,
    cq: String(cq || 'hi') === 'lo' ? 'lo' : 'hi',
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
    statsTotalLabel: formatDuration(totalSec),
  };
}

function updateFields(state) {
  if (!modalEl) return;

  // header
  setText('#om-net-label', `${state.net.online ? 'online' : 'offline'} (${state.net.kind || 'unknown'})`);
  setText('#om-cq-label', String(state.cq));

  // A
  setChecked('#om-offline-mode', !!state.isOff);

  // B
  const cqSel = qs('#om-cq');
  if (cqSel && cqSel.value !== state.cq) cqSel.value = state.cq;

  // C
  const nEl = qs('#om-cloud-n');
  const dEl = qs('#om-cloud-d');
  if (nEl) nEl.value = String(Number(state.cloud?.n || 5));
  if (dEl) dEl.value = String(Number(state.cloud?.d || 31));

  // D
  setChecked('#om-pol-wifiOnly', !!state.policy.wifiOnly);
  setChecked('#om-pol-allowMobile', !!state.policy.allowMobile);
  setChecked('#om-pol-confirmOnMobile', !!state.policy.confirmOnMobile);
  setChecked('#om-pol-saveDataBlock', !!state.policy.saveDataBlock);

  // E
  const lm = qs('#om-limit-mode');
  const lmb = qs('#om-limit-mb');
  if (lm && lm.value !== state.limit.mode) lm.value = state.limit.mode;
  if (lmb) lmb.value = String(state.limit.mb);
  setDisabled('#om-limit-mb', state.limit.mode !== 'manual');

  setText('#om-e-audio-total', formatBytes(state.cacheSizeBytes));
  setText('#om-e-sw-total', formatBytes(state.swSize.size || 0));

  if (state.breakdown) {
    setText('#om-e-pinned', formatBytes(state.breakdown.pinnedBytes));
    setText('#om-e-cloud', formatBytes(state.breakdown.cloudBytes));
    setText('#om-e-tw', formatBytes(state.breakdown.transientWindowBytes));
    setText('#om-e-te', formatBytes(state.breakdown.transientExtraBytes));
    setText('#om-e-tu', formatBytes(state.breakdown.transientUnknownBytes));
  }

  // F
  setText('#om-f-downloading', String(state.qst.downloadingKey || '—'));
  setText('#om-f-queued', String(Number(state.qst.queued || 0)));
  const qBtn = qs('#om-queue-toggle');
  if (qBtn) qBtn.textContent = state.qst.paused ? 'Возобновить' : 'Пауза';

  // G
  setText('#om-g-needsUpdate', String(state.needsUpdateCount));
  setText('#om-g-needsReCache', String(state.needsReCacheCount));

  // stats
  setText('#om-stats-total', String(state.statsTotalLabel || '—'));

  // I albums box show/hide
  const modeSel = qs('#om-full-mode');
  const albBox = qs('#om-albums-box');
  if (modeSel && albBox) {
    const v = String(modeSel.value || 'favorites');
    albBox.style.display = (v === 'albums') ? '' : 'none';
  }
}

function bindHandlers(mgr) {
  if (!modalEl || handlersBound) return;
  handlersBound = true;

  // A
  qs('#om-offline-mode')?.addEventListener('change', (e) => {
    const on = !!e?.target?.checked;
    mgr.setOfflineMode?.(on);
  });

  // B
  qs('#om-cq-save')?.addEventListener('click', async () => {
    const v = String(qs('#om-cq')?.value || 'hi');
    await mgr.setCacheQuality?.(v);
    window.NotificationSystem?.success('CQ сохранено');
    // обновим поля (без пересоздания модалки)
    try { updateFields(await collectState(mgr)); } catch {}
  });

  // C
  qs('#om-cloud-save')?.addEventListener('click', async () => {
    const n = Number(qs('#om-cloud-n')?.value || 5);
    const d = Number(qs('#om-cloud-d')?.value || 31);
    mgr.setCloudSettings?.({ n, d });
    window.NotificationSystem?.success('Cloud настройки сохранены');
    try { updateFields(await collectState(mgr)); } catch {}
  });

  // D
  qs('#om-pol-save')?.addEventListener('click', async () => {
    const next = {
      wifiOnly: !!qs('#om-pol-wifiOnly')?.checked,
      allowMobile: !!qs('#om-pol-allowMobile')?.checked,
      confirmOnMobile: !!qs('#om-pol-confirmOnMobile')?.checked,
      saveDataBlock: !!qs('#om-pol-saveDataBlock')?.checked,
    };
    setNetPolicy(next);
    window.NotificationSystem?.success('Network policy сохранена');
    try { updateFields(await collectState(mgr)); } catch {}
  });

  // E limit
  qs('#om-limit-mode')?.addEventListener('change', () => {
    const mode = String(qs('#om-limit-mode')?.value || 'auto');
    setDisabled('#om-limit-mb', mode !== 'manual');
  });

  qs('#om-limit-save')?.addEventListener('click', () => {
    const mode = String(qs('#om-limit-mode')?.value || 'auto');
    const mb = Number(qs('#om-limit-mb')?.value || 500);
    writeLimitSettings(mode, mb);
    window.NotificationSystem?.success('Лимит сохранён');
  });

  // F queue
  qs('#om-queue-toggle')?.addEventListener('click', async () => {
    const st = mgr.getQueueStatus?.() || { paused: false };
    if (st.paused) mgr.resumeQueue?.();
    else mgr.pauseQueue?.();
    try { updateFields(await collectState(mgr)); } catch {}
  });

  // G updates
  qs('#om-upd-all')?.addEventListener('click', async () => {
    const r = await mgr.enqueueUpdateAll?.();
    if (r?.ok) window.NotificationSystem?.info(`Updates: поставлено ${r.count} задач`);
    else window.NotificationSystem?.error('Не удалось запустить updates');

    try { await mgr.refreshNeedsAggregates?.({ force: true }); } catch {}
    try { updateFields(await collectState(mgr)); } catch {}
  });

  qs('#om-recache-all')?.addEventListener('click', async () => {
    const r = await mgr.enqueueReCacheAllByCQ?.({ userInitiated: true });
    if (r?.ok) window.NotificationSystem?.info(`Re-cache: поставлено ${r.count} задач`);
    else window.NotificationSystem?.error('Не удалось запустить re-cache');

    try { await mgr.refreshNeedsAggregates?.({ force: true }); } catch {}
    try { updateFields(await collectState(mgr)); } catch {}
  });

  // H clear all
  qs('#om-clear-all')?.addEventListener('click', async () => {
    if (!confirm('Очистить весь кэш аудио?')) return;
    if (!confirm('Подтверди ещё раз: удалить кэш полностью?')) return;
    await mgr.clearAllCache?.();
    window.NotificationSystem?.success('Кэш очищен');
    try { updateFields(await collectState(mgr)); } catch {}
  });

  // I full offline
  qs('#om-full-mode')?.addEventListener('change', () => {
    updateFields({
      net: getNetworkStatusSafe(),
      isOff: !!mgr.isOfflineMode?.(),
      cq: String(qs('#om-cq')?.value || 'hi'),
      cloud: mgr.getCloudSettings?.() || { n: 5, d: 31 },
      policy: getNetPolicy(),
      limit: readLimitSettings(),
      breakdown: null,
      cacheSizeBytes: 0,
      swSize: { size: 0, approx: false },
      qst: mgr.getQueueStatus?.() || {},
      needsUpdateCount: 0,
      needsReCacheCount: 0,
      albums: [],
      statsTotalLabel: '—',
    });
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

  qs('#om-full-est')?.addEventListener('click', async () => {
    const out = qs('#om-full-out');

    await preloadAllAlbumsTrackIndex();

    const est = await mgr.computeSizeEstimate?.(getSelection());
    if (!est?.ok) {
      if (out) out.textContent = `Оценка: ошибка (${String(est?.reason || 'unknown')})`;
      return;
    }
    if (out) out.textContent = `Оценка: ${Number(est.totalMB || 0).toFixed(1)} MB · треков: ${est.count || 0} · CQ=${est.cq}`;
  });

  qs('#om-full-start')?.addEventListener('click', async () => {
    const netNow = getNetworkStatusSafe();
    if (!netNow.online) {
      window.NotificationSystem?.warning('Нет сети');
      return;
    }

    if (String(netNow.kind || '').toLowerCase() === 'unknown') {
      if (!confirm('Тип сети неизвестен. Продолжить?')) return;
    }

    await preloadAllAlbumsTrackIndex();

    const est = await mgr.computeSizeEstimate?.(getSelection());
    if (!est?.ok) {
      window.NotificationSystem?.error('Не удалось оценить набор');
      return;
    }
    if (!est.uids || est.uids.length === 0) {
      window.NotificationSystem?.info('Набор пуст');
      return;
    }

    const guarantee = await mgr._canGuaranteeStorageForMB?.(est.totalMB);
    if (!guarantee?.ok) {
      window.NotificationSystem?.error('Нельзя гарантировать место в хранилище. 100% OFFLINE не запущен.');
      return;
    }

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
    if (!warm.ok) {
      window.NotificationSystem?.warning('Shell/ассеты: не удалось прогреть SW (может ограничить 100% OFFLINE UI)');
    }

    const r = await mgr.startFullOffline?.(est.uids);
    if (r?.ok) {
      window.NotificationSystem?.info(`100% OFFLINE: поставлено ${r.total} треков`, 3500);
      try { updateFields(await collectState(mgr)); } catch {}
    } else {
      window.NotificationSystem?.error('Не удалось запустить 100% OFFLINE: ' + String(r?.reason || ''));
    }
  });
}

export async function openOfflineModal() {
  const mgr = window.OfflineUI?.offlineManager;
  if (!mgr) {
    window.NotificationSystem?.error('OfflineManager не инициализирован');
    return;
  }
  if (!window.Modals?.open) {
    window.NotificationSystem?.error('Modals helper не загружен');
    return;
  }

  // close previous
  closeOfflineModal();

  const state = await collectState(mgr);

  const bodyHtml = window.Modals?.offlineBody
    ? window.Modals.offlineBody(state)
    : `<div style="color:#9db7dd;">offlineBody template missing</div>`;

  modalEl = window.Modals.open({
    title: 'OFFLINE',
    maxWidth: 560,
    bodyHtml,
    onClose: () => closeOfflineModal()
  });

  handlersBound = false;
  bindHandlers(mgr);

  // live updates: только updateFields (без re-render)
  const schedule = (window.Utils?.debounceFrame)
    ? window.Utils.debounceFrame(async () => {
        try { updateFields(await collectState(mgr)); } catch {}
      })
    : async () => { try { updateFields(await collectState(mgr)); } catch {} };

  unsubProgress = mgr.on?.('progress', () => { schedule(); }) || null;

  // first refresh (на всякий)
  schedule();
}

export function closeOfflineModal() {
  try { unsubProgress?.(); } catch {}
  unsubProgress = null;

  handlersBound = false;

  if (modalEl) {
    try { modalEl.remove(); } catch {}
    modalEl = null;
  }
}
