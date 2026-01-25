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
        $('#vol-slider').value = vol * 100;
        PlayerCore.setVolume(vol);
        this.updateVolumeUI(vol * 100);
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
    },

    renderList() {
        const cont = $('#track-list-container');
        const playingUid = PlayerCore.currentUid;
        
        let listToRender = this.currentList;
        // Если включен фильтр "Только избранное", фильтруем данные перед рендером
        // НО: лучше скрывать CSS-ом, чтобы не пересоздавать DOM. 
        // Для простоты перерендерим при переключении режима F.
        
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
            
            // Восстановил структуру HTML как в старом
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
    },

    highlightTrack(uid) {
        // Точечное обновление без перерендера
        const all = document.querySelectorAll('.track');
        all.forEach(el => el.classList.remove('current'));
        
        const current = document.querySelector(`.track[data-uid="${uid}"]`);
        if (current) {
            current.classList.add('current');
            current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    bindEvents() {
        on($('#album-icons'), 'click', e => {
            const el = e.target.closest('.album-icon');
            if (el) this.openAlbum(el.dataset.id);
        });

        // Делегирование на список
        on($('#track-list-container'), 'click', e => {
            const row = e.target.closest('.track');
            if (!row) return;
            const uid = row.dataset.uid;

            // Клик по звезде
            if (e.target.classList.contains('like-star')) {
                e.stopPropagation();
                FavoritesStore.toggle(uid);
                
                // Обновляем иконку точечно
                const isLiked = FavoritesStore.isLiked(uid);
                e.target.src = isLiked ? 'img/star.png' : 'img/star2.png';
                
                // Если мы в "Избранном", строка может стать inactive
                if (this.currentContext === 'favorites') {
                    if (!isLiked) row.classList.add('inactive');
                    else row.classList.remove('inactive');
                }
                return;
            }

            if (this.currentContext === 'favorites' && FavoritesStore.isInactive(uid)) {
                if(confirm("Вернуть трек в избранное?")) {
                    FavoritesStore.toggle(uid);
                    this.renderList(); // Тут нужен ререндер чтобы убрать inactive
                }
                return;
            }

            // Логика плейлиста
            let playlist = this.currentContext === 'favorites' ? FavoritesStore.getPlayableUIDs() : 
                           (this.favOnlyMode ? this.currentList.filter(u => FavoritesStore.isLiked(u)) : this.currentList);
            
            PlayerCore.setPlaylist(playlist, uid);
        });

        // Контролы
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
            this.renderList(); // Тут нужен ререндер для фильтрации
        });

        // Громкость
        on($('#vol-slider'), 'input', (e) => {
            const val = e.target.value;
            PlayerCore.setVolume(val / 100);
            this.updateVolumeUI(val);
            localStorage.setItem('playerVolume', val / 100);
        });

        // Пульсация
        on($('#btn-pulse'), 'click', () => {
            this.pulseEnabled = !this.pulseEnabled;
            $('#btn-pulse').classList.toggle('active', this.pulseEnabled);
            $('#btn-pulse').textContent = this.pulseEnabled ? '❤️' : '🤍';
            this.togglePulseAnim();
        });

        // Лирика
        on($('#btn-lyrics-toggle'), 'click', () => {
            const cont = $('#lyrics-container');
            if(cont.style.height === '0px' || cont.style.display === 'none') {
                cont.style.display = 'block';
                cont.style.height = 'auto';
            } else {
                cont.style.display = 'none';
            }
        });

        on($('#offline-btn'), 'click', () => openOfflineModal());

        // --- EVENTS ---
        window.addEventListener('player:track-change', e => {
            this.highlightTrack(e.detail.uid);
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
            this.togglePulseAnim(); // Включаем/выключаем анимацию
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
    },

    updateVolumeUI(val) {
        $('#vol-fill').style.width = val + '%';
    },

    // Эмуляция визуализатора CSS-ом (так как настоящий AudioContext сложен)
    togglePulseAnim() {
        const logo = $('#logo-bottom');
        if (this.pulseEnabled && PlayerCore.isPlaying) {
            logo.style.animation = 'pulse 0.5s infinite alternate';
        } else {
            logo.style.animation = 'none';
        }
    }
};
