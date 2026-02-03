// scripts/ui/sysinfo.js
// Optimized System Info Modal v2.0 (Direct Render)
(function(W, N) {
  'use strict';

  const U = W.Utils;
  const esc = (v) => U.escapeHtml(String(v ?? ''));
  const yn = (v) => v ? '✅' : '❌';
  const row = (l, v) => `<div><strong>${l}:</strong> ${v}</div>`;

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

      // 1. Collect Data directly
      const C = W.APP_CONFIG || {};
      const P = performance, T = P.timing || {}, M = P.memory;
      const SC = W.screen;
      
      // 2. Get SW Version (Async)
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

      // 3. Render HTML
      const grp = (t, c) => `<h3 style="color:#8ab8fd;margin:12px 0 6px">${t}</h3>${c}`;
      const render = (ver) => `<div style="font-size:13px;line-height:1.6;color:#eaf2ff">
        ${grp('Приложение', row('Версия', `${esc(C.APP_VERSION)} (${esc(C.BUILD_DATE)})`) + row('PWA', yn(matchMedia('(display-mode: standalone)').matches)) + `<div id="sw-ver-row"><strong>SW:</strong> ${esc(ver)}</div>`)}
        ${grp('Среда', row('UA', esc(N.userAgent).slice(0,45)+'...') + row('Экран', `${SC.width}×${SC.height}`) + row('Online', yn(N.onLine)))}
        ${grp('Система', row('Audio', W.Howler ? `Howler ${Howler.version}` : 'Off') + row('RAM', M ? U.fmt.bytes(M.usedJSHeapSize) : 'N/A'))}
        <div style="margin-top:16px;border-top:1px solid #333;text-align:center;color:#666;font-size:10px">Vi3na1bita © 2025</div>
      </div>`;

      // 4. Open Modal
      const modal = W.Modals.open({
        title: 'О системе', maxWidth: 420,
        bodyHtml: render(swVer)
      });

      // 5. Update SW Ver after promise resolves
      getSW().then(v => {
        const el = modal.querySelector('#sw-ver-row');
        if (el) el.innerHTML = `<strong>SW версия:</strong> ${esc(v)}`;
      });
    }
  };

  W.SystemInfoManager = Sys;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Sys.initialize);
  else Sys.initialize();

})(window, navigator);
