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
    pulseEnabled: false,

    init(albums) {
        this.renderIcons(albums);
        this.bindEvents();
        if (albums.length > 0) {
            const firstId = albums[0].id || albums[0].key;
            this.openAlbum(firstId);
        }
        FavoritesStore.purge();
        
        // Восстановление громкости
        const vol = localStorage.getItem('playerVolume') || 1;
        const slider = $('#vol-slider');
        if (slider) slider.value = vol * 100;
        PlayerCore.setVolume(vol);
        this.updateVolumeUI(vol * 100);

        // Инициализация событий плеера (один раз)
        this.bindPlayerControls();
    },

    renderIcons(albums) {
        const wrap = $('#album-icons');
        let html = `<div class="album-icon" data-id="__favorites__"><img src="img/star.png"></div>`;
        html += albums.map(a => {
            const id = a.id || a.key;
            const cover = a.cover || 'img/logo.png'; 
            return `<div class="album-icon" data-id="${id}"><img src="${cover}"></div>`;
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
            if (!album) return;
            title.textContent = album.title;
            title.className = "active-album-title";
            cover.src = album.cover || 'img/logo.png';
            this.currentList = TrackRegistry.getAlbumTracks(id);
        }
        
        this.renderList();
        
        // При смене альбома нужно проверить, какой плеер показывать (большой или мини)
        this.updatePlayerVisibility();
    },

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
                    <div class="track-title">${escapeHtml(t.title)}</div>
                    <img src="${isLiked ? 'img/star.png' : 'img/star2.png'}" 
                         class="like-star ${favClass}" alt="fav">
                </div>
            `;
        }).join('');
        
        cont.innerHTML = html;
        this.updatePlayerVisibility();
    },

    highlightTrack(uid) {
        const all = document.querySelectorAll('.track');
        all.forEach(el => el.classList.remove('current'));
        
        const current = document.querySelector(`.track[data-uid="${uid}"]`);
        if (current) {
            current.classList.add('current');
            current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    // Логика переключения Большой / Мини плеер
    updatePlayerVisibility() {
        const playerBlock = $('#player-controls');
        // В старом дизайне мини-плеер создавался динамически
        let miniHeader = $('#mini-player-info'); 
        
        if (!miniHeader) {
            // Создаем мини-хедер, если нет
            miniHeader = document.createElement('div');
            miniHeader.id = 'mini-player-info';
            miniHeader.className = 'mini-now';
            miniHeader.style.display = 'none';
            miniHeader.innerHTML = `
                <span class="tnum" id="mini-track-num">--.</span>
                <span class="track-title" id="mini-track-title">—</span>
            `;
            // Вставляем ПЕРЕД списком
            const header = $('header');
            header.after(miniHeader);
            
            // Клик по мини-плееру возвращает в играющий альбом
            miniHeader.onclick = () => {
                const track = TrackRegistry.getTrack(PlayerCore.currentUid);
                if(track) this.openAlbum(track.albumId);
            };
        }

        const playingUid = PlayerCore.currentUid;
        if (!playingUid) {
            // Ничего не играет - скрываем всё
            playerBlock.style.display = 'none';
            miniHeader.style.display = 'none';
            return;
        }

        // Проверяем, есть ли играющий трек в ТЕКУЩЕМ списке
        const isPlayingFromCurrentList = this.currentList.includes(playingUid);

        if (isPlayingFromCurrentList) {
            // Мы в "родном" альбоме -> Большой плеер
            playerBlock.style.display = 'block';
            miniHeader.style.display = 'none';
            
            // Перемещаем плеер ПОД трек (как в старом дизайне)
            const currentTrackRow = document.querySelector(`.track[data-uid="${playingUid}"]`);
            if (currentTrackRow) {
                currentTrackRow.after(playerBlock);
            } else {
                // Если строка скрыта фильтром, кидаем в конец списка
                $('#track-list-container').after(playerBlock);
            }
        } else {
            // Мы в другом альбоме -> Мини-плеер сверху
            playerBlock.style.display = 'none';
            miniHeader.style.display = 'flex';
            
            const t = TrackRegistry.getTrack(playingUid);
            if(t) {
                $('#mini-track-title').textContent = t.title;
                // Номер берем из оригинального альбома
                const originalTracks = TrackRegistry.getAlbumTracks(t.albumId);
                const idx = originalTracks.indexOf(playingUid);
                $('#mini-track-num').textContent = (idx + 1) + '.';
            }
        }
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
                
                const isLiked = FavoritesStore.isLiked(uid);
                e.target.src = isLiked ? 'img/star.png' : 'img/star2.png';
                
                if (this.currentContext === 'favorites') {
                    if (!isLiked) row.classList.add('inactive');
                    else row.classList.remove('inactive');
                }
                return;
            }

            if (this.currentContext === 'favorites' && FavoritesStore.isInactive(uid)) {
                if(confirm("Вернуть трек в избранное?")) {
                    FavoritesStore.toggle(uid);
                    this.renderList();
                }
                return;
            }

            let playlist = this.currentContext === 'favorites' ? FavoritesStore.getPlayableUIDs() : 
                           (this.favOnlyMode ? this.currentList.filter(u => FavoritesStore.isLiked(u)) : this.currentList);
            
            PlayerCore.setPlaylist(playlist, uid);
        });

        // Offline modal
        on($('#offline-btn'), 'click', () => openOfflineModal());
    },

    bindPlayerControls() {
        // Контролы (только один раз при старте)
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

        on($('#vol-slider'), 'input', (e) => {
            const val = e.target.value;
            PlayerCore.setVolume(val / 100);
            this.updateVolumeUI(val);
            localStorage.setItem('playerVolume', val / 100);
        });

        on($('#btn-pulse'), 'click', () => {
            this.pulseEnabled = !this.pulseEnabled;
            $('#btn-pulse').classList.toggle('active', this.pulseEnabled);
            $('#btn-pulse').textContent = this.pulseEnabled ? '❤️' : '🤍';
            this.togglePulseAnim();
        });

        on($('#btn-lyrics-toggle'), 'click', () => {
            const cont = $('#lyrics-container');
            if(cont.style.height === '0px' || cont.style.display === 'none') {
                cont.style.display = 'block';
                cont.style.height = 'auto';
            } else {
                cont.style.display = 'none';
            }
        });

        on($('#progress-bar'), 'click', e => {
            const rect = e.target.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            PlayerCore.seek(pct);
        });

        // Global Audio Events
        window.addEventListener('player:track-change', e => {
            this.highlightTrack(e.detail.uid);
            this.updatePlayerVisibility(); // Показать плеер под треком
            
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
            this.togglePulseAnim();
        });

        window.addEventListener('player:timeupdate', e => {
            const { ct, dur } = e.detail;
            const pct = dur ? (ct/dur)*100 : 0;
            $('#progress-fill').style.width = pct + '%';
            $('#time-current').textContent = formatTime(ct);
            $('#time-duration').textContent = formatTime(dur);
            LyricsEngine.sync(ct);
        });
    },

    updateVolumeUI(val) {
        const fill = $('#vol-fill');
        if(fill) fill.style.width = val + '%';
    },

    togglePulseAnim() {
        const logo = $('#logo-bottom');
        if (this.pulseEnabled && PlayerCore.isPlaying) {
            logo.style.animation = 'pulse 0.5s infinite alternate';
        } else {
            logo.style.animation = 'none';
        }
    }
};
