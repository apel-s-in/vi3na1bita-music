export const $ = (sel, p = document) => p.querySelector(sel);
export const $$ = (sel, p = document) => [...p.querySelectorAll(sel)];

export const on = (el, event, handler, options = false) => {
    if (!el) return;
    el.addEventListener(event, handler, options);
    return () => el.removeEventListener(event, handler, options);
};

// ВОТ ЭТА ФУНКЦИЯ БЫЛА ПРОПУЩЕНА, ИЗ-ЗА НЕЁ ОШИБКА
export const dom = (tag, classes = '', html = '') => {
    const el = document.createElement(tag);
    if (classes) el.className = classes;
    if (html) el.innerHTML = html;
    return el;
};

export const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
};

export const escapeHtml = (str) => {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

export const shuffleArray = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

// Простой debounce (нужен для некоторых UI событий)
export const debounce = (func, wait) => {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};
