// scripts/ui/modals.js — Все модальные окна
(function ModalsModule() {
  'use strict';
  const w = window;
  const esc = s => w.Utils?.escapeHtml?.(s) || s;

  // === LYRICS MODAL ===
  async function showLyrics() {
    const track = w.playerCore?.getCurrentTrack();
    if (!track) { w.NotificationSystem?.warning('Нет активного трека'); return; }

    let text = '';
    if (track.fulltext) {
      try {
        const r = await fetch(track.fulltext);
        if (r.ok) text = await r.text();
      } catch {}
    }
    if (!text && w.PlayerUI?.currentLyrics?.length) {
      text = w.PlayerUI.currentLyrics.map(l => l.text || l.line || '').filter(Boolean).join('\n');
    }
    if (!text) { w.NotificationSystem?.warning('Текст песни недоступен'); return; }

    const modal = w.Utils?.createModal?.(`
      <div class="modal-feedback lyrics-modal" style="max-width:520px;max-height:80vh">
        <button class="bigclose">×</button>
        <h2>${esc(track.title)}</h2>
        <div style="color:#8ab8fd;margin-bottom:20px;font-size:14px">${esc(track.artist || 'Витрина Разбита')}</div>
        <div class="lyrics-fulltext" style="max-height:50vh;overflow-y:auto;padding:16px;background:rgba(0,0,0,.2);border-radius:10px;line-height:1.8;white-space:pre-wrap">${esc(text)}</div>
        <div style="display:flex;gap:10px;margin-top:20px;justify-content:center">
          <button class="modal-action-btn" id="copy-lyrics">📋 Копировать</button>
        </div>
      </div>
    `);
    modal?.querySelector('#copy-lyrics')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); w.NotificationSystem?.success('Скопировано'); modal.remove(); } catch { w.NotificationSystem?.error('Ошибка'); }
    });
  }

  // === SYSINFO MODAL ===
  async function showSysinfo() {
    const swVer = await getSWVersion();
    const info = {
      ver: w.APP_CONFIG?.APP_VERSION || w.VERSION || '?',
      build: w.APP_CONFIG?.BUILD_DATE || w.BUILD_DATE || '?',
      pwa: window.matchMedia('(display-mode: standalone)').matches ? '✅' : '❌',
      sw: swVer,
      howler: w.Howler?.version || 'N/A',
      online: navigator.onLine ? '✅' : '❌'
    };
    w.Utils?.createModal?.(`
      <div class="modal-feedback" style="max-width:500px;max-height:80vh;overflow-y:auto">
        <button class="bigclose">×</button>
        <h2 style="color:#4daaff">О системе</h2>
        <div style="font-size:14px;line-height:1.8">
          <div><b>Версия:</b> ${info.ver}</div>
          <div><b>Сборка:</b> ${info.build}</div>
          <div><b>PWA:</b> ${info.pwa}</div>
          <div><b>SW:</b> ${info.sw}</div>
          <div><b>Howler:</b> ${info.howler}</div>
          <div><b>Online:</b> ${info.online}</div>
        </div>
        <div style="margin-top:20px;text-align:center;font-size:12px;color:#999">Витрина Разбита © 2025</div>
      </div>
    `);
  }

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

  // === FEEDBACK MODAL ===
  function showFeedback() {
    const email = w.APP_CONFIG?.SUPPORT_EMAIL || 'support@vitrina-razbita.ru';
    const gh = w.APP_CONFIG?.GITHUB_URL || 'https://github.com/apel-s-in/vi3na1bita-music';
    w.Utils?.createModal?.(`
      <div class="modal-feedback" style="max-width:400px">
        <button class="bigclose">×</button>
        <h2>Обратная связь</h2>
        <div style="display:flex;flex-direction:column;gap:15px;margin-top:20px">
          <a href="https://t.me/vitrina_razbita" target="_blank" style="background:#0088cc;color:#fff;padding:15px;border-radius:8px;text-align:center;text-decoration:none">Telegram</a>
          <a href="mailto:${email}" style="background:#4daaff;color:#fff;padding:15px;border-radius:8px;text-align:center;text-decoration:none">Email</a>
          <a href="${gh}" target="_blank" style="background:#333;color:#fff;padding:15px;border-radius:8px;text-align:center;text-decoration:none">GitHub</a>
        </div>
      </div>
    `);
  }

  // === HOTKEYS MODAL ===
  function showHotkeys() {
    w.Utils?.createModal?.(`
      <div class="modal-feedback" style="max-width:400px">
        <button class="bigclose">×</button>
        <h2>Горячие клавиши</h2>
        <div style="margin-top:16px;font-size:14px;line-height:2">
          <div><b>K / Пробел</b> — Play/Pause</div>
          <div><b>X</b> — Стоп</div>
          <div><b>N / P</b> — След./Пред.</div>
          <div><b>R</b> — Повтор</div>
          <div><b>U</b> — Shuffle</div>
          <div><b>F</b> — Избранные</div>
          <div><b>T</b> — Таймер сна</div>
          <div><b>←/→</b> — ±5 сек</div>
          <div><b>↑/↓</b> — Громкость</div>
        </div>
      </div>
    `);
  }

  // === INIT ===
  function init() {
    document.getElementById('sysinfo-btn')?.addEventListener('click', showSysinfo);
    document.getElementById('feedback-link')?.addEventListener('click', showFeedback);
    document.getElementById('hotkeys-btn')?.addEventListener('click', showHotkeys);
    const supportLink = document.getElementById('support-link');
    if (supportLink) supportLink.href = w.APP_CONFIG?.SUPPORT_URL || '#';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else init();

  w.LyricsModal = { show: showLyrics };
  w.Modals = { showLyrics, showSysinfo, showFeedback, showHotkeys };
})();
