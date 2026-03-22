(function(W, N) {
  'use strict';
  let _initialized = false;
  const Sys = {
    initialize: () => {
      if (_initialized) return;
      _initialized = true;
      const btn = W.Utils.dom.byId('sysinfo-btn'); if (btn) { btn.style.display = ''; btn.onclick = Sys.show; }
      document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); Sys.show(); } });
    },
    show: async () => {
      if (!W.Modals?.open) return;
      const getSW = async () => {
        try {
          const reg = await N.serviceWorker?.getRegistration(); if (!reg?.active) return 'N/A';
          return new Promise(r => { const ch = new MessageChannel(), t = setTimeout(() => r('timeout'), 800); ch.port1.onmessage = e => { clearTimeout(t); r(e.data.version || 'N/A'); }; reg.active.postMessage({ type: 'GET_SW_VERSION' }, [ch.port2]); });
        } catch { return 'Err'; }
      };
      const modal = W.Modals.open({ title: 'О системе', maxWidth: 420, bodyHtml: W.Utils.profileModals?.sysInfo?.render?.({ appVersion: W.APP_CONFIG?.APP_VERSION || '', buildDate: W.APP_CONFIG?.BUILD_DATE || '', isPwa: matchMedia('(display-mode: standalone)').matches, userAgent: N.userAgent, screenText: `${W.screen.width}×${W.screen.height}`, online: N.onLine, audioText: W.Howler ? `Howler ${Howler.version}` : 'Off', ramText: performance.memory ? W.Utils.fmt.bytes(performance.memory.usedJSHeapSize) : 'N/A', swVersion: '...' }) });
      getSW().then(v => { const el = modal.querySelector('#sw-ver-row'); if (el) el.innerHTML = `<strong>SW версия:</strong> ${W.Utils.escapeHtml(String(v || 'N/A'))}`; });
    }
  };
  W.SystemInfoManager = Sys;
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', Sys.initialize) : Sys.initialize();
})(window, navigator);
