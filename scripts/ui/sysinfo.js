// scripts/ui/sysinfo.js
// Optimized System Info Modal v2.1 (Helper-driven Render)
(function(W, N) {
  'use strict';

  const U = W.Utils;

  const Sys = {
    initialize: () => {
      const btn = U.dom.byId('sysinfo-btn');
      if (btn) { btn.style.display = ''; btn.onclick = Sys.show; }

      document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); Sys.show(); }
      });
      console.log('✅ SysInfo optimized');
    },

    show: async () => {
      if (!W.Modals?.open) return;

      const C = W.APP_CONFIG || {};
      const M = performance.memory;
      const SC = W.screen;

      let swVer = '...';
      const getSW = async () => {
        try {
          const reg = await N.serviceWorker?.getRegistration();
          if (!reg?.active) return 'N/A';
          return new Promise(r => {
            const ch = new MessageChannel(), t = setTimeout(() => r('timeout'), 800);
            ch.port1.onmessage = e => { clearTimeout(t); r(e.data.version || 'N/A'); };
            reg.active.postMessage({ type: 'GET_SW_VERSION' }, [ch.port2]);
          });
        } catch { return 'Err'; }
      };

      const bodyHtml = U.profileModals?.sysInfo?.render?.({
        appVersion: C.APP_VERSION || '',
        buildDate: C.BUILD_DATE || '',
        isPwa: matchMedia('(display-mode: standalone)').matches,
        userAgent: N.userAgent,
        screenText: `${SC.width}×${SC.height}`,
        online: N.onLine,
        audioText: W.Howler ? `Howler ${Howler.version}` : 'Off',
        ramText: M ? U.fmt.bytes(M.usedJSHeapSize) : 'N/A',
        swVersion: swVer
      });

      const modal = W.Modals.open({ title: 'О системе', maxWidth: 420, bodyHtml });

      getSW().then(v => {
        const el = modal.querySelector('#sw-ver-row');
        if (el) el.innerHTML = `<strong>SW версия:</strong> ${U.escapeHtml(String(v || 'N/A'))}`;
      });
    }
  };

  W.SystemInfoManager = Sys;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Sys.initialize);
  else Sys.initialize();

})(window, navigator);
