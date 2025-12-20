// scripts/ui/modals.js — Модальные окна
(function() {
  'use strict';
  const esc = s => window.Utils?.escapeHtml?.(s) || s;
  
  async function getSWVersion() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg?.active) return 'N/A';
      return new Promise(r => {
        const ch = new MessageChannel();
        ch.port1.onmessage = e => r(e.data.version || 'N/A');
        reg.active.postMessage({ type: 'GET_SW_VERSION' }, [ch.port2]);
        setTimeout(() => r('N/A'), 1000);
      });
    } catch { return 'N/A'; }
  }
  
  async function showLyrics() {
    const track = window.playerCore?.getCurrentTrack();
    if (!track) { window.NotificationSystem?.warning('Нет трека'); return; }
    let text = '';
    if (track.fulltext) try { const r = await fetch(track.fulltext); if (r.ok) text = await r.text(); } catch {}
    if (!text && window.PlayerUI?.currentLyrics?.length) text = window.PlayerUI.currentLyrics.map(l => l.text || '').filter(Boolean).join('\n');
    if (!text) { window.NotificationSystem?.warning('Текст недоступен'); return; }
    const m = window.Utils?.createModal?.(`<div class="modal-feedback" style="max-width:520px;max-height:80vh"><button class="bigclose">×</button><h2>${esc(track.title)}</h2><div style="color:#8ab8fd;margin-bottom:20px;font-size:14px">${esc(track.artist || 'Витрина Разбита')}</div><div style="max-height:50vh;overflow-y:auto;padding:16px;background:rgba(0,0,0,.2);border-radius:10px;line-height:1.8;white-space:pre-wrap">${esc(text)}</div><div style="display:flex;gap:10px;margin-top:20px;justify-content:center"><button class="modal-action-btn" id="copy-lyrics">📋 Копировать</button></div></div>`);
    m?.querySelector('#copy-lyrics')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(text); window.NotificationSystem?.success('Скопировано'); m.remove(); } catch { window.NotificationSystem?.error('Ошибка'); } });
  }
  
  async function showSysinfo() {
    const sw = await getSWVersion();
    const info = { ver: window.APP_CONFIG?.APP_VERSION || window.VERSION || '?', build: window.APP_CONFIG?.BUILD_DATE || '?', pwa: window.matchMedia('(display-mode: standalone)').matches ? '✅' : '❌', sw, howler: window.Howler?.version || 'N/A', online: navigator.onLine ? '✅' : '❌' };
    window.Utils?.createModal?.(`<div class="modal-feedback" style="max-width:500px"><button class="bigclose">×</button><h2 style="color:#4daaff">О системе</h2><div style="font-size:14px;line-height:1.8"><div><b>Версия:</b> ${info.ver}</div><div><b>Сборка:</b> ${info.build}</div><div><b>PWA:</b> ${info.pwa}</div><div><b>SW версия:</b> ${info.sw}</div><div><b>Howler:</b> ${info.howler}</div><div><b>Online:</b> ${info.online}</div></div><div style="margin-top:20px;text-align:center;font-size:12px;color:#999">© 2025</div></div>`);
  }
  
  function showFeedback() {
    const email = window.APP_CONFIG?.SUPPORT_EMAIL || 'support@vitrina-razbita.ru';
    window.Utils?.createModal?.(`<div class="modal-feedback" style="max-width:400px"><button class="bigclose">×</button><h2>Обратная связь</h2><div style="display:flex;flex-direction:column;gap:15px;margin-top:20px"><a href="https://t.me/vitrina_razbita" target="_blank" style="background:#0088cc;color:#fff;padding:15px;border-radius:8px;text-align:center;text-decoration:none">Telegram</a><a href="mailto:${email}" style="background:#4daaff;color:#fff;padding:15px;border-radius:8px;text-align:center;text-decoration:none">Email</a></div></div>`);
  }
  
  function showHotkeys() {
    window.Utils?.createModal?.(`<div class="modal-feedback" style="max-width:400px"><button class="bigclose">×</button><h2>Горячие клавиши</h2><div style="margin-top:16px;font-size:14px;line-height:2"><div><b>K/Пробел</b> — Play/Pause</div><div><b>X</b> — Стоп</div><div><b>N/P</b> — След./Пред.</div><div><b>R</b> — Повтор</div><div><b>U</b> — Shuffle</div><div><b>F</b> — Избранные</div><div><b>T</b> — Таймер</div><div><b>←/→</b> — ±5 сек</div><div><b>↑/↓</b> — Громкость</div></div></div>`);
  }
  
  function init() {
    document.getElementById('sysinfo-btn')?.addEventListener('click', showSysinfo);
    document.getElementById('feedback-link')?.addEventListener('click', showFeedback);
    document.getElementById('hotkeys-btn')?.addEventListener('click', showHotkeys);
    const support = document.getElementById('support-link');
    if (support) support.href = window.APP_CONFIG?.SUPPORT_URL || '#';
  }
  
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
  window.LyricsModal = { show: showLyrics };
  window.Modals = { showLyrics, showSysinfo, showFeedback, showHotkeys };
})();
