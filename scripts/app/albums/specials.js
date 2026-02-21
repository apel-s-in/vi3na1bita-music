import { loadAndRenderNewsInline } from '../../ui/news-inline.js';
import { injectOfflineIndicators } from '../../ui/offline-indicators.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';
const FAV_COVER = 'img/Fav_logo.png';
const esc = (s) => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');

export async function loadFavoritesAlbum(ctx) {
  ctx.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');
  document.getElementById('cover-wrap').style.display = 'none';
  const container = document.getElementById('track-list');
  if (!container) return;

  const rebuild = () => {
    const pc = window.playerCore;
    if (!pc) return;
    
    // Единый источник истины (в строгом соответствии с ТЗ)
    const st = pc.getFavoritesState();
    const items = [
      ...(st.active || []).map(i => ({ ...i, active: true })),
      ...(st.inactive || []).map(i => ({ ...i, active: false }))
    ];

    const playerBlock = document.getElementById('lyricsplayerblock');
    const hasPlayer = playerBlock && container.contains(playerBlock);
    
    if (!items.length) {
      container.innerHTML = `<div class="fav-empty"><h3>Избранные треки</h3><p>Отметьте треки звёздочкой ⭐</p></div>`;
      if (hasPlayer) container.appendChild(playerBlock);
      return;
    }

    container.innerHTML = items.map((it, i) => {
      const t = window.TrackRegistry?.getTrackByUid(it.uid) || { title: 'Загрузка...', sourceAlbum: it.sourceAlbum };
      const aTitle = window.TrackRegistry?.getAlbumTitle(t.sourceAlbum) 
                     || window.albumsIndex?.find(a => a.key === t.sourceAlbum)?.title 
                     || 'Альбом';
      const id = `fav_${it.sourceAlbum}_${it.uid}`;
      
      return `
        <div class="track ${it.active ? '' : 'inactive'}" id="${esc(id)}" data-index="${i}" data-album="${esc(t.sourceAlbum)}" data-uid="${esc(it.uid)}">
          <div class="tnum">${String(i + 1).padStart(2, '0')}.</div>
          <div class="track-title" title="${esc(t.title)} - ${esc(aTitle)}">
            <span class="fav-track-name">${esc(t.title)}</span>
            <span class="fav-album-name"> — ${esc(aTitle)}</span>
          </div>
          <img src="${it.active ? 'img/star.png' : 'img/star2.png'}" class="like-star" alt="звезда" data-album="${esc(t.sourceAlbum)}" data-uid="${esc(it.uid)}">
        </div>`;
    }).join('');
    
    if (hasPlayer) {
      const currentTrack = window.playerCore?.getCurrentTrackUid?.();
      const row = container.querySelector(`.track[data-uid="${CSS.escape(currentTrack || '')}"]`) || container.lastElementChild;
      if (row) row.after(playerBlock);
      else container.appendChild(playerBlock);
    }
    
    injectOfflineIndicators(container);
};

  if (!ctx._favBound) {
    ctx._favBound = true;
    
    container.addEventListener('click', e => {
       if (ctx.getCurrentAlbum() !== FAV) return; // Защита от срабатывания логики Избранного в других альбомах
       
       const row = e.target.closest('.track');
       if (!row) return;
       
       const uid = row.dataset.uid, aKey = row.dataset.album;
       const isStar = e.target.classList.contains('like-star');
       const pc = window.playerCore;
       const isActive = pc.getFavoritesState().active.some(x => x.uid === uid);

       if (isStar) {
          e.preventDefault(); e.stopPropagation();
          // Снятие звезды или быстрое восстановление
          if (isActive) pc.toggleFavorite(uid, { source: 'favorites', albumKey: aKey });
          else pc.restoreInactive(uid);
          return;
       }

       if (isActive) {
          // Playback: формируем чистый плейлист только из active (согласно ТЗ)
          ctx.setPlayingAlbum(FAV);
          const tracks = pc.getFavoritesState().active.map(i => {
             const t = window.TrackRegistry?.getTrackByUid(i.uid) || {};
             return { ...t, uid: i.uid, album: 'Избранное', cover: FAV_COVER, sourceAlbum: i.sourceAlbum };
          });
          
          const idx = tracks.findIndex(t => t.uid === uid);
          if (idx >= 0) {
             pc.setPlaylist(tracks, idx, { artist: 'Витрина Разбита', album: 'Избранное', cover: FAV_COVER }, { preservePosition: false });
             pc.play(idx);
             ctx.highlightCurrentTrack(-1, { uid, albumKey: aKey });
             window.PlayerUI?.ensurePlayerBlock?.(idx, { userInitiated: true });
             window.PlayerUI?.updateAvailableTracksForPlayback?.();
          }
       } else {
          // Клик по неактивной (серой) строке — показать модалку возврата/удаления
          const t = window.TrackRegistry?.getTrackByUid(uid);
          pc.showInactiveFavoriteModal({ 
              uid, 
              title: t?.title || 'Трек', 
              onDeleted: () => { rebuild(); window.PlayerUI?.updateAvailableTracksForPlayback?.(); }
          });
       }
    });

    window.playerCore?.onFavoritesChanged(() => {
       if (ctx.getCurrentAlbum() === FAV) {
         rebuild();
         // Обновить originalPlaylist чтобы applyFavoritesOnlyFilter работал с актуальными данными
         const pc = window.playerCore;
         if (pc && ctx.getPlayingAlbum?.() === FAV) {
           const activeTracks = pc.getFavoritesState().active.map(i => {
             const t = window.TrackRegistry?.getTrackByUid(i.uid) || {};
             return { ...t, uid: i.uid, album: 'Избранное', cover: FAV_COVER, sourceAlbum: i.sourceAlbum };
           });
           if (activeTracks.length) {
             pc.originalPlaylist = activeTracks;
           }
         }
         window.PlayerUI?.updateAvailableTracksForPlayback?.();
       }
    });
  }
  
  rebuild();
}

export async function loadShowcaseAlbum(ctx) {
  ctx.renderAlbumTitle('Витрина Разбита', 'showcase');
  document.getElementById('cover-wrap').style.display = 'none';
  if (window.ShowcaseManager) await window.ShowcaseManager.renderTab();
}

export async function loadNewsAlbum(ctx) {
  ctx.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
  if (window.GalleryManager?.loadGallery) await window.GalleryManager.loadGallery(NEWS);
  document.getElementById('cover-wrap').style.display = '';
  const container = document.getElementById('track-list');
  if (container) await loadAndRenderNewsInline(container);
}
