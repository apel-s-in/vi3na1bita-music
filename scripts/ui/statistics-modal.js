/**
 * statistics-modal.js — Модальное окно статистики офлайн-кэша.
 *
 * ТЗ: П.9
 */

import { getOfflineManager } from '../offline/offline-manager.js';

let _modal = null;

export async function openStatisticsModal() {
  if (_modal) { closeStatisticsModal(); return; }

  const mgr = getOfflineManager();

  let stats;
  try {
    stats = await mgr.getGlobalStatistics();
  } catch (e) {
    console.error('[StatsModal] Failed to get statistics:', e);
    alert('Не удалось загрузить статистику.');
    return;
  }

  /* ── Overlay ── */
  const overlay = document.createElement('div');
  overlay.className = 'statistics-modal-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeStatisticsModal();
  });

  /* ── Modal ── */
  const modal = document.createElement('div');
  modal.className = 'statistics-modal';

  const st = stats.storage;
  const c = stats.counts;
  const l = stats.listens;
  const q = stats.queue;
  const s = stats.settings;

  const usedMB = ((st.used || 0) / (1024 * 1024)).toFixed(1);
  const quotaMB = ((st.quota || 0) / (1024 * 1024)).toFixed(0);

  modal.innerHTML = `
    <div class="statistics-modal__header">
      <h2>📊 Статистика офлайн-кэша</h2>
      <button class="statistics-modal__close" title="Закрыть">&times;</button>
    </div>
    <div class="statistics-modal__body">

      <section>
        <h3>💾 Хранилище</h3>
        <p>Использовано: <strong>${usedMB} МБ</strong> из ${quotaMB} МБ</p>
      </section>

      <section>
        <h3>📦 Кэшированные треки</h3>
        <table>
          <tr><td>🔒 Закреплённые</td><td><strong>${c.pinned}</strong></td></tr>
          <tr><td>☁ Облачные</td><td><strong>${c.cloud}</strong></td></tr>
          <tr><td>🎵 Динамические</td><td><strong>${c.dynamic}</strong></td></tr>
          <tr><td>Всего</td><td><strong>${c.total}</strong></td></tr>
          <tr><td>⚠️ Нужен re-cache</td><td><strong>${c.needsReCache}</strong></td></tr>
          <tr><td>⏰ ☁ истекает скоро</td><td><strong>${c.cloudExpiringSoon}</strong></td></tr>
        </table>
      </section>

      <section>
        <h3>🎧 Прослушивания</h3>
        <table>
          <tr><td>Всего прослушиваний</td><td><strong>${l.total}</strong></td></tr>
          <tr><td>Среднее на трек</td><td><strong>${l.average}</strong></td></tr>
        </table>
      </section>

      <section>
        <h3>📥 Очередь загрузок</h3>
        <table>
          <tr><td>В очереди</td><td><strong>${q.queued}</strong></td></tr>
          <tr><td>Активных</td><td><strong>${q.active}</strong></td></tr>
          <tr><td>Пауза</td><td><strong>${q.paused ? 'Да' : 'Нет'}</strong></td></tr>
        </table>
      </section>

      <section>
        <h3>⚙️ Настройки</h3>
        <table>
          <tr><td>Режим</td><td><strong>${s.mode}</strong></td></tr>
          <tr><td>Качество</td><td><strong>${s.quality === 'hi' ? 'Hi' : 'Lo'}</strong></td></tr>
          <tr><td>Порог ☁ (N)</td><td><strong>${s.cloudN}</strong></td></tr>
          <tr><td>TTL ☁ (D дней)</td><td><strong>${s.cloudD}</strong></td></tr>
          <tr><td>Пресет</td><td><strong>${s.preset?.label || s.preset?.name || '?'}</strong></td></tr>
        </table>
      </section>

      <section>
        <h3>📋 Все кэшированные треки</h3>
        <div class="statistics-modal__track-list" id="stats-track-list"></div>
      </section>

    </div>
  `;

  modal.querySelector('.statistics-modal__close').addEventListener('click', closeStatisticsModal);

  /* ── Список треков ── */
  const trackListEl = modal.querySelector('#stats-track-list');
  if (stats.items && stats.items.length > 0) {
    const table = document.createElement('table');
    table.className = 'stats-track-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Тип</th>
          <th>UID</th>
          <th>Качество</th>
          <th>Прослуш.</th>
          <th>Размер</th>
          <th>Статус</th>
        </tr>
      </thead>
    `;
    const tbody = document.createElement('tbody');
    for (const item of stats.items) {
      const icon = item.type === 'pinned' ? '🔒' : item.type === 'cloud' ? '☁' : '🎵';
      const sizeMB = item.size ? (item.size / (1024 * 1024)).toFixed(2) : '—';
      const status = item.needsReCache ? '⚠️ re-cache' : '✅';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${icon}</td>
        <td title="${item.uid}">${(item.uid || '').substring(0, 20)}…</td>
        <td>${item.quality || '?'}</td>
        <td>${item.cloudFullListenCount || 0}</td>
        <td>${sizeMB} МБ</td>
        <td>${status}</td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    trackListEl.appendChild(table);
  } else {
    trackListEl.innerHTML = '<p class="empty">Нет кэшированных треков.</p>';
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  _modal = overlay;

  document.addEventListener('keydown', _escHandler);
}

export function closeStatisticsModal() {
  if (_modal) {
    _modal.remove();
    _modal = null;
  }
  document.removeEventListener('keydown', _escHandler);
}

function _escHandler(e) {
  if (e.key === 'Escape') closeStatisticsModal();
}

export default { openStatisticsModal, closeStatisticsModal };

