import { loadAndRenderNewsInline } from '../../ui/news-inline.js';
import { injectOfflineIndicators } from '../../ui/offline-indicators.js';
import { renderFavoriteStar } from '../../ui/icon-utils.js';
import { loadProfileView } from '../profile/view.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';
const FAV_COVER = 'img/Fav_logo.png';
const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');

export async function loadFavoritesAlbum(ctx) {
  ctx.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');
  document.getElementById('cover-wrap').style.display = 'none';
  const c = document.getElementById('track-list');
  if (!c) return;

  const rb = () => {
    const pc = window.playerCore; if (!pc) return;
    const { active = [], inactive = [] } = pc.getFavoritesState() || {};
    const it = [...active.map(i => ({...i, act: 1})), ...inactive.map(i => ({...i, act: 0}))];
    const pb = document.getElementById('lyricsplayerblock'), hp = pb && c.contains(pb);

    if (!it.length) {
      c.innerHTML = `<div class="fav-empty"><h3>Избранные треки</h3><p>Отметьте треки звёздочкой ⭐</p></div>`;
      if (hp) c.appendChild(pb);
      return;
    }

    c.innerHTML = it.map((x, i) => {
      const t = window.TrackRegistry?.getTrackByUid(x.uid) || { title: 'Загрузка...', sourceAlbum: x.sourceAlbum };
      const aT = window.TrackRegistry?.getAlbumTitle(t.sourceAlbum) || window.albumsIndex?.find(a => a.key === t.sourceAlbum)?.title || 'Альбом';
      return `<div class="track ${x.act?'':'inactive'}" id="${esc(`fav_${x.sourceAlbum}_${x.uid}`)}" data-index="${i}" data-album="${esc(t.sourceAlbum)}" data-uid="${esc(x.uid)}"><div class="tnum">${String(i+1).padStart(2,'0')}.</div><div class="track-title" title="${esc(t.title)} - ${esc(aT)}"><span class="fav-track-name">${esc(t.title)}</span><span class="fav-album-name"> — ${esc(aT)}</span></div>${renderFavoriteStar(!!x.act, `data-album="${esc(t.sourceAlbum)}" data-uid="${esc(x.uid)}"` )}</div>`;
    }).join('');

    if (hp) { const r = c.querySelector(`.track[data-uid="${CSS.escape(pc.getCurrentTrackUid?.()||'')}"]`) || c.lastElementChild; r ? r.after(pb) : c.appendChild(pb); }
    injectOfflineIndicators(c);
  };

  if (!ctx._favB) {
    ctx._favB = 1;
    c.addEventListener('click', e => {
      if (ctx.getCurrentAlbum() !== FAV) return;
      const r = e.target.closest('.track'); if (!r) return;
      const u = r.dataset.uid, aK = r.dataset.album, pc = window.playerCore, isA = pc.getFavoritesState().active.some(x => x.uid === u);
      
      if (e.target.closest('.like-star')) { e.preventDefault(); e.stopPropagation(); isA ? pc.toggleFavorite(u, { source: 'favorites', albumKey: aK }) : pc.restoreInactive(u); return; }
      
      if (isA) {
        ctx.setPlayingAlbum(FAV);
        const tr = pc.getFavoritesState().active.map(i => ({ ...(window.TrackRegistry?.getTrackByUid(i.uid) || {}), uid: i.uid, album: 'Избранное', cover: FAV_COVER, sourceAlbum: i.sourceAlbum }));
        const idx = tr.findIndex(t => t.uid === u);
        if (idx >= 0) { pc.setPlaylist(tr, idx, { artist: 'Витрина Разбита', album: 'Избранное', cover: FAV_COVER }, { preservePosition: false }); pc.play(idx); ctx.highlightCurrentTrack(-1, { uid: u, albumKey: aK }); window.PlayerUI?.ensurePlayerBlock?.(idx, { userInitiated: true }); window.PlayerUI?.updateAvailableTracksForPlayback?.(); }
      } else pc.showInactiveFavoriteModal({ uid: u, title: window.TrackRegistry?.getTrackByUid(u)?.title || 'Трек', onDeleted: () => { rb(); window.PlayerUI?.updateAvailableTracksForPlayback?.(); } });
    });

    window.playerCore?.onFavoritesChanged(() => {
      if (ctx.getCurrentAlbum() === FAV) {
        rb(); const pc = window.playerCore;
        if (pc && ctx.getPlayingAlbum?.() === FAV) {
          const aT = pc.getFavoritesState().active.map(i => ({ ...(window.TrackRegistry?.getTrackByUid(i.uid) || {}), uid: i.uid, album: 'Избранное', cover: FAV_COVER, sourceAlbum: i.sourceAlbum }));
          if (aT.length) pc.originalPlaylist = aT;
        }
        window.PlayerUI?.updateAvailableTracksForPlayback?.();
      }
    });
  }
  rb();
}

export async function loadShowcaseAlbum(ctx) {
  ctx.renderAlbumTitle('Витрина Разбита', 'showcase');
  document.getElementById('cover-wrap').style.display = 'none';
  if (window.ShowcaseManager) await window.ShowcaseManager.renderTab();
}

export async function loadNewsAlbum(ctx) {
  ctx.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
  document.getElementById('cover-wrap').style.display = 'none';
  if (window.GalleryManager?.clear) window.GalleryManager.clear();

  const social = document.getElementById('social-links');
  if (social) {
    social.innerHTML = `
      <a href="https://www.youtube.com/channel/UCbjm1J0V8RkWvNj4Z8-JIhA/" target="_blank" rel="noopener noreferrer">YouTube</a>
      <a href="https://t.me/vitrina_razbita" target="_blank" rel="noopener noreferrer">Telegram</a>
      <a href="https://vk.com/apelsinov" target="_blank" rel="noopener noreferrer">VK</a>
      <a href="https://www.tiktok.com/@vi3na1bita" target="_blank" rel="noopener noreferrer">TikTok</a>
    `;
  }

  const c = document.getElementById('track-list');
  if (c) await loadAndRenderNewsInline(c);
}

export async function loadProfileAlbum(ctx) {
  return loadProfileView(ctx);
}
