export function bindAppModals({ W, D, config }) {
  const $ = id => D.getElementById(id);
  const C = config || {};

  W.Utils?.dom?.createStyleOnce?.('app-modals-styles', `
    .fb-modal-note{margin-bottom:20px;color:#8ab8fd;text-align:center}
    .fb-modal-links{display:flex;flex-direction:column;gap:15px;max-width:300px;margin:0 auto}
    .fb-modal-link{color:#fff;padding:15px;border-radius:8px;text-decoration:none;text-align:center}
    .fb-modal-link--tg{background:#0088cc}
    .fb-modal-link--mail{background:#4daaff}
    .fb-modal-link--gh{background:#333}
  `);

  const fb = $('feedback-link');
  if (fb && !fb._appModalBound) {
    fb._appModalBound = 1;
    fb.onclick = e => {
      e.preventDefault();
      W.Modals?.open?.({
        title: 'Обратная связь',
        maxWidth: 420,
        bodyHtml: `<p class="fb-modal-note">Есть предложения или нашли ошибку?<br>Напишите нам!</p><div class="fb-modal-links"><a href="https://t.me/vitrina_razbita" target="_blank" class="fb-modal-link fb-modal-link--tg">Telegram</a><a href="mailto:${C.SUPPORT_EMAIL || 'support@vitrina-razbita.ru'}" target="_blank" class="fb-modal-link fb-modal-link--mail">Email</a><a href="${C.GITHUB_URL || 'https://github.com/apel-s-in/vi3na1bita-music'}" target="_blank" class="fb-modal-link fb-modal-link--gh">GitHub</a></div>`
      });
    };
  }

  const sl = $('support-link');
  if (sl) sl.href = C.SUPPORT_URL || 'https://example.com/support';
}

export default { bindAppModals };
