/**
 * OFFLINE Modal — ТЗ 11.2 секции A–I
 */

import {
  getMode, setMode, MODES,
  getCacheQuality, setCacheQuality,
  getFullOfflineQuality, setFullOfflineQuality,
  enableDynamicOffline, disableDynamicOffline,
  canGuaranteeStorage, onModeChange
} from './mode-manager.js';

import {
  togglePinned,
  getCacheLimit, getCacheLimitMode, setCacheLimitMode, setCacheLimitManual,
  getBreakdown, updateAllFiles,
  clearCacheByCategory, clearAllCache,
  computeSizeEstimate, getFullOfflineSelection, setFullOfflineSelection,
  getFullOfflineAssets, setFullOfflineAssets,
  startFullOfflineDownload, activateFullOffline, deactivateFullOffline,
  isFullOfflineReady, removeFromFullOffline,
  hasNeedsUpdateOrReCache, getAllTracks, getAlbumsData
} from './offline-manager.js';

import {
  getStatus as getQueueStatus, pauseQueue, resumeQueue,
  getBackgroundProfile, setBackgroundProfile, getAvailableProfiles,
  onStatusChange, offStatusChange
} from './download-queue.js';

import { getStorageEstimate, getAllTrackMetas } from './cache-db.js';

let _modal = null;
let _isOpen = false;
let _dlPollTimer = null;

function _toast(msg, d) { if (window.showToast) window.showToast(msg, d || 3000); }

// ===================== PUBLIC =====================

function init() {
  _ensureDOM();
  _bindGlobal();
}

function open() {
  _ensureDOM();
  _modal.style.display = 'flex';
  _isOpen = true;
  _refreshAll();
  _dlPollTimer = setInterval(_refreshDownloads, 2000);
}

function close() {
  if (_modal) _modal.style.display = 'none';
  _isOpen = false;
  if (_dlPollTimer) { clearInterval(_dlPollTimer); _dlPollTimer = null; }
}

function isOpen() { return _isOpen; }

// ===================== DOM =====================

function _ensureDOM() {
  if (_modal) return;
  _modal = document.createElement('div');
  _modal.id = 'offline-modal-v2';
  _modal.className = 'ofl-overlay';
  _modal.style.display = 'none';
  _modal.innerHTML = _html();
  document.body.appendChild(_modal);
  _bind();
}

function _html() {
  return `
<div class="ofl-content">
  <div class="ofl-hdr"><h2>OFFLINE</h2><button class="ofl-close" data-act="close">✕</button></div>
  <div class="ofl-body">

    <section class="ofl-sec">
      <h3>Режимы кэширования</h3>
      <div class="ofl-row"><span>PlaybackCache (3 трека)</span>
        <label class="ofl-sw"><input type="checkbox" id="ofl-r1"><span class="ofl-sl"></span></label></div>
      <div class="ofl-row"><span>Dynamic Offline</span>
        <label class="ofl-sw"><input type="checkbox" id="ofl-r2"><span class="ofl-sl"></span></label></div>
      <p class="ofl-hint" id="ofl-mode-hint"></p>
    </section>

    <section class="ofl-sec">
      <h3>Качество кэша</h3>
      <div class="ofl-rr">
        <label class="ofl-rl"><input type="radio" name="ofl-cq" value="hi" id="ofl-cq-hi"><span>Hi</span></label>
        <label class="ofl-rl"><input type="radio" name="ofl-cq" value="lo" id="ofl-cq-lo"><span>Lo</span></label>
      </div>
    </section>

    <section class="ofl-sec">
      <h3>Облачко ☁</h3>
      <div class="ofl-ir"><label>Полных прослушиваний (N):</label><input type="number" id="ofl-cn" min="1" max="99" value="5"></div>
      <div class="ofl-ir"><label>Дней хранения (D):</label><input type="number" id="ofl-cd" min="1" max="365" value="31"></div>
    </section>

    <section class="ofl-sec">
      <h3>Сетевая политика</h3>
      <div class="ofl-row"><span>Wi-Fi</span>
        <label class="ofl-sw"><input type="checkbox" id="ofl-nw" checked><span class="ofl-sl"></span></label></div>
      <div class="ofl-row"><span>Мобильная сеть</span>
        <label class="ofl-sw"><input type="checkbox" id="ofl-nm" checked><span class="ofl-sl"></span></label></div>
      <p class="ofl-hint">Неизвестная сеть → подтверждение при массовых операциях.</p>
    </section>

    <section class="ofl-sec">
      <h3>Лимит кэша</h3>
      <div class="ofl-rr">
        <label class="ofl-rl"><input type="radio" name="ofl-lm" value="auto" id="ofl-la"><span>Авто</span></label>
        <label class="ofl-rl"><input type="radio" name="ofl-lm" value="manual" id="ofl-lman"><span>Ручной</span></label>
      </div>
      <div class="ofl-ir" id="ofl-lmr" style="display:none"><label>МБ:</label><input type="number" id="ofl-lmb" min="60" max="50000" value="500"></div>
      <div id="ofl-bd" class="ofl-bd">Загрузка…</div>
    </section>

    <section class="ofl-sec">
      <h3>Загрузки</h3>
      <div id="ofl-dls">Нет активных загрузок</div>
      <div class="ofl-br"><button class="ofl-btn" data-act="dlp">Пауза</button><button class="ofl-btn" data-act="dlr">Возобновить</button></div>
    </section>

    <section class="ofl-sec">
      <h3>Обновления</h3>
      <button class="ofl-btn" data-act="upd">Обновить все файлы</button>
      <p class="ofl-hint" id="ofl-uh"></p>
    </section>

    <section class="ofl-sec">
      <h3>Очистка кэша</h3>
      <div class="ofl-bc">
        <button class="ofl-btn ofl-w" data-clr="dynamic">Dynamic</button>
        <button class="ofl-btn ofl-w" data-clr="playbackWindow">Playback Window</button>
        <button class="ofl-btn ofl-d" data-clr="cloud">Cloud ☁</button>
        <button class="ofl-btn ofl-d" data-clr="pinned">Pinned 🔒</button>
        <button class="ofl-btn ofl-d" data-clr="fullOffline">100% OFFLINE</button>
        <button class="ofl-btn ofl-d" data-act="clrall">Очистить всё</button>
      </div>
    </section>

    <section class="ofl-sec" id="ofl-fo-sec">
      <h3>100% OFFLINE</h3>

      <div class="ofl-sub"><h4>Качество</h4>
        <div class="ofl-rr">
          <label class="ofl-rl"><input type="radio" name="ofl-foq" value="hi" id="ofl-fh"><span>Hi</span></label>
          <label class="ofl-rl"><input type="radio" name="ofl-foq" value="lo" id="ofl-fl"><span>Lo</span></label>
        </div>
      </div>

      <div class="ofl-sub"><h4>Состав набора</h4>
        <div class="ofl-row"><span>Только ИЗБРАННОЕ</span>
          <label class="ofl-sw"><input type="checkbox" id="ofl-fof"><span class="ofl-sl"></span></label></div>
        <div id="ofl-foa"></div>
      </div>

      <div class="ofl-sub"><h4>Ассеты</h4>
        <div class="ofl-row"><span>Обложки</span>
          <label class="ofl-sw"><input type="checkbox" id="ofl-foc" checked><span class="ofl-sl"></span></label></div>
        <div class="ofl-row"><span>Галерея</span>
          <label class="ofl-sw"><input type="checkbox" id="ofl-fog"><span class="ofl-sl"></span></label></div>
      </div>

      <div class="ofl-sub">
        <div id="ofl-foe" class="ofl-hint"></div>
        <button class="ofl-btn" data-act="est">Оценить размер</button>
      </div>

      <div class="ofl-sub">
        <button class="ofl-btn ofl-p" data-act="fost">Начать загрузку</button>
        <div id="ofl-fop" style="display:none">
          <div class="ofl-pb"><div class="ofl-pf" id="ofl-fopf"></div></div>
          <p id="ofl-fopt"></p>
        </div>
      </div>

      <div class="ofl-sub" id="ofl-foas" style="display:none">
        <button class="ofl-btn ofl-p" data-act="foact">Включить 100% OFFLINE</button>
        <button class="ofl-btn" data-act="fodeact" style="display:none">Выключить 100% OFFLINE</button>
      </div>

      <div class="ofl-sub"><h4>Треки в наборе</h4><div id="ofl-fotl" class="ofl-fotl"></div></div>

      <div class="ofl-sub"><h4>Профиль загрузки</h4><select id="ofl-bp" class="ofl-sel"></select></div>
    </section>
  </div>
</div>`;
}

// ===================== BIND =====================

function _bind() {
  _modal.addEventListener('click', async (e) => {
    const t = e.target;
    const act = t.dataset.act || t.closest('[data-act]')?.dataset.act;
    const clr = t.dataset.clr || t.closest('[data-clr]')?.dataset.clr;

    if (act === 'close' || t === _modal) { close(); return; }
    if (act === 'dlp') { pauseQueue(); return; }
    if (act === 'dlr') { resumeQueue(); return; }
    if (act === 'upd') { const c = await updateAllFiles(); _toast(`Обновление: ${c} файлов`); return; }
    if (act === 'clrall') {
      if (confirm('Очистить весь кэш?') && confirm('Точно?')) { await clearAllCache(); _refreshBreakdown(); }
      return;
    }
    if (clr) {
      if ((clr === 'pinned' || clr === 'cloud') && (!confirm(`Удалить ${clr}?`) || !confirm('Точно?'))) return;
      await clearCacheByCategory(clr); _refreshBreakdown(); _toast(`${clr} очищен`);
      return;
    }
    if (act === 'est') { _doEstimate(); return; }
    if (act === 'fost') { _doStart(); return; }
    if (act === 'foact') { _doActivate(); return; }
    if (act === 'fodeact') { _doDeactivate(); return; }

    // FO track actions
    const foAct = t.dataset.foact || t.closest('[data-foact]')?.dataset.foact;
    const foUid = t.dataset.uid || t.closest('[data-uid]')?.dataset.uid;
    if (foAct === 'remove' && foUid) {
      await removeFromFullOffline(foUid);
      _refreshFOTracklist();
      return;
    }
  });

  // Mode toggles
  const r1 = _modal.querySelector('#ofl-r1');
  const r2 = _modal.querySelector('#ofl-r2');

  r1?.addEventListener('change', async () => {
    const m = getMode();
    if (r1.checked) {
      if (m === MODES.R3) { r1.checked = false; _toast('Недоступно в 100% OFFLINE'); return; }
      const ok = await canGuaranteeStorage();
      if (!ok) { r1.checked = false; _toast('Недостаточно места. Нужно минимум 60 МБ.', 4000); return; }
      if (!(await setMode(MODES.R1))) r1.checked = false;
    } else {
      if (m === MODES.R2) { r1.checked = true; _toast('PlaybackCache нельзя выключить при Dynamic Offline'); return; }
      await setMode(MODES.R0);
    }
    _refreshModes();
  });

  r2?.addEventListener('change', async () => {
    const m = getMode();
    if (r2.checked) {
      if (m === MODES.R3) { r2.checked = false; _toast('Недоступно в 100% OFFLINE'); return; }
      const ok = await canGuaranteeStorage();
      if (!ok) { r2.checked = false; _toast('Недостаточно места. Нужно минимум 60 МБ.', 4000); return; }
      if (!(await enableDynamicOffline())) r2.checked = false;
    } else {
      await disableDynamicOffline();
    }
    _refreshModes();
  });

  // CQ
  _modal.querySelectorAll('[name="ofl-cq"]').forEach(el => {
    el.addEventListener('change', () => setCacheQuality(el.value));
  });

  // FOQ
  _modal.querySelectorAll('[name="ofl-foq"]').forEach(el => {
    el.addEventListener('change', () => setFullOfflineQuality(el.value));
  });

  // Cloud N/D
  _modal.querySelector('#ofl-cn')?.addEventListener('change', function() {
    localStorage.setItem('offline:cloudN:v1', this.value);
  });
  _modal.querySelector('#ofl-cd')?.addEventListener('change', function() {
    localStorage.setItem('offline:cloudD:v1', this.value);
  });

  // Net policy
  _modal.querySelector('#ofl-nw')?.addEventListener('change', function() {
    localStorage.setItem('offline:net:wifi:v1', this.checked ? '1' : '0');
  });
  _modal.querySelector('#ofl-nm')?.addEventListener('change', function() {
    localStorage.setItem('offline:net:mobile:v1', this.checked ? '1' : '0');
  });

  // Limit mode
  _modal.querySelectorAll('[name="ofl-lm"]').forEach(el => {
    el.addEventListener('change', () => {
      const manual = el.value === 'manual';
      _modal.querySelector('#ofl-lmr').style.display = manual ? '' : 'none';
      setCacheLimitMode(el.value);
    });
  });
  _modal.querySelector('#ofl-lmb')?.addEventListener('change', function() {
    setCacheLimitManual(parseInt(this.value, 10) || 500);
  });

  // BG profile
  _modal.querySelector('#ofl-bp')?.addEventListener('change', function() {
    setBackgroundProfile(this.value);
  });

  // FO selection
  _modal.querySelector('#ofl-fof')?.addEventListener('change', _saveSel);
  _modal.querySelector('#ofl-foc')?.addEventListener('change', _saveAssets);
  _modal.querySelector('#ofl-fog')?.addEventListener('change', _saveAssets);
}

function _bindGlobal() {
  window.addEventListener('openOfflineModal', () => open());
  window.addEventListener('fullOfflineProgress', (e) => {
    if (!_isOpen) return;
    const { done, total } = e.detail;
    const p = total > 0 ? Math.round(done / total * 100) : 0;
    const el = _modal.querySelector('#ofl-fop');
    if (el) el.style.display = '';
    const fill = _modal.querySelector('#ofl-fopf');
    if (fill) fill.style.width = p + '%';
    const txt = _modal.querySelector('#ofl-fopt');
    if (txt) txt.textContent = `${done}/${total} (${p}%)`;
  });
  window.addEventListener('fullOfflineComplete', (e) => {
    const sec = _modal?.querySelector('#ofl-foas');
    if (sec) sec.style.display = '';
    _showFOReadyModal(e.detail.totalTracks);
  });
  onModeChange(() => { if (_isOpen) _refreshAll(); });
}

// ===================== REFRESH =====================

function _refreshAll() {
  _refreshModes(); _refreshCQ(); _refreshCloud();
  _refreshNet(); _refreshLimit(); _refreshBreakdown();
  _refreshDownloads(); _refreshUpdateHint(); _refreshFO(); _refreshBP();
}

function _refreshModes() {
  const m = getMode();
  const r1 = _modal.querySelector('#ofl-r1');
  const r2 = _modal.querySelector('#ofl-r2');
  const h = _modal.querySelector('#ofl-mode-hint');
  if (r1) { r1.checked = m === MODES.R1 || m === MODES.R2; r1.disabled = m === MODES.R3; }
  if (r2) { r2.checked = m === MODES.R2; r2.disabled = m === MODES.R3; }
  if (h) {
    const msgs = {
      [MODES.R3]: '100% OFFLINE активен. Режимы недоступны.',
      [MODES.R2]: 'Dynamic Offline активен. PlaybackCache принудительно.',
      [MODES.R1]: 'PlaybackCache: буфер 3 трека.',
      [MODES.R0]: 'Streaming: аудио не кэшируется.'
    };
    h.textContent = msgs[m] || '';
  }
}

function _refreshCQ() {
  const cq = getCacheQuality();
  const hi = _modal.querySelector('#ofl-cq-hi');
  const lo = _modal.querySelector('#ofl-cq-lo');
  if (hi) hi.checked = cq === 'hi';
  if (lo) lo.checked = cq === 'lo';
}

function _refreshCloud() {
  const n = _modal.querySelector('#ofl-cn');
  const d = _modal.querySelector('#ofl-cd');
  if (n) n.value = localStorage.getItem('offline:cloudN:v1') || '5';
  if (d) d.value = localStorage.getItem('offline:cloudD:v1') || '31';
}

function _refreshNet() {
  const w = _modal.querySelector('#ofl-nw');
  const m = _modal.querySelector('#ofl-nm');
  if (w) w.checked = localStorage.getItem('offline:net:wifi:v1') !== '0';
  if (m) m.checked = localStorage.getItem('offline:net:mobile:v1') !== '0';
}

function _refreshLimit() {
  const mode = getCacheLimitMode();
  const a = _modal.querySelector('#ofl-la');
  const mn = _modal.querySelector('#ofl-lman');
  const mr = _modal.querySelector('#ofl-lmr');
  if (a) a.checked = mode === 'auto';
  if (mn) mn.checked = mode === 'manual';
  if (mr) mr.style.display = mode === 'manual' ? '' : 'none';
}

async function _refreshBreakdown() {
  const el = _modal.querySelector('#ofl-bd');
  if (!el) return;
  try {
    const bd = await getBreakdown();
    const est = await getStorageEstimate();
    const mb = b => (b / 1048576).toFixed(1);
    el.innerHTML = [
      `Pinned 🔒: ${mb(bd.pinned)} МБ`,
      `Cloud ☁: ${mb(bd.cloud)} МБ`,
      `Dynamic: ${mb(bd.dynamic)} МБ`,
      `Playback Window: ${mb(bd.playbackWindow)} МБ`,
      `100% OFFLINE: ${mb(bd.fullOffline)} МБ`,
      `Другое: ${mb(bd.other)} МБ`,
      `───`,
      `Квота: ${mb(est.quota)} | Занято: ${mb(est.usage)} | Свободно: ${mb(est.free)} МБ`
    ].join('<br>');
  } catch (e) { el.textContent = 'Ошибка'; }
}

function _refreshDownloads() {
  const el = _modal?.querySelector('#ofl-dls');
  if (!el) return;
  const s = getQueueStatus();
  if (s.isProcessing && s.currentTask) {
    el.textContent = `Скачивается: ${s.currentTask.uid} | Очередь: ${s.queueLength}`;
  } else if (s.isPaused) {
    el.textContent = `Пауза | Очередь: ${s.queueLength}`;
  } else if (s.queueLength > 0) {
    el.textContent = `Очередь: ${s.queueLength}`;
  } else {
    el.textContent = 'Нет активных загрузок';
  }
}

async function _refreshUpdateHint() {
  const el = _modal.querySelector('#ofl-uh');
  if (!el) return;
  el.textContent = (await hasNeedsUpdateOrReCache()) ? 'Есть треки для обновления!' : '';
}

function _refreshFO() {
  const m = getMode();
  const foq = getFullOfflineQuality();
  const fh = _modal.querySelector('#ofl-fh');
  const fl = _modal.querySelector('#ofl-fl');
  if (fh) fh.checked = foq === 'hi';
  if (fl) fl.checked = foq === 'lo';

  const sel = getFullOfflineSelection();
  const fof = _modal.querySelector('#ofl-fof');
  if (fof) fof.checked = sel.favorites || false;

  _refreshFOAlbums(sel);

  const assets = getFullOfflineAssets();
  const fc = _modal.querySelector('#ofl-foc');
  const fg = _modal.querySelector('#ofl-fog');
  if (fc) fc.checked = assets.covers !== false;
  if (fg) fg.checked = assets.gallery || false;

  const as = _modal.querySelector('#ofl-foas');
  const ab = _modal.querySelector('[data-act="foact"]');
  const db = _modal.querySelector('[data-act="fodeact"]');
  if (as) as.style.display = (isFullOfflineReady() || m === MODES.R3) ? '' : 'none';
  if (ab) ab.style.display = m === MODES.R3 ? 'none' : '';
  if (db) db.style.display = m === MODES.R3 ? '' : 'none';

  _refreshFOTracklist();
}

function _refreshFOAlbums(sel) {
  const c = _modal.querySelector('#ofl-foa');
  if (!c) return;
  const albums = getAlbumsData();
  if (!albums || !albums.length) { c.innerHTML = '<p class="ofl-hint">Альбомы не загружены</p>'; return; }
  c.innerHTML = albums.map(a => {
    const id = a.id || a.prefix;
    const ck = (sel.albums || []).includes(id);
    return `<div class="ofl-row"><span>${a.title || id}</span>
      <label class="ofl-sw"><input type="checkbox" class="ofl-foalb" data-aid="${id}" ${ck ? 'checked' : ''}><span class="ofl-sl"></span></label></div>`;
  }).join('');
  c.querySelectorAll('.ofl-foalb').forEach(cb => cb.addEventListener('change', _saveSel));
}

async function _refreshFOTracklist() {
  const c = _modal.querySelector('#ofl-fotl');
  if (!c) return;
  const metas = await getAllTrackMetas();
  const fo = metas.filter(m => m.fullOfflineIncluded || m.pinned || m.cloud);
  const all = getAllTracks();
  if (!fo.length) { c.innerHTML = '<p class="ofl-hint">Набор пуст</p>'; return; }
  c.innerHTML = fo.map(m => {
    const t = all.find(x => x.uid === m.uid);
    const title = t ? t.title : m.uid;
    return `<div class="ofl-fot">
      <span>${title}${m.pinned ? ' 🔒' : ''}${m.cloud ? ' ☁' : ''}</span>
      <div>
        <button class="ofl-bs" data-foact="remove" data-uid="${m.uid}" ${m.pinned ? 'disabled title="Сначала снимите 🔒"' : ''}>Удалить</button>
        <button class="ofl-bs" disabled>Скачать на устройство</button>
        <button class="ofl-bs" disabled>Поделиться</button>
      </div>
    </div>`;
  }).join('');
}

function _refreshBP() {
  const s = _modal.querySelector('#ofl-bp');
  if (!s) return;
  const profiles = getAvailableProfiles();
  const cur = getBackgroundProfile();
  s.innerHTML = profiles.map(p =>
    `<option value="${p.id}" ${p.id === cur.id ? 'selected' : ''}>${p.label}</option>`
  ).join('');
}

// ===================== ACTIONS =====================

function _saveSel() {
  const fav = !!_modal.querySelector('#ofl-fof')?.checked;
  const albums = [];
  _modal.querySelectorAll('.ofl-foalb:checked').forEach(cb => albums.push(cb.dataset.aid));
  setFullOfflineSelection({ favorites: fav, albums, uids: [] });
}

function _saveAssets() {
  const covers = !!_modal.querySelector('#ofl-foc')?.checked;
  const gallery = !!_modal.querySelector('#ofl-fog')?.checked;
  setFullOfflineAssets({ covers, gallery });
}

function _doEstimate() {
  const sel = getFullOfflineSelection();
  const foq = getFullOfflineQuality();
  const assets = getFullOfflineAssets();
  // Get favorite uids
  const favUids = _getFavUids();
  const allT = getAllTracks();
  const uidSet = new Set();
  if (sel.favorites && favUids) favUids.forEach(u => uidSet.add(u));
  if (sel.albums) {
    const albums = getAlbumsData();
    sel.albums.forEach(aid => {
      const a = albums.find(x => (x.id || x.prefix) === aid);
      if (a && a.tracks) a.tracks.forEach(t => { if (t.uid) uidSet.add(t.uid); });
    });
  }
  const est = computeSizeEstimate(Array.from(uidSet), foq, assets.covers, assets.gallery);
  const el = _modal.querySelector('#ofl-foe');
  if (el) el.textContent = `Треков: ${est.tracks} | Аудио: ${est.audioMB} МБ | Обложки: ${est.coversMB} МБ | Итого: ≈${est.totalMB} МБ`;
}

async function _doStart() {
  const sel = getFullOfflineSelection();
  const favUids = _getFavUids();
  const result = await startFullOfflineDownload(sel, favUids);
  if (result) _toast(`Загрузка: ${result.totalTracks} треков`);
}

async function _doActivate() {
  const ok = await activateFullOffline();
  if (ok) { _toast('100% OFFLINE включён'); _refreshAll(); }
}

async function _doDeactivate() {
  await deactivateFullOffline();
  _toast('100% OFFLINE выключен');
  _refreshAll();
}

function _showFOReadyModal(totalTracks) {
  const size = '—';
  if (confirm(`100% OFFLINE готов. Скачано: ${totalTracks} треков. Включить режим?`)) {
    activateFullOffline().then(() => { _toast('100% OFFLINE включён'); if (_isOpen) _refreshAll(); });
  }
}

function _getFavUids() {
  if (window.favorites && typeof window.favorites.getAll === 'function') {
    return window.favorites.getAll().filter(f => f.active !== false).map(f => f.uid);
  }
  try {
    const raw = localStorage.getItem('favorites');
    if (raw) {
      const arr = JSON.parse(raw);
      return arr.filter(f => f.active !== false).map(f => f.uid || f.id);
    }
  } catch(e) {}
  return [];
}

export { init, open, close, isOpen };
