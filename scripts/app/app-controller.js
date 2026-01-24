import { $, on, isIOS } from '../core/utils.js';
import { TrackRegistry } from '../core/track-registry.js';
import { FavoritesStore } from '../core/favorites-store.js';
import { PlayerCore } from '../core/player-core.js';
import { TrackListRenderer } from '../ui/track-list-renderer.js';

export const AppController = {
    albums: [],
    currentAlbumId: null,
    favOnlyMode: false,

    init(albumsData) {
        this.albums = albumsData;
        this.renderIcons();
        this.renderPlayer();
        
        // По умолчанию открываем первый альбом
        if (this.albums.length) this.openAlbum(this.albums[0].id);

        this.bindGlobalEvents();
    },

    renderIcons() {
        const cont = $('#album-icons');
        // Добавляем иконку Избранного
        let html = `<div class="album-icon" data-id="__favorites__"><img src="img/star.png" alt="Fav"></div>`;
        // Добавляем альбомы
        html += this.albums.map(a => 
            `<div class="album-icon" data-id="${a.id}"><img src="${a.cover}" alt=""></div>`
        ).join('');
        cont.innerHTML = html;
    },

    renderPlayer() {
        // Вставляем плеер из шаблона
        const tpl = $('#player-controls-template');
        if (tpl) $('#track-list-container').after(tpl.content.cloneNode(true));
        
        // Биндим кнопки плеера
        $('#btn-play').onclick = () => PlayerCore.toggle();
        $('#btn-prev').onclick = () => PlayerCore.prev();
        $('#btn-next').onclick = () => PlayerCore.next();
        
        $('#btn-shuffle').onclick = function() {
            const s = PlayerCore.toggleShuffle();
            this.classList.toggle('active', s);
        };
        
        $('#btn-repeat').onclick = function() {
            const r = PlayerCore.toggleRepeat();
            this.classList.toggle('active', !!r);
        };

        // Логика кнопки "F" (Только избранное)
        $('#btn-fav-only').onclick = () => this.toggleFavOnlyMode();
    },

    bindGlobalEvents() {
        // Клик по альбомам
        on($('#album-icons'), 'click', (e) => {
            const el = e.target.closest('.album-icon');
            if (el) this.openAlbum(el.dataset.id);
        });

        // Клик по трекам (Делегирование)
        on($('#track-list-container'), 'click', (e) => {
            const row = e.target.closest('.track-row');
            const btnFav = e.target.closest('.btn-fav');
            if (!row) return;
            
            const uid = row.dataset.uid;

            if (btnFav) {
                e.stopPropagation();
                this.handleFavClick(uid, btnFav, row);
            } else {
                this.handleTrackClick(uid);
            }
        });

        // Слушаем плеер
        window.addEventListener('player:track-change', (e) => this.updateUI(e.detail.uid));
        window.addEventListener('player:state-change', (e) => {
            $('#btn-play').textContent = e.detail.isPlaying ? '⏸' : '▶';
        });
        window.addEventListener('player:timeupdate', (e) => {
            const { currentTime, duration } = e.detail;
            const pct = duration ? (currentTime / duration) * 100 : 0;
            const fill = $('#progress-fill');
            if(fill) fill.style.width = pct + '%';
        });
    },

    openAlbum(id) {
        this.currentAlbumId = id;
        const cont = $('#track-list-container');
        const title = $('#playlist-title');
        const cover = $('#cover-slot img');

        let uids = [];

        if (id === '__favorites__') {
            // Избранное
            const items = FavoritesStore.getAllForUI();
            uids = items.map(i => i.uid);
            title.textContent = "ИЗБРАННОЕ";
            if(cover) cover.src = "img/star.png";
            this.favOnlyMode = false; // В избранном этот режим не имеет смысла
        } else {
            // Обычный альбом
            const alb = this.albums.find(a => a.id === id);
            if (alb) {
                uids = TrackRegistry.getAlbumTracks(id);
                title.textContent = alb.title;
                if(cover) cover.src = alb.cover;
            }
        }

        // Сохраняем текущий список для контекста
        this.currentListUIDs = uids;
        this.renderList();
    },

    renderList() {
        TrackListRenderer.renderList(
            $('#track-list-container'), 
            this.currentListUIDs, 
            PlayerCore.currentUid, 
            false,
            this.currentAlbumId === '__favorites__' ? 'favorites' : 'album'
        );
    },

    toggleFavOnlyMode() {
        this.favOnlyMode = !this.favOnlyMode;
        $('#btn-fav-only').classList.toggle('active', this.favOnlyMode);
        
        if (this.favOnlyMode) {
            // Фильтруем текущий плейлист в плеере
            const uids = PlayerCore.originalPlaylist.filter(uid => FavoritesStore.isLiked(uid));
            if (uids.length === 0) {
                alert("Нет избранных треков в этом альбоме");
                this.toggleFavOnlyMode(); // Откат
                return;
            }
            PlayerCore.setPlaylist(uids, PlayerCore.currentUid); // Сохраняем текущий, если он в списке
        } else {
            // Возвращаем полный список альбома
            if (this.currentAlbumId && this.currentAlbumId !== '__favorites__') {
                const uids = TrackRegistry.getAlbumTracks(this.currentAlbumId);
                PlayerCore.setPlaylist(uids, PlayerCore.currentUid);
            }
        }
    },

    handleTrackClick(uid) {
        // Если мы в режиме "Только избранное", но кликнули по треку которого нет в избранном (в списке),
        // то надо сбросить режим или играть только его? 
        // Упростим: при клике загружаем контекст альбома.
        
        let listToPlay = this.currentListUIDs;
        
        if (this.currentAlbumId === '__favorites__') {
            // В избранном играем только активные
            listToPlay = FavoritesStore.getPlayableUIDs();
        } else if (this.favOnlyMode) {
             // Если включен фильтр, играем только избранные из альбома
             listToPlay = this.currentListUIDs.filter(u => FavoritesStore.isLiked(u));
        }

        PlayerCore.setPlaylist(listToPlay, uid);
    },

    handleFavClick(uid, btn, row) {
        const isLiked = FavoritesStore.toggle(uid);
        
        // Визуальное обновление кнопки
        if (isLiked) {
            btn.classList.add('liked');
            btn.textContent = '★';
        } else {
            btn.classList.remove('liked');
            // btn.textContent = '☆'; // или пустая звезда
        }

        // Логика ИЗБРАННОГО (ТЗ: неактивная строка)
        if (this.currentAlbumId === '__favorites__') {
            if (!isLiked) {
                row.classList.add('inactive');
                // Если играл этот трек и он стал единственным активным - стоп (реализовано в PlayerCore check?)
                // Тут можно проверить и переключить
                if (PlayerCore.currentUid === uid) {
                    PlayerCore.next();
                }
            } else {
                row.classList.remove('inactive');
            }
        }
        
        // Если включен режим FavOnly в альбоме и сняли лайк -> удаляем из плейлиста плеера на лету?
        // Для простоты: PlayerCore сам разберется при следующем next(), если мы обновим плейлист.
        if (this.favOnlyMode && !isLiked) {
             const newList = PlayerCore.playlist.filter(u => u !== uid);
             PlayerCore.setPlaylist(newList); // без сброса текущего
        }
    },

    updateUI(uid) {
        // Подсветка трека
        const rows = document.querySelectorAll('.track-row');
        rows.forEach(r => r.classList.remove('active'));
        
        const curr = document.querySelector(`.track-row[data-uid="${uid}"]`);
        if (curr) curr.classList.add('active');

        // Обновление инфо в плеере
        const track = TrackRegistry.getTrack(uid);
        if (track) {
            $('#player-track-title').textContent = track.title;
            $('#player-track-artist').textContent = track.artist;
        }
    }
};
