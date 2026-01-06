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

    const hotkeysBtn = document.getElementById('hotkeys-btn');
    hotkeysBtn?.addEventListener('click', () => {
      this.showHotkeysModal();
    });

    // Закрытие по клику на фон делает сам modal-bg (Utils.createModal)
  }

  showFeedbackModal() {
    this.showModal('Обратная связь', `
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
    `);
  }

  showHotkeysModal() {
    if (!this.modalsContainer) {
      this.modalsContainer = document.getElementById('modals-container');
    }

    this.showModal('Горячие клавиши', `
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
    `);
  }

  showModal(title, bodyHtml) {
    this.closeModal();

    // ✅ Единый шаблон модалок
    // (поддерживает тот же modal-bg, bigclose, контейнер modals-container).
    import('../ui/modal-templates.js').then((m) => {
      const modal = m.openModal({ title, bodyHtml, maxWidth: 520 });
      this.activeModal = modal || null;
    }).catch(() => {
      // fallback: старый путь через Utils.createModal, если import не удался
      if (window.Utils && typeof window.Utils.createModal === 'function') {
        const html = `
          <div class="modal-feedback" style="max-width: 520px;">
            <button class="bigclose" title="Закрыть" aria-label="Закрыть">
              <svg viewBox="0 0 48 48">
                <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
                <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
              </svg>
            </button>
            ${bodyHtml || ''}
          </div>
        `;
        this.activeModal = window.Utils.createModal(html);
      }
    });
  }

  closeModal() {
    if (!this.activeModal) return;
    try { this.activeModal.remove(); } catch {}
    this.activeModal = null;
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
