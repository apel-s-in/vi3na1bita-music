import { $, on, escapeHtml, formatTime } from '../core/utils.js';
import { TrackRegistry } from '../core/track-registry.js';
import { FavoritesStore } from '../core/favorites-store.js';
import { PlayerCore } from '../core/player-core.js';
import { openOfflineModal } from '../ui/offline-modal.js';
import { LyricsEngine } from './lyrics-engine.js';
import { Toast, Modal } from '../core/ui-kit.js';

export const AppController = {
    currentContext: null, 
    currentList: [],
    favOnlyMode: false,

    init(albums) {
        this.renderIcons(albums);
        this.bindEvents();
        // Открываем первый альбом, если он есть
        if (albums.length > 0) {
            const firstId = albums[0].id || albums[0].key;
            this.openAlbum(firstId);
        }
        FavoritesStore.purge();
    },

    renderIcons(albums) {
        const wrap = $('#album-icons');
        let html = `<div class="album-icon" data-id="__favorites__"><img src="img/star.png"></div>`;
        html += albums.map(a => {
            const id = a.id || a.key;
            // Ищем локальную картинку для иконки (обычно она в img/icon_album/)
            // В albums.json нет поля icon, но оно было в старом конфиге. 
            // Предположим, что мы берем cover из albums.json или генерируем путь.
            // В твоем project-full есть ICON_ALBUMS_ORDER в config.js, но мы его удалили.
            // Берем cover, если есть, иначе лого.
            const img = a.cover || 'img/logo.png'; 
            return `<div class="album-icon" data-id="${id}"><img src="${img}"></div>`;
        }).join('');
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
            this.favOnlyMode = false;
        } else {
            const album = TrackRegistry.getAlbum(id);
            if (!album) {
                console.warn('Album not found:', id);
                return;
            }
            // Если в albums.json нет title, берем из загруженного config.json (он сохранился в track registry)
            // Но мы сохраняли только треки в мапу треков. 
            // В TrackRegistry.registerAlbums мы сохранили данные из albums.json.
            // А данные из config.json (например название альбома) мы в albumsMap не обновляли.
            // Исправим это визуально, взяв title из albums.json (он там должен быть).
            
            title.textContent = album.title || album.albumName || "Альбом";
            title.className = "active-album-title";
            
            // Если у альбома есть cover в albums.json - используем его. 
            // Если нет, пробуем найти обложку первого трека.
            if (album.cover) {
                cover.src = album.cover;
            } else {
                const tracks = TrackRegistry.getAlbumTracks(id);
                if (tracks.length > 0) {
                   const firstTrack = TrackRegistry.getTrack(tracks[0]);
                   cover.src = firstTrack.cover;
                } else {
                   cover.src = 'img/logo.png';
                }
            }

            this.currentList = TrackRegistry.getAlbumTracks(id);
        }
        this.renderList();
    },
    
    // ... (Остальные методы renderList и bindEvents ОСТАВЛЯЕМ ТЕ ЖЕ, что были в прошлом ответе)
    // Вставь сюда код из предыдущего ответа, начиная с renderList...
    renderList() {
        const cont = $('#track-list-container');
        const playingUid = PlayerCore.currentUid;
        
        let listToRender = this.currentList;
        if (this.favOnlyMode && this.currentContext !== 'favorites') {
            listToRender = listToRender.filter(uid => FavoritesStore.isLiked(uid));
        }

        if (!listToRender || listToRender.length === 0) {
            cont.innerHTML = '<div class="fav-empty">Список пуст</div>';
            return;
        }

        const html = listToRender.map((uid, idx) => {
            const t = TrackRegistry.getTrack(uid);
            if (!t) return '';
            
            const isLiked = FavoritesStore.isLiked(uid);
            const isInactive = FavoritesStore.isInactive(uid);
            const activeClass = (uid === playingUid) ? 'current' : '';
            const inactiveClass = isInactive ? 'inactive' : '';
            const favClass = isLiked ? 'liked' : '';
            
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
        on($('#album-icons'), 'click', e => {
            const el = e.target.closest('.album-icon');
            if (el) this.openAlbum(el.dataset.id);
        });

        on($('#track-list-container'), 'click', (e) => {
            const row = e.target.closest('.track');
            if (!row) return;

            const uid = String(row.dataset.uid || '').trim();
            if (!uid) return;

            const isStar = e.target.classList.contains('like-star');

            // ⭐ логика зависит от контекста (ТЗ избранного)
            if (isStar) {
                e.stopPropagation();

                if (this.currentContext === 'favorites') {
                    // В избранном: active -> inactive, inactive -> restore
                    if (FavoritesStore.isInactive(uid)) {
                        FavoritesStore.restore(uid);
                    } else {
                        FavoritesStore.unlikeInFavorites(uid);

                        // Особое правило: если текущий трек стал inactive в favorites во время проигрывания
                        if (PlayerCore.currentUid === uid) {
                            const playable = FavoritesStore.getPlayableUIDs();

                            // Единственный сценарий, когда "Избранное" имеет право STOP:
                            // был единственный active, сняли его в favorites view.
                            if (playable.length === 0) {
                                PlayerCore.stop?.();
                            } else {
                                PlayerCore.setPlaylist(playable, playable[0]);
                            }
                        }
                    }
                } else {
                    // В родном альбоме: like/unlike "без следа"
                    if (FavoritesStore.isLiked(uid) || FavoritesStore.isInactive(uid)) {
                        FavoritesStore.unlikeInAlbum(uid);
                    } else {
                        FavoritesStore.like(uid);
                    }
                }

                this.renderList();
                return;
            }

            // Клик по inactive строке в избранном (НЕ по ⭐) => модалка: restore / delete
            if (this.currentContext === 'favorites' && FavoritesStore.isInactive(uid)) {
                Modal.open({
                    title: 'Избранное',
                    bodyHtml: `
                      <div style="display:flex;flex-direction:column;gap:10px;">
                        <button class="modal-action-btn" data-action="restore">Вернуть в избранное</button>
                        <button class="modal-action-btn" data-action="delete">Удалить</button>
                      </div>
                    `,
                    onClose: null
                });

                const overlay = document.querySelector('#modals-container .modal-bg:last-child');
                const restoreBtn = overlay?.querySelector('[data-action="restore"]');
                const deleteBtn = overlay?.querySelector('[data-action="delete"]');

                if (restoreBtn) {
                    restoreBtn.onclick = () => {
                        FavoritesStore.restore(uid);
                        overlay?.remove();
                        this.renderList();
                    };
                }

                if (deleteBtn) {
                    deleteBtn.onclick = () => {
                        FavoritesStore.removeRef(uid);
                        overlay?.remove();
                        this.renderList();
                    };
                }

                return;
            }

            // Обычный запуск трека
            const playlist = this.currentContext === 'favorites'
                ? FavoritesStore.getPlayableUIDs()
                : (this.favOnlyMode
                    ? this.currentList.filter(u => FavoritesStore.isLiked(u))
                    : this.currentList);

            PlayerCore.setPlaylist(playlist, uid);
        });

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
        
        on($('#btn-fav-only'), 'click', () => {
            if (this.currentContext === 'favorites') return;
            this.favOnlyMode = !this.favOnlyMode;
            $('#btn-fav-only').classList.toggle('active', this.favOnlyMode);
            this.renderList();
            if(Toast) Toast.info(this.favOnlyMode ? "Только избранное" : "Все треки");
        });

        on($('#offline-btn'), 'click', () => openOfflineModal());

        window.addEventListener('player:track-change', e => {
            this.renderList(); 
            const t = TrackRegistry.getTrack(e.detail.uid);
            if (t) {
                $('#player-track-title').textContent = t.title;
                $('#player-track-artist').textContent = t.artist;
                LyricsEngine.load(t.lyrics);
                
                if ('mediaSession' in navigator) {
                     navigator.mediaSession.metadata = new MediaMetadata({
                        title: t.title, artist: t.artist, artwork: [{ src: t.cover || 'img/logo.png' }]
                    });
                }
            }
        });

        window.addEventListener('player:state', e => {
            $('#btn-play').textContent = e.detail.isPlaying ? '⏸' : '▶';
        });

        window.addEventListener('player:timeupdate', e => {
            const { ct, dur } = e.detail;
            const pct = dur ? (ct/dur)*100 : 0;
            $('#progress-fill').style.width = pct + '%';
            $('#time-current').textContent = formatTime(ct);
            $('#time-duration').textContent = formatTime(dur);
            LyricsEngine.sync(ct);
        });
        
        on($('#progress-bar'), 'click', e => {
            const rect = e.target.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            PlayerCore.seek(pct);
        });
    }
};
