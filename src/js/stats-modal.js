/**
 * Statistics Modal (ТЗ 17)
 * Вход: зона над #logo-bottom
 * Показывает треки с globalFullListenCount >= 3 + общее время
 */

import { getTopTracks, getGlobalTotalListenSeconds } from './stats-core.js';

let _modal = null;
let _isOpen = false;

function init() {
  _ensureDOM();
  _createTrigger();
}

function _createTrigger() {
  const logo = document.getElementById('logo-bottom');
  if (!logo) return;

  let trigger = document.getElementById('stats-trigger');
  if (!trigger) {
    trigger = document.createElement('button');
    trigger.id = 'stats-trigger';
    trigger.className = 'stats-trigger-btn';
    trigger.textContent = '📊';
    trigger.title = 'Статистика';
    trigger.setAttribute('aria-label', 'Статистика');
    logo.parentNode.insertBefore(trigger, logo);
  }
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    open();
  });
}

function _ensureDOM() {
  if (_modal) return;
  _modal = document.createElement('div');
  _modal.id = 'stats-modal';
  _modal.className = 'stats-overlay';
  _modal.style.display = 'none';
  _modal.innerHTML = `
<div class="stats-content">
  <div class="stats-hdr">
    <h2>Статистика</h2>
    <button class="stats-close" data-act="close">✕</button>
  </div>
  <div class="stats-body" id="stats-body">
    <p>Загрузка…</p>
  </div>
</div>`;
  document.body.appendChild(_modal);

  _modal.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (act === 'close' || e.target === _modal) close();
  });
}

function open() {
  _ensureDOM();
  _modal.style.display = 'flex';
  _isOpen = true;
  _refresh();
}

function close() {
  if (_modal) _modal.style.display = 'none';
  _isOpen = false;
}

function _formatTime(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days} д.`);
  if (hours > 0) parts.push(`${hours} ч.`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} мин.`);
  return parts.join(' ');
}

function _formatTrackTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}ч ${rm}м`;
  }
  return `${m}м ${s}с`;
}

async function _refresh() {
  const body = document.getElementById('stats-body');
  if (!body) return;

  try {
    const tracks = await getTopTracks(3);
    const totalSec = getGlobalTotalListenSeconds();

    if (tracks.length === 0) {
      body.innerHTML = `
        <div class="stats-empty">
          <p>Пока нет треков с 3+ полными прослушиваниями.</p>
          <p>Слушайте музыку — статистика появится автоматически!</p>
        </div>
        <div class="stats-total">
          <strong>Общее время:</strong> ${_formatTime(totalSec)}
        </div>`;
      return;
    }

    // Try to get track titles from global config
    let trackTitles = {};
    try {
      if (window._allTracksForStats) {
        window._allTracksForStats.forEach(t => { trackTitles[t.uid] = t.title; });
      }
    } catch (e) {}

    let html = '<div class="stats-list">';
    tracks.forEach((s, i) => {
      const title = trackTitles[s.uid] || s.uid;
      html += `
        <div class="stats-item">
          <span class="stats-rank">${i + 1}</span>
          <div class="stats-info">
            <span class="stats-title">${title}</span>
            <span class="stats-detail">
              Прослушиваний: ${s.globalFullListenCount || 0} |
              Время: ${_formatTrackTime(s.globalListenSeconds || 0)}
            </span>
          </div>
        </div>`;
    });
    html += '</div>';

    html += `
      <div class="stats-total">
        <strong>Общее время прослушивания:</strong> ${_formatTime(totalSec)}
      </div>`;

    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = '<p>Ошибка загрузки статистики.</p>';
    console.error('[StatsModal]', e);
  }
}

export { init, open, close };
