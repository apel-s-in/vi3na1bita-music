import { TrackRegistry } from './track-registry.js';
import { shuffleArray, isIOS } from './utils.js';

export const PlayerCore = {
    audio: new Audio(),
    playlist: [],          // Массив UID (текущий порядок)
    originalPlaylist: [],  // Массив UID (оригинальный порядок для unshuffle)
    currentIndex: -1,
    currentUid: null,
    
    // Состояние
    isPlaying: false,
    isShuffle: false,
    isRepeat: false, // false | 'all' | 'one'

    init() {
        this.audio.preload = 'auto';
        
        // Автопереключение
        this.audio.addEventListener('ended', () => {
            if (this.isRepeat === 'one') {
                this.play(this.currentUid);
            } else {
                this.next(true); // true = auto play
            }
        });

        // Прокидываем события аудио наружу для UI
        this.audio.addEventListener('timeupdate', () => {
            window.dispatchEvent(new CustomEvent('player:timeupdate', { 
                detail: { currentTime: this.audio.currentTime, duration: this.audio.duration } 
            }));
        });

        this.audio.addEventListener('play', () => this._updateState(true));
        this.audio.addEventListener('pause', () => this._updateState(false));
        
        // Error handling
        this.audio.addEventListener('error', (e) => {
            console.error('Audio Error:', e);
            this.next(); // Пытаемся играть следующий, если этот сломан
        });
    },

    /**
     * Устанавливает новый плейлист
     * @param {Array} uids - массив UID
     * @param {boolean} startImmediately - играть сразу?
     */
    setPlaylist(uids, startUid = null) {
        this.originalPlaylist = [...uids];
        
        if (this.isShuffle) {
            this.playlist = shuffleArray([...uids]);
            // Если указан стартовый трек, ставим его первым
            if (startUid) {
                this.playlist = this.playlist.filter(id => id !== startUid);
                this.playlist.unshift(startUid);
            }
        } else {
            this.playlist = [...uids];
        }

        if (startUid) {
            this.play(startUid);
        }
    },

    play(uid) {
        if (!uid) return;

        // Если это тот же трек и он на паузе -> resume
        if (this.currentUid === uid && this.audio.src) {
            this.audio.play().catch(e => console.warn('Play interrupted', e));
            return;
        }

        const track = TrackRegistry.getTrack(uid);
        if (!track) return console.error('Track not found:', uid);

        this.currentUid = uid;
        this.currentIndex = this.playlist.indexOf(uid);
        
        // Если трека нет в текущем плейлисте (например, запуск из поиска), добавляем временно
        if (this.currentIndex === -1) {
            this.playlist.unshift(uid);
            this.currentIndex = 0;
        }

        this.audio.src = track.url; // url берется из registry
        this.audio.play().catch(err => {
            console.warn('Auto-play blocked or error:', err);
        });

        // Событие смены трека (для обновления заголовка, обложки плеера)
        window.dispatchEvent(new CustomEvent('player:track-change', { detail: { uid } }));
    },

    toggle() {
        if (this.audio.paused) {
            this.currentUid ? this.play(this.currentUid) : this.play(this.playlist[0]);
        } else {
            this.audio.pause();
        }
    },

    prev() {
        if (this.audio.currentTime > 3) {
            this.audio.currentTime = 0;
            return;
        }
        let newIndex = this.currentIndex - 1;
        if (newIndex < 0) newIndex = this.playlist.length - 1;
        this.play(this.playlist[newIndex]);
    },

    next(auto = false) {
        let newIndex = this.currentIndex + 1;
        
        // Конец плейлиста
        if (newIndex >= this.playlist.length) {
            if (this.isRepeat === 'all') {
                newIndex = 0;
            } else {
                // Останавливаемся
                this._updateState(false);
                return;
            }
        }
        this.play(this.playlist[newIndex]);
    },

    seek(percent) {
        if (this.audio.duration) {
            this.audio.currentTime = this.audio.duration * percent;
        }
    },

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        const currentUid = this.currentUid;
        
        if (this.isShuffle) {
            this.playlist = shuffleArray([...this.originalPlaylist]);
            // Перемещаем текущий трек в начало, чтобы не прерывать
            if (currentUid) {
                this.playlist = this.playlist.filter(id => id !== currentUid);
                this.playlist.unshift(currentUid);
                this.currentIndex = 0;
            }
        } else {
            this.playlist = [...this.originalPlaylist];
            if (currentUid) {
                this.currentIndex = this.playlist.indexOf(currentUid);
            }
        }
        return this.isShuffle;
    },

    toggleRepeat() {
        if (!this.isRepeat) this.isRepeat = 'all';
        else if (this.isRepeat === 'all') this.isRepeat = 'one';
        else this.isRepeat = false;
        return this.isRepeat;
    },

    _updateState(playing) {
        this.isPlaying = playing;
        window.dispatchEvent(new CustomEvent('player:state-change', { 
            detail: { isPlaying: playing, uid: this.currentUid } 
        }));
    }
};
