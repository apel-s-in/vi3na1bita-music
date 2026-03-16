// UID.044_(ListenerProfile core)_(развить Личный кабинет до профиля вкуса пользователя)_(future интеграция через scripts/intel/listener/listener-profile.js)
// UID.047_(Feature affinity)_(показывать продуктовые привычки пользователя)_(future profile insights рендерить отдельным intel-ui слоем)
// UID.063_(Profile recs tab upgrade)_(сделать вкладку Для Вас умной)_(future recs брать из scripts/intel/recs/recommendation-engine.js)
// UID.070_(Linked providers)_(показывать связанные Яндекс/Google/VK аккаунты как части одного профиля)_(future identity UI связать с scripts/intel/providers/provider-identity.js)
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
  achView.render('all');

  renderProfileStats({ container: c, all });
  renderProfileRecs({ container: c, all });
  setTimeout(() => renderProfileLogs({ container: c, metaDB }), 100);

  bindProfileLiveBindings({ ctx, getContainer: () => document.getElementById('track-list'), achView });
  bindProfileActions({ ctx, container: c, achView, profile, metaDB, cloudSync, tokens, reloadProfile: () => loadProfileView(ctx) });
};
export default { loadProfileView };
