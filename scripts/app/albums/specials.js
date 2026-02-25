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

  // Шаблон интерфейса
  container.innerHTML = `
    <div class="profile-wrap">
      <!-- Шапка: Аватар и Имя -->
      <div class="profile-header">
        <div class="profile-avatar-btn" id="prof-avatar-btn" title="Изменить аватар">${upVal.avatar}</div>
        <div class="profile-name-wrap">
          <input type="text" id="prof-name-inp" class="profile-name-input" value="${esc(upVal.name)}" maxlength="15" autocomplete="off" spellcheck="false">
          <span class="profile-edit-icon" id="prof-name-edit">✏️</span>
        </div>
      </div>

      <!-- Авторизация и Синхронизация -->
      <div class="profile-auth-grid">
        ${renderAuthBtn('yandex', 'Яндекс', '💽')}
        ${renderAuthBtn('google', 'Google', '☁️')}
        ${renderAuthBtn('vk', 'VK ID', '🔵')}
      </div>

      <!-- Вкладки -->
      <div class="profile-tabs" id="prof-tabs">
        <button class="profile-tab-btn active" data-tab="stats">Статистика</button>
        <button class="profile-tab-btn" data-tab="achievements">Достижения</button>
        <button class="profile-tab-btn" data-tab="recs">Для Вас</button>
        <button class="profile-tab-btn" data-tab="logs">Журнал</button>
      </div>

      <!-- Содержимое: Статистика -->
      <div class="profile-tab-content active" id="tab-stats">
        <div class="stats-grid-compact">
          <div class="stat-box"><b>${totalFull}</b><span>Треков</span></div>
          <div class="stat-box"><b>${totalTimeStr}</b><span>В пути</span></div>
          <div class="stat-box"><b>${streakVal.current}</b><span>Стрик (дней)</span></div>
          <div class="stat-box"><b>${achUnlocked}</b><span>Ачивок</span></div>
        </div>
        <div class="profile-section-title">🏆 ТОП-5 ТРЕКОВ</div>
        <div id="prof-top-tracks"></div>
      </div>

      <!-- Содержимое: Достижения -->
      <div class="profile-tab-content" id="tab-achievements">
        <div class="ach-classic-tabs" id="ach-inner-tabs">
          <div class="ach-classic-tab active" data-filter="all">Все</div>
          <div class="ach-classic-tab" data-filter="available">Доступные</div>
          <div class="ach-classic-tab" data-filter="done">Выполненные</div>
          <div class="ach-classic-tab" data-filter="secret">Секретные</div>
        </div>
        <div id="prof-ach-list"></div>
      </div>

      <!-- Содержимое: Рекомендации -->
      <div class="profile-tab-content" id="tab-recs">
        <div class="profile-section-title">💡 МЫ РЕКОМЕНДУЕМ</div>
        <div id="prof-recs-list"></div>
      </div>

      <!-- Содержимое: Журнал Событий -->
      <div class="profile-tab-content" id="tab-logs">
        <div class="profile-section-title">📜 ИСТОРИЯ АКТИВНОСТИ</div>
        <div id="prof-logs-list">Загрузка...</div>
      </div>
    </div>
  `;

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

  // 4. Рендер Топ-Треков
  const sortedStats = [...allStats].sort((a, b) => (b.globalFullListenCount || 0) - (a.globalFullListenCount || 0)).slice(0, 5);
  const topTracksEl = container.querySelector('#prof-top-tracks');
  if (topTracksEl) {
    topTracksEl.innerHTML = sortedStats.length ? sortedStats.map(s => {
      const t = window.TrackRegistry?.getTrackByUid(s.uid);
      return t ? `<div class="profile-list-item">
        <div class="log-info"><div class="log-title">${esc(t.title)}</div><div class="log-desc">${esc(t.album)}</div></div>
        <div style="font-weight:900;color:var(--secondary-color)">${s.globalFullListenCount} раз</div>
      </div>` : '';
    }).join('') : '<div class="fav-empty">Слушайте треки, чтобы они появились здесь</div>';
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
      // Ищем XP награду в словаре движка (вытаскиваем математику)
      const isBaseId = a.id.split('_').slice(0, -1).join('_');
      const rule = engine.dict[a.id] || engine.dict[isBaseId];
      let xp = 0;
      if (rule) {
        if (rule.type === 'static') xp = rule.reward.xp;
        else if (rule.type === 'scalable') {
          const lvl = parseInt(a.id.split('_').pop(), 10);
          xp = engine._getScalableXP(rule, lvl);
        }
      }

      const p = (!a.isUnlocked && !a.isHidden && a.progress) 
        ? `<div class="ach-mini-bar-wrap" style="margin-top:6px;"><div class="ach-mini-bar"><div class="ach-mini-fill" style="width:${a.progress.pct}%"></div></div><div style="font-size:10px; color:#888; margin-top:2px;">Прогресс: ${a.progress.current} / ${a.progress.target}</div></div>` 
        : '';

      return `
        <div class="ach-item ${a.isUnlocked ? 'done' : ''}">
          <div class="ach-item-header">
            <div class="ach-status" style="filter: drop-shadow(0 0 4px ${a.color || '#fff'})">${a.isUnlocked ? '✅' : (a.isHidden ? '🔒' : '🔸')}</div>
            <div class="ach-main">
              <div class="ach-title">${a.icon} ${a.name}</div>
              <div class="ach-sub">${a.isUnlocked && a.unlockedAt ? `Открыто: ${new Date(a.unlockedAt).toLocaleDateString()}` : (a.isHidden ? 'Секретное задание' : a.short)}</div>
            </div>
            <div class="ach-right">
              ${a.isUnlocked 
                ? `<span class="ach-done-date">+${xp} XP</span>` 
                : `<span class="ach-lock">${a.isHidden ? '???' : `${xp} XP`}</span>`
              }
              ${!a.isHidden ? `<button class="ach-more" type="button">Подробнее</button>` : ''}
            </div>
          </div>
          ${!a.isHidden ? `
            <div class="ach-details" style="display:none;">
              <div style="color:#cfe3ff; font-weight:700; margin-bottom:4px;">Как выполнить:</div>
              <div style="color:#eaeffb; margin-bottom:6px; font-size:12px;">${a.howTo || 'Слушайте музыку.'}</div>
              ${a.desc ? `<div style="color:#9aa8c4; font-size:11px; margin-bottom:6px;">${a.desc}</div>` : ''}
              ${p}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  };

  // Логика кнопок "Подробнее" (Делегирование)
  if (achListEl) {
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
