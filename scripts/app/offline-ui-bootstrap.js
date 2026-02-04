import { getOfflineManager } from '../offline/offline-manager.js';
import { openOfflineModal } from '../ui/offline-modal.js';

// Singleton instance holder
const UI = window.OfflineUI = window.OfflineUI || { offlineManager: getOfflineManager() };
const KEY_ALERT = 'offline:alert:v1';

// Helpers
const $ = (id) => document.getElementById(id);
const getAlert = () => { try { return JSON.parse(localStorage.getItem(KEY_ALERT)); } catch { return null; } };

export function attachOfflineUI() {
  const btn = $('offline-btn');
  if (!btn) return;

  // 1. Badge Injection (Lazy & Fast)
  // ТЗ: Индикатор “!” рисуется рядом с кнопкой (слева).
  if (!$('offline-alert-badge')) {
    btn.insertAdjacentHTML('beforebegin', 
      `<span id="offline-alert-badge" style="display:none;margin-right:8px;font-weight:900;color:#ffcc00;cursor:pointer;font-size:18px;line-height:1" title="Есть треки для обновления">!</span>`
    );
  }
  const badge = $('offline-alert-badge');
  if (badge) {
    badge.onclick = (e) => { 
      e.stopPropagation(); 
      // ТЗ: toast x2 длительности
      window.NotificationSystem?.info('Есть треки для обновления', 6000); 
    };
  }

  // 2. Unified State Sync
  const update = () => {
    const mgr = UI.offlineManager;
    const isOff = mgr.isOfflineMode();
    const hasAlert = !!getAlert()?.on;

    btn.textContent = 'OFFLINE';
    // Управление классами для CSS (styles/main.css: .offline-btn.offline / .online)
    btn.className = `offline-btn ${isOff ? 'offline' : 'online'} ${hasAlert ? 'alert' : ''}`;
    
    if (badge) badge.style.display = hasAlert ? 'inline-block' : 'none';
  };

  // 3. Bindings
  btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openOfflineModal(); };
  
  // React to global UI changes and specific manager progress
  const refresh = () => requestAnimationFrame(update);
  window.addEventListener('offline:uiChanged', refresh);
  
  const mgr = UI.offlineManager;
  mgr.on('progress', (e) => { 
    if (e?.phase === 'cqChanged' || e?.phase === 'cloudSettingsChanged') refresh(); 
  });

  // 4. Boot
  mgr.initialize().then(refresh);
  refresh();
}

export const getOfflineManager = () => UI.offlineManager;
