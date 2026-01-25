import { TrackRegistry } from './track-registry.js';
import { shuffleArray } from './utils.js';
import FavoritesV2 from './favorites-v2.js';

// Используем глобальную Howler, загруженную через CDN в index.html

export const PlayerCore = {
    sound: null,
    playlist: [],         
    originalPlaylist: [], 
    currentIndex: -1,
    currentUid: null,
    
    isShuffle: false,
    isRepeat: false,
    isFavOnly: false,
    volume: 1.0,

    callbacks: {},

    initialize() {
        // Howler готов
        console.log('PlayerCore initialized');
        this.callbacks = {
            onTrackChange: [], onPlay: [], onPause: [], 
            onStop: [], onEnd: [], onTick: [], onFavoritesChanged: []
        };
    },

    setPlaylist(uids, startUid) {
        // Сохраняем оригинальный порядок
        this.originalPlaylist = uids.map(uid => TrackRegistry.getTrack(uid)).filter(Boolean);
        
        // Применяем фильтры (шаффл, избранное)
        this._rebuildPlaylist(startUid);
        
        if (startUid) this.play(startUid);
    },

    _rebuildPlaylist(targetUid) {
        let list = [...this.originalPlaylist];

        if (this.isFavOnly) {
            list = list.filter(t => this.isFavorite(t.uid));
            // Если целевой трек не в избранном, добавляем его временно, чтобы сыграть
            if (targetUid) {
                const target = this.originalPlaylist.find(t => t.uid === targetUid);
                if (target && !list.includes(target)) list.unshift(target);
            }
        }

        if (this.isShuffle) {
            const target = list.find(t => t.uid === targetUid);
            const others = list.filter(t => t.uid !== targetUid);
            this.playlist = [target, ...shuffleArray(others)].filter(Boolean);
        } else {
            this.playlist = list;
        }

        // Обновляем индекс
        if (targetUid) {
            this.currentIndex = this.playlist.findIndex(t => t.uid === targetUid);
            this.currentUid = targetUid;
        }
    },

    play(uid) {
        if (!uid && this.playlist.length > 0) uid = this.playlist[0].uid;
        if (!uid) return;

        // Resume если тот же трек
        if (this.currentUid === uid && this.sound) {
            if (!this.sound.playing()) this.sound.play();
            return;
        }

        const track = TrackRegistry.getTrack(uid);
        if (!track) return;

        // Стоп старого
        if (this.sound) this.sound.unload();

        this.currentUid = uid;
        this.currentIndex = this.playlist.findIndex(t => t.uid === uid);

        // Резолв источника (offline/online)
        let src = track.url || track.audio;
        // Тут можно вставить проверку OfflineManager, если нужно blob URL

        this.sound = new Howl({
            src: [src],
            html5: true,
            volume: this.volume,
            onplay: () => {
                this._state(true);
                this._startTick();
            },
            onpause: () => {
                this._state(false);
                this._stopTick();
            },
            onend: () => {
                this._stopTick();
                this.handleTrackEnd();
            }
        });

        this.sound.play();
        this._trigger('onTrackChange', { uid });
    },

    toggle() {
        if (this.sound && this.sound.playing()) {
            this.sound.pause();
        } else if (this.sound) {
            this.sound.play();
        } else if (this.playlist.length > 0) {
            this.play(this.playlist[0].uid);
        }
    },

    prev() {
        if (this.getPosition() > 3) {
            this.seek(0);
            return;
        }
        let idx = this.currentIndex - 1;
        if (idx < 0) idx = this.playlist.length - 1;
        const t = this.playlist[idx];
        if (t) this.play(t.uid);
    },

    next() {
        let idx = this.currentIndex + 1;
        if (idx >= this.playlist.length) {
            if (this.isRepeat) idx = 0;
            else return this._state(false);
        }
        const t = this.playlist[idx];
        if (t) this.play(t.uid);
    },

    handleTrackEnd() {
        if (this.isRepeat === 'one') {
            this.play(this.currentUid);
        } else {
            this.next();
        }
    },

    seek(pct) {
        if (this.sound && this.sound.duration()) {
            this.sound.seek(this.sound.duration() * pct);
        }
    },
    
    setVolume(val) {
        this.volume = val;
        if(this.sound) this.sound.volume(val);
    },

    getPosition() { return this.sound ? this.sound.seek() : 0; },
    getDuration() { return this.sound ? this.sound.duration() : 0; },

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        this._rebuildPlaylist(this.currentUid);
        return this.isShuffle;
    },

    toggleRepeat() {
        if (!this.isRepeat) this.isRepeat = 'all';
        else if (this.isRepeat === 'all') this.isRepeat = 'one';
        else this.isRepeat = false;
        return this.isRepeat;
    },
    
    toggleFavoritesOnly() {
        this.isFavOnly = !this.isFavOnly;
        this._rebuildPlaylist(this.currentUid);
        return this.isFavOnly;
    },

    // Favorites wrapper
    isFavorite(uid) {
        return FavoritesV2.readLikedSet().has(uid);
    },
    
    toggleFavorite(uid, opts) {
        const res = FavoritesV2.toggle(uid, { source: opts?.fromAlbum ? 'album' : 'favorites' });
        this._trigger('onFavoritesChanged', { uid, liked: res.liked });
        return res;
    },

    // Events
    on(map) {
        Object.keys(map).forEach(k => {
            if (this.callbacks[k]) this.callbacks[k].push(map[k]);
        });
    },
    _trigger(evt, data) {
        (this.callbacks[evt] || []).forEach(fn => fn(data));
    },
    _state(playing) {
        this.isPlaying = playing;
        window.dispatchEvent(new CustomEvent('player:state', { detail: { isPlaying: playing } }));
    },
    
    _tickInterval: null,
    _startTick() {
        this._stopTick();
        this._tickInterval = setInterval(() => {
            if (this.sound && this.sound.playing()) {
                window.dispatchEvent(new CustomEvent('player:timeupdate', { 
                    detail: { ct: this.sound.seek(), dur: this.sound.duration() } 
                }));
            }
        }, 300);
    },
    _stopTick() { clearInterval(this._tickInterval); },
    
    // Audio Context Access for Visualizer
    getAudioContext() { return Howler.ctx; },
    getMasterGain() { return Howler.masterGain; }
};

window.playerCore = PlayerCore; // For console debugging if needed
