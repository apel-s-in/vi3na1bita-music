import { loadAndRenderNewsInline } from '../../ui/news-inline.js';
import { injectOfflineIndicators } from '../../ui/offline-indicators.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';
const FAV_COVER = 'img/Fav_logo.png';
const esc = (s) => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');

export async function loadFavoritesAlbum(ctx) {
  ctx.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');
  document.getElementById('cover-wrap').style.display = 'none';
  const container = document.getElementById('track-list');
  if (!container) return;

  const rebuild = () => {
    const pc = window.playerCore;
    if (!pc) return;
    const st = pc.getFavoritesState();
    const items = [...(st.active || []).map(i => ({ ...i, active: true })), ...(st.inactive || []).map(i => ({ ...i, active: false }))];
    const pb = document.getElementById('lyricsplayerblock');
    const hasPlayer = pb && container.contains(pb);

    if (!items.length) {
      container.innerHTML = `<div class="fav-empty"><h3>Избранные треки</h3><p>Отметьте треки звёздочкой ⭐</p></div>`;
      if (hasPlayer) container.appendChild(pb);
      return;
    }

    container.innerHTML = items.map((it, i) => {
      const t = window.TrackRegistry?.getTrackByUid(it.uid) || { title: 'Загрузка...', sourceAlbum: it.sourceAlbum };
      const aTitle = window.TrackRegistry?.getAlbumTitle(t.sourceAlbum) || window.albumsIndex?.find(a => a.key === t.sourceAlbum)?.title || 'Альбом';
      return `
        <div class="track ${it.active ? '' : 'inactive'}" id="${esc(`fav_${it.sourceAlbum}_${it.uid}`)}" data-index="${i}" data-album="${esc(t.sourceAlbum)}" data-uid="${esc(it.uid)}">
          <div class="tnum">${String(i + 1).padStart(2, '0')}.</div>
          <div class="track-title" title="${esc(t.title)} - ${esc(aTitle)}">
            <span class="fav-track-name">${esc(t.title)}</span>
            <span class="fav-album-name"> — ${esc(aTitle)}</span>
          </div>
          <img src="${it.active ? 'img/star.png' : 'img/star2.png'}" class="like-star" alt="звезда" data-album="${esc(t.sourceAlbum)}" data-uid="${esc(it.uid)}">
        </div>`;
    }).join('');

    if (hasPlayer) {
      const row = container.querySelector(`.track[data-uid="${CSS.escape(pc?.getCurrentTrackUid?.() || '')}"]`) || container.lastElementChild;
      row ? row.after(pb) : container.appendChild(pb);
    }
    injectOfflineIndicators(container);
  };

  if (!ctx._favBound) {
    ctx._favBound = true;
    container.addEventListener('click', e => {
      if (ctx.getCurrentAlbum() !== FAV) return;
      const row = e.target.closest('.track');
      if (!row) return;
      
      const uid = row.dataset.uid, aKey = row.dataset.album, pc = window.playerCore;
      const isActive = pc.getFavoritesState().active.some(x => x.uid === uid);

      if (e.target.classList.contains('like-star')) {
        e.preventDefault(); e.stopPropagation();
        isActive ? pc.toggleFavorite(uid, { source: 'favorites', albumKey: aKey }) : pc.restoreInactive(uid);
        return;
      }

      if (isActive) {
        ctx.setPlayingAlbum(FAV);
        const tracks = pc.getFavoritesState().active.map(i => ({ ...(window.TrackRegistry?.getTrackByUid(i.uid) || {}), uid: i.uid, album: 'Избранное', cover: FAV_COVER, sourceAlbum: i.sourceAlbum }));
        const idx = tracks.findIndex(t => t.uid === uid);
        if (idx >= 0) {
          pc.setPlaylist(tracks, idx, { artist: 'Витрина Разбита', album: 'Избранное', cover: FAV_COVER }, { preservePosition: false });
          pc.play(idx);
          ctx.highlightCurrentTrack(-1, { uid, albumKey: aKey });
          window.PlayerUI?.ensurePlayerBlock?.(idx, { userInitiated: true });
          window.PlayerUI?.updateAvailableTracksForPlayback?.();
        }
      } else {
        pc.showInactiveFavoriteModal({ uid, title: window.TrackRegistry?.getTrackByUid(uid)?.title || 'Трек', onDeleted: () => { rebuild(); window.PlayerUI?.updateAvailableTracksForPlayback?.(); } });
      }
    });

    window.playerCore?.onFavoritesChanged(() => {
      if (ctx.getCurrentAlbum() === FAV) {
        rebuild();
        const pc = window.playerCore;
        if (pc && ctx.getPlayingAlbum?.() === FAV) {
          const activeTracks = pc.getFavoritesState().active.map(i => ({ ...(window.TrackRegistry?.getTrackByUid(i.uid) || {}), uid: i.uid, album: 'Избранное', cover: FAV_COVER, sourceAlbum: i.sourceAlbum }));
          if (activeTracks.length) pc.originalPlaylist = activeTracks;
        }
        window.PlayerUI?.updateAvailableTracksForPlayback?.();
      }
    });
  }
  
  rebuild();
}

export async function loadShowcaseAlbum(ctx) {
  ctx.renderAlbumTitle('Витрина Разбита', 'showcase');
  document.getElementById('cover-wrap').style.display = 'none';
  if (window.ShowcaseManager) await window.ShowcaseManager.renderTab();
}

export async function loadNewsAlbum(ctx) {
  ctx.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
  if (window.GalleryManager?.loadGallery) await window.GalleryManager.loadGallery(NEWS);
  document.getElementById('cover-wrap').style.display = '';
  const container = document.getElementById('track-list');
  if (container) await loadAndRenderNewsInline(container);
}

export async function loadProfileAlbum(ctx) {
  ctx.renderAlbumTitle('👤 ЛИЧНЫЙ КАБИНЕТ 👤', 'profile');
  document.getElementById('cover-wrap').style.display = 'none';
  const container = document.getElementById('track-list');
  if (!container) return;

  let metaDB = null, cloudSync = null;
  let allStats = [], achVal = {}, streakVal = { current: 0 }, upVal = { name: 'Слушатель', avatar: '😎' };

  try {
    const mDB = await import('../../analytics/meta-db.js'); metaDB = mDB.metaDB;
    const cSync = await import('../../analytics/cloud-sync.js'); cloudSync = cSync.cloudSync;

    const results = await Promise.all([
      metaDB.getAllStats().catch(()=>[]),
      metaDB.getGlobal('unlocked_achievements').catch(()=>({})),
      metaDB.getGlobal('global_streak').catch(()=>({})),
      metaDB.getGlobal('user_profile').catch(()=>({}))
    ]);
    allStats = results[0] || [];
    achVal = results[1]?.value || {};
    streakVal = results[2]?.value || { current: 0 };
    upVal = results[3]?.value || { name: 'Слушатель', avatar: '😎' };
  } catch (e) { console.error('[Profile] Ошибка инициализации:', e); }

  const totalFull = allStats.reduce((acc, s) => acc + (s.globalFullListenCount || 0), 0);
  const totalSecs = allStats.reduce((acc, s) => acc + (s.globalListenSeconds || 0), 0);
  const totalTimeStr = window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(totalSecs) : `${Math.floor(totalSecs / 60)}м`;
  const engine = window.achievementEngine;

  const tokens = JSON.parse(localStorage.getItem('cloud_tokens') || '{}');
  const renderAuthBtn = (id, name, icon) => `<button class="auth-btn ${id} ${tokens[id] ? 'connected' : ''}" data-auth="${id}"><span>${icon}</span> ${tokens[id] ? 'Подключено' : name}</button>`;

  container.innerHTML = '';
  const tpl = document.getElementById('profile-template').content.cloneNode(true);
  tpl.querySelector('#prof-avatar-btn').textContent = upVal.avatar;
  tpl.querySelector('#prof-name-inp').value = esc(upVal.name);
  tpl.querySelector('#prof-auth-grid').innerHTML = renderAuthBtn('yandex', 'Яндекс', '💽') + renderAuthBtn('google', 'Google', '☁️') + renderAuthBtn('vk', 'VK ID', '🔵');
  
  const prefSource = localStorage.getItem('sourcePref') === 'github' ? 'github' : 'yandex';
  const sourceToggle = document.createElement('div');
  sourceToggle.innerHTML = `
    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:12px; display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
      <div>
        <div style="font-size:13px; font-weight:bold; color:#fff;">Приоритет источника</div>
        <div style="font-size:11px; color:#888;">Моментальный резерв включен всегда</div>
      </div>
      <div style="display:flex; background:rgba(0,0,0,0.3); border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.1);">
        <button data-src="yandex" class="src-toggle-btn" style="all:unset; cursor:pointer; padding:6px 12px; font-size:12px; font-weight:bold; transition:0.2s; color:${prefSource==='yandex'?'#fff':'#666'}; background:${prefSource==='yandex'?'radial-gradient(circle, #cc0000 0%, #880000 100%)':'transparent'};">Yandex</button>
        <button data-src="github" class="src-toggle-btn" style="all:unset; cursor:pointer; padding:6px 12px; font-size:12px; font-weight:bold; transition:0.2s; color:${prefSource==='github'?'#fff':'#666'}; background:${prefSource==='github'?'radial-gradient(circle, #444 0%, #000 100%)':'transparent'};">GitHub</button>
      </div>
    </div>
  `;
  tpl.querySelector('.profile-header').after(sourceToggle);
  tpl.querySelector('#prof-stat-tracks').textContent = totalFull;
  tpl.querySelector('#prof-stat-time').textContent = totalTimeStr;
  tpl.querySelector('#prof-stat-streak').textContent = streakVal.current;
  tpl.querySelector('#prof-stat-ach').textContent = Object.keys(achVal).length;
  container.appendChild(tpl);

  const nameInp = container.querySelector('#prof-name-inp');
  if (nameInp) {
    nameInp.onblur = async () => {
      upVal.name = nameInp.value.trim() || 'Слушатель';
      if (metaDB) await metaDB.setGlobal('user_profile', upVal).catch(()=>{});
      window.NotificationSystem?.success('Имя сохранено');
    };
    nameInp.onkeydown = e => e.key === 'Enter' && nameInp.blur();
  }

  const achListEl = container.querySelector('#prof-ach-list');
  const renderAchievements = (filter) => {
    if (!achListEl || !engine?.achievements) return;
    let items = engine.achievements.filter(a => filter === 'secret' ? a.isHidden : (filter === 'done' ? a.isUnlocked : (filter === 'available' ? !a.isUnlocked && !a.isHidden : (!a.isHidden || a.isUnlocked))));
    
    achListEl.innerHTML = items.length ? items.map(a => {
      const p = (!a.isUnlocked && !a.isHidden && a.progress) ? `<div style="margin-top:8px;"><div class="ach-mini-bar" style="width:100%"><div class="ach-mini-fill" style="width:${a.progress.pct}%"></div></div><div style="color:#9aa8c4; font-size:.86em; margin-top:4px;">Осталось: ${Math.max(0, a.progress.target - a.progress.current)}</div></div>` : '';
return `
        <div class="ach-item ${a.isUnlocked ? 'done' : ''}" data-ach="${a.id}">
          <div class="ach-top">
            <div class="ach-title" style="color:${a.isUnlocked ? '#fff' : (a.color || '#fff')}">${a.icon} ${a.name}</div>
          </div>
          <div class="ach-sub">${a.isUnlocked && a.unlockedAt ? `Открыто: ${new Date(a.unlockedAt).toLocaleDateString()}` : (a.isHidden ? 'Откроется при особых условиях' : a.short)}</div>
          ${(!a.isUnlocked && !a.isHidden && a.progress) ? `<div class="ach-progress"><div class="ach-mini-bar"><div class="ach-mini-fill" style="width:${a.progress.pct}%"></div></div></div>` : ``}
          <div class="ach-bottom">
            <div class="ach-xp">${a.isUnlocked ? `+${a.xpReward} XP` : (a.isHidden ? `Секретное` : `${a.xpReward} XP`)}</div>
            <div class="ach-remaining">${(!a.isUnlocked && !a.isHidden && a.progress) ? `Осталось: ${Math.max(0, a.progress.target - a.progress.current)}` : ``}</div>
            <button class="ach-more" type="button">Подробнее</button>
          </div>
          <div class="ach-details" style="display:none;"><div class="ach-details-title">Как выполнить</div><div class="ach-details-how">${a.howTo || 'Выполните условия.'}</div>${a.desc ? `<div class="ach-details-desc">${a.desc}</div>` : ''}</div>
        </div>`;
    }).join('') : '<div class="fav-empty">По данному фильтру ничего нет</div>';
  };
  renderAchievements('all');

  const topTracksEl = container.querySelector('#prof-top-tracks');
  if (topTracksEl) {
    const validStats = allStats.filter(s => s.uid !== 'global');
    const mkList = (arr, valFn) => arr.length ? `<ul class="stat-list">${arr.map(s => `<li><span>${esc(window.TrackRegistry?.getTrackByUid(s.uid)?.title)}</span><span>${valFn(s)}</span></li>`).join('')}</ul>` : `<div class="stat-sub" style="color:#888;font-size:12px;text-align:center;">Недостаточно данных</div>`;
    const topValid = [...validStats].sort((a, b) => (b.globalValidListenCount || 0) - (a.globalValidListenCount || 0)).slice(0, 5);
    const topTime = [...validStats].sort((a, b) => (b.globalListenSeconds || 0) - (a.globalListenSeconds || 0)).slice(0, 5);
    
    const byH = Array(24).fill(0), byW = Array(7).fill(0);
    validStats.forEach(s => { (s.byHour||[]).forEach((v,h)=>byH[h]+=v||0); (s.byWeekday||[]).forEach((v,d)=>byW[d]+=v||0); });
    
    const renderChart = (id, title, data, lsK, lbls) => `
      <div class="chart-block" id="${id}">
        <div class="chart-title" style="cursor:pointer;" data-tg="${id}-bars" data-ls="${lsK}">${title}</div>
        <div class="chart-bars" id="${id}-bars" ${localStorage.getItem(lsK)==='0'?'style="display:none;"':''}>
          ${data.map((v, i) => `<div class="chart-row"><div class="label">${lbls?lbls[i]:String(i).padStart(2,'0')}</div><div class="bar"><div class="fill" style="width:${Math.round((v/Math.max(1,...data))*100)}%"></div></div><div class="val">${v}</div></div>`).join('')}
        </div>
      </div>`;

    topTracksEl.innerHTML = renderChart('chart-hours', 'По часам суток', byH, 'myStatsHoursOpen') +
                            renderChart('chart-week', 'По дням недели', byW, 'myStatsWeekOpen', ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']) +
                            `<div class="stat-card" style="margin-bottom:10px;"><div class="stat-title">Топ‑5 по прослушиваниям</div>${mkList(topValid, s=>s.globalValidListenCount||0)}</div>
                            <div class="stat-card" style="margin-bottom:15px;"><div class="stat-title">Топ‑5 по времени</div>${mkList(topTime, s=>window.Utils?.fmt?.durationHuman(s.globalListenSeconds||0))}</div>
                            <div style="display:flex; justify-content:center; margin-top:8px;"><button class="backup-btn" id="stats-reset-open-btn" style="background:#444;" type="button">ОЧИСТИТЬ СТАТИСТИКУ</button></div>`;
  }

  const recsListEl = container.querySelector('#prof-recs-list');
  if (recsListEl) {
    const played = new Set(allStats.filter(s => s.globalFullListenCount > 0).map(s => s.uid));
    const recs = (window.TrackRegistry?.getAllUids?.()||[]).filter(u => !played.has(u)).sort(() => Math.random() - 0.5).slice(0, 4);
    recsListEl.innerHTML = recs.length ? recs.map(uid => `<div class="profile-list-item"><div class="log-info"><div class="log-title">${esc(window.TrackRegistry?.getTrackByUid(uid)?.title)}</div><div class="log-desc">${esc(window.TrackRegistry?.getTrackByUid(uid)?.album)}</div></div><button class="rec-play-btn" data-playuid="${uid}">▶</button></div>`).join('') : '<div class="fav-empty">Вы прослушали абсолютно всё! 🏆</div>';
  }

  setTimeout(async () => {
    const logsEl = container.querySelector('#prof-logs-list');
    if (!logsEl) return;
    try {
      const logs = [...(metaDB ? await metaDB.getEvents('events_hot').catch(()=>[]) : []), ...(metaDB ? await metaDB.getEvents('events_warm').catch(()=>[]) : [])].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
      const tMap = { 'LISTEN_COMPLETE': '🎵 Прослушано', 'LISTEN_SKIP': '⏭️ Пропущено', 'ACHIEVEMENT_UNLOCK': '🏆 Достижение', 'FEATURE_USED': '🛠️ Использовано' };
      logsEl.innerHTML = logs.length ? logs.map(l => {
        const d = new Date(l.timestamp);
        let desc = window.TrackRegistry?.getTrackByUid?.(l.uid)?.title || l.uid || '';
        if (l.type === 'ACHIEVEMENT_UNLOCK') desc = `Ачивка: ${l.data?.id || ''}`;
        return `<div class="profile-list-item"><div class="log-time">${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}</div><div class="log-info"><div class="log-title">${tMap[l.type] || l.type}</div><div class="log-desc">${esc(desc)}</div></div></div>`;
      }).join('') : '<div class="fav-empty">Журнал событий пуст</div>';
    } catch { logsEl.innerHTML = '<div class="fav-empty">Журнал событий пуст или недоступен</div>'; }
  }, 100);

  if (!ctx._profBound) {
    ctx._profBound = true;
    container.addEventListener('click', e => {
      const t = e.target;
      
      const tab = t.closest('.profile-tab-btn');
      if (tab) {
        container.querySelectorAll('.profile-tab-btn, .profile-tab-content').forEach(x => x.classList.remove('active'));
        tab.classList.add('active');
        container.querySelector(`#tab-${tab.dataset.tab}`)?.classList.add('active');
        return;
      }
      
      const achTab = t.closest('.ach-classic-tab');
      if (achTab) {
        container.querySelectorAll('.ach-classic-tab').forEach(x => x.classList.remove('active'));
        achTab.classList.add('active');
        renderAchievements(achTab.dataset.filter);
        return;
      }
      
      const achBtn = t.closest('.ach-more') || t.closest('.ach-main');
      if (achBtn) {
        const item = achBtn.closest('.ach-item'), det = item?.querySelector('.ach-details'), b = item?.querySelector('.ach-more');
        if (det) {
          const isHid = det.style.display === 'none';
          det.style.display = isHid ? 'block' : 'none';
          if (b) b.textContent = isHid ? 'Свернуть' : 'Подробнее';
        }
        return;
      }
      
      const chTitle = t.closest('.chart-title');
      if (chTitle) {
        const b = container.querySelector('#' + chTitle.dataset.tg);
        if (b) {
          const v = b.style.display !== 'none';
          b.style.display = v ? 'none' : '';
          localStorage.setItem(chTitle.dataset.ls, v ? '0' : '1');
        }
        return;
      }
      
      const auth = t.closest('.auth-btn');
      if (auth) {
        const id = auth.dataset.auth;
        if (tokens[id]) id === 'yandex' && cloudSync?.sync ? cloudSync.sync(id) : window.NotificationSystem?.info('Синхронизация запущена...');
        else id === 'yandex' && cloudSync?.auth ? cloudSync.auth(id) : window.NotificationSystem?.info(`Авторизация ${id} временно недоступна`);
        return;
      }
      
      if (t.closest('#prof-avatar-btn')) {
        const avatars = ['😎','🎧','🎸','🦄','🦇','👽','🤖','🐱','🦊','🐼','🔥','💎'];
        const m = window.Modals.open({ title: 'Выберите аватар', bodyHtml: `<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;">${avatars.map(a => `<button class="showcase-color-dot" style="font-size:24px;background:#232b38" data-ava="${a}">${a}</button>`).join('')}</div>` });
        m.onclick = async ev => {
          const btn = ev.target.closest('[data-ava]');
          if (btn) {
            upVal.avatar = btn.dataset.ava;
            t.closest('#prof-avatar-btn').textContent = btn.dataset.ava;
            if (metaDB) await metaDB.setGlobal('user_profile', upVal).catch(()=>{});
            m.remove();
          }
        };
        return;
      }
      
      if (t.closest('#prof-name-edit')) return container.querySelector('#prof-name-inp')?.focus();
      
      const srcBtn = t.closest('.src-toggle-btn');
      if (srcBtn) {
          const newSrc = srcBtn.dataset.src;
          localStorage.setItem('sourcePref', newSrc);
          window.NotificationSystem?.success(`Приоритет изменён на ${newSrc === 'yandex' ? 'Yandex Cloud' : 'GitHub'}`);
          loadProfileAlbum(ctx); // Обновляем UI тумблера
          return;
      }
      
      const recBtn = t.closest('.rec-play-btn');
      if (recBtn && window.ShowcaseManager?.playContext) {
        window.ShowcaseManager.playContext(recBtn.dataset.playuid);
        window.NotificationSystem?.info('Запуск рекомендации');
        return;
      }
      
      if (t.closest('#stats-reset-open-btn')) {
        if (!window.Modals?.confirm) return;
        const m = window.Modals.confirm({
          title: 'Очистка данных',
          textHtml: `<button class="om-btn om-btn--outline" style="width:100%;margin-bottom:8px;" data-act="stats">Только статистику треков</button>
                     <button class="om-btn om-btn--outline" style="width:100%;margin-bottom:8px;" data-act="ach">Только достижения</button>
                     <button class="om-btn om-btn--danger" style="width:100%;" data-act="all">Сбросить всё вообще</button>`,
          confirmText: 'Закрыть', cancelText: 'Отмена'
        });
        m.onclick = async ev => {
          const act = ev.target.closest('.om-btn')?.dataset?.act;
          if (!act) return;
          if (act === 'stats') { const dev = localStorage.getItem('deviceHash'); await metaDB.tx('stats', 'readwrite', s => s.clear()); localStorage.setItem('deviceHash', dev); window.NotificationSystem?.success('Статистика очищена'); }
          else if (act === 'ach') { await metaDB.setGlobal('unlocked_achievements', {}); await metaDB.setGlobal('user_profile_rpg', {xp:0, level:1}); window.NotificationSystem?.success('Достижения сброшены'); }
          else if (act === 'all') { await metaDB.tx('stats', 'readwrite', s => s.clear()); await metaDB.setGlobal('unlocked_achievements', {}); await metaDB.setGlobal('user_profile_rpg', {xp:0, level:1}); await metaDB.setGlobal('global_streak', {current:0, longest:0}); window.NotificationSystem?.success('Всё сброшено'); }
          window.location.reload();
        };
        return;
      }
    });
  }
}
