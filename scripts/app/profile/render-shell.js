const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');

export function renderProfileShell({ container, profile, tokens, totalFull, totalSec, streak, achCount }) {
  if (!container) return null;

  const ab = (id, n, ic) => `<button class="auth-btn ${id} ${tokens[id] ? 'connected' : ''}" data-auth="${id}"><span>${ic}</span> ${tokens[id] ? 'Подключено' : n}</button>`;

  container.innerHTML = '';
  const tpl = document.getElementById('profile-template').content.cloneNode(true);
  tpl.querySelector('#prof-avatar-btn').textContent = profile.avatar;
  tpl.querySelector('#prof-name-inp').value = esc(profile.name);
  tpl.querySelector('#prof-auth-grid').innerHTML = ab('yandex', 'Яндекс', '💽') + ab('google', 'Google', '☁️') + ab('vk', 'VK ID', '🔵');

  const ps = localStorage.getItem('sourcePref') === 'github' ? 'github' : 'yandex';
  window.Utils?.dom?.createStyleOnce?.('profile-source-pref-styles', `
    .prof-src-box{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:12px;display:flex;justify-content:space-between;align-items:center;margin-top:10px}
    .prof-src-title{font-size:13px;font-weight:bold;color:#fff}
    .prof-src-sub{font-size:11px;color:#888}
    .prof-src-switch{display:flex;background:rgba(0,0,0,0.3);border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)}
    .prof-src-btn{all:unset;cursor:pointer;padding:6px 12px;font-size:12px;font-weight:bold;transition:.2s}
    .prof-src-btn--yandex.prof-src-btn--active{color:#fff;background:radial-gradient(circle,#cc0000 0%,#880000 100%)}
    .prof-src-btn--github.prof-src-btn--active{color:#fff;background:radial-gradient(circle,#444 0%,#000 100%)}
    .prof-src-btn:not(.prof-src-btn--active){color:#666}
  `);
  tpl.querySelector('.profile-header').insertAdjacentHTML('afterend', `<div class="prof-src-box"><div><div class="prof-src-title">Приоритет источника</div><div class="prof-src-sub">Моментальный резерв включен всегда</div></div><div class="prof-src-switch"><button data-src="yandex" class="prof-src-btn prof-src-btn--yandex ${ps==='yandex'?'prof-src-btn--active':''}">Yandex</button><button data-src="github" class="prof-src-btn prof-src-btn--github ${ps==='github'?'prof-src-btn--active':''}">GitHub</button></div></div>`);

  tpl.querySelector('#prof-stat-tracks').textContent = totalFull;
  tpl.querySelector('#prof-stat-time').textContent = window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(totalSec) : `${Math.floor(totalSec/60)}м`;
  tpl.querySelector('#prof-stat-streak').textContent = streak;
  tpl.querySelector('#prof-stat-ach').textContent = achCount;
  container.appendChild(tpl);

  return container;
}

export default { renderProfileShell };
