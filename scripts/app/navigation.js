// scripts/app/navigation.js
// Навигация и управление интерфейсом

class NavigationManager {
  constructor() {
    this.activeModal = null;
  }

  initialize() {
    this.setupEventListeners();
    console.log('✅ NavigationManager initialized');
  }

  setupEventListeners() {
    const feedbackLink = document.getElementById('feedback-link');
    feedbackLink?.addEventListener('click', () => this.showFeedbackModal());

    const supportLink = document.getElementById('support-link');
    if (supportLink) {
      supportLink.href = window.APP_CONFIG?.SUPPORT_URL || 'https://example.com/support';
    }

    const hotkeysBtn = document.getElementById('hotkeys-btn');
    hotkeysBtn?.addEventListener('click', () => this.showHotkeysModal());
  }

  showFeedbackModal() {
    this.closeModal();

    if (!window.Modals?.open) return;

    this.activeModal = window.Modals.open({
      title: 'Обратная связь',
      maxWidth: 420,
      bodyHtml: `
        <p style="margin-bottom:20px; color:#8ab8fd; text-align:center;">
          Есть предложения или нашли ошибку?<br>Напишите нам!
        </p>
        <div style="display:flex; flex-direction:column; gap:15px; max-width:300px; margin:0 auto;">
          <a href="https://t.me/vitrina_razbita" target="_blank"
             style="background:#0088cc; color:#fff; padding:15px; border-radius:8px; text-decoration:none; text-align:center;">
            Telegram
          </a>
          <a href="mailto:${window.APP_CONFIG?.SUPPORT_EMAIL || 'support@vitrina-razbita.ru'}" target="_blank"
             style="background:#4daaff; color:#fff; padding:15px; border-radius:8px; text-decoration:none; text-align:center;">
            Email
          </a>
          <a href="${window.APP_CONFIG?.GITHUB_URL || 'https://github.com/apel-s-in/vi3na1bita-music'}" target="_blank"
             style="background:#333; color:#fff; padding:15px; border-radius:8px; text-decoration:none; text-align:center;">
            GitHub
          </a>
        </div>
      `
    });
  }

  showHotkeysModal() {
    this.closeModal();

    if (!window.Modals?.open) return;

    this.activeModal = window.Modals.open({
      title: 'Горячие клавиши',
      maxWidth: 520,
      bodyHtml: `
        <div class="hotkeys-section">
          <h3 style="color:#8ab8fd; margin-bottom:12px;">Воспроизведение</h3>
          <div class="hotkey-item"><span class="hotkey-combo">K / Пробел</span><span class="hotkey-desc">Воспроизведение/Пауза</span></div>
          <div class="hotkey-item"><span class="hotkey-combo">X</span><span class="hotkey-desc">Стоп</span></div>
          <div class="hotkey-item"><span class="hotkey-combo">N / P</span><span class="hotkey-desc">Следующий/Предыдущий</span></div>
        </div>
        <div class="hotkeys-section">
          <h3 style="color:#8ab8fd; margin-bottom:12px;">Режимы</h3>
          <div class="hotkey-item"><span class="hotkey-combo">R</span><span class="hotkey-desc">Повтор</span></div>
          <div class="hotkey-item"><span class="hotkey-combo">U</span><span class="hotkey-desc">Случайный порядок</span></div>
          <div class="hotkey-item"><span class="hotkey-combo">F</span><span class="hotkey-desc">Только избранные</span></div>
          <div class="hotkey-item"><span class="hotkey-combo">T</span><span class="hotkey-desc">Таймер сна</span></div>
        </div>
      `
    });
  }

  closeModal() {
    if (!this.activeModal) return;
    try { this.activeModal.remove(); } catch {}
    this.activeModal = null;
  }
}

window.NavigationManager = new NavigationManager();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try { window.NavigationManager.initialize(); } catch (e) { console.warn('NavigationManager init failed:', e); }
  });
} else {
  try { window.NavigationManager.initialize(); } catch (e) { console.warn('NavigationManager init failed:', e); }
}

export default NavigationManager;
