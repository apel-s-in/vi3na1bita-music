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

  const { metaDB } = await import('../../analytics/meta-db.js');
  const { cloudSync } = await import('../../analytics/cloud-sync.js');
  
  // Получение данных
  const allStats = await metaDB.getAllStats() || [];
  const achievementsDoc = await metaDB.getGlobal('unlocked_achievements') || { value: {} };
  const streakDoc = await metaDB.getGlobal('global_streak') || { value: { current: 0 } };
  const userProfile = await metaDB.getGlobal('user_profile') || { value: { name: 'Слушатель', avatar: '😎' } };
  
  // Агрегация статистики
  const totalFull = allStats.reduce((acc, s) => acc + (s.globalFullListenCount || 0), 0);
  const totalSecs = allStats.reduce((acc, s) => acc + (s.globalListenSeconds || 0), 0);
  const totalTimeStr = window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(totalSecs) : `${Math.floor(totalSecs / 60)}м`;
  const achUnlocked = Object.keys(achievementsDoc.value).length;
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
        <div class="profile-avatar-btn" id="prof-avatar-btn" title="Изменить аватар">${userProfile.value.avatar}</div>
        <div class="profile-name-wrap">
          <input type="text" id="prof-name-inp" class="profile-name-input" value="${esc(userProfile.value.name)}" maxlength="15" autocomplete="off" spellcheck="false">
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
          <div class="stat-box"><b>${streakDoc.value.current}</b><span>Стрик (дней)</span></div>
          <div class="stat-box"><b>${achUnlocked}</b><span>Ачивок</span></div>
        </div>
        <div class="profile-section-title">🏆 ТОП-5 ТРЕКОВ</div>
        <div id="prof-top-tracks"></div>
      </div>

      <!-- Содержимое: Достижения -->
      <div class="profile-tab-content" id="tab-achievements">
        <div class="profile-section-title">ОТКРЫТО: ${achUnlocked} / ${engine?.achievements.length || 0}</div>
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
    const newName = nameInp.value.trim() || 'Слушатель';
    await metaDB.setGlobal('user_profile', { ...userProfile.value, name: newName });
    window.NotificationSystem?.success('Имя сохранено');
  };
  nameInp.addEventListener('blur', saveProfile);
  nameInp.addEventListener('keydown', e => e.key === 'Enter' && nameInp.blur());
  
  container.querySelector('#prof-name-edit').onclick = () => nameInp.focus();

  container.querySelector('#prof-avatar-btn').onclick = async (e) => {
    const avatars = ['😎','🎧','🎸','🦄','🦇','👽','🤖','🐱','🦊','🐼','🔥','💎'];
    const html = `<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;">` + 
      avatars.map(a => `<button class="showcase-color-dot" style="font-size:24px;background:#232b38" data-ava="${a}">${a}</button>`).join('') + `</div>`;
    const m = window.Modals.open({ title: 'Выберите аватар', bodyHtml: html });
    m.addEventListener('click', async ev => {
      const btn = ev.target.closest('[data-ava]');
      if (btn) {
        userProfile.value.avatar = btn.dataset.ava;
        e.target.textContent = btn.dataset.ava;
        await metaDB.setGlobal('user_profile', userProfile.value);
        m.remove();
      }
    });
  };

  // 2. Вкладки
  const tabs = container.querySelectorAll('.profile-tab-btn');
  const contents = container.querySelectorAll('.profile-tab-content');
  container.querySelector('#prof-tabs').addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
    container.querySelector(`#tab-${e.target.dataset.tab}`).classList.add('active');
  });

  // 3. Авторизация (Облако)
  container.querySelector('.profile-auth-grid').addEventListener('click', e => {
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
  container.querySelector('#prof-top-tracks').innerHTML = sortedStats.length ? sortedStats.map(s => {
    const t = window.TrackRegistry?.getTrackByUid(s.uid);
    return t ? `<div class="profile-list-item">
      <div class="log-info"><div class="log-title">${esc(t.title)}</div><div class="log-desc">${esc(t.album)}</div></div>
      <div style="font-weight:900;color:var(--secondary-color)">${s.globalFullListenCount} раз</div>
    </div>` : '';
  }).join('') : '<div class="fav-empty">Слушайте треки, чтобы они появились здесь</div>';

  // 5. Рендер Достижений
  if (engine) {
    const achSorted = [...engine.achievements].sort((a, b) => (achievementsDoc.value[b.id] ? 1 : 0) - (achievementsDoc.value[a.id] ? 1 : 0));
    container.querySelector('#prof-ach-list').innerHTML = achSorted.map(a => `
      <div class="ach-item ${achievementsDoc.value[a.id] ? '' : 'locked'}">
        <div class="ach-icon">${a.icon}</div>
        <div class="ach-info"><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div></div>
        ${achievementsDoc.value[a.id] ? '<div class="ach-check">✓</div>' : ''}
      </div>`).join('');
  }

  // 6. Рендер Рекомендаций (Lightweight algorithm based on 0 listens or random)
  const allUids = window.TrackRegistry?.getAllUids() || [];
  const listenedUids = new Set(allStats.filter(s => s.globalFullListenCount > 0).map(s => s.uid));
  const recUids = allUids.filter(u => !listenedUids.has(u)).sort(() => Math.random() - 0.5).slice(0, 4);
  
  container.querySelector('#prof-recs-list').innerHTML = recUids.length ? recUids.map(uid => {
    const t = window.TrackRegistry?.getTrackByUid(uid);
    if (!t) return '';
    return `<div class="profile-list-item">
      <div class="log-info"><div class="log-title">${esc(t.title)}</div><div class="log-desc">${esc(t.album)}</div></div>
      <button class="rec-play-btn" data-playuid="${uid}">▶</button>
    </div>`;
  }).join('') : '<div class="fav-empty">Вы прослушали абсолютно всё! 🏆</div>';

  container.querySelector('#prof-recs-list').addEventListener('click', e => {
    const btn = e.target.closest('.rec-play-btn');
    if (btn && window.ShowcaseManager) {
      window.ShowcaseManager.playContext(btn.dataset.playuid);
      window.NotificationSystem?.info('Запуск рекомендации');
    }
  });

  // 7. Рендер Журнала (Асинхронно, чтобы не тормозить UI)
  setTimeout(async () => {
    try {
      const hot = await metaDB.getEvents('events_hot');
      const warm = await metaDB.getEvents('events_warm');
      const logs = [...hot, ...warm].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
      
      const typeMap = { 'LISTEN_COMPLETE': '🎵 Прослушано', 'LISTEN_SKIP': '⏭️ Пропущено', 'ACHIEVEMENT_UNLOCK': '🏆 Достижение', 'FEATURE_USED': '🛠️ Использовано' };
      
      container.querySelector('#prof-logs-list').innerHTML = logs.length ? logs.map(l => {
        const d = new Date(l.timestamp);
        const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        let desc = window.TrackRegistry?.getTrackByUid(l.uid)?.title || l.uid || '';
        if (l.type === 'ACHIEVEMENT_UNLOCK') desc = `Ачивка: ${l.data?.id || ''}`;
        
        return `<div class="profile-list-item">
          <div class="log-time">${timeStr}</div>
          <div class="log-info"><div class="log-title">${typeMap[l.type] || l.type}</div><div class="log-desc">${esc(desc)}</div></div>
        </div>`;
      }).join('') : '<div class="fav-empty">Журнал событий пуст</div>';
    } catch {
      container.querySelector('#prof-logs-list').innerHTML = '<div class="fav-empty">Ошибка загрузки журнала</div>';
    }
  }, 100);
}
