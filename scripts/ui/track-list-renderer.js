import { escapeHtml, formatTime } from '../core/utils.js';
import { TrackRegistry } from '../core/track-registry.js';
import { FavoritesStore } from '../core/favorites-store.js';

export const TrackListRenderer = {
    /**
     * Генерирует HTML одной строки трека.
     * НЕ вешает обработчики событий (используем делегирование в родителе).
     */
    renderRow(uid, options = {}) {
        const track = TrackRegistry.getTrack(uid);
        if (!track) return ''; // Защита если конфиг кривой

        const {
            index = 0,
            showCover = false,
            isPlaying = false,
            isPaused = false,
            context = 'album' // 'album' | 'favorites' | 'search'
        } = options;

        const isLiked = FavoritesStore.isLiked(uid);
        const isInactive = FavoritesStore.isInactive(uid); // Для Избранного (полупрозрачный)

        // Классы состояния
        const activeClass = isPlaying ? 'active' : '';
        const inactiveClass = isInactive ? 'inactive' : ''; // CSS должен делать opacity: 0.5
        const pauseIcon = isPlaying && !isPaused ? '⏸' : '▶'; // Или SVG иконка
        
        // В избранном показываем статус "восстановления" или "удаления"
        const favIconClass = isLiked ? 'liked' : ''; 
        const favIconSymbol = '★'; // Можно заменить на SVG <svg>...</svg>

        return `
            <div class="track-row ${activeClass} ${inactiveClass}" 
                 data-uid="${uid}" 
                 data-context="${context}">
                
                <div class="track-index">
                    <span class="idx-num">${isPlaying ? pauseIcon : index + 1}</span>
                </div>

                ${showCover ? `
                <div class="track-cover-mini">
                    <img src="${escapeHtml(track.cover)}" loading="lazy" alt="">
                </div>` : ''}

                <div class="track-info">
                    <div class="track-title">${escapeHtml(track.title)}</div>
                    <div class="track-artist">${escapeHtml(track.artist)}</div>
                </div>

                <div class="track-meta">
                    <span class="track-dur">${formatTime(track.duration)}</span>
                    <button class="btn-icon btn-fav ${favIconClass}" 
                            data-action="toggle-fav" 
                            title="${isLiked ? 'Убрать из избранного' : 'В избранное'}">
                        ${favIconSymbol}
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Рендерит список UID в контейнер
     */
    renderList(container, uids, currentTrackUid, isPaused, context = 'album') {
        if (!container) return;
        
        // Используем Fragment для производительности (хотя innerHTML быстрее для полной замены)
        // Собираем одну большую строку HTML (самый быстрый способ в браузере)
        const html = uids.map((uid, idx) => {
            return this.renderRow(uid, {
                index: idx,
                isPlaying: uid === currentTrackUid,
                isPaused: isPaused,
                context: context,
                showCover: context !== 'album' // Показывать мини-кавер везде кроме списка альбома
            });
        }).join('');

        container.innerHTML = html;
    }
};
