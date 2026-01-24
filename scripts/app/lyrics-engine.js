import { $ } from '../core/utils.js';

let currentLyrics = []; // [{time: 0, text: "..."}]
let activeIndex = -1;

export const LyricsEngine = {
    async load(url) {
        currentLyrics = [];
        activeIndex = -1;
        $('#lyrics').innerHTML = '<div class="lyrics-placeholder">Загрузка...</div>';
        
        if (!url) {
            $('#lyrics').innerHTML = '<div class="lyrics-placeholder">Текст отсутствует</div>';
            return;
        }

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('No lyrics');
            const data = await res.json();
            
            // Нормализация формата
            if (Array.isArray(data)) {
                currentLyrics = data.map(l => ({
                    time: Number(l.time || 0),
                    text: l.text || l.line || ''
                })).sort((a, b) => a.time - b.time);
            }
            this.render();
        } catch (e) {
            $('#lyrics').innerHTML = '<div class="lyrics-placeholder">Текст не найден</div>';
        }
    },

    render() {
        const container = $('#lyrics');
        if (!currentLyrics.length) return;
        
        const html = currentLyrics.map((line, i) => 
            `<div class="lyrics-line" data-idx="${i}">${line.text}</div>`
        ).join('');
        container.innerHTML = `<div class="lyrics-scroll">${html}</div>`;
    },

    sync(currentTime) {
        if (!currentLyrics.length) return;

        // Находим текущую строку
        let idx = -1;
        for (let i = 0; i < currentLyrics.length; i++) {
            if (currentTime >= currentLyrics[i].time) idx = i;
            else break;
        }

        if (idx !== activeIndex) {
            activeIndex = idx;
            const all = document.querySelectorAll('.lyrics-line');
            all.forEach(el => el.classList.remove('active'));
            
            if (idx !== -1 && all[idx]) {
                const el = all[idx];
                el.classList.add('active');
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
};
