const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');

export const readDeletedPlaylists = () => {
  try {
    return (JSON.parse(localStorage.getItem('sc3:playlists') || '[]') || []).filter(p => p?.id && Number(p.deletedAt || 0) > 0);
  } catch {
    return [];
  }
};

export const renderDataSettingsSection = () => {
  const del = readDeletedPlaylists();
  return `<div class="settings-content" id="set-data"><button type="button" class="set-acc-btn">КОРЗИНА ПЛЕЙЛИСТОВ</button><div class="set-acc-body">${del.length ? del.map(p => `<div class="set-row" style="gap:10px"><div class="set-info"><div class="set-title">🗑 ${esc(p.name || 'Плейлист')}</div><div class="set-sub">Удалён: ${new Date(Number(p.deletedAt || 0)).toLocaleString('ru-RU')} · треков: ${(p.order || []).length}</div></div><button class="om-btn om-btn--ghost" data-pl-restore="${esc(p.id)}">↩</button><button class="om-btn om-btn--danger" data-pl-purge="${esc(p.id)}">×</button></div>`).join('') : '<div class="fav-empty">Удалённых плейлистов нет</div>'}</div></div>`;
};

export default { readDeletedPlaylists, renderDataSettingsSection };
