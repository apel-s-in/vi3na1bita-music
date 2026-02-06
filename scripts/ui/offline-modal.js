/**
 * offline-modal.js — Модальное окно настроек офлайн-режима.
 *
 * ТЗ: П.8 (все секции), П.8.1–П.8.5
 *
 * Секции:
 *   1. Режим офлайн (R0–R3)
 *   2. Качество кэша (Hi/Lo) — дубль кнопки плеера
 *   3. Облачные настройки (N, D)
 *   4. Сетевая политика
 *   5. Пресет загрузки
 *   6. Статус очереди загрузок
 *   7. Хранилище и категории
 *   8. 🔒/☁ список с кнопками Re-cache, Удалить всё
 */

import { getOfflineManager } from '../offline/offline-manager.js';

let _modal = null;

/* ═══════ Открытие ═══════ */

export async function openOfflineModal() {
  if (_modal) { closeOfflineModal(); return; }

  const mgr = getOfflineManager();

  /* ── Контейнер ── */
  const overlay = document.createElement('div');
  overlay.className = 'offline-modal-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOfflineModal();
  });

  const modal = document.createElement('div');
  modal.className = 'offline-modal';

  /* ── Заголовок ── */
  const header = document.createElement('div');
  header.className = 'offline-modal__header';
  header.innerHTML = `
    <h2>⚙️ Офлайн-режим</h2>
    <button class="offline-modal__close" title="Закрыть">&times;</button>
  `;
  header.querySelector('.offline-modal__close').addEventListener('click', closeOfflineModal);
  modal.appendChild(header);

  /* ── Скролл-контейнер ── */
  const body = document.createElement('div');
  body.className = 'offline-modal__body';

  /* ═══ Секция 1: Режим ═══ */
  body.appendChild(_buildSection('📡 Режим офлайн', () => {
    const currentMode = mgr.getMode();
    const modes = [
      { id: 'R0', label: 'R0 — Только онлайн', desc: 'Без кэширования.' },
      { id: 'R1', label: 'R1 — Только 🔒', desc: 'Кэш только для закреплённых.' },
      { id: 'R2', label: 'R2 — 🔒 + ☁', desc: 'Закреплённые + облачный авто-кэш.' },
      { id: 'R3', label: 'R3 — 🔒 + ☁ + окно', desc: 'Всё + предзагрузка соседних треков.' }
    ];

    const wrap = document.createElement('div');
    wrap.className = 'offline-modal__modes';

    for (const m of modes) {
      const label = document.createElement('label');
      label.className = 'offline-modal__mode-option';
      label.innerHTML = `
        <input type="radio" name="offlineMode" value="${m.id}"
               ${currentMode === m.id ? 'checked' : ''}>
        <strong>${m.label}</strong>
        <span class="desc">${m.desc}</span>
      `;
      label.querySelector('input').addEventListener('change', async (e) => {
        await mgr.setMode(e.target.value);
        _refreshStatus(body, mgr);
      });
      wrap.appendChild(label);
    }
    return wrap;
  }));

  /* ═══ Секция 2: Качество ═══ */
  body.appendChild(_buildSection('🎵 Качество кэша', () => {
    const q = mgr.getCacheQuality();
    const wrap = document.createElement('div');
    wrap.className = 'offline-modal__quality';
    wrap.innerHTML = `
      <p>Текущее качество: <strong>${q === 'hi' ? 'Hi (оригинал)' : 'Lo (сжатое)'}</strong></p>
      <p class="hint">Совпадает с качеством плеера (ТЗ П.3.1)</p>
      <div class="btn-group">
        <button class="btn ${q === 'hi' ? 'btn--active' : ''}" data-q="hi">Hi</button>
        <button class="btn ${q === 'lo' ? 'btn--active' : ''}" data-q="lo">Lo</button>
      </div>
      <p class="hint">При смене качества все кэшированные треки будут помечены для re-cache.</p>
    `;
    wrap.querySelectorAll('[data-q]').forEach(btn => {
      btn.addEventListener('click', async () => {
        mgr.setCacheQualitySetting(btn.dataset.q);
        wrap.querySelectorAll('[data-q]').forEach(b => b.classList.remove('btn--active'));
        btn.classList.add('btn--active');
        wrap.querySelector('p strong').textContent =
          btn.dataset.q === 'hi' ? 'Hi (оригинал)' : 'Lo (сжатое)';
      });
    });
    return wrap;
  }));

  /* ═══ Секция 3: Облачные настройки N и D ═══ */
  body.appendChild(_buildSection('☁ Облачные настройки', () => {
    const wrap = document.createElement('div');
    wrap.className = 'offline-modal__cloud-settings';

    const currentN = mgr.getCloudN();
    const currentD = mgr.getCloudD();

    wrap.innerHTML = `
      <div class="field">
        <label>N — порог прослушиваний для появления ☁:</label>
        <input type="number" id="om-cloud-n" value="${currentN}" min="1" max="100" step="1">
      </div>
      <div class="field">
        <label>D — срок хранения облачного кэша (дней):</label>
        <input type="number" id="om-cloud-d" value="${currentD}" min="1" max="365" step="1">
      </div>
      <button class="btn btn--apply" id="om-cloud-apply">Применить N/D</button>
      <p class="hint">
        Трек получает ☁ после N полных прослушиваний.<br>
        Каждое новое прослушивание продлевает TTL на D дней.
      </p>
    `;

    wrap.querySelector('#om-cloud-apply').addEventListener('click', () => {
      const n = parseInt(wrap.querySelector('#om-cloud-n').value) || 5;
      const d = parseInt(wrap.querySelector('#om-cloud-d').value) || 31;
      mgr.setCloudN(n);
      mgr.setCloudD(d);
      window.NotificationSystem?.info?.(`Облачные настройки обновлены: N=${n}, D=${d}`);
    });

    return wrap;
  }));

  /* ═══ Секция 4: Сетевая политика ═══ */
  body.appendChild(_buildSection('📶 Сетевая политика', () => {
    const policy = mgr.getNetPolicy();
    const wrap = document.createElement('div');
    wrap.className = 'offline-modal__net-policy';
    wrap.innerHTML = `
      <label><input type="checkbox" id="om-net-wifi" ${policy.wifi ? 'checked' : ''}> Скачивать по Wi-Fi</label>
      <label><input type="checkbox" id="om-net-mobile" ${policy.mobile ? 'checked' : ''}> Скачивать по мобильной сети</label>
    `;
    wrap.querySelector('#om-net-wifi').addEventListener('change', (e) => {
      mgr.setNetPolicy({ wifi: e.target.checked });
    });
    wrap.querySelector('#om-net-mobile').addEventListener('change', (e) => {
      mgr.setNetPolicy({ mobile: e.target.checked });
    });
    return wrap;
  }));

  /* ═══ Секция 5: Пресет загрузки ═══ */
  body.appendChild(_buildSection('⚡ Пресет загрузки', () => {
    const preset = mgr.getPreset();
    const wrap = document.createElement('div');
    wrap.className = 'offline-modal__preset';
    const presets = [
      { name: 'conservative', label: 'Экономный' },
      { name: 'balanced', label: 'Сбалансированный' },
      { name: 'aggressive', label: 'Быстрый' }
    ];
    for (const p of presets) {
      const btn = document.createElement('button');
      btn.className = `btn ${preset.name === p.name ? 'btn--active' : ''}`;
      btn.textContent = p.label;
      btn.addEventListener('click', () => {
        mgr.setPreset(p.name);
        wrap.querySelectorAll('.btn').forEach(b => b.classList.remove('btn--active'));
        btn.classList.add('btn--active');
      });
      wrap.appendChild(btn);
    }
    return wrap;
  }));

  /* ═══ Секция 6: Очередь загрузок ═══ */
  body.appendChild(_buildSection('📥 Очередь загрузок', () => {
    const wrap = document.createElement('div');
    wrap.className = 'offline-modal__queue';
    wrap.id = 'om-queue-status';
    _renderQueueStatus(wrap, mgr);

    const btnRow = document.createElement('div');
    btnRow.className = 'btn-group';

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'btn';
    pauseBtn.textContent = '⏸ Пауза';
    pauseBtn.addEventListener('click', () => {
      mgr.pauseDownloads();
      _renderQueueStatus(wrap, mgr);
    });

    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'btn';
    resumeBtn.textContent = '▶ Продолжить';
    resumeBtn.addEventListener('click', () => {
      mgr.resumeDownloads();
      _renderQueueStatus(wrap, mgr);
    });

    btnRow.appendChild(pauseBtn);
    btnRow.appendChild(resumeBtn);
    wrap.appendChild(btnRow);

    return wrap;
  }));

  /* ═══ Секция 7: Хранилище ═══ */
  body.appendChild(_buildSection('💾 Хранилище', () => {
    const wrap = document.createElement('div');
    wrap.className = 'offline-modal__storage';
    wrap.id = 'om-storage-status';
    wrap.textContent = 'Загрузка…';
    _renderStorageInfo(wrap, mgr);
    return wrap;
  }));

  /* ═══ Секция 8: Список 🔒/☁ (ТЗ П.8.1) ═══ */
  body.appendChild(_buildSection('🔒☁ Закреплённые и облачные треки', () => {
    const wrap = document.createElement('div');
    wrap.className = 'offline-modal__pinned-cloud';

    /* Кнопки управления */
    const controls = document.createElement('div');
    controls.className = 'btn-group';

    const reCacheBtn = document.createElement('button');
    reCacheBtn.className = 'btn';
    reCacheBtn.textContent = '🔄 Re-cache все';
    reCacheBtn.addEventListener('click', async () => {
      reCacheBtn.disabled = true;
      reCacheBtn.textContent = '🔄 Re-cache…';
      const progressBar = wrap.querySelector('.recache-progress');
      if (progressBar) progressBar.style.display = 'block';

      await mgr.reCacheAll((p) => {
        if (progressBar) {
          progressBar.textContent = `Re-cache: ${p.done}/${p.total} (${p.pct}%)`;
        }
        reCacheBtn.textContent = `🔄 Re-cache… ${p.pct}%`;
      });

      reCacheBtn.disabled = false;
      reCacheBtn.textContent = '🔄 Re-cache все';
      if (progressBar) progressBar.style.display = 'none';
      _renderPinnedCloudList(listContainer, mgr);
    });

    const deleteAllBtn = document.createElement('button');
    deleteAllBtn.className = 'btn btn--danger';
    deleteAllBtn.textContent = '🗑 Удалить все 🔒/☁';
    deleteAllBtn.addEventListener('click', async () => {
      const ok = confirm(
        'Удалить ВСЕ закреплённые и облачные треки из кэша?\n\n' +
        'Это действие нельзя отменить. Треки останутся в каталоге,\n' +
        'но будут воспроизводиться только онлайн.'
      );
      if (!ok) return;
      const pinnedCount = await mgr.clearByCategory('pinned');
      const cloudCount = await mgr.clearByCategory('cloud');
      window.NotificationSystem?.info?.(`Удалено: ${pinnedCount + cloudCount} треков.`);
      _renderPinnedCloudList(listContainer, mgr);
    });

    controls.appendChild(reCacheBtn);
    controls.appendChild(deleteAllBtn);
    wrap.appendChild(controls);

    /* Прогресс re-cache */
    const progressEl = document.createElement('div');
    progressEl.className = 'recache-progress';
    progressEl.style.display = 'none';
    wrap.appendChild(progressEl);

    /* Список треков */
    const listContainer = document.createElement('div');
    listContainer.className = 'offline-modal__track-list';
    listContainer.textContent = 'Загрузка…';
    wrap.appendChild(listContainer);

    _renderPinnedCloudList(listContainer, mgr);

    return wrap;
  }));

  /* ═══ Секция 9: Очистка по категориям ═══ */
  body.appendChild(_buildSection('🧹 Очистка кэша', () => {
    const wrap = document.createElement('div');
    wrap.className = 'offline-modal__cleanup';

    const categories = [
      { key: 'pinned', label: '🔒 Закреплённые' },
      { key: 'cloud', label: '☁ Облачные' },
      { key: 'dynamic', label: '🎵 Динамические (playback window)' },
      { key: 'all', label: '💥 Всё' }
    ];

    for (const cat of categories) {
      const btn = document.createElement('button');
      btn.className = `btn ${cat.key === 'all' ? 'btn--danger' : ''}`;
      btn.textContent = `Удалить ${cat.label}`;
      btn.addEventListener('click', async () => {
        const ok = confirm(`Удалить все кэшированные данные категории "${cat.label}"?`);
        if (!ok) return;
        const count = await mgr.clearByCategory(cat.key);
        window.NotificationSystem?.info?.(`Удалено ${count} элементов (${cat.label}).`);
        _refreshStatus(body, mgr);
      });
      wrap.appendChild(btn);
    }

    return wrap;
  }));

  /* ── Собираем модал ── */
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  _modal = overlay;

  /* ESC закрытие */
  document.addEventListener('keydown', _escHandler);
}

/* ═══════ Закрытие ═══════ */

export function closeOfflineModal() {
  if (_modal) {
    _modal.remove();
    _modal = null;
  }
  document.removeEventListener('keydown', _escHandler);
}

function _escHandler(e) {
  if (e.key === 'Escape') closeOfflineModal();
}

/* ═══════ Helpers ═══════ */

function _buildSection(title, contentFn) {
  const section = document.createElement('section');
  section.className = 'offline-modal__section';

  const h3 = document.createElement('h3');
  h3.className = 'offline-modal__section-title';
  h3.textContent = title;
  section.appendChild(h3);

  const content = contentFn();
  if (content) section.appendChild(content);

  return section;
}

function _renderQueueStatus(container, mgr) {
  const status = mgr.queue.getStatus();
  const info = container.querySelector('.queue-info') || document.createElement('div');
  info.className = 'queue-info';
  info.innerHTML = `
    <p>В очереди: <strong>${status.queued}</strong> | 
       Активных: <strong>${status.active}</strong> | 
       Пауза: <strong>${status.paused ? 'Да' : 'Нет'}</strong></p>
    ${status.activeUid ? `<p>Скачивается: <code>${status.activeUid}</code></p>` : ''}
  `;
  if (!info.parentElement) container.prepend(info);
}

async function _renderStorageInfo(container, mgr) {
  try {
    const info = await mgr.getStorageInfo();
    const usedMB = ((info.used || 0) / (1024 * 1024)).toFixed(1);
    const quotaMB = ((info.quota || 0) / (1024 * 1024)).toFixed(0);
    const freeMB = ((info.free || 0) / (1024 * 1024)).toFixed(0);
    const cats = info.categories;

    container.innerHTML = `
      <div class="storage-bar">
        <div class="storage-bar__fill"
             style="width: ${info.quota ? Math.min(100, (info.used / info.quota) * 100) : 0}%">
        </div>
      </div>
      <p>Использовано: <strong>${usedMB} МБ</strong> из ${quotaMB} МБ (свободно ${freeMB} МБ)</p>
      <table class="storage-table">
        <tr><th>Категория</th><th>Кол-во</th><th>Размер</th></tr>
        <tr>
          <td>🔒 Закреплённые</td>
          <td>${cats.counts.pinned}</td>
          <td>${(cats.sizes.pinned / (1024 * 1024)).toFixed(1)} МБ</td>
        </tr>
        <tr>
          <td>☁ Облачные</td>
          <td>${cats.counts.cloud}</td>
          <td>${(cats.sizes.cloud / (1024 * 1024)).toFixed(1)} МБ</td>
        </tr>
        <tr>
          <td>🎵 Динамические</td>
          <td>${cats.counts.dynamic}</td>
          <td>${(cats.sizes.dynamic / (1024 * 1024)).toFixed(1)} МБ</td>
        </tr>
        <tr>
          <td><strong>Всего</strong></td>
          <td><strong>${cats.counts.total}</strong></td>
          <td><strong>${(cats.sizes.total / (1024 * 1024)).toFixed(1)} МБ</strong></td>
        </tr>
      </table>
    `;
  } catch (e) {
    container.textContent = 'Ошибка загрузки информации о хранилище.';
    console.error('[OfflineModal] Storage info error:', e);
  }
}

async function _renderPinnedCloudList(container, mgr) {
  try {
    const items = await mgr.getPinnedAndCloudList();

    if (!items.length) {
      container.innerHTML = '<p class="empty">Нет закреплённых или облачных треков.</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'offline-track-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Тип</th>
          <th>Название</th>
          <th>Качество</th>
          <th>Прослуш.</th>
          <th>Re-cache</th>
          <th>Действия</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement('tbody');

    for (const item of items) {
      const tr = document.createElement('tr');
      const icon = item.type === 'pinned' ? '🔒' : '☁';
      const needsRC = item.needsReCache ? '⚠️' : '✅';
      const expiresStr = item.cloudExpiresAt
        ? `TTL: ${Math.ceil((item.cloudExpiresAt - Date.now()) / (24 * 60 * 60 * 1000))}д`
        : '';

      tr.innerHTML = `
        <td>${icon}</td>
        <td>
          <div class="track-name">${item.title || item.uid}</div>
          <div class="track-meta">${item.artist || ''} ${expiresStr ? `· ${expiresStr}` : ''}</div>
        </td>
        <td>${item.quality || '?'}</td>
        <td>${item.cloudFullListenCount || 0}</td>
        <td>${needsRC}</td>
        <td class="actions"></td>
      `;

      const actionsCell = tr.querySelector('.actions');

      /* Кнопка toggle pin */
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'btn btn--small';
      toggleBtn.textContent = item.type === 'pinned' ? '🔓' : '🔒';
      toggleBtn.title = item.type === 'pinned' ? 'Открепить' : 'Закрепить';
      toggleBtn.addEventListener('click', async () => {
        await mgr.togglePinned(item.uid);
        _renderPinnedCloudList(container, mgr);
      });
      actionsCell.appendChild(toggleBtn);

      /* Кнопка удалить */
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn--small btn--danger';
      delBtn.textContent = '🗑';
      delBtn.title = 'Удалить из кэша';
      delBtn.addEventListener('click', async () => {
        await mgr.removeCached(item.uid);
        _renderPinnedCloudList(container, mgr);
      });
      actionsCell.appendChild(delBtn);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

  } catch (e) {
    container.textContent = 'Ошибка загрузки списка.';
    console.error('[OfflineModal] Track list error:', e);
  }
}

function _refreshStatus(body, mgr) {
  const queueEl = body.querySelector('#om-queue-status');
  if (queueEl) _renderQueueStatus(queueEl, mgr);

  const storageEl = body.querySelector('#om-storage-status');
  if (storageEl) _renderStorageInfo(storageEl, mgr);
}

export default { openOfflineModal, closeOfflineModal };
