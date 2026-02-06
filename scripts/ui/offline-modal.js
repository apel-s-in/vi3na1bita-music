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

async function _buildPinnedCloudSection(mgr, stats) {
  const sec = el('section', 'offline-modal__section');
  sec.innerHTML = '<h3>🔒☁ Pinned и Cloud</h3>';

  /* ── П.8.2: Кнопка качества Hi/Lo ── */
  const qualityRow = el('div', 'offline-modal__row');
  qualityRow.innerHTML = '<span>Качество кэша:</span>';
  const qBtn = btn(
    stats.quality === 'hi' ? '🎵 Hi' : '🎵 Lo',
    'offline-modal__btn offline-modal__btn--quality',
    () => {
      const newQ = mgr.getCacheQuality() === 'hi' ? 'lo' : 'hi';
      mgr.setCacheQualitySetting(newQ);
      qBtn.textContent = newQ === 'hi' ? '🎵 Hi' : '🎵 Lo';
    }
  );
  qualityRow.appendChild(qBtn);
  sec.appendChild(qualityRow);

  /* ── П.8.3: Re-cache ── */
  const reCacheRow = el('div', 'offline-modal__row');
  const reCacheBtn = btn('🔄 Re-cache', 'offline-modal__btn', async () => {
    reCacheBtn.disabled = true;
    reCacheBtn.textContent = '🔄 Запуск...';

    const progressBar = el('div', 'offline-modal__progress');
    const progressFill = el('div', 'offline-modal__progress-fill');
    progressBar.appendChild(progressFill);
    reCacheRow.appendChild(progressBar);

    const total = await mgr.reCacheAll(({ done, total: t }) => {
      const pct = t > 0 ? Math.round((done / t) * 100) : 0;
      progressFill.style.width = pct + '%';
    });

    reCacheBtn.disabled = false;
    reCacheBtn.textContent = `🔄 Re-cache (${total} в очереди)`;
  });
  reCacheRow.appendChild(reCacheBtn);
  sec.appendChild(reCacheRow);

  /* ── П.8.4: Поля N / D + «Применить» ── */
  const ndRow = el('div', 'offline-modal__row offline-modal__nd-row');

  const nLabel = el('label', '', 'N (прослушиваний): ');
  const nInput = document.createElement('input');
  nInput.type = 'number';
  nInput.min = '1';
  nInput.max = '100';
  nInput.value = stats.cloudN;
  nInput.className = 'offline-modal__input';
  nLabel.appendChild(nInput);
  ndRow.appendChild(nLabel);

  const dLabel = el('label', '', 'D (дней TTL): ');
  const dInput = document.createElement('input');
  dInput.type = 'number';
  dInput.min = '1';
  dInput.max = '365';
  dInput.value = stats.cloudD;
  dInput.className = 'offline-modal__input';
  dLabel.appendChild(dInput);
  ndRow.appendChild(dLabel);

  const applyBtn = btn('✅ Применить', 'offline-modal__btn offline-modal__btn--apply', async () => {
    const newN = parseInt(nInput.value, 10) || 3;
    const newD = parseInt(dInput.value, 10) || 30;

    if (newN < 1 || newD < 1) {
      alert('N и D должны быть ≥ 1');
      return;
    }

    /* ТЗ П.5.7: Предупреждение перед применением */
    const preview = await mgr.previewCloudSettings(newN, newD);

    if (preview.warnings.length > 0) {
      const msg = 'Внимание:\n\n' + preview.warnings.join('\n') +
        '\n\nПрименить настройки?';
      if (!confirm(msg)) return;
    }

    await mgr.confirmApplyCloudSettings({
      toRemove: preview.toRemove,
      newN,
      newD
    });

    /* Обновить отображённые значения */
    nInput.value = newN;
    dInput.value = newD;
  });
  ndRow.appendChild(applyBtn);
  sec.appendChild(ndRow);

  /* ── П.8.5: Кнопка «Список 🔒/☁» ── */
  const listBtn = btn('📋 Список 🔒/☁', 'offline-modal__btn', async () => {
    const list = await mgr.getPinnedAndCloudList();
    _showPinnedCloudList(list, mgr);
  });
  sec.appendChild(listBtn);

  /* ── П.8.6: Кнопка «Удалить все 🔒/☁» ── */
  const deleteAllBtn = btn(
    '🗑 Удалить все 🔒/☁',
    'offline-modal__btn offline-modal__btn--danger',
    async () => {
      /* Двойной confirm (ТЗ П.8.6) */
      if (!confirm('Удалить ВСЕ закреплённые и облачные треки?')) return;
      if (!confirm('Вы уверены? Это действие необратимо!')) return;

      const count = await mgr.removeAllPinnedAndCloud();
      alert(`Удалено: ${count} трек(ов)`);

      /* Перерендерим модал */
      closeOfflineModal();
      showOfflineModal();
    }
  );
  sec.appendChild(deleteAllBtn);

  return sec;
}

/* ══════════════════════════════════════════════
   Подокно: список 🔒/☁ треков (П.8.5)
   ══════════════════════════════════════════════ */

function _showPinnedCloudList(list, mgr) {
  const overlay = el('div', 'offline-modal-overlay offline-modal-overlay--sub');
  const panel = el('div', 'offline-modal offline-modal--sub');

  const header = el('div', 'offline-modal__header');
  header.innerHTML = '<h3>📋 Список 🔒/☁</h3>';
  const closeBtn = btn('✕', 'offline-modal__close', () => overlay.remove());
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const body = el('div', 'offline-modal__body');

  /* Pinned */
  if (list.pinned.length > 0) {
    body.appendChild(el('h4', '', `🔒 Закреплённые (${list.pinned.length})`));
    const ul = el('ul', 'offline-modal__track-list');
    for (const t of list.pinned) {
      const li = el('li', 'offline-modal__track-item');
      li.innerHTML = `
        <span class="offline-modal__track-title">${t.artist ? t.artist + ' — ' : ''}${t.title}</span>
        <span class="offline-modal__track-meta">${t.quality || '?'} · ${fmt(t.size)}${t.needsReCache ? ' ⚠️ re-cache' : ''}</span>
      `;

      /* Кнопка удаления */
      const rmBtn = btn('✕', 'offline-modal__btn--sm offline-modal__btn--danger', async () => {
        if (!confirm(`Удалить «${t.title}» из кэша?`)) return;
        await mgr.removeCached(t.uid);
        li.remove();
      });
      li.appendChild(rmBtn);
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  /* Cloud */
  if (list.cloud.length > 0) {
    body.appendChild(el('h4', '', `☁ Облачные (${list.cloud.length})`));
    const ul = el('ul', 'offline-modal__track-list');
    for (const t of list.cloud) {
      const li = el('li', 'offline-modal__track-item');
      const expiresIn = t.cloudExpiresAt
        ? Math.max(0, Math.round((t.cloudExpiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
        : '?';
      li.innerHTML = `
        <span class="offline-modal__track-title">${t.artist ? t.artist + ' — ' : ''}${t.title}</span>
        <span class="offline-modal__track-meta">${t.quality || '?'} · ${fmt(t.size)} · 🎧${t.cloudFullListenCount} · ⏳${expiresIn}д${t.expiredPending ? ' ⚠️expired' : ''}</span>
      `;
      const rmBtn = btn('✕', 'offline-modal__btn--sm offline-modal__btn--danger', async () => {
        if (!confirm(`Удалить «${t.title}» из кэша?`)) return;
        await mgr.removeCached(t.uid);
        li.remove();
      });
      li.appendChild(rmBtn);
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  if (list.pinned.length === 0 && list.cloud.length === 0) {
    body.appendChild(el('p', 'offline-modal__empty', 'Нет закреплённых или облачных треков.'));
  }

  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

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
