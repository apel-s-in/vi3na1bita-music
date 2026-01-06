// scripts/offline/offline-ui.js
// UI-компоненты офлайн-системы (ТЗ 7, 10)

import { getOfflineManager } from './offline-manager.js';
import { getNetworkManager } from './network-manager.js';

const MB = 1024 * 1024;

/**
 * formatBytes — форматирование байт в человекочитаемый вид
 */
function formatBytes(bytes) {
  const b = Number(bytes || 0);
  if (!Number.isFinite(b) || b < 0) return '0 Б';

  if (b < 1024) return `${Math.floor(b)} Б`;
  if (b < MB) return `${(b / 1024).toFixed(1)} КБ`;
  if (b < 1024 * MB) return `${(b / MB).toFixed(1)} МБ`;
  return `${(b / (1024 * MB)).toFixed(2)} ГБ`;
}

/**
 * showToast — показ toast-уведомления
 */
function showToast(message, duration = 3000) {
  if (window.NotificationSystem?.info) {
    window.NotificationSystem.info(message, duration);
    return;
  }

  // Fallback
  const el = document.createElement('div');
  el.className = 'offline-toast';
  el.textContent = message;
  el.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.85);
    color: #fff;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 99999;
    animation: fadeInUp 0.3s ease;
  `;
  document.body.appendChild(el);

  setTimeout(() => {
    el.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/**
 * renderIndicator — рендеринг индикатора для трека (ТЗ 10)
 * @param {HTMLElement} container — контейнер для индикатора
 * @param {Object} indicators — { pinned, cloud, cachedComplete }
 */
export function renderIndicator(container, indicators) {
  if (!container) return;

  // Remove existing indicators
  container.querySelectorAll('.offline-indicator').forEach(el => el.remove());

  if (!indicators) return;

  const { pinned, cloud, cachedComplete } = indicators;

  // Pinned indicator: 📌
  if (pinned && cachedComplete) {
    const pin = document.createElement('span');
    pin.className = 'offline-indicator offline-indicator--pinned';
    pin.textContent = '📌';
    pin.title = 'Закреплён для офлайн';
    pin.style.cssText = 'margin-left: 6px; font-size: 14px; cursor: pointer;';
    container.appendChild(pin);
    return;
  }

  // Cloud indicator: ☁
  if (cloud && cachedComplete) {
    const cloudEl = document.createElement('span');
    cloudEl.className = 'offline-indicator offline-indicator--cloud';
    cloudEl.textContent = '☁';
    cloudEl.title = 'Доступен офлайн (Cloud)';
    cloudEl.style.cssText = 'margin-left: 6px; font-size: 14px; cursor: pointer; color: #4a9eff;';
    container.appendChild(cloudEl);
    return;
  }
}

/**
 * updateTrackIndicators — обновление индикаторов для всех видимых треков
 */
export async function updateTrackIndicators() {
  const mgr = getOfflineManager();
  const items = document.querySelectorAll('[data-track-uid]');

  for (const item of items) {
    const uid = item.dataset.trackUid;
    if (!uid) continue;

    const indicatorContainer = item.querySelector('.track-indicators') || item;
    const indicators = await mgr.getIndicators(uid);
    renderIndicator(indicatorContainer, indicators);
  }
}

/**
 * createQualityButtons — создание кнопок выбора качества (ТЗ 7.5)
 * @param {Object} params — { pq, cq, onPqChange, onCqChange, localQuality }
 */
export function createQualityButtons(params = {}) {
  const { pq = 'hi', cq = 'hi', onPqChange, onCqChange, localQuality } = params;

  const container = document.createElement('div');
  container.className = 'quality-buttons';
  container.style.cssText = 'display: flex; gap: 8px; align-items: center;';

  // PQ buttons
  const pqGroup = document.createElement('div');
  pqGroup.className = 'quality-buttons__pq';
  pqGroup.innerHTML = `
    <span style="font-size: 12px; color: #888; margin-right: 4px;">Воспроизведение:</span>
    <button class="quality-btn quality-btn--pq ${pq === 'hi' ? 'active' : ''}" data-q="hi">Hi</button>
    <button class="quality-btn quality-btn--pq ${pq === 'lo' ? 'active' : ''}" data-q="lo">Lo</button>
  `;

  pqGroup.querySelectorAll('.quality-btn--pq').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.q;
      pqGroup.querySelectorAll('.quality-btn--pq').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onPqChange?.(q);
    });
  });

  // CQ buttons
  const cqGroup = document.createElement('div');
  cqGroup.className = 'quality-buttons__cq';
  cqGroup.innerHTML = `
    <span style="font-size: 12px; color: #888; margin-right: 4px;">Кэш:</span>
    <button class="quality-btn quality-btn--cq ${cq === 'hi' ? 'active' : ''}" data-q="hi">Hi</button>
    <button class="quality-btn quality-btn--cq ${cq === 'lo' ? 'active' : ''}" data-q="lo">Lo</button>
  `;

  cqGroup.querySelectorAll('.quality-btn--cq').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const q = btn.dataset.q;

      // ТЗ 7.5.1: если кнопка уже активна — показать toast
      if (btn.classList.contains('active')) {
        showToast(`Качество кэша уже установлено: ${q.toUpperCase()}`);
        return;
      }

      cqGroup.querySelectorAll('.quality-btn--cq').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onCqChange?.(q);
    });
  });

  container.appendChild(pqGroup);
  container.appendChild(cqGroup);

  return container;
}

/**
 * createOfflineModeToggle — создание переключателя Offline Mode (ТЗ 11.3)
 */
export function createOfflineModeToggle(params = {}) {
  const { onChange } = params;
  const mgr = getOfflineManager();

  const container = document.createElement('div');
  container.className = 'offline-mode-toggle';
  container.style.cssText = 'display: flex; align-items: center; gap: 8px;';

  const label = document.createElement('span');
  label.textContent = 'Offline Mode';
  label.style.cssText = 'font-size: 14px;';

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = mgr.isOfflineMode();
  toggle.style.cssText = 'width: 20px; height: 20px; cursor: pointer;';

  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    mgr.setOfflineMode(enabled);
    onChange?.(enabled);
    showToast(enabled ? 'Offline Mode включён' : 'Offline Mode выключен');
  });

  container.appendChild(label);
  container.appendChild(toggle);

  return container;
}

/**
 * createPinButton — создание кнопки закрепления трека (ТЗ 8)
 */
export function createPinButton(uid, params = {}) {
  const { onToggle } = params;
  const mgr = getOfflineManager();

  const btn = document.createElement('button');
  btn.className = 'pin-button';
  btn.style.cssText = `
    background: none;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
  `;

  const updateState = () => {
    const pinned = mgr.isPinned(uid);
    btn.textContent = pinned ? '📌 Открепить' : '📌 Закрепить';
    btn.style.background = pinned ? '#e8f4e8' : 'transparent';
  };

  updateState();

  btn.addEventListener('click', async () => {
    const wasPinned = mgr.isPinned(uid);

    if (wasPinned) {
      await mgr.unpin(uid);
    } else {
      await mgr.pin(uid);
    }

    updateState();
    onToggle?.(!wasPinned);
  });

  // Listen for external changes
  mgr.on('progress', (ev) => {
    if (ev?.uid === uid && (ev.phase === 'pinned' || ev.phase === 'unpinned')) {
      updateState();
    }
  });

  return btn;
}

/**
 * createCloudMenu — создание меню для Cloud-трека (ТЗ 9.4)
 */
export function createCloudMenu(uid, params = {}) {
  const { onAction } = params;
  const mgr = getOfflineManager();

  const menu = document.createElement('div');
  menu.className = 'cloud-menu';
  menu.style.cssText = `
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 8px 0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    min-width: 180px;
  `;

  const createItem = (text, action) => {
    const item = document.createElement('div');
    item.className = 'cloud-menu__item';
    item.textContent = text;
    item.style.cssText = `
      padding: 10px 16px;
      cursor: pointer;
      transition: background 0.2s;
    `;
    item.addEventListener('mouseenter', () => item.style.background = '#f5f5f5');
    item.addEventListener('mouseleave', () => item.style.background = 'transparent');
    item.addEventListener('click', async () => {
      await mgr.cloudMenu(uid, action);
      onAction?.(action);
    });
    return item;
  };

  menu.appendChild(createItem('🔒 Добавить в закреплённые', 'add-lock'));
  menu.appendChild(createItem('🗑 Удалить из кэша', 'remove-cache'));

  return menu;
}

/**
 * createCacheSizeDisplay — отображение размера кэша
 */
export async function createCacheSizeDisplay() {
  const mgr = getOfflineManager();
  const bytes = await mgr.getCacheSizeBytes();

  const el = document.createElement('div');
  el.className = 'cache-size-display';
  el.style.cssText = 'font-size: 14px; color: #666;';
  el.textContent = `Кэш: ${formatBytes(bytes)}`;

  return el;
}

/**
 * createNetworkStatusDisplay — отображение статуса сети (ТЗ 12.2)
 */
export function createNetworkStatusDisplay() {
  const netMgr = getNetworkManager();

  const el = document.createElement('div');
  el.className = 'network-status-display';
  el.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    padding: 4px 8px;
    border-radius: 4px;
  `;

  const update = () => {
    const status = netMgr.getStatus();
    const online = status.online;
    const kind = status.kind;

    let icon = '🌐';
    let text = 'Сеть';
    let bgColor = '#e8f4e8';

    if (!online) {
      icon = '📵';
      text = 'Офлайн';
      bgColor = '#fde8e8';
    } else if (kind === 'wifi') {
      icon = '📶';
      text = 'WiFi';
      bgColor = '#e8f4e8';
    } else if (kind === 'cellular') {
      icon = '📱';
      text = 'Мобильная сеть';
      bgColor = '#fff8e8';
    }

    if (status.saveData) {
      text += ' (экономия)';
    }

    el.style.background = bgColor;
    el.innerHTML = `<span>${icon}</span><span>${text}</span>`;
  };

  update();
  netMgr.onChange(update);

  return el;
}

/**
 * initOfflineUI — инициализация UI-подсистемы
 */
export function initOfflineUI() {
  // Listen for changes and update indicators
  window.addEventListener('offline:uiChanged', () => {
    updateTrackIndicators();
  });

  const mgr = getOfflineManager();
  mgr.on('progress', (ev) => {
    if (ev?.phase === 'downloaded' || ev?.phase === 'cloudActivated' || ev?.phase === 'cacheRemoved') {
      updateTrackIndicators();
    }
  });

  // Initial update
  setTimeout(updateTrackIndicators, 500);
}

export const OfflineUI = {
  renderIndicator,
  updateTrackIndicators,
  createQualityButtons,
  createOfflineModeToggle,
  createPinButton,
  createCloudMenu,
  createCacheSizeDisplay,
  createNetworkStatusDisplay,
  initOfflineUI,
  showToast,
  formatBytes
};
