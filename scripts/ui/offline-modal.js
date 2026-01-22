// scripts/ui/offline-modal.js
// OFFLINE modal (ТЗ_НЬЮ) — секции A–I + 100% OFFLINE + updates/re-cache + breakdown.
// Важно: модалка не трогает воспроизведение (no stop/play/seek/volume).

import { getNetPolicy, setNetPolicy } from '../offline/net-policy.js';
import { formatBytes, getNetworkStatusSafe } from './ui-utils.js';

const LS_LIMIT_MODE = 'offline:cacheLimitMode:v1'; // 'auto'|'manual'
const LS_LIMIT_MB = 'offline:cacheLimitMB:v1';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const toInt = (v, d = 0) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
};
const q = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');

const fmtListen = (sec) => {
  const s = Math.max(0, Number(sec) || 0);
  const h = (s / 3600) | 0;
  const m = ((s % 3600) / 60) | 0;
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

const swAsk = async (type, payload, timeoutMs = 1200) => {
  try {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.active) return null;

    return await new Promise((resolve) => {
      const ch = new MessageChannel();
      const t = setTimeout(() => resolve(null), timeoutMs);
      ch.port1.onmessage = (ev) => { clearTimeout(t); resolve(ev.data || null); };
      reg.active.postMessage({ type, payload }, [ch.port2]);
    });
  } catch {
    return null;
  }
};

const swGetCacheSize = async () => {
  const r = await swAsk('GET_CACHE_SIZE', null, 1200);
  return { ok: !!r, size: Number(r?.size || 0) || 0, entries: Number(r?.entries || 0) || 0, approx: !!r?.approx };
};

const swWarmOfflineShell = async (urls) => {
  const r = await swAsk('WARM_OFFLINE_SHELL', { urls: Array.isArray(urls) ? urls : [] }, 5000);
  return r || { ok: false };
};

// ===== preload all tracks into TrackRegistry (used by scripts/app.js and 100% offline) =====
async function fetchAlbumConfigByKey(albumKey) {
  const key = String(albumKey || '').trim();
  if (!key) return null;

  const idx = Array.isArray(window.albumsIndex) ? window.albumsIndex : [];
  const meta = idx.find(x => x && x.key === key) || null;
  if (!meta?.base) return null;

  const cacheKey = `offline:albumConfigCache:v1:${key}`;
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
    const baseUrl = base.endsWith('/') ? base : `${base}/`;
    const join = (rel) => { try { return new URL(String(rel || ''), baseUrl).toString(); } catch { return null; } };

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
        lyrics: t.lyrics ? join(t.lyrics) : null,
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
const txt = (sel, v) => {
  const el = qs(sel);
  if (!el) return;
  const s = String(v ?? '');
  if (el.textContent !== s) el.textContent = s;
};
const chk = (sel, v) => {
  const el = qs(sel);
  if (el) el.checked = !!v;
};
const dis = (sel, v) => {
  const el = qs(sel);
  if (el) el.disabled = !!v;
};

const getNeedsCounts = (mgr) => {
  const a = mgr?.getNeedsAggregates?.();
  return { u: Number(a?.needsUpdate || 0) || 0, r: Number(a?.needsReCache || 0) || 0 };
};

async function collectState(mgr) {
  const net = getNetworkStatusSafe();

  const [cq, breakdown, cacheSizeBytes, swSize, g] = await Promise.all([
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
    needsUpdateCount: needs.u,
    needsReCacheCount: needs.r,
    albums,
    statsTotalLabel: fmtListen(totalSec),
  };
}

function updateFields(s) {
  if (!modalEl || !s) return;

  txt('#om-net-label', `${s.net.online ? 'online' : 'offline'} (${s.net.kind || 'unknown'})`);
  txt('#om-cq-label', s.cq);

  chk('#om-offline-mode', s.isOff);

  const cqSel = qs('#om-cq');
  if (cqSel && cqSel.value !== s.cq) cqSel.value = s.cq;

  const nEl = qs('#om-cloud-n');
  const dEl = qs('#om-cloud-d');
  if (nEl) nEl.value = String(Number(s.cloud?.n || 5));
  if (dEl) dEl.value = String(Number(s.cloud?.d || 31));

  chk('#om-pol-wifiOnly', !!s.policy.wifiOnly);
  chk('#om-pol-allowMobile', !!s.policy.allowMobile);
  chk('#om-pol-confirmOnMobile', !!s.policy.confirmOnMobile);
  chk('#om-pol-saveDataBlock', !!s.policy.saveDataBlock);

  const lm = qs('#om-limit-mode');
  const lmb = qs('#om-limit-mb');
  if (lm && lm.value !== s.limit.mode) lm.value = s.limit.mode;
  if (lmb) lmb.value = String(s.limit.mb);
  dis('#om-limit-mb', s.limit.mode !== 'manual');

  txt('#om-e-audio-total', formatBytes(s.cacheSizeBytes));
  txt('#om-e-sw-total', formatBytes(s.swSize.size || 0));

  if (s.breakdown) {
    txt('#om-e-pinned', formatBytes(s.breakdown.pinnedBytes));
    txt('#om-e-cloud', formatBytes(s.breakdown.cloudBytes));
    txt('#om-e-tw', formatBytes(s.breakdown.transientWindowBytes));
    txt('#om-e-te', formatBytes(s.breakdown.transientExtraBytes));
    txt('#om-e-tu', formatBytes(s.breakdown.transientUnknownBytes));
  }

  txt('#om-f-downloading', String(s.qst.downloadingKey || '—'));
  txt('#om-f-queued', String(Number(s.qst.queued || 0)));
  const qBtn = qs('#om-queue-toggle');
  if (qBtn) qBtn.textContent = s.qst.paused ? 'Возобновить' : 'Пауза';

  txt('#om-g-needsUpdate', String(s.needsUpdateCount));
  txt('#om-g-needsReCache', String(s.needsReCacheCount));

  txt('#om-stats-total', s.statsTotalLabel || '—');

  const modeSel = qs('#om-full-mode');
  const albBox = qs('#om-albums-box');
  if (modeSel && albBox) albBox.style.display = (String(modeSel.value || 'favorites') === 'albums') ? '' : 'none';
}

function bindHandlers(mgr) {
  if (!modalEl || bound) return;
  bound = true;

  const ns = window.NotificationSystem;
  const ok = (m) => ns?.success?.(m);
  const info = (m, t) => ns?.info?.(m, t);
  const warn = (m) => ns?.warning?.(m);
  const err = (m) => ns?.error?.(m);

  const on = (sel, ev, fn) => { const el = qs(sel); if (el) el.addEventListener(ev, fn); };

  // Делегация для кликов (меньше обработчиков)
  modalEl.addEventListener('click', async (e) => {
    const id = e?.target?.id;
    if (!id) return;

    if (id === 'om-cq-save') {
      await mgr.setCacheQuality?.(String(qs('#om-cq')?.value || 'hi'));
      ok('CQ сохранено');
      return;
    }

    if (id === 'om-cloud-save') {
      const n = clamp(toInt(qs('#om-cloud-n')?.value, 5), 1, 50);
      const d = clamp(toInt(qs('#om-cloud-d')?.value, 31), 1, 365);
      mgr.setCloudSettings?.({ n, d });
      ok('Cloud настройки сохранены');
      return;
    }

    if (id === 'om-pol-save') {
      setNetPolicy({
        wifiOnly: !!qs('#om-pol-wifiOnly')?.checked,
        allowMobile: !!qs('#om-pol-allowMobile')?.checked,
        confirmOnMobile: !!qs('#om-pol-confirmOnMobile')?.checked,
        saveDataBlock: !!qs('#om-pol-saveDataBlock')?.checked,
      });
      ok('Network policy сохранена');
      return;
    }

    if (id === 'om-limit-save') {
      writeLimit(String(qs('#om-limit-mode')?.value || 'auto'), Number(qs('#om-limit-mb')?.value || 500));
      ok('Лимит сохранён');
      return;
    }

    if (id === 'om-queue-toggle') {
      const st = mgr.getQueueStatus?.() || { paused: false };
      if (st.paused) mgr.resumeQueue?.();
      else mgr.pauseQueue?.();
      return;
    }

    if (id === 'om-upd-all') {
      const r = await mgr.enqueueUpdateAll?.();
      if (r?.ok) info(`Updates: поставлено ${r.count} задач`);
      else err('Не удалось запустить updates');
      try { await mgr.refreshNeedsAggregates?.({ force: true }); } catch {}
      return;
    }

    if (id === 'om-recache-all') {
      const r = await mgr.enqueueReCacheAllByCQ?.({ userInitiated: true });
      if (r?.ok) info(`Re-cache: поставлено ${r.count} задач`);
      else err('Не удалось запустить re-cache');
      try { await mgr.refreshNeedsAggregates?.({ force: true }); } catch {}
      return;
    }

    if (id === 'om-clear-all') {
      if (!confirm('Очистить весь кэш аудио?')) return;
      if (!confirm('Подтверди ещё раз: удалить кэш полностью?')) return;
      await mgr.clearAllCache?.();
      ok('Кэш очищен');
      return;
    }

    if (id === 'om-full-est') {
      txt('#om-full-out', 'Оценка: ...');
      await preloadAllAlbumsTrackIndex();
      const est = await mgr.computeSizeEstimate?.(getSelection());
      if (!est?.ok) return void txt('#om-full-out', `Оценка: ошибка (${String(est?.reason || 'unknown')})`);
      txt('#om-full-out', `Оценка: ${Number(est.totalMB || 0).toFixed(1)} MB · треков: ${est.count || 0} · CQ=${est.cq}`);
      return;
    }

    if (id === 'om-full-start') {
      const net = getNetworkStatusSafe();
      if (!net.online) return void warn('Нет сети');
      if (String(net.kind || '').toLowerCase() === 'unknown' && !confirm('Тип сети неизвестен. Продолжить?')) return;

      await preloadAllAlbumsTrackIndex();

      const est = await mgr.computeSizeEstimate?.(getSelection());
      if (!est?.ok) return void err('Не удалось оценить набор');
      if (!Array.isArray(est.uids) || est.uids.length === 0) return void info('Набор пуст');

      const guarantee = await mgr.canGuaranteeStorageForMB?.(est.totalMB);
      if (!guarantee?.ok) return void err('Нельзя гарантировать место в хранилище. 100% OFFLINE не запущен.');

      const urls = new Set([
        './','./index.html','./news.html','./manifest.json','./albums.json','./news/news.json',
        './styles/main.css','./scripts/core/bootstrap.js','./scripts/core/utils.js','./scripts/core/config.js',
        './scripts/app.js','./src/PlayerCore.js','./img/logo.png','./img/star.png','./img/star2.png',
        './icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png',
        './albums/gallery/00/index.json','./albums/gallery/01/index.json','./albums/gallery/02/index.json',
        './albums/gallery/03/index.json','./albums/gallery/news/index.json',
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
      if (!warm.ok) warn('Shell/ассеты: не удалось прогреть SW');

      const r = await mgr.startFullOffline?.(est.uids);
      if (r?.ok) info(`100% OFFLINE: поставлено ${r.total} треков`, 3500);
      else err(`Не удалось запустить 100% OFFLINE: ${String(r?.reason || '')}`);
    }
  });

  // change handlers (точечно)
  on('#om-offline-mode', 'change', (e) => mgr.setOfflineMode?.(!!e?.target?.checked));

  on('#om-limit-mode', 'change', () => {
    dis('#om-limit-mb', String(qs('#om-limit-mode')?.value || 'auto') !== 'manual');
  });

  on('#om-full-mode', 'change', () => {
    const box = qs('#om-albums-box');
    if (box) box.style.display = (String(qs('#om-full-mode')?.value || 'favorites') === 'albums') ? '' : 'none';
  });
}

function getSelection() {
  const v = String(qs('#om-full-mode')?.value || 'favorites');
  if (v === 'albums') {
    const keys = Array.from(modalEl?.querySelectorAll('.om-alb:checked') || [])
      .map(x => String(x.dataset.k || '').trim())
      .filter(Boolean);
    return { mode: 'albums', albumKeys: keys };
  }
  return { mode: 'favorites' };
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
    bodyHtml: window.Modals?.offlineBody ? window.Modals.offlineBody(state) : '<div class="om__note">offlineBody template missing</div>',
    onClose: () => closeOfflineModal()
  });

  bound = false;
  bindHandlers(mgr);
  updateFields(state);

  const schedule = window.Utils?.debounceFrame
    ? window.Utils.debounceFrame(async () => { try { updateFields(await collectState(mgr)); } catch {} })
    : (async () => { try { updateFields(await collectState(mgr)); } catch {} });

  unsubProgress = mgr.on?.('progress', () => { schedule(); }) || null;
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
