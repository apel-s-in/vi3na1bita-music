// scripts/app/offline-ui-bootstrap.js
// Поднимает OFFLINE UI, интегрирует Updater и индикатор “!” на кнопке OFFLINE.

import { OfflineManager } from '../offline/offline-manager.js';
import { Updater } from '../offline/updater.js';
import { OfflineModal } from '../offline/offline-modal.js';
import { getTrackByUid, getAllUids } from './track-registry.js';
import * as DB from '../offline/cache-db.js';

// Конфиги альбомов (источники правды для size/size_low)
const CONFIG_URLS = [
  'https://raw.githubusercontent.com/apel-s-in/vi3na1bita-golos-dushi/refs/heads/main/config.json',
  'https://raw.githubusercontent.com/apel-s-in/vi3na1bita-mezhdu-zlom-i-dobrom/refs/heads/main/config.json',
  'https://raw.githubusercontent.com/apel-s-in/vi3na1bita-odnazhdy-v-skazke/refs/heads/main/config.json',
  'https://raw.githubusercontent.com/apel-s-in/krevetochka/refs/heads/main/config.json',
];

// ——— утилиты ———
function notify(text, kind = 'info', ms = 3000) {
  try {
    if (window.Notify?.toast) {
      window.Notify.toast(text, { kind, duration: ms });
      return;
    }
  } catch {}
  console.log(`[${kind}] ${text}`);
}

// Вставляем лёгкий стиль для “!” на OFFLINE
(function injectBangCss() {
  const css = `
    #offline-btn.has-bang {
      position: relative;
    }
    #offline-btn.has-bang::after {
      content: '!';
      position: absolute;
      top: -6px;
      right: -8px;
      background: #ff3b30;
      color: #fff;
      width: 16px; height: 16px;
      border-radius: 50%;
      font-size: 12px;
      line-height: 16px;
      text-align: center;
      font-weight: 700;
      box-shadow: 0 0 0 2px #0003;
    }
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

// ——— OfflineManager / Updater ———
const offlineManager = new OfflineManager({
  downloader: null, // внутренний загрузчик реализован в OfflineManager
  getTrackByUid,
});

let offlineBtn = null;
function setBang(on) {
  if (!offlineBtn) offlineBtn = document.querySelector('#offline-btn');
  if (!offlineBtn) return;
  offlineBtn.classList.toggle('has-bang', !!on);
}

const updater = new Updater({
  getAllUids,
  getTrackByUid,
  onBadge: ({ bang }) => setBang(bang),
});

// Скан конфигов: собираем map по uid => { sizeHiChanged, sizeLoChanged }
async function fetchAlbumConfigs() {
  const results = [];
  for (const url of CONFIG_URLS) {
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) continue;
      results.push(await resp.json());
    } catch {}
  }
  return results; // массив конфигов альбомов
}

function extractSizesFromConfigs(configs) {
  // ожидается, что каждый конфиг содержит список треков с uid, size, size_low, audio, audio_low
  const map = new Map(); // uid -> { size, size_low }
  for (const cfg of configs) {
    const tracks = Array.isArray(cfg?.tracks) ? cfg.tracks : (Array.isArray(cfg) ? cfg : []);
    for (const t of tracks) {
      if (!t?.uid) continue;
      map.set(String(t.uid), {
        size: Number(t.size || 0),
        size_low: Number(t.size_low || 0),
      });
    }
  }
  return map;
}

async function buildChangedSizesMap() {
  const configs = await fetchAlbumConfigs();
  const srvSizes = extractSizesFromConfigs(configs);
  const changed = new Map();
  for (const uid of getAllUids()) {
    const local = getTrackByUid(uid);
    const remote = srvSizes.get(String(uid));
    if (!remote || !local) continue;
    const sizeHiChanged = Number(local.sizeHi || local.size || 0) !== Number(remote.size || 0);
    const sizeLoChanged = Number(local.sizeLo || local.size_low || 0) !== Number(remote.size_low || 0);
    if (sizeHiChanged || sizeLoChanged) {
      changed.set(uid, { sizeHiChanged, sizeLoChanged });
    }
  }
  return changed;
}

// Клик по “!” — длинный тост (без открытия модалки)
function bindBangClickToast() {
  if (!offlineBtn) offlineBtn = document.querySelector('#offline-btn');
  if (!offlineBtn) return;
  offlineBtn.addEventListener('click', (e) => {
    if (offlineBtn.classList.contains('has-bang')) {
      // показываем тост “дольше обычного”
      notify('Есть треки для обновления.', 'info', 6000);
      // ВАЖНО: индикатор “!” гасим только после завершения обновлений (подтверждено вами)
    }
  }, { capture: true });
}

// Unknown сеть — запомнить на сессию (вызывайте это при своем confirm)
export function rememberUnknownNetworkConsent(consented) {
  sessionStorage.setItem('net:unknown:confirm', consented ? 'true' : 'false');
}

// OFFLINE модалка
let modal = null;
function openOfflineModal() {
  if (!modal) {
    modal = new OfflineModal({
      utils: window.Utils, // Utils.createModal доступен
      offlineManager,
      updater,
      getBreakdown: async () => {
        const { usage = 0 } = await DB.estimateUsage();
        return { pinned: 0, cloud: 0, transient: 0, other: usage };
      },
    });
  }
  modal.open();
}

// Публичная инициализация
export async function attachOfflineUI() {
  offlineBtn = document.querySelector('#offline-btn');
  if (offlineBtn) {
    offlineBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openOfflineModal();
    });
    bindBangClickToast();
  }

  // начальный скан конфигов
  try {
    const changedMap = await buildChangedSizesMap();
    await updater.scanForUpdates({ changedSizesMap: changedMap, recacheDueToCQ: false });
  } catch (e) {
    console.warn('Updater scan failed', e);
  }

  // периодический скан раз в 6 часов (можно увеличить/уменьшить)
  setInterval(async () => {
    try {
      const changedMap = await buildChangedSizesMap();
      await updater.scanForUpdates({ changedSizesMap: changedMap, recacheDueToCQ: false });
    } catch (e) {
      console.warn('Updater periodic scan failed', e);
    }
  }, 6 * 60 * 60 * 1000);
}

export const OfflineUI = { attachOfflineUI, offlineManager, updater, rememberUnknownNetworkConsent };
