// UID.044_(ListenerProfile core)_(развить Личный кабинет до профиля вкуса пользователя)_(future интеграция через scripts/intel/listener/listener-profile.js)
// UID.047_(Feature affinity)_(показывать продуктовые привычки пользователя)_(future profile insights рендерить отдельным intel-ui слоем)
// UID.048_(Time profile)_(добавить temporal portrait пользователя)_(future profile view сможет показывать morning/night/weekend patterns через intel insights)
// UID.049_(Behavior archetype)_(дать human-readable портрет слушателя)_(profile shell должен уметь принять explorer/repeater/lyrics-focused archetype без собственной логики расчёта)
// UID.056_(Recommendation reasons)_(объяснять рекомендации прямо в профиле)_(recs tab и insights blocks должны уметь показывать why-this-track/why-this-user-fit)
// UID.063_(Profile recs tab upgrade)_(сделать вкладку Для Вас умной)_(future recs брать из scripts/intel/recs/recommendation-engine.js)
// UID.070_(Linked providers)_(показывать связанные Яндекс/Google/VK аккаунты как части одного профиля)_(future identity UI связать с scripts/intel/providers/provider-identity.js)
// UID.072_(Provider consents)_(показывать и управлять разрешениями пользователя)_(profile станет главным UI для consent toggles, а не местом их хранения)
// UID.073_(Hybrid sync orchestrator)_(сделать профиль центром управления sync roles)_(primary/mirror/social roles должны быть видимы отсюда)
// UID.082_(Local truth vs external telemetry split)_(profile insights/recs не должны сами экспортировать raw user profile)_(наружу только mapper/consent-safe layer)
import { createProfileAchievementsView } from './achievements-view.js';
import { renderProfileStats } from './stats-view.js';
import { renderProfileRecs } from './recs-view.js';
import { renderProfileLogs } from './logs-view.js';
import { bindProfileActions } from './actions.js';
import { bindProfileLiveBindings } from './live-bindings.js';
import { loadProfileModel } from './model.js';
import { renderProfileShell } from './render-shell.js';

export const loadProfileView = async (ctx) => {
  ctx.renderAlbumTitle('👤 ЛИЧНЫЙ КАБИНЕТ 👤', 'profile');
  document.getElementById('cover-wrap').style.display = 'none';
  const c = document.getElementById('track-list'); if (!c) return;

  const { metaDB, cloudSync, all, ach, streak, profile, totalFull, totalSec, tokens } = await loadProfileModel();
  renderProfileShell({ container: c, profile, tokens, totalFull, totalSec, streak, achCount: Object.keys(ach).length });

  const nInp = c.querySelector('#prof-name-inp');
  if (nInp) {
    nInp.onblur = async () => { profile.name = nInp.value.trim() || 'Слушатель'; metaDB && await metaDB.setGlobal('user_profile', profile).catch(()=>{}); window.NotificationSystem?.success('Имя сохранено'); };
    nInp.onkeydown = e => e.key === 'Enter' && nInp.blur();
  }

  const achView = createProfileAchievementsView({ ctx, container: c.querySelector('#prof-ach-list'), engine: window.achievementEngine });
  achView.render('available');

  renderProfileStats({ container: c, all });
  renderProfileRecs({ container: c, all });
  setTimeout(() => { renderProfileLogs({ container: c, metaDB }); window.AlbumsManager?.highlightCurrentTrack?.(); }, 120);

  bindProfileLiveBindings({ ctx, getContainer: () => document.getElementById('track-list'), achView });
  bindProfileActions({ ctx, container: c, achView, profile, metaDB, cloudSync, tokens, reloadProfile: () => loadProfileView(ctx) });

  if (sessionStorage.getItem('jumpToAch')) {
    sessionStorage.removeItem('jumpToAch');
    setTimeout(() => {
      if (window.Intel_CarouselFlat) {
        window.Intel_CarouselFlat.jumpTo(1); // 1 = Индекс карточки "Достижения"
        window.Intel_CarouselFlat.selectCurrent();
        setTimeout(() => c.querySelector('.ach-classic-tab[data-filter="available"]')?.click(), 50);
      }
    }, 150);
  }
};
export default { loadProfileView };
