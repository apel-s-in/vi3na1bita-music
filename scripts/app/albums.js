// scripts/app/albums.js
const APP_CONFIG = window.APP_CONFIG;

import { registerTrack } from './track-registry.js';

const U = window.Utils;
const $ = (id) => U?.dom?.byId ? U.dom.byId(id) : document.getElementById(id);
const S = (v) => (U?.trimStr ? U.trimStr(v) : (String(v ?? '').trim() || null));
const esc = (v) => (U?.escapeHtml ? U.escapeHtml(v) : String(v ?? ''));
const isMobileUA = () => (U?.isMobile ? U.isMobile() : /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';

const STAR_ON = 'img/star.png';
const STAR_OFF = 'img/star2.png';
const LOGO = 'img/logo.png';

const emptyFavoritesHTML =
  `<div class="news-inline">` +
    `<h3>Избранные треки</h3>` +
    `<p>Отметьте треки звёздочкой ⭐</p>` +
  `</div>`;

function setStar(img, liked) {
  if (!img) return;
  try { img.src = liked ? STAR_ON : STAR_OFF; } catch {}
}

function normalizeTracks(tracks, base, albumKey) {
  const out = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i] || {};

    const fileHi = U.safeUrlJoin(base, t.audio);
    const fileLo = U.safeUrlJoin(base, t.audio_low);

    const lyrics = U.safeUrlJoin(base, t.lyrics) || U.safeUrlJoin(base, t.lrc);
    const fulltext = U.safeUrlJoin(base, t.fulltext);

    const uid = S(t.uid);

    const sizeHi = (typeof t.size === 'number') ? t.size : null;
    const sizeLo = (typeof t.size_low === 'number') ? t.size_low : {
      el.dataset.playIndex = String(index);
    }

    const liked = !!window.FavoritesManager?.isFavorite?.(albumKey, track?.uid);
    const numText = `${String(track?.num || index + 1).padStart(2, '0')}.`;

    el.innerHTML = `
      <div class="tnum">${numText}</div>
      <div class="track-title">${String(track?.title || '')}</div>
      <img src="${liked ? STAR_ON : STAR_OFF}" class="like-star" alt="звезда" data-album="${albumKey}" data-uid="${uid}">
    `;

    el.addEventListener('click', (e) => {
      if (e.target?.classList?.contains('like-star')) return;

      const albumData = this.albumsData.get(albumKey);
      if (!albumData || !window.playerCore) {
        this.highlightCurrentTrack(index);
        window.NotificationSystem?.error?.('Альбом ещё не готов к воспроизведению');
        return;
      }

      const snapshot = window.playerCore.getPlaylistSnapshot?.() || [];
      const needsNew =
        snapshot.length !== albumData.tracks.length ||
        snapshot.some((t, i) => {
          const src = albumData.tracks[i]?.file;
          return !src || t.src !== src;
        });

      const piRaw = Number.parseInt(String(el.dataset.playIndex || ''), 10);
      const playIndex = Number.isFinite(piRaw) && piRaw >= 0 ? piRaw : index;

      if (needsNew) {
        const coverUrl = this.albumCoverUrlCache.get(albumKey) || LOGO;
        const tracksForCore = albumData.tracks
          .filter((t) => t && (t.fileHi || t.file || t.fileLo))
          .map((t) => ({
            src: t.fileHi || t.file || t.fileLo,
            sources: t.sources || null,
            title: t.title,
            artist: albumData.artist || 'Витрина Разбита',
            album: albumKey,
            cover: coverUrl,
            lyrics: t.lyrics || null,
            fulltext: t.fulltext || null,
            uid: S(t.uid),
            hasLyrics: t.hasLyrics,
          }));

        if (tracksForCore.length) {
          window.playerCore.setPlaylist(tracksForCore, playIndex, {
            artist: albumData.artist || 'Витрина Разбита',
            album: albumData.title || '',
            cover: coverUrl,
          });
        }
      }

      this.highlightCurrentTrack(index);

      // iOS unlock — только внутри PlayerCore.play()
      window.playerCore.play(playIndex);

      this.setPlayingAlbum(albumKey);
      window.PlayerUI?.ensurePlayerBlock?.(index, { userInitiated: true });
    });

    const star = el.querySelector('.like-star');
    star?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const trackUid = S(star.dataset.uid);
      if (!trackUid) return void window.NotificationSystem?.warning?.('UID трека не найден в config.json');
      if (!window.FavoritesManager?.toggleLike) return void window.NotificationSystem?.error?.('FavoritesManager недоступен');

      const next = !window.FavoritesManager.isFavorite(albumKey, trackUid);
      setStar(star, next);
      star.classList.add('animating');
      setTimeout(() => star.classList.remove('animating'), 320);

      window.FavoritesManager.toggleLike(albumKey, trackUid, next, { source: 'album' });
    });

    return el;
  }

  highlightCurrentTrack(index) {
    document.querySelectorAll('.track.current').forEach((n) => n.classList.remove('current'));
    if (!Number.isFinite(index) || index < 0) return;
    document.querySelector(`.track[data-index="${index}"]`)?.classList.add('current');
  }

  updateActiveIcon(albumKey) {
    document.querySelectorAll('.album-icon').forEach((icon) => icon.classList.toggle('active', icon.dataset.album === albumKey));
  }

  clearUI() {
    const tl = $('track-list');
    if (tl) tl.innerHTML = '';
    const sl = $('social-links');
    if (sl) sl.innerHTML = '';
    window.GalleryManager?.clear?.();
  }

  getCurrentAlbum() { return this.currentAlbum; }
  getPlayingAlbum() { return this.playingAlbum; }
  setPlayingAlbum(albumKey) { this.playingAlbum = albumKey || null; }
  getAlbumData(albumKey) { return this.albumsData.get(albumKey); }
  getAlbumConfigByKey(albumKey) { return this.albumsData.get(albumKey); }
  getTrackUid(_albumKey, trackUid) { return S(trackUid); }
}

window.AlbumsManager = new AlbumsManager();
export default AlbumsManager;
