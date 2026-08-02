import { describeEventForUi, getEventDomain } from '../../analytics/event-contract.js';
import { readCachedTimezonePolicy } from '../../core/timezone-policy.js';

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
const currentOwner = () => String(window.YandexAuth?.getProfile?.()?.yandexId || window.YandexAuth?.getProfile?.()?.id || '').trim();
export const journalTimezone = () => readCachedTimezonePolicy(currentOwner()).zone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const zonedDateParts = (timestamp, timezone = journalTimezone()) => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(Number(timestamp) || Date.now()));
    const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date(Number(timestamp) || Date.now()).toISOString().slice(0, 10);
  }
};
export const journalDayId = event => zonedDateParts(event?.timestamp);
export const getJournalDayWindow = (count = 30, timestamp = Date.now()) => {
  const current = zonedDateParts(timestamp);
  const anchor = Date.parse(`${current}T12:00:00Z`);
  const ids = Array.from({ length: Math.max(1, Number(count) || 30) }, (_, index) => new Date(anchor - index * 86400000).toISOString().slice(0, 10));
  return { ids, set: new Set(ids), oldest: ids[ids.length - 1], newest: ids[0], sinceAt: Date.parse(`${ids[ids.length - 1]}T00:00:00Z`) - 36 * 60 * 60 * 1000, timezone: journalTimezone() };
};
export const formatEventDate = event => {
  if (!event?.timestamp) return '—';
  try {
    return new Date(event.timestamp).toLocaleString('ru-RU', { timeZone: journalTimezone(), day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return new Date(event.timestamp).toLocaleString('ru-RU');
  }
};
export const eventDayKey = event => {
  if (!event?.timestamp) return 'Без даты';
  try {
    return new Date(event.timestamp).toLocaleDateString('ru-RU', { timeZone: journalTimezone(), weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return new Date(event.timestamp).toLocaleDateString('ru-RU');
  }
};

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
    <div class="activity-retention-note">Показаны 30 полных календарных дней по часовому поясу аккаунта. Многолетняя статистика и Backup V7 не удаляются.</div>
  </section>`;

export const renderEventRow = event => {
  const view = describeEventForUi(event);
  const description = [eventTrackTitle(event), view.desc, eventDeviceLabel(event)].filter(Boolean).join(' · ');
  return `<article class="profile-list-item profile-log-row" data-event-domain="${esc(eventDomain(event))}" data-event-type="${esc(event?.type || '')}"><div class="profile-log-date">${esc(formatEventDate(event))}</div><div class="profile-log-info"><div class="log-title">${esc(view.icon)} ${esc(view.title)}</div><div class="log-desc">${esc(description)}</div></div></article>`;
};

export default { LOG_FILTERS, eventDomain, formatEventDate, eventDayKey, eventTrackTitle, eventDeviceLabel, renderLogControls, renderEventRow };
