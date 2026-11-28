import { AUDIO_SOURCE_ORDER, AUDIO_SOURCE_LABELS, getAudioSourcePolicy, getAudioSourceOrder, setAudioSourcePolicy } from '../../core/audio-source-policy.js';
import { markDeviceSettingsDirty } from '../../analytics/sync-dirty-events.js';

export const renderAudioSourcesSettingsSection = () => `<button type="button" class="set-acc-btn">ИСТОЧНИКИ АУДИО</button><div class="set-acc-body"><div id="audio-source-settings"></div></div>`;
export const bindAudioSourcesSettingsSection = root => {
  const host = root?.querySelector('#audio-source-settings');
  if (!host) return;
  let policy;
  const render = () => {
    policy = getAudioSourcePolicy();
    const manual = policy.mode === 'manual';
    const order = manual ? policy.order : [...AUDIO_SOURCE_ORDER];
    host.innerHTML = `<fieldset class="audio-source-modes"><legend>Режим выбора</legend><label><input type="radio" name="audio-source-mode" value="auto" ${manual ? '' : 'checked'}> Автоматический</label><label><input type="radio" name="audio-source-mode" value="manual" ${manual ? 'checked' : ''}> Ручной</label></fieldset><p class="set-sub">${manual ? 'Отметьте нужные источники. Верхний используется первым, следующий — при отказе. Отключённые источники аудио не используются.' : 'Все источники включены. При отказе автоматически пробуем следующий: Архив → CDN → GitHub → Cloud.ru → Яндекс.'}</p><ol class="audio-source-list" aria-label="Приоритет источников аудио">${order.map((id, index) => {
      const enabled = !manual || policy.enabled.includes(id);
      const activeRank = order.slice(0, index + 1).filter(key => !manual || policy.enabled.includes(key)).length;
      return `<li class="audio-source-row ${enabled ? '' : 'is-disabled'}" data-provider="${id}"><span class="audio-source-rank" aria-hidden="true">${enabled ? activeRank : '—'}</span><label><input type="checkbox" data-source="${id}" ${enabled ? 'checked' : ''} ${manual ? '' : 'disabled'}><span>${AUDIO_SOURCE_LABELS[id]}</span></label><button type="button" class="dl-arr" data-source-move="${id}" data-dir="-1" aria-label="Поднять ${AUDIO_SOURCE_LABELS[id]}" ${!manual || index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="dl-arr" data-source-move="${id}" data-dir="1" aria-label="Опустить ${AUDIO_SOURCE_LABELS[id]}" ${!manual || index === order.length - 1 ? 'disabled' : ''}>↓</button></li>`;
    }).join('')}</ol><p class="set-sub audio-source-summary" role="status" aria-live="polite">Порядок: ${getAudioSourceOrder().map(id => AUDIO_SOURCE_LABELS[id]).join(' → ') || 'нет включённых источников'}</p><label class="audio-source-cache"><input type="checkbox" id="audio-source-bypass" ${policy.bypassCache ? 'checked' : ''}><span>Проверять без локального кеша</span></label><p class="set-sub">Обычно сначала используется сохранённый трек с устройства. Для проверки только выбранных сетевых источников включите эту галочку. Кеш не удаляется; без сети он также не используется, пока галочка включена.</p><p class="set-sub">Настройки сохраняются на этом устройстве и действуют со следующей загрузки трека: для воспроизведения, скачивания и офлайн-загрузок. Уже начатые загрузки не прерываются. Обложки, тексты и служебные JSON загружаются отдельно. CDN — внешний резервный сервис, доступность не гарантируется.</p>`;
  };
  const save = (next, focus) => {
    try {
      setAudioSourcePolicy(next);
      markDeviceSettingsDirty();
      render();
      if (focus) host.querySelector(focus)?.focus();
    } catch (error) {
      render();
      window.NotificationSystem?.show?.(error.message === 'audio_source_required' ? 'Оставьте включённым хотя бы один источник.' : 'Не удалось сохранить настройки источников.', 'warning');
    }
  };
  host.onchange = event => {
    const target = event.target;
    policy = getAudioSourcePolicy();
    if (target.name === 'audio-source-mode') save({ ...policy, mode: target.value }, `[value="${target.value}"]`);
    else if (target.dataset.source) {
      const id = target.dataset.source;
      save({ ...policy, enabled: target.checked ? [...policy.enabled, id] : policy.enabled.filter(key => key !== id) }, `[data-source="${id}"]`);
    } else if (target.id === 'audio-source-bypass') save({ ...policy, bypassCache: target.checked }, '#audio-source-bypass');
  };
  host.onclick = event => {
    const button = event.target.closest('[data-source-move]');
    if (!button || button.disabled) return;
    policy = getAudioSourcePolicy();
    if (policy.mode !== 'manual') return;
    const order = [...policy.order], index = order.indexOf(button.dataset.sourceMove), next = index + Number(button.dataset.dir);
    if (index < 0 || next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];
    save({ ...policy, order }, `[data-source-move="${button.dataset.sourceMove}"][data-dir="${button.dataset.dir}"]`);
  };
  // Refresh on accordion opening, including settings restored from a device backup.
  host.parentElement.previousElementSibling?.addEventListener('click', render);
  render();
};
