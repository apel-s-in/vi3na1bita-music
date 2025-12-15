// scripts/app/navigation.js
// Навигация и управление интерфейсом

class NavigationManager {
  constructor() {
    this.modalsContainer = null;
    this.activeModal = null;
  }

  initialize() {
    this.modalsContainer = document.getElementById('modals-container');
    this.setupEventListeners();
    console.log('✅ NavigationManager initialized');
  }

  setupEventListeners() {
    // Кнопкой "О системе" управляет SystemInfoManager (scripts/ui/sysinfo.js)

    const feedbackLink = document.getElementById('feedback-link');
    feedbackLink?.addEventListener('click', () => {
      this.showFeedbackModal();
    });

    const supportLink = document.getElementById('support-link');
    if (supportLink) {
      supportLink.href = window.APP_CONFIG?.SUPPORT_URL || 'https://example.com/support';
    }

    const downloadBtn = document.getElementById('download-album-main');
    downloadBtn?.addEventListener('click', () => {
      this.downloadCurrentAlbum();
    });

    const hotkeysBtn = document.getElementById('hotkeys-btn');
    hotkeysBtn?.addEventListener('click', () => {
      this.showHotkeysModal();
    });

    this.modalsContainer?.addEventListener('click', (e) => {
      if (e.target === this.modalsContainer) {
        this.closeModal();
      }
    });
  }

  showFeedbackModal() {
    this.showModal(`
      <h2>Обратная связь</h2>
      <div style="padding: 20px; text-align: center;">
        <p style="margin-bottom: 20px; color: #8ab8fd;">
          Есть предложения или нашли ошибку?<br>
          Напишите нам!
        </p>
        <div style="display: flex; flex-direction: column; gap: 15px; max-width: 300px; margin: 0 auto;">
          <a href="https://t.me/vitrina_razbita" target="_blank"
             style="background: #0088cc; color: white; padding: 15px; border-radius: 8px; text-decoration: none; display: block;">
            Telegram
          </a>
          <a href="mailto:${(window.APP_CONFIG?.SUPPORT_EMAIL || 'support@vitrina-razbita.ru')}" target="_blank"
             style="background: #4daaff; color: white; padding: 15px; border-radius: 8px; text-decoration: none; display: block;">
            Email
          </a>
          <a href="${(window.APP_CONFIG?.GITHUB_URL || 'https://github.com/apel-s-in/vi3na1bita-music')}" target="_blank"
             style="background: #333; color: white; padding: 15px; border-radius: 8px; text-decoration: none; display: block;">
            GitHub
          </a>
        </div>
      </div>
      <button class="modal-close-btn">Закрыть</button>
    `);
  }

  showHotkeysModal() {
    if (!this.modalsContainer) {
      this.modalsContainer = document.getElementById('modals-container');
    }

    this.showModal(`
      <h2>Горячие клавиши</h2>
      <div class="hotkeys-section">
        <h3>Воспроизведение</h3>
        <div class="hotkey-item"><span class="hotkey-combo">K / Пробел</span><span class="hotkey-desc">Воспроизведение/Пауза</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">X</span><span class="hotkey-desc">Стоп</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">N / P</span><span class="hotkey-desc">Следующий/Предыдущий трек</span></div>
      </div>
      <div class="hotkeys-section">
        <h3>Режимы</h3>
        <div class="hotkey-item"><span class="hotkey-combo">R</span><span class="hotkey-desc">Повтор</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">U</span><span class="hotkey-desc">Случайный порядок</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">F</span><span class="hotkey-desc">Только избранные</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">T</span><span class="hotkey-desc">Таймер сна</span></div>
      </div>
      <button class="modal-close-btn">Закрыть</button>
    `);
  }

  async downloadCurrentAlbum() {
    const currentAlbum = window.AlbumsManager?.getCurrentAlbum?.();
    if (!currentAlbum) {
      window.NotificationSystem?.error('Не выбран альбом');
      return;
    }

    if (String(currentAlbum).startsWith('__')) {
      window.NotificationSystem?.info('Этот раздел нельзя скачать целиком');
      return;
    }

    if (window.DownloadsManager) {
      window.DownloadsManager.downloadAlbum(currentAlbum);
    } else {
      window.NotificationSystem?.info('Функция скачивания временно недоступна');
    }
  }

  showModal(content) {
    if (!this.modalsContainer) return;
    this.closeModal();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        ${content}
      </div>
    `;

    const closeBtn = modal.querySelector('.modal-close-btn');
    closeBtn?.addEventListener('click', () => this.closeModal());

    this.modalsContainer.appendChild(modal);
    this.activeModal = modal;

    requestAnimationFrame(() => {
      modal.classList.add('show');
    });
  }

  closeModal() {
    if (!this.activeModal) return;
    this.activeModal.classList.remove('show');
    setTimeout(() => {
      if (this.activeModal && this.activeModal.parentNode) {
        this.activeModal.parentNode.removeChild(this.activeModal);
      }
      this.activeModal = null;
    }, 300);
  }
}

window.NavigationManager = new NavigationManager();

// Автоинициализация (иначе initialize() нигде не вызывается)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try { window.NavigationManager.initialize(); } catch (e) { console.warn('NavigationManager init failed:', e); }
  });
} else {
  try { window.NavigationManager.initialize(); } catch (e) { console.warn('NavigationManager init failed:', e); }
}

export default NavigationManager;
