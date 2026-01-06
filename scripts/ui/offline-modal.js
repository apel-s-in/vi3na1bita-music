// scripts/ui/offline-modal.js
// OFFLINE modal (ТЗ_НЬЮ) — секции A–I + 100% OFFLINE + updates/re-cache + breakdown.
// Важно: модалка не трогает воспроизведение (no stop/play/seek/volume).

import { setNetPolicy, getNetPolicy } from '../offline/net-policy.js';

const LS_LIMIT_MODE = 'offline:cacheLimitMode:v1'; // 'auto'|'manual'
const LS_LIMIT_MB = 'offline:cacheLimitMB:v1';

function esc(s) {
  return window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');
}

function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${Math.floor(b)} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

function getNetworkStatusSafe() {
  try {
    if (window.NetworkManager?.getStatus) return window.NetworkManager.getStatus();
  } catch {}
  return { online: navigator.onLine !== false, kind: 'unknown', saveData: false };
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

  // Кэш needs* считаем редко (каждые 5с максимум), чтобы не делать await-loop на каждый progress
  let needsCache = { ts: 0, upd: 0, rec: 0 };
  async function computeNeedsCountsThrottled() {
    const now = Date.now();
    if (now - needsCache.ts < 5000) return { needsUpdateCount: needsCache.upd, needsReCacheCount: needsCache.rec };
    needsCache.ts = now;

    let needsUpdateCount = 0;
    let needsReCacheCount = 0;

    try {
      const all = window.TrackRegistry?.getAllTracks?.() || [];
      for (const t of all) {
        const uid = String(t?.uid || '').trim();
        if (!uid) continue;
        // eslint-disable-next-line no-await-in-loop
        const st = await mgr.getTrackOfflineState?.(uid);
        if (st?.needsUpdate) needsUpdateCount++;
        if (st?.needsReCache) needsReCacheCount++;
      }
    } catch {}

    needsCache.upd = needsUpdateCount;
    needsCache.rec = needsReCacheCount;
    return { needsUpdateCount, needsReCacheCount };
  }

  const albums = (Array.isArray(window.albumsIndex) ? window.albumsIndex : [])
    .filter(a => a && a.key && !String(a.key).startsWith('__'))
    .map(a => ({ key: String(a.key), title: String(a.title || a.key) }));

  const bodyHtml = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px;">
        <div style="font-weight:900; color:#8ab8fd;">Сеть: <span id="om-net-label">${esc(net.online ? 'online' : 'offline')} (${esc(net.kind || 'unknown')})</span></div>
        <div style="font-size:12px; color:#9db7dd;">CQ=<span id="om-cq-label">${esc(cq)}</span></div>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px;">

        <!-- A -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">A) Offline mode</div>
          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="om-offline-mode" ${isOff ? 'checked' : ''}>
            <span>Включить OFFLINE mode</span>
          </label>
          <div style="font-size:12px; color:#9db7dd; margin-top:6px;">
            OFFLINE=OFF: стриминг. Кэш не удаляется автоматически.
          </div>
        </div>

        <!-- B -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">B) Cache quality (CQ)</div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <select id="om-cq">
              <option value="hi" ${cq === 'hi' ? 'selected' : ''}>Hi</option>
              <option value="lo" ${cq === 'lo' ? 'selected' : ''}>Lo</option>
            </select>
            <button class="offline-btn" id="om-cq-save">Сохранить CQ</button>
          </div>
          <div style="font-size:12px; color:#9db7dd; margin-top:6px;">
            При смене CQ будет запущен тихий re-cache pinned/cloud (P3).
          </div>
        </div>

        <!-- C -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">C) Cloud settings</div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label style="display:flex; gap:8px; align-items:center;">
              N <input type="number" id="om-cloud-n" min="1" max="50" value="${Number(cloud.n) || 5}">
            </label>
            <label style="display:flex; gap:8px; align-items:center;">
              D <input type="number" id="om-cloud-d" min="1" max="365" value="${Number(cloud.d) || 31}">
            </label>
            <button class="offline-btn" id="om-cloud-save">Сохранить</button>
          </div>
        </div>

        <!-- D -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">D) Network policy</div>

          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="om-pol-wifiOnly" ${policy.wifiOnly ? 'checked' : ''}>
            <span>Wi‑Fi only</span>
          </label>

          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="om-pol-allowMobile" ${policy.allowMobile ? 'checked' : ''}>
            <span>Разрешить mobile</span>
          </label>

          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="om-pol-confirmOnMobile" ${policy.confirmOnMobile ? 'checked' : ''}>
            <span>Confirm на mobile</span>
          </label>

          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="om-pol-saveDataBlock" ${policy.saveDataBlock ? 'checked' : ''}>
            <span>Блокировать при Save‑Data</span>
          </label>

          <button class="offline-btn" id="om-pol-save" style="margin-top:8px;">Сохранить policy</button>

          <div style="font-size:12px; color:#9db7dd; margin-top:6px;">
            Unknown сеть для массовых операций — confirm (ТЗ).
          </div>
        </div>

        <!-- E -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">E) Cache limit + breakdown</div>

          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <select id="om-limit-mode">
              <option value="auto" ${limit.mode === 'auto' ? 'selected' : ''}>auto</option>
              <option value="manual" ${limit.mode === 'manual' ? 'selected' : ''}>manual (MB)</option>
            </select>
            <input type="number" id="om-limit-mb" min="50" max="5000" value="${limit.mb}" ${limit.mode === 'manual' ? '' : 'disabled'}>
            <button class="offline-btn" id="om-limit-save">Сохранить</button>
          </div>

          <div style="font-size:12px; color:#9db7dd; margin-top:10px; line-height:1.5;">
            <div>audio total: <b id="om-e-audio-total">${formatBytes(cacheSizeBytes)}</b></div>
            ${breakdown ? `
              <div>pinned: <b id="om-e-pinned">${formatBytes(breakdown.pinnedBytes)}</b></div>
              <div>cloud: <b id="om-e-cloud">${formatBytes(breakdown.cloudBytes)}</b></div>
              <div>transient window: <b id="om-e-tw">${formatBytes(breakdown.transientWindowBytes)}</b></div>
              <div>transient extra: <b id="om-e-te">${formatBytes(breakdown.transientExtraBytes)}</b></div>
              <div>transient unknown: <b id="om-e-tu">${formatBytes(breakdown.transientUnknownBytes)}</b></div>
            ` : `<div>breakdown: <i>недоступен</i></div>`}
            <div>other (SW cache): <b id="om-e-sw-total">${formatBytes(swSize.size || 0)}</b> ${swSize.approx ? '(approx)' : ''}</div>
          </div>
        </div>

        <!-- F -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">F) Загрузки</div>
          <div style="font-size:12px; color:#9db7dd; line-height:1.5;">
            <div>Скачивается сейчас: <b id="om-f-downloading">${esc(qst.downloadingKey || '—')}</b></div>
            <div>В очереди: <b id="om-f-queued">${Number(qst.queued || 0)}</b></div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
            <button class="offline-btn" id="om-queue-toggle">${qst.paused ? 'Возобновить' : 'Пауза'}</button>
          </div>
        </div>

        <!-- G -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">G) Обновления</div>
          <div style="font-size:12px; color:#9db7dd; line-height:1.5;">
            <div>needsUpdate: <b id="om-g-needsUpdate">${needsUpdateCount}</b></div>
            <div>needsReCache (CQ mismatch): <b id="om-g-needsReCache">${needsReCacheCount}</b></div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
            <button class="offline-btn" id="om-upd-all">Обновить все файлы</button>
            <button class="offline-btn" id="om-recache-all">Re-cache по CQ</button>
          </div>
          <div style="font-size:12px; color:#9db7dd; margin-top:6px;">
            Обновления и re-cache выполняются тихо, без влияния на playback.
          </div>
        </div>

        <!-- H -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">H) Очистка кэша</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="offline-btn" id="om-clear-all" style="background:#E80100; color:#fff;">Очистить всё</button>
          </div>
          <div style="font-size:12px; color:#9db7dd; margin-top:6px;">
            Двойное подтверждение для "очистить всё" (и для pinned) — по ТЗ.
          </div>
        </div>

        <!-- I -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">I) 100% OFFLINE</div>

          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <select id="om-full-mode">
              <option value="favorites">только ИЗБРАННОЕ</option>
              <option value="albums">выбранные альбомы</option>
            </select>
            <button class="offline-btn" id="om-full-est">Оценить</button>
            <button class="offline-btn" id="om-full-start" style="background:#27b34c; color:#fff;">Старт</button>
          </div>

          <div id="om-albums-box" style="margin-top:10px; display:none; max-height:140px; overflow:auto; border:1px solid rgba(255,255,255,0.10); border-radius:10px; padding:8px;">
            ${albums.length ? albums.map(a => `
              <label style="display:flex; gap:10px; align-items:center; margin:6px 0; cursor:pointer;">
                <input type="checkbox" class="om-alb" data-k="${esc(a.key)}">
                <span>${esc(a.title)}</span>
              </label>
            `).join('') : `<div style="font-size:12px; color:#9db7dd;">albumsIndex пуст</div>`}
          </div>

          <div id="om-full-out" style="margin-top:10px; font-size:12px; color:#9db7dd;">Оценка: —</div>

          <div style="font-size:12px; color:#9db7dd; margin-top:8px;">
            100% OFFLINE = CQ=${esc(cq)} + shell/ассеты через SW. При невозможности гарантировать место — не стартуем (ТЗ iOS).
          </div>
        </div>

        <!-- Stats footer -->
        <div style="padding:12px; border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
          <div style="font-weight:900; color:#8ab8fd; margin-bottom:8px;">Статистика</div>
          <div style="font-size:12px; color:#9db7dd; line-height:1.5;">
            <div>globalTotalListenSeconds: <b id="om-stats-total">${formatDuration(totalSec)}</b></div>
          </div>
        </div>

      </div>
    `;

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

      const needs = await computeNeedsCountsThrottled();

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
      render();
    });

    $('#om-recache-all')?.addEventListener('click', async () => {
      const r = await mgr.enqueueReCacheAllByCQ?.({ userInitiated: true });
      if (r?.ok) window.NotificationSystem?.info(`Re-cache: поставлено ${r.count} задач`);
      else window.NotificationSystem?.error('Не удалось запустить re-cache');
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
