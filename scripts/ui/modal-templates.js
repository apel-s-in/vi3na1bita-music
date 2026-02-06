/**
 * modal-templates.js — HTML-шаблоны для всех модальных окон приложения.
 *
 * Секции OFFLINE-модалки (§11.2):
 *   A — Режим офлайна (R0/R1/R2/R3)
 *   B — Качество (Hi/Lo)
 *   C — Статус хранилища
 *   D — Network Policy (Wi-Fi / Mobile)
 *   E — Pinned альбомы
 *   F — Загрузки (текущая, очередь, пауза)
 *   G — Обновления (обновить все файлы)
 *   H — Очистка кэша по категориям
 *   I — 100% OFFLINE набор (потрековый список)
 *
 * Экспорт:
 *   ModalTemplates.offlineBody(state)
 *   ModalTemplates.statsBody(data)
 *   ModalTemplates.confirmBody(message, opts)
 */

const ModalTemplates = {};

/* ═══════════════════════════════════════════
   Утилиты
   ═══════════════════════════════════════════ */

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 МБ';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' КБ';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' ГБ';
}

function checkedAttr(val) {
  return val ? 'checked' : '';
}

function selectedAttr(current, value) {
  return current === value ? 'selected' : '';
}

function modeLabel(mode) {
  const labels = {
    R0: 'R0 — Только стриминг',
    R1: 'R1 — Умный кэш',
    R2: 'R2 — Динамический офлайн',
    R3: 'R3 — 100% OFFLINE'
  };
  return labels[mode] || mode;
}

function presetLabel(name) {
  const labels = {
    conservative: 'Экономный',
    balanced: 'Сбалансированный',
    aggressive: 'Быстрый'
  };
  return labels[name] || name;
}

/* ═══════════════════════════════════════════
   Секция A — Режим офлайна
   ═══════════════════════════════════════════ */

function sectionA(state) {
  const { mode } = state;

  return `
    <div class="om-section om-section-a">
      <h4 class="om-section-title">Режим офлайна</h4>
      <select id="om-mode-select" class="om-select">
        <option value="R0" ${selectedAttr(mode, 'R0')}>${modeLabel('R0')}</option>
        <option value="R1" ${selectedAttr(mode, 'R1')}>${modeLabel('R1')}</option>
        <option value="R2" ${selectedAttr(mode, 'R2')}>${modeLabel('R2')}</option>
        <option value="R3" ${selectedAttr(mode, 'R3')} ${mode !== 'R3' ? 'disabled' : ''}>${modeLabel('R3')}</option>
      </select>
      <p class="om-hint" id="om-mode-hint">${_modeHint(mode)}</p>
    </div>
  `;
}

function _modeHint(mode) {
  const hints = {
    R0: 'Треки воспроизводятся только из сети. Кэш не используется.',
    R1: 'Прослушанные треки сохраняются в кэш автоматически.',
    R2: 'Выбранные альбомы загружаются для офлайн-прослушивания.',
    R3: 'Все треки доступны офлайн. Сеть не используется для воспроизведения.'
  };
  return hints[mode] || '';
}

/* ═══════════════════════════════════════════
   Секция B — Качество
   ═══════════════════════════════════════════ */

function sectionB(state) {
  const { quality, mode } = state;

  if (mode === 'R0') return '';

  return `
    <div class="om-section om-section-b">
      <h4 class="om-section-title">Качество загрузки</h4>
      <div class="om-radio-group">
        <label class="om-radio">
          <input type="radio" name="om-quality" value="low" ${checkedAttr(quality !== 'high')}>
          Lo — Экономит место
        </label>
        <label class="om-radio">
          <input type="radio" name="om-quality" value="high" ${checkedAttr(quality === 'high')}>
          Hi — Лучшее качество
        </label>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════
   Секция C — Статус хранилища
   ═══════════════════════════════════════════ */

function sectionC(state) {
  const { storage } = state;
  const used = storage?.usage || 0;
  const quota = storage?.quota || 0;
  const pct = quota > 0 ? Math.round((used / quota) * 100) : 0;

  const cats = storage?.categories?.counts || {};
  const sizes = storage?.categories?.sizes || {};

  return `
    <div class="om-section om-section-c">
      <h4 class="om-section-title">Хранилище</h4>
      <div class="om-storage-bar">
        <div class="om-storage-fill" style="width:${pct}%"></div>
      </div>
      <div class="om-storage-info">
        ${formatBytes(used)} / ${formatBytes(quota)} (${pct}%)
      </div>
      <div class="om-category-list">
        <div class="om-category-row">
          <span>📌 Pinned:</span>
          <span>${cats.pinned || 0} треков · ${formatBytes(sizes.pinned || 0)}</span>
        </div>
        <div class="om-category-row">
          <span>☁️ Cloud:</span>
          <span>${cats.cloud || 0} треков · ${formatBytes(sizes.cloud || 0)}</span>
        </div>
        <div class="om-category-row">
          <span>⚡ Dynamic:</span>
          <span>${cats.dynamic || 0} треков · ${formatBytes(sizes.dynamic || 0)}</span>
        </div>
        <div class="om-category-row om-category-total">
          <span>Всего:</span>
          <span>${cats.total || 0} треков · ${formatBytes(sizes.total || 0)}</span>
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════
   Секция D — Network Policy (ТЗ §11.2.D)
   ═══════════════════════════════════════════ */

function sectionD(state) {
  const { mode, netPolicy } = state;

  if (mode === 'R0') return '';

  const policy = netPolicy || { wifi: true, mobile: true };

  return `
    <div class="om-section om-section-d">
      <h4 class="om-section-title">Сеть для загрузок</h4>
      <label class="om-toggle">
        <input type="checkbox" id="om-net-wifi" ${checkedAttr(policy.wifi)}>
        <span>Wi-Fi</span>
      </label>
      <label class="om-toggle">
        <input type="checkbox" id="om-net-mobile" ${checkedAttr(policy.mobile)}>
        <span>Мобильная сеть</span>
      </label>
      <p class="om-hint">При массовых загрузках рекомендуется Wi-Fi.</p>
    </div>
  `;
}

/* ═══════════════════════════════════════════
   Секция E — Pinned альбомы
   ═══════════════════════════════════════════ */

function sectionE(state) {
  const { mode, pinnedAlbums, albums } = state;

  if (mode === 'R0') return '';

  const pinned = pinnedAlbums || [];
  const allAlbums = albums || [];

  if (allAlbums.length === 0) {
    return `
      <div class="om-section om-section-e">
        <h4 class="om-section-title">📌 Сохранённые альбомы</h4>
        <p class="om-hint">Загрузка списка альбомов...</p>
      </div>
    `;
  }

  const rows = allAlbums.map(a => {
    const isPinned = pinned.includes(a.id);
    return `
      <label class="om-album-row">
        <input type="checkbox"
               class="om-album-check"
               data-album-id="${a.id}"
               ${checkedAttr(isPinned)}>
        <span class="om-album-name">${a.title || a.id}</span>
        <span class="om-album-count">${a.trackCount || '?'} треков</span>
      </label>
    `;
  }).join('');

  return `
    <div class="om-section om-section-e">
      <h4 class="om-section-title">📌 Сохранённые альбомы</h4>
      <div class="om-album-list">${rows}</div>
    </div>
  `;
}

/* ═══════════════════════════════════════════
   Секция F — Загрузки (ТЗ §11.2.F)
   ═══════════════════════════════════════════ */

function sectionF(state) {
  const { mode, queue } = state;

  if (mode === 'R0') return '';

  const q = queue || { active: 0, queued: 0, paused: false, preset: 'balanced', items: [] };
  const currentItem = q.items && q.items.length > 0 ? q.items[0] : null;

  const pauseLabel = q.paused ? '▶️ Возобновить' : '⏸ Пауза';
  const pauseAction = q.paused ? 'resume' : 'pause';

  return `
    <div class="om-section om-section-f">
      <h4 class="om-section-title">Загрузки</h4>

      <div class="om-downloads-status">
        <div class="om-dl-row">
          <span>Скачивается сейчас:</span>
          <span id="om-dl-current">${currentItem ? (currentItem.uid || '...') : '—'}</span>
        </div>
        <div class="om-dl-row">
          <span>Активных:</span>
          <span id="om-dl-active">${q.active}</span>
        </div>
        <div class="om-dl-row">
          <span>В очереди:</span>
          <span id="om-dl-queued">${q.queued}</span>
        </div>
      </div>

      <div class="om-downloads-controls">
        <button class="om-btn om-btn--small" id="om-dl-toggle" data-action="${pauseAction}">
          ${pauseLabel}
        </button>

        <label class="om-preset-label">
          Профиль:
          <select id="om-preset-select" class="om-select om-select--small">
            <option value="conservative" ${selectedAttr(q.preset, 'conservative')}>${presetLabel('conservative')}</option>
            <option value="balanced" ${selectedAttr(q.preset, 'balanced')}>${presetLabel('balanced')}</option>
            <option value="aggressive" ${selectedAttr(q.preset, 'aggressive')}>${presetLabel('aggressive')}</option>
          </select>
        </label>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════
   Секция G — Обновления (ТЗ §11.2.G)
   ═══════════════════════════════════════════ */

function sectionG(state) {
  const { mode, storage } = state;

  if (mode === 'R0') return '';

  const totalTracks = storage?.categories?.counts?.total || 0;
  const totalSize = storage?.categories?.sizes?.total || 0;

  return `
    <div class="om-section om-section-g">
      <h4 class="om-section-title">Обновления</h4>
      <p class="om-hint">
        Перезагрузить все ${totalTracks} файлов (${formatBytes(totalSize)}).
        Рекомендуется при подключении к Wi-Fi.
      </p>
      <button class="om-btn" id="om-refresh-all">
        🔄 Обновить все файлы
      </button>
    </div>
  `;
}

/* ═══════════════════════════════════════════
   Секция H — Очистка кэша по категориям (ТЗ §11.2.H)
   ═══════════════════════════════════════════ */

function sectionH(state) {
  const { storage } = state;

  const cats = storage?.categories?.counts || {};
  const sizes = storage?.categories?.sizes || {};

  return `
    <div class="om-section om-section-h">
      <h4 class="om-section-title">Очистка кэша</h4>

      <div class="om-clear-buttons">
        ${cats.cloud > 0 ? `
          <button class="om-btn om-btn--outline" data-clear="cloud">
            ☁️ Очистить cloud (${cats.cloud} · ${formatBytes(sizes.cloud || 0)})
          </button>
        ` : ''}

        ${cats.dynamic > 0 ? `
          <button class="om-btn om-btn--outline" data-clear="dynamic">
            ⚡ Очистить dynamic (${cats.dynamic} · ${formatBytes(sizes.dynamic || 0)})
          </button>
        ` : ''}

        ${cats.pinned > 0 ? `
          <button class="om-btn om-btn--outline om-btn--danger" data-clear="pinned">
            📌 Очистить pinned (${cats.pinned} · ${formatBytes(sizes.pinned || 0)})
          </button>
        ` : ''}

        ${(cats.total || 0) > 0 ? `
          <hr class="om-divider">
          <button class="om-btn om-btn--danger" data-clear="all">
            🗑 Очистить ВСЁ (${cats.total} · ${formatBytes(sizes.total || 0)})
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════
   Секция I — 100% OFFLINE набор (ТЗ §11.2.I)
   ═══════════════════════════════════════════ */

function sectionI(state) {
  const { mode, foTracks } = state;

  if (mode !== 'R2' && mode !== 'R3') return '';

  const tracks = foTracks || [];

  if (tracks.length === 0) {
    return `
      <div class="om-section om-section-i">
        <h4 class="om-section-title">100% OFFLINE набор</h4>
        <p class="om-hint">Сохраните альбомы в секции выше для формирования набора.</p>
      </div>
    `;
  }

  const trackRows = tracks.map(t => `
    <div class="om-fo-track" data-uid="${t.uid}">
      <span class="om-fo-track-title">${t.title || t.uid}</span>
      <span class="om-fo-track-size">${formatBytes(t.size || 0)}</span>
      <span class="om-fo-track-status ${t.cached ? 'om-cached' : 'om-pending'}">
        ${t.cached ? '✅' : '⏳'}
      </span>
      <div class="om-fo-track-actions">
        <button class="om-btn--icon" data-fo-action="remove" data-uid="${t.uid}" title="Удалить из набора">✕</button>
        <button class="om-btn--icon" data-fo-action="download" data-uid="${t.uid}" title="Скачать на устройство">💾</button>
        <button class="om-btn--icon" data-fo-action="share" data-uid="${t.uid}" title="Поделиться">📤</button>
      </div>
    </div>
  `).join('');

  const cachedCount = tracks.filter(t => t.cached).length;
  const pct = tracks.length > 0 ? Math.round((cachedCount / tracks.length) * 100) : 0;

  return `
    <div class="om-section om-section-i">
      <h4 class="om-section-title">
        100% OFFLINE набор
        <span class="om-fo-progress">${cachedCount}/${tracks.length} (${pct}%)</span>
      </h4>
      <div class="om-fo-bar">
        <div class="om-fo-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="om-fo-tracklist">${trackRows}</div>
    </div>
  `;
}

/* ═══════════════════════════════════════════
   Полная OFFLINE модалка
   ═══════════════════════════════════════════ */

/**
 * Генерирует HTML тела OFFLINE модалки.
 *
 * @param {Object} state
 * @param {string}  state.mode          — R0|R1|R2|R3
 * @param {string}  state.quality       — 'high'|'low'
 * @param {Object}  state.storage       — { usage, quota, categories }
 * @param {Object}  state.netPolicy     — { wifi, mobile }
 * @param {Array}   state.pinnedAlbums  — [albumId, ...]
 * @param {Array}   state.albums        — [{ id, title, trackCount }, ...]
 * @param {Object}  state.queue         — { active, queued, paused, preset, items }
 * @param {Array}   state.foTracks      — [{ uid, title, size, cached }, ...]
 * @returns {string} HTML
 */
ModalTemplates.offlineBody = function (state) {
  const s = state || {};

  return `
    <div class="om-body">
      ${sectionA(s)}
      ${sectionB(s)}
      ${sectionC(s)}
      ${sectionD(s)}
      ${sectionE(s)}
      ${sectionF(s)}
      ${sectionG(s)}
      ${sectionH(s)}
      ${sectionI(s)}
    </div>
  `;
};

/* ═══════════════════════════════════════════
   Модалка статистики (§17)
   ═══════════════════════════════════════════ */

ModalTemplates.statsBody = function (data) {
  const d = data || {};
  const total = d.total || {};
  const tracks = d.tracks || [];

  const trackRows = tracks.slice(0, 50).map(t => `
    <div class="om-stat-row">
      <span class="om-stat-title">${t.title || t.uid}</span>
      <span class="om-stat-val">${_formatTime(t.seconds || 0)}</span>
      <span class="om-stat-plays">${t.fullPlays || 0} 🔁</span>
    </div>
  `).join('');

  return `
    <div class="om-body om-stats-body">
      <div class="om-section">
        <h4 class="om-section-title">Общая статистика</h4>
        <div class="om-stat-row om-stat-total">
          <span>Всего прослушано:</span>
          <span>${_formatTime(total.seconds || 0)}</span>
        </div>
        <div class="om-stat-row om-stat-total">
          <span>Полных прослушиваний:</span>
          <span>${total.fullPlays || 0}</span>
        </div>
      </div>
      ${tracks.length > 0 ? `
        <div class="om-section">
          <h4 class="om-section-title">По трекам (топ-50)</h4>
          <div class="om-stat-list">${trackRows}</div>
        </div>
      ` : ''}
    </div>
  `;
};

function _formatTime(sec) {
  if (sec < 60) return `${Math.round(sec)} сек`;
  if (sec < 3600) return `${Math.floor(sec / 60)} мин`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h} ч ${m} мин`;
}

/* ═══════════════════════════════════════════
   Модалка подтверждения (универсальная)
   ═══════════════════════════════════════════ */

ModalTemplates.confirmBody = function (message, opts = {}) {
  const { detail } = opts;

  return `
    <div class="om-body om-confirm-body">
      <p class="om-confirm-text">${message}</p>
      ${detail ? `<p class="om-confirm-detail">${detail}</p>` : ''}
    </div>
  `;
};

/* ═══════════════════════════════════════════
   Экспорт
   ═══════════════════════════════════════════ */

export default ModalTemplates;
export { ModalTemplates, formatBytes };
