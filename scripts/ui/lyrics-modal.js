// scripts/ui/lyrics-modal.js
// Модальное окно с полным текстом песни

(function LyricsModalModule() {
  'use strict';

  const w = window;

  function showFullLyricsModal() {
    const track = w.playerCore?.getCurrentTrack();
    if (!track) {
      w.NotificationSystem?.warning('Нет активного трека');
      return;
    }

    // Получить полный текст
    const fulltext = track.fulltext;
    
    if (fulltext) {
      loadFulltextAndShow(fulltext, track);
    } else {
      showLyricsFromTimeline(track);
    }
  }

  async function loadFulltextAndShow(url, track) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load fulltext');
      
      const text = await response.text();
      showModal(track, text);
      
    } catch (error) {
      console.error('Failed to load fulltext:', error);
      w.NotificationSystem?.error('Не удалось загрузить текст песни');
    }
  }

  function showLyricsFromTimeline(track) {
    // Собрать текст из timeline лирики
    if (!w.PlayerUI || !w.PlayerUI.currentLyrics || !w.PlayerUI.currentLyrics.length) {
      w.NotificationSystem?.warning('Текст песни недоступен');
      return;
    }

    const lines = w.PlayerUI.currentLyrics.map(item => item.line).filter(Boolean);
    const text = lines.join('\n');
    
    showModal(track, text);
  }

  function showModal(track, text) {
    const modal = document.createElement('div');
    modal.className = 'modal-bg active';
    
    modal.innerHTML = `
      <div class="modal-feedback lyrics-modal" style="max-width: 520px; max-height: 80vh;">
        <button class="bigclose" title="Закрыть">
          <svg viewBox="0 0 48 48">
            <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
            <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          </svg>
        </button>
        
        <h2 style="margin-bottom: 8px;">${escapeHtml(track.title)}</h2>
        <div style="color: #8ab8fd; margin-bottom: 20px; font-size: 14px;">
          ${escapeHtml(track.artist || 'Витрина Разбита')} · ${escapeHtml(track.album || '')}
        </div>
        
        <div class="lyrics-fulltext" style="
          max-height: 50vh;
          overflow-y: auto;
          padding: 16px;
          background: rgba(0,0,0,0.2);
          border-radius: 10px;
          line-height: 1.8;
          white-space: pre-wrap;
          font-size: 15px;
          scrollbar-width: thin;
          scrollbar-color: rgba(77,170,255,0.3) transparent;
        ">
          ${escapeHtml(text)}
        </div>
        
        <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: center;">
          <button class="modal-action-btn" id="copy-lyrics-btn">
            📋 Копировать
          </button>
          <button class="modal-action-btn" id="share-lyrics-btn">
            📤 Поделиться
          </button>
        </div>
      </div>
    `;

    const closeBtn = modal.querySelector('.bigclose');
    closeBtn?.addEventListener('click', () => modal.remove());

    const copyBtn = modal.querySelector('#copy-lyrics-btn');
    copyBtn?.addEventListener('click', () => copyLyrics(text, modal));

    const shareBtn = modal.querySelector('#share-lyrics-btn');
    shareBtn?.addEventListener('click', () => shareLyrics(track, text));

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
  }

  async function copyLyrics(text, modal) {
    try {
      await navigator.clipboard.writeText(text);
      w.NotificationSystem?.success('Текст скопирован');
      modal.remove();
    } catch (error) {
      // Fallback для старых браузеров
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      
      try {
        document.execCommand('copy');
        w.NotificationSystem?.success('Текст скопирован');
        modal.remove();
      } catch (e) {
        w.NotificationSystem?.error('Не удалось скопировать');
      }
      
      document.body.removeChild(textarea);
    }
  }

  async function shareLyrics(track, text) {
    const shareData = {
      title: track.title,
      text: `${track.title} - ${track.artist}\n\n${text}`
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Share failed:', error);
        }
      }
    } else {
      w.NotificationSystem?.info('Функция "Поделиться" недоступна в этом браузере');
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // Публичный API
  w.LyricsModal = {
    show: showFullLyricsModal
  };

  // Автоинициализация
  // (Lyrics Modal не требует автозапуска)

})();
