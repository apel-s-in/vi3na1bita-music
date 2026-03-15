import { createProfileAchievementsView } from './achievements-view.js';
import { renderProfileStats } from './stats-view.js';
import { renderProfileRecs } from './recs-view.js';
import { renderProfileLogs } from './logs-view.js';
import { bindProfileActions } from './actions.js';

const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');

export async function loadProfileView(ctx) {
  ctx.renderAlbumTitle('👤 ЛИЧНЫЙ КАБИНЕТ 👤', 'profile');
  document.getElementById('cover-wrap').style.display = 'none';
  const cont = document.getElementById('track-list');
  if (!cont) return;

  let mDB, cSync, all = [], ach = {}, stk = 0, up = { name: 'Слушатель', avatar: '😎' };
  try {
    const [dbM, csM] = await Promise.all([import('../../analytics/meta-db.js'), import('../../analytics/cloud-sync.js')]);
    mDB = dbM.metaDB; cSync = csM.cloudSync;
    const r = await Promise.all([mDB.getAllStats(), mDB.getGlobal('unlocked_achievements'), mDB.getGlobal('global_streak'), mDB.getGlobal('user_profile')].map(p => p.catch(()=>null)));
    all = r[0] || [];
    ach = r[1]?.value || {};
    stk = r[2]?.value?.current || 0;
    up = r[3]?.value || up;
  } catch (e) { console.error('[Profile] init err:', e); }

  let tFull = 0, tSec = 0;
  all.forEach(s => { tFull += s.globalFullListenCount || 0; tSec += s.globalListenSeconds || 0; });

  const eng = window.achievementEngine;
  const tks = JSON.parse(localStorage.getItem('cloud_tokens') || '{}');
  const ab = (id, n, ic) => `<button class="auth-btn ${id} ${tks[id] ? 'connected' : ''}" data-auth="${id}"><span>${ic}</span> ${tks[id] ? 'Подключено' : n}</button>`;

  cont.innerHTML = '';
  const tpl = document.getElementById('profile-template').content.cloneNode(true);
  tpl.querySelector('#prof-avatar-btn').textContent = up.avatar;
  tpl.querySelector('#prof-name-inp').value = esc(up.name);
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

  tpl.querySelector('#prof-stat-tracks').textContent = tFull;
  tpl.querySelector('#prof-stat-time').textContent = window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(tSec) : `${Math.floor(tSec/60)}м`;
  tpl.querySelector('#prof-stat-streak').textContent = stk;
  tpl.querySelector('#prof-stat-ach').textContent = Object.keys(ach).length;
  cont.appendChild(tpl);

  const nInp = cont.querySelector('#prof-name-inp');
  if (nInp) {
    nInp.onblur = async () => {
      up.name = nInp.value.trim() || 'Слушатель';
      mDB && await mDB.setGlobal('user_profile', up).catch(()=>{});
      window.NotificationSystem?.success('Имя сохранено');
    };
    nInp.onkeydown = e => e.key === 'Enter' && nInp.blur();
  }

  const achView = createProfileAchievementsView({ ctx, container: cont.querySelector('#prof-ach-list'), engine: eng });
  achView.render('all');

  renderProfileStats({ container: cont, all });
  renderProfileRecs({ container: cont, all });
  setTimeout(() => { renderProfileLogs({ container: cont, metaDB: mDB }); }, 100);

  if (!ctx._profLiveAchBound) {
    ctx._profLiveAchBound = true;
    window.addEventListener('analytics:liveTick', () => {
      if (ctx.getCurrentAlbum?.() !== (window.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__')) return;
      const activeTab = cont.querySelector('#tab-achievements.active');
      if (!activeTab || !cont.isConnected) return;
      achView.updateLiveNodes();
    });
    window.addEventListener('achievements:updated', () => {
      if (ctx.getCurrentAlbum?.() !== (window.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__')) return;
      const activeTab = cont.querySelector('#tab-achievements.active');
      if (!activeTab || !cont.isConnected) return;
      achView.render(ctx._achCurrentFilter || 'all');
    });
  }

  bindProfileActions({
    ctx,
    container: cont,
    achView,
    profile: up,
    metaDB: mDB,
    cloudSync: cSync,
    tokens: tks,
    reloadProfile: () => loadProfileView(ctx)
  });
}

export default { loadProfileView };
