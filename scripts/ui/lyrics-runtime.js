// scripts/ui/lyrics-runtime.js (ESM)
// Отображение и анимация текста песни (лирики).

(function(){
  let lyricsData = []; // [{ time: 123.4, line: "text" }]
  let lyricsCache = new Map();

  async function fetchAndCacheLyrics(url) {
    if (!url) {
        lyricsData = [];
        return;
    }
    if (lyricsCache.has(url)) {
      lyricsData = lyricsCache.get(url);
      return;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('not found');
      const text = await response.text();
      lyricsData = text.split('\n').map(line => {
        const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
        if (match) {
          const min = parseInt(match[1], 10);
          const sec = parseInt(match[2], 10);
          const ms = parseInt(match[3].padEnd(3, '0'), 10);
          return { time: min * 60 + sec + ms / 1000, line: match[4].trim() };
        }
        return null;
      }).filter(Boolean);
      lyricsCache.set(url, lyricsData);
    } catch (e) {
      console.error('Failed to fetch lyrics:', e);
      lyricsData = [];
    }
  }

  function updateLyrics(currentTime) {
    if (!lyricsData.length) {
        document.getElementById('lyrics-window-line1').textContent = '';
        document.getElementById('lyrics-window-line2').textContent = 'Текст песни отсутствует';
        document.getElementById('lyrics-window-line3').textContent = '';
        return;
    }

    let currentLineIndex = -1;
    for (let i = 0; i < lyricsData.length; i++) {
      if (currentTime >= lyricsData[i].time) {
        currentLineIndex = i;
      } else {
        break;
      }
    }

    const line1 = document.getElementById('lyrics-window-line1');
    const line2 = document.getElementById('lyrics-window-line2');
    const line3 = document.getElementById('lyrics-window-line3');
    
    if (line1) line1.textContent = lyricsData[currentLineIndex - 1]?.line || '';
    if (line2) {
        line2.textContent = lyricsData[currentLineIndex]?.line || (currentLineIndex === -1 ? '...' : '');
        line2.classList.toggle('active', currentLineIndex > -1);
    }
    if (line3) line3.textContent = lyricsData[currentLineIndex + 1]?.line || '';
  }
  
  function toggleLyricsWindow(forceState) {
    const lw = document.getElementById('lyrics-window');
    if (!lw) return;

    // cycle: hidden -> normal -> expanded -> hidden
    let newState;
    if(forceState !== undefined) {
      newState = forceState;
    } else {
      if(lw.classList.contains('lyrics-hidden')) newState = 'normal';
      else if(lw.classList.contains('lyrics-normal')) newState = 'expanded';
      else newState = 'hidden';
    }
    
    lw.classList.toggle('lyrics-hidden', newState === 'hidden');
    lw.classList.toggle('lyrics-normal', newState === 'normal');
    lw.classList.toggle('lyrics-expanded', newState === 'expanded');
    
    const btn = document.getElementById('lyrics-toggle-btn');
    if(btn) {
       btn.classList.toggle('lyrics-hidden', newState === 'hidden');
       btn.classList.toggle('lyrics-normal', newState === 'normal');
       btn.classList.toggle('lyrics-expanded', newState === 'expanded');
    }
    
    localStorage.setItem('lyricsWindowState', newState);
  }
  
  function restoreLyricsWindowState() {
      const state = localStorage.getItem('lyricsWindowState') || 'normal';
      toggleLyricsWindow(state);
  }

  // Export
  window.fetchAndCacheLyrics = fetchAndCacheLyrics;
  window.updateLyrics = updateLyrics;
  window.toggleLyricsWindow = toggleLyricsWindow;
  window.restoreLyricsWindowState = restoreLyricsWindowState;
})();
