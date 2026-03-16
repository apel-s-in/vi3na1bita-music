(function () {
  'use strict';
  const show = async () => {
    const W = window, D = document, N = W.NotificationSystem, U = W.Utils, t = W.playerCore?.getCurrentTrack();
    if (!t) return N?.warning('Нет активного трека');
    let txt = '';
    if (t.fulltext || t.uid) {
      const urls = [...(await W.TrackRegistry?.getSmartUrlInfo?.(t.uid, 'fulltext').then(s=>s?.url?[s.url]:[]).catch(()=>[])), t.fulltext].filter((v,i,a)=>v&&a.indexOf(v)===i);
      for (const u of urls) {
        try { txt = U?.fetchCache?.getText ? await U.fetchCache.getText({ key: `lyrics:fulltext:${u}`, url: u, ttlMs: 43200000, store: 'session', fetchInit: { cache: 'force-cache' } }) : await fetch(u, { cache: 'force-cache' }).then(r => r.ok ? r.text() : ''); if (txt) break; } catch {}
      }
    }
    if (!txt) txt = (W.LyricsController?.getCurrentLyricsLines?.() || []).map(i => i.line).filter(Boolean).join('\n');
    if (!txt) return N?.warning('Текст песни недоступен');
    const esc = U?.escapeHtml || (s => String(s || ''));
    
    U?.dom?.createStyleOnce?.('lyrics-modal-styles', `.lyrics-modal-box{max-height:80vh}.lyrics-modal-title{margin:0 0 8px 0}.lyrics-modal-meta{color:#8ab8fd;margin-bottom:16px;font-size:14px}.lyrics-modal-text{max-height:50vh;overflow-y:auto;padding:16px;background:rgba(0,0,0,0.2);border-radius:10px;line-height:1.8;white-space:pre-wrap;font-size:15px;scrollbar-width:thin;scrollbar-color:rgba(77,170,255,0.3) transparent}.lyrics-modal-actions{display:flex;gap:10px;margin-top:16px;justify-content:center;flex-wrap:wrap}`);

    const m = W.Modals?.open?.({ title: 'Текст песни', maxWidth: 560, bodyHtml: `<div class="lyrics-modal lyrics-modal-box"><h2 class="lyrics-modal-title">${esc(t.title)}</h2><div class="lyrics-modal-meta">${esc(t.artist || 'Витрина Разбита')} · ${esc(t.album || '')}</div><div class="lyrics-fulltext lyrics-modal-text">${esc(txt)}</div><div class="lyrics-modal-actions"><button class="modal-action-btn" id="copy-lyrics-btn">📋 Копировать</button><button class="modal-action-btn" id="share-lyrics-btn">📤 Поделиться</button></div></div>` });
    if (!m) return N?.error('Система окон недоступна');

    m.querySelector('#copy-lyrics-btn')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(txt); N?.success('Текст скопирован'); m.remove(); } catch {
        U?.dom?.createStyleOnce?.('lyrics-modal-copy-helper-style', `.lyrics-copy-helper{position:fixed;opacity:0;pointer-events:none;inset:-9999px auto auto -9999px}`);
        const ta = Object.assign(D.createElement('textarea'), { className: 'lyrics-copy-helper', value: txt }); D.body.appendChild(ta); ta.select();
        try { D.execCommand('copy'); N?.success('Текст скопирован'); m.remove(); } catch { N?.error('Не удалось скопировать'); } ta.remove();
      }
    });
    m.querySelector('#share-lyrics-btn')?.addEventListener('click', async () => {
      if (!navigator.share) return N?.info('Функция "Поделиться" недоступна в этом браузере');
      try { await navigator.share({ title: t.title, text: `${t.title} - ${t.artist}\n\n${txt}` }); } catch (e) { if (e.name !== 'AbortError') console.error(e); }
    });
  };
  window.LyricsModal = { show };
})();
