// scripts/ui/offline-modal.js
// OFFLINE modal (ТЗ_НЬЮ) — секции A–I + 100% OFFLINE + updates/re-cache + breakdown.
// Важно: модалка не трогает воспроизведение (no stop/play/seek/volume).

import { setNetPolicy, getNetPolicy } from '../offline/net-policy.js';
import { esc, formatBytes, getNetworkStatusSafe } from './ui-utils.js';

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

    return { ok: true, size: Number(r.size || 0) || 0, entries: Number(r.entries || 0) || 0, approx: !!r.approx };
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

  // sessionStorage cache to avoid repeated network
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
  if (!reg || typeof reg.registerTrack !== 'function') {
    // TrackRegistry публикуется в scripts/app/track-registry.js (ESM). Если кто-то удалил — пропускаем.
    return false;
  }

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

      // registerTrack expects remote fields as in AlbumsManager.registerTrack call
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

// ===== modal =====
let modalEl = null;

export function openOfflineModal() {
  const mgr = window.OfflineUI?.offlineManager;
  if (!mgr) {
    window.NotificationSystem?.error('OfflineManager не инициализирован');
    return;
  }

  if (!window.Modals?.open) {
    window.NotificationSystem?.error('Modals helper не загружен');
    return;
  }

  // ✅ render-once + update-fields: меньше строк и быстрее
  if (modalEl) {
    try { modalEl.remove(); } catch {}
    modalEl = null;
  }

  const schedule = (window.Utils?.debounceFrame)
    ? window.Utils.debounceFrame(() => { update().catch(() => {}); })
    : (() => { update().catch(() => {}); });

  // ✅ needs* считаем внутри OfflineManager (агрегаты), здесь только подтягиваем/обновляем (без await-loop)
  async function getNeedsCounts() {
    try {
      if (typeof mgr.refreshNeedsAggregates === 'function') {
        // best-effort, с троттлингом внутри
        await mgr.refreshNeedsAggregates({ force: false });
      }
    } catch {}

    const a = (typeof mgr.getNeedsAggregates === 'function') ? mgr.getNeedsAggregates() : null;
    return {
      needsUpdateCount: Number(a?.needsUpdate || 0) || 0,
      needsReCacheCount: Number(a?.needsReCache || 0) || 0
    };
  }

  // ✅ Начальные значения для первого render (иначе net/cq не определены)
  const net = getNetworkStatusSafe();
  const isOff = !!mgr.isOfflineMode?.();
  const cq = (typeof mgr.getCacheQuality === 'function') ? await mgr.getCacheQuality() : 'hi';
  const cloud = (typeof mgr.getCloudSettings === 'function') ? mgr.getCloudSettings() : { n: 5, d: 31 };
  const policy = getNetPolicy();
  const limit = readLimitSettings();
  const breakdown = await mgr.getCacheBreakdown?.();
  const cacheSizeBytes = await mgr.getCacheSizeBytes();
  const swSize = await swGetCacheSize();
  const qst = mgr.getQueueStatus?.() || { downloadingKey: null, queued: 0, paused: false };
  const g = await mgr.getGlobalStatistics();
  const totalSec = Number((typeof g?.totalSeconds === 'number' ? g.totalSeconds : g?.totalListenSec) || 0) || 0;

  // ✅ needs* теперь из OfflineManager агрегатов (без await-loop)
  const needsAgg = (typeof mgr.getNeedsAggregates === 'function') ? mgr.getNeedsAggregates() : null;
  const needsUpdateCount = Number(needsAgg?.needsUpdate || 0) || 0;
  const needsReCacheCount = Number(needsAgg?.needsReCache || 0) || 0;

  const albums = (Array.isArray(window.albumsIndex) ? window.albumsIndex : [])
    .filter(a => a && a.key && !String(a.key).startsWith('__'))
    .map(a => ({ key: String(a.key), title: String(a.title || a.key) }));

  const bodyHtml = window.Modals?.offlineBody ? window.Modals.offlineBody({
    net,
    cq,
    isOff,
    cloud,
    policy,
    limit,
    breakdown,
    cacheSizeBytes,
    swSize,
    qst,
    needsUpdateCount,
    needsReCacheCount,
    albums,
    statsTotalLabel: formatDuration(totalSec),
  }) : `<div style="color:#9db7dd;">offlineBody template missing</div>`;

    if (modalEl) {
      try { modalEl.remove(); } catch {}
      modalEl = null;
    }

    modalEl = window.Modals.open({
      title: 'OFFLINE',
      maxWidth: 560,
      bodyHtml,
      onClose: () => { modalEl = null; try { openOfflineModal.__unsub?.(); } catch {} }
    });

    const $ = (sel) => modalEl?.querySelector(sel);

    // ✅ маленькие хелперы обновления текста без полного re-render
    const setText = (sel, txt) => {
      const el = $(sel);
      if (!el) return;
      const next = String(txt ?? '');
      if (el.textContent !== next) el.textContent = next;
    };

    async function update() {
      if (!modalEl) return;

      const isOff = !!mgr.isOfflineMode?.();
      const cq = await mgr.getCacheQuality();
      const net = getNetworkStatusSafe();

      // E breakdown + sizes
      const breakdown = await mgr.getCacheBreakdown?.();
      const cacheSizeBytes = await mgr.getCacheSizeBytes();
      const swSize = await swGetCacheSize();

      // F queue
      const qst = mgr.getQueueStatus?.() || { downloadingKey: null, queued: 0, paused: false };

      // stats
      const g = await mgr.getGlobalStatistics();
      const totalSec = Number((typeof g?.totalSeconds === 'number' ? g.totalSeconds : g?.totalListenSec) || 0) || 0;

      const needs = await getNeedsCounts();

      // обновляем только динамические куски (селекторы должны существовать в HTML ниже)
      setText('#om-net-label', `${net.online ? 'online' : 'offline'} (${net.kind || 'unknown'})`);
      setText('#om-cq-label', String(cq));

      setText('#om-e-audio-total', formatBytes(cacheSizeBytes));
      setText('#om-e-sw-total', formatBytes(swSize.size || 0));
      setText('#om-f-downloading', String(qst.downloadingKey || '—'));
      setText('#om-f-queued', String(Number(qst.queued || 0)));
      setText('#om-g-needsUpdate', String(needs.needsUpdateCount));
      setText('#om-g-needsReCache', String(needs.needsReCacheCount));
      setText('#om-stats-total', formatDuration(totalSec));

      // чекбокс A (не триггерим change)
      const cb = $('#om-offline-mode');
      if (cb) cb.checked = !!isOff;

      // breakdown поля (если есть)
      if (breakdown) {
        setText('#om-e-pinned', formatBytes(breakdown.pinnedBytes));
        setText('#om-e-cloud', formatBytes(breakdown.cloudBytes));
        setText('#om-e-tw', formatBytes(breakdown.transientWindowBytes));
        setText('#om-e-te', formatBytes(breakdown.transientExtraBytes));
        setText('#om-e-tu', formatBytes(breakdown.transientUnknownBytes));
      }
    }

    // A
    $('#om-offline-mode')?.addEventListener('change', (e) => {
      const on = !!e.target.checked;
      mgr.setOfflineMode(on);
    });

    // B
    $('#om-cq-save')?.addEventListener('click', async () => {
      const v = String($('#om-cq')?.value || 'hi');
      await mgr.setCacheQuality(v);
      window.NotificationSystem?.success('CQ сохранено');
      // после CQ будет auto re-cache, модалку перерисуем
      render();
    });

    // C
    $('#om-cloud-save')?.addEventListener('click', () => {
      const n = Number($('#om-cloud-n')?.value || 5);
      const d = Number($('#om-cloud-d')?.value || 31);
      mgr.setCloudSettings({ n, d });
      window.NotificationSystem?.success('Cloud настройки сохранены');
      render();
    });

    // D
    $('#om-pol-save')?.addEventListener('click', () => {
      const next = {
        wifiOnly: !!$('#om-pol-wifiOnly')?.checked,
        allowMobile: !!$('#om-pol-allowMobile')?.checked,
        confirmOnMobile: !!$('#om-pol-confirmOnMobile')?.checked,
        saveDataBlock: !!$('#om-pol-saveDataBlock')?.checked,
      };
      setNetPolicy(next);
      window.NotificationSystem?.success('Network policy сохранена');
      render();
    });

    // E limit
    $('#om-limit-mode')?.addEventListener('change', () => {
      const mode = String($('#om-limit-mode')?.value || 'auto');
      const inp = $('#om-limit-mb');
      if (inp) inp.disabled = (mode !== 'manual');
    });

    $('#om-limit-save')?.addEventListener('click', () => {
      const mode = String($('#om-limit-mode')?.value || 'auto');
      const mb = Number($('#om-limit-mb')?.value || 500);
      writeLimitSettings(mode, mb);
      window.NotificationSystem?.success('Лимит сохранён');
      // eviction берёт limitMB параметром, сейчас UI лимит не подключён к checkEviction автоматически.
    });

    // F queue
    $('#om-queue-toggle')?.addEventListener('click', () => {
      const st = mgr.getQueueStatus?.() || { paused: false };
      if (st.paused) mgr.resumeQueue?.();
      else mgr.pauseQueue?.();
      render();
    });

    // G updates
    $('#om-upd-all')?.addEventListener('click', async () => {
      const r = await mgr.enqueueUpdateAll?.();
      if (r?.ok) window.NotificationSystem?.info(`Updates: поставлено ${r.count} задач`);
      else window.NotificationSystem?.error('Не удалось запустить updates');

      try { await mgr.refreshNeedsAggregates?.({ force: true }); } catch {}
      render();
    });

    $('#om-recache-all')?.addEventListener('click', async () => {
      const r = await mgr.enqueueReCacheAllByCQ?.({ userInitiated: true });
      if (r?.ok) window.NotificationSystem?.info(`Re-cache: поставлено ${r.count} задач`);
      else window.NotificationSystem?.error('Не удалось запустить re-cache');

      try { await mgr.refreshNeedsAggregates?.({ force: true }); } catch {}
      render();
    });

    // H clear all
    $('#om-clear-all')?.addEventListener('click', async () => {
      if (!confirm('Очистить весь кэш аудио?')) return;
      if (!confirm('Подтверди ещё раз: удалить кэш полностью?')) return;
      await mgr.clearAllCache();
      window.NotificationSystem?.success('Кэш очищен');
      render();
    });

    // I full offline
    const modeSel = $('#om-full-mode');
    const albBox = $('#om-albums-box');
    const out = $('#om-full-out');

    const showAlb = () => {
      const v = String(modeSel?.value || 'favorites');
      if (albBox) albBox.style.display = (v === 'albums') ? '' : 'none';
    };
    modeSel?.addEventListener('change', showAlb);
    showAlb();

    const getSelection = () => {
      const v = String(modeSel?.value || 'favorites');
      if (v === 'albums') {
        const keys = Array.from(modalEl.querySelectorAll('.om-alb:checked')).map(x => String(x.dataset.k || '').trim()).filter(Boolean);
        return { mode: 'albums', albumKeys: keys };
      }
      return { mode: 'favorites' };
    };

    $('#om-full-est')?.addEventListener('click', async () => {
      const sel = getSelection();

      // гарантируем, что TrackRegistry заполнен
      await preloadAllAlbumsTrackIndex();

      const est = await mgr.computeSizeEstimate(sel);
      if (!est?.ok) {
        if (out) out.textContent = `Оценка: ошибка (${String(est?.reason || 'unknown')})`;
        return;
      }
      if (out) out.textContent = `Оценка: ${Number(est.totalMB || 0).toFixed(1)} MB · треков: ${est.count || 0} · CQ=${est.cq}`;
    });

    $('#om-full-start')?.addEventListener('click', async () => {
      const netNow = getNetworkStatusSafe();
      if (!netNow.online) {
        window.NotificationSystem?.warning('Нет сети');
        return;
      }

      if (String(netNow.kind || '').toLowerCase() === 'unknown') {
        if (!confirm('Тип сети неизвестен. Продолжить?')) return;
      }

      // гарантируем, что TrackRegistry заполнен
      await preloadAllAlbumsTrackIndex();

      const sel = getSelection();
      const est = await mgr.computeSizeEstimate(sel);
      if (!est?.ok) {
        window.NotificationSystem?.error('Не удалось оценить набор');
        return;
      }
      if (!est.uids || est.uids.length === 0) {
        window.NotificationSystem?.info('Набор пуст');
        return;
      }

      // строгая проверка storage guarantee (iOS)
      const guarantee = await mgr._canGuaranteeStorageForMB?.(est.totalMB);
      if (!guarantee?.ok) {
        window.NotificationSystem?.error('Нельзя гарантировать место в хранилище. 100% OFFLINE не запущен.');
        return;
      }

      // Прогрев shell + assets через SW.
      // Включаем core страницы + новости + albums.json + gallery index'ы + обложки (webp/png) + lyrics/fulltext (best-effort).
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
      ]);

      // gallery index.json
      urls.add('./albums/gallery/00/index.json');
      urls.add('./albums/gallery/01/index.json');
      urls.add('./albums/gallery/02/index.json');
      urls.add('./albums/gallery/03/index.json');
      urls.add('./albums/gallery/news/index.json');

      // lyrics/fulltext urls best-effort: пройдём по uid → meta
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

      // Запускаем аудио
      const r = await mgr.startFullOffline(est.uids);
      if (r?.ok) {
        window.NotificationSystem?.info(`100% OFFLINE: поставлено ${r.total} треков`, 3500);
        render();
      } else {
        window.NotificationSystem?.error('Не удалось запустить 100% OFFLINE: ' + String(r?.reason || ''));
      }
    });

    // Live refresh on manager progress
    const unsub = mgr.on?.('progress', () => {
      // ✅ без полного render: только update с debounce
      schedule();
    });

    openOfflineModal.__unsub = unsub;

    // первый апдейт после открытия
    schedule();
  };

  // первичный рендер HTML (1 раз), затем update()
  render().catch((e) => {
    window.NotificationSystem?.error('OFFLINE modal ошибка');
    console.warn('OFFLINE modal render failed:', e);
  });
}

export function closeOfflineModal() {
  try { openOfflineModal.__unsub?.(); } catch {}
  openOfflineModal.__unsub = null;

  if (modalEl) {
    try { modalEl.remove(); } catch {}
    modalEl = null;
  }
}
