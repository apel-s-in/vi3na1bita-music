import { createProfileAchievementsView } from './achievements-view.js';
import { renderProfileStats } from './stats-view.js';
import { renderProfileRecs } from './recs-view.js';
import { renderProfileLogs } from './logs-view.js';
import { bindProfileActions } from './actions.js';
import { bindProfileLiveBindings } from './live-bindings.js';
import { loadProfileModel } from './model.js';
import { renderProfileShell } from './render-shell.js';

export async function loadProfileView(ctx) {
  ctx.renderAlbumTitle('👤 ЛИЧНЫЙ КАБИНЕТ 👤', 'profile');
  document.getElementById('cover-wrap').style.display = 'none';
  const cont = document.getElementById('track-list');
  if (!cont) return;

  const { metaDB, cloudSync, all, ach, streak, profile, totalFull, totalSec, tokens } = await loadProfileModel();
  const eng = window.achievementEngine;

  renderProfileShell({
    container: cont,
    profile,
    tokens,
    totalFull,
    totalSec,
    streak,
    achCount: Object.keys(ach).length
  });

  const nInp = cont.querySelector('#prof-name-inp');
  if (nInp) {
    nInp.onblur = async () => {
      profile.name = nInp.value.trim() || 'Слушатель';
      metaDB && await metaDB.setGlobal('user_profile', profile).catch(()=>{});
      window.NotificationSystem?.success('Имя сохранено');
    };
    nInp.onkeydown = e => e.key === 'Enter' && nInp.blur();
  }

  const achView = createProfileAchievementsView({ ctx, container: cont.querySelector('#prof-ach-list'), engine: eng });
  achView.render('all');

  renderProfileStats({ container: cont, all });
  renderProfileRecs({ container: cont, all });
  setTimeout(() => { renderProfileLogs({ container: cont, metaDB }); }, 100);

  bindProfileLiveBindings({
    ctx,
    getContainer: () => document.getElementById('track-list'),
    achView
  });

  bindProfileActions({
    ctx,
    container: cont,
    achView,
    profile,
    metaDB,
    cloudSync,
    tokens,
    reloadProfile: () => loadProfileView(ctx)
  });
}

export default { loadProfileView };
