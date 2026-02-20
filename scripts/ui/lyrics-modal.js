// scripts/ui/lyrics-modal.js
// Модальное окно с полным текстом песни (Оптимизировано v2.0 + Offline Fallback)

(function () {
  'use strict';

  const show = async () => {
    const W = window, D = document, N = W.NotificationSystem;
    const t = W.playerCore?.getCurrentTrack();
    
    if (!t) return N?.warning('Нет активного трека');

    let txt = '';

    // 1. Пытаемся загрузить полный текст (fulltext). 
    // Если сеть отключена Сетевой политикой, fetch выбросит исключение.
    if (t.fulltext) {
      try {
        const r = await fetch(t.fulltext);
        if (r.ok) txt = await r.text();
      } catch (e) {
        console.warn('[LyricsModal] Fulltext fetch failed (Offline/Network Policy). Falling back to timeline.');
      }
    }

    // 2. Умный Fallback: Если fulltext нет или он заблокирован оффлайн-режимом,
    // бесшовно берем уже закешированные таймлайн-строки из памяти.
    if (!txt) {
      const lines = W.LyricsController?.getCurrentLyricsLines?.() || [];
      txt = lines.map(i => i.line).filter(Boolean).join('\n');
    }

    if (!txt) return N?.warning('Текст песни недоступен');

    const esc = W.Utils?.escapeHtml || (s => String(s || ''));
    
    // Строгое сохранение пиксель-в-пиксель структуры и ID кнопок
    const html = `
      <div class="lyrics-modal" style="max-height: 80vh;">
        <h2 style="margin: 0 0 8px 0;">${esc(t.title)}</h2>
        <div style="color: #8ab8fd; margin-bottom: 16px; font-size: 14px;">
          ${esc(t.artist || 'Витрина Разбита')} · ${esc(t.album || '')}
        </div>
        <div class="lyrics-fulltext" style="max-height: 50vh; overflow-y: auto; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 10px; line-height: 1.8; white-space: pre-wrap; font-size: 15px; scrollbar-width: thin; scrollbar-color: rgba(77,170,255,0.3) transparent;">${esc(txt)}</div>
        <div style="display:flex; gap:10px; margin-top:16px; justify-content:center; flex-wrap:wrap;">
          <button class="modal-action-btn" id="copy-lyrics-btn">📋 Копировать</button>
          <button class="modal-action-btn" id="share-lyrics-btn">📤 Поделиться</button>
        </div>
      </div>
    `;

    if (!W.Modals?.open) return N?.error('Система окон недоступна');
    const m = W.Modals.open({ title: 'Текст песни', maxWidth: 560, bodyHtml: html });

    // Обработчик: Копирование (Современный API -> Fallback на execCommand)
    m.querySelector('#copy-lyrics-btn')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(txt);
        N?.success('Текст скопирован');
        m.remove();
      } catch {
        const ta = D.createElement('textarea');
        Object.assign(ta.style, { position: 'fixed', opacity: '0' });
        ta.value = txt;
        D.body.appendChild(ta);
        ta.select();
        try { D.execCommand('copy'); N?.success('Текст скопирован'); m.remove(); } 
        catch { N?.error('Не удалось скопировать'); }
        ta.remove();
      }
    });

    // Обработчик: Поделиться (Web Share API)
    m.querySelector('#share-lyrics-btn')?.addEventListener('click', async () => {
      if (!navigator.share) return N?.info('Функция "Поделиться" недоступна в этом браузере');
      try {
        await navigator.share({ title: t.title, text: `${t.title} - ${t.artist}\n\n${txt}` });
      } catch (e) {
        if (e.name !== 'AbortError') console.error('Share failed:', e);
      }
    });
  };

  window.LyricsModal = { show };
})();
