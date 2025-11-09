// scripts/ui/modals.js (ESM)
// Вынос модалки «Текст песни» и утилит

let lyricsModalFont = 16;

export function openLyricsModal() {
  const pc = window.getPlayerConfig && window.getPlayerConfig();
  const tr = pc?.tracks?.[window.playingTrack];
  if (!tr) { window.NotificationSystem && window.NotificationSystem.warning('Нет активного трека'); return; }

  const modal = document.getElementById('lyrics-text-modal');
  const pre = document.getElementById('lyrics-modal-pre');
  const title = document.getElementById('lyrics-modal-title');

  title.textContent = tr.title;
  lyricsModalFont = parseInt(localStorage.getItem('lyricsModalFont') || '16', 10);
  pre.style.fontSize = `${lyricsModalFont}px`;
  pre.textContent = 'Загрузка...';

  modal.classList.add('active');

  const applyWidthByText = (text) => {
    const modalEl = document.querySelector('#lyrics-text-modal .lyrics-modal');
    const preEl = document.getElementById('lyrics-modal-pre');
    if (!modalEl || !preEl) return;
    const css = getComputedStyle(preEl);
    const font = `${css.fontStyle} ${css.fontVariant} ${css.fontWeight} ${css.fontSize} / ${css.lineHeight} ${css.fontFamily}`;
    const lines = String(text || '').split(/\r?\n/);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    let maxPx = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxPx) maxPx = w;
    }
    const sidePad = 48;
    const desired = Math.ceil(maxPx + sidePad);
    const maxAllowed = Math.min(window.innerWidth * 0.96, 960);
    const finalPx = Math.max(320, Math.min(desired, maxAllowed));

    modalEl.style.width = `${finalPx}px`;
    modalEl.style.maxWidth = `${finalPx}px`;
    const scroll = modalEl.querySelector('.lyrics-modal-scroll');
    if (scroll) scroll.style.overflowX = 'hidden';
  };

  if (tr.fulltext) {
    fetch(tr.fulltext).then(r => r.text()).then(txt => {
      pre.textContent = txt;
      applyWidthByText(txt);
    }).catch(() => {
      const fb = buildFallbackLyricsText();
      pre.textContent = fb;
      applyWidthByText(fb);
    });
  } else {
    const fb = buildFallbackLyricsText();
    pre.textContent = fb;
    applyWidthByText(fb);
  }
}

export function closeLyricsModal() {
  document.getElementById('lyrics-text-modal').classList.remove('active');
  exitLyricsFullscreenIfAny();
}

export function buildFallbackLyricsText() {
  if (!Array.isArray(window.currentLyrics) || !window.currentLyrics.length) return 'Текст не найден.';
  return window.currentLyrics.map(x => x.line || '').join('\n');
}

export function copyLyricsFromModal() {
  const txt = document.getElementById('lyrics-modal-pre').textContent || '';
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(txt).then(() => window.NotificationSystem && window.NotificationSystem.success('Текст скопирован!'), () => window.NotificationSystem && window.NotificationSystem.error('Не удалось скопировать'));
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = txt; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); window.NotificationSystem && window.NotificationSystem.success('Текст скопирован!'); } catch { window.NotificationSystem && window.NotificationSystem.error('Не удалось скопировать'); }
  document.body.removeChild(ta);
}

export async function shareLyricsFromModal() {
  const pc = window.getPlayerConfig && window.getPlayerConfig();
  const tr = pc?.tracks?.[window.playingTrack];
  const txt = document.getElementById('lyrics-modal-pre').textContent || '';
  const shareTitle = tr ? tr.title : 'Текст песни';
  if (navigator.share && txt.length < 3000) {
    try { await navigator.share({ title: shareTitle, text: txt }); } catch {}
  } else {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(txt);
      window.NotificationSystem && window.NotificationSystem.success('Текст скопирован для отправки!');
    } else {
      alert('Скопируйте текст вручную.');
    }
  }
}

export function zoomLyrics(delta) {
  lyricsModalFont = Math.min(28, Math.max(12, lyricsModalFont + delta));
  localStorage.setItem('lyricsModalFont', String(lyricsModalFont));
  const pre = document.getElementById('lyrics-modal-pre');
  if (pre) pre.style.fontSize = `${lyricsModalFont}px`;
}

export function toggleLyricsFullscreen() {
  const modalInner = document.querySelector('#lyrics-text-modal .lyrics-modal');
  if (!modalInner) return;
  if (!document.fullscreenElement) {
    if (modalInner.requestFullscreen) modalInner.requestFullscreen().catch(()=>{});
  } else {
    if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
  }
}
export function exitLyricsFullscreenIfAny() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(()=>{});
  }
}

window.UIModals = {
  openLyricsModal, closeLyricsModal, buildFallbackLyricsText,
  copyLyricsFromModal, shareLyricsFromModal, zoomLyrics,
  toggleLyricsFullscreen, exitLyricsFullscreenIfAny
};
