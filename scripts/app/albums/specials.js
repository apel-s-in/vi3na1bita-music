// UID.017_(Launch source stats)_(special albums — важные источники запуска и discovery)_(future launches from favorites/news/profile/showcase должны явно различаться в analytics) // UID.053_(Rediscovery engine)_(favorites/profile special views станут consumption points для forgotten hits)_(здесь later можно подмешивать rediscovery sections без ломки legacy) // UID.063_(Profile recs tab upgrade)_(special profile album станет главным host для personalized intelligence)_(но heavy rec logic должна жить вне этого файла) // UID.068_(Public playlist analytics)_(showcase special view — social/discovery surface)_(future playlist analytics и shared flows связывать через showcase/profile layers) // UID.094_(No-paralysis rule)_(special albums должны оставаться рабочими без intel)_(любые intelligent blocks строго optional, с fallback на текущий UI)
import { loadAndRenderNewsInline } from '../../ui/news-inline.js';
import { injectOfflineIndicators } from '../../ui/offline-indicators.js';
import { renderFavoriteStar } from '../../ui/icon-utils.js';
import { loadProfileView } from '../profile/view.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__', NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__', esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');

export async function loadFavoritesAlbum(ctx) {
  ctx.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');
  const cw = document.getElementById('cover-wrap'); if (cw) cw.style.display = 'none';
  const c = document.getElementById('track-list'); if (!c) return;

  const rb = () => {
    const pc = window.playerCore; if (!pc) return;
    const { active = [], inactive = [] } = pc.getFavoritesState() || {}, it = [...active.map(i => ({...i, act: 1})), ...inactive.map(i => ({...i, act: 0}))];
    const pb = document.getElementById('lyricsplayerblock'), hp = pb && c.contains(pb);
    if (!it.length) { c.innerHTML = `<div class="fav-empty"><h3>Избранные треки</h3><p>Отметьте треки звёздочкой ⭐</p></div>`; if (hp) c.appendChild(pb); return; }
    c.innerHTML = it.map((x, i) => {
      const t = window.TrackRegistry?.getTrackByUid(x.uid) || { title: 'Загрузка...', sourceAlbum: x.sourceAlbum }, aT = window.TrackRegistry?.getAlbumTitle(t.sourceAlbum) || window.albumsIndex?.find(a => a.key === t.sourceAlbum)?.title || 'Альбом';
      let cv = window.APP_CONFIG?.ICON_ALBUMS_ORDER?.find(item => item.key === t.sourceAlbum)?.icon || 'img/logo.png';
      if (window.Utils?.isMobile?.() && /\/icon_album\/[^/]+\.png$/i.test(cv)) { const m = cv.match(/\/icon_album\/([^/]+)\.png$/i); if (m?.[1]) cv = `img/icon_album/mobile/${m[1]}@1x.jpg`; }
      return `<div class="track ${x.act?'':'inactive'}" id="${esc(`fav_${x.sourceAlbum}_${x.uid}`)}" data-index="${i}" data-album="${esc(t.sourceAlbum)}" data-uid="${esc(x.uid)}"><img src="${esc(cv)}" class="fav-track-thumb" loading="lazy"><div class="track-title fav-track-title-wrap" title="${esc(t.title)} - ${esc(aT)}"><div>${esc(t.title)}</div><div class="fav-track-meta">${esc(aT)}</div></div>${renderFavoriteStar(!!x.act, `data-album="${esc(t.sourceAlbum)}" data-uid="${esc(x.uid)}"` )}</div>`;
    }).join('');
    if (hp) { const r = c.querySelector(`.track[data-uid="${CSS.escape(pc.getCurrentTrackUid?.()||'')}"]`) || c.lastElementChild; r ? r.after(pb) : c.appendChild(pb); }
    injectOfflineIndicators(c); ctx.highlightCurrentTrack();
  };

  if (!ctx._favB) {
    ctx._favB = 1;
    c.addEventListener('click', e => {
      if (ctx.getCurrentAlbum() !== FAV || e.target.closest('.offline-ind')) return;
      const r = e.target.closest('.track'); if (!r) return;
      const u = r.dataset.uid, aK = r.dataset.album, pc = window.playerCore, isA = pc.getFavoritesState().active.some(x => x.uid === u);
      if (e.target.closest('.like-star')) return e.preventDefault(), e.stopPropagation(), isA ? pc.toggleFavorite(u, { source: 'favorites', albumKey: aK }) : pc.restoreInactive(u);
      if (isA) {
        ctx.setPlayingAlbum(FAV); const tr = window.PlaybackContextSource?.getSourcePlaylistForContext?.(FAV) || [], idx = tr.findIndex(t => t.uid === u);
        if (idx >= 0) { pc.playExactFromPlaylist(tr, u); window.FavoritesOnlyActions?.syncFavoritesOnlyPlayback?.({ player: pc, autoPlayIfNeeded: true, forceReload: false, syncUi: () => window.PlayerUI?.applyFavoritesOnlyDomFilter?.() }); ctx.highlightCurrentTrack(-1, { uid: u, albumKey: aK }); window.PlayerUI?.ensurePlayerBlock?.(idx, { userInitiated: true }); window.FavoritesOnlyActions?.syncFavoritesOnlyUiFrame?.(); }
      } else pc.showInactiveFavoriteModal({ uid: u, title: window.TrackRegistry?.getTrackByUid(u)?.title || 'Трек', onDeleted: () => { rb(); window.FavoritesOnlyActions?.syncFavoritesOnlyPlayback?.({ player: pc, autoPlayIfNeeded: true, forceReload: false, syncUi: () => window.PlayerUI?.applyFavoritesOnlyDomFilter?.() }); window.FavoritesOnlyActions?.syncFavoritesOnlyUiFrame?.(); } });
    });
    window.playerCore?.onFavoritesChanged(() => {
      if (ctx.getCurrentAlbum() === FAV) {
        rb(); const pc = window.playerCore;
        if (pc && ctx.getPlayingAlbum?.() === FAV) { const aT = window.PlaybackContextSource?.getSourcePlaylistForContext?.(FAV) || []; if (aT.length) pc.originalPlaylist = aT; }
        window.FavoritesOnlyActions?.syncFavoritesOnlyPlayback?.({ player: pc, autoPlayIfNeeded: true, forceReload: false, syncUi: () => window.PlayerUI?.applyFavoritesOnlyDomFilter?.() }); window.FavoritesOnlyActions?.syncFavoritesOnlyUiFrame?.();
      }
    });
  }
  rb();
}

export async function loadShowcaseAlbum(ctx) { ctx.renderAlbumTitle('Витрина Разбита', 'showcase'); const cw = document.getElementById('cover-wrap'); if (cw) cw.style.display = 'none'; if (window.ShowcaseManager) await window.ShowcaseManager.renderTab(); }
export async function loadNewsAlbum(ctx) { ctx.renderAlbumTitle('📰 НОВОСТИ 📰', 'news'); const cw = document.getElementById('cover-wrap'); if (cw) cw.style.display = 'none'; window.GalleryManager?.clear?.(); const social = document.getElementById('social-links'); if (social) social.innerHTML = `<a href="https://www.youtube.com/channel/UCbjm1J0V8RkWvNj4Z8-JIhA/" target="_blank" rel="noopener noreferrer">YouTube</a><a href="https://t.me/vitrina_razbita" target="_blank" rel="noopener noreferrer">Telegram</a><a href="https://vk.com/apelsinov" target="_blank" rel="noopener noreferrer">VK</a><a href="https://www.tiktok.com/@vi3na1bita" target="_blank" rel="noopener noreferrer">TikTok</a>`; const c = document.getElementById('track-list'); if (c) await loadAndRenderNewsInline(c); }
export async function loadProfileAlbum(ctx) { return loadProfileView(ctx); }
