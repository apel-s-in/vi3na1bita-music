import { markDeviceSettingsDirty } from '../../analytics/sync-dirty-events.js';

const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');
const jp = (r, f = []) => { try { return JSON.parse(r || ''); } catch { return f; } };

export const readDeletedPlaylists = () => jp(localStorage.getItem('sc3:playlists') || '[]', []).filter(p => p?.id && Number(p.deletedAt || 0) > 0);
export const readDeletedFavorites = () => jp(localStorage.getItem('__favorites_v2__') || '[]', []).filter(x => x?.uid && Number(x.deletedAt || 0) > 0);

const renderConflictPolicy = () => {
  const v = localStorage.getItem('backup:conflict_policy:v1') || 'ask';
  return `<button type="button" class="set-acc-btn">ПОЛИТИКА КОНФЛИКТОВ</button><div class="set-acc-body"><div class="set-row"><div class="set-info"><div class="set-title">Как решать конфликт restore</div><div class="set-sub">Пока применяется для будущих restore/merge-пакетов и сохраняется как настройка устройства</div></div><select id="backup-conflict-policy" style="max-width:190px"><option value="ask" ${v==='ask'?'selected':''}>Спрашивать</option><option value="latest" ${v==='latest'?'selected':''}>Latest-write-wins</option><option value="trash" ${v==='trash'?'selected':''}>Удалённое в корзину</option></select></div></div>`;
};

const renderPlaylistTrash = () => {
  const del = readDeletedPlaylists();
  return `<button type="button" class="set-acc-btn">КОРЗИНА ПЛЕЙЛИСТОВ</button><div class="set-acc-body">${del.length ? del.map(p => `<div class="set-row" style="gap:10px"><div class="set-info"><div class="set-title">🗑 ${esc(p.name || 'Плейлист')}</div><div class="set-sub">Удалён: ${new Date(Number(p.deletedAt || 0)).toLocaleString('ru-RU')} · треков: ${(p.order || []).length}</div></div><button class="om-btn om-btn--ghost" data-pl-restore="${esc(p.id)}">↩</button><button class="om-btn om-btn--danger" data-pl-purge="${esc(p.id)}">×</button></div>`).join('') : '<div class="fav-empty">Удалённых плейлистов нет</div>'}</div>`;
};

const renderFavoritesTrash = () => {
  const del = readDeletedFavorites();
  return `<button type="button" class="set-acc-btn">КОРЗИНА ИЗБРАННОГО</button><div class="set-acc-body">${del.length ? del.map(x => { const t = window.TrackRegistry?.getTrackByUid?.(x.uid); return `<div class="set-row" style="gap:10px"><div class="set-info"><div class="set-title">⭐ ${esc(t?.title || x.uid)}</div><div class="set-sub">Удалён: ${new Date(Number(x.deletedAt || 0)).toLocaleString('ru-RU')} · ${esc(t?.album || x.sourceAlbum || x.albumKey || '')}</div></div><button class="om-btn om-btn--ghost" data-fav-restore="${esc(x.uid)}">↩</button><button class="om-btn om-btn--danger" data-fav-purge="${esc(x.uid)}">×</button></div>`; }).join('') : '<div class="fav-empty">Удалённых избранных нет</div>'}</div>`;
};

export const bindDataSettingsSection = root => {
  const sel = root?.querySelector('#backup-conflict-policy');
  if (!sel || sel._bound) return;
  sel._bound = true;
  sel.addEventListener('change', e => {
    localStorage.setItem('backup:conflict_policy:v1', e.target.value || 'ask');
    markDeviceSettingsDirty();
    window.NotificationSystem?.success?.('Политика конфликтов сохранена');
  });
};

export const renderDataSettingsSection = () => `<div class="settings-content" id="set-data">${renderConflictPolicy()}${renderPlaylistTrash()}${renderFavoritesTrash()}</div>`;

export default { readDeletedPlaylists, readDeletedFavorites, renderDataSettingsSection, bindDataSettingsSection };
