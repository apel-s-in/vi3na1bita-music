const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');
export const renderProfileRecs = ({ container: c, all }) => {
  const rE = c?.querySelector('#prof-recs-list'); if (!rE) return;
  const pd = new Set((all || []).filter(s => s.globalFullListenCount > 0).map(s => s.uid));
  const recs = (window.TrackRegistry?.getAllUids?.()||[]).filter(u => !pd.has(u)).sort(()=>Math.random()-.5).slice(0,4);
  rE.innerHTML = recs.length ? recs.map(u => `<div class="profile-list-item"><div class="log-info"><div class="log-title">${esc(window.TrackRegistry?.getTrackByUid(u)?.title)}</div><div class="log-desc">${esc(window.TrackRegistry?.getTrackByUid(u)?.album)}</div></div><button class="rec-play-btn" data-playuid="${u}">▶</button></div>`).join('') : '<div class="fav-empty">Вы прослушали абсолютно всё! 🏆</div>';
};
