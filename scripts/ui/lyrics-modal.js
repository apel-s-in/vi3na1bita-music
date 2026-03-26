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
    const m = W.Modals?.open?.({ title: esc(t.title), maxWidth: 420, bodyHtml: `<div class="lyrics-modal lyrics-modal-box"><div class="lyrics-modal-meta">${esc(t.artist || 'Витрина Разбита')} · ${esc(t.album || '')}</div><div class="lyrics-modal-text-wrap" id="lm-wrap"><div class="lyrics-fulltext lyrics-modal-text-inner" id="lm-inner">${esc(txt)}</div></div><div class="lyrics-modal-actions"><button class="modal-action-btn" id="copy-lyrics-btn">📋 Копировать</button></div></div>` });
    if (!m) return N?.error('Система окон недоступна');
    requestAnimationFrame(() => { const w = m.querySelector('#lm-wrap'), i = m.querySelector('#lm-inner'); if (w && i) { const r = (w.clientWidth - 32) / i.scrollWidth; if (r < 1) i.style.fontSize = Math.floor(15 * r) + 'px'; } });
    m.querySelector('#copy-lyrics-btn')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(txt); N?.success('Текст скопирован'); m.remove(); } catch {
        const ta = Object.assign(D.createElement('textarea'), { className: 'lyrics-copy-helper', value: txt }); D.body.appendChild(ta); ta.select();
        try { D.execCommand('copy'); N?.success('Текст скопирован'); m.remove(); } catch { N?.error('Не удалось скопировать'); } ta.remove();
      }
    });
  };
  window.LyricsModal = { show };
})();
