// scripts/app/navigation.js
// Навигация и управление интерфейсом

class NavigationManager {
  constructor() {
    this.activeModal = null;
    this.U = window.Utils;
    this.$ = (id) => this.U.dom.byId(id);
    this.on = (el, ev, fn, opts) => this.U.dom.on(el, ev, fn, opts);
  }

  initialize() {
    this.setupEventListeners();
    console.log('✅ NavigationManager initialized');
  }

  setupEventListeners() {
    const feedbackLink = this.$('feedback-link');
    this.on(feedbackLink, 'click', (e) => {
      e.preventDefault();
      this.showFeedbackModal();
    });

    const supportLink = this.$('support-link');
    if (supportLink) {
      supportLink.href = window.APP_CONFIG?.SUPPORT_URL || 'https://example.com/support';
    }

    const hotkeysBtn = this.$('hotkeys-btn');
    this.on(hotkeysBtn, 'click', (e) => {
      e.preventDefault();
      this.showHotkeysModal();
    });
  }

  showFeedbackModal() {
    this.closeModal();
    if (!window.Modals?.open) return;

    const body = window.ModalTemplates?.feedbackBody
      ? window.ModalTemplates.feedbackBody({
          supportEmail: window.APP_CONFIG?.SUPPORT_EMAIL,
          githubUrl: window.APP_CONFIG?.GITHUB_URL
        })
      : '';

    this.activeModal = window.Modals.open({
      title: 'Обратная связь',
      maxWidth: 420,
      bodyHtml: body
    });
  }

  showHotkeysModal() {
    this.closeModal();
    if (!window.Modals?.open) return;

    const body = window.ModalTemplates?.hotkeysBody
      ? window.ModalTemplates.hotkeysBody()
      : '';

    this.activeModal = window.Modals.open({
      title: 'Горячие клавиши',
      maxWidth: 520,
      bodyHtml: body
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
