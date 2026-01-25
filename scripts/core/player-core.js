import { TrackRegistry } from './track-registry.js';
import { shuffleArray } from './utils.js';

export const PlayerCore = {
    sound: null,
    playlist: [],         
    originalPlaylist: [], 
    currentIndex: -1,
    currentUid: null,
    
    isShuffle: false,
    isRepeat: false, 
    isPlaying: false,
    volume: 1.0,

    init() {
        // Howler инициализируется сам
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

        // Если играет тот же трек - ничего не делаем (или resume если пауза)
        if (this.currentUid === uid && this.sound) {
            if (!this.sound.playing()) this.sound.play();
            return;
        }

        const track = TrackRegistry.getTrack(uid);
        if (!track) return;

        // Остановка предыдущего
        if (this.sound) {
            this.sound.unload();
        }

        this.currentUid = uid;
        this.currentIndex = this.playlist.indexOf(uid);
        
        if (this.currentIndex === -1) {
            this.playlist = [uid];
            this.currentIndex = 0;
        }

        // Howler Setup
        this.sound = new Howl({
            src: [track.url || track.audio],
            html5: true, // Важно для больших файлов и стриминга
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
                if (this.isRepeat === 'one') {
                    this.play(this.currentUid);
                } else {
                    this.next(true);
                }
            },
            onstop: () => {
                this._stopTick();
                this._state(false);
            },
            onloaderror: (id, err) => console.error('Load Error', err),
            onplayerror: (id, err) => {
                console.error('Play Error', err);
                this.sound.once('unlock', () => {
                    this.sound.play();
                });
            }
        });

        this.sound.play();
        window.dispatchEvent(new CustomEvent('player:track-change', { detail: { uid } }));
    },

    toggle() {
        if (this.sound && this.sound.playing()) {
            this.sound.pause();
        } else if (this.sound) {
            this.sound.play();
        } else if (this.playlist.length > 0) {
            this.play(this.playlist[0]);
        }
    },

    prev() {
        if (this.sound && this.sound.seek() > 3) {
            this.sound.seek(0);
            return;
        }
        let idx = this.currentIndex - 1;
        if (idx < 0) idx = this.playlist.length - 1;
        this.play(this.playlist[idx]);
    },

    next(auto = false) {
        let idx = this.currentIndex + 1;
        if (idx >= this.playlist.length) {
            if (this.isRepeat === 'all' || this.isRepeat === true) idx = 0;
            else return this._state(false); 
        }
        this.play(this.playlist[idx]);
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

    _state(playing) {
        this.isPlaying = playing;
        window.dispatchEvent(new CustomEvent('player:state', { detail: { isPlaying: playing } }));
    },

    _tickInterval: null,
    _startTick() {
        this._stopTick();
        this._tickInterval = setInterval(() => {
            if (this.sound && this.sound.playing()) {
                const seek = this.sound.seek();
                const duration = this.sound.duration();
                window.dispatchEvent(new CustomEvent('player:timeupdate', { 
                    detail: { ct: seek, dur: duration } 
                }));
            }
        }, 300); // Обновляем раз в 300мс
    },
    _stopTick() {
        clearInterval(this._tickInterval);
    }
};
