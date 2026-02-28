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
    
    // Единый источник истины (в строгом соответствии с ТЗ)
    const st = pc.getFavoritesState();
    const items = [
      ...(st.active || []).map(i => ({ ...i, active: true })),
      ...(st.inactive || []).map(i => ({ ...i, active: false }))
    ];

    const playerBlock = document.getElementById('lyricsplayerblock');
    const hasPlayer = playerBlock && container.contains(playerBlock);
    
    if (!items.length) {
      container.innerHTML = `<div class="fav-empty"><h3>Избранные треки</h3><p>Отметьте треки звёздочкой ⭐</p></div>`;
      if (hasPlayer) container.appendChild(playerBlock);
      return;
    }

    container.innerHTML = items.map((it, i) => {
      const t = window.TrackRegistry?.getTrackByUid(it.uid) || { title: 'Загрузка...', sourceAlbum: it.sourceAlbum };
      const aTitle = window.TrackRegistry?.getAlbumTitle(t.sourceAlbum) 
                     || window.albumsIndex?.find(a => a.key === t.sourceAlbum)?.title 
                     || 'Альбом';
      const id = `fav_${it.sourceAlbum}_${it.uid}`;
      
      return `
        <div class="track ${it.active ? '' : 'inactive'}" id="${esc(id)}" data-index="${i}" data-album="${esc(t.sourceAlbum)}" data-uid="${esc(it.uid)}">
          <div class="tnum">${String(i + 1).padStart(2, '0')}.</div>
          <div class="track-title" title="${esc(t.title)} - ${esc(aTitle)}">
            <span class="fav-track-name">${esc(t.title)}</span>
            <span class="fav-album-name"> — ${esc(aTitle)}</span>
          </div>
          <img src="${it.active ? 'img/star.png' : 'img/star2.png'}" class="like-star" alt="звезда" data-album="${esc(t.sourceAlbum)}" data-uid="${esc(it.uid)}">
        </div>`;
    }).join('');
    
    if (hasPlayer) {
      const currentTrack = window.playerCore?.getCurrentTrackUid?.();
      const row = container.querySelector(`.track[data-uid="${CSS.escape(currentTrack || '')}"]`) || container.lastElementChild;
      if (row) row.after(playerBlock);
      else container.appendChild(playerBlock);
    }
    
    injectOfflineIndicators(container);
};

  if (!ctx._favBound) {
    ctx._favBound = true;
    
    container.addEventListener('click', e => {
       if (ctx.getCurrentAlbum() !== FAV) return; // Защита от срабатывания логики Избранного в других альбомах
       
       const row = e.target.closest('.track');
       if (!row) return;
       
       const uid = row.dataset.uid, aKey = row.dataset.album;
       const isStar = e.target.classList.contains('like-star');
       const pc = window.playerCore;
       const isActive = pc.getFavoritesState().active.some(x => x.uid === uid);

       if (isStar) {
          e.preventDefault(); e.stopPropagation();
          // Снятие звезды или быстрое восстановление
          if (isActive) pc.toggleFavorite(uid, { source: 'favorites', albumKey: aKey });
          else pc.restoreInactive(uid);
          return;
       }

       if (isActive) {
          // Playback: формируем чистый плейлист только из active (согласно ТЗ)
          ctx.setPlayingAlbum(FAV);
          const tracks = pc.getFavoritesState().active.map(i => {
             const t = window.TrackRegistry?.getTrackByUid(i.uid) || {};
             return { ...t, uid: i.uid, album: 'Избранное', cover: FAV_COVER, sourceAlbum: i.sourceAlbum };
          });
          
          const idx = tracks.findIndex(t => t.uid === uid);
          if (idx >= 0) {
             pc.setPlaylist(tracks, idx, { artist: 'Витрина Разбита', album: 'Избранное', cover: FAV_COVER }, { preservePosition: false });
             pc.play(idx);
             ctx.highlightCurrentTrack(-1, { uid, albumKey: aKey });
             window.PlayerUI?.ensurePlayerBlock?.(idx, { userInitiated: true });
             window.PlayerUI?.updateAvailableTracksForPlayback?.();
          }
       } else {
          // Клик по неактивной (серой) строке — показать модалку возврата/удаления
          const t = window.TrackRegistry?.getTrackByUid(uid);
          pc.showInactiveFavoriteModal({ 
              uid, 
              title: t?.title || 'Трек', 
              onDeleted: () => { rebuild(); window.PlayerUI?.updateAvailableTracksForPlayback?.(); }
          });
       }
    });

    window.playerCore?.onFavoritesChanged(() => {
       if (ctx.getCurrentAlbum() === FAV) {
         rebuild();
         // Обновить originalPlaylist чтобы applyFavoritesOnlyFilter работал с актуальными данными
         const pc = window.playerCore;
         if (pc && ctx.getPlayingAlbum?.() === FAV) {
           const activeTracks = pc.getFavoritesState().active.map(i => {
             const t = window.TrackRegistry?.getTrackByUid(i.uid) || {};
             return { ...t, uid: i.uid, album: 'Избранное', cover: FAV_COVER, sourceAlbum: i.sourceAlbum };
           });
           if (activeTracks.length) {
             pc.originalPlaylist = activeTracks;
           }
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

  // Безопасная загрузка модулей и данных с fallback'ами
  let metaDB = null, cloudSync = null;
  let allStats = [], achVal = {}, streakVal = { current: 0 }, upVal = { name: 'Слушатель', avatar: '😎' };

  try {
    const mDB = await import('../../analytics/meta-db.js');
    metaDB = mDB.metaDB;
    const cSync = await import('../../analytics/cloud-sync.js');
    cloudSync = cSync.cloudSync;

    allStats = (await metaDB.getAllStats().catch(()=>[])) || [];
    achVal = (await metaDB.getGlobal('unlocked_achievements').catch(()=>({})))?.value || {};
    streakVal = (await metaDB.getGlobal('global_streak').catch(()=>({})))?.value || { current: 0 };
    upVal = (await metaDB.getGlobal('user_profile').catch(()=>({})))?.value || { name: 'Слушатель', avatar: '😎' };
  } catch (e) {
    console.error('[Profile] Ошибка инициализации БД или модулей:', e);
  }
  
  // Агрегация статистики
  const totalFull = allStats.reduce((acc, s) => acc + (s.globalFullListenCount || 0), 0);
  const totalSecs = allStats.reduce((acc, s) => acc + (s.globalListenSeconds || 0), 0);
  const totalTimeStr = window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(totalSecs) : `${Math.floor(totalSecs / 60)}м`;
  const achUnlocked = Object.keys(achVal).length;
  const engine = window.achievementEngine;

  // Авторизации
  const tokens = JSON.parse(localStorage.getItem('cloud_tokens') || '{}');
  const renderAuthBtn = (id, name, icon) => 
    `<button class="auth-btn ${id} ${tokens[id] ? 'connected' : ''}" data-auth="${id}">
      <span>${icon}</span> ${tokens[id] ? 'Подключено' : name}
    </button>`;

  // Использование вынесенного шаблона интерфейса
  container.innerHTML = '';
  const tpl = document.getElementById('profile-template').content.cloneNode(true);

  tpl.querySelector('#prof-avatar-btn').textContent = upVal.avatar;
  tpl.querySelector('#prof-name-inp').value = esc(upVal.name);

  tpl.querySelector('#prof-auth-grid').innerHTML = ${renderAuthBtn('yandex', 'Яндекс', '💽')} ${renderAuthBtn('google', 'Google', '☁️')} ${renderAuthBtn('vk', 'VK ID', '🔵')};

  tpl.querySelector('#prof-stat-tracks').textContent = totalFull;
  tpl.querySelector('#prof-stat-time').textContent = totalTimeStr;
  tpl.querySelector('#prof-stat-streak').textContent = streakVal.current;
  tpl.querySelector('#prof-stat-ach').textContent = achUnlocked;

  container.appendChild(tpl);

  // === ПРИВЯЗКА ЛОГИКИ ===

  // 1. Аватар и Имя
  const nameInp = container.querySelector('#prof-name-inp');
  const saveProfile = async () => {
    if (!nameInp) return;
    upVal.name = nameInp.value.trim() || 'Слушатель';
    if (metaDB) await metaDB.setGlobal('user_profile', upVal).catch(()=>{});
    window.NotificationSystem?.success('Имя сохранено');
  };
  
  if (nameInp) {
    nameInp.addEventListener('blur', saveProfile);
    nameInp.addEventListener('keydown', e => e.key === 'Enter' && nameInp.blur());
  }
  
  const editBtn = container.querySelector('#prof-name-edit');
  if (editBtn && nameInp) editBtn.onclick = () => nameInp.focus();

  const avaBtn = container.querySelector('#prof-avatar-btn');
  if (avaBtn) {
    avaBtn.onclick = async (e) => {
      const avatars = ['😎','🎧','🎸','🦄','🦇','👽','🤖','🐱','🦊','🐼','🔥','💎'];
      const html = `<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;">` + 
        avatars.map(a => `<button class="showcase-color-dot" style="font-size:24px;background:#232b38" data-ava="${a}">${a}</button>`).join('') + `</div>`;
      const m = window.Modals.open({ title: 'Выберите аватар', bodyHtml: html });
      m.addEventListener('click', async ev => {
        const btn = ev.target.closest('[data-ava]');
        if (btn) {
          upVal.avatar = btn.dataset.ava;
          e.target.textContent = btn.dataset.ava;
          if (metaDB) await metaDB.setGlobal('user_profile', upVal).catch(()=>{});
          m.remove();
        }
      });
    };
  }

  // 2. Вкладки
  const tabs = container.querySelectorAll('.profile-tab-btn');
  const contents = container.querySelectorAll('.profile-tab-content');
  container.querySelector('#prof-tabs')?.addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
    container.querySelector(`#tab-${e.target.dataset.tab}`)?.classList.add('active');
  });

  // 3. Авторизация (Облако)
  container.querySelector('.profile-auth-grid')?.addEventListener('click', e => {
    const btn = e.target.closest('.auth-btn');
    if (!btn) return;
    const id = btn.dataset.auth;
    if (tokens[id]) {
      if (id === 'yandex' && cloudSync?.sync) cloudSync.sync(id);
      else window.NotificationSystem?.info('Синхронизация запущена...');
    } else {
      if (id === 'yandex' && cloudSync?.auth) cloudSync.auth(id);
      else window.NotificationSystem?.info(`Авторизация ${id} временно недоступна`);
    }
  });

  // 4. Рендер Расширенной Статистики (с графиками из старого приложения)
  const topTracksEl = container.querySelector('#prof-top-tracks');
  if (topTracksEl) {
    const fmtTime = s => {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      return h > 0 ? `${h}ч ${m}м` : `${m}м`;
    };

    const validStats = allStats.filter(s => s.uid !== 'global');
    
    // Топ-5 по прослушиваниям
    const topValid = [...validStats].sort((a, b) => (b.globalValidListenCount || 0) - (a.globalValidListenCount || 0)).slice(0, 5);
    const tvHtml = topValid.length ? `<ul class="stat-list">${topValid.map(s => {
      const t = window.TrackRegistry?.getTrackByUid(s.uid);
      return t ? `<li><span>${esc(t.title)}</span><span>${s.globalValidListenCount || 0}</span></li>` : '';
    }).join('')}</ul>` : `<div class="stat-sub" style="color:#888;font-size:12px;text-align:center;">Недостаточно данных</div>`;

    // Топ-5 по времени
    const topTime = [...validStats].sort((a, b) => (b.globalListenSeconds || 0) - (a.globalListenSeconds || 0)).slice(0, 5);
    const ttHtml = topTime.length ? `<ul class="stat-list">${topTime.map(s => {
      const t = window.TrackRegistry?.getTrackByUid(s.uid);
      return t ? `<li><span>${esc(t.title)}</span><span>${fmtTime(s.globalListenSeconds || 0)}</span></li>` : '';
    }).join('')}</ul>` : `<div class="stat-sub" style="color:#888;font-size:12px;text-align:center;">Недостаточно данных</div>`;

    // Агрегация графиков
    const byHour = Array(24).fill(0);
    const byWeekday = Array(7).fill(0);
    validStats.forEach(s => {
      if (Array.isArray(s.byHour)) s.byHour.forEach((v, h) => byHour[h] += v || 0);
      if (Array.isArray(s.byWeekday)) s.byWeekday.forEach((v, d) => byWeekday[d] += v || 0);
    });

    const maxH = Math.max(1, ...byHour);
    const maxW = Math.max(1, ...byWeekday);
    const hO = localStorage.getItem('myStatsHoursOpen') !== '0';
    const wO = localStorage.getItem('myStatsWeekOpen') !== '0';

    topTracksEl.innerHTML = `
      <div class="chart-block" id="chart-hours">
        <div class="chart-title" style="cursor:pointer;" id="chart-hours-toggle">По часам суток</div>
        <div class="chart-bars" id="chart-hours-bars" ${hO ? '' : 'style="display:none;"'}>
          ${byHour.map((v, h) => `<div class="chart-row"><div class="label">${String(h).padStart(2, '0')}</div><div class="bar"><div class="fill" style="width:${Math.round((v / maxH) * 100)}%"></div></div><div class="val">${v}</div></div>`).join('')}
        </div>
      </div>
      <div class="chart-block" id="chart-week">
        <div class="chart-title" style="cursor:pointer;" id="chart-week-toggle">По дням недели</div>
        <div class="chart-bars" id="chart-week-bars" ${wO ? '' : 'style="display:none;"'}>
          ${byWeekday.map((v, d) => `<div class="chart-row"><div class="label">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][d]}</div><div class="bar"><div class="fill" style="width:${Math.round((v / maxW) * 100)}%"></div></div><div class="val">${v}</div></div>`).join('')}
        </div>
      </div>

      <div class="stat-card" style="margin-bottom:10px;">
        <div class="stat-title">Топ‑5 по прослушиваниям</div>
        ${tvHtml}
      </div>
      <div class="stat-card" style="margin-bottom:15px;">
        <div class="stat-title">Топ‑5 по времени</div>
        ${ttHtml}
      </div>

      <div style="display:flex; justify-content:center; margin-top:8px;">
        <button class="backup-btn" id="stats-reset-open-btn" style="background:#444;" type="button">ОЧИСТИТЬ СТАТИСТИКУ</button>
      </div>
    `;

    // Привязка событий для сворачивания графиков
    const bindToggle = (idT, idB, lsK) => {
      const t = container.querySelector('#' + idT), b = container.querySelector('#' + idB);
      if (t && b) t.onclick = () => {
        const v = b.style.display !== 'none';
        b.style.display = v ? 'none' : '';
        localStorage.setItem(lsK, v ? '0' : '1');
      };
    };
    bindToggle('chart-hours-toggle', 'chart-hours-bars', 'myStatsHoursOpen');
    bindToggle('chart-week-toggle', 'chart-week-bars', 'myStatsWeekOpen');

    // Кнопка очистки (Вызов модалки подтверждения)
    const resetBtn = container.querySelector('#stats-reset-open-btn');
    if (resetBtn) {
      resetBtn.onclick = () => {
        if (!window.Modals?.confirm) return;
        window.Modals.confirm({
          title: 'Очистка данных',
          textHtml: `Что именно вы хотите сбросить?<br><br>
            <button class="om-btn om-btn--outline" style="width:100%;margin-bottom:8px;" id="reset-only-stats">Только статистику треков</button>
            <button class="om-btn om-btn--outline" style="width:100%;margin-bottom:8px;" id="reset-only-ach">Только достижения</button>
            <button class="om-btn om-btn--danger" style="width:100%;" id="reset-all-data">Сбросить всё вообще</button>`,
          confirmText: 'Отмена',
          cancelText: 'Закрыть'
        });
        
        setTimeout(() => {
          document.getElementById('reset-only-stats')?.addEventListener('click', async () => {
            const dev = localStorage.getItem('deviceHash');
            await metaDB.tx('stats', 'readwrite', s => s.clear());
            localStorage.setItem('deviceHash', dev);
            window.NotificationSystem?.success('Статистика треков очищена');
            window.location.reload();
          });
          document.getElementById('reset-only-ach')?.addEventListener('click', async () => {
            await metaDB.setGlobal('unlocked_achievements', {});
            await metaDB.setGlobal('user_profile_rpg', {xp:0, level:1});
            window.NotificationSystem?.success('Достижения сброшены');
            window.location.reload();
          });
          document.getElementById('reset-all-data')?.addEventListener('click', async () => {
            await metaDB.tx('stats', 'readwrite', s => s.clear());
            await metaDB.setGlobal('unlocked_achievements', {});
            await metaDB.setGlobal('user_profile_rpg', {xp:0, level:1});
            await metaDB.setGlobal('global_streak', {current:0, longest:0});
            window.NotificationSystem?.success('Всё сброшено. Начните с чистого листа!');
            window.location.reload();
          });
        }, 100);
      };
    }
  }

  // 5. Классический Рендер Достижений с фильтрами
  const achListEl = container.querySelector('#prof-ach-list');
  const innerTabs = container.querySelector('#ach-inner-tabs');
  
  const renderAchievements = (filter) => {
    if (!achListEl || !engine || !engine.achievements) return;
    
    // Движок уже вернул правильно отсортированный плоский массив
    let items = engine.achievements;
    
    if (filter === 'all') items = items.filter(a => !a.isHidden || a.isUnlocked); // Скрываем невыполненные секретные из общего списка
    if (filter === 'available') items = items.filter(a => !a.isUnlocked && !a.isHidden);
    if (filter === 'done') items = items.filter(a => a.isUnlocked);
    if (filter === 'secret') items = engine.achievements.filter(a => a.isHidden); // Показываем только секретные (даже невыполненные)
    
    if (!items.length) {
      achListEl.innerHTML = '<div class="fav-empty">По данному фильтру ничего нет</div>';
      return;
    }

    achListEl.innerHTML = items.map(a => {
      const p = (!a.isUnlocked && !a.isHidden && a.progress) 
        ? `<div style="margin-top:8px;"><div class="ach-mini-bar" style="width:100%"><div class="ach-mini-fill" style="width:${a.progress.pct}%"></div></div><div style="color:#9aa8c4; font-size:.86em; margin-top:4px;">Осталось: ${Math.max(0, a.progress.target - a.progress.current)}</div></div>` : '';

      return `
        <div class="ach-item ${a.isUnlocked ? 'done' : ''}" data-ach="${a.id}">
          <div class="ach-status">${a.isUnlocked ? '✅' : (a.isHidden ? '🔒' : '🔸')}</div>
          <div class="ach-main">
            <div class="ach-title" style="color: ${a.isUnlocked ? '#fff' : (a.color || '#fff')}">${a.icon} ${a.name}</div>
            <div class="ach-sub">${a.isUnlocked && a.unlockedAt ? `Открыто: ${new Date(a.unlockedAt).toLocaleDateString()}` : (a.isHidden ? 'Откроется при особых условиях' : a.short)}</div>
          </div>
          <div class="ach-right">
            ${a.isUnlocked ? `<span class="ach-done-date">+${a.xpReward} XP</span>` : `<span class="ach-lock">${a.isHidden ? 'Секретное' : `${a.xpReward} XP`}</span>`}
            ${!a.isHidden ? `<button class="backup-btn secondary ach-more" type="button" style="padding:4px 8px; margin-top: 4px; font-size: 10px; width: 100%;">Подробнее</button>` : ''}
          </div>
          ${!a.isHidden ? `
            <div class="ach-details" style="display:none; grid-column: 1 / -1; padding:8px; border-top:1px dashed rgba(255,255,255,0.1); margin-top:6px;">
              <div style="color:#cfe3ff; font-weight:700; margin-bottom:6px;">Как выполнить</div>
              <div style="color:#eaeffb; margin-bottom:6px; font-size:12px;">${a.howTo || 'Выполните условия.'}</div>
              ${a.desc ? `<div style="color:#9aa8c4; font-size:.9em;">${a.desc}</div>` : ''}
              ${p}
            </div>` : ''}
        </div>`;
    }).join('');
  };

  // Классическая логика сворачивания/разворачивания (Делегирование)
  if (!achListEl.dataset.bound) {
    achListEl.dataset.bound = "true";
    achListEl.addEventListener('click', e => {
      const btn = e.target.closest('.ach-more');
      const main = e.target.closest('.ach-main');
      if (btn || main) {
        const item = (btn || main).closest('.ach-item');
        const det = item.querySelector('.ach-details');
        const b = item.querySelector('.ach-more');
        if (det) {
          const isHid = det.style.display === 'none';
          det.style.display = isHid ? 'block' : 'none';
          if (b) b.textContent = isHid ? 'Свернуть' : 'Подробнее';
        }
      }
    });
  }

  if (innerTabs) {
    innerTabs.addEventListener('click', e => {
      const tab = e.target.closest('.ach-classic-tab');
      if (!tab) return;
      innerTabs.querySelectorAll('.ach-classic-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderAchievements(tab.dataset.filter);
    });
  }
  
  // Первичный рендер (Все)
  renderAchievements('all');

  // 6. Рендер Рекомендаций
  const allUids = window.TrackRegistry?.getAllUids?.() || [];
  const listenedUids = new Set(allStats.filter(s => s.globalFullListenCount > 0).map(s => s.uid));
  const recUids = allUids.filter(u => !listenedUids.has(u)).sort(() => Math.random() - 0.5).slice(0, 4);
  
  const recsListEl = container.querySelector('#prof-recs-list');
  if (recsListEl) {
    recsListEl.innerHTML = recUids.length ? recUids.map(uid => {
      const t = window.TrackRegistry?.getTrackByUid(uid);
      if (!t) return '';
      return `<div class="profile-list-item">
        <div class="log-info"><div class="log-title">${esc(t.title)}</div><div class="log-desc">${esc(t.album)}</div></div>
        <button class="rec-play-btn" data-playuid="${uid}">▶</button>
      </div>`;
    }).join('') : '<div class="fav-empty">Вы прослушали абсолютно всё! 🏆</div>';

    recsListEl.addEventListener('click', e => {
      const btn = e.target.closest('.rec-play-btn');
      if (btn && window.ShowcaseManager?.playContext) {
        window.ShowcaseManager.playContext(btn.dataset.playuid);
        window.NotificationSystem?.info('Запуск рекомендации');
      }
    });
  }

  // 7. Рендер Журнала (Асинхронно)
  setTimeout(async () => {
    const logsEl = container.querySelector('#prof-logs-list');
    if (!logsEl) return;
    try {
      const hot = metaDB ? await metaDB.getEvents('events_hot').catch(()=>[]) : [];
      const warm = metaDB ? await metaDB.getEvents('events_warm').catch(()=>[]) : [];
      const logs = [...hot, ...warm].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
      
      const typeMap = { 'LISTEN_COMPLETE': '🎵 Прослушано', 'LISTEN_SKIP': '⏭️ Пропущено', 'ACHIEVEMENT_UNLOCK': '🏆 Достижение', 'FEATURE_USED': '🛠️ Использовано' };
      
      logsEl.innerHTML = logs.length ? logs.map(l => {
        const d = new Date(l.timestamp);
        const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        let desc = window.TrackRegistry?.getTrackByUid?.(l.uid)?.title || l.uid || '';
        if (l.type === 'ACHIEVEMENT_UNLOCK') desc = `Ачивка: ${l.data?.id || ''}`;
        
        return `<div class="profile-list-item">
          <div class="log-time">${timeStr}</div>
          <div class="log-info"><div class="log-title">${typeMap[l.type] || l.type}</div><div class="log-desc">${esc(desc)}</div></div>
        </div>`;
      }).join('') : '<div class="fav-empty">Журнал событий пуст</div>';
    } catch {
      logsEl.innerHTML = '<div class="fav-empty">Журнал событий пуст или недоступен</div>';
    }
  }, 100);
}
