import { getCloudUsageSnapshot, resetCloudUsage } from '../../core/cloud-usage-meter.js';

const esc = value => window.Utils?.escapeHtml?.(String(value || '')) || String(value || '');
const bytes = value => window.Utils?.fmt?.bytes?.(Number(value || 0)) || `${Number(value || 0)} B`;
const rub = value => `${Number(value || 0).toLocaleString('ru-RU', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ₽`;

const label = row => {
  if (row.service === 'cloud_functions') return `Function · ${row.action || row.operation}`;
  if (row.service === 'object_storage') return `Object Storage · ${row.operation}`;
  return `${row.service} · ${row.action || row.operation}`;
};

const renderRows = rows => rows.length
  ? rows.map(row => `<div class="cloud-console-row"><div><b>${esc(label(row))}</b><small>${esc(row.host || '')}</small></div><span>${Number(row.calls || 0)}</span><span>${bytes(row.requestBytes)}</span><span>${bytes(row.responseBytes)}</span><span>${Number(row.errors || 0)}</span></div>`).join('')
  : '<div class="fav-empty">Наблюдаемых Yandex Cloud запросов пока нет</div>';

const renderRecent = rows => rows.length
  ? rows.slice(0, 30).map(row => {
      const time = new Date(Number(row.at || 0)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const status = row.cached ? 'CACHE' : row.status || 'ERR';
      return `<div class="cloud-console-row"><div><b>${esc(label(row))}</b><small>${esc(time)} · ${esc(row.host || '')}</small></div><span>1</span><span>${bytes(row.requestBytes)}</span><span>${bytes(row.responseBytes)}</span><span>${esc(status)}</span></div>`;
    }).join('')
  : '<div class="fav-empty">Операций в текущем журнале пока нет</div>';

export const renderConsoleSettingsSection = () => `<div class="settings-content" id="set-console"><section class="cloud-console" id="cloud-usage-console"></section></div>`;

export const bindConsoleSettingsSection = root => {
  const consoleRoot = root?.querySelector('#cloud-usage-console');
  if (!consoleRoot || consoleRoot._bound) return;
  consoleRoot._bound = true;

  const render = () => {
    const snapshot = getCloudUsageSnapshot();
    const activity = window.AppActivity?.getState?.() || {};
    consoleRoot.innerHTML = `
      <div class="cloud-console-hero">
        <div><small>Сетевой режим</small><b>${activity.quiet ? 'ТИХИЙ' : activity.playing ? 'PLAYBACK' : 'АКТИВНЫЙ'}</b></div>
        <div><small>Наблюдаемых запросов</small><b>${snapshot.totals.calls}</b></div>
        <div><small>Ответы из облака</small><b>${bytes(snapshot.totals.responseBytes)}</b></div>
        <div><small>Ошибки</small><b>${snapshot.totals.errors}</b></div>
      </div>
      <div class="cloud-console-cost">
        <span>Наблюдаемая максимальная стоимость этого устройства</span>
        <b>${rub(snapshot.totals.observedCostRub)}</b>
        <span>Проекция на 1000 пользователей с таким же поведением</span>
        <strong>${rub(snapshot.totals.projected1000Rub)}</strong>
      </div>
      <div class="cloud-console-note">Счётчик включает только запросы, выполненные этим экземпляром приложения. Локальный кэш, IndexedDB и Local Storage не считаются платным трафиком. Значения используют верхнюю границу предоставленных тарифов.</div>
      <div class="cloud-console-head"><span>Операция</span><span>Кол.</span><span>Исх.</span><span>Вх.</span><span>Ош.</span></div>
      <div class="cloud-console-list">${renderRows(snapshot.rows)}</div>
      <div class="profile-section-title">Последние потенциально платные операции</div>
      <div class="cloud-console-head"><span>Операция</span><span>Кол.</span><span>Исх.</span><span>Вх.</span><span>HTTP</span></div>
      <div class="cloud-console-list">${renderRecent(snapshot.recent)}</div>
      <details class="cloud-console-unknown"><summary>Что невозможно точно определить на устройстве</summary><ul>${snapshot.unknown.map(item => `<li>${esc(item)}</li>`).join('')}</ul></details>
      <div class="cloud-console-note cloud-console-note--warn">Object Storage media traffic может быть неполным: Howler Range/XHR и cross-origin compressed traffic не всегда доступны браузерному измерителю. YDB RU и тарифицированное время функций появятся только после добавления server-side usage metadata.</div>
      <button type="button" class="om-btn om-btn--outline om-fullw" data-cloud-console-reset>Сбросить локальный счётчик</button>
    `;
  };

  consoleRoot.addEventListener('click', event => {
    if (!event.target.closest('[data-cloud-console-reset]')) return;
    resetCloudUsage();
    render();
  });

  window.addEventListener('cloud-usage:updated', render);
  window.addEventListener('app:activity-mode', render);
  render();
};

export default { renderConsoleSettingsSection, bindConsoleSettingsSection };
