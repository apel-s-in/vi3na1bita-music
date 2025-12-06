// scripts/app/navigation.js
// Навигация: обработка кнопок навигации, модальные окна

import { APP_CONFIG } from '../core/config.js';

class NavigationManager {
  constructor() {
    this.modalsContainer = null;
    this.activeModal = null;
  }

  initialize() {
    this.modalsContainer = document.getElementById('modals-container');
    
    this.attachEventListeners();
    this.setupMediaSessionHandlers();
    
    console.log('✅ NavigationManager initialized');
  }

  attachEventListeners() {
    // Кнопка "О системе"
    const sysinfoBtn = document.getElementById('sysinfo-btn');
    sysinfoBtn?.addEventListener('click', () => {
      this.showSystemInfo();
    });

    // Кнопка "Обратная связь"
    const feedbackLink = document.getElementById('feedback-link');
    feedbackLink?.addEventListener('click', () => {
      this.showFeedbackModal();
    });

    // Кнопка "Поддержать"
    const supportLink = document.getElementById('support-link');
    if (supportLink) {
      supportLink.href = APP_CONFIG.SUPPORT_URL;
    }

    // Кнопка "Скачать весь альбом"
    const downloadBtn = document.getElementById('download-album-main');
    downloadBtn?.addEventListener('click', () => {
      this.downloadCurrentAlbum();
    });

    // Закрытие модального окна при клике вне его
    this.modalsContainer?.addEventListener('click', (e) => {
      if (e.target === this.modalsContainer) {
        this.closeModal();
      }
    });

    // Закрытие модального окна по Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.closeModal();
      }
    });
  }

  setupMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        window.playerCore?.play();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        window.playerCore?.pause();
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        window.playerCore?.previous();
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        window.playerCore?.next();
      });

      console.log('✅ Media Session handlers set');
    } catch (e) {
      console.error('Failed to setup Media Session:', e);
    }
  }

  showSystemInfo() {
    if (window.SystemInfo && typeof window.SystemInfo.show === 'function') {
      window.SystemInfo.show();
    } else {
      this.showModal(`
        <h2>О системе</h2>
        <div style="text-align: left; padding: 20px;">
          <p><strong>Версия:</strong> ${APP_CONFIG.APP_VERSION}</p>
          <p><strong>User Agent:</strong> ${navigator.userAgent}</p>
          <p><strong>Платформа:</strong> ${navigator.platform}</p>
          <p><strong>Язык:</strong> ${navigator.language}</p>
          <p><strong>Размер экрана:</strong> ${window.innerWidth}×${window.innerHeight}</p>
          <p><strong>Online:</strong> ${navigator.onLine ? 'Да' : 'Нет'}</p>
        </div>
        <button class="modal-close-btn">Закрыть</button>
      `);
    }
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
            📱 Telegram
          </a>
          
          <a href="mailto:${APP_CONFIG.SUPPORT_EMAIL}" target="_blank"
             style="background: #4daaff; color: white; padding: 15px; border-radius: 8px; text-decoration: none; display: block;">
            ✉️ Email
          </a>
          
          <a href="${APP_CONFIG.GITHUB_URL}" target="_blank"
             style="background: #333; color: white; padding: 15px; border-radius: 8px; text-decoration: none; display: block;">
            🐙 GitHub
          </a>
        </div>
      </div>
      <button class="modal-close-btn">Закрыть</button>
    `);
  }

  async downloadCurrentAlbum() {
    const currentAlbum = window.AlbumsManager?.getCurrentAlbum();
    
    if (!currentAlbum) {
      window.NotificationSystem?.error('Не выбран альбом');
      return;
    }

    // Специальные альбомы нельзя скачать
    if (currentAlbum.startsWith('__')) {
      window.NotificationSystem?.info('Этот альбом нельзя скачать целиком');
      return;
    }

    // Найти данные альбома
    const albumInfo = window.albumsIndex?.find(a => a.key === currentAlbum);
    if (!albumInfo) {
      window.NotificationSystem?.error('Альбом не найден');
      return;
    }

    // Использовать Downloads Manager если доступен
    if (window.DownloadsManager) {
      window.DownloadsManager.downloadAlbum(currentAlbum);
    } else {
      // Fallback: открыть директорию альбома
      window.open(albumInfo.base, '_blank');
      window.NotificationSystem?.info('Откройте папку и скачайте файлы');
    }
  }

  showModal(content) {
    if (!this.modalsContainer) return;

    this.closeModal(); // Закрыть предыдущее модальное окно

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        ${content}
      </div>
    `;

    // Закрытие по кнопке
    const closeBtn = modal.querySelector('.modal-close-btn');
    closeBtn?.addEventListener('click', () => this.closeModal());

    this.modalsContainer.appendChild(modal);
    this.activeModal = modal;

    // Анимация появления
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

// Глобальный экземпляр
window.NavigationManager = new NavigationManager();

export default NavigationManager;
