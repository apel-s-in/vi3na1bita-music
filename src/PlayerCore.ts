// Если используешь TypeScript (TS), файл так и оставляй, иначе PlayerCore.js + JSDoc.
// Вариант для быстрого наката "прямо через глобал" Howler (он подгружен через index.html)
type Track = {
    src: string;         // url или относительный путь к mp3/ogg
    title?: string;
    artist?: string;
    cover?: string;
};

type PlayerCoreEvents = {
    onPlay?: (track: Track) => void;
    onPause?: (track: Track) => void;
    onStop?: (track: Track) => void;
    onTrackChange?: (track: Track, index: number) => void;
    onEnd?: (track: Track) => void;
    // можно будет расширить (onError, onReady и т.д.)
};

export class PlayerCore {
    private playlist: Track[] = [];
    private index: number = 0;
    private howl: Howl | null = null;
    private events: PlayerCoreEvents = {};
    private isPlaying: boolean = false;

    constructor(events: PlayerCoreEvents = {}) {
        this.events = events;
    }

    setPlaylist(tracks: Track[], startIndex = 0) {
        this.stop();
        this.playlist = tracks;
        this.index = startIndex;
    }

    play(index: number | null = null) {
        if (index !== null) this.index = index;
        const track = this.playlist[this.index];
        if (!track) return;

        if (this.howl) {
            try { this.howl.stop(); } catch { }
            this.howl = null;
        }
        this.howl = new Howl({
            src: [track.src],
            html5: true,
            onend: () => {
                this.isPlaying = false;
                this._fire('onEnd', track);
                // Автоматический переход — реализуем дальше (nextTrack)
            },
        });
        this.howl.play();
        this.isPlaying = true;
        this._fire('onPlay', track);
        this._fire('onTrackChange', track, this.index);

        // Здесь обновляй MediaSession (см. ниже)
    }

    pause() {
        if (this.howl && this.isPlaying) {
            this.howl.pause();
            this.isPlaying = false;
            this._fire('onPause', this.playlist[this.index]);
        }
    }

    stop() {
        if (this.howl) {
            this.howl.stop();
            this.howl = null;
            this.isPlaying = false;
            this._fire('onStop', this.playlist[this.index]);
        }
    }

    next() {
        if (this.playlist.length === 0) return;
        this.index = (this.index + 1) % this.playlist.length;
        this.play();
    }

    prev() {
        if (this.playlist.length === 0) return;
        this.index = (this.index + this.playlist.length - 1) % this.playlist.length;
        this.play();
    }

    getCurrentTrack() {
        return this.playlist[this.index] || null;
    }

    on(events: PlayerCoreEvents) {
        this.events = { ...this.events, ...events };
    }

    private _fire<K extends keyof PlayerCoreEvents>(ev: K, ...args: any[]) {
        if (typeof this.events[ev] === "function") {
            // @ts-ignore
            this.events[ev](...args);
        }
    }
}

// Актуально для браузера через <script type="module">...
// В index.html: window.playerCore = new PlayerCore();
