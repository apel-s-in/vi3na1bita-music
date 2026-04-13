// UID.044_(ListenerProfile core)_(подготовить профиль к встраиванию user-intelligence блоков)_(render-shell остаётся legacy host, принимающим optional intel fragments) UID.056_(Recommendation reasons)_(позже принимать explainable rec fragments без knowledge об их расчёте)_(shell только размещает future blocks, но не считает причины) UID.070_(Linked providers)_(показывать provider shell-поверхность без владения identity truth)_(render-shell рендерит auth/provider area, но данные linked accounts приходят извне) UID.072_(Provider consents)_(shell должен уметь принять consent UI блоки)_(но не хранить и не вычислять consent state самостоятельно) UID.073_(Hybrid sync orchestrator)_(shell станет host для sync-role/status block)_(но orchestration logic останется в intel/providers layer) UID.082_(Local truth vs external telemetry split)_(shell не должен экспортировать profile/raw insights сам)_(это только layout/render host) UID.094_(No-paralysis rule)_(profile shell обязан работать без intel fragments)_(если intelligent blocks отсутствуют, legacy profile UI остаётся полноценным) UID.095_(Ownership boundary: legacy vs intel)_(жёстко закрепить render-shell как legacy-shell, принимающий optional intel fragments)_(layout/profile navigation/stat shell здесь, а listener/recs/providers/community insights приходят как надстройка)
import { mountProfileCarouselFlat } from './carousel-flat.js';
import { renderProfileSettings } from './settings-view.js';
import { getProfileTemplateHtml } from './template.js';
import { renderYandexAuthBlock } from './yandex-auth-view.js';

// ─── Глобальные слушатели badge — инициализируются один раз при первом импорте ──
let _badgeListenersBound = false;
function _initBadgeListeners() {
  if (_badgeListenersBound) return;
  _badgeListenersBound = true;

  window.addEventListener('yandex:cloud:newer', () => {
    const profileBtn = document.querySelector('.album-icon[data-album="__profile__"]');
    if (!profileBtn || profileBtn.querySelector('.cloud-newer-badge')) return;

    if (!document.getElementById('cloud-badge-style')) {
      const style = document.createElement('style');
      style.id = 'cloud-badge-style';
      style.textContent = `@keyframes badgePop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.3);opacity:1}100%{transform:scale(1);opacity:1}}`;
      document.head.appendChild(style);
    }

    profileBtn.style.position = 'relative';
    const parent = profileBtn.parentElement;
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    const badge = Object.assign(document.createElement('span'), {
      className: 'cloud-newer-badge',
      textContent: '!'
    });
    badge.title = 'В облаке есть более новые данные';
    badge.style.cssText = 'position:absolute;top:-4px;right:-4px;width:16px;height:16px;background:#ff9800;border-radius:50%;font-size:10px;font-weight:900;color:#000;display:flex;align-items:center;justify-content:center;z-index:10;pointer-events:none;animation:badgePop 0.3s cubic-bezier(.34,1.56,.64,1) both';
    profileBtn.appendChild(badge);
  });

  window.addEventListener('backup:sync:ready', (e) => {
    if (['auto_restore', 'cloud_not_newer', 'user_skipped_restore'].includes(e.detail?.reason)) {
      document.querySelectorAll('.cloud-newer-badge').forEach(b => b.remove());
    }
  });
}

// Вызываем сразу при импорте модуля — один раз за время жизни страницы
_initBadgeListeners();

export const renderProfileShell = ({ container: c, profile: p, tokens: tk, totalFull: tF, totalSec: tS, streak: strk, achCount: aC }) => {
