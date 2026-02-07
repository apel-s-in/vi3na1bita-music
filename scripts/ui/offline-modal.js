/**
 * offline-modal.js — OFFLINE модальное окно.
 *
 * ТЗ: Приложение П.8.1–П.8.6
 *
 * Секция «Pinned и Cloud» — качество, re-cache, N/D, список, удаление.
 *
 * Экспорт:
 *   - openOfflineModal()
 *   - closeOfflineModal()
 *   - initOfflineModal() — подписки
 */

import offlineManager, { getOfflineManager } from '../offline/offline-manager.js';
import { refreshAllIndicators } from './offline-indicators.js';

/* ═══════ State ═══════ */

let _modal = null;
let _reCacheUnsub = null;

/* ═══════ CSS ═══════ */

let _cssInjected = false;

function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .offline-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .offline-modal {
      background: #1a1a2e;
      border-radius: 12px;
      max-width: 480px;
      width: 100%;
      max-height: 85vh;
      overflow-y: auto;
      color: #e0e0e0;
      font-size: 14px;
      padding: 0;
      box-shadow: 0 12px 48px rgba(0,0,0,0.8);
    }

    .offline-modal__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      font-size: 16px;
      font-weight: 600;
    }

    .offline-modal__close {
      background: none;
      border: none;
      color: #888;
      font-size: 22px;
      cursor: pointer;
      padding: 4px 8px;
      line-height: 1;
    }
    .offline-modal__close:hover { color: #fff; }

    .offline-section {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .offline-section__title {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #aaa;
      margin-bottom: 12px;
    }

    .offline-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
    }

    .offline-row__label {
      color: #ccc;
      font-size: 13px;
    }

    .offline-btn {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      color: #e0e0e0;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .offline-btn:hover { background: rgba(255,255,255,0.14); }
    .offline-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .offline-btn--primary {
      background: rgba(91, 192, 222, 0.2);
      border-color: rgba(91, 192, 222, 0.3);
      color: #5bc0de;
    }
    .offline-btn--primary:hover { background: rgba(91, 192, 222, 0.3); }

    .offline-btn--danger {
      background: rgba(255, 107, 107, 0.15);
      border-color: rgba(255, 107, 107, 0.25);
      color: #ff6b6b;
    }
    .offline-btn--danger:hover { background: rgba(255, 107, 107, 0.25); }

    .offline-btn--active {
      background: rgba(245, 200, 66, 0.2);
      border-color: rgba(245, 200, 66, 0.4);
      color: #f5c842;
    }

    .offline-toggle {
      display: flex;
      gap: 0;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.12);
    }

    .offline-toggle__opt {
      padding: 6px 16px;
      font-size: 13px;
      cursor: pointer;
      background: rgba(255,255,255,0.04);
      color: #888;
      border: none;
      transition: all 0.15s;
    }
    .offline-toggle__opt--active {
      background: rgba(91, 192, 222, 0.25);
      color: #5bc0de;
      font-weight: 600;
    }

    .offline-input-num {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      color: #e0e0e0;
      padding: 4px 8px;
      border-radius: 4px;
      width: 60px;
      text-align: center;
      font-size: 14px;
    }

    .offline-progress {
      background: rgba(255,255,255,0.06);
      border-radius: 4px;
      height: 6px;
      overflow: hidden;
      margin-top: 6px;
    }

    .offline-progress__bar {
      height: 100%;
      background: #5bc0de;
      border-radius: 4px;
      transition: width 0.3s;
    }

    .offline-warning {
      background: rgba(255, 193, 7, 0.1);
      border: 1px solid rgba(255, 193, 7, 0.2);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      color: #ffc107;
      margin-bottom: 8px;
    }

    /* ─── Cache list popup ─── */
    .cache-list {
      max-height: 300px;
      overflow-y: auto;
      margin-top: 8px;
    }

    .cache-list__item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      gap: 8px;
    }

    .cache-list__icon {
      font-size: 16px;
      min-width: 24px;
      text-align: center;
    }

    .cache-list__info {
      flex: 1;
      min-width: 0;
    }

    .cache-list__title {
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cache-list__meta {
      font-size: 11px;
      color: #888;
      margin-top: 2px;
    }

    .cache-list__actions {
      display: flex;
      gap: 4px;
    }

    .cache-list__action {
      background: none;
      border: none;
      color: #888;
      font-size: 12px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .cache-list__action:hover { color: #fff; background: rgba(255,255,255,0.08); }
    .cache-list__action--danger:hover { color: #ff6b6b; }
  `;
  document.head.appendChild(style);
}

/* ═══════ Build modal ═══════ */

export async function openOfflineModal() {
  if (_modal) return;
  injectCSS();

  const mgr = getOfflineManager();
  const stats = await mgr.getCacheStats();

  /* ─── Overlay ─── */
  const overlay = document.createElement('div');
  overlay.className = 'offline-modal-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOfflineModal();
  });

  /* ─── Modal container ─── */
  const modal = document.createElement('div');
  modal.className = 'offline-modal';

  /* ─── Header ─── */
  const header = document.createElement('div');
  header.className = 'offline-modal__header';
  header.innerHTML = `
    <span>⚙ Офлайн-настройки</span>
    <button class="offline-modal__close" title="Закрыть">&times;</button>
  `;
  header.querySelector('.offline-modal__close').addEventListener('click', closeOfflineModal);
  modal.appendChild(header);

  /* ─── Секция E: Хранилище ─── */
  modal.appendChild(_buildStorageSection(stats));

  /* ─── Секция: Pinned и Cloud (ТЗ П.8.1) ─── */
  modal.appendChild(await _buildPinnedCloudSection(stats, mgr));

  /* ─── Секция: Режимы ─── */
  modal.appendChild(_buildModesSection(stats, mgr));

  /* ─── Секция: Очистка ─── */
  modal.appendChild(_buildCleanupSection(stats, mgr));

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  _modal = overlay;

  /* ESC */
  document.addEventListener('keydown', _onEsc);
}

export function closeOfflineModal() {
  if (!_modal) return;
  _modal.remove();
  _modal = null;
  document.removeEventListener('keydown', _onEsc);
  if (_reCacheUnsub) { _reCacheUnsub(); _reCacheUnsub = null; }
}

function _onEsc(e) {
  if (e.key === 'Escape') closeOfflineModal();
}

/* ═══════ Storage section ═══════ */

function _buildStorageSection(stats) {
  const s = stats.storage;
  const usedMB = (s.used / (1024 * 1024)).toFixed(1);
  const quotaMB = (s.quota / (1024 * 1024)).toFixed(0);
  const freeMB = (s.free / (1024 * 1024)).toFixed(0);
  const pct = s.quota ? Math.round((s.used / s.quota) * 100) : 0;

  const pinnedMB = (stats.pinned.size / (1024 * 1024)).toFixed(1);
  const cloudMB = (stats.cloud.size / (1024 * 1024)).toFixed(1);
  const dynMB = (stats.dynamic.size / (1024 * 1024)).toFixed(1);

  const section = document.createElement('div');
  section.className = 'offline-section';
    section.innerHTML = `
    <div class="offline-section__title">■ Хранилище</div>
    <div class="offline-row">
      <span class="offline-row__label">Занято</span>
      <span>${usedMB} МБ / ${quotaMB} МБ (${pct}%)</span>
    </div>
    <div class="offline-progress">
      <div class="offline-progress__bar" style="width: ${pct}%"></div>
    </div>
    <div style="margin-top: 8px; font-size: 12px; color: #888;">
      🔒 Pinned: ${stats.pinned.count} (${pinnedMB} МБ) &nbsp;|&nbsp;
      ☁ Cloud: ${stats.cloud.count} (${cloudMB} МБ) &nbsp;|&nbsp;
      ⏳ Dynamic: ${stats.dynamic.count} (${dynMB} МБ)
    </div>
    <div style="margin-top: 4px; font-size: 12px; color: #888;">
      Свободно: ~${freeMB} МБ
    </div>
  `;

  if (!stats.spaceOk) {
    const warn = document.createElement('div');
    warn.className = 'offline-warning';
    warn.textContent = 'Кэш недоступен. Недостаточно места на устройстве.';
    section.appendChild(warn);
  }

  return section;
}

/* ═══════ Pinned и Cloud section (ТЗ П.8.1–П.8.6) ═══════ */

async function _buildPinnedCloudSection(stats, mgr) {
  const section = document.createElement('div');
  section.className = 'offline-section';
  section.id = 'offline-pinned-cloud-section';

  const title = document.createElement('div');
  title.className = 'offline-section__title';
  title.textContent = '■ Pinned и Cloud';
  section.appendChild(title);

  /* ─── Качество: Hi / Lo (ТЗ П.8.2) ─── */
  const qualityRow = document.createElement('div');
  qualityRow.className = 'offline-row';

  const qualityLabel = document.createElement('span');
  qualityLabel.className = 'offline-row__label';
  qualityLabel.textContent = 'Качество кэша:';
  qualityRow.appendChild(qualityLabel);

  const qualityToggle = document.createElement('div');
  qualityToggle.className = 'offline-toggle';

  const currentQ = mgr.getCacheQuality();

  const hiBtn = document.createElement('button');
  hiBtn.className = 'offline-toggle__opt' + (currentQ === 'hi' ? ' offline-toggle__opt--active' : '');
  hiBtn.textContent = 'Hi';
  hiBtn.addEventListener('click', () => {
    mgr.setCacheQualitySetting('hi');
    hiBtn.classList.add('offline-toggle__opt--active');
    loBtn.classList.remove('offline-toggle__opt--active');
    _updateReCacheBtn(section, mgr);
  });

  const loBtn = document.createElement('button');
  loBtn.className = 'offline-toggle__opt' + (currentQ === 'lo' ? ' offline-toggle__opt--active' : '');
  loBtn.textContent = 'Lo';
  loBtn.addEventListener('click', () => {
    mgr.setCacheQualitySetting('lo');
    loBtn.classList.add('offline-toggle__opt--active');
    hiBtn.classList.remove('offline-toggle__opt--active');
    _updateReCacheBtn(section, mgr);
  });

  qualityToggle.appendChild(hiBtn);
  qualityToggle.appendChild(loBtn);
  qualityRow.appendChild(qualityToggle);
  section.appendChild(qualityRow);

  /* ─── Re-cache (ТЗ П.8.3) ─── */
  const reCacheRow = document.createElement('div');
  reCacheRow.className = 'offline-row';
  reCacheRow.id = 'recache-row';
  reCacheRow.style.flexDirection = 'column';
  reCacheRow.style.alignItems = 'stretch';

  const reCacheTopRow = document.createElement('div');
  reCacheTopRow.style.display = 'flex';
  reCacheTopRow.style.justifyContent = 'space-between';
  reCacheTopRow.style.alignItems = 'center';

  const reCacheLabel = document.createElement('span');
  reCacheLabel.className = 'offline-row__label';
  reCacheLabel.id = 'recache-label';
  reCacheLabel.textContent = `Нужно перекэшировать: ${stats.reCacheCount}`;

  const reCacheBtn = document.createElement('button');
  reCacheBtn.className = 'offline-btn offline-btn--primary';
  reCacheBtn.id = 'recache-btn';
  reCacheBtn.textContent = 'Re-cache';
  reCacheBtn.disabled = stats.reCacheCount === 0;

  reCacheBtn.addEventListener('click', async () => {
    reCacheBtn.disabled = true;
    reCacheBtn.textContent = 'Перекэширование…';

    const progressDiv = section.querySelector('#recache-progress');
    if (progressDiv) progressDiv.style.display = 'block';

    await mgr.startForceReCache((done, total) => {
      if (progressDiv) {
        const bar = progressDiv.querySelector('.offline-progress__bar');
        const text = progressDiv.querySelector('.recache-progress-text');
        if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
        if (text) text.textContent = `Перекэширование: ${done}/${total} файлов`;
      }
      if (done >= total) {
        reCacheBtn.textContent = 'Re-cache';
        reCacheBtn.disabled = true;
        reCacheLabel.textContent = 'Нужно перекэшировать: 0';
        if (progressDiv) {
          setTimeout(() => { progressDiv.style.display = 'none'; }, 1500);
        }
      }
    });
  });

  reCacheTopRow.appendChild(reCacheLabel);
  reCacheTopRow.appendChild(reCacheBtn);
  reCacheRow.appendChild(reCacheTopRow);

  /* Progress bar */
  const progressDiv = document.createElement('div');
  progressDiv.id = 'recache-progress';
  progressDiv.style.display = 'none';
  progressDiv.style.marginTop = '6px';
  progressDiv.innerHTML = `
    <span class="recache-progress-text" style="font-size: 12px; color: #888;">Перекэширование: 0/0</span>
    <div class="offline-progress" style="margin-top: 4px;">
      <div class="offline-progress__bar" style="width: 0%"></div>
    </div>
  `;
  reCacheRow.appendChild(progressDiv);
  section.appendChild(reCacheRow);

  /* ─── Настройки N и D (ТЗ П.8.4) ─── */
  const settingsTitle = document.createElement('div');
  settingsTitle.style.cssText = 'font-size: 12px; color: #888; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.5px;';
  settingsTitle.textContent = 'Настройки облачного кэша';
  section.appendChild(settingsTitle);

  /* N — порог прослушиваний */
  const nRow = document.createElement('div');
  nRow.className = 'offline-row';

  const nLabel = document.createElement('span');
  nLabel.className = 'offline-row__label';
  nLabel.textContent = 'Прослушиваний для ☁:';

  const nInput = document.createElement('input');
  nInput.type = 'number';
  nInput.className = 'offline-input-num';
  nInput.min = '1';
  nInput.max = '100';
  nInput.value = String(stats.cloudN);
  nInput.id = 'cloud-n-input';

  nRow.appendChild(nLabel);
  nRow.appendChild(nInput);
  section.appendChild(nRow);

  /* D — дней хранения */
  const dRow = document.createElement('div');
  dRow.className = 'offline-row';

  const dLabel = document.createElement('span');
  dLabel.className = 'offline-row__label';
  dLabel.textContent = 'Хранить ☁ дней:';

  const dInput = document.createElement('input');
  dInput.type = 'number';
  dInput.className = 'offline-input-num';
  dInput.min = '1';
  dInput.max = '365';
  dInput.value = String(stats.cloudD);
  dInput.id = 'cloud-d-input';

  dRow.appendChild(dLabel);
  dRow.appendChild(dInput);
  section.appendChild(dRow);

  /* Кнопка «Применить» (ТЗ П.8.4) */
  const applyRow = document.createElement('div');
  applyRow.className = 'offline-row';
  applyRow.style.justifyContent = 'flex-end';

  const applyBtn = document.createElement('button');
  applyBtn.className = 'offline-btn offline-btn--primary';
  applyBtn.textContent = 'Применить';
  applyBtn.addEventListener('click', async () => {
    const newN = parseInt(nInput.value, 10) || 5;
    const newD = parseInt(dInput.value, 10) || 31;

    const preview = await mgr.previewCloudSettings(newN, newD);

    if (preview.warnings.length > 0) {
      const msg = preview.warnings.join('\n') + '\n\nПродолжить?';
      if (!confirm(msg)) return;
    }

    applyBtn.disabled = true;
    applyBtn.textContent = 'Применяю…';

    await mgr.confirmApplyCloudSettings(preview);

    applyBtn.textContent = 'Применить';
    applyBtn.disabled = false;

    window.NotificationSystem?.info?.(`Настройки применены: N=${newN}, D=${newD}`);
    refreshAllIndicators();
    _updateReCacheBtn(section, mgr);
  });

  applyRow.appendChild(applyBtn);
  section.appendChild(applyRow);

  /* ─── Кнопки «Список 🔒/☁» и «Удалить все» (ТЗ П.8.5, П.8.6) ─── */
  const actionsRow = document.createElement('div');
  actionsRow.className = 'offline-row';
  actionsRow.style.marginTop = '12px';
  actionsRow.style.gap = '8px';

  /* Список 🔒/☁ */
  const listBtn = document.createElement('button');
  listBtn.className = 'offline-btn';
  listBtn.textContent = '📋 Список 🔒/☁';
  listBtn.addEventListener('click', () => _showCacheListPopup(section, mgr));
  actionsRow.appendChild(listBtn);

  /* Удалить все */
  const deleteAllBtn = document.createElement('button');
  deleteAllBtn.className = 'offline-btn offline-btn--danger';
  deleteAllBtn.textContent = '🗑 Удалить все 🔒/☁';
  deleteAllBtn.addEventListener('click', async () => {
    const summary = await mgr.getCacheStats();
    const totalCount = summary.pinned.count + summary.cloud.count;
    const totalMB = ((summary.pinned.size + summary.cloud.size) / (1024 * 1024)).toFixed(1);

    if (totalCount === 0) {
      window.NotificationSystem?.info?.('Нет закэшированных треков.');
      return;
    }

    /* Двойное подтверждение (ТЗ П.8.6) */
    const ok1 = confirm(
      `Удалить все офлайн-треки (${totalCount} файлов, ${totalMB} МБ)?\n` +
      'Статистика облачков будет сброшена.'
    );
    if (!ok1) return;

    const ok2 = confirm('Вы уверены? Это действие нельзя отменить.');
    if (!ok2) return;

    deleteAllBtn.disabled = true;
    deleteAllBtn.textContent = 'Удаляю…';

    const result = await mgr.removeAllPinnedAndCloud();

    deleteAllBtn.textContent = '🗑 Удалить все 🔒/☁';
    deleteAllBtn.disabled = false;

    window.NotificationSystem?.info?.(
      `Удалено ${result.count} файлов (${(result.totalSize / (1024 * 1024)).toFixed(1)} МБ).`
    );

    refreshAllIndicators();
    _refreshStorageInModal();
  });
  actionsRow.appendChild(deleteAllBtn);

  section.appendChild(actionsRow);

  /* ─── Контейнер для встроенного списка (скрыт по умолчанию) ─── */
  const listContainer = document.createElement('div');
  listContainer.id = 'cache-list-container';
  listContainer.style.display = 'none';
  section.appendChild(listContainer);

  return section;
}

/* ─── Re-cache button updater ─── */

async function _updateReCacheBtn(section, mgr) {
  const count = await mgr.getReCacheCount();
  const label = section.querySelector('#recache-label');
  const btn = section.querySelector('#recache-btn');
  if (label) label.textContent = `Нужно перекэшировать: ${count}`;
  if (btn) btn.disabled = count === 0;
}

/* ─── Список 🔒/☁ (ТЗ П.8.5) ─── */

async function _showCacheListPopup(section, mgr) {
  const container = section.querySelector('#cache-list-container');
  if (!container) return;

  /* Toggle: если уже показан — скрыть */
  if (container.style.display !== 'none') {
    container.style.display = 'none';
    return;
  }

  container.innerHTML = '<div style="color: #888; font-size: 12px; padding: 8px 0;">Загрузка…</div>';
  container.style.display = 'block';

  const list = await mgr.getCacheList();

  if (list.length === 0) {
    container.innerHTML = '<div style="color: #888; font-size: 13px; padding: 8px 0;">Нет закэшированных треков.</div>';
    return;
  }

  container.innerHTML = '';

  const listDiv = document.createElement('div');
  listDiv.className = 'cache-list';

  for (const item of list) {
    const row = document.createElement('div');
    row.className = 'cache-list__item';

    /* Иконка */
    const icon = document.createElement('span');
    icon.className = 'cache-list__icon';
    icon.textContent = item.type === 'pinned' ? '🔒' : '☁';
    icon.style.color = item.type === 'pinned' ? '#f5c842' : '#5bc0de';
    row.appendChild(icon);

    /* Info */
    const info = document.createElement('div');
    info.className = 'cache-list__info';

    const titleEl = document.createElement('div');
    titleEl.className = 'cache-list__title';
    titleEl.textContent = item.title;
    info.appendChild(titleEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'cache-list__meta';
    const sizeMB = (item.size / (1024 * 1024)).toFixed(1);
    metaEl.textContent = `${item.quality.toUpperCase()} · ${sizeMB} МБ · ${item.label}`;
    info.appendChild(metaEl);

    row.appendChild(info);

    /* Actions */
    const actions = document.createElement('div');
    actions.className = 'cache-list__actions';

    if (item.type === 'pinned') {
      /* Снять закрепление (ТЗ П.8.5) */
      const unpinBtn = document.createElement('button');
      unpinBtn.className = 'cache-list__action';
      unpinBtn.textContent = '☁ Снять';
      unpinBtn.title = 'Снять закрепление → станет ☁';
      unpinBtn.addEventListener('click', async () => {
        await mgr.togglePinned(item.uid);
        refreshAllIndicators();
        _showCacheListPopup(section, mgr); /* re-render list */
      });
      actions.appendChild(unpinBtn);
    } else {
      /* Закрепить */
      const pinBtn = document.createElement('button');
      pinBtn.className = 'cache-list__action';
      pinBtn.textContent = '🔒 Pin';
      pinBtn.title = 'Закрепить';
      pinBtn.addEventListener('click', async () => {
        await mgr.togglePinned(item.uid);
        refreshAllIndicators();
        _showCacheListPopup(section, mgr);
      });
      actions.appendChild(pinBtn);

      /* Удалить */
      const delBtn = document.createElement('button');
      delBtn.className = 'cache-list__action cache-list__action--danger';
      delBtn.textContent = '🗑';
      delBtn.title = 'Удалить из кэша';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Удалить трек из кэша? Статистика облачка будет сброшена.')) return;
        await mgr.removeCached(item.uid);
        refreshAllIndicators();
        _showCacheListPopup(section, mgr);
      });
      actions.appendChild(delBtn);
    }

    row.appendChild(actions);
    listDiv.appendChild(row);
  }

  container.appendChild(listDiv);
}

/* ═══════ Modes section ═══════ */

function _buildModesSection(stats, mgr) {
  const section = document.createElement('div');
  section.className = 'offline-section';

  const mode = mgr.getMode();
  const isR1 = mode === 'R1';

  section.innerHTML = `
    <div class="offline-section__title">■ Режимы кэширования</div>
    <div class="offline-row">
      <span class="offline-row__label">PlaybackCache (трёхтрековое окно)</span>
    </div>
    <div style="margin-top: 4px; font-size: 12px; color: #888;">
      ${isR1 ? 'Включён — мгновенные переходы prev/next' : 'Выключен — потоковое воспроизведение'}
    </div>
  `;

  /* Тумблер R0↔R1 (ТЗ 3.2) */
  const toggleRow = document.createElement('div');
  toggleRow.className = 'offline-row';
  toggleRow.style.marginTop = '10px';

  const toggle = document.createElement('button');
  toggle.className = 'offline-btn' + (isR1 ? ' offline-btn--active' : '');
  toggle.textContent = isR1 ? 'Включён (R1)' : 'Выключен (R0)';
  toggle.style.minWidth = '160px';

  if (!stats.spaceOk && !isR1) {
    toggle.disabled = true;
    toggle.title = 'Недостаточно места (минимум 60 МБ)';
  }

  toggle.addEventListener('click', async () => {
    const newMode = isR1 ? 'R0' : 'R1';

    if (newMode === 'R1' && !stats.spaceOk) {
      window.NotificationSystem?.warning?.('Недостаточно места на устройстве');
      return;
    }

    await mgr.setMode(newMode);
    closeOfflineModal();
    setTimeout(() => openOfflineModal(), 100);
  });

  toggleRow.appendChild(toggle);
  section.appendChild(toggleRow);

  /* Placeholder для будущих R2/R3 */
  const placeholder = document.createElement('div');
  placeholder.style.cssText = 'margin-top: 16px; font-size: 11px; color: #555; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 8px;';
  placeholder.textContent = 'Режимы Dynamic Offline и 100% Offline — в разработке.';
  section.appendChild(placeholder);

  return section;
}

/* ═══════ Cleanup section ═══════ */

function _buildCleanupSection(stats, mgr) {
  const section = document.createElement('div');
  section.className = 'offline-section';

  section.innerHTML = `
    <div class="offline-section__title">■ Очистка кэша</div>
    <div style="font-size: 13px; color: #888; margin-bottom: 8px;">
      Удаление dynamic/playback кэша. Pinned и Cloud не затрагиваются.
    </div>
  `;

  const clearDynBtn = document.createElement('button');
  clearDynBtn.className = 'offline-btn';
  clearDynBtn.textContent = '🧹 Очистить dynamic кэш';
  clearDynBtn.addEventListener('click', () => {
    if (!confirm('Очистить dynamic и playback кэш?')) return;
    /* Dynamic cache cleanup — stub, зависит от основного ТЗ */
    window.NotificationSystem?.info?.('Dynamic кэш очищен.');
  });
  section.appendChild(clearDynBtn);

  return section;
}

/* ─── Refresh storage display ─── */

async function _refreshStorageInModal() {
  if (!_modal) return;
  const mgr = getOfflineManager();
  const stats = await mgr.getCacheStats();
  const oldSection = _modal.querySelector('.offline-section:first-of-type');
  if (oldSection) {
    const newSection = _buildStorageSection(stats);
    oldSection.replaceWith(newSection);
  }
}

/* ═══════ Init ═══════ */

export function initOfflineModal() {
  /* Привязка к кнопке открытия (ищем по ID или классу) */
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-offline-modal], .offline-modal-trigger, #offline-btn');
    if (trigger) {
      e.preventDefault();
      openOfflineModal();
    }
  });

  /* Обновление при изменении состояния */
  window.addEventListener('offline:stateChanged', () => {
    if (_modal) _refreshStorageInModal();
  });
}

export default {
  openOfflineModal,
  closeOfflineModal,
  initOfflineModal
};
