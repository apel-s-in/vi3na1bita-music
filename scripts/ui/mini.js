// scripts/ui/mini.js (ESM)
// Вынос мини-режима и заголовка mini-now

export function applyMiniModeUI() {
  const lp = document.getElementById('lyricsplayerblock');
  if (!lp) return;
  const inMini = (function(){
    if (window.viewMode === 'favorites' && window.playingAlbumKey === window.SPECIAL_FAVORITES_KEY) return false;
    return window.isBrowsingOtherAlbum && window.isBrowsingOtherAlbum();
  })();
  if (inMini) lp.classList.add('mini-mode'); else lp.classList.remove('mini-mode');

  try {
    if (inMini) {
      if (!window.__wasMini) window.__wasMini = true;
      if (window.__savedLyricsModeForMini === null && window.lyricsViewMode !== 'hidden') window.__savedLyricsModeForMini = window.lyricsViewMode;
      if (window.lyricsViewMode !== 'hidden') { window.lyricsViewMode = 'hidden'; window.applyLyricsViewMode && window.applyLyricsViewMode(); }
      if (window.__savedAnimationForMini === null && window.animationEnabled === true) window.__savedAnimationForMini = true;
      if (window.animationEnabled === true) window.applyAnimationState && window.applyAnimationState(false);
    } else {
      if (window.__wasMini) window.__wasMini = false;
      if (window.__savedLyricsModeForMini !== null) { window.lyricsViewMode = window.__savedLyricsModeForMini; window.__savedLyricsModeForMini = null; window.applyLyricsViewMode && window.applyLyricsViewMode(); }
      if (window.__savedAnimationForMini !== null) { window.applyAnimationState && window.applyAnimationState(!!window.__savedAnimationForMini); window.__savedAnimationForMini = null; }
    }
  } catch {}
  updateMiniNowHeader();
  window.updateNextUpLabel && window.updateNextUpLabel();
}

export function updateMiniNowHeader() {
  const box = document.getElementById('mini-now');
  if (!box) return;

  const pc = window.playerCore;
  const idx = pc && typeof pc.getIndex === 'function' ? pc.getIndex() : -1;
  const tr = pc && typeof pc.getCurrentTrack === 'function' ? pc.getCurrentTrack() : null;

  const show = window.isBrowsingOtherAlbum && window.isBrowsingOtherAlbum() && pc && idx >= 0 && !!tr;
  if (!show) { box.style.display = 'none'; return; }

  box.style.display = 'flex';
  const numEl = document.getElementById('mini-now-num');
  const titleEl = document.getElementById('mini-now-title');
  if (numEl) numEl.textContent = `${String(idx + 1).padStart(2, '0')}.`;
  if (titleEl) titleEl.textContent = (tr && tr.title) ? tr.title : '—';

  const liked = window.isLikedInPlayback && window.isLikedInPlayback(typeof window.playingTrack === 'number' ? window.playingTrack : idx);
  const starEl = document.getElementById('mini-now-star');
  if (starEl) {
    starEl.src = liked ? 'img/star.png' : 'img/star2.png';
    starEl.title = liked ? 'Убрать из понравившихся' : 'Добавить в понравившиеся';
  }
}

export async function openPlayingAlbumFromMini(e) {
  if (e && e.target && e.target.id === 'mini-now-star') return;
  if (window.playingAlbumKey === window.SPECIAL_FAVORITES_KEY) {
    window.openFavoritesView && window.openFavoritesView();
    const cur = window.favoritesRefsModel?.[window.playingTrack];
    if (cur) setTimeout(() => document.getElementById(`fav_${cur.__a}_${cur.__t}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    return;
  }
  if (!window.playingAlbumKey || window.currentAlbumKey === window.playingAlbumKey) return;

  window.currentTrack = (typeof window.playingTrack === 'number' && window.playingTrack >= 0) ? window.playingTrack : -1;

  const sel = document.getElementById('album-select');
  if (sel) sel.value = window.playingAlbumKey;
  await window.loadAlbumByKey(window.playingAlbumKey);

  setTimeout(() => {
    const row = document.getElementById(`trk${window.playingTrack}`);
    const lp = document.getElementById('lyricsplayerblock');
    if (row && lp) {
      if (row.nextSibling) row.parentNode.insertBefore(lp, row.nextSibling);
      else row.parentNode.appendChild(lp);
    }
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 200);
}

export function toggleLikePlayingFromMini() {
  window.toggleLikePlaying && window.toggleLikePlaying();
  updateMiniNowHeader();
  window.updateNextUpLabel && window.updateNextUpLabel();
}

window.UIMini = { applyMiniModeUI, updateMiniNowHeader, openPlayingAlbumFromMini, toggleLikePlayingFromMini };
//Прямой проброс, т.к. остальной код обращается к window.* именам:
window.applyMiniModeUI = window.applyMiniModeUI || applyMiniModeUI;
window.updateMiniNowHeader = window.updateMiniNowHeader || updateMiniNowHeader;
window.openPlayingAlbumFromMini = window.openPlayingAlbumFromMini || openPlayingAlbumFromMini;
window.toggleLikePlayingFromMini = window.toggleLikePlayingFromMini || toggleLikePlayingFromMini;

