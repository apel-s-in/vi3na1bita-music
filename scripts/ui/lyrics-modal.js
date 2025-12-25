// scripts/ui/lyrics-modal.js
(function LyricsModalModule() {
  'use strict';
  const w = window;

  function show() {
    const track = w.playerCore?.getCurrentTrack?.();
    if (!track) {
      w.NotificationSystem?.info('Нет активного трека');
      return;
    }

    const hasFulltext = !!track.fulltext;
    const hasLyrics = track.hasLyrics;
    if (!hasFulltext && !hasLyrics) {
      w.NotificationSystem?.info('Текст песни недоступен');
      return;
    }

    let content = '';
    if (hasFulltext) {
      content += `<div class="lyrics-fulltext-block">${w.Utils.escapeHtml(track.fulltext)}</div>`;
    }
    if (hasLyrics && track.lyrics) {
      fetch(track.lyrics)
        .then(res => res.text())
        .then(text => {
          if (text.trim().startsWith('[')) {
            content += parseLrcToHtml(text);
          } else {
            try {
              const data = JSON.parse(text);
              if (Array.isArray(data)) {
                content += data.map(line => `<div>${w.Utils.escapeHtml(line.line || line.text || '')}</div>`).join('');
              }
            } catch {
              content += '<div>Ошибка загрузки лирики</div>';
            }
          }
          if (modal) {
            modal.querySelector('.lyrics-content')?.remove();
            const newContent = document.createElement('div');
            newContent.className = 'lyrics-content';
            newContent.innerHTML = content;
            modal.querySelector('.modal-content')?.appendChild(newContent);
          }
        })
        .catch(() => {
          if (modal) {
            modal.querySelector('.lyrics-content')?.remove();
            const err = document.createElement('div');
            err.className = 'lyrics-content';
            err.innerHTML = '<div>Не удалось загрузить лирику</div>';
            modal.querySelector('.modal-content')?.appendChild(err);
          }
        });
    }

    const modalHtml = `
      <div class="modal-content lyrics-modal">
        <h2>${w.Utils.escapeHtml(track.title)}</h2>
        <div class ${'lyrics-content'} style="max-height: 70vh; overflow-y: auto;">
          ${hasFulltext ? `<div class="lyrics-fulltext-block">${w.Utils.escapeHtml(track.fulltext)}</div>` : ''}
          ${!hasFulltext && !hasLyrics ? '<div>Текст недоступен</div>' : ''}
        </div>
        <button class="bigclose">Закрыть</button>
      </div>
    `;

    const modal = w.Utils.createModal(modalHtml, null);
  }

  function parseLrcToHtml(lrc) {
    const lines = lrc.split('\n');
    let html = '';
    for (const line of lines) {
      const match = line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/);
      if (match) {
        const text = match[4].trim();
        if (text) html += `<div>${w.Utils.escapeHtml(text)}</div>`;
      }
    }
    return html;
  }

  w.LyricsModal = { show };
})();
