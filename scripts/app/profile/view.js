// UID.044_(ListenerProfile core)_(развить Личный кабинет до профиля вкуса пользователя)_(future интеграция через scripts/intel/listener/listener-profile.js) UID.047_(Feature affinity)_(показывать продуктовые привычки пользователя)_(future profile insights рендерить отдельным intel-ui слоем) UID.048_(Time profile)_(добавить temporal portrait пользователя)_(future profile view сможет показывать morning/night/weekend patterns через intel insights) UID.049_(Behavior archetype)_(дать human-readable портрет слушателя)_(profile shell должен уметь принять explorer/repeater/lyrics-focused archetype без собственной логики расчёта) UID.056_(Recommendation reasons)_(объяснять рекомендации прямо в профиле)_(recs tab и insights blocks должны уметь показывать why-this-track/why-this-user-fit) UID.063_(Profile recs tab upgrade)_(сделать вкладку Для Вас умной)_(future recs брать из scripts/intel/recs/recommendation-engine.js) UID.070_(Linked providers)_(показывать связанные Яндекс/Google/VK аккаунты как части одного профиля)_(future identity UI связать с scripts/intel/providers/provider-identity.js) UID.072_(Provider consents)_(показывать и управлять разрешениями пользователя)_(profile станет главным UI для consent toggles, а не местом их хранения) UID.073_(Hybrid sync orchestrator)_(сделать профиль центром управления sync roles)_(primary/mirror/social roles должны быть видимы отсюда) UID.082_(Local truth vs external telemetry split)_(profile insights/recs не должны сами экспортировать raw user profile)_(наружу только mapper/consent-safe layer)
import { createProfileAchievementsView } from './achievements-view.js';
import { loadProfileModel } from './model.js';
import { renderProfileShell } from './render-shell.js';
import { renderProfileTabsData } from './profile-tab-renderers.js';
import { bindProfileTabControllers } from './profile-tab-bindings.js';
import { initYandexActions } from './yandex-actions.js';

export const refreshProfileViewSoft = async (ctx) => {
  const c = document.getElementById('track-list'); if (!c) return false;
  if (ctx.getCurrentAlbum?.() !== (window.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__')) return false;
  try {
    const { metaDB, all, ach, streak, profile, totalFull, totalSec, tokens } = await loadProfileModel();
    const authRoot = c.querySelector('#prof-auth-grid');
    if (authRoot) {
      const { renderYandexAuthBlock } = await import('./yandex-auth-view.js');
      renderYandexAuthBlock({ root: authRoot, localProfile: profile });
    }
    const statTracks = c.querySelector('#prof-stat-tracks'); if (statTracks) statTracks.textContent = String(totalFull || 0);
    const statTime = c.querySelector('#prof-stat-time'); if (statTime) statTime.textContent = window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(totalSec || 0) : `${Math.floor((totalSec || 0) / 60)}м`;
    const statStreak = c.querySelector('#prof-stat-streak'); if (statStreak) statStreak.textContent = String(streak || 0);
    const statAch = c.querySelector('#prof-stat-ach'); if (statAch) statAch.textContent = String(Object.keys(ach || {}).length);
    const profName = c.querySelector('#prof-name-inp'); if (profName) profName.value = profile?.name || 'Слушатель';
    const profAvatar = c.querySelector('#prof-avatar-btn'); if (profAvatar) profAvatar.textContent = profile?.avatar || '😎';
    const sinceEl = c.querySelector('#prof-meta-since'); if (sinceEl) sinceEl.textContent = `📅 Слушаю с: ${profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('ru-RU') : (localStorage.getItem('app:first-install-ts') ? new Date(Number(localStorage.getItem('app:first-install-ts'))).toLocaleDateString('ru-RU') : '—')}`;
    const daysEl = c.querySelector('#prof-meta-days'); if (daysEl) {
      const baseTs = Number(profile?.createdAt || localStorage.getItem('app:first-install-ts') || 0);
      daysEl.textContent = `🎵 Дней с нами: ${baseTs > 0 ? Math.max(0, Math.floor((Date.now() - baseTs) / 86400000)) : 0}`;
    }
    const lvlEl = c.querySelector('#prof-meta-level'); if (lvlEl) lvlEl.textContent = `⭐ Уровень: ${window.achievementEngine?.profile?.level || 1}`;
    return true;
  } catch (e) {
    console.warn('[Profile] soft refresh failed:', e);
    return false;
  }
};

export const loadProfileView = async (ctx) => {
  ctx.renderAlbumTitle('👤 ЛИЧНЫЙ КАБИНЕТ 👤', 'profile');
  initYandexActions();
  const cw = document.getElementById('cover-wrap'); if (cw) cw.style.display = 'none';
  const c = document.getElementById('track-list'); if (!c) return;

  const { metaDB, all, ach, streak, profile, totalFull, totalSec, tokens } = await loadProfileModel();
  try {
    renderProfileShell({ container: c, profile, tokens, totalFull, totalSec, streak, achCount: Object.keys(ach).length });
  } catch (e) {
    console.error('[Profile] render shell failed:', e);
    c.innerHTML = `<div class="fav-empty">Ошибка загрузки личного кабинета</div>`;
    return;
  }

  const syncCarouselAccountCard = () => {
    const card = c.querySelector('.sc-3d-card[data-id="account"]'), tit = card?.querySelector('.sc-3d-tit'), ic = card?.querySelector('.sc-3d-ic');
    if (tit) tit.textContent = profile.name && profile.name !== 'Слушатель' ? profile.name : 'Аккаунт';
    if (ic) ic.textContent = profile.avatar && profile.avatar !== '😎' ? profile.avatar : '👤';
  };
  syncCarouselAccountCard();

  const achView = createProfileAchievementsView({ ctx, container: c.querySelector('#prof-ach-list'), engine: window.achievementEngine });
  achView.render('available');

  await renderProfileTabsData({ container: c, all, metaDB });

  bindProfileTabControllers({ ctx, container: c, achView, profile, metaDB, tokens, onProfileChanged: syncCarouselAccountCard, reloadProfile: async () => { try { await refreshProfileViewSoft(ctx); } catch {} } });

  if (sessionStorage.getItem('jumpToAch')) {
    sessionStorage.removeItem('jumpToAch');
    setTimeout(() => { if (window.Intel_CarouselFlat) { window.Intel_CarouselFlat.jumpTo(['account','stats','achievements','recs','logs','settings'].indexOf('achievements') >= 0 ? 2 : 2); window.Intel_CarouselFlat.selectCurrent(); setTimeout(() => c.querySelector('.ach-classic-tab[data-filter="available"]')?.click(), 50); } }, 150);
  }
};
export default { loadProfileView };
