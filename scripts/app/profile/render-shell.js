// UID.044_(ListenerProfile core)_(подготовить профиль к встраиванию user-intelligence блоков)_(render-shell остаётся legacy host, принимающим optional intel fragments)
// UID.056_(Recommendation reasons)_(позже принимать explainable rec fragments без knowledge об их расчёте)_(shell только размещает future blocks, но не считает причины)
// UID.070_(Linked providers)_(показывать provider shell-поверхность без владения identity truth)_(render-shell рендерит auth/provider area, но данные linked accounts приходят извне)
// UID.072_(Provider consents)_(shell должен уметь принять consent UI блоки)_(но не хранить и не вычислять consent state самостоятельно)
// UID.073_(Hybrid sync orchestrator)_(shell станет host для sync-role/status block)_(но orchestration logic останется в intel/providers layer)
// UID.082_(Local truth vs external telemetry split)_(shell не должен экспортировать profile/raw insights сам)_(это только layout/render host)
// UID.094_(No-paralysis rule)_(profile shell обязан работать без intel fragments)_(если intelligent blocks отсутствуют, legacy profile UI остаётся полноценным)
// UID.095_(Ownership boundary: legacy vs intel)_(жёстко закрепить render-shell как legacy-shell, принимающий optional intel fragments)_(layout/profile navigation/stat shell здесь, а listener/recs/providers/community insights приходят как надстройка)
import { mountProfileCarouselFlat } from './carousel-flat.js';

const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');
export const renderProfileShell = ({ container: c, profile: p, tokens: tk, totalFull: tF, totalSec: tS, streak: strk, achCount: aC }) => {
  if (!c) return null; c.innerHTML = '';
  const ab = (id, n, ic) => `<button class="auth-btn ${id} ${tk[id] ? 'connected' : ''}" data-auth="${id}"><span>${ic}</span> ${tk[id] ? 'Подключено' : n}</button>`;
  const tpl = document.getElementById('profile-template').content.cloneNode(true);
  tpl.querySelector('#prof-avatar-btn').textContent = p.avatar; tpl.querySelector('#prof-name-inp').value = esc(p.name);
  tpl.querySelector('#prof-auth-grid').innerHTML = ab('yandex', 'Яндекс', '💽') + ab('google', 'Google', '☁️') + ab('vk', 'VK ID', '🔵');
  const ps = localStorage.getItem('sourcePref') === 'github' ? 'github' : 'yandex';
  window.Utils?.dom?.createStyleOnce?.('profile-source-pref-styles', `.prof-src-box{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:12px;display:flex;justify-content:space-between;align-items:center;margin-top:10px}.prof-src-title{font-size:13px;font-weight:bold;color:#fff}.prof-src-sub{font-size:11px;color:#888}.prof-src-switch{display:flex;background:rgba(0,0,0,0.3);border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)}.prof-src-btn{all:unset;cursor:pointer;padding:6px 12px;font-size:12px;font-weight:bold;transition:.2s}.prof-src-btn--yandex.prof-src-btn--active{color:#fff;background:radial-gradient(circle,#cc0000 0%,#880000 100%)}.prof-src-btn--github.prof-src-btn--active{color:#fff;background:radial-gradient(circle,#444 0%,#000 100%)}.prof-src-btn:not(.prof-src-btn--active){color:#666}`);
  tpl.querySelector('.profile-header').insertAdjacentHTML('afterend', `<div class="prof-src-box"><div><div class="prof-src-title">Приоритет источника</div><div class="prof-src-sub">Моментальный резерв включен всегда</div></div><div class="prof-src-switch"><button data-src="yandex" class="prof-src-btn prof-src-btn--yandex ${ps==='yandex'?'prof-src-btn--active':''}">Yandex</button><button data-src="github" class="prof-src-btn prof-src-btn--github ${ps==='github'?'prof-src-btn--active':''}">GitHub</button></div></div>`);
  tpl.querySelector('#prof-stat-tracks').textContent = tF;
  tpl.querySelector('#prof-stat-time').textContent = window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(tS) : `${Math.floor(tS/60)}м`;
  tpl.querySelector('#prof-stat-streak').textContent = strk; tpl.querySelector('#prof-stat-ach').textContent = aC;

  window.Utils?.dom?.createStyleOnce?.('profile-settings-styles', `
    .settings-content{display:none;flex-direction:column;gap:12px;animation:fadeIn .3s}
    .settings-content.active{display:flex}
    .set-row{display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,.03);padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.05)}
    .set-info{flex:1;padding-right:12px}
    .set-title{font-size:14px;font-weight:bold;color:#fff;margin-bottom:4px}
    .set-sub{font-size:11px;color:#888;line-height:1.3}
    .set-switch{position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0}
    .set-switch input{opacity:0;width:0;height:0}
    .set-slider{position:absolute;cursor:pointer;inset:0;background:rgba(255,255,255,.1);border-radius:24px;transition:.3s}
    .set-slider:before{content:"";position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:#888;border-radius:50%;transition:.3s}
    input:checked + .set-slider{background:var(--secondary-color)}
    input:checked + .set-slider:before{transform:translateX(20px);background:#fff}
    .set-preview-box{background:linear-gradient(180deg,#1a1d24,#11141a);border-radius:12px;padding:20px;display:flex;justify-content:center;border:1px solid rgba(77,170,255,.15);margin-bottom:2px}
    .sc-mini-preview{display:flex;flex-direction:column;align-items:center;gap:10px;transition:.3s}
    .sc-mini-card{width:64px;height:95px;border-radius:12px;background:linear-gradient(180deg,rgba(26,49,82,.8),rgba(8,16,30,.9));border:1px solid rgba(168,225,255,.5);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(77,170,255,.2)}
    .sc-mini-ic{font-size:26px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}
    .sc-mini-controls{display:flex;gap:6px;opacity:0;transform:scale(0.9);transition:.3s;pointer-events:none}
    .sc-mini-preview.show-ctrl .sc-mini-controls{opacity:1;transform:scale(1)}
    .sc-mini-controls div{background:linear-gradient(180deg,#0d1828,#070d16);border:1px solid rgba(77,170,255,.3);color:#7ab4f5;border-radius:4px;height:18px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900}
    .sc-mini-controls div:not(.sel){width:18px}
    .sc-mini-controls .sel{width:56px}
  `);

  if (!window.Utils?.isMobile?.()) {
    const kt = tpl.querySelector('#set-tab-keys');
    if (kt) kt.style.display = '';
  }

  c.appendChild(tpl);
  mountProfileCarouselFlat({ root: c });

  const ctrlInp = c.querySelector('#set-car-controls'), scPrev = c.querySelector('#sc-mini-preview'), scWrap = c.querySelector('.sc-3d-wrap');
  if (ctrlInp && scPrev) {
    const isShow = localStorage.getItem('profileShowControls') === '1';
    ctrlInp.checked = isShow;
    if (isShow) scPrev.classList.add('show-ctrl');
    ctrlInp.addEventListener('change', e => {
      const show = e.target.checked;
      localStorage.setItem('profileShowControls', show ? '1' : '0');
      scPrev.classList.toggle('show-ctrl', show);
      if (scWrap) scWrap.classList.toggle('show-controls', show);
    });
  }

  return c;
};
export default { renderProfileShell };
