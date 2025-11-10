// scripts/app/navigation.js (ESM)
// Горячие клавиши и DeepLink. Экспорт в window.*

(function(){
  function showHotkeysModal(){ document.getElementById('hotkeys-modal')?.classList.add('active'); }
  function closeHotkeysModal(){ document.getElementById('hotkeys-modal')?.classList.remove('active'); }

  function parseDeepLink(){
    try {
      const params = new URLSearchParams(location.search);
      const view = params.get('view');
      if (view === 'favorites') { window.openFavoritesView && window.openFavoritesView(); return; }
      const albumParam = params.get('album');
      if (albumParam && typeof window.albumByKey === 'function' ? window.albumByKey(albumParam) : true) {
        const sel = document.getElementById('album-select');
        if (sel && albumParam && sel.value !== albumParam) {
          sel.value = albumParam;
          window.loadAlbumByKey && window.loadAlbumByKey(albumParam);
          return;
        }
      }
      const t = params.get('track');
      if (t && window.config){
        const idx=parseInt(t,10);
        if (!isNaN(idx) && idx>=0 && idx<window.config.tracks.length){
          window.showTrack && window.showTrack(idx,true);
          const timeParam = parseInt(params.get('time')||'0', 10);
          if (!isNaN(timeParam) && timeParam > 0) {
            setTimeout(()=> {
              try { window.playerCore && window.playerCore.seek && window.playerCore.seek(timeParam); } catch {}
            }, 600);
          }
          setTimeout(()=>document.getElementById(`trk${idx}`)?.scrollIntoView({behavior:'smooth',block:'center'}), 300);
        }
      }
    } catch {}
  }

  function keyHandler(e){
    const tgt = e.target;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;

    const hasModal = document.querySelector('.modal-bg.active');
    if (e.key === 'Escape' && hasModal){
      e.preventDefault();
      document.querySelectorAll('.modal-bg.active').forEach(m=>m.classList.remove('active'));
      return;
    }
    if (hasModal) return;

    switch(e.key.toUpperCase()){
      case ' ': case 'K': e.preventDefault(); window.togglePlayPause && window.togglePlayPause(); break;
      case 'X': e.preventDefault(); window.stopPlayback && window.stopPlayback(); break;
      case 'N': e.preventDefault(); window.nextTrack && window.nextTrack(); break;
      case 'P': e.preventDefault(); window.previousTrack && window.previousTrack(); break;
      case 'J': e.preventDefault(); { const pc = window.playerCore; if (pc && pc.seek) pc.seek(Math.max(0, (pc.getSeek?.() || 0) - 10)); } break;
      case 'L': e.preventDefault(); { const pc = window.playerCore; if (pc && pc.seek) { const dur = pc.getDuration?.() || 0; pc.seek(Math.min(dur, (pc.getSeek?.() || 0) + 10)); } } break;
      case '+': case '=': {
        e.preventDefault();
        const vs = document.getElementById('volume-slider'); if (vs){ vs.value=Math.min(100, parseInt(vs.value||'100') + 10); vs.dispatchEvent(new Event('input')); }
      } break;
      case '-': {
        e.preventDefault();
        const vs = document.getElementById('volume-slider'); if (vs){ vs.value=Math.max(0, parseInt(vs.value||'100') - 10); vs.dispatchEvent(new Event('input')); }
      } break;
      case 'M': case '0': e.preventDefault(); window.toggleMute && window.toggleMute(); break;
      case 'R': e.preventDefault(); window.toggleRepeat && window.toggleRepeat(); break;
      case 'U': e.preventDefault(); window.toggleShuffle && window.toggleShuffle(); break;
      case 'F': e.preventDefault(); window.toggleFavoritesOnly && window.toggleFavoritesOnly(); break;
      case 'T': e.preventDefault(); window.toggleSleepMenu && window.toggleSleepMenu(); break;
      case 'A': e.preventDefault(); window.toggleAnimation && window.toggleAnimation(); break;
      case 'B': e.preventDefault(); window.toggleBit && window.toggleBit(); break;
      case 'Y': e.preventDefault(); if (window.currentTrack>=0) window.toggleLyricsView && window.toggleLyricsView(); break;
      case 'W': e.preventDefault(); document.getElementById('track-list')?.scrollIntoView({behavior:'smooth'}); break;
      case 'D':
        e.preventDefault();
        if (typeof window.isBrowsingSameAsPlaying === 'function' && window.isBrowsingSameAsPlaying()) {
          if (window.playingTrack >= 0) window.toggleLike && window.toggleLike(window.playingTrack);
        } else {
          window.toggleLikePlaying && window.toggleLikePlaying();
        }
        break;
      case '?': e.preventDefault(); showHotkeysModal(); break;
      default:
        if (e.key>='1' && e.key<='9' && !e.shiftKey && !e.ctrlKey && !e.altKey){
          const i = parseInt(e.key) - 1;
          if (window.config && i < window.config.tracks.length){ e.preventDefault(); window.showTrack && window.showTrack(i,true); }
        }
    }
  }

  window.showHotkeysModal = showHotkeysModal;
  window.closeHotkeysModal = closeHotkeysModal;
  window.parseDeepLink = parseDeepLink;

  window.addEventListener('keydown', keyHandler);
})();
