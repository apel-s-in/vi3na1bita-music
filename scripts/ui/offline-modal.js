/**
 * offline-modal.js — Модальное окно OFFLINE.
 *
 * ТЗ П.8: Секции в порядке:
 *   1. Хранилище
 *   2. Сетевая политика
 *   3. Pinned и Cloud (НОВАЯ)
 *   4. Режимы кэширования
 *   5. 100% OFFLINE (заглушка)
 *   6. Загрузки
 *   7. Обновления (заглушка)
 *   8. Очистка кэша
 */

import { getOfflineManager } from '../offline/offline-manager.js';
import { estimateUsage } from '../offline/cache-db.js';

/* ═══════ Helpers ═══════ */

function fmt(bytes) {
  if (!bytes || bytes < 0) return '0 MB';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function btn(text, cls, onClick) {
  const b = document.createElement('button');
  b.className = cls || 'offline-modal__btn';
  b.textContent = text;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function emit(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/* ═══════ Main ═══════ */

let _overlay = null;

export async function showOfflineModal() {
  if (_overlay) return; /* уже открыто */

  const mgr = getOfflineManager();
  const stats = await mgr.getCacheStats();
  const est = await estimateUsage();

  _overlay = el('div', 'offline-modal-overlay');
  const modal = el('div', 'offline-modal');

  /* Заголовок */
  const header = el('div', 'offline-modal__header');
  header.innerHTML = '<h2>⚙ OFFLINE</h2>';
  const closeBtn = btn('✕', 'offline-modal__close', closeOfflineModal);
  header.appendChild(closeBtn);
  modal.appendChild(header);

  const body = el('div', 'offline-modal__body');

  /* ══════ СЕКЦИЯ 1: Хранилище ══════ */
  body.appendChild(_buildStorageSection(est, stats));

  /* ══════ СЕКЦИЯ 2: Сетевая политика ══════ */
  body.appendChild(_buildNetPolicySection(mgr, stats));

  /* ══════ СЕКЦИЯ 3: Pinned и Cloud ══════ */
  body.appendChild(await _buildPinnedCloudSection(mgr, stats));

  /* ══════ СЕКЦИЯ 4: Режимы кэширования ══════ */
  body.appendChild(_buildModeSection(mgr, stats));

  /* ══════ СЕКЦИЯ 5: 100% OFFLINE (заглушка) ══════ */
  body.appendChild(_buildFullOfflineSection());

  /* ══════ СЕКЦИЯ 6: Загрузки ══════ */
  body.appendChild(_buildDownloadSection(mgr, stats));

  /* ══════ СЕКЦИЯ 7: Обновления (заглушка) ══════ */
  body.appendChild(_buildUpdatesSection());

  /* ══════ СЕКЦИЯ 8: Очистка кэша ══════ */
  body.appendChild(_buildClearSection(mgr));

  modal.appendChild(body);
  _overlay.appendChild(modal);
  document.body.appendChild(_overlay);

  /* Закрытие по клику на оверлей */
  _overlay.addEventListener('click', (e) => {
    if (e.target === _overlay) closeOfflineModal();
  });
}

export function closeOfflineModal() {
  if (_overlay) {
    _overlay.remove();
    _overlay = null;
  }
}

/* ══════════════════════════════════════════════
   СЕКЦИЯ 1: Хранилище
   ══════════════════════════════════════════════ */

function _buildStorageSection(est, stats) {
  const sec = el('section', 'offline-modal__section');
  sec.innerHTML = `
    <h3>💾 Хранилище</h3>
    <div class="offline-modal__storage-bar">
      <div class="offline-modal__storage-fill" style="width: ${est.quota ? Math.round((est.used / est.quota) * 100) : 0}%"></div>
    </div>
    <div class="offline-modal__storage-text">
      Использовано: ${fmt(est.used)} / ${fmt(est.quota)}<br>
      Свободно: ${fmt(est.free)}<br>
      Треков: ${stats.totalTracks} (🔒 ${stats.pinnedCount} + ☁ ${stats.cloudCount}), ${fmt(stats.totalSize)}
    </div>
  `;
  return sec;
}

/* ══════════════════════════════════════════════
   СЕКЦИЯ 2: Сетевая политика
   ══════════════════════════════════════════════ */

function _buildNetPolicySection(mgr, stats) {
  const sec = el('section', 'offline-modal__section');
  sec.innerHTML = '<h3>🌐 Сетевая политика</h3>';

  const policies = [
    { value: 'any', label: 'Любая сеть' },
    { value: 'wifi', label: 'Только Wi-Fi' },
    { value: 'none', label: 'Без загрузок' }
  ];

  const group = el('div', 'offline-modal__radio-group');
  for (const p of policies) {
    const label = document.createElement('label');
    label.className = 'offline-modal__radio-label';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'netPolicy';
    radio.value = p.value;
    radio.checked = stats.netPolicy === p.value;
    radio.addEventListener('change', () => mgr.setNetPolicy(p.value));
    label.appendChild(radio);
    label.appendChild(document.createTextNode(' ' + p.label));
    group.appendChild(label);
  }
  sec.appendChild(group);
  return sec;
}

/* ══════════════════════════════════════════════
   СЕКЦИЯ 3: Pinned и Cloud (ТЗ П.8.2–П.8.6)
   ══════════════════════════════════════════════ */

async _renderPinnedCloudSection() {
  const section = document.createElement('div');
  section.className = 'offline-section offline-section--pinned-cloud';

  const summary = await offlineManager.getCacheSummary();
  const reCacheList = await offlineManager.getReCacheList();
  const currentQ = offlineManager.getCacheQuality();
  const cloudN = offlineManager.getCloudN();
  const cloudD = offlineManager.getCloudD();
  const spaceOk = offlineManager.isSpaceOk();

  section.innerHTML = `
    <h3 class="offline-section__title">🔒 Pinned и ☁ Cloud</h3>

    ${!spaceOk ? `
      <div class="offline-warning">
        ⚠️ Кэш недоступен. Недостаточно места.
      </div>
    ` : ''}

    <!-- П.8.2: Кнопка качества (дубль плеера) -->
    <div class="offline-row">
      <span class="offline-label">Качество:</span>
      <button class="offline-btn offline-btn--quality" data-action="toggleQuality">
        ${currentQ.toUpperCase()}
      </button>
    </div>

    <!-- П.8.3: Re-cache -->
    <div class="offline-row offline-row--recache" 
         style="display: ${reCacheList.length > 0 ? 'flex' : 'none'}">
      <button class="offline-btn offline-btn--recache" data-action="reCache"
              ${reCacheList.length === 0 ? 'disabled' : ''}>
        Re-cache (${reCacheList.length} файлов)
      </button>
      <div class="offline-progress offline-progress--recache" style="display:none">
        <div class="offline-progress__bar"></div>
        <span class="offline-progress__text">Перекэширование: 0/0</span>
      </div>
    </div>

    <!-- П.8.4: Настройки N и D -->
    <div class="offline-row">
      <span class="offline-label">Прослушиваний для ☁:</span>
      <input type="number" class="offline-input" data-field="cloudN" 
             value="${cloudN}" min="1" max="100" step="1">
    </div>
    <div class="offline-row">
      <span class="offline-label">Хранить ☁ дней:</span>
      <input type="number" class="offline-input" data-field="cloudD" 
             value="${cloudD}" min="1" max="365" step="1">
    </div>
    <div class="offline-row">
      <button class="offline-btn offline-btn--apply" data-action="applyCloudSettings">
        Применить
      </button>
    </div>

    <!-- П.8.5–П.8.6: Список и удаление -->
    <div class="offline-row offline-row--actions">
      <button class="offline-btn" data-action="showCacheList">
        Список 🔒/☁ (${summary.totalCount})
      </button>
      <button class="offline-btn offline-btn--danger" data-action="deleteAllCached"
              ${summary.totalCount === 0 ? 'disabled' : ''}>
        Удалить все 🔒/☁
      </button>
    </div>

    <!-- Сводка -->
    <div class="offline-summary">
      🔒 ${summary.pinnedCount} (${summary.pinnedSizeMB} МБ) · 
      ☁ ${summary.cloudCount} (${summary.cloudSizeMB} МБ) · 
      Всего: ${summary.totalSizeMB} МБ
    </div>
  `;

  /* ═══ Обработчики ═══ */

  /* Качество (П.8.2) */
  section.querySelector('[data-action="toggleQuality"]')
    ?.addEventListener('click', () => {
      const newQ = offlineManager.getCacheQuality() === 'hi' ? 'lo' : 'hi';
      offlineManager.setCacheQualitySetting(newQ);
      this._refreshSection();
    });

  /* Re-cache (П.8.3) */
  section.querySelector('[data-action="reCache"]')
    ?.addEventListener('click', async () => {
      const result = await offlineManager.startForcedReCache();
      if (result.total === 0) {
        window.NotificationSystem?.info?.('Все файлы уже в актуальном качестве.');
        return;
      }
      window.NotificationSystem?.info?.(
        `Перекэширование: ${result.total} файлов.` +
        (result.skippedCur ? ' Текущий трек будет обновлён позже.' : '')
      );
      this._showReCacheProgress(section);
    });

  /* Применить N/D (П.8.4) */
  section.querySelector('[data-action="applyCloudSettings"]')
    ?.addEventListener('click', async () => {
      const newN = parseInt(section.querySelector('[data-field="cloudN"]').value, 10) || 5;
      const newD = parseInt(section.querySelector('[data-field="cloudD"]').value, 10) || 31;

      const preview = await offlineManager.previewCloudSettings(newN, newD);

      if (preview.warnings.length > 0) {
        const msg = preview.warnings.join('\n') + '\n\nПродолжить?';
        if (!confirm(msg)) return;
      }

      await offlineManager.confirmApplyCloudSettings(preview);
      this._refreshSection();
    });

  /* Список (П.8.5) */
  section.querySelector('[data-action="showCacheList"]')
    ?.addEventListener('click', () => {
      this._showCacheListPopup();
    });

  /* Удалить все (П.8.6) */
  section.querySelector('[data-action="deleteAllCached"]')
    ?.addEventListener('click', async () => {
      const s = await offlineManager.getCacheSummary();
      const msg1 = `Удалить все офлайн-треки (${s.totalCount} файлов, ${s.totalSizeMB} МБ)? Статистика облачков будет сброшена.`;
      if (!confirm(msg1)) return;
      if (!confirm('Вы уверены? Это действие нельзя отменить.')) return;

      await offlineManager.removeAllCached();
      this._refreshSection();
    });

  return section;
}

/**
 * Показать прогресс re-cache (П.8.3)
 */
_showReCacheProgress(section) {
  const progressEl = section.querySelector('.offline-progress--recache');
  if (!progressEl) return;
  progressEl.style.display = 'block';

  const handler = (e) => {
    const { uid } = e.detail || {};
    /* Обновить прогресс — упрощённо */
    const status = offlineManager.getDownloadStatus();
    const total = status.queued + status.active;
    const bar = progressEl.querySelector('.offline-progress__bar');
    const text = progressEl.querySelector('.offline-progress__text');
    if (text) text.textContent = `Перекэширование: осталось ${total}`;
    if (total === 0) {
      progressEl.style.display = 'none';
      window.removeEventListener('offline:trackCached', handler);
      window.NotificationSystem?.info?.('Перекэширование завершено.');
    }
  };

  window.addEventListener('offline:trackCached', handler);
}

/**
 * Popup со списком 🔒/☁ треков (П.8.5)
 */
async _showCacheListPopup() {
  const list = await offlineManager.getCachedTrackList();

  const overlay = document.createElement('div');
  overlay.className = 'cache-list-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 10001;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
  `;

  const popup = document.createElement('div');
  popup.style.cssText = `
    background: var(--bg-primary, #1a1a1a);
    border-radius: 12px; padding: 20px;
    max-width: 500px; width: 90%; max-height: 70vh;
    overflow-y: auto; color: var(--text-primary, #eee);
  `;

  let html = '<h3>Офлайн-треки</h3>';

  if (list.length === 0) {
    html += '<p style="opacity:0.5">Нет закэшированных треков.</p>';
  } else {
    for (const item of list) {
      const icon = item.type === 'pinned' ? '🔒' : '☁';
      html += `
        <div class="cache-list-item" data-uid="${item.uid}" data-type="${item.type}"
             style="padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.1); cursor:pointer;">
          <span>${icon}</span>
          <span style="flex:1; margin:0 8px;">${item.title}</span>
          <span style="opacity:0.6; font-size:0.85em;">
            ${item.quality.toUpperCase()} · ${item.sizeMB} МБ · ${item.label}
          </span>
        </div>
      `;
    }
  }

  html += '<button class="cache-list-close" style="margin-top:12px; padding:8px 20px; cursor:pointer;">Закрыть</button>';
  popup.innerHTML = html;
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  /* Клик по треку — действия */
  popup.querySelectorAll('.cache-list-item').forEach(el => {
    el.addEventListener('click', async () => {
      const uid = el.dataset.uid;
      const type = el.dataset.type;

      if (type === 'pinned') {
        if (confirm('Снять закрепление? Трек станет ☁.')) {
          await offlineManager.togglePinned(uid);
          overlay.remove();
          this._showCacheListPopup(); /* перерисовать */
        }
      } else {
        const action = prompt('Выберите действие:\n1 — Закрепить 🔒\n2 — Удалить из кэша\n\nВведите 1 или 2:');
        if (action === '1') {
          await offlineManager.togglePinned(uid);
        } else if (action === '2') {
          if (confirm('Удалить трек из кэша? Статистика облачка будет сброшена.')) {
            await offlineManager.removeCached(uid);
          }
        }
        overlay.remove();
        this._showCacheListPopup();
      }
    });
  });

  /* Закрыть */
  popup.querySelector('.cache-list-close')
    ?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

/* ══════════════════════════════════════════════
   СЕКЦИЯ 4: Режимы кэширования
   ══════════════════════════════════════════════ */

function _buildModeSection(mgr, stats) {
  const sec = el('section', 'offline-modal__section');
  sec.innerHTML = '<h3>📦 Режимы кэширования</h3>';

  const modes = [
    { value: 'R0', label: 'R0 — Без кэширования', desc: 'Кэш не используется' },
    { value: 'R1', label: 'R1 — Только pinned', desc: 'Только закреплённые 🔒 треки' },
    { value: 'R2', label: 'R2 — Pinned + Cloud', desc: '🔒 + ☁ автоматическое облако' },
    { value: 'R3', label: 'R3 — Агрессивный', desc: 'Как R2, но expired не удаляются' }
  ];

  const group = el('div', 'offline-modal__radio-group');
  for (const m of modes) {
    const label = document.createElement('label');
    label.className = 'offline-modal__radio-label';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'cacheMode';
    radio.value = m.value;
    radio.checked = stats.mode === m.value;
    radio.addEventListener('change', async () => {
      await mgr.setMode(m.value);
    });

    label.appendChild(radio);
    label.appendChild(document.createTextNode(' ' + m.label));

    const desc = el('small', 'offline-modal__mode-desc', m.desc);
    label.appendChild(desc);

    group.appendChild(label);
  }
  sec.appendChild(group);
  return sec;
}

/* ══════════════════════════════════════════════
   СЕКЦИЯ 5: 100% OFFLINE (заглушка)
   ══════════════════════════════════════════════ */

function _buildFullOfflineSection() {
  const sec = el('section', 'offline-modal__section');
  sec.innerHTML = `
    <h3>🔌 100% OFFLINE</h3>
    <p class="offline-modal__placeholder">В разработке. Полностью автономный режим.</p>
  `;
  return sec;
}

/* ══════════════════════════════════════════════
   СЕКЦИЯ 6: Загрузки
   ══════════════════════════════════════════════ */

function _buildDownloadSection(mgr, stats) {
  const sec = el('section', 'offline-modal__section');
  sec.innerHTML = '<h3>⬇ Загрузки</h3>';

  const qs = stats.queueStatus;
  const statusText = el('div', 'offline-modal__dl-status');
  statusText.innerHTML = `
    Очередь: ${qs.queued} · Активно: ${qs.active}
    ${qs.activeUid ? ` · Скачивается: ${qs.activeUid}` : ''}
    ${qs.paused ? ' · ⏸ Пауза' : ''}
  `;
  sec.appendChild(statusText);

  const btnRow = el('div', 'offline-modal__row');
  if (qs.paused) {
    btnRow.appendChild(btn('▶ Продолжить', 'offline-modal__btn', () => {
      mgr.queue.resume();
      closeOfflineModal();
      showOfflineModal();
    }));
  } else {
    btnRow.appendChild(btn('⏸ Пауза', 'offline-modal__btn', () => {
      mgr.queue.pause();
      closeOfflineModal();
      showOfflineModal();
    }));
  }

  btnRow.appendChild(btn('🗑 Очистить очередь', 'offline-modal__btn offline-modal__btn--danger', () => {
    if (!confirm('Очистить очередь загрузок?')) return;
    mgr.queue.clear();
    closeOfflineModal();
    showOfflineModal();
  }));

  sec.appendChild(btnRow);

  /* Список элементов в очереди */
  if (qs.items.length > 0) {
    const ul = el('ul', 'offline-modal__queue-list');
    for (const item of qs.items.slice(0, 20)) {
      const li = el('li', '', `${item.uid} (${item.kind}, ${item.quality})`);
      ul.appendChild(li);
    }
    if (qs.items.length > 20) {
      ul.appendChild(el('li', 'offline-modal__more', `... и ещё ${qs.items.length - 20}`));
    }
    sec.appendChild(ul);
  }

  return sec;
}

/* ══════════════════════════════════════════════
   СЕКЦИЯ 7: Обновления (заглушка)
   ══════════════════════════════════════════════ */

function _buildUpdatesSection() {
  const sec = el('section', 'offline-modal__section');
  sec.innerHTML = `
    <h3>🔄 Обновления</h3>
    <p class="offline-modal__placeholder">Автоматическая проверка обновлений. В разработке.</p>
  `;
  return sec;
}

/* ══════════════════════════════════════════════
   СЕКЦИЯ 8: Очистка кэша
   ══════════════════════════════════════════════ */

function _buildClearSection(mgr) {
  const sec = el('section', 'offline-modal__section');
  sec.innerHTML = '<h3>🧹 Очистка кэша</h3>';

  sec.appendChild(btn(
    '🗑 Удалить весь кэш (включая Service Worker)',
    'offline-modal__btn offline-modal__btn--danger',
    async () => {
      if (!confirm('Удалить ВЕСЬ кэш?\nВключая Service Worker, все 🔒 и ☁ треки.')) return;
      if (!confirm('Это действие полностью необратимо. Продолжить?')) return;

      try {
        /* Очистить очередь */
        mgr.queue.clear();

        /* Удалить все pinned/cloud */
        await mgr.removeAllPinnedAndCloud();

        /* Удалить SW кэши */
        if ('caches' in window) {
          const names = await caches.keys();
          for (const name of names) {
            await caches.delete(name);
          }
        }

        /* Unregister SW */
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) {
            await reg.unregister();
          }
        }

        alert('Кэш полностью очищен. Страница будет перезагружена.');
        location.reload();
      } catch (err) {
        alert('Ошибка при очистке: ' + err.message);
      }
    }
  ));

  return sec;
}
