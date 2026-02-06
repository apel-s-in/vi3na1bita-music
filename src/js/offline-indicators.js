/**
 * Offline Indicators — 🔒/☁ слева от номера трека (ТЗ 10)
 * + индикатор "!" на кнопке OFFLINE (ТЗ 12)
 * + кнопка Hi/Lo visibility (ТЗ 4.4)
 * + progress bar second layer (ТЗ 15)
 */

import { getTrackOfflineState, getTrackMeta } from './cache-db.js';
import { getMode, MODES, onModeChange } from './mode-manager.js';
import { togglePinned, cloudAddPin, cloudRemoveFromCache, hasNeedsUpdateOrReCache } from './offline-manager.js';

let _updateThrottle = null;

function init() {
  _bindEvents();
  _updateAllIndicators();
  _updateOfflineBtnIndicator();
  _updateQualityBtnVisibility();
}

function _bindEvents() {
  window.addEventListener('offlineStateChanged', () => {
    _scheduleUpdate();
  });

  window.addEventListener('needsUpdateChanged', () => {
    _updateOfflineBtnIndicator();
  });

  window.addEventListener('downloadComplete', () => {
    _scheduleUpdate();
  });

  window.addEventListener('downloadProgress', (e) => {
    _updateCacheProgress(e.detail.uid, e.detail.percent);
  });

  onModeChange(() => {
    _updateQualityBtnVisibility();
    _updateAllIndicators();
  });

  // Listen for track list renders
  const observer = new MutationObserver(() => {
    _scheduleUpdate();
  });

  // Observe track lists
  setTimeout(() => {
    const containers = document.querySelectorAll('.track-list, .favorites-list, [data-track-list]');
    containers.forEach(c => {
      observer.observe(c, { childList: true, subtree: true });
    });
  }, 1000);
}

function _scheduleUpdate() {
  if (_updateThrottle) return;
  _updateThrottle = setTimeout(() => {
    _updateThrottle = null;
    _updateAllIndicators();
  }, 300);
}

// ===================== TRACK INDICATORS (ТЗ 10) =====================

async function _updateAllIndicators() {
  const trackRows = document.querySelectorAll('[data-uid]');
  for (const row of trackRows) {
    const uid = row.dataset.uid;
    if (!uid) continue;
    await _updateTrackIndicator(row, uid);
  }
}

async function _updateTrackIndicator(row, uid) {
  let indicator = row.querySelector('.offline-indicator');

  if (!indicator) {
    indicator = document.createElement('span');
    indicator.className = 'offline-indicator';
    // Insert before first child (left of track number)
    const firstChild = row.firstElementChild;
    if (firstChild) {
      row.insertBefore(indicator, firstChild);
    } else {
      row.appendChild(indicator);
    }
  }

  const state = await getTrackOfflineState(uid);

  if (state.pinned) {
    indicator.textContent = '🔒';
    indicator.className = 'offline-indicator oi-pinned';
    indicator.title = 'Закреплён офлайн';
    indicator.onclick = (e) => {
      e.stopPropagation();
      togglePinned(uid, false);
    };
  } else if (state.cloud && state.cachedComplete === 100) {
    indicator.textContent = '☁';
    indicator.className = 'offline-indicator oi-cloud';
    indicator.title = 'Офлайн (облачко)';
    indicator.onclick = (e) => {
      e.stopPropagation();
      _showCloudMenu(uid, indicator);
    };
  } else {
    indicator.textContent = '🔒';
    indicator.className = 'offline-indicator oi-gray';
    indicator.title = 'Закрепить офлайн';
    indicator.onclick = (e) => {
      e.stopPropagation();
      togglePinned(uid, true);
    };
  }
}

function _showCloudMenu(uid, anchor) {
  // Remove any existing menu
  const existing = document.getElementById('cloud-context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'cloud-context-menu';
  menu.className = 'cloud-menu';

  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = rect.left + 'px';
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.zIndex = '9999';

  menu.innerHTML = `
    <div class="cloud-menu-item" data-cm-act="pin">Добавить 🔒</div>
    <div class="cloud-menu-item cloud-menu-danger" data-cm-act="remove">Удалить из кэша</div>
  `;

  document.body.appendChild(menu);

  menu.addEventListener('click', async (e) => {
    const act = e.target.dataset.cmAct;
    if (act === 'pin') {
      await cloudAddPin(uid);
    } else if (act === 'remove') {
      if (confirm('Удалить из кэша? (статистика облачка будет сброшена)')) {
        await cloudRemoveFromCache(uid);
      }
    }
    menu.remove();
  });

  // Close on outside click
  const closeHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 10);
}

// ===================== OFFLINE BTN INDICATOR "!" (ТЗ 12) =====================

async function _updateOfflineBtnIndicator() {
  const btn = document.getElementById('offline-btn');
  if (!btn) return;

  const has = await hasNeedsUpdateOrReCache();
  let bang = btn.querySelector('.offline-bang');

  if (has) {
    if (!bang) {
      bang = document.createElement('span');
      bang.className = 'offline-bang';
      bang.textContent = '!';
      bang.title = 'Есть треки для обновления';
      btn.style.position = 'relative';
      btn.insertBefore(bang, btn.firstChild);
    }
    bang.onclick = (e) => {
      e.stopPropagation();
      if (window.showToast) window.showToast('Есть треки для обновления.', 6000);
    };
  } else {
    if (bang) bang.remove();
  }
}

// ===================== QUALITY BUTTON VISIBILITY (ТЗ 4.4) =====================

function _updateQualityBtnVisibility() {
  const btn = document.getElementById('quality-btn');
  if (!btn) return;

  const mode = getMode();
  if (mode === MODES.R2 || mode === MODES.R3) {
    btn.style.display = 'none';
  } else {
    btn.style.display = '';
  }
}

// ===================== CACHE PROGRESS (ТЗ 15) =====================

function _updateCacheProgress(uid, percent) {
  const progressBar = document.getElementById('cache-progress-layer');
  if (!progressBar) return;

  // Only show for current track
  const curUid = progressBar.dataset.curUid;
  if (curUid && curUid !== uid) return;

  progressBar.style.width = percent + '%';
}

function setCacheProgressTrack(uid) {
  const progressBar = document.getElementById('cache-progress-layer');
  if (progressBar) {
    progressBar.dataset.curUid = uid;
    // Reset on new track
    const mode = getMode();
    if (mode === MODES.R3) {
      progressBar.style.width = '100%';
    } else {
      progressBar.style.width = '0%';
    }
  }
}

export { init, setCacheProgressTrack };
