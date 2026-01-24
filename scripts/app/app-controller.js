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
        if (albums.length) this.openAlbum(albums[0].id);
        FavoritesStore.purge();
    },

    renderIcons(albums) {
        const wrap = $('#album-icons');
        let html = `<div class="album-icon" data-id="__favorites__"><img src="img/star.png"></div>`;
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
            this.favOnlyMode = false;
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
        
        let listToRender = this.currentList;
        if (this.favOnlyMode && this.currentContext !== 'favorites') {
            listToRender = listToRender.filter(uid => FavoritesStore.isLiked(uid));
        }

        if (listToRender.length === 0) {
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
            
            return `
                <div class="track ${activeClass} ${inactiveClass}" data-uid="${uid}">
                    <div class="tnum">${idx + 1}</div>
                    <div class="track-title">${escapeHtml(t.title)} <small>${escapeHtml(t.artist)}</small></div>
                    <div class="track-dur">${formatTime(t.duration)}</div>
                    <div class="like-star ${isLiked ? 'liked' : ''}">★</div>
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

        on($('#track-list-container'), 'click', e => {
            const row = e.target.closest('.track');
            if (!row) return;
            const uid = row.dataset.uid;

            if (e.target.classList.contains('like-star')) {
                e.stopPropagation();
                FavoritesStore.toggle(uid);
                this.renderList(); 
                return;
            }

            if (this.currentContext === 'favorites' && FavoritesStore.isInactive(uid)) {
                Modal.open({
                    title: 'Восстановление',
                    bodyHtml: `<p>Вернуть трек в избранное?</p><button class="modal-action-btn" id="recover-yes">Да, вернуть</button>`
                });
                $('#recover-yes').onclick = () => {
                    FavoritesStore.toggle(uid);
                    this.renderList();
                    document.querySelector('.modal-bg').remove();
                };
                return;
            }

            let playlist = this.currentContext === 'favorites' ? FavoritesStore.getPlayableUIDs() : 
                           (this.favOnlyMode ? this.currentList.filter(u => FavoritesStore.isLiked(u)) : this.currentList);
            
            PlayerCore.setPlaylist(playlist, uid);
        });

        // Player Controls
        on($('#btn-play'), 'click', () => PlayerCore.toggle());
        on($('#btn-next'), 'click', () => PlayerCore.next());
        on($('#btn-prev'), 'click', () => PlayerCore.prev());
        
        on($('#btn-fav-only'), 'click', () => {
            if (this.currentContext === 'favorites') return;
            this.favOnlyMode = !this.favOnlyMode;
            $('#btn-fav-only').classList.toggle('active', this.favOnlyMode);
            this.renderList();
            Toast.info(this.favOnlyMode ? "Только избранное" : "Все треки");
        });

        on($('#offline-btn'), 'click', () => openOfflineModal());

        // Core Events
        window.addEventListener('player:track-change', e => {
            this.renderList(); 
            const t = TrackRegistry.getTrack(e.detail.uid);
            if (t) {
                $('#player-track-title').textContent = t.title;
                $('#player-track-artist').textContent = t.artist;
                LyricsEngine.load(t.lyrics); // Грузим текст
            }
        });

        window.addEventListener('player:state', e => {
            $('#btn-play').textContent = e.detail.isPlaying ? '⏸' : '▶';
        });

        window.addEventListener('player:timeupdate', e => {
            const { ct, dur } = e.detail;
            $('#progress-fill').style.width = (dur ? (ct/dur)*100 : 0) + '%';
            $('#time-current').textContent = formatTime(ct);
            $('#time-duration').textContent = formatTime(dur);
            LyricsEngine.sync(ct); // Синхронизируем текст
        });
        
        on($('#progress-bar'), 'click', e => {
            const rect = e.target.getBoundingClientRect();
            PlayerCore.seek((e.clientX - rect.left) / rect.width);
        });
    }
};
