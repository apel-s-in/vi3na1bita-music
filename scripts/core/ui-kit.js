import { dom, escapeHtml } from './utils.js';

// --- Toast Notifications ---
let toastContainer = null;

function ensureToastContainer() {
    if (toastContainer) return;
    toastContainer = dom('div', 'toast-container');
    toastContainer.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:10000;display:flex;flex-direction:column;gap:10px;pointer-events:none;`;
    document.body.appendChild(toastContainer);
}

export const Toast = {
    show(msg, type = 'info', duration = 3000) {
        ensureToastContainer();
        const el = dom('div', `toast toast-${type}`, escapeHtml(msg));
        el.style.cssText = `background:#333;color:#fff;padding:12px 20px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.5);opacity:0;transition:0.3s;pointer-events:auto;border-left:4px solid ${type === 'error' ? '#ff4444' : '#4daaff'}`;
        
        toastContainer.appendChild(el);
        requestAnimationFrame(() => el.style.opacity = '1');

        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 300);
        }, duration);
    },
    info(m) { this.show(m, 'info'); },
    error(m) { this.show(m, 'error', 4000); },
    success(m) { this.show(m, 'success'); }
};

// --- Modals ---
export const Modal = {
    open({ title, bodyHtml, onClose }) {
        const overlay = dom('div', 'modal-bg active');
        overlay.innerHTML = `
            <div class="modal-feedback animate-in">
                <button class="bigclose">×</button>
                <h2>${escapeHtml(title)}</h2>
                <div class="modal-body">${bodyHtml}</div>
            </div>
        `;
        
        const close = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
            if (onClose) onClose();
        };

        overlay.querySelector('.bigclose').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };
        
        document.getElementById('modals-container').appendChild(overlay);
        return overlay; // Возвращаем элемент для управления
    },
    
    // Быстрое меню для оффлайна (cloud menu)
    showContext(target, options = []) {
        // Удаляем старые
        document.querySelectorAll('.ctx-menu').forEach(e => e.remove());
        
        const menu = dom('div', 'ctx-menu');
        menu.style.cssText = `position:absolute;background:#222;border:1px solid #444;border-radius:8px;padding:5px 0;z-index:9999;min-width:150px;box-shadow:0 5px 15px rgba(0,0,0,0.5)`;
        
        options.forEach(opt => {
            const item = dom('div', 'ctx-item', opt.label);
            item.style.cssText = `padding:10px 15px;cursor:pointer;color:#eee;font-size:14px;`;
            item.onmouseover = () => item.style.background = '#333';
            item.onmouseout = () => item.style.background = 'transparent';
            item.onclick = (e) => {
                e.stopPropagation();
                menu.remove();
                opt.onClick();
            };
            menu.appendChild(item);
        });

        document.body.appendChild(menu);
        const rect = target.getBoundingClientRect();
        menu.style.top = (rect.bottom + window.scrollY + 5) + 'px';
        menu.style.left = Math.min(rect.left, window.innerWidth - 160) + 'px';

        const closeHandler = () => {
            menu.remove();
            document.removeEventListener('click', closeHandler);
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    }
};
