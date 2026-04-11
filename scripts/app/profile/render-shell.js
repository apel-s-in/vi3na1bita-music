// UID.044_(ListenerProfile core)_(подготовить профиль к встраиванию user-intelligence блоков)_(render-shell остаётся legacy host, принимающим optional intel fragments) UID.056_(Recommendation reasons)_(позже принимать explainable rec fragments без knowledge об их расчёте)_(shell только размещает future blocks, но не считает причины) UID.070_(Linked providers)_(показывать provider shell-поверхность без владения identity truth)_(render-shell рендерит auth/provider area, но данные linked accounts приходят извне) UID.072_(Provider consents)_(shell должен уметь принять consent UI блоки)_(но не хранить и не вычислять consent state самостоятельно) UID.073_(Hybrid sync orchestrator)_(shell станет host для sync-role/status block)_(но orchestration logic останется в intel/providers layer) UID.082_(Local truth vs external telemetry split)_(shell не должен экспортировать profile/raw insights сам)_(это только layout/render host) UID.094_(No-paralysis rule)_(profile shell обязан работать без intel fragments)_(если intelligent blocks отсутствуют, legacy profile UI остаётся полноценным) UID.095_(Ownership boundary: legacy vs intel)_(жёстко закрепить render-shell как legacy-shell, принимающий optional intel fragments)_(layout/profile navigation/stat shell здесь, а listener/recs/providers/community insights приходят как надстройка)
import { mountProfileCarouselFlat } from './carousel-flat.js';
import { renderProfileSettings } from './settings-view.js';
import { getProfileTemplateHtml } from './template.js';
import { renderYandexAuthBlock } from './yandex-auth-view.js';

export const renderProfileShell = ({ container: c, profile: p, tokens: tk, totalFull: tF, totalSec: tS, streak: strk, achCount: aC }) => {
  if (!c) return null;
  c.innerHTML = getProfileTemplateHtml();
  const $ = s => c.querySelector(s);

  if ($('#prof-avatar-btn')) $('#prof-avatar-btn').textContent = p.avatar || '😎';
  if ($('#prof-name-inp')) $('#prof-name-inp').value = p.name || 'Слушатель';

  const renderAuthBlock = () => renderYandexAuthBlock({ root: $('#prof-auth-grid'), localProfile: p });

  renderAuthBlock();

  // AbortController — чистый unmount listener при повторном рендере профиля
  window.__yaAuthAC?.abort();
  window.__yaAuthAC = new AbortController();
  window.addEventListener('yandex:auth:changed', renderAuthBlock, { signal: window.__yaAuthAC.signal });

  if (window.YandexAuth?.getSessionStatus?.() === 'active' && !sessionStorage.getItem('ya:auto-check:done')) {
    sessionStorage.setItem('ya:auto-check:done', '1');
    setTimeout(() => window._handleYaAutoSync?.(), 400);
  }

  const instTs = Number(localStorage.getItem('app:first-install-ts') || (localStorage.setItem('app:first-install-ts', String(Date.now())), Date.now()));
  if ($('#prof-meta-since')) $('#prof-meta-since').textContent = `📅 Слушаю с: ${new Date(instTs).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  if ($('#prof-meta-days')) $('#prof-meta-days').textContent = `🎵 Дней с нами: ${Math.max(1, Math.floor((Date.now() - instTs) / 86400000) + 1)}`;

  const ps = localStorage.getItem('sourcePref') === 'github' ? 'github' : 'yandex';
  if ($('#tab-account')) $('#tab-account').insertAdjacentHTML('beforeend', `<div class="prof-src-box"><div><div class="prof-src-title">Приоритет источника</div><div class="prof-src-sub">Моментальный резерв включен всегда</div></div><div class="prof-src-switch"><button data-src="yandex" class="prof-src-btn prof-src-btn--yandex ${ps === 'yandex' ? 'prof-src-btn--active' : ''}">Yandex</button><button data-src="github" class="prof-src-btn prof-src-btn--github ${ps === 'github' ? 'prof-src-btn--active' : ''}">GitHub</button></div></div>`);

  if ($('#prof-stat-tracks')) $('#prof-stat-tracks').textContent = tF;
  if ($('#prof-stat-time')) $('#prof-stat-time').textContent = window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(tS) : `${Math.floor(tS / 60)}м`;
  if ($('#prof-stat-streak')) $('#prof-stat-streak').textContent = strk;
  if ($('#prof-stat-ach')) $('#prof-stat-ach').textContent = aC;

  mountProfileCarouselFlat({ root: c });
  renderProfileSettings($('#tab-settings'));
  return c;
};
export default { renderProfileShell };
