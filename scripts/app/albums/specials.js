import { loadAndRenderNewsInline } from '../../ui/news-inline.js';
import { injectOfflineIndicators } from '../../ui/offline-indicators.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';
const FAV_COVER = 'img/Fav_logo.png';
const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');

export async function loadFavoritesAlbum(ctx) {
  ctx.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');
  document.getElementById('cover-wrap').style.display = 'none';
  const c = document.getElementById('track-list');
  if (!c) return;

  const rb = () => {
    const pc = window.playerCore; if (!pc) return;
    const { active = [], inactive = [] } = pc.getFavoritesState() || {};
    const it = [...active.map(i => ({...i, act: 1})), ...inactive.map(i => ({...i, act: 0}))];
    const pb = document.getElementById('lyricsplayerblock'), hp = pb && c.contains(pb);

    if (!it.length) {
      c.innerHTML = `<div class="fav-empty"><h3>Избранные треки</h3><p>Отметьте треки звёздочкой ⭐</p></div>`;
      if (hp) c.appendChild(pb);
      return;
    }

    c.innerHTML = it.map((x, i) => {
      const t = window.TrackRegistry?.getTrackByUid(x.uid) || { title: 'Загрузка...', sourceAlbum: x.sourceAlbum };
      const aT = window.TrackRegistry?.getAlbumTitle(t.sourceAlbum) || window.albumsIndex?.find(a => a.key === t.sourceAlbum)?.title || 'Альбом';
      return `<div class="track ${x.act?'':'inactive'}" id="${esc(`fav_${x.sourceAlbum}_${x.uid}`)}" data-index="${i}" data-album="${esc(t.sourceAlbum)}" data-uid="${esc(x.uid)}"><div class="tnum">${String(i+1).padStart(2,'0')}.</div><div class="track-title" title="${esc(t.title)} - ${esc(aT)}"><span class="fav-track-name">${esc(t.title)}</span><span class="fav-album-name"> — ${esc(aT)}</span></div><img src="${x.act?'img/star.png':'img/star2.png'}" class="like-star" alt="звезда" data-album="${esc(t.sourceAlbum)}" data-uid="${esc(x.uid)}"></div>`;
    }).join('');

    if (hp) { const r = c.querySelector(`.track[data-uid="${CSS.escape(pc.getCurrentTrackUid?.()||'')}"]`) || c.lastElementChild; r ? r.after(pb) : c.appendChild(pb); }
    injectOfflineIndicators(c);
  };

  if (!ctx._favB) {
    ctx._favB = 1;
    c.addEventListener('click', e => {
      if (ctx.getCurrentAlbum() !== FAV) return;
      const r = e.target.closest('.track'); if (!r) return;
      const u = r.dataset.uid, aK = r.dataset.album, pc = window.playerCore, isA = pc.getFavoritesState().active.some(x => x.uid === u);
      
      if (e.target.classList.contains('like-star')) { e.preventDefault(); e.stopPropagation(); isA ? pc.toggleFavorite(u, { source: 'favorites', albumKey: aK }) : pc.restoreInactive(u); return; }
      
      if (isA) {
        ctx.setPlayingAlbum(FAV);
        const tr = pc.getFavoritesState().active.map(i => ({ ...(window.TrackRegistry?.getTrackByUid(i.uid) || {}), uid: i.uid, album: 'Избранное', cover: FAV_COVER, sourceAlbum: i.sourceAlbum }));
        const idx = tr.findIndex(t => t.uid === u);
        if (idx >= 0) { pc.setPlaylist(tr, idx, { artist: 'Витрина Разбита', album: 'Избранное', cover: FAV_COVER }, { preservePosition: false }); pc.play(idx); ctx.highlightCurrentTrack(-1, { uid: u, albumKey: aK }); window.PlayerUI?.ensurePlayerBlock?.(idx, { userInitiated: true }); window.PlayerUI?.updateAvailableTracksForPlayback?.(); }
      } else pc.showInactiveFavoriteModal({ uid: u, title: window.TrackRegistry?.getTrackByUid(u)?.title || 'Трек', onDeleted: () => { rb(); window.PlayerUI?.updateAvailableTracksForPlayback?.(); } });
    });

    window.playerCore?.onFavoritesChanged(() => {
      if (ctx.getCurrentAlbum() === FAV) {
        rb(); const pc = window.playerCore;
        if (pc && ctx.getPlayingAlbum?.() === FAV) {
          const aT = pc.getFavoritesState().active.map(i => ({ ...(window.TrackRegistry?.getTrackByUid(i.uid) || {}), uid: i.uid, album: 'Избранное', cover: FAV_COVER, sourceAlbum: i.sourceAlbum }));
          if (aT.length) pc.originalPlaylist = aT;
        }
        window.PlayerUI?.updateAvailableTracksForPlayback?.();
      }
    });
  }
  rb();
}

export async function loadShowcaseAlbum(ctx) {
  ctx.renderAlbumTitle('Витрина Разбита', 'showcase');
  document.getElementById('cover-wrap').style.display = 'none';
  if (window.ShowcaseManager) await window.ShowcaseManager.renderTab();
}

export async function loadNewsAlbum(ctx) {
  ctx.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
  document.getElementById('cover-wrap').style.display = 'none';
  if (window.GalleryManager?.clear) window.GalleryManager.clear();

  const social = document.getElementById('social-links');
  if (social) {
    social.innerHTML = `
      <a href="https://music.yandex.ru/artist/24739002?utm_source=web&utm_medium=copy_link" target="_blank" rel="noopener noreferrer">YouTube</a>
      <a href="https://t.me/vitrina_razbita" target="_blank" rel="noopener noreferrer">Telegram</a>
      <a href="https://vk.com/public165137" target="_blank" rel="noopener noreferrer">VK</a>
      <a href="https://www.tiktok.com/" target="_blank" rel="noopener noreferrer">TikTok</a>
    `;
  }

  const c = document.getElementById('track-list');
  if (c) await loadAndRenderNewsInline(c);
}

export async function loadProfileAlbum(ctx) {
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
  tpl.querySelector('.profile-header').insertAdjacentHTML('afterend', `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:12px;display:flex;justify-content:space-between;align-items:center;margin-top:10px"><div><div style="font-size:13px;font-weight:bold;color:#fff">Приоритет источника</div><div style="font-size:11px;color:#888">Моментальный резерв включен всегда</div></div><div style="display:flex;background:rgba(0,0,0,0.3);border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)"><button data-src="yandex" style="all:unset;cursor:pointer;padding:6px 12px;font-size:12px;font-weight:bold;transition:.2s;color:${ps==='yandex'?'#fff':'#666'};background:${ps==='yandex'?'radial-gradient(circle, #cc0000 0%, #880000 100%)':'transparent'}">Yandex</button><button data-src="github" style="all:unset;cursor:pointer;padding:6px 12px;font-size:12px;font-weight:bold;transition:.2s;color:${ps==='github'?'#fff':'#666'};background:${ps==='github'?'radial-gradient(circle, #444 0%, #000 100%)':'transparent'}">GitHub</button></div></div>`);
  
  tpl.querySelector('#prof-stat-tracks').textContent = tFull;
  tpl.querySelector('#prof-stat-time').textContent = window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(tSec) : `${Math.floor(tSec/60)}м`;
  tpl.querySelector('#prof-stat-streak').textContent = stk;
  tpl.querySelector('#prof-stat-ach').textContent = Object.keys(ach).length;
  cont.appendChild(tpl);

  const nInp = cont.querySelector('#prof-name-inp');
  if (nInp) { nInp.onblur = async () => { up.name = nInp.value.trim() || 'Слушатель'; mDB && await mDB.setGlobal('user_profile', up).catch(()=>{}); window.NotificationSystem?.success('Имя сохранено'); }; nInp.onkeydown = e => e.key === 'Enter' && nInp.blur(); }

  const achEl = cont.querySelector('#prof-ach-list');
  const rAch = (f) => {
    if (!achEl || !eng?.achievements) return;
    const it = eng.achievements.filter(a => f === 'secret' ? a.isHidden : (f === 'done' ? a.isUnlocked : (f === 'available' ? !a.isUnlocked && !a.isHidden : (!a.isHidden || a.isUnlocked))));
    achEl.innerHTML = it.length ? it.map(a => `<div class="ach-item ${a.isUnlocked ? 'done' : ''}" data-ach="${a.id}"><div class="ach-top"><div class="ach-title" style="color:${a.isUnlocked ? '#fff' : (a.color || '#fff')}">${a.icon} ${a.name}</div></div><div class="ach-sub">${a.isUnlocked && a.unlockedAt ? `Открыто: ${new Date(a.unlockedAt).toLocaleDateString()}` : (a.isHidden ? 'Откроется при особых условиях' : a.short)}</div>${(!a.isUnlocked && !a.isHidden && a.progress) ? `<div class="ach-progress"><div class="ach-mini-bar"><div class="ach-mini-fill" style="width:${a.progress.pct}%"></div></div></div>` : ``}<div class="ach-bottom"><div class="ach-xp">${a.isUnlocked ? `+${a.xpReward} XP` : (a.isHidden ? `Секретное` : `${a.xpReward} XP`)}</div><div class="ach-remaining">${(!a.isUnlocked && !a.isHidden && a.progress) ? `Осталось: ${Math.max(0, a.progress.target - a.progress.current)}` : ``}</div><button class="ach-more" type="button">Подробнее</button></div><div class="ach-details" style="display:none"><div class="ach-details-title">Как выполнить</div><div class="ach-details-how">${a.howTo || 'Выполните условия.'}</div>${a.desc ? `<div class="ach-details-desc">${a.desc}</div>` : ''}</div></div>`).join('') : '<div class="fav-empty">По данному фильтру ничего нет</div>';
  };
  rAch('all');

  const ttEl = cont.querySelector('#prof-top-tracks');
  if (ttEl) {
    const vs = all.filter(s => s.uid !== 'global');
    const mkL = (arr, fn) => arr.length ? `<ul class="stat-list">${arr.map(s => `<li><span>${esc(window.TrackRegistry?.getTrackByUid(s.uid)?.title)}</span><span>${fn(s)}</span></li>`).join('')}</ul>` : `<div class="stat-sub" style="color:#888;font-size:12px;text-align:center">Недостаточно данных</div>`;
    const rCh = (id, tit, d, lsk, lb) => `<div class="chart-block" id="${id}"><div class="chart-title" style="cursor:pointer" data-tg="${id}-bars" data-ls="${lsk}">${tit}</div><div class="chart-bars" id="${id}-bars" ${localStorage.getItem(lsk)==='0'?'style="display:none"':''}>${d.map((v, i) => `<div class="chart-row"><div class="label">${lb?lb[i]:String(i).padStart(2,'0')}</div><div class="bar"><div class="fill" style="width:${Math.round((v/Math.max(1,...d))*100)}%"></div></div><div class="val">${v}</div></div>`).join('')}</div></div>`;
    
    const byH = Array(24).fill(0), byW = Array(7).fill(0);
    vs.forEach(s => { (s.byHour||[]).forEach((v,h)=>byH[h]+=v||0); (s.byWeekday||[]).forEach((v,d)=>byW[d]+=v||0); });
    
    ttEl.innerHTML = rCh('chart-hours', 'По часам суток', byH, 'myStatsHoursOpen') + rCh('chart-week', 'По дням недели', byW, 'myStatsWeekOpen', ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']) + `<div class="stat-card" style="margin-bottom:10px"><div class="stat-title">Топ‑5 по прослушиваниям</div>${mkL([...vs].sort((a,b)=>(b.globalValidListenCount||0)-(a.globalValidListenCount||0)).slice(0,5), s=>s.globalValidListenCount||0)}</div><div class="stat-card" style="margin-bottom:15px"><div class="stat-title">Топ‑5 по времени</div>${mkL([...vs].sort((a,b)=>(b.globalListenSeconds||0)-(a.globalListenSeconds||0)).slice(0,5), s=>window.Utils?.fmt?.durationHuman(s.globalListenSeconds||0))}</div><div style="display:flex;justify-content:center;margin-top:8px"><button class="backup-btn" id="stats-reset-open-btn" style="background:#444" type="button">ОЧИСТИТЬ СТАТИСТИКУ</button></div>`;
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

  if (!ctx._profBound) {
    ctx._profBound = true;
    cont.addEventListener('click', e => {
      const t = e.target, c = s => t.closest(s); let el;
      if (el = c('.profile-tab-btn')) { cont.querySelectorAll('.profile-tab-btn, .profile-tab-content').forEach(x => x.classList.remove('active')); el.classList.add('active'); cont.querySelector(`#tab-${el.dataset.tab}`)?.classList.add('active'); }
      else if (el = c('.ach-classic-tab')) { cont.querySelectorAll('.ach-classic-tab').forEach(x => x.classList.remove('active')); el.classList.add('active'); rAch(el.dataset.filter); }
      else if (el = c('.ach-more') || c('.ach-main')) { const d = el.closest('.ach-item')?.querySelector('.ach-details'), b = el.closest('.ach-item')?.querySelector('.ach-more'); if (d) { const h = d.style.display === 'none'; d.style.display = h ? 'block' : 'none'; if (b) b.textContent = h ? 'Свернуть' : 'Подробнее'; } }
      else if (el = c('.chart-title')) { const b = cont.querySelector('#'+el.dataset.tg); if(b) { const v = b.style.display !== 'none'; b.style.display = v ? 'none' : ''; localStorage.setItem(el.dataset.ls, v ? '0' : '1'); } }
      else if (el = c('.auth-btn')) { const id = el.dataset.auth; if (tks[id]) id==='yandex'&&cSync?.sync?cSync.sync(id):window.NotificationSystem?.info('Синхронизация...'); else id==='yandex'&&cSync?.auth?cSync.auth(id):window.NotificationSystem?.info('Недоступно'); }
      else if (c('#prof-avatar-btn')) { const av = ['😎','🎧','🎸','🦄','🦇','👽','🤖','🐱','🦊','🐼','🔥','💎'], m = window.Modals.open({title:'Аватар',bodyHtml:`<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center">${av.map(a=>`<button class="showcase-color-dot" style="font-size:24px;background:#232b38" data-ava="${a}">${a}</button>`).join('')}</div>`}); m.onclick = async ev => { const b = ev.target.closest('[data-ava]'); if(b) { up.avatar = b.dataset.ava; cont.querySelector('#prof-avatar-btn').textContent = b.dataset.ava; mDB && await mDB.setGlobal('user_profile', up).catch(()=>{}); m.remove(); } }; }
      else if (c('#prof-name-edit')) cont.querySelector('#prof-name-inp')?.focus();
      else if (el = c('[data-src]')) { if (['yandex','github'].includes(el.dataset.src)) { localStorage.setItem('sourcePref', el.dataset.src); window.TrackRegistry?.resetSourceCache?.(); window.TrackRegistry?.ensurePopulated?.().catch(()=>{}); window.NotificationSystem?.success(`Приоритет: ${el.dataset.src}`); loadProfileAlbum(ctx); } }
      else if (el = c('.rec-play-btn')) { window.ShowcaseManager?.playContext?.(el.dataset.playuid); window.NotificationSystem?.info('Запуск рекомендации'); }
      else if (c('#stats-reset-open-btn') && window.Modals?.confirm) { const m = window.Modals.confirm({title:'Очистка',textHtml:`<button class="om-btn om-btn--outline" style="width:100%;margin-bottom:8px" data-act="stats">Только статистику</button><button class="om-btn om-btn--outline" style="width:100%;margin-bottom:8px" data-act="ach">Только достижения</button><button class="om-btn om-btn--danger" style="width:100%" data-act="all">Сбросить всё</button>`,confirmText:'Закрыть',cancelText:'Отмена'}); m.onclick = async ev => { const act = ev.target.closest('.om-btn')?.dataset?.act; if(!act)return; if(act==='stats') await mDB.tx('stats','readwrite',s=>s.clear()); else if(act==='ach') { await mDB.setGlobal('unlocked_achievements',{}); await mDB.setGlobal('user_profile_rpg',{xp:0,level:1}); } else if(act==='all') { await mDB.tx('stats','readwrite',s=>s.clear()); await mDB.setGlobal('unlocked_achievements',{}); await mDB.setGlobal('user_profile_rpg',{xp:0,level:1}); await mDB.setGlobal('global_streak',{current:0,longest:0}); } window.location.reload(); }; }
    });
  }
}
