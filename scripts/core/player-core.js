import { TrackRegistry } from './track-registry.js';
import { shuffleArray } from './utils.js';

export const PlayerCore = {
    audio: new Audio(),
    playlist: [],         
    originalPlaylist: [], 
    currentIndex: -1,
    currentUid: null,
    
    isShuffle: false,
    isRepeat: false, 
    isPlaying: false,

    init() {
        this.audio.preload = 'auto';
        
        this.audio.addEventListener('ended', () => {
            if (this.isRepeat === 'one') this.play(this.currentUid);
            else this.next(true);
        });

        this.audio.addEventListener('timeupdate', () => {
            window.dispatchEvent(new CustomEvent('player:timeupdate', { 
                detail: { ct: this.audio.currentTime, dur: this.audio.duration } 
            }));
        });

        this.audio.addEventListener('play', () => this._state(true));
        this.audio.addEventListener('pause', () => this._state(false));
        this.audio.addEventListener('error', () => {
            if(this.playlist.length > 1) this.next();
        });
    },

    setPlaylist(uids, startUid) {
        this.originalPlaylist = [...uids];
        this.playlist = this.isShuffle ? shuffleArray([...uids]) : [...uids];
        
        if (this.isShuffle && startUid) {
            this.playlist = this.playlist.filter(u => u !== startUid);
            this.playlist.unshift(startUid);
        }

        if (startUid) this.play(startUid);
    },

    play(uid) {
        if (!uid) return;
        if (this.currentUid === uid && this.audio.src) {
            this.audio.play().catch(()=>{});
            return;
        }

        const track = TrackRegistry.getTrack(uid);
        if (!track) return;

        this.currentUid = uid;
        this.currentIndex = this.playlist.indexOf(uid);
        
        if (this.currentIndex === -1) {
            this.playlist = [uid];
            this.currentIndex = 0;
        }

        // Проверяем Offline
        const mgr = window.OfflineUI?.offlineManager;
        // Здесь можно было бы добавить сложную логику резолва url, но для старта берем базовый
        // Если есть оффлайн-менеджер, он подменит URL в blob
        
        this.audio.src = track.url || track.audio; // (или track.src из старого конфига)
        
        this.audio.play().catch(console.warn);
        window.dispatchEvent(new CustomEvent('player:track-change', { detail: { uid } }));
    },

    toggle() {
        if (this.audio.paused) {
            this.currentUid ? this.audio.play() : this.play(this.playlist[0]);
        } else {
            this.audio.pause();
        }
    },

    prev() {
        if (this.audio.currentTime > 3) {
            this.audio.currentTime = 0;
            return;
        }
        let idx = this.currentIndex - 1;
        if (idx < 0) idx = this.playlist.length - 1;
        this.play(this.playlist[idx]);
    },

    next() {
        let idx = this.currentIndex + 1;
        if (idx >= this.playlist.length) {
            if (this.isRepeat) idx = 0;
            else return this._state(false); 
        }
        this.play(this.playlist[idx]);
    },

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        if (this.isShuffle) {
            this.playlist = shuffleArray([...this.originalPlaylist]);
            if (this.currentUid) {
                this.playlist = this.playlist.filter(u => u !== this.currentUid);
                this.playlist.unshift(this.currentUid);
                this.currentIndex = 0;
            }
        } else {
            this.playlist = [...this.originalPlaylist];
            this.currentIndex = this.playlist.indexOf(this.currentUid);
        }
        return this.isShuffle;
    },

    toggleRepeat() {
        if (!this.isRepeat) this.isRepeat = 'all';
        else if (this.isRepeat === 'all') this.isRepeat = 'one';
        else this.isRepeat = false;
        return this.isRepeat;
    },

    seek(pct) {
        if (this.audio.duration) this.audio.currentTime = this.audio.duration * pct;
    },

    _state(playing) {
        this.isPlaying = playing;
        window.dispatchEvent(new CustomEvent('player:state', { detail: { isPlaying: playing } }));
    }
};
