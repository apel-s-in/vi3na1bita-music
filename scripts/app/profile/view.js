import { createProfileAchievementsView } from './achievements-view.js';

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
    all = r[0] || []; ach = r[1]?.value || {}; stk = r[2]?.value?.current || 0; up = r[3]?.value || up;
  } catch (e) { console.error('[Profile] init err:', e); }

  let tFull = 0, tSec = 0;
  all.forEach(s => { tFull += s.globalFullListenCount || 0; tSec += s.globalListenSeconds || 0; });
  const eng = window.achievementEngine, tks = JSON.parse(localStorage.getItem('cloud_tokens') || '{}');
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
  if (nInp) { nInp.onblur = async () => { up.name = nInp.value.trim() || 'Слушатель'; mDB && await mDB.setGlobal('user_profile', up).catch(()=>{}); window.NotificationSystem?.success('Имя сохранено'); }; nInp.onkeydown = e => e.key === 'Enter' && nInp.blur(); }

  const achView = createProfileAchievementsView({ ctx, container: cont.querySelector('#prof-ach-list'), engine: eng });
  achView.render('all');

  const ttEl = cont.querySelector('#prof-top-tracks');
  if (ttEl) {
    const vs = all.filter(s => s.uid !== 'global');
    window.Utils?.dom?.createStyleOnce?.('profile-stat-sub-styles', `.stat-sub{color:#888;font-size:12px;text-align:center}`);
    const mkL = (arr, fn) => arr.length ? `<ul class="stat-list">${arr.map(s => `<li><span>${esc(window.TrackRegistry?.getTrackByUid(s.uid)?.title)}</span><span>${fn(s)}</span></li>`).join('')}</ul>` : `<div class="stat-sub">Недостаточно данных</div>`;
    window.Utils?.dom?.createStyleOnce?.('profile-chart-styles', `
      .chart-title--click{cursor:pointer}
      .chart-bars--hidden{display:none}
    `);
    const rCh = (id, tit, d, lsk, lb) => `<div class="chart-block" id="${id}"><div class="chart-title chart-title--click" data-tg="${id}-bars" data-ls="${lsk}">${tit}</div><div class="chart-bars ${localStorage.getItem(lsk)==='0'?'chart-bars--hidden':''}" id="${id}-bars">${d.map((v, i) => `<div class="chart-row"><div class="label">${lb?lb[i]:String(i).padStart(2,'0')}</div><div class="bar"><div class="fill" style="width:${Math.round((v/Math.max(1,...d))*100)}%"></div></div><div class="val">${v}</div></div>`).join('')}</div></div>`;

    const byH = Array(24).fill(0), byW = Array(7).fill(0);
    vs.forEach(s => { (s.byHour||[]).forEach((v,h)=>byH[h]+=v||0); (s.byWeekday||[]).forEach((v,d)=>byW[d]+=v||0); });

    window.Utils?.dom?.createStyleOnce?.('profile-top-tracks-styles', `
      .stat-card--mb10{margin-bottom:10px}
      .stat-card--mb15{margin-bottom:15px}
      .prof-reset-wrap{display:flex;justify-content:center;margin-top:8px}
      .backup-btn--dark{background:#444}
    `);
    ttEl.innerHTML = rCh('chart-hours', 'По часам суток', byH, 'myStatsHoursOpen') + rCh('chart-week', 'По дням недели', byW, 'myStatsWeekOpen', ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']) + `<div class="stat-card stat-card--mb10"><div class="stat-title">Топ‑5 по прослушиваниям</div>${mkL([...vs].sort((a,b)=>(b.globalValidListenCount||0)-(a.globalValidListenCount||0)).slice(0,5), s=>s.globalValidListenCount||0)}</div><div class="stat-card stat-card--mb15"><div class="stat-title">Топ‑5 по времени</div>${mkL([...vs].sort((a,b)=>(b.globalListenSeconds||0)-(a.globalListenSeconds||0)).slice(0,5), s=>window.Utils?.fmt?.durationHuman(s.globalListenSeconds||0))}</div><div class="prof-reset-wrap"><button class="backup-btn backup-btn--dark" id="stats-reset-open-btn" type="button">ОЧИСТИТЬ СТАТИСТИКУ</button></div>`;
  }

  const recEl = cont.querySelector('#prof-recs-list');
  if (recEl) {
    const pd = new Set(all.filter(s => s.globalFullListenCount > 0).map(s => s.uid));
    const recs = (window.TrackRegistry?.getAllUids?.()||[]).filter(u => !pd.has(u)).sort(()=>Math.random()-.5).slice(0,4);
    recEl.innerHTML = recs.length ? recs.map(u => `<div class="profile-list-item"><div class="log-info"><div class="log-title">${esc(window.TrackRegistry?.getTrackByUid(u)?.title)}</div><div class="log-desc">${esc(window.TrackRegistry?.getTrackByUid(u)?.album)}</div></div><button class="rec-play-btn" data-playuid="${u}">▶</button></div>`).join('') : '<div class="fav-empty">Вы прослушали абсолютно всё! 🏆</div>';
  }

  setTimeout(async () => {
    const lg = cont.querySelector('#prof-logs-list'); if (!lg) return;
    try {
      const l = [...(mDB ? await mDB.getEvents('events_hot').catch(()=>[]) : []), ...(mDB ? await mDB.getEvents('events_warm').catch(()=>[]) : [])].sort((a,b)=>b.timestamp-a.timestamp).slice(0,20);
      const tM = { 'LISTEN_COMPLETE': '🎵 Прослушано', 'LISTEN_SKIP': '⏭️ Пропущено', 'ACHIEVEMENT_UNLOCK': '🏆 Достижение', 'FEATURE_USED': '🛠️ Использовано' };
      lg.innerHTML = l.length ? l.map(x => `<div class="profile-list-item"><div class="log-time">${String(new Date(x.timestamp).getHours()).padStart(2,'0')}:${String(new Date(x.timestamp).getMinutes()).padStart(2,'0')}</div><div class="log-info"><div class="log-title">${tM[x.type]||x.type}</div><div class="log-desc">${esc(x.type==='ACHIEVEMENT_UNLOCK'?`Ачивка: ${x.data?.id||''}`:(window.TrackRegistry?.getTrackByUid?.(x.uid)?.title||x.uid||''))}</div></div></div>`).join('') : '<div class="fav-empty">Журнал событий пуст</div>';
    } catch { lg.innerHTML = '<div class="fav-empty">Ошибка загрузки</div>'; }
  }, 100);

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

  if (!ctx._profBound) {
    ctx._profBound = true;
    cont.addEventListener('click', e => {
      const t = e.target, c = s => t.closest(s); let el;
      if (el = c('.profile-tab-btn')) { cont.querySelectorAll('.profile-tab-btn, .profile-tab-content').forEach(x => x.classList.remove('active')); el.classList.add('active'); cont.querySelector(`#tab-${el.dataset.tab}`)?.classList.add('active'); }
      else if (el = c('.ach-classic-tab')) { cont.querySelectorAll('.ach-classic-tab').forEach(x => x.classList.remove('active')); el.classList.add('active'); achView.render(el.dataset.filter); }
      else if (el = c('.ach-more') || c('.ach-main')) { const d = el.closest('.ach-item')?.querySelector('.ach-details'), b = el.closest('.ach-item')?.querySelector('.ach-more'); if (d) { const h = d.style.display === 'none'; d.style.display = h ? 'block' : 'none'; if (b) b.textContent = h ? 'Свернуть' : 'Подробнее'; } }
      else if (el = c('[data-ach-timer]')) achView.toggleTimerMode(el.dataset.achTimer);
      else if (el = c('.chart-title')) { const b = cont.querySelector('#'+el.dataset.tg); if(b) { const v = b.style.display !== 'none'; b.style.display = v ? 'none' : ''; localStorage.setItem(el.dataset.ls, v ? '0' : '1'); } }
      else if (el = c('.auth-btn')) { const id = el.dataset.auth; if (tks[id]) id==='yandex'&&cSync?.sync?cSync.sync(id):window.NotificationSystem?.info('Синхронизация...'); else id==='yandex'&&cSync?.auth?cSync.auth(id):window.NotificationSystem?.info('Недоступно'); }
      else if (c('#prof-avatar-btn')) { const av = ['😎','🎧','🎸','🦄','🦇','👽','🤖','🐱','🦊','🐼','🔥','💎']; window.Utils?.dom?.createStyleOnce?.('profile-avatar-picker-styles', `.prof-ava-grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}.prof-ava-btn{font-size:24px;background:#232b38}`); const m = window.Modals.open({title:'Аватар',bodyHtml:`<div class="prof-ava-grid">${av.map(a=>`<button class="showcase-color-dot prof-ava-btn" data-ava="${a}">${a}</button>`).join('')}</div>`}); m.onclick = async ev => { const b = ev.target.closest('[data-ava]'); if(b) { up.avatar = b.dataset.ava; cont.querySelector('#prof-avatar-btn').textContent = b.dataset.ava; mDB && await mDB.setGlobal('user_profile', up).catch(()=>{}); m.remove(); } }; }
      else if (c('#prof-name-edit')) cont.querySelector('#prof-name-inp')?.focus();
      else if (el = c('[data-src]')) { if (['yandex','github'].includes(el.dataset.src)) { localStorage.setItem('sourcePref', el.dataset.src); window.TrackRegistry?.resetSourceCache?.(); window.TrackRegistry?.ensurePopulated?.().catch(()=>{}); window.NotificationSystem?.success(`Приоритет: ${el.dataset.src}`); loadProfileView(ctx); } }
      else if (el = c('.rec-play-btn')) { window.ShowcaseManager?.playContext?.(el.dataset.playuid); window.NotificationSystem?.info('Запуск рекомендации'); }
      else if (c('#stats-reset-open-btn') && window.Modals?.confirm) { window.Utils?.dom?.createStyleOnce?.('profile-reset-modal-styles', `.prof-reset-btn{width:100%}.prof-reset-btn--mb{margin-bottom:8px}`); const m = window.Modals.confirm({title:'Очистка',textHtml:`<button class="om-btn om-btn--outline prof-reset-btn prof-reset-btn--mb" data-act="stats">Только статистику</button><button class="om-btn om-btn--outline prof-reset-btn prof-reset-btn--mb" data-act="ach">Только достижения</button><button class="om-btn om-btn--danger prof-reset-btn" data-act="all">Сбросить всё</button>`,confirmText:'Закрыть',cancelText:'Отмена'}); m.onclick = async ev => { const act = ev.target.closest('.om-btn')?.dataset?.act; if(!act)return; if(act==='stats') await mDB.tx('stats','readwrite',s=>s.clear()); else if(act==='ach') { await mDB.setGlobal('unlocked_achievements',{}); await mDB.setGlobal('user_profile_rpg',{xp:0,level:1}); } else if(act==='all') { await mDB.tx('stats','readwrite',s=>s.clear()); await mDB.setGlobal('unlocked_achievements',{}); await mDB.setGlobal('user_profile_rpg',{xp:0,level:1}); await mDB.setGlobal('global_streak',{current:0,longest:0}); } window.location.reload(); }; }
    });
  }
}

export default { loadProfileView };
