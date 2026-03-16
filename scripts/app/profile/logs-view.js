const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');
export const renderProfileLogs = async ({ container: c, metaDB: db }) => {
  const lg = c?.querySelector('#prof-logs-list'); if (!lg) return;
  try {
    const l = [...(db ? await db.getEvents('events_hot').catch(()=>[]) : []), ...(db ? await db.getEvents('events_warm').catch(()=>[]) : [])].sort((a,b)=>b.timestamp-a.timestamp).slice(0,20);
    const tM = { 'LISTEN_COMPLETE': '🎵 Прослушано', 'LISTEN_SKIP': '⏭️ Пропущено', 'ACHIEVEMENT_UNLOCK': '🏆 Достижение', 'FEATURE_USED': '🛠️ Использовано' };
    lg.innerHTML = l.length ? l.map(x => `<div class="profile-list-item"><div class="log-time">${String(new Date(x.timestamp).getHours()).padStart(2,'0')}:${String(new Date(x.timestamp).getMinutes()).padStart(2,'0')}</div><div class="log-info"><div class="log-title">${tM[x.type]||x.type}</div><div class="log-desc">${esc(x.type==='ACHIEVEMENT_UNLOCK'?`Ачивка: ${x.data?.id||''}`:(window.TrackRegistry?.getTrackByUid?.(x.uid)?.title||x.uid||''))}</div></div></div>`).join('') : '<div class="fav-empty">Журнал событий пуст</div>';
  } catch { lg.innerHTML = '<div class="fav-empty">Ошибка загрузки</div>'; }
};
