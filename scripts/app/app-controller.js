import { $, on, escapeHtml, formatTime } from '../core/utils.js';
import { TrackRegistry } from '../core/track-registry.js';
import { FavoritesStore } from '../core/favorites-store.js';
import { PlayerCore } from '../core/player-core.js';
import { openOfflineModal } from '../ui/offline-modal.js';

export const AppController = {
    currentContext: null, // 'album' | 'favorites'
    currentList: [],      // UIDs
    favOnlyMode: false,

    init(albums) {
        this.renderIcons(albums);
        this.bindEvents();
        
        // Открыть первый альбом по умолчанию
        if (albums.length) this.openAlbum(albums[0].id);
        
        // Очистить мусор избранного
        FavoritesStore.purge();
    },

    renderIcons(albums) {
        const wrap = $('#album-icons');
        // Избранное (первым или спец кнопка)
        let html = `<div class="album-icon" data-id="__favorites__"><img src="img/star.png"></div>`;
        // Альбомы
        html += albums.map(a => 
            `<div class="album-icon" data-id="${a.id}"><img src="${a.cover}"></div>`
        ).join('');
        wrap.innerHTML = html;
    },

    openAlbum(id) {
        this.currentContext = id === '__favorites__' ? 'favorites' : 'album';
        const title = $('#playlist-title');
        const cover = $('#cover-slot img');

        if (this.currentContext === 'favorites') {
            title.textContent = "ИЗБРАННОЕ";
            title.className = "active-album-title fav";
            cover.src = "img/star.png";
            this.currentList = FavoritesStore.getAllForUI();
            this.favOnlyMode = false; // Сбрасываем фильтр в избранном
        } else {
            const album = TrackRegistry.getAlbum(id);
            if (!album) return;
            title.textContent = album.title;
            title.className = "active-album-title";
            cover.src = album.cover;
            this.currentList = TrackRegistry.getAlbumTracks(id);
        }

        this.renderList();
    },

    renderList() {
        const cont = $('#track-list-container');
        const playingUid = PlayerCore.currentUid;
        
        // Фильтрация "Только избранное" (F)
        let listToRender = this.currentList;
        if (this.favOnlyMode && this.currentContext !== 'favorites') {
            listToRender = listToRender.filter(uid => FavoritesStore.isLiked(uid));
        }

        const html = listToRender.map((uid, idx) => {
            const t = TrackRegistry.getTrack(uid);
            if (!t) return '';
            
            const isLiked = FavoritesStore.isLiked(uid);
            const isInactive = FavoritesStore.isInactive(uid); // Для экрана избранного
            
            const activeClass = (uid === playingUid) ? 'current' : '';
            const inactiveClass = isInactive ? 'inactive' : '';
            const favClass = isLiked ? 'liked' : '';
            
            // Если это экран избранного и трек inactive -> показываем серым
            // Если это обычный альбом и трек inactive -> он просто без звезды (isLiked=false)

            return `
                <div class="track ${activeClass} ${inactiveClass}" data-uid="${uid}">
                    <div class="tnum">${idx + 1}</div>
                    <div class="track-title">${escapeHtml(t.title)} <small>${escapeHtml(t.artist)}</small></div>
                    <div class="track-dur">${formatTime(t.duration)}</div>
                    <div class="like-star ${favClass}">★</div>
                </div>
            `;
        }).join('');
        
        cont.innerHTML = html;
    },

    bindEvents() {
        // Навигация по альбомам
        on($('#album-icons'), 'click', e => {
            const el = e.target.closest('.album-icon');
            if (el) this.openAlbum(el.dataset.id);
        });

        // Клик по треку (Делегирование)
        on($('#track-list-container'), 'click', e => {
            const row = e.target.closest('.track');
            if (!row) return;
            const uid = row.dataset.uid;

            // Клик по звезде
            if (e.target.classList.contains('like-star')) {
                e.stopPropagation();
                FavoritesStore.toggle(uid);
                this.renderList(); // Перерисовка (быстро и надежно)
                return;
            }

            // Клик по строке (Play)
            // ВАЖНО: Если трек "inactive" в Избранном - его нельзя играть кликом, или предлагать восстановить
            if (this.currentContext === 'favorites' && FavoritesStore.isInactive(uid)) {
                if(confirm("Вернуть трек в избранное?")) {
                    FavoritesStore.toggle(uid); // Восстановит
                    this.renderList();
                }
                return;
            }

            // Формируем плейлист для плеера
            let playlist = [];
            if (this.currentContext === 'favorites') {
                playlist = FavoritesStore.getPlayableUIDs();
            } else if (this.favOnlyMode) {
                playlist = this.currentList.filter(u => FavoritesStore.isLiked(u));
            } else {
                playlist = this.currentList;
            }

            // Если плейлист изменился или пустой - обновляем
            PlayerCore.setPlaylist(playlist, uid);
        });

        // Плеер контролы
        on($('#btn-play'), 'click', () => PlayerCore.toggle());
        on($('#btn-next'), 'click', () => PlayerCore.next());
        on($('#btn-prev'), 'click', () => PlayerCore.prev());
        
        on($('#btn-shuffle'), 'click', function() {
            this.classList.toggle('active', PlayerCore.toggleShuffle());
        });
        
        on($('#btn-repeat'), 'click', function() {
            const r = PlayerCore.toggleRepeat();
            this.classList.toggle('active', !!r);
            this.textContent = r === 'one' ? '🔂' : '🔁';
        });

        // Кнопка F (Только избранное)
        on($('#btn-fav-only'), 'click', () => {
            if (this.currentContext === 'favorites') return; // В избранном не имеет смысла
            
            // Проверка: есть ли лайки в текущем альбоме?
            const hasLikes = this.currentList.some(u => FavoritesStore.isLiked(u));
            if (!this.favOnlyMode && !hasLikes) {
                alert("В этом альбоме нет избранных треков!");
                return;
            }

            this.favOnlyMode = !this.favOnlyMode;
            $('#btn-fav-only').classList.toggle('active', this.favOnlyMode);
            this.renderList();
            
            // Если сейчас играет музыка из этого списка, надо ли менять плейлист "на лету"?
            // По ТЗ: "Кнопка F ... ограничивает по каким трекам можно ходить".
            // Простейшая реализация: обновляем плейлист плеера.
            let newPl = this.favOnlyMode 
                ? this.currentList.filter(u => FavoritesStore.isLiked(u))
                : this.currentList;
            
            // Не сбиваем текущий трек если он в списке
            PlayerCore.setPlaylist(newPl, null); 
        });

        // Оффлайн модалка
        on($('#offline-btn'), 'click', () => openOfflineModal());

        // Слушаем события ядра
        window.addEventListener('player:track-change', e => {
            this.renderList(); // Обновить подсветку active
            const t = TrackRegistry.getTrack(e.detail.uid);
            if (t) {
                $('#player-track-title').textContent = t.title;
                $('#player-track-artist').textContent = t.artist;
                
                // Обновление MediaSession
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: t.title, artist: t.artist, artwork: [{ src: t.cover }]
                    });
                    navigator.mediaSession.setActionHandler('play', () => PlayerCore.play(t.uid));
                    navigator.mediaSession.setActionHandler('pause', () => PlayerCore.audio.pause());
                    navigator.mediaSession.setActionHandler('previoustrack', () => PlayerCore.prev());
                    navigator.mediaSession.setActionHandler('nexttrack', () => PlayerCore.next());
                }
            }
        });

        window.addEventListener('player:state', e => {
            $('#btn-play').textContent = e.detail.isPlaying ? '⏸' : '▶';
        });

        window.addEventListener('player:timeupdate', e => {
            const { ct, dur } = e.detail;
            const pct = dur ? (ct / dur) * 100 : 0;
            $('#progress-fill').style.width = pct + '%';
            $('#time-current').textContent = formatTime(ct);
            $('#time-duration').textContent = formatTime(dur);
        });
        
        // Клик по прогресс-бару
        on($('#progress-bar'), 'click', e => {
            const rect = e.target.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            PlayerCore.seek(pct);
        });
    }
};
