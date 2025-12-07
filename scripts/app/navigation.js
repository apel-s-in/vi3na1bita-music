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
    this.setupMediaSessionHandlers();
    console.log('✅ NavigationManager initialized');
  }
  
  setupEventListeners() {
    // Кнопкой "О системе" управляет SystemInfoManager (scripts/ui/sysinfo.js),
    // здесь ничего не вешаем, чтобы избежать дублирования UI.
    
    // Кнопка "Обратная связь"
    const feedbackLink = document.getElementById('feedback-link');
    feedbackLink?.addEventListener('click', () => {
      this.showFeedbackModal();
    });
    
    // Кнопка "Поддержать"
    const supportLink = document.getElementById('support-link');
    if (supportLink) {
      supportLink.href = 'https://example.com/support';
    }
    
    // Кнопка "Скачать весь альбом"
    const downloadBtn = document.getElementById('download-album-main');
    downloadBtn?.addEventListener('click', () => {
      this.downloadCurrentAlbum();
    });
    
    // Горячие клавиши
    const hotkeysBtn = document.getElementById('hotkeys-btn');
    hotkeysBtn?.addEventListener('click', () => {
      this.showHotkeysModal();
    });
    
    // Закрытие модального окна при клике вне его
    this.modalsContainer?.addEventListener('click', (e) => {
      if (e.target === this.modalsContainer) {
        this.closeModal();
      }
    });
  }
  
  // Мини-режим и MediaSession обрабатываются отдельными модулями:
  // - mini.js (MiniModeManager) — отвечает за mini-mode и sticky now-playing;
  // - BackgroundAudioManager / PlayerCore — отвечают за mediaSession.
  // NavigationManager больше не вмешивается в эти области, чтобы не дублировать логику.
  
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
          <a href="mailto:support@vitrina-razbita.ru" target="_blank"
             style="background: #4daaff; color: white; padding: 15px; border-radius: 8px; text-decoration: none; display: block;">
            ✉️ Email
          </a>
          <a href="https://github.com/apel-s-in/vi3na1bita-music" target="_blank"
             style="background: #333; color: white; padding: 15px; border-radius: 8px; text-decoration: none; display: block;">
            🐙 GitHub
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
      <h2>📌 Горячие клавиши</h2>
      <div class="hotkeys-section">
        <h3>▶️ Воспроизведение</h3>
        <div class="hotkey-item"><span class="hotkey-combo">K / Пробел</span><span class="hotkey-desc">Воспроизведение/Пауза</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">X</span><span class="hotkey-desc">Стоп</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">N / P</span><span class="hotkey-desc">Следующий/Предыдущий трек</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">J / L</span><span class="hotkey-desc">Перемотка ←10сек / 10сек→</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">+ / -</span><span class="hotkey-desc">Громкость ±10%</span></div>
      </div>
      <div class="hotkeys-section">
        <h3>🎵 Режимы</h3>
        <div class="hotkey-item"><span class="hotkey-combo">R</span><span class="hotkey-desc">Повтор</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">U</span><span class="hotkey-desc">Случайный порядок</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">F</span><span class="hotkey-desc">Только избранные</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">M</span><span class="hotkey-desc">Без звука</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">T</span><span class="hotkey-desc">Таймер сна</span></div>
      </div>
      <div class="hotkeys-section">
        <h3>✨ Эффекты</h3>
        <div class="hotkey-item"><span class="hotkey-combo">A</span><span class="hotkey-desc">Анимация лирики</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">B</span><span class="hotkey-desc">Пульсация логотипа</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">1 / 2 / 3</span><span class="hotkey-desc">Интенсивность (100%/50%/15%)</span></div>
      </div>
      <div class="hotkeys-section">
        <h3>📱 Интерфейс</h3>
        <div class="hotkey-item"><span class="hotkey-combo">Y</span><span class="hotkey-desc">Показать/скрыть лирику</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">W</span><span class="hotkey-desc">Прокрутить к списку треков</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">D</span><span class="hotkey-desc">Добавить/удалить из избранного</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">Esc</span><span class="hotkey-desc">Закрыть модальное окно</span></div>
        <div class="hotkey-item"><span class="hotkey-combo">?</span><span class="hotkey-desc">Эта справка</span></div>
      </div>
      <button class="modal-close-btn">Закрыть</button>
    `);
  }
  
  async downloadCurrentAlbum() {
    const currentAlbum = window.AlbumsManager?.getCurrentAlbum();
    if (!currentAlbum) {
      if (window.NotificationSystem) {
        window.NotificationSystem.error('Не выбран альбом');
      }
      return;
    }
    
    // Специальные альбомы нельзя скачать
    if (currentAlbum.startsWith('__')) {
      if (window.NotificationSystem) {
        window.NotificationSystem.info('Этот альбом нельзя скачать целиком');
      }
      return;
    }
    
    // Используем Downloads Manager
    if (window.DownloadsManager) {
      window.DownloadsManager.downloadAlbum(currentAlbum);
    } else {
      // Fallback: показать сообщение
      if (window.NotificationSystem) {
        window.NotificationSystem.info('Функция скачивания временно недоступна');
      }
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
