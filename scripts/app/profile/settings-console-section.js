import { copyCloudUsageReport, downloadCloudUsageReport, getCloudUsageSnapshot, resetCloudUsage } from '../../core/cloud-usage-meter.js';

const esc = value => window.Utils?.escapeHtml?.(String(value || '')) || String(value || '');
const bytes = value => window.Utils?.fmt?.bytes?.(Number(value || 0)) || `${Number(value || 0)} B`;
const rub = value => `${Number(value || 0).toLocaleString('ru-RU', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ₽`;

const label = row => {
  if (row.service === 'cloud_functions') return `Function · ${row.action || row.operation}`;
  if (row.service === 'object_storage') return `Object Storage · ${row.operation}`;
  return `${row.service} · ${row.action || row.operation}`;
};

const renderRows = rows => rows.length
  ? rows.map(row => `<div class="cloud-console-row"><div><b>${esc(label(row))}</b><small>${esc(row.host || '')} · Q:${Number(row.queryCount || 0)} · CAS:${Number(row.casAttempts || 0)}/${Number(row.casConflicts || 0)} · Push:${Number(row.internalWebPushCalls || 0)} · ${Math.round(Number(row.serverDurationMs || 0))}мс</small></div><span>${Number(row.calls || 0)}</span><span>${bytes(row.requestBytes)}</span><span>${bytes(row.responseBytes)}</span><span>${Number(row.errors || 0)}</span></div>`).join('')
  : '<div class="fav-empty">Наблюдаемых Yandex Cloud запросов пока нет</div>';

const renderRecent = rows => rows.length
  ? rows.slice(0, 30).map(row => {
      const time = new Date(Number(row.at || 0)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const status = row.suppressed ? 'SKIP' : row.cached ? 'CACHE' : row.status || 'ERR';
      const usage = row.serverUsage || {};
      return `<div class="cloud-console-row"><div><b>${esc(label(row))}</b><small>${esc(time)} · ${esc(row.host || '')} · Q:${Number(usage.queryCount || 0)} · CAS:${Number(usage.casAttempts || 0)}/${Number(usage.casConflicts || 0)} · Push:${Number(usage.internalWebPushCalls || 0)} · ${Math.round(Number(usage.durationMs || 0))}мс</small></div><span>1</span><span>${bytes(row.requestBytes)}</span><span>${bytes(row.responseBytes)}</span><span>${esc(status)}</span></div>`;
    }).join('')
  : '<div class="fav-empty">Операций в текущем журнале пока нет</div>';

const renderSuppressed = rows => rows.length
  ? rows.map(row => `<div class="cloud-console-row"><div><b>${esc(row.action || row.operation)}</b><small>${esc(row.suppressionReason || 'client_guard')}</small></div><span>${Number(row.calls || 0)}</span><span>—</span><span>—</span><span>OK</span></div>`).join('')
  : '<div class="fav-empty">Предотвращённых повторных запросов нет</div>';

const renderFindings = rows => rows.length
  ? rows.map(item => `<li><b>${esc(item.action || item.code)}</b> · ${esc(item.message)}</li>`).join('')
  : '<li>Признаков request storm или фоновой утечки не найдено</li>';

export const renderConsoleSettingsSection = () => `<div class="settings-content" id="set-console"><section class="cloud-console" id="cloud-usage-console"></section></div>`;

export const bindConsoleSettingsSection = root => {
  const consoleRoot = root?.querySelector('#cloud-usage-console');
  if (!consoleRoot || consoleRoot._bound) return;
  consoleRoot._bound = true;

  const render = () => {
    const snapshot = getCloudUsageSnapshot();
    const activity = window.AppActivity?.getState?.() || {};
    const from = new Date(snapshot.observedFromAt).toLocaleString('ru-RU');
    const until = new Date(snapshot.observedUntilAt).toLocaleString('ru-RU');
    consoleRoot.innerHTML = `
      <div class="cloud-console-hero">
        <div><small>Сетевой режим</small><b>${activity.quiet ? 'ТИХИЙ' : activity.playing ? 'PLAYBACK' : 'АКТИВНЫЙ'}</b></div>
        <div><small>Запросов за 24 часа</small><b>${snapshot.totals.calls}</b></div>
        <div><small>Предотвращено</small><b>${snapshot.totals.suppressedAttempts}</b></div>
        <div><small>Ошибки</small><b>${snapshot.totals.errors}</b></div>
        <div><small>Ответы из облака</small><b>${bytes(snapshot.totals.responseBytes)}</b></div>
        <div><small>Peak burst / 10 сек</small><b>${snapshot.diagnostics.peakBurst10s}</b></div>
      </div>
      <div class="cloud-console-hero">
        <div><small>YDB query</small><b>${snapshot.totals.queryCount}</b></div>
        <div><small>CAS attempts</small><b>${snapshot.totals.casAttempts}</b></div>
        <div><small>CAS conflicts</small><b>${snapshot.totals.casConflicts}</b></div>
        <div><small>Internal Web Push</small><b>${snapshot.totals.internalWebPushCalls}</b></div>
        <div><small>Server wall time</small><b>${Math.round(snapshot.totals.serverDurationMs)} мс</b></div>
        <div><small>Metadata coverage</small><b>${snapshot.diagnostics.metadataCoveragePct}%</b></div>
        <div><small>Max concurrent</small><b>${snapshot.diagnostics.maxInFlight}</b></div>
        <div><small>Обрезано событий</small><b>${snapshot.diagnostics.droppedEvents}</b></div>
      </div>
      <div class="cloud-console-cost">
        <span>Наблюдаемая максимальная стоимость этого устройства</span>
        <b>${rub(snapshot.totals.observedCostRub)}</b>
        <span>Проекция на 1000 пользователей с таким же поведением</span>
        <strong>${rub(snapshot.totals.projected1000Rub)}</strong>
      </div>
      <div class="cloud-console-note">Скользящее окно: <b>${esc(from)}</b> — <b>${esc(until)}</b>. Всё старше 24 часов удаляется автоматически. Request/response body, OAuth token, social session, идентификаторы аккаунта и UID треков не сохраняются.</div>
      ${snapshot.diagnostics.truncated ? '<div class="cloud-console-note cloud-console-note--warn">Журнал достиг лимита 5000 событий. Агрегаты отражают только сохранённую часть суток; это само по себе может быть признаком request storm.</div>' : ''}
      <details class="cloud-console-unknown" open><summary>Автоматические диагностические находки</summary><ul>${renderFindings(snapshot.diagnostics.findings)}</ul></details>
      <div class="cloud-console-head"><span>Операция</span><span>Кол.</span><span>Исх.</span><span>Вх.</span><span>Ош.</span></div>
      <div class="cloud-console-list">${renderRows(snapshot.rows)}</div>
      <div class="profile-section-title">Предотвращённые обращения</div>
      <div class="cloud-console-head"><span>Action</span><span>Кол.</span><span>Исх.</span><span>Вх.</span><span>Ст.</span></div>
      <div class="cloud-console-list">${renderSuppressed(snapshot.suppressedRows)}</div>
      <div class="profile-section-title">Последние потенциально платные операции</div>
      <div class="cloud-console-head"><span>Операция</span><span>Кол.</span><span>Исх.</span><span>Вх.</span><span>HTTP</span></div>
      <div class="cloud-console-list">${renderRecent(snapshot.recent)}</div>
      <details class="cloud-console-unknown"><summary>Что невозможно точно определить на устройстве</summary><ul>${snapshot.unknown.map(item => `<li>${esc(item)}</li>`).join('')}</ul></details>
      <div class="cloud-console-note cloud-console-note--warn">JSON-экспорт содержит безопасную хронологию, action patterns, initiator-файлы, quiet/hidden context, очереди и server metadata. Перед отправкой можно открыть файл обычным текстовым редактором.</div>
      <div class="om-actions">
        <button type="button" class="om-btn om-btn--primary" data-cloud-console-export>Скачать JSON</button>
        <button type="button" class="om-btn om-btn--outline" data-cloud-console-copy>Копировать JSON</button>
      </div>
      <button type="button" class="om-btn om-btn--danger-outline om-fullw" data-cloud-console-reset>Сбросить суточное окно</button>
    `;
  };

  consoleRoot.addEventListener('click', async event => {
    const exportButton = event.target.closest('[data-cloud-console-export]');
    const copyButton = event.target.closest('[data-cloud-console-copy]');
    const resetButton = event.target.closest('[data-cloud-console-reset]');

    if (exportButton) {
      exportButton.disabled = true;
      try {
        await downloadCloudUsageReport();
        window.NotificationSystem?.success?.('JSON-отчёт подготовлен');
      } catch (error) {
        window.NotificationSystem?.error?.(`Экспорт не выполнен: ${error?.message || 'ошибка'}`);
      } finally {
        exportButton.disabled = false;
      }
      return;
    }

    if (copyButton) {
      copyButton.disabled = true;
      try {
        await copyCloudUsageReport();
        window.NotificationSystem?.success?.('JSON скопирован в буфер');
      } catch (error) {
        window.NotificationSystem?.error?.(`Не удалось скопировать: ${error?.message || 'ошибка'}`);
      } finally {
        copyButton.disabled = false;
      }
      return;
    }

    if (resetButton) {
      resetCloudUsage();
      render();
    }
  });

  let renderTimer = 0;
  const scheduleRender = () => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      renderTimer = 0;
      if (consoleRoot.isConnected) render();
    }, 180);
  };
  const controller = new AbortController();
  const observer = new MutationObserver(() => {
    if (consoleRoot.isConnected) return;
    clearTimeout(renderTimer);
    controller.abort();
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('cloud-usage:updated', scheduleRender, { signal: controller.signal });
  window.addEventListener('app:activity-mode', scheduleRender, { signal: controller.signal });
  render();
};

export default { renderConsoleSettingsSection, bindConsoleSettingsSection };
