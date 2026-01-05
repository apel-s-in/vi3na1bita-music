// scripts/ui/offline-modal.js
// OFFLINE Modal (A–D) — MVP по ТЗ_Нью.
// Важно: НЕ управляет воспроизведением, только настройками OfflineManager и UI.

// Импорт удален для устранения циклической зависимости

import { getNetPolicy, setNetPolicy, shouldConfirmByPolicy } from '../offline/net-policy.js';
import { getAllUids, registerTrack } from '../app/track-registry.js';

const ALERT_KEY = 'offline:alert:v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const j = JSON.parse(raw);
    return (j === null || j === undefined) ? fallback : j;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function getNetworkStatus() {
  try {
    if (window.NetworkManager && typeof window.NetworkManager.getStatus === 'function') {
      return window.NetworkManager.getStatus();
    }
  } catch {}
  return { online: navigator.onLine !== false, kind: 'unknown', raw: null, saveData: false };
}

// ✅ Remote preload: загрузить config.json всех альбомов из albums.json и зарегистрировать треки в TrackRegistry.
export async function preloadAllAlbumsTrackIndex() {
  const albums = Array.isArray(window.albumsIndex) ? window.albumsIndex : [];
  if (!albums.length) {
    return { ok: false, reason: 'noAlbumsIndex', totalAlbums: 0, totalTracks: 0, uids: [] };
  }

  const uids = new Set();
  let totalTracks = 0;
  let okAlbums = 0;
  let failAlbums = 0;

  for (const a of albums) {
    const baseRaw = String(a?.base || '').trim();
    if (!baseRaw) { failAlbums += 1; continue; }

    const base = baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`;
    const url = `${base}config.json`;

    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) { failAlbums += 1; continue; }

      // eslint-disable-next-line no-await-in-loop
      const cfg = await r.json();
      const tracks = Array.isArray(cfg?.tracks) ? cfg.tracks : [];
      okAlbums += 1;

      for (const t of tracks) {
        const uid = String(t?.uid || '').trim();
        if (!uid) continue;

        totalTracks += 1;
        uids.add(uid);

        // ✅ Регистрируем в TrackRegistry (минимальный meta для offline/download)
        // Важно: audio/audio_low в config.json относительные → делаем абсолютными от base.
        const audio = t?.audio ? new URL(String(t.audio), base).toString() : null;
        const audio_low = t?.audio_low ? new URL(String(t.audio_low), base).toString() : null;

        registerTrack({
          uid,
          title: t?.title || '',
          audio,
          audio_low,
          size: (typeof t?.size === 'number') ? t.size : null,
          size_low: (typeof t?.size_low === 'number') ? t.size_low : null,
          lyrics: t?.lyrics ? new URL(String(t.lyrics), base).toString() : null,
          fulltext: t?.fulltext ? new URL(String(t.fulltext), base).toString() : null,
          sourceAlbum: String(a?.key || '').trim() || null
        });
      }
    } catch {
      failAlbums += 1;
    }
  }

  return {
    ok: okAlbums > 0,
    totalAlbums: albums.length,
    okAlbums,
    failAlbums,
    totalTracks,
    uids: Array.from(uids)
  };
}

function setAlert(flag, reason) {
  const next = !!flag;
  const payload = { on: next, ts: Date.now(), reason: String(reason || '') };
  writeJson(ALERT_KEY, payload);
  return payload;
}

function getAlert() {
  const a = readJson(ALERT_KEY, { on: false, ts: 0, reason: '' });
  return {
    on: !!a?.on,
    ts: Number(a?.ts || 0),
    reason: String(a?.reason || '')
  };
}

function fmtNet(st) {
  if (!st) return '—';
  const online = st.online ? 'online' : 'offline';
  const kind = st.kind || 'unknown';
  return `${online}, ${kind}`;
}

function ensureModal(html) {
  if (window.Utils && typeof window.Utils.createModal === 'function') {
    return window.Utils.createModal(html);
  }
  return null;
}

async function renderModal() {
  const om = window.OfflineUI?.offlineManager;
  if (!om) return null;

  const isOffline = om.isOfflineMode();
  const cq = await om.getCacheQuality();
  const st = getNetworkStatus();
  const policy = getNetPolicy();
  const alert = getAlert();

  const html = `
    <div class="modal-feedback" style="max-width: 520px;">
      <button class="bigclose" title="Закрыть" aria-label="Закрыть">
        <svg viewBox="0 0 48 48">
          <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
        </svg>
      </button>

      <div style="font-size: 1.1em; font-weight: 900; color: #eaf2ff; margin-bottom: 10px;">
        OFFLINE
      </div>

      <div style="color:#9db7dd; line-height:1.45; margin-bottom: 14px;">
        <div><strong>Сеть:</strong> ${fmtNet(st)}</div>
        <div><strong>Режим:</strong> <span id="offline-modal-mode">${isOffline ? 'OFFLINE' : 'ONLINE'}</span></div>
        ${alert.on ? `<div style="margin-top:8px; color:#ff9800;"><strong>!</strong> ${alert.reason || 'Требуется внимание'}</div>` : ''}
      </div>

      <!-- A: Offline mode -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 8px;">
        <div style="font-weight: 900; color:#eaf2ff; margin-bottom: 8px;">A) Offline Mode</div>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button class="offline-btn ${isOffline ? 'offline' : 'online'}" id="offline-modal-toggle" style="min-width: 220px;">
            ${isOffline ? 'Выключить OFFLINE' : 'Включить OFFLINE'}
          </button>
        </div>
        <div style="margin-top:8px; font-size: 12px; color:#9db7dd; text-align:center;">
          OFFLINE режим влияет на поведение кэша и доступность функций при отсутствии сети.
        </div>
      </div>

      <!-- B: Cache Quality -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 12px;">
        <div style="font-weight: 900; color:#eaf2ff; margin-bottom: 8px;">B) Cache Quality (CQ)</div>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button class="offline-btn ${cq === 'hi' ? 'offline' : 'online'}" id="offline-modal-cq-hi" style="min-width: 160px;">
            CQ: Hi
          </button>
          <button class="offline-btn ${cq === 'lo' ? 'offline' : 'online'}" id="offline-modal-cq-lo" style="min-width: 160px;">
            CQ: Lo
          </button>
        </div>
        <div style="margin-top:8px; font-size: 12px; color:#9db7dd; text-align:center;">
          CQ управляет качеством, в котором мы стараемся держать офлайн-кэш.
        </div>
      </div>

      <!-- C: Cloud settings + Pinned / actions -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 12px;">
        <div style="font-weight: 900; color:#eaf2ff; margin-bottom: 8px;">C) Cloud settings</div>

        <div style="color:#9db7dd; line-height:1.45; margin-bottom: 10px;">
          <div style="opacity:.9;">
            ☁ появляется, когда трек является cloudCandidate, 100% в CQ, и выполнены N/D условия.
          </div>
        </div>

        <div style="display:grid; gap:10px; margin-bottom: 12px;">
          <label style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
            <span style="color:#cfe3ff;">N (полных прослушиваний)</span>
            <input id="offline-cloud-n" type="number" min="1" max="50" step="1"
                   style="width:110px; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.2); color:#eaf2ff;">
          </label>

          <label style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
            <span style="color:#cfe3ff;">D (TTL дней)</span>
            <input id="offline-cloud-d" type="number" min="1" max="365" step="1"
                   style="width:110px; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.2); color:#eaf2ff;">
          </label>

          <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
            <button class="offline-btn online" id="offline-cloud-save" style="min-width: 220px;">
              Сохранить Cloud N/D
            </button>
          </div>
        </div>

        <div style="font-weight: 900; color:#eaf2ff; margin: 6px 0 8px;">Pinned / Cache</div>

        <div style="color:#9db7dd; line-height:1.45; margin-bottom: 10px;">
          <div><strong>Кэш (примерно):</strong> <span id="offline-cache-size">...</span></div>
          <div><strong>Pinned:</strong> <span id="offline-pinned-count">...</span></div>
        </div>

        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button class="offline-btn online" id="offline-modal-download-pinned" style="min-width: 220px;">
            Скачать всё pinned 🔒
          </button>

          <button class="offline-btn online" id="offline-modal-load-all-tracks" style="min-width: 220px;">
            Загрузить список треков всех альбомов
          </button>

          <button class="offline-btn online" id="offline-modal-offline-all" style="min-width: 220px;">
            100% OFFLINE (всё)
          </button>

          <button class="offline-btn" id="offline-modal-clear-cache" style="min-width: 220px;">
            Очистить кэш
          </button>

          <button class="offline-btn" id="offline-modal-clear-alert" style="min-width: 220px;">
            Сбросить "!" (прочитано)
          </button>
        </div>

        <div id="offline-mass-status" style="margin-top:10px; font-size:12px; color:#9db7dd; text-align:left;"></div>
        <div id="offline-pinned-list" style="margin-top:10px; font-size:12px; color:#9db7dd; text-align:left;"></div>
      </div>

      <!-- D: Network policy -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 12px;">
        <div style="font-weight: 900; color:#eaf2ff; margin-bottom: 8px;">D) Network Policy</div>

        <div style="display:grid; gap:8px;">
          <label style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
            <span style="color:#cfe3ff;">Скачивать только по Wi‑Fi</span>
            <input type="radio" name="offline-netpolicy" value="wifi" ${policy === 'wifi' ? 'checked' : ''}>
          </label>

          <label style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
            <span style="color:#cfe3ff;">Разрешить по мобильной сети</span>
            <input type="radio" name="offline-netpolicy" value="cellular" ${policy === 'cellular' ? 'checked' : ''}>
          </label>

          <label style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
            <span style="color:#cfe3ff;">Unknown сеть: разрешить</span>
            <input type="radio" name="offline-netpolicy" value="unknown" ${policy === 'unknown' ? 'checked' : ''}>
          </label>

          <label style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
            <span style="color:#cfe3ff;">Всегда спрашивать</span>
            <input type="radio" name="offline-netpolicy" value="ask" ${policy === 'ask' ? 'checked' : ''}>
          </label>
        </div>

        <div style="margin-top:8px; font-size: 12px; color:#9db7dd; text-align:center;">
          На iOS Network Information API часто недоступен → будет Unknown.
        </div>
      </div>
    </div>
  `;

  return ensureModal(html);
}

function bindModalHandlers(modal) {
  const om = window.OfflineUI?.offlineManager;
  if (!modal || !om) return;

  const fmtBytes = (b) => {
    const n = Number(b || 0);
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(n) / Math.log(k)));
    const val = n / Math.pow(k, i);
    return `${val.toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
  };

  const fillStats = async () => {
    try {
      const bytes = await om.getCacheSizeBytes();
      const pinned = om.getPinnedUids();

      const sizeEl = modal.querySelector('#offline-cache-size');
      const pcEl = modal.querySelector('#offline-pinned-count');
      const listEl = modal.querySelector('#offline-pinned-list');

      if (sizeEl) sizeEl.textContent = fmtBytes(bytes);
      if (pcEl) pcEl.textContent = String(pinned.length);

      // Mass status (100% OFFLINE)
      try {
        const ms = om.getMassStatus?.() || null;
        const msEl = modal.querySelector('#offline-mass-status');

        if (msEl) {
          if (!ms || !ms.total) {
            msEl.textContent = '100% OFFLINE: не запущено.';
          } else {
            const done = Number(ms.done || 0);
            const err = Number(ms.error || 0);
            const sk = Number(ms.skipped || 0);
            const total = Number(ms.total || 0);
            const active = !!ms.active;
            msEl.textContent = `100% OFFLINE: ${done}/${total} (ошибки: ${err}, пропущено: ${sk}) ${active ? '— выполняется…' : '— готово'}`;
          }
        }
      } catch {}

      // Cloud N/D
      try {
        const { n, d } = om.getCloudSettings();
        const nInp = modal.querySelector('#offline-cloud-n');
        const dInp = modal.querySelector('#offline-cloud-d');
        if (nInp) nInp.value = String(n);
        if (dInp) dInp.value = String(d);
      } catch {}

      if (listEl) {
        if (!pinned.length) {
          listEl.textContent = 'Pinned список пуст.';
        } else {
          listEl.innerHTML = `
            <div style="opacity:.9; margin-bottom:6px;">UID pinned:</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${pinned.map(u => `<span style="padding:3px 8px; border:1px solid rgba(255,255,255,.12); border-radius:999px;">${String(u)}</span>`).join('')}
            </div>
          `;
        }
      }
    } catch {
      // no-op
    }
  };

  const rerender = async () => {
    try { modal.remove(); } catch {}
    const next = await renderModal();
    bindModalHandlers(next);
  };

  // Заполним статистику после рендера
  fillStats();

  modal.querySelector('#offline-modal-toggle')?.addEventListener('click', async () => {
    const next = !om.isOfflineMode();
    om.setOfflineMode(next);

    // По ТЗ: тосты (минимум 2 штуки по событию)
    if (next) {
      window.NotificationSystem?.offline('OFFLINE режим включён');
      window.NotificationSystem?.info('Кэш будет подстраиваться под CQ и политику сети');
      // Ставим alert, чтобы "!" появился (как сигнал)
      setAlert(true, 'OFFLINE включён. Проверьте CQ и политику сети.');
    } else {
      window.NotificationSystem?.success('OFFLINE режим выключен');
      window.NotificationSystem?.info('ONLINE режим активен');
      // alert можно снять
      setAlert(false, '');
    }

    // Обновим кнопку снаружи (bootstrap слушает storage/или вызовем событие)
    try { window.dispatchEvent(new CustomEvent('offline:uiChanged')); } catch {}

    await rerender();
  });

  modal.querySelector('#offline-modal-cq-hi')?.addEventListener('click', async () => {
    await om.setCacheQuality('hi');
    window.NotificationSystem?.success('CQ: Hi');
    await rerender();
  });

  modal.querySelector('#offline-modal-cq-lo')?.addEventListener('click', async () => {
    await om.setCacheQuality('lo');
    window.NotificationSystem?.success('CQ: Lo');
    await rerender();
  });

  modal.querySelector('#offline-modal-download-pinned')?.addEventListener('click', async () => {
    try {
      const policy = getNetPolicy();
      const st = getNetworkStatus();

      // ✅ Массовая операция: confirm обязателен для unknown (и для ask)
      if (shouldConfirmByPolicy(policy, st, { isMass: true, isAuto: false })) {
        const ok = window.confirm('Это массовая загрузка (все pinned). Продолжить по текущей сети?');
        if (!ok) return;
      }

      om.enqueuePinnedDownloadAll();
      window.NotificationSystem?.success('Очередь pinned поставлена');
    } catch {
      window.NotificationSystem?.error('Не удалось поставить pinned в очередь');
    } finally {
      await rerender();
    }
  });

  modal.querySelector('#offline-modal-load-all-tracks')?.addEventListener('click', async () => {
    try {
      const policy = getNetPolicy();
      const st = getNetworkStatus();

      // ✅ Это массовая операция (remote fetch + подготовка), confirm обязателен для unknown (и для ask)
      if (shouldConfirmByPolicy(policy, st, { isMass: true, isAuto: false })) {
        const ok = window.confirm('Загрузить список треков всех альбомов? Будут сделаны запросы к config.json каждого альбома.');
        if (!ok) return;
      }

      window.NotificationSystem?.info('Загружаю список треков всех альбомов…', 3500);

      const res = await preloadAllAlbumsTrackIndex();
      if (!res.ok) {
        window.NotificationSystem?.error('Не удалось загрузить список треков');
        return;
      }

      window.NotificationSystem?.success(`Готово: альбомов OK ${res.okAlbums}/${res.totalAlbums}, треков: ${res.uids.length}`);
    } catch {
      window.NotificationSystem?.error('Не удалось загрузить список треков');
    } finally {
      await rerender();
    }
  });

  modal.querySelector('#offline-modal-offline-all')?.addEventListener('click', async () => {
    // 1. Показать выбор: "Всё" или "Выбрать альбомы"
    try { modal.remove(); } catch {}
    
    // Подгрузим список треков, чтобы знать размеры
    const preload = await preloadAllAlbumsTrackIndex();
    if (!preload.ok) {
      window.NotificationSystem?.error('Ошибка загрузки данных об альбомах');
      return;
    }

    const albums = window.albumsIndex || [];
    
    const html = `
      <div class="modal-feedback" style="max-width: 400px;">
        <h3 style="color:#eaf2ff; margin-top:0;">100% OFFLINE</h3>
        <p style="color:#9db7dd; font-size:14px;">Выберите, что скачать:</p>
        
        <div style="max-height:40vh; overflow-y:auto; margin-bottom:15px; border:1px solid #333; padding:10px; border-radius:8px;">
          <label style="display:flex; gap:10px; padding:8px 0; border-bottom:1px solid #333;">
            <input type="checkbox" id="off-all-check" checked> 
            <strong style="color:#fff;">Все альбомы</strong>
          </label>
          ${albums.map(a => `
            <label style="display:flex; gap:10px; padding:8px 0; margin-left:20px;">
              <input type="checkbox" class="off-album-check" value="${a.key}" checked>
              <span style="color:#ccc;">${a.title}</span>
            </label>
          `).join('')}
          <label style="display:flex; gap:10px; padding:8px 0; border-top:1px solid #333; margin-top:5px;">
            <input type="checkbox" id="off-fav-check" checked>
            <span style="color:#ffd166;">Только ИЗБРАННОЕ</span>
          </label>
        </div>

        <div style="display:flex; gap:10px; justify-content:center;">
          <button class="offline-btn online" id="off-start-btn">Начать</button>
          <button class="offline-btn" onclick="this.closest('.modal-bg').remove()">Отмена</button>
        </div>
      </div>
    `;
    
    const selModal = window.Utils.createModal(html);
    
    // Логика чекбоксов
    const allCheck = selModal.querySelector('#off-all-check');
    const albumChecks = selModal.querySelectorAll('.off-album-check');
    
    allCheck.addEventListener('change', () => {
      albumChecks.forEach(c => c.checked = allCheck.checked);
    });

    selModal.querySelector('#off-start-btn').addEventListener('click', async () => {
      const selectedKeys = Array.from(albumChecks).filter(c => c.checked).map(c => c.value);
      const includeFav = selModal.querySelector('#off-fav-check').checked;
      
      // Сбор UID
      const uidsToDownload = new Set();
      
      // Из альбомов
      const tr = window.TrackRegistry; // нужен доступ к реестру
      // Мы не экспортируем реестр напрямую, но можем итерироваться по preload.uids
      // preload.uids - это список всех UID. Нам нужно отфильтровать по альбому.
      // TrackRegistry.getTrackByUid(uid).sourceAlbum
      
      if (tr) {
        preload.uids.forEach(uid => {
          const meta = tr.getTrackByUid(uid);
          if (meta && selectedKeys.includes(meta.sourceAlbum)) {
            uidsToDownload.add(uid);
          }
        });
      }

      // Из избранного
      if (includeFav && window.FavoritesManager) {
        const favMap = window.FavoritesManager.getLikedUidMap(); // { album: [uids] }
        Object.values(favMap).flat().forEach(u => uidsToDownload.add(u));
      }

      const finalList = Array.from(uidsToDownload);
      selModal.remove();

      if (finalList.length === 0) {
        window.NotificationSystem?.warning('Ничего не выбрано');
        return;
      }

      // Политика
      const policy = getNetPolicy();
      const st = getNetworkStatus();
      if (shouldConfirmByPolicy(policy, st, { isMass: true })) {
        const ok = window.confirm(`Скачать ${finalList.length} треков? Трафик может быть большим.`);
        if (!ok) return;
      }

      om.startFullOffline(finalList);
      window.NotificationSystem?.success(`Запущена загрузка: ${finalList.length} треков`);
      await rerender(); // обновить статус в главной модалке
    });

  } catch (e) { console.error(e); }
  }); // End of replacing listener
      const policy = getNetPolicy();
      const st = getNetworkStatus();

      // ✅ 100% OFFLINE — массовая операция: confirm обязателен для unknown (и для ask)
      if (shouldConfirmByPolicy(policy, st, { isMass: true, isAuto: false })) {
        const ok = window.confirm('100% OFFLINE: скачать все треки до CQ? Это может занять время и трафик.');
        if (!ok) return;
      }

      // ✅ Если треки ещё не загружены в реестр — подгружаем remote configs автоматически
      let uids = getAllUids();
      if (!Array.isArray(uids) || uids.length === 0) {
        const preload = await preloadAllAlbumsTrackIndex();
        uids = preload?.uids || [];
      }

      const total = Array.isArray(uids) ? uids.length : 0;
      if (!total) {
        window.NotificationSystem?.warning('Нет треков для 100% OFFLINE');
        return;
      }

      const res = om.enqueueOfflineAll?.(uids);
      if (res?.ok) {
        window.NotificationSystem?.success(`100% OFFLINE поставлено в очередь: ${res.total}`);
      } else {
        window.NotificationSystem?.error('Не удалось запустить 100% OFFLINE');
      }
    } catch {
      window.NotificationSystem?.error('Не удалось запустить 100% OFFLINE');
    } finally {
      await rerender();
    }
  });

  modal.querySelector('#offline-modal-clear-cache')?.addEventListener('click', async () => {
    const ok = window.confirm('Очистить кэш? Это удалит blobs/bytes и сбросит cloud-статистику. Воспроизведение не остановится.');
    if (!ok) return;

    try {
      const done = await om.clearAllCache();
      if (done) window.NotificationSystem?.success('Кэш очищен');
      else window.NotificationSystem?.error('Не удалось очистить кэш');
    } catch {
      window.NotificationSystem?.error('Не удалось очистить кэш');
    } finally {
      try { window.dispatchEvent(new CustomEvent('offline:uiChanged')); } catch {}
      await rerender();
    }
  });

  modal.querySelector('#offline-cloud-save')?.addEventListener('click', async () => {
    const nInp = modal.querySelector('#offline-cloud-n');
    const dInp = modal.querySelector('#offline-cloud-d');

    const n = Number(nInp?.value);
    const d = Number(dInp?.value);

    const next = om.setCloudSettings({ n, d });

    window.NotificationSystem?.success(`Cloud: N=${next.n}, D=${next.d}`);
    await rerender();
  });

  modal.querySelector('#offline-modal-clear-alert')?.addEventListener('click', async () => {
    setAlert(false, '');
    window.NotificationSystem?.success('Ок');
    try { window.dispatchEvent(new CustomEvent('offline:uiChanged')); } catch {}
    await rerender();
  });

  modal.querySelectorAll('input[name="offline-netpolicy"]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const v = String(inp.value || 'ask');
      const next = setNetPolicy(v);

      // ✅ Confirm больше не показываем при выборе настройки.
      // По ТЗ confirm должен быть на старте массовых операций (100% OFFLINE / download all pinned / updates).
      window.NotificationSystem?.info('Политика сети сохранена');
      try { window.dispatchEvent(new CustomEvent('offline:uiChanged')); } catch {}
    });
  });
}

export async function openOfflineModal() {
  const modal = await renderModal();
  if (!modal) return;

  bindModalHandlers(modal);

  // По уточнению: тосты показываем только при включении OFFLINE, не при открытии модалки.
}

export const OfflineModal = { open: openOfflineModal };
