import { describeEventForUi, getEventDomain } from '../../analytics/event-contract.js';

export const esc = value => window.Utils?.escapeHtml?.(String(value || '')) || String(value || '');
export const LOG_FILTERS = Object.freeze([
  ['listening', '🎵 Музыка'],
  ['favorites', '⭐ Избранное'],
  ['playlists', '📋 Плейлисты'],
  ['achievement', '🏆 Достижения'],
  ['feature', '🛠 Функции'],
  ['profile', '👤 Профиль'],
  ['auth', '🔐 Вход'],
  ['cloud', '☁️ Облако']
]);
export const eventDomain = event => event?.domain || getEventDomain(event?.type);
export const formatEventDate = event => event?.timestamp ? new Date(event.timestamp).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
export const eventDayKey = event => event?.timestamp ? new Date(event.timestamp).toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : 'Без даты';

const incompatibleGenericLabel = event => {
  const label = String(event?.deviceLabel || '').trim();
  const os = String(event?.deviceOs || '').toLowerCase();
  if (!label) return false;
  if (/iphone|ipad/i.test(label) && /windows|linux|macos/i.test(os)) return true;
  if (/android/i.test(label) && /windows|linux|macos|iphone|ipad/i.test(os)) return true;
  if (/desktop|компьютер/i.test(label) && /iphone|ipad|android/i.test(os)) return true;
  return false;
};

export const eventTrackTitle = event => {
  const track = event?.uid ? window.TrackRegistry?.getTrackByUid?.(event.uid) : null;
  const album = track?.sourceAlbum ? window.TrackRegistry?.getAlbumTitle?.(track.sourceAlbum) : '';
  return [track?.title || event?.uid || '', album].filter(Boolean).join(' · ');
};

export const eventDeviceLabel = event => {
  const label = incompatibleGenericLabel(event) ? '' : String(event?.deviceLabel || '').trim();
  return [label, event?.deviceOs || event?.deviceClass || event?.platform, event?.deviceBrowser, event?.devicePwa ? 'PWA' : ''].filter(Boolean).join(' · ');
};

export const renderLogControls = ({ selected, sort = 'newest', query = '', count = 0 } = {}) => `
  <section class="activity-controls">
    <div class="activity-controls__top">
      <b>Фильтры</b>
      <span>${Number(count || 0)} событий</span>
      <select data-log-sort aria-label="Сортировка">
        <option value="newest" ${sort === 'newest' ? 'selected' : ''}>Сначала новые</option>
        <option value="oldest" ${sort === 'oldest' ? 'selected' : ''}>Сначала старые</option>
      </select>
    </div>
    <div class="activity-filter-row">
      ${LOG_FILTERS.map(([key, title]) => `<label class="activity-filter"><input type="checkbox" data-log-domain="${key}" ${selected?.has(key) ? 'checked' : ''}><span>${esc(title)}</span></label>`).join('')}
    </div>
    <input class="activity-search" type="search" data-log-search value="${esc(query)}" placeholder="Поиск по истории">
  </section>`;

export const renderEventRow = event => {
  const view = describeEventForUi(event);
  const description = [eventTrackTitle(event), view.desc, eventDeviceLabel(event)].filter(Boolean).join(' · ');
  return `<article class="profile-list-item profile-log-row" data-event-domain="${esc(eventDomain(event))}" data-event-type="${esc(event?.type || '')}"><div class="profile-log-date">${esc(formatEventDate(event))}</div><div class="profile-log-info"><div class="log-title">${esc(view.icon)} ${esc(view.title)}</div><div class="log-desc">${esc(description)}</div></div></article>`;
};

export default { LOG_FILTERS, eventDomain, formatEventDate, eventDayKey, eventTrackTitle, eventDeviceLabel, renderLogControls, renderEventRow };
